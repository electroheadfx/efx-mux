---
phase: 22
slug: dynamic-tabs-vertical-split-and-preferences-modal
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/preact + mockIPC |
| **Config file** | vite.config.ts / vitest.config (Phase 11 infra) |
| **Quick run command** | `pnpm test --run <test-file>` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~30s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run <affected-test-file>`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-T1 | 01 | 1 | TABS-01, SPLIT-01, SPLIT-04 | T-22-01-01 | Legacy-key migration fail-soft on bad JSON | unit (RED) | `pnpm exec vitest run src/state-manager.test.ts src/components/terminal-tabs.test.ts` | ✅ W0 | ✅ green |
| 22-01-T2 | 01 | 1 | TABS-01, SPLIT-04 | T-22-01-02 | Shared counter integer-only; no injection | unit (GREEN) | `pnpm exec vitest run src/components/terminal-tabs.test.ts` | ✅ W0 | ✅ green |
| 22-01-T3 | 01 | 1 | SPLIT-01, TABS-01 | T-22-01-01, T-22-01-03 | Regex-anchored migration; JSON.parse in try/catch | unit (GREEN) | `pnpm exec vitest run src/state-manager.test.ts` | ✅ W0 | ✅ green |
| 22-02-T1 | 02 | 1 | PREF-01 | T-22-02-01 | Drag-guard covers button; no-drag CSS asserted | unit (RED) | `pnpm exec vitest run src/main.test.tsx` | ✅ W0 | ✅ green |
| 22-02-T2 | 02 | 1 | PREF-01 | T-22-02-01 | `-webkit-app-region: no-drag` + drag-guard selector | unit (GREEN) | `pnpm exec vitest run src/main.test.tsx` | ✅ W0 | ✅ green |
| 22-03-T1 | 03 | 2 | TABS-01, SPLIT-01, SPLIT-03 | T-22-03-01 | Cross-scope drag scope IDs type-safe | unit (RED) | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` | ✅ W0 | ✅ green |
| 22-03-T2 | 03 | 2 | TABS-01, SPLIT-03 | T-22-03-01, T-22-03-02 | Singleton flip via typed signals; no user string to Rust | unit (GREEN) | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` | ✅ W0 | ✅ green |
| 22-03-T3 | 03 | 2 | SPLIT-01, SPLIT-03 | T-22-03-03 | Split-icon cap enforced at UI; no-op over cap | unit (GREEN) | `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` | ✅ W0 | ✅ green |
| 22-04-T1 | 04 | 3 | SPLIT-01, SPLIT-02, TABS-01 | T-22-04-01, T-22-04-03 | Counter cap, JSON fail-soft on layout restore | unit (RED) | `pnpm exec vitest run src/components/main-panel.test.tsx src/drag-manager.test.ts` | ✅ W0 | ✅ green |
| 22-04-T2 | 04 | 3 | SPLIT-02 | T-22-04-02 | Split ratio clamped [10, 90]; pure visual | unit (GREEN) | `pnpm exec vitest run src/drag-manager.test.ts` | ✅ W0 | ✅ green |
| 22-04-T3 | 04 | 3 | SPLIT-01, TABS-01 | T-22-04-01, T-22-04-03 | JSON.parse try/catch; 3-cap enforced in spawn helper | unit (GREEN) | `pnpm exec vitest run src/components/main-panel.test.tsx` | ✅ W0 | ✅ green |
| 22-05-T1 | 05 | 4 | TABS-01, SPLIT-01..04, PREF-01 | — (UAT) | Human verification of all Phase 22 behavior | manual (checkpoint) | UAT script in 22-05-PLAN.md §Task 1 | N/A (UAT) | ⬜ pending |
| 22-05-T2 | 05 | 4 | TABS-01, SPLIT-01..04, PREF-01 | — | Record UAT results + update REQUIREMENTS/ROADMAP | docs | `test -f .planning/phases/.../22-05-SUMMARY.md` | N/A (docs) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner populated one row per task across plans 01-05 (13 tasks total). Plans 01-04 = 11 code/test tasks (all Wave 0 test files created before implementation). Plan 05 = 2 UAT-phase tasks.*

---

## Wave 0 Requirements

- [x] Test stubs for TABS-01 (uniform dynamic tabs — sticky removal) — `src/components/unified-tab-bar.test.tsx` authored in 22-03-T1
- [x] Test stubs for SPLIT-01 (scope-id migration: `terminal-tabs:<project>` → `:main-0`, `right-terminal-tabs:<project>` → `:right-0`) — `src/state-manager.test.ts` + `src/components/terminal-tabs.test.ts` authored in 22-01-T1
- [x] Test stubs for SPLIT-02 (singleton enforcement — GSD + Git Changes `+`-menu dimming) — covered in 22-03-T1 (`singleton dimming` test)
- [x] Test stubs for SPLIT-03 (cross-scope drag all tab kinds) — covered in 22-03-T1 (cross-scope drag terminal/editor/file-tree tests)
- [x] Test stubs for SPLIT-04 (PTY session name collision avoidance via shared per-project counter) — covered in 22-01-T1 (`shared counter unique names` + `sessionName stable on drag`)
- [x] Test stubs for PREF-01 (titlebar Preferences button click → `togglePreferences()`) — `src/main.test.tsx` authored in 22-02-T1

*Existing vitest + @testing-library/preact + mockIPC infra (Phase 11) covers all phase needs — no framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-WebGL context stability (6 scopes × multiple xterms) | SPLIT-01 | WebKit soft-caps WebGL contexts; hardware-dependent | Open 3 `main-` splits + 3 `right-` splits, each with a terminal tab. Verify no context-loss warnings in devtools for 5 min. |
| Intra-zone resize handle cursor + drag UX | SPLIT-01 | Visual/tactile — ns-resize cursor + drag smoothness | Hover between sub-panes → cursor becomes `ns-resize`. Drag → ratios persist across app restart. |
| Tab drag drop affordance (accent border + insertion slot) | SPLIT-03 | Visual | Drag a Terminal tab from `main-0` → `right-1`. Verify accent border on `right-1` tab bar + insertion-slot line. Body must NOT tint. |
| Cmd+, keybind still opens Preferences | PREF-01 | OS menu integration — hard to unit-test | Press Cmd+, → Preferences panel slides in. Click titlebar Settings button → same behavior. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
