---
status: complete
phase: 17-main-panel-file-tabs
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md
started: 2026-04-15T18:00:00Z
updated: 2026-04-15T18:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Open File in Editor Tab
expected: Click a file in the file tree. An editor tab opens in the main panel with the file content displayed in CodeMirror 6 with syntax highlighting (colors matching Solarized Dark theme).
result: issue
reported: "Main layout broken — all 3 pane containers rendered simultaneously with flex:1. File showed in wrong pane. Empty area showed 'No git changes tab open' message."
severity: blocker
fix_applied: Rewrote main-panel.tsx to show only active tab's content via display toggling. Removed broken pane drag-and-drop infrastructure.

### 2. One-Tab-Per-File
expected: Click the same file again in the file tree. No duplicate tab opens — the existing editor tab for that file is focused instead.
result: pass

### 3. Dirty Indicator (Yellow Dot)
expected: Edit text in an open editor tab. A yellow dot appears on the tab label indicating unsaved changes.
result: pass

### 4. Cmd+S Save
expected: With a dirty editor tab active, press Cmd+S. File saves, yellow dot disappears, and a success toast appears ("Saved filename").
result: issue
reported: "It save but it close the file. Also: git tree not updated after save, editor not updated after git revert."
severity: blocker
fix_applied: Fixed activeTabId.subscribe guard in unified-tab-bar.tsx — was hijacking focus back to terminal during signal cascades triggered by setEditorDirty.

### 5. Close Dirty Tab — Confirmation Modal
expected: Click the X on a dirty editor tab. A three-button confirmation modal appears with Cancel, Discard, and Save File buttons. Cancel returns to editor, Discard closes without saving, Save File saves then closes.
result: pass

### 6. Drag-and-Drop Tab Reorder
expected: Drag an editor tab to a different position in the tab bar. Tab moves to the new position. A visual indicator (border) shows during drag.
result: issue
reported: "Can drag, green plus icon appears during drag (why a plus) but after release the tabs are not re-ordered."
severity: major

### 7. [+] Dropdown Menu
expected: Click the [+] button in the tab bar. A dropdown menu appears with three options: Terminal (Zsh), Agent, Git Changes. Selecting Terminal opens a new terminal tab. Selecting Git Changes opens the git changes tab.
result: issue
reported: "Works but hover highlight didn't follow mouse — first item stayed selected. Also: sometimes click on Agent opens Terminal instead."
severity: major
fix_applied: Added onMouseEnter handler to dropdown menu items to update selectedIndex on hover.

### 8. Git Changes Accordion
expected: Open the Git Changes tab. An accordion list shows changed files with status badges ([M] yellow, [A] green, [D] red) and +/- line counts. Clicking a file header expands to show an inline colored diff (green additions, red deletions).
result: pass

### 9. Terminal Tabs Still Work
expected: Terminal tabs continue to function normally — creating new terminals, switching between them, typing commands, seeing output. No regression from the unified tab bar changes.
result: issue
reported: "Switching terminal tabs showed same terminal for all tabs. After fix: works but unstable — sessions restart, Claude Code opens instead of Zsh, chaos. Also: Zsh tabs restored as agent tabs after app restart."
severity: major
fix_applied: Exported switchToTab and called it from handleTabClick in unified-tab-bar.tsx. Remaining session management instability not yet fixed.

### 10. Editor Tab Focus on Switch
expected: Switch between multiple editor tabs. Each tab preserves its scroll position and undo history. The active tab receives keyboard focus automatically.
result: pass

## Summary

total: 10
passed: 5
issues: 5
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Drag-and-drop tab reorder moves tab to new position"
  status: failed
  reason: "User reported: Can drag, green plus icon appears but tabs not re-ordered after drop"
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Git tree updates after file save; editor updates after git revert"
  status: failed
  reason: "User reported: git tree not updated after save, editor not updated after git revert"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Dropdown menu click sometimes fires wrong item action"
  status: failed
  reason: "User reported: sometimes click on Agent opens Terminal instead"
  severity: minor
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Terminal sessions stable across tab switching and app restart"
  status: failed
  reason: "User reported: sessions restart, Claude Code opens instead of Zsh, Zsh tabs restored as agent after restart"
  severity: major
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Remove Diff tab from right sidebar — replaced by Git Changes in main panel"
  status: failed
  reason: "User requested: Diff tab in right sidebar is redundant now. Left sidebar Git tab clicks should open Git Changes tab in main panel."
  severity: major
  test: 8
  root_cause: "Feature gap — old Diff tab not yet removed"
  artifacts:
    - path: "src/components/right-panel.tsx"
      issue: "Still renders Diff tab"
  missing:
    - "Remove Diff tab from right panel"
    - "Wire left sidebar Git tab clicks to open Git Changes in main panel"
  debug_session: ""
