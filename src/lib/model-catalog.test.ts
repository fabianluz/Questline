import { describe, it, expect } from "vitest";
import { CATALOG, catalogByRef, fitFor, normalizeRef } from "@/lib/model-catalog";

const GB = 1024 ** 3;

describe("normalizeRef", () => {
  it("adds :latest only when no tag is present", () => {
    expect(normalizeRef("qwen2.5")).toBe("qwen2.5:latest");
    expect(normalizeRef("qwen2.5:14b")).toBe("qwen2.5:14b");
  });
});

describe("catalogByRef", () => {
  it("finds the requested models (incl. the three the user switches between)", () => {
    expect(catalogByRef("qwen2.5:14b")?.tier).toBe("balanced");
    expect(catalogByRef("qwen3:30b-a3b")?.family).toBe("qwen3");
    expect(catalogByRef("qwen3.6:27b")?.tier).toBe("heavy");
  });
  it("returns undefined for an unknown ref", () => {
    expect(catalogByRef("nope:1b")).toBeUndefined();
  });
  it("every catalog entry is chat-capable", () => {
    for (const m of CATALOG) expect(m.capabilities.chat).toBe(true);
  });
});

describe("fitFor", () => {
  it("buckets by fraction of total memory", () => {
    const total = 16 * GB;
    expect(fitFor(4 * GB, total)).toBe("ok"); // < 50%
    expect(fitFor(9 * GB, total)).toBe("tight"); // 50–75%
    expect(fitFor(14 * GB, total)).toBe("over"); // > 75%
  });
  it("is unknown without sizes", () => {
    expect(fitFor(undefined, 16 * GB)).toBe("unknown");
    expect(fitFor(9 * GB, undefined)).toBe("unknown");
  });
});
