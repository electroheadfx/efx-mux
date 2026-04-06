---
phase: 2
slug: terminal-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual CLI verification + Tauri dev server |
| **Config file** | none — no test framework for Phase 2 (native PTY integration) |
| **Quick run command** | `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 && echo BUILD_OK` |
| **Full suite command** | `pnpm tauri dev` + manual terminal interaction |
| **Estimated runtime** | ~15 seconds (build), manual interaction varies |

---

## Sampling Rate

- **After every task commit:** Run `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 && echo BUILD_OK`
- **After every plan wave:** Run `pnpm tauri dev` and verify terminal renders
- **Before `/gsd-verify-work`:** Full manual verification of all 5 success criteria
- **Max feedback latency:** 15 seconds (build check)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TERM-01 | — | N/A | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | TERM-02 | — | N/A | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | TERM-03 | — | N/A | manual | `pnpm tauri dev` + type commands | N/A | ⬜ pending |
| 02-02-02 | 02 | 1 | TERM-04 | — | N/A | manual | `pnpm tauri dev` + resize panel | N/A | ⬜ pending |
| 02-03-01 | 03 | 2 | TERM-05 | — | N/A | manual | `pnpm tauri dev` + heavy output test | N/A | ⬜ pending |
| 02-03-02 | 03 | 2 | TERM-06 | — | N/A | Channel binary delivery | `cargo build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. No test framework install needed — Phase 2 is a native PTY + terminal integration verified by build success and manual interaction.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal renders with WebGL, falls back to DOM on context loss | TERM-03 | WebGL context loss requires GPU state manipulation not automatable in CI | Launch app, verify WebGL renderer active; simulate context loss via DevTools |
| tmux session survives app close/reopen | TERM-04 | Requires full app lifecycle (launch → close → relaunch) | Close app, wait 10s, reopen, verify same tmux session reattaches |
| Heavy output doesn't drop data | TERM-05 | Requires `cat /dev/urandom \| xxd` and visual confirmation of flow control | Run heavy output command, verify terminal stays responsive, no silent drops |
| Panel resize reflows terminal correctly | TERM-02 | Requires drag interaction and visual inspection | Drag split handle, verify terminal content reflows without corruption |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
