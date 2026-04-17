---
status: partial
phase: 18-file-tree-enhancements
source: [18-VERIFICATION.md]
started: 2026-04-17T06:17:19Z
updated: 2026-04-17T06:17:19Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Cmd+Backspace from file-tree focus opens delete modal
expected: "'[filename] will be permanently deleted. This cannot be undone.' modal surfaces when a file-tree row is selected and the scroll container has focus
result: [pending]

### 2. Cmd+Backspace inside commit-message textarea does NOT open delete modal (WR-01)
expected: Textarea receives standard macOS 'delete to line start' behaviour; no ConfirmModal surfaces for file tree. If modal appears, WR-01 becomes a blocking gap requiring a focus-gate fix.
result: [pending]

### 3. Revert on untracked directory (WR-02)
expected: Folder is deleted from disk, git sidebar refreshes, no error toast. revert_file_impl currently calls remove_file unconditionally — may error on directories.
result: [pending]

### 4. Finder drop onto folder row lands in correct folder (UAT Test 16)
expected: Copied file appears inside the folder row under the cursor at drop time — no off-by-one row after the 28px title-bar offset fix.
result: [pending]

### 5. Finder drop outside tree shows toast, no copy (UAT Test 17 BLOCKER)
expected: "Drop target outside file tree" toast appears; no file copied. Confirms full x-axis hit-test guard works end-to-end.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
