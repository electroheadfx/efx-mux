---
phase: 20
slug: right-panel-multi-terminal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/preact |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test -- --run && pnpm typecheck && pnpm build` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test -- --run && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Populated by gsd-planner during planning. Each task maps to a unit/integration test command plus a grep-verifiable acceptance criterion.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-XX-XX | TBD | TBD | SIDE-02 | — | N/A | unit | `pnpm test -- --run {file}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/terminal-tabs.test.ts` — scope registry round-trip (main vs right isolation)
- [ ] `src/components/unified-tab-bar.test.tsx` — sticky-tab render + drag-reject tests for scope="right"
- [ ] `src/components/right-panel.test.tsx` — right-panel tab bar integration (File Tree + GSD sticky, + menu opens Terminal/Agent/Git Changes)
- [ ] `src/state-manager.test.ts` — `right-terminal-tabs:<project>` persistence round-trip + legacy key drop migration
- [ ] Existing `mockIPC` fixtures in `src/test-utils.ts` reused

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebGL context pressure with 2N terminals | — | Requires real WKWebView, not jsdom | Open 4 main + 4 right terminals, verify no context-loss cascade, check `renderer` field in WebGL debug info |
| Legacy `-right` session kill at bootstrap | D-19 | Requires live tmux + prior session | Pre-seed a `tmux new-session -d -s test-right`, start app, confirm `tmux ls` omits it |
| Drag-reorder sticky rejection | D-03 | Pointer-event simulation in jsdom is unreliable for drag | Manual drag File Tree past GSD → reject; drag Terminal tab left of GSD → reject |
| Git Changes handoff main → right | D-07 | Two-panel state coordination is integration-heavy | Open Git Changes in main, then right `+` → Git Changes → tab moves, no duplicate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
