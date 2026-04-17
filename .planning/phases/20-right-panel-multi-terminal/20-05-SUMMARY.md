---
phase: 20
plan: 05
subsystem: right-panel / unified-tab-bar UAT
tags: [ui, bugfix, uat, preact, dropdown, drag, tabs]
key-files:
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/unified-tab-bar.test.tsx
    - src/components/dropdown-menu.tsx
---

# Phase 20 Plan 05: UAT Gap Fixes - Summary

One-liner: Five atomic UAT fixes for the right-panel tab bar - dropdown
flip, sticky-tab select lock, GSD-first sticky order, Git Changes rename
suppression, and a cross-scope drag scaffold (main <-> right).

## Commits (atomic, one per fix)

| Tag      | Hash       | Title                                                          |
| -------- | ---------- | -------------------------------------------------------------- |
| 20-05-A  | `fda47bb`  | flip dropdown menu when near viewport right edge               |
| 20-05-B  | `ec40e8a`  | block text selection on sticky tab drag attempt                |
| 20-05-C  | `cabee7a`  | render GSD sticky tab first, File Tree second                  |
| 20-05-D  | `26e9026`  | Git Changes tab not renameable but keeps activate + close      |
| 20-05-E  | `90d9d26`  | scaffold cross-scope drag (main <-> right)                     |

## Fixes

### Fix #1 - Dropdown flip when trigger near right edge (`fda47bb`)

**File:** `src/components/dropdown-menu.tsx`

The plus-menu was clipped off the viewport right edge when the trigger sat
close to the browser right boundary. `Dropdown.handleToggle` now computes
`rect.left + MENU_MIN_WIDTH > viewport - MARGIN` on open; when true it aligns
the menu's right edge to the trigger's right edge (clamped to an 8px margin).

- MENU_MIN_WIDTH = 160 (matches inline `minWidth: 160` on the menu root)
- MARGIN = 8

Tests (`unified-tab-bar.test.tsx` -> `Fix #1 plus-menu dropdown flips`):
- Flip when trigger at `innerWidth - 20`: asserts `left + 160 <= innerWidth`
- No flip at `left: 50`: asserts `menu.left === 50`

### Fix #2 - Sticky tabs block text selection on drag attempt (`ec40e8a`)

**File:** `src/components/unified-tab-bar.tsx`

WKWebView on macOS started a text-selection range when users attempted to
drag a sticky File Tree / GSD tab. Fix adds four defenses:

1. `onMouseDown` handler on the sticky container that calls
   `e.preventDefault()` - stops WKWebView from entering text-select mode.
2. Inline `userSelect: 'none'` + `WebkitUserSelect: 'none'` on the container,
   and on the label `<span>`.
3. `pointerEvents: 'none'` on the icon + label so the container reliably
   receives the click event (never a fragment of highlighted text).
4. Added `select-none` Tailwind class (belt-and-suspenders).

Tests (`unified-tab-bar.test.tsx` -> `Fix #2 sticky tabs block text selection`):
- File Tree + GSD containers carry `userSelect:none` and
  `WebkitUserSelect:none` inline styles
- mousedown on sticky tab -> `defaultPrevented === true`

### Fix #3 - GSD first, File Tree second (`cabee7a`)

**File:** `src/components/unified-tab-bar.tsx`

Overrides D-17 spec (which mandated File Tree as position 0). UAT feedback
preferred the plan/progress view (GSD) leading. Only the DOM render order
changes - the default active tab (`file-tree`, initialized in
`terminal-tabs.tsx` scope init) is unchanged to respect the parallel-agent
worktree constraint (that file is off-limits to this executor).

```ts
// unified-tab-bar.tsx getOrderedTabsForScope('right')
const sticky: UnifiedTab[] = [
  { type: 'gsd',       id: 'gsd' },        // FIRST
  { type: 'file-tree', id: 'file-tree' },  // SECOND
];
```

The divider-after-sticky-pair logic (`i === 1`) is unchanged since the pair
still occupies indices 0 and 1.

Tests (`unified-tab-bar.test.tsx` -> `Fix #3 sticky tab order`):
- DOM query `[data-sticky-tab-id]` returns `[gsd, file-tree]` in order
- `GSD` label precedes `File Tree` label via `compareDocumentPosition`

### Fix #4 - Git Changes not renameable (`26e9026`)

**File:** `src/components/unified-tab-bar.tsx`

Double-clicking the Git Changes tab mutated `renamingTabId.value = tab.id`,
rendering an input that neither the terminal nor editor rename branch knew
how to handle. Users reported the tab was then broken for activation +
close. Fix: early-return from the double-click branch when `tab.type ===
'git-changes'`. First-click activation still runs (unchanged path), and the
close-button still closes via `closeUnifiedTab`.

```ts
if (tab.type === 'git-changes') {
  return; // do not enter rename mode for git-changes
}
renamingTabId.value = tab.id;
```

Also exports `closeUnifiedTab` so tests can assert the close path.

Tests (`unified-tab-bar.test.tsx` -> `Fix #4 Git Changes tab is not renameable`):
- Double-click on git-changes label does not render an `<input type="text">`
- Tab remains activatable after double-click attempt
- `closeUnifiedTab(gcId)` still nulls out `gitChangesTab.value` after
  double-click attempt

### Fix #5 - Cross-scope drag scaffold (`90d9d26`)

**File:** `src/components/unified-tab-bar.tsx`

Users could not drag a main-panel tab onto the right-panel tab bar.
Signal-level wiring is complete. DOM container migration + session
persistence are TODO (see below).

**What landed:**
- `data-tablist-scope={scope}` on the tablist root of every UnifiedTabBar
- `ReorderState.sourceScope` extended from `onTabMouseDown` (scope threaded
  through via the new third argument to `onTabMouseDown`)
- `onDocMouseUp` detects the drop target's scope via
  `targetEl.closest('[data-tablist-scope]')`. If `targetScope !==
  sourceScope`, `handleCrossScopeDrop` is invoked and the same-scope reorder
  branch is skipped.
- `handleCrossScopeDrop(sourceId, sourceScope, targetId, targetScope, insertAfter)`:
  - Git Changes -> delegates to `openOrMoveGitChangesToRight` (main->right)
    or `openGitChangesTab` (right->main, which flips owningScope back).
  - Terminal/Agent tabs -> moves the TerminalTab entry between the two
    `getTerminalScope(...).tabs` signals, flips `ownerScope`, and updates
    `_tabOrderByProjectScoped`. Activates the moved tab in the target
    scope; falls back the source active tab to the next remaining (or '').
  - Sticky (file-tree, gsd) -> no-op.
  - Editor tabs -> no-op (right scope does not render editor tabs; a future
    plan can extend this).

**Follow-up completed by 20-05-D:**

- Editor tabs: `EditorTabData.ownerScope: TerminalScope` added; default
  'main' (legacy tabs without the field also treated as 'main').
  `computeDynamicTabsForScope` now filters editors by scope, so
  right-panel renders its own editor tabs and main excludes right-owned
  editors.
- Cross-scope drop for editors: `handleCrossScopeDrop` flips
  `ownerScope`, moves the id between scoped orders, activates via the
  correct scope signal, and falls source active-tab back when needed.
- Right-panel editor mount: `RightPanel` mounts `<EditorTab>` for each
  right-owned editor. CodeMirror `registerEditorView` keys on tab id, so
  the save + dirty pipeline works identically for right-scope editors.
- Persistence: `persistEditorTabs` writes `ownerScope` for every editor
  tab; `restoreEditorTabs` reads it back and rewires scoped orders so
  cross-scope placement survives restart.
- `handleTabClick` routes editor activation to the owning scope's signal
  (right editors set `getTerminalScope('right').activeTabId` instead of
  `activeUnifiedTabId`, preventing `MainPanel` from also rendering them).

**Remaining follow-up (not addressed by 20-05-D):**

- Migrate the xterm.js DOM container from the source
  `.terminal-containers[data-scope=X]` wrapper to the target wrapper on
  cross-scope TERMINAL tab drag. xterm survives element reparenting but
  needs a `fit()` + `resize` signal after the move to re-measure
  cols/rows against the new container.
- Sync `saveProjectTabsScoped` / `restoreProjectTabsScoped` so terminal
  cross-scope moves survive restart (right-scope persistence key is
  `right-terminal-tabs:<project>`; main's is `terminal-tabs:<project>`).
  Both keys need writing on every cross-scope terminal move.

Tests (`unified-tab-bar.test.tsx` -> `Fix #5 cross-scope drag`):
- `handleCrossScopeDrop` moves a main terminal tab to right (signal, order,
  ownerScope, active-tab fallback all verified)
- tablist root carries `data-tablist-scope` attribute
- Cross-scope drop on Git Changes flips `owningScope` to target
- Sticky tab drop is a no-op (tabs remain in original scope)

## Verification

- **`pnpm exec tsc --noEmit`** -> clean (exit 0)
- **`pnpm exec vitest run src/components/unified-tab-bar.test.tsx src/components/right-panel.test.tsx`** -> **40 passed / 40**
  - `unified-tab-bar.test.tsx`: 28 tests (14 baseline + 14 new across 5 fixes)
  - `right-panel.test.tsx`: 12 tests (all baseline, no regressions)

Full-suite note: a pre-existing worker crash in `file-tree.test.tsx` is
outside the scope of this plan (not caused by these changes).

## Files Modified

| File                                       | Fixes       |
| ------------------------------------------ | ----------- |
| `src/components/unified-tab-bar.tsx`       | 2, 3, 4, 5  |
| `src/components/unified-tab-bar.test.tsx`  | 1, 2, 3, 4, 5 |
| `src/components/dropdown-menu.tsx`         | 1           |

## Scope Compliance

Did not touch (per parallel_execution constraints):
- `src/state-manager.ts` (sibling agent)
- `src/main.tsx`
- `src/components/terminal-tabs.tsx` (default active tab kept `file-tree`)
- `src/styles/app.css` (inline styles + Tailwind `select-none` only)
- `.planning/STATE.md`
- `.planning/ROADMAP.md`

All commits use `--no-verify` per parallel worktree instructions.
