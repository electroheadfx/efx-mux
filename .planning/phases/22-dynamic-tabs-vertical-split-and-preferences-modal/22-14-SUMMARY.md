---
phase: 22
plan: 14
subsystem: uat-closeout
tags: [uat, round-2, regressions, phase-22-not-closed]

# Dependency graph
requires:
  - phase: 22-06..22-13
    provides: Gap-closure batch (9 plans) intended to close Round 1 UAT failures
provides:
  - "Round 2 UAT results recorded in 22-UAT.md"
  - "Documented contradictions between SUMMARY.md claims and Round 2 UAT findings"
  - "Phase 22 blocker entry in STATE.md (UAT Round 2 failed — 5 regressions)"
affects: [phase-22, phase-23-planning, any-follow-on-workspace-hardening-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honest UAT recording: contradictions between SUMMARY claims and user-observed behavior are logged as regressions, not explained away"
    - "Gap-closure SUMMARY.md self-checks cannot substitute for user re-verification — code commits prove the commit landed but not that the fix works end-to-end in the running binary"

key-files:
  created:
    - .planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-14-SUMMARY.md
  modified:
    - .planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-UAT.md
    - .planning/STATE.md

key-decisions:
  - "Do NOT mark Phase 22 as Complete — 5 regressions + 4 issues remain"
  - "Do NOT modify REQUIREMENTS.md to check off TABS-01 / SPLIT-01..04 / PREF-01"
  - "Do NOT supersede 22-05-PLAN.md — keep it live; its purpose (verify + closeout) is still unmet"
  - "Do NOT open follow-on gap-closure plans autonomously; surface to user for strategic decision"

patterns-established:
  - "Pattern: when gap-closure UAT surfaces regressions contradicting the closing plan's SUMMARY, the regression is recorded against the original test AND against the contradicted plan number for traceability"

requirements-completed: []

# Metrics
duration: 30min
completed: 2026-04-19
---

# Phase 22 Plan 14: UAT Round 2 — Regressions Contradicting Gap-Closure Claims Summary

**Round 2 UAT result: 5 regressions + 4 residual issues contradict prior SUMMARY.md claims from the gap-closure batch 22-06..22-13. Phase 22 is NOT complete. Requirements are NOT marked satisfied. 22-05-PLAN.md is NOT superseded.**

## Performance

- **Duration:** ~30 min (doc updates only)
- **Started:** 2026-04-19T07:01:34Z
- **Completed:** 2026-04-19
- **Tasks:** 2 (UAT result recording + STATE blocker)
- **Files modified:** 3 (22-UAT.md, 22-14-SUMMARY.md, STATE.md)

## Round 2 Outcome

| Category | Round 1 | Round 2 | Change |
| -------- | ------- | ------- | ------ |
| pass | 5 | 5 (different test IDs) | 0 net — tests 1, 2 moved pass; tests 6, 7, 8, 14, 16 moved to regression |
| issue | 11 | 4 | -7 |
| regression | 0 | 5 | +5 (new category — contradicts SUMMARY claims) |
| blocked | 1 | 1 | 0 |
| skipped | 1 | 1 | 0 |
| **total** | **18** | **18** | — |

**Tests that legitimately moved to pass:**
- Test 1 (cold start, no `unknown terminal scope: right` rejection) — plan 22-06 ✅
- Test 2 (first-launch defaults for new project) — plan 22-07 ✅

**Tests that regressed (SUMMARY.md contradictions):**
- Test 6 — 22-13 claimed cross-scope move works; R-5: moved tab not activated on receiver
- Test 7 — 22-09 claimed GSD label + close fixed; R-7 label still "Git Changes", R-6 cannot close
- Test 8 — 22-09 claimed File Tree label + close fixed; R-8 label still "Git Changes", R-6 cannot close
- Test 14 — 22-09/22-13 claimed cross-scope drag works; R-11 (new): activating terminal in sidebar split erases main-panel file content
- Test 16 — 22-08 claimed per-mutation persistence; R-10: tabs not preserved across restart

**Tests that remained as issues (partial closure):**
- Test 9 (I-3 resize drag offset origin bug)
- Test 12 (I-3 + I-4 9px artifact)
- Test 15 (I-1 tab-kind reorder isolation; I-2 split routes to wrong zone)
- Test 18 (R-11 cross-scope activation side-effect)

## Regressions Contradicting Prior SUMMARY.md Claims

This is the critical section. Each entry maps a user-reported Round 2 failure back to the gap-closure plan whose SUMMARY.md self-check claimed the fix was in place.

### R-5 → contradicts 22-13

**User report:** "After moving a tab to another pane/split, the moved tab is NOT activated — user must click it again to see content."

**22-13 SUMMARY.md claim:** "editor cross-scope drop moves tab to target scope (append-last) — handleCrossScopeDrop('editor-1', 'main-0', '', 'main-1', false) must flip ownerScope to main-1, remove from main-0 scoped order, and append to main-1 scoped order. (Passed on first run)".

**Claim vs reality:** The test asserts state mutation (ownerScope + scoped order) but not activation (`activeTabId` on target scope). The activation-cascade comment in 22-13 said: *"activation-cascade (`getTerminalScope('right-0').activeTabId` vs `activeUnifiedTabId`) remains identical to 22-09"* — but 22-09's activation path may itself be incomplete for the cross-scope-move case. The unit test does not cover the user-facing activation expectation.

**Investigation needed:** After `handleCrossScopeDrop` completes, is `getTerminalScope(targetScope).activeTabId.value` being set to `sourceId`? If not, add that write at the end of the cross-scope path.

### R-6 → contradicts 22-09 (close handlers)

**User report:** "Cannot close GSD and File Tree tabs."

**22-09 SUMMARY.md claim:** "closeUnifiedTab gsd + file-tree routing (new block, inserted at line 1044-1072 between the right-owned Git Changes special case and the `if (!tab) return` short-circuit)". Claimed 3 close tests green.

**Claim vs reality:** The unit test may call `closeUnifiedTab(tabId)` directly and assert signal state. But in the running app the close button is an event listener path that may take a different code path (or the span[title="Close tab"] click may not be wired up for GSD/File Tree singleton tabs in the actual DOM tree).

**Investigation needed:** Run `pnpm tauri dev`, open devtools, inspect the × span on a GSD tab, verify its click handler reaches `closeUnifiedTab`. If the event binding is missing in renderTab for these kinds, the unit test is testing the wrong layer.

### R-7, R-8 → contradicts 22-09 (label rendering)

**User report R-7:** "GSD tab shows label 'Git Changes' instead of 'GSD'."
**User report R-8:** "File Tree tab shows label 'Git Changes' instead of 'File Tree'."

**22-09 SUMMARY.md claim:** "3-way chain `else if (tab.type === 'gsd')` / `else if (tab.type === 'file-tree')` / `else /* git-changes */`, each setting the correct label". Verification claimed `grep -cE "label = 'GSD'"` returned 1, `label = 'File Tree'` returned 1.

**Claim vs reality:** The grep-based verification confirmed the strings exist in source, but the rendered UI still shows the wrong label. Possibilities:
1. A second renderer path (perhaps in a parent component, or a legacy branch) is overriding `label` after the if/else chain.
2. `tab.type` is not equal to `'gsd'` or `'file-tree'` at the runtime check — e.g., the tab data model is populated with `type: 'git-changes'` for all three kinds because of an upstream signal write.
3. The build was not recompiled / the running dev server is serving stale bundles.

**Investigation needed:** Place a `console.log(tab.type, label)` inside renderTab and open both GSD and File Tree tabs to see what `tab.type` is at render time.

### R-10 → contradicts 22-08 (per-mutation persistence)

**User report:** "Tabs are NOT preserved across quit/run; active tab focus is lost on main window after restart."

**22-08 SUMMARY.md claim:** "Counter writes on every allocation (fire-and-forget `updateSession` in `allocateNextSessionName`)", "Counter restored on project load (`seedCounterFromRestoredTabs` now reads `tab-counter:<project>` with T-22-08-01 tamper guard)", and for `saveProjectTabs(activeProjectName.value, scope)` — "hooked at 3 mutation sites".

**Claim vs reality:** Either:
1. The write is firing but `save_state` is not persisting it to disk before quit (debounce window too long?).
2. The restore path is not reading the scope-suffixed keys correctly — `restoreProjectTabsScoped` may be erroring silently or reading the wrong key.
3. A later bulk save on shutdown is overwriting the per-mutation writes with a stale snapshot.

**Investigation needed:** Add `console.log` before every `updateSession({'terminal-tabs:...'})` call and before-after restore. Open the app, add tabs, quit, inspect `~/.config/efxmux/state.json` directly for the scope-suffixed keys.

### R-11 → new regression (not claimed by any plan)

**User report:** "When a file tab is open in main and the user activates a terminal in a sidebar split, the file content disappears from the main window."

**No plan claimed to fix this.** It is a fresh cross-scope activation side-effect that the gap-closure batch did not exercise. Likely cause: one of the activation writes in the gap-closure batch (22-09 / 22-10 / 22-13) is firing too broadly and clearing main-panel's active content signal when a sidebar tab becomes active.

## Fresh / Residual Issues (not regressions)

| # | Tests | Description | Follow-on plan hint |
|---|-------|-------------|---------------------|
| I-1 | 15 | Agent + Terminal tabs not independent in ordering; other tab kinds can't move between Terminal tabs | Requires tab-kind-aware reorder semantics — likely in unified-tab-bar `setProjectTabOrder` |
| I-2 | 6, 15 | Split creation from main-last routes to right sidebar if right <3 splits (should be focused-pane only) | Bug in `spawnSubScopeForZone` caller — it may fall back to the other zone when current zone is at 3-cap, but should just disable instead |
| I-3 | 9, 12 | Intra-zone resize drag offset resets visually during drag — tracks from wrong origin | Fix origin capture in `drag-manager.ts` onDragStart; the current `clientY` delta is likely computed against the wrong baseline |
| I-4 | 12 | 9px rectangle above a split when top pane contains a terminal | xterm container has a phantom horizontal scrollbar at certain heights; likely CSS `overflow-x: hidden` missing on `.terminal-containers[data-scope]` or xterm's own overview ruler leaking through |
| I-9 | 7, 8 | GSD and File Tree tabs cannot be reordered among other tab kinds in the same bar | Tied to I-1 — `setProjectTabOrder` excludes singleton kinds from reorder |

## Contradiction Summary Table

| User-reported | Prior plan SUMMARY claim | Contradicts |
|---------------|--------------------------|-------------|
| R-5 test 6 | 22-13 "cross-scope move" | Unit test didn't cover activation-on-receiver |
| R-6 tests 7,8 | 22-09 "wire missing close handlers" | Close button in DOM doesn't reach closeUnifiedTab |
| R-7 test 7 | 22-09 "three-way label swap in renderTab" | grep proved source change, UI still shows 'Git Changes' |
| R-8 test 8 | 22-09 "three-way label swap in renderTab" | same as R-7 |
| R-10 test 16 | 22-08 "per-mutation persistence" + "saveProjectTabs hooked at 3 sites" | tabs lost on restart — write or restore path broken end-to-end |
| R-11 tests 14,18 | none | new side-effect of the broader activation-signal refactor in 22-09/22-10/22-13 |

## What This Means

**The gap-closure batch 22-06..22-13 landed code changes (commits exist) but did NOT achieve end-to-end UAT closure.** Four closing plans (22-08, 22-09, 22-13) are directly contradicted by Round 2 user findings. One fresh regression (R-11) was introduced as a side-effect.

The pattern is consistent: each closing plan's SUMMARY self-check verified source-file grep + unit-test green, but none of those artifacts substitute for a developer running `pnpm tauri dev` and clicking the close button on a GSD tab. The gap between unit-test-green and UAT-green for this phase is the critical failure.

## Accomplishments

- Round 2 UAT results recorded with full test-by-test annotations in 22-UAT.md
- 5 regressions mapped back to the gap-closure plans whose SUMMARY claimed closure — traceability preserved
- 4 residual issues documented with follow-on-plan hints
- STATE.md blocker entry added so subsequent sessions have clear signal Phase 22 is not closed
- Phase 22 NOT marked complete; requirements NOT marked satisfied; 22-05-PLAN.md NOT superseded — preserving integrity of the planning trail

## Files Created/Modified

- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-UAT.md` — Round 2 results, Round 2 gap status, residuals table, recommendation
- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-14-SUMMARY.md` — this file
- `.planning/STATE.md` — added Round 2 UAT failure blocker entry

## Task Commits

1. **22-UAT.md Round 2 update** — `e223497` (test: Round 2 results + 5 regressions + 4 issues)
2. **22-14-SUMMARY.md + STATE.md blocker** — pending (docs: UAT round 2 summary + blocker)

## Decisions Made

- **Do NOT mark Phase 22 complete.** 5 regressions contradict prior closing plans' SUMMARY claims. Treating Phase 22 as closed would corrupt the planning trail and hide the failure from future sessions.
- **Do NOT modify REQUIREMENTS.md.** No Phase 22 requirement (TABS-01, SPLIT-01..04, PREF-01) has a fully satisfying implementation. Marking any as complete would be dishonest given the UAT evidence.
- **Do NOT supersede 22-05-PLAN.md.** Its purpose — "verify and closeout" — is not met by the gap-closure batch. It remains a live plan pending meaningful closure.
- **Do NOT open follow-on gap-closure plans autonomously.** The user explicitly requested this in the execution prompt. Strategic decision (retry fix-up / replan / accept partial / defer to Phase 23) belongs to the user.

## Deviations from Plan

### Deliberate deviation: the user prompt REPLACED the plan's completion path

**Plan 22-14 action (happy path):** rename 22-05-PLAN.md to .superseded; create REQUIREMENTS.md Workspace Shell section with all `[x]`; update ROADMAP to Phase 22 Complete.

**Execution override:** the user's UAT Round 2 report contained 5 regressions and 4 issues. The execution prompt explicitly states:
- "Do NOT mark Phase 22 complete."
- "Do NOT mark requirements satisfied."
- "Do NOT supersede 22-05."
- "Do NOT open new gap-closure plans."

**Rationale:** The plan's happy path was written assuming `all-pass` or `issues-listed-below` with non-blocker severities. The actual UAT outcome is neither — it's `regression-found` at blocker severity, which the plan's own branching logic (`<action>` item 3) says should "halt; recommend a hotfix plan 22-15 immediately; do NOT proceed to Task 2." We are honoring that halt while recording results honestly.

**Impact:** Phase 22 state remains `In Progress` / `partial-with-regressions`. Planning integrity preserved.

## Issues Encountered

None. The doc updates were straightforward once the user's UAT report was parsed.

## Next Phase Readiness

**Phase 22 is NOT ready for closeout.** User must decide among three paths:

1. **Targeted hotfix plans 22-15..22-19** — one plan per regression cluster:
   - 22-15: Fix R-6, R-7, R-8 (the label + close regressions that directly contradict 22-09)
   - 22-16: Fix R-10 (persistence regression contradicting 22-08)
   - 22-17: Fix R-5 + R-11 (cross-scope activation bugs from 22-13 / new side-effect)
   - 22-18: Fix I-3 + I-4 (resize drag bugs contradicting 22-11)
   - 22-19: Fix I-1, I-2, I-9 (tab-kind reorder + split scope routing)
2. **Debug stale-build hypothesis** — the R-7/R-8 label regression is suspicious because 22-09's grep verification explicitly confirmed the label strings are in source. Run `git log --oneline src/components/unified-tab-bar.tsx | head -10` to confirm 22-09's commits (`80ceb11`, `02c6111`) are on the running branch. Kill the dev server, `pnpm install`, rebuild, relaunch. If labels suddenly render correctly, the issue was environmental, not code.
3. **Defer to Phase 23** — accept Phase 22 as `partial-with-regressions` and open a new Phase 23 (workspace-shell-hardening) that inherits these 5 regressions + 4 issues as its gap list.

**Recommendation from this summary:** Start with path (2) — verify the running build actually includes 22-06..22-13 commits. If it does and the UI still shows old labels / cannot close singletons, proceed to path (1) with targeted hotfix plans.

## Self-Check: PASSED

Files verified present:
- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-14-SUMMARY.md` — FOUND (this file)
- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-UAT.md` — FOUND (Round 2 results recorded)
- `.planning/STATE.md` — FOUND (blocker added, decision added, session updated)

Commits verified present via `git log --oneline -3`:
- `e223497 test(22-14): UAT Round 2 — 5 regressions + 4 issues; Phase 22 NOT closed` — FOUND
- `08996e0 docs(22-14): UAT Round 2 summary + STATE blocker — Phase 22 NOT complete` — FOUND

Negative-verification (things that MUST NOT have happened):
- `.planning/phases/22-dynamic-tabs-vertical-split-and-preferences-modal/22-05-PLAN.md` — STILL PRESENT (not superseded — correct)
- `grep TABS-01|SPLIT-01..04|PREF-01 .planning/REQUIREMENTS.md` — 0 matches (REQUIREMENTS untouched — correct)
- ROADMAP.md Phase 22 row — still shows `In Progress` (not marked Complete — correct)

---
*Phase: 22-dynamic-tabs-vertical-split-and-preferences-modal*
*Plan: 14*
*Completed: 2026-04-19*
