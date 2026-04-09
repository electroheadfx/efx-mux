---
phase: 8
slug: keyboard-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual testing (UI-heavy phase, no unit test infra detected) |
| **Config file** | none |
| **Quick run command** | `pnpm tauri dev` |
| **Full suite command** | `pnpm tauri dev` (manual verification) |
| **Estimated runtime** | ~30 seconds (app launch) |

---

## Sampling Rate

- **After every task commit:** `pnpm tauri dev` + manual shortcut verification
- **After every plan wave:** Full keyboard shortcut matrix test
- **Before `/gsd-verify-work`:** All 4 UX requirements manually verified
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | UX-01 | — | N/A | manual | Launch app, test Ctrl+C/D/Z passthrough | N/A | ⬜ pending |
| 08-01-02 | 01 | 1 | UX-02 | — | N/A | manual | Launch app, test Ctrl+T/W/Tab | N/A | ⬜ pending |
| 08-02-01 | 02 | 2 | UX-03 | — | N/A | manual | Kill tmux session, verify overlay | N/A | ⬜ pending |
| 08-02-02 | 02 | 2 | UX-04 | — | N/A | manual | Delete state.json, relaunch | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App shortcuts don't conflict with terminal Ctrl+C/D/Z | UX-01 | UI keyboard interaction requires human verification | Launch app, focus terminal, press Ctrl+C/D/Z — verify they reach PTY. Press Ctrl+T/W/Tab — verify app actions fire. |
| Ctrl+T/W/Tab manage terminal tabs | UX-02 | Tab creation/destruction requires visual confirmation | Ctrl+T creates new tab, Ctrl+W closes it, Ctrl+Tab cycles. Verify tab bar updates. |
| PTY crash shows banner with restart | UX-03 | Crash overlay requires visual + interaction verification | Kill tmux session externally via `tmux kill-session`, verify overlay appears with correct exit code and Restart button works. |
| First-run wizard on clean state | UX-04 | Wizard flow requires step-through verification | Delete ~/.config/efxmux/state.json, relaunch app, verify wizard modal appears with project/agent/theme/server steps. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
