# Efxmux macOS release: signed + notarized DMG (no quarantine bypass)

## Why users see malware/quarantine warnings after download

Files downloaded from the internet are marked with macOS quarantine metadata. Gatekeeper checks quarantine + code signing + notarization when users open apps.

If the DMG/app is unsigned or ad-hoc signed, Gatekeeper can show malware/unverified warnings.

Correct release fix: ship a Developer ID signed app, notarized by Apple, with a stapled ticket.

## What maintainers need

- Apple Developer Program membership
- A valid **Developer ID Application** certificate in your keychain
- Xcode command line tools (`xcrun`)
- `pnpm`

Find signing identities:

```bash
security find-identity -v -p codesigning
```

Use the `Developer ID Application: ...` entry as `APPLE_SIGNING_IDENTITY`.

## Notarization credentials

Use one of these approaches:

1. App-specific password flow (used by the release script)
2. Keychain profile flow with `notarytool store-credentials` (optional alternative)

For app-specific password flow, set these env vars:

- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- Optional: `APPLE_PROVIDER_SHORT_NAME`

Example:

```bash
export APPLE_ID="name@example.com"
export APPLE_TEAM_ID="ABCDE12345"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
# optional
export APPLE_PROVIDER_SHORT_NAME="YourProvider"
```

## Run release

```bash
pnpm release:macos:notarized
```

This runs:

- Tauri macOS build
- `xcrun notarytool submit --wait`
- `xcrun stapler staple`
- `spctl --assess --type open --context context:primary-signature -v`

## Expected success output

Look for:

- notarytool submission accepted/completed
- stapler success for the DMG
- Gatekeeper assessment output showing acceptance

After this, users should be able to drag **Efxmux** to Applications and open normally.

## Troubleshooting notarization failures

If notarization fails, inspect logs:

```bash
xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

Common causes:

- Wrong team ID
- Wrong app-specific password
- Certificate mismatch or missing Developer ID Application cert
- Unsatisfied hardened runtime/signing requirements in bundle

## What not to tell users

Do not present quarantine removal (`xattr -dr com.apple.quarantine`) as the release solution.

That is only a local debugging escape hatch, not a secure distribution practice.
