---
phase: 05
slug: project-system-sidebar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust) + manual (Tauri GUI) |
| **Config file** | src-tauri/Cargo.toml |
| **Quick run command** | `cd src-tauri && cargo check` |
| **Full suite command** | `cd src-tauri && cargo test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd src-tauri && cargo check`
- **After every plan wave:** Run `cd src-tauri && cargo test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PROJ-01 | — | N/A | compile | `cargo check` | ✅ | ⬜ pending |
| 05-01-02 | 01 | 1 | SIDE-01 | — | N/A | compile | `cargo check` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 2 | PROJ-02 | — | N/A | manual | visual inspection | — | ⬜ pending |
| 05-02-02 | 02 | 2 | PROJ-03 | — | N/A | manual | tmux session check | — | ⬜ pending |
| 05-03-01 | 03 | 2 | PROJ-04 | — | N/A | manual | Ctrl+P visual | — | ⬜ pending |
| 05-03-02 | 03 | 2 | SIDE-02 | — | N/A | manual | click changed file | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Project registration modal | PROJ-01 | GUI dialog with directory picker | Add project via "+" button, verify fields populate |
| Sidebar git status display | SIDE-01 | Visual badge rendering | Check modified/staged/untracked counts match `git status` |
| Project switch updates panels | PROJ-03 | Multi-panel visual update | Switch project, verify tmux cd, git badge, sidebar highlight |
| Ctrl+P fuzzy search | PROJ-04 | Keyboard interaction + overlay | Press Ctrl+P, type partial name, verify match and switch |
| Click changed file opens diff | SIDE-02 | Click interaction + panel routing | Click file in sidebar git section, verify right panel updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
