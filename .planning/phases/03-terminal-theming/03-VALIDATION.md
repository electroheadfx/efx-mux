---
phase: 03
slug: terminal-theming
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual UAT + cargo build + runtime verification |
| **Config file** | none — no test framework for this phase |
| **Quick run command** | `cargo build --manifest-path src-tauri/Cargo.toml 2>&1` |
| **Full suite command** | `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 && echo "BUILD OK"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo build --manifest-path src-tauri/Cargo.toml 2>&1`
- **After every plan wave:** Run full build + verify theme.json loads
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | THEME-01 | — | N/A | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | THEME-03 | — | N/A | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 1 | THEME-01 | — | N/A | manual | Runtime: theme.json loads into xterm.js | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | THEME-04 | — | N/A | manual | Runtime: dark/light toggle works | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | THEME-02 | — | N/A | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 03-03-02 | 03 | 2 | THEME-03 | — | N/A | manual | Runtime: edit theme.json, terminals update within 1s | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing build infrastructure covers Rust compilation checks
- No additional test framework needed — theming is inherently visual/runtime

*Existing infrastructure covers automated build verification. Runtime behavior requires manual UAT.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Theme loads on startup | THEME-01 | Runtime xterm.js theme application | Launch app, verify terminal colors match theme.json |
| iTerm2 import converts | THEME-02 | File conversion + visual result | Run import command, verify theme.json created correctly |
| Hot-reload within 1s | THEME-03 | Requires running app + file edit | Edit theme.json while app running, time until terminal updates |
| Dark/light toggle | THEME-04 | Visual app chrome change | Click toggle, verify chrome colors change, preference persists after restart |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
