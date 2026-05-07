#!/usr/bin/env bash
set -euo pipefail

# Build, notarize, staple, and verify a macOS DMG for Efxmux.
# Correct release fix for Gatekeeper warnings is Developer ID signing + notarization + stapling.
# Do not ship instructions that ask users to remove quarantine manually.

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

require_var APPLE_ID
require_var APPLE_TEAM_ID
require_var APPLE_APP_SPECIFIC_PASSWORD
require_var APPLE_SIGNING_IDENTITY

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required (Xcode command line tools)" >&2
  exit 1
fi

export APPLE_SIGNING_IDENTITY
if [ -n "${APPLE_PROVIDER_SHORT_NAME:-}" ]; then
  export APPLE_PROVIDER_SHORT_NAME
fi

build_with_fallback() {
  set +e
  pnpm tauri build --target universal-apple-darwin
  local status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    echo "universal-apple-darwin target failed; retrying with default macOS build target" >&2
    pnpm tauri build
  fi
}

build_with_fallback

find_dmg() {
  local dmg
  dmg=$(find src-tauri/target -type f -path '*/release/bundle/dmg/*.dmg' | sort | tail -n 1)
  if [ -z "$dmg" ]; then
    echo "No DMG found under src-tauri/target/*/release/bundle/dmg" >&2
    exit 1
  fi
  echo "$dmg"
}

DMG_PATH="$(find_dmg)"

echo "Using DMG: $DMG_PATH"

echo "Submitting for notarization..."
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

echo "Verifying Gatekeeper acceptance..."
spctl --assess --type open --context context:primary-signature -v "$DMG_PATH"

echo "Done. DMG is signed, notarized, stapled, and Gatekeeper-assessed."