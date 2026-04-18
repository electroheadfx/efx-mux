---
phase: 22-dynamic-tabs-vertical-split-and-preferences-modal
plan: 04
subsystem: ui
tags: [ts, tauri, preact, signals, split-pane, resize]

# Dependency graph
requires:
  - phase: 22-01
    provides: "TerminalScope type + getTerminalScope registry + per-scope PTY isolation"
  - phase: 22-02
    provides: "Preferences button + togglePreferences signal"
  - phase: 22-03
    provides: "UnifiedTabBar with split icon button + openOrMoveSingletonToScope + fileTreeTabs signal"
provides:
  - spawnSubScopeForZone(zone) / getActiveSubScopesForZone(zone) consumed by UnifiedTabBar split icon
  - N-sub-scope layout in main-panel and right-panel (1..3 stacked per zone)
  - SubScopePane always-mounts bodies (xterm WebGL + GSDPane + CodeMirror preserved)
  - attachIntraZoneHandles(zone) for intra-zone .split-handle-h-intra drag handles
  - D-02 first-launch defaults (main-0 Terminal-1, right-0 GSD + File Tree)
  - Phase 22 CSS classes: .split-handle-h-intra, .scope-empty-placeholder, .drop-target, .tab-bar-split-icon
affects: [22-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SubScopePane as shared component between main-panel and right-panel"
    - "Zone type ('main' | 'right') separate from TerminalScope for sub-scope management"
    - "attachIntraZoneHandles idempotent via dataset.dragInit gate"

key-files:
  created:
    - src/components/sub-scope-pane.tsx — shared state + SubScopePane component
    - src/components/main-panel.test.tsx — 6 tests for split spawning + empty state
    - src/drag-manager.test.ts — 2 tests for intra-zone handle registration
  modified:
    - src/components/main-panel.tsx — N-sub-scope render (was single-scope 75 lines)
    - src/components/right-panel.tsx — N-sub-scope render (was single-scope 116 lines)
    - src/components/unified-tab-bar.tsx — stubs replaced with real imports from main-panel
    - src/drag-manager.ts — attachIntraZoneHandles exported
    - src/styles/app.css — 4 Phase 22 CSS classes added
    - src/main.tsx — restoreActiveSubScopes() + D-02 right-0 seeding

key-decisions:
  - "Zone type ('main' | 'right') vs TerminalScope ('main-0'..'main-2', 'right-0'..'right-2'): zone is the split-group key; TerminalScope is the per-scope id"
  - "Shared state lives in sub-scope-pane.tsx to avoid circular imports between main-panel and right-panel"
  - "SubScopePane calls attachIntraZoneHandles(zone) in useEffect — handles registered on mount and re-registered when scope count changes"
  - "unified-tab-bar.tsx uses local type-adapter wrappers (main-0→main mapping) rather than changing the UnifiedTabBar's zone type contract"

patterns-established:
  - "Pattern: attachIntraZoneHandles uses dataset.dragInit as idempotency gate — safe to call multiple times"
  - "Pattern: always-mount bodies with display:none toggle preserves xterm WebGL + CodeMirror state"
  - "Pattern: split ratio stored as CSS custom property --${zone}-split-${i}-pct and persisted to state.layout"

requirements-completed: [SPLIT-01, SPLIT-02, TABS-01]

# Metrics
duration: 21min
completed: 2026-04-18T20:31:00Z
---

# Phase 22 Plan 04: N-Sub-Scope Layout Summary

**N-sub-scope layout with vertical split panes, intra-zone resize, and first-launch defaults**

## Performance

- **Duration:** 21 min
- **Started:** 2026-04-18T18:09:02Z
- **Completed:** 2026-04-18T20:31:00Z
- **Tasks:** 3
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- Generalized main-panel.tsx and right-panel.tsx from single-scope to N-sub-scope (1..3 stacked)
- SubScopePane shared component renders tab bar + always-mounted body stack per scope
- spawnSubScopeForZone / getActiveSubScopesForZone exported and wired to UnifiedTabBar split icon
- attachIntraZoneHandles registered on SubScopePane mount; persists split ratios via updateLayout
- D-02 first-launch defaults: main-0 gets Terminal-1, right-0 gets GSD + File Tree as dynamic tabs
- 4 Phase 22 CSS classes added: .split-handle-h-intra, .scope-empty-placeholder, .drop-target, .tab-bar-split-icon

## Task Commits

1. **Task 1: Wave 0 — Author failing tests** - `ffc04c3` (test)
2. **Task 2: CSS classes + attachIntraZoneHandles** - `5cff4f5` (feat)
3. **Task 3: N-sub-scope layout rewrite** - `2c406dc` (feat)

**Plan metadata:** `2c406dc` (docs: complete plan)

## Files Created/Modified

- `src/components/sub-scope-pane.tsx` - Shared state (activeMainSubScopes, activeRightSubScopes, spawnSubScopeForZone, etc.) + SubScopePane component
- `src/components/main-panel.tsx` - Re-exports shared helpers, renders N SubScopePanes with .split-handle-h-intra handles
- `src/components/right-panel.tsx` - Renders N SubScopePanes from activeRightSubScopes
- `src/components/unified-tab-bar.tsx` - Stubs replaced with real imports from main-panel (with type mapping)
- `src/drag-manager.ts` - attachIntraZoneHandles exported
- `src/styles/app.css` - .split-handle-h-intra, .scope-empty-placeholder, .drop-target, .tab-bar-split-icon added
- `src/main.tsx` - restoreActiveSubScopes() call + D-02 right-0 default seeding
- `src/components/main-panel.test.tsx` - 6 tests (split cap, ordering, persistence, empty state)
- `src/drag-manager.test.ts` - 2 tests (registration, idempotent re-init)

## Decisions Made

- Zone type (`'main' | 'right'`) is separate from TerminalScope — zone groups sub-scopes for split purposes; TerminalScope identifies individual panes
- Shared state lives in sub-scope-pane.tsx (not main-panel.tsx) to avoid circular imports since both panels need it
- SubScopePane calls attachIntraZoneHandles(zone) in useEffect — handles registered on mount and re-registered when scope count changes
- unified-tab-bar.tsx has local type-adapter wrappers that map `'main-0'` → `'main'` for spawnSubScopeForZone — avoids changing UnifiedTabBar's existing zone type contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing TS type errors in right-panel.test.tsx and unified-tab-bar.test.tsx**
- **Found during:** Task 3 verification
- **Issue:** right-panel.test.tsx passes `'right'` to getTerminalScope but TerminalScope type only accepts `'right-0'..'right-2'`; similar issues in unified-tab-bar.test.tsx for Phase 20 tests that predate the 6-scope expansion
- **Fix:** Not fixed — pre-existing, outside scope boundary. My N-sub-scope rewrite of right-panel.tsx uses the correct signal-based API and passes its own tests.
- **Verification:** Baseline (without my changes): 65 failures. With my changes: 65 failures. No new failures introduced.
- **Committed in:** N/A (pre-existing)

**2. [Rule 2 - Missing] createNewTabScoped did not exist in terminal-tabs.tsx**
- **Found during:** Task 1 test authoring
- **Issue:** main-panel.test.tsx imported createNewTabScoped but it doesn't exist — only createNewTab which takes CreateTabOptions
- **Fix:** Removed the non-existent import and simplified the test
- **Files modified:** src/components/main-panel.test.tsx
- **Verification:** Tests pass, TypeScript clean
- **Committed in:** ffc04c3

**3. [Rule 2 - Missing] restoreFileTreeTabs and restoreGsdTab not imported in main.tsx**
- **Found during:** Task 3 main.tsx wiring
- **Issue:** main.tsx needed to call restoreFileTreeTabs and restoreGsdTab but these weren't imported
- **Fix:** Added to unified-tab-bar imports in main.tsx
- **Files modified:** src/main.tsx
- **Verification:** TypeScript clean for new code
- **Committed in:** 2c406dc

---

**Total deviations:** 3 auto-fixed (2 missing imports, 1 pre-existing test failure acknowledged)
**Impact on plan:** All auto-fixes necessary for implementation. Pre-existing test failures are outside scope.

## Issues Encountered

- mockIPC in Vitest doesn't intercept invoke calls from state-manager.ts when module is already imported — worked around by spying on updateLayout directly rather than tracking save_state calls
- TypeScript type mismatch in unified-tab-bar.tsx: zone parameter typed as `'main-0' | 'right'` but main-panel expects `'main' | 'right'` — solved with local type-adapter wrappers (not stubs — they delegate to real implementation)

## Next Phase Readiness

- Plan 22-05 is the final plan in Phase 22 (preferences modal)
- Sub-scope state is properly isolated in sub-scope-pane.tsx with clean import contracts
- No blockers for next plan

---
*Phase: 22-dynamic-tabs-vertical-split-and-preferences-modal*
*Completed: 2026-04-18*
