---
phase: quick-260507-lkg
plan: 01
summary_type: quick-task
created_at: 2026-05-07T00:00:00Z
status: completed
---

# Quick Task 260507-lkg Summary

Implemented maintainer-safe macOS distribution flow so downloaded Efxmux DMGs pass normal Gatekeeper checks via Developer ID signing, notarization, and stapling.

## Completed Tasks

1. Added `scripts/macos-notarized-release.sh`
   - Requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_SIGNING_IDENTITY`
   - Supports optional `APPLE_PROVIDER_SHORT_NAME`
   - Runs Tauri build (`--target universal-apple-darwin` with fallback)
   - Locates DMG in `src-tauri/target/*/release/bundle/dmg/*.dmg`
   - Submits notarization with `xcrun notarytool submit --wait`
   - Staples ticket with `xcrun stapler staple`
   - Verifies Gatekeeper acceptance with `spctl --assess --type open --context context:primary-signature -v`

2. Added `docs/macos-release.md`
   - Explains quarantine behavior and why unsigned/ad-hoc builds trigger warnings
   - Documents exact maintainer prerequisites and release env vars
   - Includes identity discovery command (`security find-identity -v -p codesigning`)
   - Includes troubleshooting with `xcrun notarytool log`
   - Explicitly says not to use quarantine removal as release solution

3. Updated `package.json`
   - Added `release:macos:notarized` script:
     - `bash scripts/macos-notarized-release.sh`

## Verification Run

- `bash -n scripts/macos-notarized-release.sh`
- Grep checks for `notarytool submit`, `stapler staple`, and `spctl --assess`
- Docs grep checks for `Developer ID Application`, `notarytool`, `stapler`, `Gatekeeper`
- `node -e "const p=require('./package.json'); if (p.scripts['release:macos:notarized'] !== 'bash scripts/macos-notarized-release.sh') process.exit(1)"`

## Commits

- `fce35d6` feat(quick-260507-lkg-01): add notarized macOS release script
- `78d7cd4` docs(quick-260507-lkg-01): add macOS notarized release guide
- `1c8068b` chore(quick-260507-lkg-01): add pnpm notarized macOS release command

## Deviations from Plan

None.
