---
phase: quick-260507-lkg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/macos-notarized-release.sh
  - docs/macos-release.md
  - package.json
autonomous: true
requirements:
  - QUICK-260507-LKG
must_haves:
  truths:
    - "A downloaded DMG installs Efxmux without Gatekeeper malware/quarantine warning on normal macOS systems."
    - "Release process uses Apple Developer ID signing, hardened runtime, notarization, and stapling instead of telling users to remove quarantine manually."
    - "Maintainer has exact commands and env vars needed to build a distributable macOS DMG."
  artifacts:
    - path: "scripts/macos-notarized-release.sh"
      provides: "Automated macOS release build, notarization, stapling, and verification flow"
    - path: "docs/macos-release.md"
      provides: "Practical explanation of why quarantine warning happens and how to release correctly"
    - path: "package.json"
      provides: "Convenient release script entry for pnpm"
  key_links:
    - from: "scripts/macos-notarized-release.sh"
      to: "src-tauri/target/release/bundle/dmg/*.dmg"
      via: "pnpm tauri build output path"
      pattern: "target/release/bundle/dmg"
    - from: "scripts/macos-notarized-release.sh"
      to: "Apple notary service"
      via: "xcrun notarytool submit --wait"
      pattern: "notarytool submit"
---

<objective>
Create the practical release path that prevents macOS Gatekeeper from showing the downloaded DMG/app as malware.

Purpose: macOS quarantine is expected for internet downloads. The correct fix is not forcing users to run `xattr -dr com.apple.quarantine`; the release DMG must be Developer ID signed, notarized by Apple, and stapled.

Output: one release script, one maintainer-facing release doc, and one package script entry.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@src-tauri/tauri.conf.json
@src-tauri/Entitlements.plist

Existing facts:
- Project uses Tauri 2.
- `src-tauri/tauri.conf.json` already has `bundle.macOS.entitlements = "./Entitlements.plist"`.
- Tauri CLI schema supports `bundle.macOS.signingIdentity`, `hardenedRuntime`, and `providerShortName`.
- `package.json` scripts use npm wording today, but project memory says use pnpm. Add pnpm-compatible scripts; do not run the dev server.
- `Entitlements.plist` intentionally disables App Sandbox because PTY spawning is incompatible with sandboxing. Keep that intent. Notarization does not require Mac App Store sandboxing.

Security answer to preserve:
- Quarantine is attached by macOS to downloaded files. You cannot and should not make users bypass it.
- A public macOS DMG must be signed with an Apple Developer ID Application certificate, built with hardened runtime, submitted to Apple notarization, stapled, then distributed.
- Ad-hoc signing or unsigned DMGs will still trigger Gatekeeper warnings after download.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add notarized macOS release script</name>
  <files>scripts/macos-notarized-release.sh</files>
  <action>Create an executable shell script that builds the Tauri DMG, submits it to Apple notarization, staples the accepted ticket, and verifies Gatekeeper acceptance. Require these env vars: `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_SIGNING_IDENTITY`. Optional: `APPLE_PROVIDER_SHORT_NAME`. Use `pnpm tauri build --target universal-apple-darwin` by default unless the repo's installed Tauri CLI rejects that target; in that case use `pnpm tauri build`. Export `APPLE_SIGNING_IDENTITY` into Tauri's expected signing environment if supported, and pass notarization credentials to `xcrun notarytool submit --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait`. Find the generated `src-tauri/target/*/release/bundle/dmg/*.dmg` robustly. Run `xcrun stapler staple` on the DMG and `spctl --assess --type open --context context:primary-signature -v` on the stapled DMG. Do not include `xattr -dr com.apple.quarantine` as a release fix; mention only as local debugging in comments if needed.</action>
  <verify>
    <automated>bash -n scripts/macos-notarized-release.sh &amp;&amp; grep -v '^#' scripts/macos-notarized-release.sh | grep -q 'notarytool submit' &amp;&amp; grep -v '^#' scripts/macos-notarized-release.sh | grep -q 'stapler staple' &amp;&amp; grep -v '^#' scripts/macos-notarized-release.sh | grep -q 'spctl --assess'</automated>
  </verify>
  <done>Script exists, is executable, validates syntax, and contains notarize, staple, and Gatekeeper verification steps.</done>
</task>

<task type="auto">
  <name>Task 2: Document the exact maintainer release steps</name>
  <files>docs/macos-release.md</files>
  <action>Create a concise practical guide explaining the user-facing problem and the correct fix. Include: why downloaded DMGs get quarantine; why unsigned/ad-hoc builds show malware warning; prerequisites in Apple Developer account; how to find the Developer ID Application signing identity with `security find-identity -v -p codesigning`; how to create/use an app-specific password or notarytool keychain profile; required env vars; command to run the script; expected successful outputs; troubleshooting for notarization failure logs via `xcrun notarytool log`; and what not to tell users to do. Explicitly state that users should be able to drag Efxmux to Applications and open it normally after stapling/notarization. Keep app branding as `Efxmux`.</action>
  <verify>
    <automated>test -f docs/macos-release.md &amp;&amp; grep -q 'Developer ID Application' docs/macos-release.md &amp;&amp; grep -q 'notarytool' docs/macos-release.md &amp;&amp; grep -q 'stapler' docs/macos-release.md &amp;&amp; grep -q 'Gatekeeper' docs/macos-release.md</automated>
  </verify>
  <done>Guide answers the user's question without recommending quarantine removal as the release solution.</done>
</task>

<task type="auto">
  <name>Task 3: Wire pnpm release command</name>
  <files>package.json</files>
  <action>Add a package script named `release:macos:notarized` that runs `bash scripts/macos-notarized-release.sh`. Preserve existing scripts and JSON formatting. Do not change app code. Do not run the server.</action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if (p.scripts['release:macos:notarized'] !== 'bash scripts/macos-notarized-release.sh') process.exit(1)"</automated>
  </verify>
  <done>`pnpm release:macos:notarized` is available for maintainer releases.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| maintainer machine to Apple notary service | Apple credentials and release artifacts leave local machine during notarization |
| downloaded DMG to end-user macOS Gatekeeper | Internet-downloaded app crosses macOS trust boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-260507-lkg-01 | Spoofing | DMG/app identity | mitigate | Sign with Developer ID Application certificate and verify with `codesign`/`spctl`. |
| T-quick-260507-lkg-02 | Tampering | Distributed DMG | mitigate | Staple notarization ticket and verify Gatekeeper assessment before upload. |
| T-quick-260507-lkg-03 | Information Disclosure | Apple credentials | mitigate | Require credentials via environment variables; do not commit secrets. |
| T-quick-260507-lkg-04 | Repudiation | Release provenance | accept | Local script output is enough for current solo release workflow; no CI audit trail planned here. |
</threat_model>

<verification>
Run:

```bash
bash -n scripts/macos-notarized-release.sh
node -e "const p=require('./package.json'); if (!p.scripts['release:macos:notarized']) process.exit(1)"
grep -q 'Developer ID Application' docs/macos-release.md
grep -q 'notarytool' docs/macos-release.md
grep -q 'stapler' docs/macos-release.md
```

Do not run the app server.
</verification>

<success_criteria>
- Maintainer has one command: `pnpm release:macos:notarized`.
- Release doc clearly says the correct solution is Developer ID signing + notarization + stapling.
- No user-facing instruction requires removing quarantine manually.
- No secrets are committed.
</success_criteria>

<output>
After completion, create `.planning/quick/260507-lkg-how-to-do-when-i-download-the-dmg-image-/260507-lkg-SUMMARY.md`.
</output>
