#!/usr/bin/env bash
# Regenerate build/icon.png (pure-Python) and build/icon.icns (sips + iconutil).
# macOS only. Run from the repo root: pnpm icon:gen
set -euo pipefail
cd "$(dirname "$0")/.."

python3 scripts/gen-icon.py

ICONSET="build/icon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
gen() { sips -z "$2" "$2" build/icon.png --out "$ICONSET/$1" >/dev/null; }
gen icon_16x16.png 16
gen icon_16x16@2x.png 32
gen icon_32x32.png 32
gen icon_32x32@2x.png 64
gen icon_128x128.png 128
gen icon_128x128@2x.png 256
gen icon_256x256.png 256
gen icon_256x256@2x.png 512
gen icon_512x512.png 512
cp build/icon.png "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o build/icon.icns
rm -rf "$ICONSET"
echo "✓ build/icon.icns + build/icon.png regenerated"
