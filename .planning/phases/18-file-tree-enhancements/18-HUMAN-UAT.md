---
status: diagnosed
phase: 18-file-tree-enhancements
source: [18-VERIFICATION.md]
started: 2026-04-17T06:17:19Z
updated: 2026-04-17T08:30:00Z
---

## Current Test

[all tests run — 3 pass, 2 issues, 0 pending]

## Tests

### 1. Cmd+Backspace from file-tree focus opens delete modal
expected: "'[filename] will be permanently deleted. This cannot be undone.' modal surfaces when a file-tree row is selected and the scroll container has focus
result: passed

### 2. Cmd+Backspace inside commit-message textarea does NOT open delete modal (WR-01)
expected: Textarea receives standard macOS 'delete to line start' behaviour; no ConfirmModal surfaces for file tree.
result: passed — user did not report this firing as a bug; issue instead found on item 3 revert flow (see Gap G-01)

### 3. Revert on untracked directory (WR-02)
expected: Folder is deleted from disk, git sidebar refreshes, no error toast.
result: failed — user reports: after revert-as-delete on a created FILE, file is gone from disk/git BUT the file-tree still shows it; subsequent delete attempt fails because file does not exist. Separate observation: newly-created folders are not tracked by git (expected git behaviour, not a bug).

### 4. Finder drop onto folder row lands in correct folder (UAT Test 16)
expected: Copied file appears inside the folder row under the cursor at drop time.
result: failed — file does land in the correct folder, BUT during drag the whole file-tree shows active highlight instead of the specific folder under the cursor getting a blue drop-target outline. UX regression — user cannot see where the file will land.

### 5. Finder drop outside tree shows toast, no copy (UAT Test 17 BLOCKER)
expected: "Drop target outside file tree" toast appears; no file copied.
result: passed

## Summary

total: 5
passed: 3
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

### G-01: File-tree does not refresh after revert-as-delete
severity: high
source_test: 3
status: failed
symptom: user reverts a just-created (untracked) file → file removed from disk and git sidebar correctly, but file-tree still renders the row. Clicking the stale row to delete errors because the file is already gone.
hypothesis: git-status-changed → refreshTreePreservingState() either (a) is not emitted by revert_file_impl for WT_NEW paths, or (b) re-reads a stale list_directory result, or (c) the snapshot/restore path re-adds the now-deleted entry from the pre-revert snapshot.

### G-02: Drop-target folder not highlighted during Finder drag
severity: medium
source_test: 4
status: failed
symptom: during a Finder drag, the entire file-tree container shows the active-drag styling but the specific folder row under the cursor does not get its own blue drop-target outline. User cannot see which folder will receive the drop.
hypothesis: onDragDropEvent in main.tsx (drag-enter/drag-over path) may not be firing a per-row highlight CustomEvent, or file-tree.tsx lacks the per-row `data-drop-target` styling that responds to the cursor hit-test.

