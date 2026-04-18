---
phase: 19
slug: gsd-sub-tabs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (jsdom) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test -- --run && pnpm build` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test -- --run && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | GSD-01..05 | — | N/A | unit | `pnpm test -- --run src/gsd/parsers` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/gsd/parsers/__tests__/roadmap.test.ts` — stubs for GSD-01, GSD-02, GSD-03
- [ ] `src/gsd/parsers/__tests__/milestones.test.ts` — stubs for GSD-04
- [ ] `src/gsd/parsers/__tests__/state.test.ts` — stubs for GSD-05
- [ ] `vitest.config.ts` — ensure `server.deps.inline` covers remark/unified ESM

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sub-tab switching in live app | GSD-01..05 | UI interaction in Tauri webview | Launch app, open GSD panel, click through 5 sub-tabs, verify rendering |
| Live update on planning file edit | GSD-01..05 | Requires file watcher + event loop | Edit `.planning/ROADMAP.md`, verify sub-tab reflects change within 1s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
