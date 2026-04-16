---
status: complete
phase: 18-file-tree-enhancements
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md
started: 2026-04-16T20:25:00Z
updated: 2026-04-16T20:28:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Efxmux instance. Launch fresh. App boots without errors, file tree loads project contents, git sidebar populates, no console errors in devtools.
result: pass

### 2. Right-Click Context Menu on File Tree Row
expected: Right-click any file or folder row. Context menu appears at cursor with items: Open In (if editors detected), Open with default app, Reveal in Finder, separator, New File, New Folder, separator, Delete. Clicking outside closes menu.
result: pass

### 3. Delete File via Context Menu
expected: Right-click file → Delete. Confirm modal appears with file name and "Delete" button. Confirming removes file from tree and disk. Canceling leaves file intact.
result: pass

### 4. Delete Folder Shows Child Count
expected: Right-click folder with children → Delete. Confirm modal message includes child count like "'foo' and 7 items will be permanently deleted". Very large folders (node_modules) show "10000+ items".
result: pass

### 5. Delete Key and Cmd+Backspace Trigger Delete
expected: Select a row, press Delete key → confirm modal appears. Same for Cmd+Backspace on macOS. Plain Backspace in flat mode still navigates up to parent (no delete).
result: issue
reported: "Cmd+Backspace do not trigger delete modal"
severity: major

### 6. Inline New File from Context Menu
expected: Right-click folder → New File. Inline input row appears under folder, autofocused. Type name, press Enter → file created on disk, appears in tree. Escape cancels without creating anything.
result: issue
reported: "all work except it reset the tree files collapse, so deployed folder(s) collapse when I create a file or folder in a folder or I delete a file or folder."
severity: major

### 7. Inline New Folder from Context Menu
expected: Right-click folder → New Folder. Inline input row appears. Type name, Enter → folder created, appears in tree. Collapsed folders auto-expand when creating inside them.
result: issue
reported: "yes but after creation the expanded folder collapse like an initialization"
severity: major
related: 6

### 8. Inline Create Validation Errors
expected: Try to create with empty name → "Name required" inline error. Try name with `/` → "Invalid characters (no / or null)". Try name that exists → "'{name}' already exists". Input stays focused so you can fix and retry.
result: issue
reported: "- for empty name: it work. - For illegal character for filename work, it should output error ? - when I try with a name which exist already it replace the file or folder !"
severity: blocker
notes: "Empty + illegal char OK. Existing-name silently REPLACES file/folder — data loss bug."

### 9. Open In Submenu Lists Detected Editors
expected: Right-click file → hover "Open In". Submenu opens after ~150ms showing only editors installed on your system (Zed / Visual Studio Code / Cursor / Sublime Text / IntelliJ IDEA). Missing editors don't appear.
result: pass

### 10. Open In Launches Editor
expected: Right-click file → Open In → select an editor (e.g. Zed). That editor opens the file. Toast appears on failure (e.g. editor not installed).
result: pass

### 11. Open with Default App and Reveal in Finder
expected: Right-click file → "Open with default app" opens file in macOS default app for that extension. "Reveal in Finder" opens Finder with the file highlighted.
result: pass

### 12. Header [+] Button Dropdown
expected: File tree header has a [+] button. Clicking opens dropdown with "New File" and "New Folder" items. Target directory: selected folder → that folder, selected file → file's parent, nothing selected → project root.
result: pass

### 13. Header Open In Button
expected: File tree header has an "Open In" button (hidden if no editors detected). Clicking opens dropdown of detected editors. Selecting one opens the project root in that editor.
result: pass

### 14. Intra-Tree Drag to Move File
expected: Mouse-down on a row, drag beyond ~5px → ghost clone follows cursor, source row fades. Row under cursor highlights with blue left-border. Release over folder → file moves into that folder. Tree refreshes.
result: pass

### 15. Drag Guards — Self and Descendant
expected: Drag folder onto itself → no-op, no error. Drag folder into its own descendant → no-op. Drag onto same parent → no-op. Drag into different folder → moves successfully.
result: pass

### 16. Finder Drop Import
expected: Drag a file from Finder onto the file tree. Drop zone outline glows with accent color. Row under cursor highlights. Release → file copies into target folder. Tree refreshes with new file.
result: issue
reported: "when I drag on a folder or root it choose a non-choosed folder instead to copy the file"
severity: major

### 17. Finder Drop Outside Tree
expected: Drag file from Finder, release outside file tree container → "Drop target outside file tree" toast appears, no copy happens.
result: issue
reported: "No, when i drop a file from finder out of the file tree container, it copy the file in a random free. When I try to revert it with git revert, I got an error"
severity: blocker
notes: "Drop outside still triggers copy to wrong location; secondary git-revert failure on the unintended file."

### 18. Git Status Refresh on Mutation
expected: After delete/create/rename/move/copy, the git sidebar updates automatically (new files appear as untracked, deleted files appear in changes). No manual refresh needed.
result: issue
reported: "yes, but I can't revert a new file"
severity: major
notes: "Refresh works. Revert button fails on untracked/new files (needs rm, not git revert)."

## Summary

total: 18
passed: 11
issues: 7
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Cmd+Backspace on selected row triggers the delete confirm modal (same as Delete key)"
  status: failed
  reason: "User reported: Cmd+Backspace do not trigger delete modal"
  severity: major
  test: 5
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Tree preserves folder expand/collapse state after create/delete/rename mutations"
  status: failed
  reason: "User reported: all work except it reset the tree files collapse, so deployed folder(s) collapse when I create a file or folder in a folder or I delete a file or folder."
  severity: major
  test: 6
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Creating a file/folder with name that already exists shows '<name> already exists' error and does NOT overwrite"
  status: failed
  reason: "User reported: when I try with a name which exist already it replace the file or folder ! (silent overwrite — data loss)"
  severity: blocker
  test: 8
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Finder-drop hit-testing copies file into the folder under cursor (not a different/unintended folder)"
  status: failed
  reason: "User reported: when I drag on a folder or root it choose a non-choosed folder instead to copy the file"
  severity: major
  test: 16
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Finder-drop outside the file-tree container shows 'Drop target outside file tree' toast and does NOT copy the file"
  status: failed
  reason: "User reported: when i drop a file from finder out of the file tree container, it copy the file in a random free. When I try to revert it with git revert, I got an error"
  severity: blocker
  test: 17
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Per-file revert button works on untracked/new files (deletes the file, since git revert is not valid for untracked)"
  status: failed
  reason: "User reported: yes, but I can't revert a new file"
  severity: major
  test: 18
  artifacts: []
  missing: []
  debug_session: ""
