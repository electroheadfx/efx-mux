---
phase: 21-bug-fix-sprint
plan: 03
subsystem: ui
tags: [tab-management, scope-routing, file-tree, editor-tab, preact-signals]

requires:
  - phase: 20-right-panel-multi-terminal
    provides: ownerScope field + cross-scope drag + separate right-panel activeTabId signal (Plan 20-05-D)

provides:
  - FIX-06 resolution: single-click on CLAUDE.md (and any other right-scoped persisted editor tab) now correctly opens an editor body via the owning-scope's active-tab signal
  - _activateEditorTab helper: single source of truth for editor-tab activation that honors ownerScope
  - Stale-content refresh on existing-tab focus: disk re-read propagates into editorTabs so save baseline + persistence track current file state
  - Unpinned-preview force-reset to main scope: file-tree-driven previews never silently swallow a right-panel preview slot

affects:
  - future-editor-tab-features
  - tab-persistence
  - any-programmatic-openEditorTab-caller

tech-stack:
  added: []
  patterns:
    - "Scope-aware activation helper: any programmatic writer to editor-tab focus MUST route through _activateEditorTab(tab) so both activeUnifiedTabId and the owning-scope activeTabId stay consistent"
    - "Preview-follows-file-tree semantics: unpinned-replace path normalizes ownerScope to 'main' (matches VS Code / Zed)"

key-files:
  created:
    - .planning/debug/resolved/claude-md-tab-open-failure.md
    - .planning/phases/21-bug-fix-sprint/21-03-SUMMARY.md
  modified:
    - src/components/unified-tab-bar.tsx

key-decisions:
  - "Diagnose by static code inspection only (plan skip_checkpoint directive — user cannot UAT for this isolated plan)"
  - "Introduce a single _activateEditorTab helper rather than scatter scope-routing logic across three branches × two functions"
  - "Force main ownerScope on unpinned-replace (VS Code / Zed preview semantics); if the user wants right-scope they can drag"
  - "Refresh stale content on existing-tab focus to keep save baseline + persistence consistent with disk state"

patterns-established:
  - "Scope-routed editor activation: ownerScope='right' → getTerminalScope('right').activeTabId; always also write activeUnifiedTabId for persistence/save shortcuts"
  - "Debug-by-static-analysis fallback when UAT is unavailable: confidence-HIGH diagnoses require the symptom to grep-visibly match the structural mismatch, like here"

requirements-completed: [FIX-06]

duration: 7min
completed: 2026-04-18
---

# Phase 21 Plan 03: FIX-06 CLAUDE.md Tab-Open Failure Summary

**Routed openEditorTab/openEditorTabPinned activation through a scope-aware helper so right-scoped persisted editor tabs are actually rendered (not stranded in a signal RightPanel does not read).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-18T11:09:13Z
- **Completed:** 2026-04-18T11:16:37Z
- **Tasks:** 2 executed (Task 1 investigation + Task 3 fix); Task 2 and Task 4 UAT deferred per skip_checkpoint directive
- **Files modified:** 1 source file, 2 planning/debug files created

## Accomplishments

- **Root cause identified by static analysis:** `openEditorTab` and `openEditorTabPinned` wrote only `activeUnifiedTabId` on their existing-focus / unpinned-replace / create-new branches. When the target tab had `ownerScope: 'right'` (from a prior cross-scope drag, Plan 20-05-D), the correct signal was `getTerminalScope('right').activeTabId`, which RightPanel reads. Consequence: tab was "focused" in an unread signal, MainPanel hid terminal (editor is active), MainPanel's editor filter excluded the right-scoped tab, and the always-mounted ServerPane became the only visible body — matching D-10 screenshot exactly.
- **Fix applied:** extracted `_activateEditorTab(tab)` helper; routed all three branches of both openers through it. Added stale-content refresh and unpinned-replace scope-normalization.
- **Debug doc written** at `.planning/debug/resolved/claude-md-tab-open-failure.md` with full evidence, eliminated hypotheses, root cause, fix, and prevention.
- **No instrumentation shipped.** Plan Task 1 (heavy `[FIX-06]` console.log instrumentation) was collapsed into the debug doc's static-analysis evidence section because UAT is deferred.

## Task Commits

1. **Task 1 (adapted): Diagnosis** — `8bbd252` (docs) — investigation doc with file-inspection evidence + static-analysis root cause
2. **Task 3 (fix): Scope-aware activation** — `6b0a388` (fix) — _activateEditorTab helper + three-branch routing + stale-content refresh + unpinned-replace scope normalization

**UAT checkpoints deferred:**
- Task 2 (`checkpoint:human-verify`): UAT log capture — SKIPPED per skip_checkpoint directive
- Task 4 (`checkpoint:human-verify`): Post-fix UAT — DEFERRED to joint phase-21 verification (user will validate plans 21-01, 21-02, 21-03 together)

## Files Created/Modified

- `src/components/unified-tab-bar.tsx` — added `_activateEditorTab` helper; updated `openEditorTab` (existing + unpinned-replace + create branches) and `openEditorTabPinned` (existing + create branches) to route activation through it; added stale-content refresh on existing-focus; added scope-order repair when unpinned-replace pulls a tab out of right scope
- `.planning/debug/resolved/claude-md-tab-open-failure.md` — full root cause write-up (evidence, eliminated hypotheses, resolution, prevention, diagnosis mode disclosure)
- `.planning/phases/21-bug-fix-sprint/21-03-SUMMARY.md` — this file

## Decisions Made

- **Static-analysis-only diagnosis.** Per the plan's `skip_checkpoint_directive`, live UAT log capture was not performed. The D-10 symptom ("tab seemingly created but nothing renders; ServerPane at full height") grep-visibly matches the exact shape of the signal-mismatch bug: two parallel active-tab signals, only one updated on the file-tree activation path. Confidence: HIGH. UAT during joint phase-21 verification will either confirm or invalidate.
- **Skip heavy instrumentation** (Task 1's original `[FIX-06]` console.logs across three files). Instrumentation is only useful when logs can be captured during UAT; since UAT is deferred, the instrumentation would have been pure noise to clean up.
- **Force `ownerScope: 'main'` on unpinned-replace.** Matches VS Code / Zed preview semantics. If the user wants the new file on the right, they can drag it. This also prevents the silent-swallow recurrence where a previously-dragged preview tab consumes subsequent file-tree previews.
- **Stale-content refresh on existing-focus branch.** Small extra defensive behavior so save baseline + persistence track disk state. Does not remount the EditorView (the useEffect keys on filePath), but keeps `editorTabs` signal coherent for downstream consumers.

## Deviations from Plan

### Task Structure Deviation (not a code deviation)

**1. [Skip-checkpoint directive] Collapsed Task 1 + Task 3 into single diagnosis + fix flow**
- **Found during:** Pre-Task-1 directive reading
- **Issue:** Plan's Task 1 adds extensive `[FIX-06]` instrumentation intended for UAT log capture in Task 2. With UAT deferred per directive, instrumentation serves no diagnostic purpose and would need re-removal anyway.
- **Fix:** Replaced Task 1's instrumentation with static-analysis evidence captured directly into the debug doc. Task 3's fix applies identically.
- **Files modified:** Unchanged from plan's Task 3 target (`src/components/unified-tab-bar.tsx` only; did not touch file-tree.tsx or main.tsx since no instrumentation was added)
- **Verification:** `grep -c FIX-06 src/components/file-tree.tsx src/main.tsx` → 0 (verified clean); `pnpm exec tsc --noEmit` clean; 42/42 unified-tab-bar tests pass.
- **Committed in:** `8bbd252` (diagnosis doc) + `6b0a388` (fix)

---

**Total deviations:** 1 structural (task-collapse per explicit directive); 0 code deviations.
**Impact on plan:** Executed Task 1's acceptance outcome (debug doc created with evidence + eliminated hypotheses + root cause) and Task 3's full fix. Instrumentation step — which existed only to support deferred-UAT log capture — was skipped. Plan's own `verification` requirement "All `[FIX-06]` instrumentation removed before commit" is trivially satisfied (none was ever added).

## Issues Encountered

- **File-tree test worker crash** during `pnpm exec vitest run src/components/file-tree.test.tsx` (46/54 pass, 8 errors from worker unexpected-exit). Pre-existing infrastructure issue documented in `.planning/phases/20-right-panel-multi-terminal/deferred-items.md`. My changes do not touch `file-tree.tsx`, so this is not a regression introduced by plan 21-03.

## UAT Status

**DEFERRED — joint phase-21 verification.** The user cannot run the dev server inside this plan's flow. UAT for plans 21-01 (FIX-01 file watcher), 21-02 (FIX-05 Open-In), and 21-03 (FIX-06 CLAUDE.md) will occur together after all three are on the phase-21 branch. At that time the user should validate:

- **Test A:** Single-click `CLAUDE.md` in the file tree → preview editor tab appears with correct content
- **Test B:** Double-click `CLAUDE.md` → pinned editor tab appears (alongside any existing preview tab)
- **Test C:** Single-click `CLAUDE.md` with its tab already open → existing tab focuses (no duplicate)
- **Test D:** Content is correct, not blank, not truncated
- **Test E:** Reset test state: if an old persisted `editor-tabs:<project>` JSON in state.json contained CLAUDE.md with `ownerScope: 'right'`, clearing that entry (or closing and re-opening the app) should not change behavior — the fix handles the stranded-right-scope case on the fly at click time
- **Regression check:** Main-panel single-click on any other file still opens normally; cross-scope drag still works; right-panel editor tabs opened via drag still render

If UAT invalidates the static-analysis diagnosis, the debug doc's `Diagnosis Mode` section explicitly calls out that possibility — re-open the doc with a fresh hypothesis.

## User Setup Required

None.

## Next Phase Readiness

- Plan 21-03 (FIX-06) code-complete.
- Remaining phase-21 work: 21-04 (code-review debt bundle: WR-01, WR-02, WR-03, IN-02).
- Joint phase-21 UAT awaits completion of remaining plans.

---
*Phase: 21-bug-fix-sprint*
*Plan: 03*
*Completed: 2026-04-18*

## Self-Check: PASSED

- Commits verified present: `8bbd252` (diagnosis doc), `6b0a388` (fix)
- Files verified present: `.planning/debug/resolved/claude-md-tab-open-failure.md`, `.planning/phases/21-bug-fix-sprint/21-03-SUMMARY.md`, `src/components/unified-tab-bar.tsx` (fix applied)
- Instrumentation cleanup verified: `grep -c FIX-06 src/components/file-tree.tsx src/main.tsx` → 0 / 0
- TypeScript check verified: `pnpm exec tsc --noEmit` exits 0 (no new errors)
- Test suite verified: 42/42 `unified-tab-bar.test.tsx` tests pass; `file-tree.test.tsx` worker-crash is a pre-existing infra issue (46/54, 8 errors) documented in 20-right-panel-multi-terminal/deferred-items.md and not a regression from this plan's changes
