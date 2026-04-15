---
status: complete
phase: 17-main-panel-file-tabs
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md
started: 2026-04-15T19:00:00Z
updated: 2026-04-15T19:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Clear ephemeral state. Start app. App boots without errors, sidebar shows file tree, main panel shows terminal.
result: pass

### 2. Open File in Editor Tab
expected: Click a file in the file tree. An editor tab opens in the main panel with file content displayed in CodeMirror 6 with Solarized Dark syntax highlighting (colors visible on code).
result: pending

### 3. One-Tab-Per-File
expected: Click the same file again in the file tree. No duplicate tab opens — the existing editor tab for that file is focused instead.
result: pending

### 4. Dirty Indicator (Yellow Dot)
expected: Edit text in an open editor tab. A yellow dot appears on the tab label indicating unsaved changes.
result: pending

### 5. Cmd+S Save
expected: With a dirty editor tab active, press Cmd+S. File saves, yellow dot disappears, and a success toast appears ("Saved filename").
result: pending

### 6. Close Dirty Tab — Confirmation Modal
expected: Click the X on a dirty editor tab. A three-button confirmation modal appears with Cancel, Discard, and Save File buttons. Cancel returns to editor, Discard closes without saving, Save File saves then closes.
result: pending

### 7. Drag-and-Drop Tab Reorder
expected: Drag an editor tab to a different position in the tab bar. Tab moves to the new position. A visual indicator (border) shows during drag.
result: pending

### 8. [+] Dropdown Menu
expected: Click the [+] button in the tab bar. A dropdown menu appears with three options: Terminal (Zsh), Agent, Git Changes. Selecting Terminal opens a new terminal tab. Selecting Git Changes opens the git changes tab.
result: pending

### 9. Git Changes Accordion
expected: Open the Git Changes tab. An accordion list shows changed files with status badges ([M] yellow, [A] green, [D] red) and +/- line counts. Clicking a file header expands to show an inline colored diff (green additions, red deletions).
result: pending

### 10. Terminal Tabs Still Work
expected: Terminal tabs continue to function normally — creating new terminals, switching between them, typing commands, seeing output. No regression from the unified tab bar changes.
result: pending

### 11. Editor Tab Focus on Switch
expected: Switch between multiple editor tabs. Each tab preserves its scroll position and undo history. The active tab receives keyboard focus automatically.
result: pending

### 12. Git Tree Updates After Save
expected: Save a file via Cmd+S. The sidebar git tree refreshes to show updated status.
result: pending

### 13. Editor Updates After Git Revert
expected: Use git to revert a file. The editor tab showing that file reloads the reverted content from disk.
result: pending

### 14. Sidebar Git Clicks Open Git Changes
expected: Click the Git tab in the left sidebar. It opens the Git Changes tab in the main panel (not the right sidebar Diff tab).
result: pass

### 15. Dropdown Click Fires Correct Action
expected: Click [+] then click "Agent". An agent tab opens. Click [+] then click "Terminal (Zsh)". A Zsh terminal opens. Each opens the correct session type.
result: pending

## Summary

total: 15
passed: 12
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Drag-and-drop tab reorder moves tab to new position"
  status: failed
  reason: "User reported: Can drag, green plus icon appears (not a reorder icon), tabs not re-ordered after drop"
  severity: major
  test: 7

- truth: "Cmd+S saves file and keeps editor tab open"
  status: failed
  reason: "User reported: First time after app open, Cmd+S saves but closes file. Second time works correctly."
  severity: blocker
  test: 5

- truth: "Git Changes accordion shows compact line height matching code editor"
  status: failed
  reason: "User reported: Line height too big in diff view (too much space between lines). Clicking Git file in left sidebar does not open file in Git Changes tab with expanded accordion."
  severity: minor
  test: 9
