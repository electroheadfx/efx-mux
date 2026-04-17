---
phase: 20
plan: 02
subsystem: preact-ui-tabs
tags: [preact, ui, refactor, tabs, unified-tab-bar, scope, sticky-tabs]
requires:
  - 20-01 (terminal-tabs scope registry — stub seed provided here pending merge)
provides:
  - UnifiedTabBar scope='main' | 'right' prop
  - StickyTabData variant (file-tree, gsd)
  - GitChangesTabData.owningScope field
  - openOrMoveGitChangesToRight exported function
  - _tabOrderByProjectScoped per-scope tab order map
affects:
  - src/components/unified-tab-bar.tsx (+363/-21)
  - src/components/terminal-tabs.tsx (+65/-2 — stub seam for Plan 01)
  - src/components/main-panel.tsx (call site updated)
  - src/components/unified-tab-bar.test.tsx (+219 new)
tech-stack:
  added: []
  patterns:
    - scope-parametrized component prop
    - discriminated-union tab types with sticky variant
    - per-scope per-project tab-order map (two-level Map)
    - data-attribute partitioning for drag hit-test (data-tab-id vs data-sticky-tab-id)
key-files:
  created:
    - src/components/unified-tab-bar.test.tsx
    - .planning/phases/20-right-panel-multi-terminal/deferred-items.md
    - .planning/phases/20-right-panel-multi-terminal/20-02-SUMMARY.md
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/terminal-tabs.tsx
    - src/components/main-panel.tsx
decisions:
  - Seeded a minimal getTerminalScope stub in terminal-tabs.tsx so Plan 02
    compiles in parallel with Plan 01. The stub returns the existing main-scope
    signals/functions for scope='main' (zero behavior change) and independent
    empty signals + no-op lifecycle functions for scope='right'. When Plan 01
    merges, its richer implementation supersedes the stub.
  - owningScope defaults to 'main' (STRIDE T-20-04 mitigation); equality check
    uses === 'right' (not truthy) so any foreign value falls back to main-scope
    render.
  - Divider between sticky and dynamic segments renders only when right scope
    has at least one dynamic tab (visual clarity when empty vs populated).
metrics:
  duration: 15m 21s
  completed: 2026-04-17
  tasks: 2
  files_modified: 4
  tests_added: 14
  tests_passing: 262 (baseline was 248; +14 new, 11 pre-existing failures out of scope)
---

# Phase 20 Plan 02: UnifiedTabBar Scope Parametrization Summary

Refactored UnifiedTabBar from a scope-agnostic main-panel-only component into a
scope-parametrized (`scope: 'main' | 'right'`) tab bar with sticky-tab rendering,
scope-aware plus menu, and Git Changes cross-panel handoff. The work is the UI
contract that Plan 20-04 (right-panel shell) consumes.

## Scope Prop Signature and Rendering Branches

```ts
export interface UnifiedTabBarProps { scope: TerminalScope; }
export function UnifiedTabBar({ scope }: UnifiedTabBarProps): VNode;
```

Two rendering branches inside `UnifiedTabBar`:

- `scope === 'main'` — dynamic-only tab list from `computeDynamicTabsForScope('main')`.
  Preserves every Phase 17 behavior: terminal tabs, editor tabs, Git Changes tab
  (when `owningScope === 'main'`). No sticky tabs, no divider.
- `scope === 'right'` — sticky pair `[file-tree, gsd]` prepended to the dynamic
  right-scope list. Dynamic sources: right-scope terminal/agent tabs via
  `getTerminalScope('right').tabs.value`, plus the Git Changes tab when
  `owningScope === 'right'`. A 1px vertical divider renders between the sticky
  pair and the dynamic segment when at least one dynamic tab is present.

Active-tab indicator for right scope reads from `getTerminalScope('right').activeTabId`,
so clicking a sticky File Tree / GSD tab updates the right-panel content switch signal.

## Sticky Tab Rendering Contract

Rendered by `renderTab` when `tab.type === 'file-tree' | 'gsd'`:

- Icon: `FolderOpen` (File Tree) or `ListChecks` (GSD), size 14, color =
  `colors.accent` when active, `colors.textMuted` when inactive.
- Label: "File Tree" or "GSD" (`11px`, `Geist sans`, weight 400 inactive / 600 active).
- Active underline: `2px solid colors.accent`, else transparent.
- Wrapper attribute: `data-sticky-tab-id={'file-tree'|'gsd'}` — critically NOT
  `data-tab-id`, so `onDocMouseMove` / `onDocMouseUp` hit-tests that query
  `[data-tab-id]` never target sticky tabs (Pitfall 7 enforcement).
- No close `×` button rendered.
- No `onDblClick` rename handler.

`onTabMouseDown` also early-returns for `tabId === 'file-tree' || tabId === 'gsd'`
as defence-in-depth.

## openOrMoveGitChangesToRight — Move-vs-Create Branches

```ts
export function openOrMoveGitChangesToRight(): void
```

Three mutually exclusive branches on the incoming `gitChangesTab.value`:

1. **Already owned by right** — activate it (`rightScope.activeTabId.value = existing.id`),
   no mutation of `gitChangesTab` or tabOrder. Idempotent.
2. **Owned by main** — flip `owningScope` to `'right'` on the existing record
   (same id, no duplication per Pitfall 3), remove id from main scope tab-order
   (`removeFromMainTabOrder`), append to right scope tab-order
   (`appendToRightTabOrder`). Set `rightScope.activeTabId.value = existing.id`.
   Main active-tab fallback: first remaining main dynamic tab, else `''`.
3. **Not yet open** — create a new `GitChangesTabData` with
   `owningScope: 'right'` and id `git-changes-${Date.now()}`, append to right
   tabOrder, activate.

`openGitChangesTab` (pre-existing entry for main-scope Git Changes) was also
updated: sets `owningScope: 'main'` when creating; if existing tab is owned
by right, flips back to main (symmetrical handoff).

## `_tabOrderByProjectScoped` Structure

```ts
signal<Map<TerminalScope, Map<string, string[]>>>
// outer key: 'main' | 'right'
// inner key: projectName
// value: string[] of dynamic tab IDs (terminals, editors, git-changes).
```

**Invariant (D-03):** sticky IDs `'file-tree'` and `'gsd'` NEVER appear in
any inner array. Enforced at the write boundary in `setScopedTabOrder`, which
filters any sticky ids before persisting:

```ts
const clean = order.filter(id => id !== 'file-tree' && id !== 'gsd');
```

This means drag-reorder can only shuffle dynamic tabs among themselves; no
codepath can ever persist a sticky id into the order array.

Helpers for the git-changes handoff:

- `removeFromMainTabOrder(id)` — filters id out of main's array.
- `appendToRightTabOrder(id)` — pushes id to right's array if not already present.

## Test File

- **Path:** `src/components/unified-tab-bar.test.tsx`
- **Line count:** 219 lines
- **`it()` count:** 14 tests (plan requires >= 10)
- **Coverage:**
  - D-05 sticky render: 4 tests (labels, no close button, scope='main' has none, data-sticky-tab-id partition)
  - D-06 plus-menu: 3 tests (right items, main items preserved, disabled when owned)
  - D-07 Git Changes handoff: 5 tests (flip, no-duplicate, Pitfall 3, idempotent, create-new)
  - D-03 drag reject: 2 tests (sticky ids absent from data-tab-id, sticky carries data-sticky-tab-id only)
- **Result:** `Test Files 1 passed (1) / Tests 14 passed (14)`
- **Full suite:** 262 passed (14 new, +0 net regressions; 11 pre-existing failures in
  `git-control-tab.test.tsx` and `sidebar.test.tsx` verified pre-existing via
  `git stash` baseline run — documented in `deferred-items.md`).

## Main-Panel Call-Site Update

`src/components/main-panel.tsx:23` — `<UnifiedTabBar />` → `<UnifiedTabBar scope="main" />`.
`grep -rn "<UnifiedTabBar" src/ --include="*.tsx"` confirms only one call site exists.

## Deviations from Plan

### Rule 3 — Auto-fixed blocking issue

**1. [Rule 3 — Blocker] Seeded getTerminalScope stub in terminal-tabs.tsx**
- **Found during:** Task 1 (import resolution)
- **Issue:** Plan 20-02 imports `getTerminalScope` + `TerminalScope` from
  `./terminal-tabs`, but Plan 20-01 (which creates those exports) is running
  in a parallel worktree — its changes are not yet merged here.
- **Fix:** Added a minimal `TerminalScopeHandle` interface + `getTerminalScope`
  function at the tail of `terminal-tabs.tsx` that matches Plan 01's documented
  public contract exactly. For `scope='main'` it returns the existing
  module-level signals and functions (zero behavior change). For `scope='right'`
  it returns independent empty signals and no-op lifecycle stubs. When Plan 01
  lands, merge will prefer Plan 01's richer registry (same export name, same
  shape), so no merge conflict logic is required in consumer code.
- **Files modified:** `src/components/terminal-tabs.tsx` (+65 lines at tail + 1 import line)
- **Commit:** `365edbe`

### Pre-existing failures not caused by Plan 02

- `git-control-tab.test.tsx` (9 failures) and `sidebar.test.tsx` (2 failures)
  are failing on baseline `51175d4`, unrelated to Phase 20 files.
  Verified via `git stash` + baseline run. Logged to
  `.planning/phases/20-right-panel-multi-terminal/deferred-items.md`.

## Acceptance Criteria Verification

**Task 1:**
- `grep -n "export interface UnifiedTabBarProps"` → match at line 32
- `grep -n "scope: TerminalScope"` → 9 matches
- `grep -n "owningScope"` → 13 matches (plan requires >= 3)
- `grep -n "type: 'file-tree'|'gsd'"` → matches at 59, 825, 826
- `grep -n "FolderOpen|ListChecks"` → matches at 11, 1194
- `grep -n "openOrMoveGitChangesToRight"` → 2 matches (declaration + dropdown item usage)
- `grep -n "data-sticky-tab-id"` → matches at 1191, 1202
- `grep -n "<UnifiedTabBar scope=\"main\""` in main-panel.tsx → match at 23
- `pnpm exec tsc --noEmit` → exits 0

**Task 2:**
- File exists: `src/components/unified-tab-bar.test.tsx` (219 lines)
- `grep -c "^\s*it("` → 14 (plan requires >= 10)
- `grep -c "scope=\"right\"|scope=\"main\""` → 10 matches
- `grep -c "owningScope"` → 9 matches (plan requires >= 3)
- `grep -c "openOrMoveGitChangesToRight"` → 11 matches (plan requires >= 2)
- `grep -c "File Tree|GSD"` → 8 matches
- `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` → all 14 green

## Threat Flags

None. The threat model `mitigate` dispositions (T-20-04 owningScope hardening,
T-20-05 data-attribute partitioning) are implemented as documented:

- `owningScope` equality check uses `=== 'right'` / `=== 'main'`, not truthy.
  Foreign values fall through to main-scope render (default behavior).
- `data-sticky-tab-id` is exclusive to sticky tabs; `data-tab-id` is exclusive
  to dynamic tabs. `setScopedTabOrder` defensively strips any sticky ids
  before persisting.

No new security-relevant surface introduced.

## Self-Check: PASSED

All created/modified files verified:
- `src/components/unified-tab-bar.tsx` — FOUND (modified, 1444 lines)
- `src/components/unified-tab-bar.test.tsx` — FOUND (created, 219 lines)
- `src/components/terminal-tabs.tsx` — FOUND (modified, 819 lines)
- `src/components/main-panel.tsx` — FOUND (modified, 70 lines)
- `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` — FOUND

All commits verified in git log:
- `365edbe` feat(20-02): scope-parametrize UnifiedTabBar with sticky tabs and git-changes handoff
- `39c190c` test(20-02): add unified-tab-bar tests for scope prop, sticky tabs, plus-menu, and git-changes handoff
