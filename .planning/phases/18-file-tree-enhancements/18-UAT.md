---
status: diagnosed
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
  root_cause: "WKWebView on macOS intercepts Cmd+Backspace via AppKit NSResponder chain (doCommandBySelector: → deleteBackward:) BEFORE keydown reaches the JS handler. file-tree.tsx handlers are correct on paper but never receive the event. Existing test passed only by DOM pollution from earlier describe blocks."
  artifacts:
    - path: "src/components/file-tree.tsx"
      issue: "handleFlatKeydown lines 1084-1094 + handleTreeKeydown lines 1152-1158 — logic correct but unreachable"
    - path: "src-tauri/src/lib.rs"
      issue: "macOS native menu (lines 30-67, 193-228) needs hidden MenuItem with CmdOrCtrl+Backspace accelerator that emits delete-selected-tree-row CustomEvent (same pattern as Cmd+W and Cmd+,)"
    - path: "src/components/file-tree.test.tsx"
      issue: "lines 138-148 Delete-key test is bogus (passes only via DOM pollution); needs replacement that mounts ConfirmModal and asserts on /permanently deleted/"
  missing:
    - "Add hidden Edit-menu MenuItem id='delete-selection' with accelerator 'CmdOrCtrl+Backspace' (and CmdOrCtrl+Delete) in src-tauri/src/lib.rs"
    - "on_menu_event emits 'delete-selected-tree-row' CustomEvent"
    - "file-tree.tsx useEffect listens for that event and routes to triggerDeleteConfirm"
    - "Fix bogus Delete-key test + add Cmd+Backspace test"
  debug_session: ".planning/debug/cmd-backspace-no-delete.md"

- truth: "Tree preserves folder expand/collapse state after create/delete/rename mutations"
  status: failed
  reason: "User reported: all work except it reset the tree files collapse, so deployed folder(s) collapse when I create a file or folder in a folder or I delete a file or folder."
  severity: major
  test: 6
  related_tests: [7]
  root_cause: "initTree() at file-tree.tsx:195-218 is a from-scratch initializer that builds every TreeNode with expanded:false and replaces treeNodes.value wholesale. The git-status-changed listener at lines 734-739 calls initTree() for tree mode, conflating 'initial load' (where wipe is correct) with 'post-mutation refresh' (where wipe is wrong). expanded boolean lives ON the TreeNode object — replacing the array kills all expansion state."
  artifacts:
    - path: "src/components/file-tree.tsx"
      issue: "lines 195-218 initTree() unconditionally rebuilds with expanded:false; lines 734-739 git-status-changed listener calls initTree() for tree mode; lines 128-133 TreeNode interface has no auxiliary expanded-paths storage"
  missing:
    - "Either: (A) snapshot expanded paths before initTree, restore after; or (B) new refreshTree() that reconciles by entry.path keeping existing TreeNode objects"
    - "Preserve selectedIndex by remembering selected entry's path, re-locate post-refresh"
    - "Wire git-status-changed listener to call the state-preserving function (NOT initTree)"
    - "Leave initTree() unchanged for project-switch (line 714) and initial-load (line 835) call sites"
  debug_session: ".planning/debug/tree-state-reset-on-mutation.md"

- truth: "Creating a file/folder with name that already exists shows '<name> already exists' error and does NOT overwrite"
  status: failed
  reason: "User reported: when I try with a name which exist already it replace the file or folder ! (silent overwrite — data loss)"
  severity: blocker
  test: 8
  root_cause: "create_file_impl in src-tauri/src/file_ops.rs:356-367 calls std::fs::write(path, '') without first checking Path::new(path).exists(). std::fs::write silently truncates existing files. create_folder_impl (lines 417-425) and copy_path_impl (lines 457-479) both have explicit existence guards — only create_file (Phase 15) was never updated to match. Frontend matcher in file-tree.tsx:626-634 already handles 'already exists' correctly; catch is unreachable because Rust never returns the error."
  artifacts:
    - path: "src-tauri/src/file_ops.rs"
      issue: "lines 356-367 create_file_impl missing Path::exists() guard before std::fs::write"
    - path: "src-tauri/src/file_ops.rs"
      issue: "lines 828-859 test block missing create_file_rejects_existing test (mirror of create_folder_rejects_existing at lines 876-886)"
  missing:
    - "Add `if Path::new(path).exists() { return Err(format!(\"File already exists: {}\", path)); }` to create_file_impl after is_safe_path check, before fs::create_dir_all for parents"
    - "Error string MUST include 'already exists' so frontend matcher fires (file-tree.tsx:626-634)"
    - "Add Rust test create_file_rejects_existing modeled on create_folder_rejects_existing (file_ops.rs:876-886)"
  debug_session: ".planning/debug/inline-create-overwrites-existing.md"

- truth: "Finder-drop hit-testing copies file into the folder under cursor (not a different/unintended folder)"
  status: failed
  reason: "User reported: when I drag on a folder or root it choose a non-choosed folder instead to copy the file"
  severity: major
  test: 16
  root_cause: "TWO independent bugs that compound: (1) Tauri 2.10.x onDragDropEvent payload.position has a documented ~28px y-offset on macOS when titleBarStyle is 'Overlay' (Tauri Issue #10744). main.tsx:282-286 applies DPR correction but does NOT subtract the title-bar height. Result: y is off by ~28px = 1-2 row offset. (2) Hit-test in file-tree.tsx checks ONLY y-bounds, no x-bounds (handleFinderDrop:778-791, handleFinderDragover:752, onTreeDocMouseMove:436, onTreeDocMouseUp:463). All four hit-tests miss x-axis check."
  artifacts:
    - path: "src/main.tsx"
      issue: "lines 260-296 onDragDropEvent applies DPR division but doesn't subtract macOS overlay title-bar y offset (~28px). Tauri Issue #10744."
    - path: "src/components/file-tree.tsx"
      issue: "lines 436, 463, 752, 781 — all four [data-file-tree-index] hit-tests use y-only bounds. Missing position.x >= rect.left && position.x <= rect.right (or e.clientX equivalents)"
    - path: "src-tauri/tauri.conf.json"
      issue: "line 21 titleBarStyle: 'Overlay' triggers the upstream Tauri offset bug (do NOT change; fix the dispatch layer)"
    - path: "src/components/file-tree.test.tsx"
      issue: "Existing tests use y:0 with jsdom zero-rects — never exercised production geometry. New tests must mock getBoundingClientRect with non-zero values."
  missing:
    - "In src/main.tsx: subtract macOS overlay title-bar height (28px hardcoded, OR runtime-computed via getCurrentWebview().position() − getCurrentWindow().innerPosition() y-delta / DPR) from payload.position.y AFTER DPR division, BEFORE dispatching tree-finder-* CustomEvents"
    - "Add x-axis bounds check to all 4 hit-tests in file-tree.tsx (lines 436, 463, 752, 781)"
    - "Add regression test that mocks getBoundingClientRect with non-zero rects and verifies a y offset by title-bar height resolves to correct row after fix"
  debug_session: ".planning/debug/finder-drop-wrong-target.md"

- truth: "Finder-drop outside the file-tree container shows 'Drop target outside file tree' toast and does NOT copy the file"
  status: failed
  reason: "User reported: when i drop a file from finder out of the file tree container, it copy the file in a random free. When I try to revert it with git revert, I got an error"
  severity: blocker
  test: 17
  related_tests: [16]
  root_cause: "Same root cause as test 16 (subset). The 'outside container' toast guard at file-tree.tsx:794-803 correctly checks both x and y, but is structurally unreachable because the row hit-test above (lines 778-791) uses y-only bounds and rows tile the entire vertical span — so any cursor y aligned with any row wins before the fallback runs. Adding x-axis check to row hit-test makes the toast guard reachable. Secondary: the unintended copy creates an untracked file → revert button fails (see test 18)."
  artifacts:
    - path: "src/components/file-tree.tsx"
      issue: "lines 778-791 row hit-test missing x-axis check makes lines 794-803 outside-container toast unreachable"
  missing:
    - "Same fix as test 16 — add x-axis bounds check to row hit-test"
    - "Add negative regression tests: tree-finder-drop with cursor x outside scroll-container expects toast and no copyPath; tree-finder-dragover with same outside-x expects no row highlight"
  debug_session: ".planning/debug/finder-drop-outside-still-copies.md"

- truth: "Per-file revert button works on untracked/new files (deletes the file, since git revert is not valid for untracked)"
  status: failed
  reason: "User reported: yes, but I can't revert a new file"
  severity: major
  test: 18
  root_cause: "revert_file_impl in src-tauri/src/git_ops.rs:467-502 unconditionally runs `git checkout -- <path>` regardless of file status. For untracked files this exits 1 with 'pathspec did not match any file(s) known to git'. The misleading code comment at lines 463-466 claims it's a no-op for untracked — empirically wrong. Frontend git-control-tab.tsx:120-130 puts untracked files (status '?') in the unstaged Changes section; lines 870-877 wires onRevert unconditionally. Compounding: handleRevertAll (lines 227-243) aborts on first failure."
  artifacts:
    - path: "src-tauri/src/git_ops.rs"
      issue: "lines 467-502 revert_file_impl missing status branching"
    - path: "src-tauri/src/git_ops.rs"
      issue: "lines 463-466 misleading comment claiming git checkout is no-op for untracked (factually wrong)"
    - path: "src-tauri/src/git_ops.rs"
      issue: "lines 785-810 missing revert_file_deletes_untracked test"
    - path: "src/components/git-control-tab.tsx"
      issue: "lines 227-243 handleRevertAll aborts on first failure (secondary bug)"
  missing:
    - "Add `repo.status_file(rel_path)` check at top of revert_file_impl"
    - "Branch: WT_NEW (untracked) → fs::remove_file(workdir.join(rel_path)) (or trash crate); WT_MODIFIED|WT_DELETED|WT_TYPECHANGE|WT_RENAMED → keep current git checkout; CURRENT → no-op Ok(())"
    - "Add Rust test revert_file_deletes_untracked"
    - "Wrap each `await revertFile(...)` in handleRevertAll with try/catch + summary toast"
  debug_session: ".planning/debug/revert-button-fails-untracked.md"
