#!/usr/bin/env python3
"""
Generate build/icon.png (1024x1024 RGBA) for Questline — a dark squircle with a
gold ✦ star, in the Trails palette. Pure stdlib (no Pillow): we build raw RGBA
rows and zlib-compress them into a PNG. Run via scripts/gen-icon.sh which then
produces build/icon.icns with sips + iconutil.
"""
import math
import struct
import zlib
import os

N = 1024
RADIUS = 196            # squircle corner radius
# Trails palette
TOP = (0x16, 0x20, 0x3a)      # deep navy (top of gradient)
BOT = (0x0b, 0x10, 0x22)      # darker navy (bottom)
GOLD = (0xe8, 0xc1, 0x5a)
GOLD_HI = (0xff, 0xe7, 0xa3)
TRIM = (0x3a, 0x4a, 0x70)


def in_rounded_rect(x, y, w, h, r):
    # inside if within the inset rect, or within r of a corner circle
    if r <= x <= w - r:
        return 0 <= y <= h
    if r <= y <= h - r:
        return 0 <= x <= w
    cx = r if x < r else w - r
    cy = r if y < r else h - r
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def star_polygon(cx, cy, outer, inner, points=5, rot=-math.pi / 2):
    verts = []
    for i in range(points * 2):
        ang = rot + i * math.pi / points
        rad = outer if i % 2 == 0 else inner
        verts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return verts


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py):
            xint = (xj - xi) * (py - yi) / (yj - yi) + xi
            if px < xint:
                inside = not inside
        j = i
    return inside


def lerp(a, b, t):
    return tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))


def main():
    cx = cy = N / 2
    star = star_polygon(cx, cy, N * 0.30, N * 0.135)
    star_hi = star_polygon(cx, cy - 6, N * 0.30, N * 0.135)  # subtle top sheen edge

    raw = bytearray()
    for y in range(N):
        raw.append(0)  # PNG filter type 0 for this scanline
        t = y / (N - 1)
        bg = lerp(TOP, BOT, t)
        for x in range(N):
            if not in_rounded_rect(x + 0.5, y + 0.5, N, N, RADIUS):
                raw += bytes((0, 0, 0, 0))
                continue
            if point_in_poly(x + 0.5, y + 0.5, star):
                # gold with a top→bottom sheen inside the star
                st = max(0.0, min(1.0, (y - cy + N * 0.30) / (N * 0.60)))
                col = lerp(GOLD_HI, GOLD, st)
                raw += bytes((col[0], col[1], col[2], 255))
            else:
                # faint inner border ring near the squircle edge
                edge = 8
                near = not in_rounded_rect(
                    x + 0.5, y + 0.5, N, N, RADIUS
                ) or not in_rounded_rect(
                    x + 0.5 - 0, y + 0.5, N - edge * 2, N - edge * 2, RADIUS - edge
                )
                if (
                    x < edge
                    or y < edge
                    or x > N - edge
                    or y > N - edge
                ) and near:
                    raw += bytes((TRIM[0], TRIM[1], TRIM[2], 255))
                else:
                    raw += bytes((bg[0], bg[1], bg[2], 255))
    _ = star_hi  # reserved (unused sheen variant)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    os.makedirs("build", exist_ok=True)
    with open("build/icon.png", "wb") as f:
        f.write(png)
    print("wrote build/icon.png", len(png), "bytes")


if __name__ == "__main__":
    main()
