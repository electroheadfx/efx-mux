---
phase: 15
slug: foundation-primitives
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (TS) + Cargo test (Rust) |
| **Config file** | vitest.config.ts, Cargo.toml [dev-dependencies] |
| **Quick run command** | `pnpm test && cargo test` |
| **Full suite command** | `pnpm test && cargo test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test && cargo test`
- **After every plan wave:** Run `pnpm test && cargo test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SC-01 | — | N/A (UI component) | component | `pnpm test -- context-menu` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | SC-02 | — | N/A (UI component) | component | `pnpm test -- dropdown-menu` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | SC-03 | T-15-01 | Path validation via is_safe_path() | unit | `cargo test write_file` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | SC-04 | — | N/A (IPC wrapper) | unit | `pnpm test -- git-service` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 1 | SC-05 | — | N/A (IPC wrapper) | unit | `pnpm test -- file-service` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/context-menu.test.tsx` — stubs for SC-01 (context menu)
- [ ] `src/components/dropdown-menu.test.tsx` — stubs for SC-02 (dropdown menu)
- [ ] `src-tauri/src/file_ops.rs` — extend test module for write_file_content
- [ ] `src/services/git-service.test.ts` — stubs for SC-04 (git service)
- [ ] `src/services/file-service.test.ts` — stubs for SC-05 (file service)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Context menu auto-flip positioning | D-02 | Visual viewport interaction | Right-click near screen edge, verify menu flips |
| Dropdown type-ahead feels responsive | D-05 | UX timing judgment | Type characters rapidly, verify 500ms buffer works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
