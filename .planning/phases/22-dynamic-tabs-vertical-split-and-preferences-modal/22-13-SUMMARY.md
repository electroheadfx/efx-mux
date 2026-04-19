---
phase: 22
plan: 13
subsystem: unified-tab-bar drag/drop
tags: [gap-closure, editor-drag, intra-scope-reorder, cross-scope-drop, append-last-fallback, uat-test-6]
requires:
  - 22-09 (unified tab bar + editor branch in handleCrossScopeDrop)
  - 22-10 (file-tree click activation + _activateEditorTab fix)
provides:
  - Intra-scope editor reorder via handleCrossScopeDrop (same source/target scope)
  - Cross-scope editor move with optional insertion position (_targetId)
  - Append-last fallback when drop lands outside any [data-tab-id] but within a [data-tablist-scope] wrapper
  - Exported getScopedTabOrder + setScopedTabOrder (enables scoped-order assertions from tests)
affects:
  - Editor tabs now behave like terminal/agent tabs for drag UX
  - Drops on empty-pane placeholders append source tab to that scope instead of silently rejecting
  - Drops between tabs insert at the cursor-resolved position (respects _insertAfter)
  - No more nearest-tab cross-scope "snap" pulling drops into unrelated scopes
tech-stack:
  added: []
  patterns:
    - Handler reorganization: editor branch promoted above sourceScope===targetScope early-return to allow intra-scope reorder reuse
    - Scope-first drop resolution: document.elementFromPoint(...).closest('[data-tablist-scope]') drives target scope BEFORE finding the target tab
    - Fallback append-last: empty _targetId in cross-scope editor move appends to end of target scope
    - Nearest-snap scoping: legacy nearest-tab fallback now constrained to the cursor's scope wrapper (no cross-scope bleed)
key-files:
  created: []
  modified:
    - src/components/unified-tab-bar.tsx (handleCrossScopeDrop editor branch rewrite + onDocMouseUp drop resolver refactor + getScopedTabOrder/setScopedTabOrder exports)
    - src/components/unified-tab-bar.test.tsx (3 new 22-13 tests: cross-scope move, empty-target fallback, intra-scope reorder)
decisions:
  - "Editor-branch placement: moved editor handling BEFORE the sourceScope===targetScope early-return rather than adding a parallel intra-scope path. Avoids code duplication and keeps all editor drop logic in one place."
  - "Drop resolver rewrite: the legacy 'nearest tab globally' fallback was the true bug. A drop landing on an empty pane tab-bar would snap to the nearest tab in ANY scope (often main-0), causing silent cross-scope transfers that looked like rejections to users. Now dropTargetScope is resolved from the wrapper under cursor FIRST, and targetId='' is passed through when no tab is under cursor — letting handleCrossScopeDrop decide append-last vs insert-at-position."
  - "Intra-scope editor reorder routed through handleCrossScopeDrop: preserves the 'single responsibility for editor tab moves' principle. Non-editor intra-scope reorder keeps using the legacy setProjectTabOrder path because it writes a cross-scope merged order, not a per-scope one."
  - "Legacy editor branch preserved (unreachable): kept the original editor branch below the scope-equality guard as a commented marker. Zero runtime effect (preceding branch returns first) but simplifies future git blame / backport context."
metrics:
  duration: "~15min"
  completed: "2026-04-19"
---

# Phase 22 Plan 13: Gap-Closure — Editor Reorder + Cross-Scope Drop + Append-Last Fallback Summary

Closes UAT test 6 (major severity): editor tabs were not reorderable via drag,
cross-scope drops required a visible insertion marker, and drops without a
visible marker were silently rejected. Plan 22-13 makes editor tabs first-class
draggable participants with intra-scope reorder, cross-scope move with
insertion position, and append-last fallback for empty-marker drops.

## Tasks Completed

| # | Task                                                                   | Commit   |
| - | ---------------------------------------------------------------------- | -------- |
| 1 | RED: 3 tests + export scoped-order helpers                             | e527641  |
| 2 | GREEN: editor intra-bar reorder + drop fallback to append-last         | a339b75  |

## Task 1: RED Tests + Export Scoped-Order Helpers

Added a new top-level `describe` block `'Phase 22 gap-closure (22-13): editor reorder + cross-scope drop + append fallback'` in `src/components/unified-tab-bar.test.tsx` with 3 tests:

1. **editor cross-scope drop moves tab to target scope (append-last)** — `handleCrossScopeDrop('editor-1', 'main-0', '', 'main-1', false)` must flip `ownerScope` to `main-1`, remove from main-0 scoped order, and append to main-1 scoped order. (Passed on first run — 22-09 already handles the basic case but with unconditional append.)
2. **drop on empty-string target id falls back to append-last in target scope** — with an existing tab `editor-2` in main-1, moving `editor-1` from main-0 to main-1 with `_targetId=''` must put `editor-1` at the END (index max). (Passed on first run.)
3. **intra-scope editor reorder via handleCrossScopeDrop with same source/target scope updates order** — with `['editor-1', 'editor-2', 'editor-3']` in main-0, call `handleCrossScopeDrop('editor-1', 'main-0', 'editor-3', 'main-0', true)` and expect `editor-1` index > `editor-3` index. (FAILED as RED: the existing `if (sourceScope === targetScope) return;` early-return blocked all same-scope reorder.)

**Export addition:** `getScopedTabOrder` and `setScopedTabOrder` are now exported from `unified-tab-bar.tsx` so tests can directly manipulate and assert scoped order without going through the full drag simulation. This matches the test-infrastructure-first pattern used by Plan 22-10 (which exported `setProjectEditorTabs` for the same reason).

## Task 2: GREEN — handleCrossScopeDrop + onDocMouseUp Rewrite

### handleCrossScopeDrop editor branch — rewritten and promoted

**Before (22-09):** Editor handling lived BELOW the `if (sourceScope === targetScope) return;` early-return. This made same-scope editor reorder impossible.

**After (22-13):** Editor branch is the FIRST thing checked in the function. Three sub-paths:

```ts
if (sourceId.startsWith('editor-')) {
  const currentOwnerScope = edTab.ownerScope ?? 'main-0';

  // Path A — Intra-scope reorder (new, closes UAT test 6).
  if (currentOwnerScope === targetScope && _targetId) {
    const order = getScopedTabOrder(targetScope).filter(id => id !== sourceId);
    const targetIdx = order.indexOf(_targetId);
    if (targetIdx === -1) { /* append-last fallback */ return; }
    const insertAt = _insertAfter ? targetIdx + 1 : targetIdx;
    order.splice(insertAt, 0, sourceId);
    setScopedTabOrder(targetScope, order);
    return;
  }

  // Path B — Same scope, no target tab (drop on own empty tab-bar area): no-op.
  if (currentOwnerScope === targetScope) return;

  // Path C — Cross-scope move (with insert-at-target OR append-last).
  setProjectEditorTabs(editorTabs.value.map(t =>
    t.id === sourceId ? { ...t, ownerScope: targetScope } : t,
  ));
  setScopedTabOrder(sourceScope,
    getScopedTabOrder(sourceScope).filter(id => id !== sourceId));

  if (_targetId) {
    const targetOrder = getScopedTabOrder(targetScope).filter(id => id !== sourceId);
    const targetIdx = targetOrder.indexOf(_targetId);
    const insertAt = targetIdx === -1 ? targetOrder.length
                                      : (_insertAfter ? targetIdx + 1 : targetIdx);
    targetOrder.splice(insertAt, 0, sourceId);
    setScopedTabOrder(targetScope, targetOrder);
  } else {
    // Fallback: append to end of target scope (fallback when _targetId === '').
    setScopedTabOrder(targetScope,
      [...getScopedTabOrder(targetScope).filter(id => id !== sourceId), sourceId]);
  }
  // ...activation-cascade (unchanged from 22-09)...
  return;
}

if (sourceScope === targetScope) return;  // still applies to non-editor kinds
```

**Non-editor kinds (GSD, Git Changes, File Tree, Terminal/Agent)** retain the `sourceScope === targetScope` early-return — intra-scope reorder for those kinds is handled by the legacy `setProjectTabOrder` path in `onDocMouseUp`, not here.

### onDocMouseUp — scope-first drop resolver

**Before (22-09):** The drop resolver computed `targetId` by scanning ALL `[data-tab-id]` elements on the page, including a "nearest tab" global fallback when no tab was under the cursor. This caused drops on an empty pane's tab-bar to silently snap to the nearest tab in ANY scope — usually main-0 — producing the "silent reject / weird transfer" UX UAT flagged.

**After (22-13):** Resolve the target scope FIRST via `document.elementFromPoint(...).closest('[data-tablist-scope]')`. Then:

1. If drop scope ≠ source scope → call `handleCrossScopeDrop` with `targetId = ''` (triggers append-last fallback inside the editor branch).
2. If drop scope === source scope AND source is an editor AND there's a target tab → intra-scope editor reorder via `handleCrossScopeDrop`.
3. Otherwise, nearest-snap fallback is scoped to the drop target's scope only (preserves legacy intra-bar reorder for non-editor kinds).

### Signal routing unchanged

Activation-cascade (`getTerminalScope('right-0').activeTabId` vs `activeUnifiedTabId`) remains identical to 22-09 — only the order-writing paths changed. No new signal subscriptions or persistence writes introduced.

## Companion Fix: File-Tree Click (22-10)

Closing the UAT 6 gap requires BOTH sides working:
- **Drag side (this plan):** editor tabs reorder + drop append-last
- **Click side (Plan 22-10 Task 2 step 4):** file-tree single-click opens file AND activates the new tab so the body renders

Plan 22-10 fixed `_activateEditorTab` to write `getTerminalScope(scope).activeTabId.value` for main-scope tabs. Plan 22-13 does NOT re-touch that path — any code path that opens an editor tab (including the new drag-drop creating a tab in a different scope) inherits the scope-activation fix for free because `setProjectEditorTabs` + `setScopedTabOrder` writes don't bypass `_activateEditorTab`; activation happens at the open callsite (file-tree click, preview replacement, cross-scope drop routes already-opened tabs).

## Verification Results

| Check                                                                                                               | Result                                           |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `grep -c "Phase 22 gap-closure (22-13)" src/components/unified-tab-bar.test.tsx`                                    | 2 (comment + describe title)                     |
| `grep -cE "falls back to append-last|reorder via.*same source/target" src/components/unified-tab-bar.test.tsx`      | 2                                                |
| `grep -c "currentOwnerScope === targetScope" src/components/unified-tab-bar.tsx`                                    | 2 (intra-scope + same-scope-no-target guards)    |
| `grep -cE "Fallback: append to end|append-last|fallback when _targetId" src/components/unified-tab-bar.tsx`         | 3                                                |
| `grep -cE "if \(_targetId\) \{" src/components/unified-tab-bar.tsx`                                                 | 1 (insert-at-position vs append-at-end branch)   |
| `pnpm exec vitest run src/components/unified-tab-bar.test.tsx -t "22-13"`                                           | 3 passed / 0 failed                              |
| `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` (vs 22-12 baseline 14 fail / 57 pass)                | 14 failed / 60 passed (+3 new, 0 regressions)    |
| `pnpm exec tsc --noEmit` — errors in unified-tab-bar.tsx (source file, not test)                                    | 0                                                |

### Pre-existing Failures Not Touched

The 14 failing tests in `unified-tab-bar.test.tsx` are pre-existing (sticky-tab rendering, D-05, D-06 plus-menu, Fix #3 sticky order, rename suppression, split icon presence, drop-affordance assertions from Plan 22-03 and earlier) and unrelated to 22-13. Baseline confirmed at 22-12 handoff: 14 fail / 57 pass → 14 fail / 60 pass (+3 new 22-13 passes, 0 regressions).

Pre-existing TypeScript errors in the test file (lines 436-1098 — `Argument of type 'Element' is not assignable to parameter of type 'HTMLElement'` and `Property 'disabled' does not exist on type 'HTMLElement'`) are also pre-existing and NOT introduced by this plan. My new tests (lines 1160+) are TS clean.

## Deviations from Plan

### Auto-Fixed

**1. [Rule 3 — Blocking] `getScopedTabOrder` / `setScopedTabOrder` not exported**
- **Found during:** Task 1 test writing.
- **Issue:** The plan's test template imports `setScopedTabOrder` and `getScopedTabOrder` directly from `./unified-tab-bar`. But both helpers are module-private (not exported). Tests would fail at module-import time with `TypeError: setScopedTabOrder is not a function`.
- **Fix:** Added `export` keyword to both function declarations (lines 185-203). The functions are internal state writers but their semantics are stable (scoped-order per `activeProjectName`), and Plan 22-10 had already set the precedent by exporting `setProjectEditorTabs` for the same test-infrastructure reason.
- **Files modified:** `src/components/unified-tab-bar.tsx` (2 `function` → `export function` replacements).
- **Commit:** e527641 (Task 1 RED commit, since this is an enablement change).

**2. [Rule 2 — Critical correctness] `onDocMouseUp` "nearest tab" global fallback was the root cause of silent rejects**
- **Found during:** Task 2 drop-resolver refactor.
- **Issue:** The plan identified the symptom ("drops without an insertion marker are silently rejected") but the actual mechanism was subtler. The legacy resolver's "nearest tab" loop scanned ALL `[data-tab-id]` on the page. When the user dropped on an empty pane tab-bar, it'd find the nearest tab in main-0 (or wherever), triggering a cross-scope transfer INTO main-0 instead of appending to the intended empty scope. Fixing only `handleCrossScopeDrop` without fixing the resolver would leave the drag broken.
- **Fix:** Resolve `dropTargetScope` FIRST via `document.elementFromPoint(...).closest('[data-tablist-scope]')`. Pass `targetId = ''` to `handleCrossScopeDrop` when no tab is under the cursor, so the append-last fallback inside the editor branch can execute. Also scoped the legacy nearest-snap fallback to the drop target's scope only (no cross-scope bleed).
- **Files modified:** `src/components/unified-tab-bar.tsx` (full rewrite of `onDocMouseUp` body).
- **Commit:** a339b75 (Task 2 GREEN commit).

**3. [Rule 1 — Bug guard] Cross-scope move with `_targetId` but target not found in order**
- **Found during:** Task 2 implementation review.
- **Issue:** If `_targetId` is passed but the target tab was concurrently removed from the scope's order (race with a close/migrate), `targetOrder.indexOf(_targetId) === -1` would make `splice(-1, 0, sourceId)` insert at the second-to-last position — a non-obvious bug that could surface under rapid drag+close interaction.
- **Fix:** When `targetIdx === -1`, append to `targetOrder.length` instead of relying on `splice(-1)`. Applied in both intra-scope (inside the intra-scope path) and cross-scope (Path C) branches.
- **Files modified:** `src/components/unified-tab-bar.tsx` (two new `targetIdx === -1 ? ... : ...` guards).
- **Commit:** a339b75 (Task 2 GREEN commit).

## Threat Flags

None — all changes are DOM event routing and signal-based state updates through existing typed interfaces (`TerminalScope` union, `EditorTabData.ownerScope`). No new network, auth, filesystem, or IPC surface introduced.

## Success Criteria

- [x] Editor tabs reorderable within a tab bar (intra-scope `handleCrossScopeDrop` path)
- [x] Editor tabs droppable on empty-pane placeholders (cross-scope path with `_targetId = ''`)
- [x] Empty-marker drops fall back to append-last (fallback branch inside cross-scope path)
- [x] All gap-13 tests green (3/3)
- [x] TS clean on all 22-13 additions (source file: 0 errors; test file: pre-existing errors only, not touched)
- [x] 0 regressions in `unified-tab-bar.test.tsx` (14 fail → 14 fail, 57 pass → 60 pass)

## Hand-off Note for Plan 22-14

Plan 22-13 closes UAT test 6 (editor drag UX). Combined with Plan 22-10's
file-tree click fix, both sides of the UAT 6 failure mode are addressed:
click-to-open and drag-to-reorder now work as the UAT doc expects.

**For Plan 22-14 (UAT re-run):** the following UAT truths should now pass:
- Test 6 truth: "File-tree click opens file, tabs are reorderable, cross-pane drop works, and failed drops default to appending" — all 4 sub-truths satisfied.
- Existing truths from 22-09/10/11/12 remain intact (14 fail / 60 pass baseline preserved — the 14 failures are pre-existing unrelated suites).

**If 22-14 surfaces a regression:** check first whether the regression is in the `onDocMouseUp` drop-resolver's scope-first path (line ~1493) — that's the most load-bearing change in this plan. The `handleCrossScopeDrop` editor branch is additive (code previously-below-the-early-return is still present as an unreachable marker) so reverting is low-risk.

## Self-Check: PASSED

Files verified present:
- `src/components/unified-tab-bar.tsx` — FOUND (editor branch rewrite at line 1569+; `onDocMouseUp` refactor at line 1484+; `getScopedTabOrder`/`setScopedTabOrder` exports at lines 185, 193)
- `src/components/unified-tab-bar.test.tsx` — FOUND (3 new 22-13 tests appended at line 1160+)

Commits verified present via `git log --oneline -3`:
- `e527641 test(22-13): RED tests for editor reorder + drop fallback` — FOUND
- `a339b75 fix(22-13): editor intra-bar reorder + drop fallback to append-last` — FOUND
