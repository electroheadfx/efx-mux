---
phase: 16
slug: sidebar-evolution-git-control
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + @testing-library/preact |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test -- --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test -- --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | SIDE-01 | — | N/A | unit | `pnpm test -- src/components/sidebar.test.tsx -x` | ✅ (extend) | ⬜ pending |
| 16-02-01 | 02 | 1 | GIT-01 | — | N/A | unit | `pnpm test -- src/services/git-service.test.ts -x` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 1 | GIT-02 | — | N/A | unit | `pnpm test -- src/services/git-service.test.ts -x` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 1 | GIT-03 | — | N/A | unit | `pnpm test -- src/services/git-service.test.ts -x` | ✅ | ⬜ pending |
| 16-04-01 | 04 | 1 | GIT-04 | T-16-01 | ssh-agent auth, no cred logging | unit | `pnpm test -- src/services/git-service.test.ts -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/git-control-tab.test.tsx` — stubs for GitControlTab component
- [ ] `src/components/toast.test.tsx` — stubs for Toast component
- [ ] Add `getUnpushedCount` tests to `src/services/git-service.test.ts`
- [ ] Add Rust tests for `get_unpushed_count_impl` in `git_ops.rs`

*Existing infrastructure covers most phase requirements; above are new component gaps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab visual active state | SIDE-01 | CSS accent underline verification | Click each tab, verify accent color underline appears |
| Toast auto-dismiss timing | — | Timing-based UX | Trigger error, verify toast dismisses after ~4s |
| Push button spinner | GIT-04 | Loading state visual | Click Push, verify spinner appears during operation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
