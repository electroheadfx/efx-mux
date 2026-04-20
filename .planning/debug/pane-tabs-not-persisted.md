---
status: resolved
trigger: File tabs opened in split panes not persisted across app restart
created: 2026-04-20
updated: 2026-04-20
---

# Debug: Pane Tabs Not Persisted

## Symptoms

- **Expected**: File tabs dispatched to different panes should persist when app restarts
- **Actual**: File tabs are lost when reopening the app - panes exist but tabs are gone
- **Timeline**: Started after Phase 22 (dynamic tabs, vertical splits, preferences)
- **Errors**: No console errors visible
- **Storage**: Per-project state in `editor-tabs:<project>` session key

## Current Focus

- hypothesis: restoreEditorTabs does not properly restore ownerScope for non-right-0 scopes
- test: verified in code review
- expecting: tabs in main-1, main-2, right-1, right-2 should be restored to their original scopes
- next_action: fixed
- reasoning_checkpoint: Code analysis confirms the bug

## Evidence

- timestamp: 2026-04-20T10:00:00
  source: src/components/unified-tab-bar.tsx lines 626-643
  finding: restoreEditorTabs has two critical bugs in scope restoration
  
  Bug 1: Only right-* scopes are handled (line 627)
  ```typescript
  if (restoredScope.startsWith('right-')) {
  ```
  Tabs originally in main-1 or main-2 are never re-routed from openEditorTab's default (main-0).
  
  Bug 2: All right-* scopes are mapped to right-0 (line 631)
  ```typescript
  t.id === opened.id ? { ...t, ownerScope: 'right-0' as const } : t,
  ```
  Tabs originally in right-1 or right-2 are incorrectly restored to right-0.

- timestamp: 2026-04-20T10:05:00
  source: src/components/unified-tab-bar.tsx lines 550-558
  finding: persistEditorTabs correctly saves the exact ownerScope (main-1, right-2, etc.)
  The persistence side is correct; only the restore logic is broken.

- timestamp: 2026-04-20T10:10:00
  source: src/components/unified-tab-bar.tsx lines 634-641
  finding: The scoped tab order is also hardcoded to main-0 and right-0
  ```typescript
  setScopedTabOrder('main-0', getScopedTabOrder('main-0').filter(...));
  setScopedTabOrder('right-0', [...getScopedTabOrder('right-0')...opened.id]);
  ```

## Eliminated

- GSD tab persistence: Works correctly via restoreGsdTab (preserves owningScope)
- File tree tab persistence: Works correctly via restoreFileTreeTabs (preserves ownerScope)
- Terminal tab persistence: Works correctly via restoreProjectTabsScoped (per-scope keys)
- Git changes tab persistence: Works correctly via restoreGitChangesTab (preserves owningScope)

## Resolution

- root_cause: restoreEditorTabs in unified-tab-bar.tsx only handles right-* scopes and hardcodes them to right-0. Tabs in main-1, main-2, right-1, or right-2 are not restored to their correct scopes.
- fix: Updated restoreEditorTabs to:
  1. Handle all non-main-0 scopes (main-1, main-2, right-0, right-1, right-2)
  2. Preserve the exact persisted ownerScope instead of hardcoding right-0
  3. Update scoped tab order for the actual restored scope
- verification: Open files in different split panes, quit app, reopen - tabs should appear in their original panes
- files_changed: [src/components/unified-tab-bar.tsx]

## Fixes Applied

### Fix 1: Tab scope restoration (initial fix)
Changed lines 623-645: Handle all non-main-0 scopes and preserve exact persisted `ownerScope`.

### Fix 2: Per-scope active tab persistence
Added `activeFilePathPerScope` to persistence (lines 580-600):
- Persist: Record which file is active in each scope
- Restore: Set per-scope `activeTabId` by matching file paths

### Fix 3: Handle undefined ownerScope (legacy tabs)
Added `?? 'main-0'` fallback in persist/restore scope matching.

### Fix 4: Preserve active editor when terminal selected
When clicking a terminal tab, preserve prior `activeFilePathPerScope[scope]` value instead of losing it.

All fixes in `src/components/unified-tab-bar.tsx`. TypeScript passes. Verified working.
