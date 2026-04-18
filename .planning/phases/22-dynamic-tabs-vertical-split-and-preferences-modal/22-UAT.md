---
status: partial
phase: 22-dynamic-tabs-vertical-split-and-preferences-modal
source: [22-01-SUMMARY.md, 22-02-SUMMARY.md, 22-03-SUMMARY.md, 22-04-SUMMARY.md]
started: 2026-04-18T19:08:47Z
updated: 2026-04-18T20:00:00Z
---

## Current Test

[testing paused — 1 blocked item outstanding (test 13, resize-dependent)]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Efxmux dev instance. Launch app from scratch (pnpm tauri dev). App boots without errors, window renders, no console errors during bootstrap.
result: issue
reported: "I start with an error in console log: Unhandled Promise Rejection: Error: [efxmux] unknown terminal scope: right"
severity: blocker

### 2. First-Launch Defaults (New Project)
expected: Open a project that has never been opened before in Efxmux. Main panel shows a single terminal tab named "{project}" (Terminal-1 equivalent). Right panel shows two tabs: GSD and File Tree.
result: issue
reported: "Right sidebar empty — no GSD, no File Tree. Right panel already shows 2 split panes (both 'No tabs open'). User suspects split is stored globally not per-project. Console: 'Failed to restore right-scope tabs: Error: [efxmux] unknown terminal scope: right' at main.tsx:587 → getTerminalScope('right') in main.tsx:592."
severity: blocker

### 3. Titlebar Preferences Button Visible
expected: Look at titlebar right side. Settings (gear) icon button visible next to the add-tab (+) button. 18x18px size, matches titlebar aesthetic.
result: pass

### 4. Click Preferences Button
expected: Click the Settings gear button in titlebar. Preferences panel opens (modal or overlay).
result: pass

### 5. Cmd+, Opens Preferences
expected: With any focus, press Cmd+, keybind. Same preferences panel opens as clicking the button.
result: pass

### 6. Titlebar Drag Still Works
expected: Click and drag an empty area of the titlebar (not on a button). Window moves as expected — prefs button click does not hijack drag.
result: issue
reported: "User surfaced multiple tab/drag regressions (not titlebar drag itself): (a) clicking a file in file tree opens a tab but tab content doesn't update; (b) file tabs can't be reordered within a tab bar; (c) file tabs can't be moved to another empty pane; (d) if the vertical blue drop marker isn't visible, drop is rejected — should fall back to appending at last position."
severity: major

### 7. GSD Tab is Dynamic (Closeable)
expected: Hover over the GSD tab in the right panel. Close (×) button appears. GSD is no longer "sticky" — it renders as a regular dynamic tab.
result: issue
reported: "Behavior unpredictable. (a) Clicking + to add GSD tab — tab doesn't appear. (b) GSD tab renders with title 'Git Changes' instead of 'GSD'. (c) Can't move GSD to empty pane. (d) Can't move GSD freely between two panes. User asks: verify all the logic."
severity: major

### 8. File Tree Tab is Dynamic
expected: File Tree tab in right panel also shows close button on hover. Behaves like any other tab (draggable, closeable).
result: issue
reported: "FileTree can be added but not deleted (close does nothing). FileTree renders with title 'Git Changes' instead of 'File Tree' (same label-swap as test 7). FileTree is draggable but cannot be reordered between two terminal/TUI tabs or placed after them."
severity: major

### 9. Split Icon in Tab Bar
expected: Each tab bar (main panel and right panel) shows a split icon (Rows2, horizontal bars icon) on the right side. Visible and clickable.
result: issue
reported: "Split icon visible, can create/suppress panes, but (a) can't resize the split panes (no intra-zone drag handle working); (b) tab bar needs a subtle top border like the bottom — currently hard to distinguish bar from background; (c) split icon sits too close to right edge — needs small right margin."
severity: major

### 10. Split Creates Second Sub-Scope
expected: Click split icon on main panel tab bar. Main panel splits vertically into 2 stacked panes. Top pane keeps existing tabs; bottom pane is empty (placeholder) with its own tab bar.
result: pass

### 11. Split Cap at 3 Panes
expected: With main panel already split into 2 panes, click split icon again → 3 panes. Click split icon a 4th time → nothing happens (capped at 3 per zone).
result: pass

### 12. Intra-Zone Resize Handle
expected: Between the stacked split panes, a horizontal drag handle exists. Drag it up/down → panes resize proportionally.
result: issue
reported: "Resize confirmed broken. Also: handle zone has no top border line — hard to see the drag zone visually."
severity: major

### 13. Split Ratio Persists on Restart
expected: Resize split panes to a specific ratio (e.g. 70/30). Close app. Relaunch. Split ratio restored to 70/30.
result: blocked
blocked_by: prior-phase
reason: "Split count persists across restart (pane structure restored), but ratio persistence cannot be verified because resize handle is broken (tests 9 + 12). Re-test after resize is fixed."

### 14. Cross-Scope Drag of GSD Tab
expected: Drag GSD tab from right panel to main panel tab bar. GSD moves to main panel. Right panel no longer shows GSD.
result: issue
reported: "GSD tab (rendered with wrong 'Git Changes' title) is not draggable at all — attempting to drag triggers HTML text selection instead of a drag operation. Missing draggable=true or user-select:none on the singleton tab element."
severity: major

### 15. Shared Tab Counter (Sequential Names)
expected: Click + on main panel tab bar to spawn new terminals repeatedly. Session names increment sequentially per project: {project}, {project}-2, {project}-3, {project}-4 — not restarting per scope.
result: issue
reported: "(a) User deletes Terminal-2 and adds a new one — it's named Terminal-3 instead of reusing 2. Counter is monotonic but user expects gap-fill (design question). (b) + clicked in right panel or a split sub-scope still adds the new terminal to main-0 instead of the originating scope. createNewTab is not routing by the clicked tab bar's scope."
severity: major

### 16. Tab Counter Persists Across Restart
expected: Spawn tabs until counter hits e.g. {project}-4. Close app. Reopen. Spawn a new tab → it becomes {project}-5 (counter continues, does not restart).
result: issue
reported: "Tab persistence is broken end-to-end. (a) Newly added terminals are lost on restart. (b) Deletes are not persisted — deleted tabs reappear. (c) Deleting the last terminal then restarting auto-recreates a terminal. The persistence layer is not saving the scope-suffixed tab lists (terminal-tabs:<project>:<scope>) after add/delete."
severity: blocker

### 17. Legacy State Migration (Silent)
expected: Open a project whose stored state predates Phase 22 (legacy `terminal-tabs:<project>` key). App loads without errors, tabs appear in main-0, no UI glitches, no console errors about scope migration.
result: skipped
reason: No legacy state available to test

### 18. Split-Pane Bodies Preserve State
expected: In main panel, open an editor tab and scroll it. Split main panel. Original pane (top) preserves editor content + scroll position (xterm/CodeMirror always-mounted — no reload).
result: issue
reported: "(a) When no file tab was open, first file tree click opens a tab but content is blank — user has to re-click the tab in the bar to see content (same bug as test 6). (b) Cannot close/merge a split — there is no 'unsplit' control in the UI. User notes this was missed from Phase 22 specs; scroll-preservation couldn't be verified because splits can't be removed."
severity: major

## Summary

total: 18
passed: 5
issues: 11
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "User can close/merge a split pane; editor body state is preserved across split operations"
  status: failed
  reason: "User reported: no UI control to remove a split — once added, splits stick. Scroll-preservation assertion could not be tested because splits can't be closed. Close-split was missed from Phase 22 specs. Also: first file-tree click on an empty tab bar opens a tab with blank content — needs re-click (duplicate of test 6 issue a)."
  severity: major
  test: 18
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      issue: "no close-split / merge-pane button in tab bar for scopes with siblings"
    - path: "src/components/sub-scope-pane.tsx"
      issue: "no closeSubScope helper exposed"
  missing:
    - "Add 'close split' control on every non-first sub-scope pane (e.g. X on split icon, or right-click Close Split)"
    - "Wire closeSubScope(zone, index) — collapse pane, move its tabs to scope 0 or dispose them per UX decision"
    - "Fix empty-tab-bar first-open: activate newly-created tab so body renders without re-click"

- truth: "Tab add/delete persists across restart (tabs stay added, deletes stay deleted)"
  status: failed
  reason: "User reported: new terminals lost on restart; deletes not persisted; deleting last terminal then restarting auto-recreates a terminal. Scope-suffixed persistence (terminal-tabs:<project>:<scope>) not writing after mutation, or D-02 first-launch seeding runs on every launch."
  severity: blocker
  test: 16
  artifacts:
    - path: "src/components/terminal-tabs.tsx"
      issue: "add/delete paths may not call the scope-suffixed persist helper after updating tabs signal"
    - path: "src/main.tsx"
      issue: "D-02 first-launch seeding may be unconditional — should run only when no stored tabs exist for that scope"
    - path: "src/state-manager.ts"
      issue: "persistTabCounter / terminal-tabs:<project>:<scope> write path not triggered on mutation"
  missing:
    - "Persist scope-suffixed terminal-tabs key on every add/close"
    - "Gate D-02 first-launch defaults behind a 'first launch for this project' flag so deletes survive restart"
    - "Persist projectTabCounter on every allocateNextSessionName"

- truth: "+ click routes new terminal to the originating scope, not always main-0"
  status: failed
  reason: "User reported: Clicking + on right panel or a split sub-scope adds the new terminal to main-0 instead of the clicked tab bar's scope. Also: deleting Terminal-2 and adding a new one produces Terminal-3 (monotonic) — user expected gap-fill. Flag this as a design decision to confirm."
  severity: major
  test: 15
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      issue: "+ click handler likely hardcodes main-0 or doesn't receive/propagate clicked scope to createNewTab"
    - path: "src/components/terminal-tabs.tsx"
      issue: "createNewTab may ignore target scope parameter"
  missing:
    - "Route + click to create terminal in the originating scope (main-0/main-1/main-2/right-0/right-1/right-2)"
    - "Confirm design: is monotonic counter (no gap-fill) the intended behavior? If not, track max number currently in use per project instead"

- truth: "Split icon usable: split/unsplit works, panes resizable via intra-zone handle, tab bar visually distinct from background, split icon has right breathing room"
  status: failed
  reason: "User reported: (a) can split/suppress panes but resize handle does not work; (b) tab bar lacks a subtle top border — hard to distinguish from background (bottom border exists); (c) split icon too close to right edge, needs small right margin."
  severity: major
  test: 9
  artifacts:
    - path: "src/drag-manager.ts"
      issue: "attachIntraZoneHandles registration may not be binding or the dataset.dragInit idempotency gate short-circuits every call"
    - path: "src/styles/app.css"
      issue: ".tab-bar missing border-top; .tab-bar-split-icon lacks right margin/padding"
  missing:
    - "Fix attachIntraZoneHandles so .split-handle-h-intra actually resizes adjacent SubScopePanes"
    - "Add subtle border-top to .tab-bar matching the existing bottom border style"
    - "Add margin-right (or padding-right on tab-bar) so split icon isn't flush against right edge"

- truth: "File Tree tab: closeable, renders with 'File Tree' title, reorderable among terminal/TUI tabs"
  status: failed
  reason: "User reported: (a) FileTree can be added but NOT deleted (close button inactive); (b) FileTree renders title 'Git Changes' instead of 'File Tree' — same label-swap as test 7; (c) FileTree is draggable but cannot be reordered between or after two terminal tabs."
  severity: major
  test: 8
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      issue: "close handler for file-tree kind may be missing/short-circuited; label rendering swapped between file-tree and git-changes kinds; intra-tab-bar reorder excludes file-tree kind or requires strict neighbor-type match"
  missing:
    - "Wire close-button handler for file-tree kind (remove from fileTreeTabs signal)"
    - "Fix tab label: file-tree kind → 'File Tree' label (not 'Git Changes')"
    - "Allow file-tree tab to be reordered among terminal/TUI tabs within the same scope"

- truth: "GSD tab: opens via plus-menu, renders with 'GSD' title (not 'Git Changes'), and moves freely across panes"
  status: failed
  reason: "User reported: (a) + menu 'GSD' item doesn't actually spawn a GSD tab; (b) GSD tab displays title 'Git Changes' instead of 'GSD' (label mixup between the two singleton tab kinds); (c) GSD can't be dropped on empty pane; (d) GSD can't be moved freely between two sub-scope panes."
  severity: major
  test: 7
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      issue: "plus-menu 'GSD' item likely calls wrong helper or gsdTab singleton is pre-owned elsewhere; label swap between gsd and git-changes singletons; cross-scope drop for gsd kind not routing correctly to empty pane"
  missing:
    - "Verify plus-menu → openOrMoveSingletonToScope('gsd', scope) actually creates/moves the tab"
    - "Fix tab label rendering: gsd kind → 'GSD', git-changes kind → 'Git Changes'"
    - "Allow gsd cross-scope drop onto empty-pane placeholder (handleCrossScopeDrop branch for gsd kind)"
    - "Re-verify handleCrossScopeDrop routing for all singleton kinds (gsd, git-changes)"

- truth: "File-tree click opens file, tabs are reorderable, cross-pane drop works, and failed drops default to appending"
  status: failed
  reason: "User reported 4 sub-issues under test 6: (a) file-tree click opens tab but content doesn't update; (b) file tab cannot be reordered in its own tab bar; (c) file tab cannot be dragged to another empty pane; (d) if blue drop marker isn't visible, drop is rejected — should default to append-last."
  severity: major
  test: 6
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      issue: "drag/drop handlers reject when no insertion marker present — no fallback to append"
    - path: "src/components/file-tree.tsx"
      issue: "click-to-open path may not update active editor content signal"
  missing:
    - "Wire file-tree click to activate newly-opened file tab (set activeEditorTabId)"
    - "Enable intra-tab-bar reorder for editor/file tabs"
    - "Allow drop on empty-pane placeholder to append tab to that scope"
    - "Fallback: if drop indicator absent, append tab at end"

- truth: "App boots without errors or unhandled promise rejections during cold start"
  status: failed
  reason: "User reported: Unhandled Promise Rejection: Error: [efxmux] unknown terminal scope: right at main.tsx:592 → getTerminalScope('right') (terminal-tabs.tsx:790). Also: Failed to restore right-scope tabs warning at main.tsx:587."
  severity: blocker
  test: 1
  artifacts:
    - path: "src/main.tsx"
      issue: "lines 587-592 call getTerminalScope('right') — legacy scope id not migrated to 'right-0'"
  missing: []

- truth: "First-launch defaults: main-0 has Terminal-1; right-0 shows GSD + File Tree"
  status: failed
  reason: "User reported: Right sidebar empty (no GSD, no File Tree). Right panel already shows 2 split panes — split appears stored globally not per-project. Restore path threw 'unknown terminal scope: right' so D-02 seeding was skipped."
  severity: blocker
  test: 2
  artifacts:
    - path: "src/main.tsx"
      issue: "D-02 right-0 GSD+FileTree seeding not reached (prior throw); likely gated behind right-scope restore that fails"
    - path: "src/components/sub-scope-pane.tsx"
      issue: "activeRightSubScopes / activeMainSubScopes split ratios persisted globally rather than scoped to project key"
  missing:
    - "Make split-sub-scope persistence per-project (key on project path like terminal-tabs)"
    - "Ensure D-02 first-launch defaults run even if legacy right-scope restore throws"
