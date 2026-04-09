#!/bin/bash
# Author: Claude Sonnet 4.6
# Builds the minimal host app bundle and embeds the FinderSyncExtension.appex inside it.
# Usage: ./FinderSyncExtension/build-host.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPEX="$SCRIPT_DIR/build/Build/Products/Release/FinderSyncExtension.appex"
OUT="$SCRIPT_DIR/build/IndexSync.app"

echo "Building host app..."

# Compile the host executable
swiftc "$SCRIPT_DIR/HostApp/HostApp.swift" \
  -o "$SCRIPT_DIR/build/IndexSync" \
  -target arm64-apple-macos12.0 \
  -sdk "$(xcrun --show-sdk-path)"

# Build bundle structure
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS"
mkdir -p "$OUT/Contents/PlugIns"

cp "$SCRIPT_DIR/build/IndexSync"      "$OUT/Contents/MacOS/IndexSync"
cp "$SCRIPT_DIR/HostApp/Info.plist"   "$OUT/Contents/Info.plist"
cp -R "$APPEX"                         "$OUT/Contents/PlugIns/"

# Sign only the host executable and outer bundle — do NOT use --deep, which
# would re-sign the already-signed .appex and strip its entitlements.
IDENTITY="Apple Development"
codesign --force --sign "$IDENTITY" "$OUT/Contents/MacOS/IndexSync"
codesign --force --sign "$IDENTITY" "$OUT"

echo "Host app built at: $OUT"
echo ""
echo "To install, run:"
echo "  cp -R \"$OUT\" /Applications/"
echo "  open /Applications/IndexSync.app"
echo "  killall Finder"
