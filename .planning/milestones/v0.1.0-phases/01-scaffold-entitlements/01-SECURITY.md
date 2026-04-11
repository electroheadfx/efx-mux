---
phase: 01
slug: scaffold-entitlements
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-06
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| filesystem → CSS | theme.css and layout.css are static; no user input processed | CSS custom properties (non-sensitive) |
| vendored JS → WKWebView | Arrow.js 1.0.6 runs in webview; sourced from npm, pinned | JS module execution |
| localStorage → JS state | Split ratios read on startup; applied as CSS property values | String values (non-sensitive) |
| keyboard events → state | Ctrl+B keydown sets boolean toggle | Boolean (non-sensitive) |
| mouse events → CSS properties | clientX/clientY compute panel widths; no user-supplied strings | Numeric coordinates |
| Rust menu → macOS | PredefinedMenuItem delegates to AppKit | OS-level accelerators |
| tauri.conf.json CSP → WKWebView | CSP string injected as response header by Tauri | Security policy |
| Entitlements.plist → codesign | Applied during `tauri build` signing | App capabilities |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Tampering | src/vendor/arrow.js | accept | Pinned to 1.0.6 via `npm pack`; no CDN; local file only; no runtime fetch | closed |
| T-01-02 | Information Disclosure | CSP 'unsafe-inline' | accept | Required for import map; `default-src 'self'` blocks external loads; local desktop app, no network attack surface | closed |
| T-01-03 | Elevation of Privilege | app-sandbox=false | accept | PTY requires it (Phase 2); App Store distribution out of scope (REQUIREMENTS.md) | closed |
| T-02-01 | Tampering | localStorage split ratios | accept | Values are CSS property strings applied via setProperty(); invalid values silently ignored by CSS engine; no injection vector | closed |
| T-02-02 | Spoofing | keydown handler | accept | Only processes ctrlKey+b; single boolean toggle; no external input vector | closed |
| T-03-01 | Tampering | drag CSS property injection | accept | Values are numbers converted to "Npx" or "N%"; clamped to valid range (Math.min/max); CSS engine ignores invalid values | closed |
| T-03-02 | Tampering | localStorage --right-h-pct | accept | parseFloat() returns NaN for non-numeric strings; isNaN check guards the restore branch | closed |
| T-04-03 | Spoofing | Edit menu clipboard | accept | PredefinedMenuItem maps to OS-level accelerators; no custom JS clipboard interception | closed |

*Status: open / closed*
*Disposition: mitigate (implementation required) / accept (documented risk) / transfer (third-party)*

*Note: T-04-01 (sandbox) duplicates T-01-03; T-04-02 (CSP) duplicates T-01-02 — deduplicated in this register.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-01 | Arrow.js vendored and pinned; supply chain risk mitigated by local-only copy with no runtime fetch | gsd-security-auditor | 2026-04-06 |
| AR-02 | T-01-02, T-04-02 | CSP 'unsafe-inline' required for importmap block; default-src 'self' blocks all external resources; local desktop app with no network attack surface | gsd-security-auditor | 2026-04-06 |
| AR-03 | T-01-03, T-04-01 | App sandbox disabled for PTY spawning (Phase 2); Mac App Store distribution explicitly out of scope per REQUIREMENTS.md | gsd-security-auditor | 2026-04-06 |
| AR-04 | T-02-01, T-03-01, T-03-02 | localStorage values used only as CSS property values (setProperty) or parsed via parseFloat with NaN guard; CSS engine silently ignores invalid values; no code execution vector | gsd-security-auditor | 2026-04-06 |
| AR-05 | T-02-02 | Keyboard handler processes only Ctrl+B as boolean toggle; no user-supplied string data | gsd-security-auditor | 2026-04-06 |
| AR-06 | T-04-03 | Edit menu uses Tauri PredefinedMenuItem which maps directly to macOS AppKit accelerators; no custom clipboard JS | gsd-security-auditor | 2026-04-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-06 | 8 | 8 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-06
