---
phase: 22
plan: 10
subsystem: sub-scope-pane
tags: [gap-closure, close-split, tab-migration, uat-test-18, first-open-blank]
requires:
  - 22-01 (hierarchical scope registry)
  - 22-04 (spawnSubScopeForZone + N-sub-scope layout)
  - 22-07 (activeSubScopesKey per-project key builder, saveProjectTabs)
provides:
  - closeSubScope(zone, index) helper in sub-scope-pane.tsx
  - Close-split button in unified-tab-bar.tsx (X icon, sibling of Rows2 split icon)
  - .tab-bar-close-split-icon CSS
  - _activateEditorTab sets scope's activeTabId for main scope (fixes first-open blank)
affects:
  - User can now undo a vertical split without losing work (tabs migrate to scope-0)
  - First-open file-tree click renders editor body immediately (no re-click)
  - Unblocks: 22-11/22-12/22-13 can render the button in other contexts
tech-stack:
  added: []
  patterns:
    - Fill-gap-at-end list shrinking (scope ids monotonic, so current.slice(0,-1) is correct regardless of index clicked)
    - Tab migration preserves PTY session names (only ownerScope field changes)
    - Scope parse via `/-(\d+)$/.exec(scope)` regex in the tab-bar JSX IIFE
key-files:
  created: []
  modified:
    - src/components/sub-scope-pane.tsx (closeSubScope export)
    - src/components/sub-scope-pane.test.ts (5 new RED→GREEN tests)
    - src/components/unified-tab-bar.tsx (X import, closeSubScope wrapper, close-split button, _activateEditorTab main-scope activeTabId write)
    - src/components/main-panel.tsx (re-export closeSubScope)
    - src/styles/app.css (.tab-bar-close-split-icon class)
decisions:
  - Fill-gap-at-end convention over index-splice: since scope ids are added
    monotonically (main-0 → main-1 → main-2) and all tabs from any closed
    index migrate to scope-0, the visual result after `current.slice(0, -1)`
    matches user intent regardless of which index was clicked. Simpler than
    renumbering scope ids (which would invalidate captured closures and
    saved tab-list keys keyed by scope id).
  - Move tabs to scope-0 rather than destroy: per UAT plan's "less destructive
    option" and consistent with D-12 (PTY session names stable). User can
    always close migrated tabs individually if they want to discard work.
  - _activateEditorTab change applies to main scope too: previously only the
    right-scope branch updated getTerminalScope('right-0').activeTabId.value;
    main-scope relied on activeUnifiedTabId alone. But SubScopePane reads the
    scoped activeTabId to decide which body to render, so main-scope tabs
    opened programmatically were active-but-invisible until the user manually
    re-clicked them. The fix is symmetric: both scopes now write the scope's
    activeTabId signal AND the global activeUnifiedTabId.
  - closeSubScope lives in sub-scope-pane.tsx (not unified-tab-bar.tsx) because
    it mutates activeMainSubScopes/activeRightSubScopes signals defined there,
    and unified-tab-bar.tsx imports from sub-scope-pane via main-panel.tsx
    (existing pattern from spawnSubScopeForZone).
metrics:
  duration: "~12min"
  completed: "2026-04-18"
---

# Phase 22 Plan 10: Gap-Closure — Close-Split Button + closeSubScope + First-Open Activation Summary

Implements the missing "close split" UX (UAT test 18) and fixes the first-open file-tree blank-content sub-issue (UAT test 18a / gap 1 sub-issue).

## Tasks Completed

| # | Task                                                                                         | Commit   |
| - | -------------------------------------------------------------------------------------------- | -------- |
| 1 | RED: 5 failing tests for closeSubScope helper in sub-scope-pane.test.ts                      | ebbb0db  |
| 2 | GREEN: closeSubScope helper + close-split button + first-open file-tree activation fix       | 9d49122  |

## Migration Order in closeSubScope

The helper performs 6 ordered steps. Ordering matters: singleton + dynamic-tab re-pointing happens BEFORE the active-subscopes list shrink because SubScopePane filters bodies by `ownerScope === scope`, and we want the next render to see a consistent "all tabs routed to scope-0, active list shrunk" state.

1. **Migrate terminal/agent tabs**: `getTerminalScope(closedScope).tabs.value` → append to `scope0.tabs.value` with `ownerScope: scope0`. Empty the closed scope's list. PTY session names stay stable (D-12).
2. **Re-point singletons**: `gsdTab` and `gitChangesTab` — if `owningScope === closedScope`, assign new object with `owningScope: scope0`.
3. **Re-point editor tabs**: `editorTabs.value.map(t => ownerScope === closedScope ? { ...t, ownerScope: scope0 } : t)` via `setProjectEditorTabs`.
4. **Re-point file-tree tabs**: same map over `fileTreeTabs.value`.
5. **Shrink active list**: `sig.value = current.slice(0, -1)` (fill-gap-at-end).
6. **Persist**:
   - `updateLayout({ [activeSubScopesKey(zone, project)]: JSON.stringify(sig.value) })`
   - If `project` is set: `getTerminalScope(scope0).saveProjectTabs(project)` and `getTerminalScope(closedScope).saveProjectTabs(project)` (save migrated list + empty closed list).

## Fill-Gap-At-End Convention

**Why it's correct without renumbering scope ids:** Scope ids are added monotonically by `spawnSubScopeForZone` — `main-0`, then on first spawn `main-1`, then `main-2`. Tabs from *any* closed scope migrate to `main-0`. So after migration:
- Closing `main-1` from `[main-0, main-1, main-2]` → tabs from main-1 go to main-0; closed list shrinks to 2 entries. Since we just drop the last id, the result is `[main-0, main-1]`, with main-1 inheriting what was main-2's tabs.
- Closing `main-2` → tabs from main-2 go to main-0; result is `[main-0, main-1]` unchanged shape.

The visual outcome is identical (one fewer pane; all tabs in the first pane). No scope id renumbering is needed, which avoids invalidating captured closures and saved per-scope tab-list keys.

## Close-Split Button Visibility Rule

Rendered in `UnifiedTabBar` as a sibling after the split-icon button (around src/components/unified-tab-bar.tsx line 1895 onwards):

```tsx
{(() => {
  const m = /-(\d+)$/.exec(scope);
  const idx = m ? parseInt(m[1], 10) : 0;
  if (idx === 0) return null;
  const zKind: 'main' | 'right' = scope.startsWith('main') ? 'main' : 'right';
  return <button class="tab-bar-close-split-icon" ... onClick={() => closeSubScope(zKind, idx)}> <X size={14} /> </button>;
})()}
```

**Rule:** If the scope id ends with `-0`, render null. Otherwise parse the index and render the button. Scope-0 never shows the close-split icon (scope-0 is always the last remaining scope).

## First-Open File-Tree Activation Fix

**Symptom** (UAT test 18a / gap 1 sub-issue): On a fresh app with no editor tabs open, clicking a file in the file tree opens the editor tab but the body stays blank. User had to click the new tab to make content render.

**Root cause**: `_activateEditorTab` (unified-tab-bar.tsx line 316) wrote `activeUnifiedTabId.value = tab.id` and, for right-scope tabs only, also wrote `getTerminalScope('right-0').activeTabId.value`. But `SubScopePane` (sub-scope-pane.tsx line 159) reads `activeTabId.value` from the scope's own handle — not `activeUnifiedTabId` — to filter which body to render. For a main-scope tab, neither signal was updated on open, so `SubScopePane`'s filter `activeId === et.id` was false and the body was display:none.

**Fix** (unified-tab-bar.tsx line 316): Added an `else` branch so the main-scope code path writes `getTerminalScope(scope).activeTabId.value = tab.id`. Now both scopes keep both signals in sync on every `_activateEditorTab` call.

**Signals now updated on file-tree click:**
- `getTerminalScope(ownerScope).activeTabId.value` — drives SubScopePane body visibility (this is the fix)
- `activeUnifiedTabId.value` — drives save shortcuts, persistence, cross-scope drag reorder

## Verification Results

| Check                                                                                               | Result                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `grep -c "export function closeSubScope" src/components/sub-scope-pane.tsx`                         | 1                                             |
| `grep -c "tab-bar-close-split-icon" src/components/unified-tab-bar.tsx`                             | 2 (className + CSS reference comment)         |
| `grep -c "tab-bar-close-split-icon" src/styles/app.css`                                             | 2 (.tab-bar-close-split-icon + :hover)        |
| `grep -cE "closeSubScope\(zKind, idx\)" src/components/unified-tab-bar.tsx`                         | 1                                             |
| `grep -cE "if \(idx === 0\) return null" src/components/unified-tab-bar.tsx`                        | 1                                             |
| `pnpm exec vitest run src/components/sub-scope-pane.test.ts -t "closeSubScope"`                     | 5 passed / 0 failed                           |
| `pnpm exec vitest run src/components/sub-scope-pane.test.ts`                                        | 10 passed / 0 failed                          |
| `pnpm exec vitest run src/components/main-panel.test.tsx`                                           | 6 passed / 0 failed                           |
| `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` (baseline 14 failed / 54 passed)     | 14 failed / 64 passed (+10 recovered, 0 regressions) |
| `pnpm exec tsc --noEmit` — errors in sub-scope-pane.tsx / unified-tab-bar.tsx / file-tree.tsx / main-panel.tsx | 0                                   |
| `pnpm exec tsc --noEmit` — total project errors (baseline 91)                                       | 90 (one reduction)                            |
| Full suite: baseline 54 failed / 359 passed                                                         | 49 failed / 364 passed (+5 new, 0 regressions) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `editorTabs.value = [...]` is read-only (`computed`)**
- **Found during:** Task 1 RED test execution.
- **Issue:** The plan's test template assigned `editorTabs.value = []` in `beforeEach`. But `editorTabs` is a `computed` (line 150 in unified-tab-bar.tsx) — its `.value` has no setter. Runtime threw `TypeError: Cannot set property value of [object Object] which has only a getter`.
- **Fix:** Import `setProjectEditorTabs` from unified-tab-bar and use `setProjectEditorTabs([])` in the test `beforeEach` and inside the `closeSubScope` implementation. `editorTabs` import removed from test file since only the setter was needed.
- **Files modified:** `src/components/sub-scope-pane.test.ts`, `src/components/sub-scope-pane.tsx`
- **Commit:** ebbb0db (test), 9d49122 (implementation)

**2. [Rule 3 — Blocking] unified-tab-bar cannot directly import closeSubScope from sub-scope-pane**
- **Found during:** Task 2 implementation.
- **Issue:** Existing pattern in unified-tab-bar.tsx imports `spawnSubScopeForZone`/`getActiveSubScopesForZone` from `./main-panel` (which re-exports from sub-scope-pane). Following the same pattern requires main-panel to re-export `closeSubScope` as well.
- **Fix:** Added `closeSubScope` to main-panel.tsx's re-export list and imported it in unified-tab-bar.tsx via `realCloseSubScope` alias, wrapped by a local `closeSubScope(zone, index)` pass-through (matching the existing `spawnSubScopeForZone` wrapper pattern).
- **Files modified:** `src/components/main-panel.tsx`, `src/components/unified-tab-bar.tsx`
- **Commit:** 9d49122

**3. [Rule 1 — Bug symmetrization] `_activateEditorTab` main-scope path missed scope activeTabId write**
- **Found during:** Task 2 — analyzing the file-tree first-open bug.
- **Issue:** The plan instructed to set `activeUnifiedTabId.value = newTabId` in file-tree.tsx's click handler after `openEditorTab`. But `openEditorTab` → `_activateEditorTab` already writes `activeUnifiedTabId`. The real root cause was `_activateEditorTab`'s asymmetric branching: only the right-scope path wrote the scope's own `activeTabId`. SubScopePane reads the scope's `activeTabId`, so main-scope tabs opened programmatically stayed invisible.
- **Fix:** Added an `else` branch in `_activateEditorTab` that writes `getTerminalScope(scope).activeTabId.value = tab.id` for non-right scopes. This is a more targeted fix than wrapping every file-tree callsite, and it benefits every programmatic open path (preview replacement, pinned opens, migration, etc.) uniformly.
- **Files modified:** `src/components/unified-tab-bar.tsx`
- **Commit:** 9d49122

## Success Criteria

- [x] closeSubScope migrates tabs + singletons without losing work (tests 1, 2, 3 pass)
- [x] Close-split button visible only for non-first sub-scopes (`idx === 0 → return null`)
- [x] Scope-0 (main-0, right-0) cannot be closed (test 4 pass — early return on index === 0)
- [x] First-click file-tree activates new tab so body renders immediately (_activateEditorTab fix)

## Hand-off Note for Plan 22-11

22-10 closes UAT test 18 (close/merge split without losing work) and the
gap 1 first-click sub-issue. 22-11 continues on Wave 3 with further
tab-bar / sub-scope-pane polish — note that this plan touched
`_activateEditorTab` (which 22-11 may also need to audit if it introduces
new activation paths). The `closeSubScope` helper is stable and can be
called from any future UI (context menu, keyboard shortcut, etc.).

## Self-Check: PASSED

Files verified present:
- `src/components/sub-scope-pane.tsx` — FOUND (closeSubScope export)
- `src/components/sub-scope-pane.test.ts` — FOUND (5 new closeSubScope tests)
- `src/components/unified-tab-bar.tsx` — FOUND (X import, wrapper, button JSX, _activateEditorTab else branch)
- `src/components/main-panel.tsx` — FOUND (closeSubScope re-export)
- `src/styles/app.css` — FOUND (.tab-bar-close-split-icon)

Commits verified present via `git log --oneline -3`:
- `ebbb0db test(22-10): RED tests for closeSubScope helper` — FOUND
- `9d49122 feat(22-10): closeSubScope helper + close-split button + first-open file-tree activation` — FOUND
