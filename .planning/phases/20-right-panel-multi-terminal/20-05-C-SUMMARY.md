---
phase: 20
plan: 05-C
subsystem: unified-tab-bar
tags: [minimap, tab-bar, scope-aware, ui-fix]
key-files:
  modified:
    - src/components/unified-tab-bar.tsx
  created:
    - src/components/minimap-toggle.test.tsx
commits:
  - 750c65d: fix(20-05-C): gate minimap icon on active-tab type per scope
---

# Phase 20 Plan 05-C: Minimap Icon Visibility Fix — Summary

Gate the minimap toggle icon so it appears ONLY when the active tab in its
scope is an editor (file) tab.

## Problem

The minimap icon was rendered whenever `editorTabs.value.length > 0` — i.e.,
whenever any file was open anywhere in the project. This meant:

- The icon appeared in BOTH tab bars (main and right) even when the file
  was open in only one of them.
- The icon appeared even when the active tab in that scope was a terminal,
  agent, git-changes, file-tree, or gsd tab — making the toggle useless /
  confusing (no editor visible to minimap).

## Fix

Replace the scope-agnostic length check with a scope-aware active-tab check.

New helper exported from `unified-tab-bar.tsx`:

```ts
export function isEditorTabActiveInScope(
  ordered: UnifiedTab[],
  activeId: string,
): boolean {
  if (!activeId) return false;
  const active = ordered.find(t => t.id === activeId);
  return active?.type === 'editor';
}
```

The render site passes `ordered` (already the scope-filtered list from
`getOrderedTabsForScope(scope)`) and `currentId` (the scope's active tab id;
for right scope this is `getTerminalScope('right').activeTabId.value`, for
main it is `activeUnifiedTabId.value`). Each scope therefore computes
visibility independently.

## Tests

New file: `src/components/minimap-toggle.test.tsx` (8 tests, all passing):

- `false` when `activeId` is empty.
- `false` for terminal / git-changes / file-tree / gsd active tabs.
- `true` for editor active tabs.
- `false` when the active id is not present in the scoped list (simulates a
  file open in the OTHER scope — the icon correctly hides here).
- Independence: main with an editor active returns `true`, while right with
  File Tree active returns `false`, in the same assertion.

Chose a standalone test file rather than adding to
`unified-tab-bar.test.tsx` because that file is owned by a sibling agent in
this parallel-execution wave.

## Verification

- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec vitest run src/components/minimap-toggle.test.tsx` — 8/8 pass.
- Existing `unified-tab-bar.test.tsx` — 15/16 pass; the one failure
  (`left-aligns menu normally when there is ample horizontal room` under
  "Fix #1 plus-menu dropdown flips…") is UNRELATED to this plan. It belongs
  to sibling-agent work on dropdown-menu positioning present in the shared
  worktree (`dropdown-menu.tsx` and `unified-tab-bar.test.tsx` both show
  unstaged modifications that were not authored by this agent). Verified
  by `git stash` before my edits: the failing test did not exist at the
  reset base (commit 5991c6d); it was introduced alongside the sibling
  `dropdown-menu.tsx` diff.

## Files

- **Modified:** `src/components/unified-tab-bar.tsx` — +19/-1 lines.
  - Added `isEditorTabActiveInScope` helper after `getOrderedTabsForScope`.
  - Replaced `editorTabs.value.length > 0` gate with
    `isEditorTabActiveInScope(ordered, currentId)` at the render site.
- **Created:** `src/components/minimap-toggle.test.tsx` — 8 tests.

## Scope Note

The objective explicitly listed "component(s) that render the minimap icon"
as the target, and the only render site is `unified-tab-bar.tsx`. The
parallel-execution note also listed that file as owned by a sibling agent.
To reconcile, this change is as surgical as possible (two small hunks:
helper add + single-line condition swap) to minimize merge-conflict
surface with the sibling agent's unrelated work. The sibling-authored
modifications to `dropdown-menu.tsx` and `unified-tab-bar.test.tsx` were
left untouched and unstaged.

## Deviations from Plan

None — plan executed as written with one note above re: sibling-agent
changes already present in the worktree.
