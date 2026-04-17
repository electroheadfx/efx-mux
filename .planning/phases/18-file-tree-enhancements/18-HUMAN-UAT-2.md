---
status: resolved
phase: 18-file-tree-enhancements
source: [18-VERIFICATION-2.md]
started: 2026-04-17T10:40:00Z
updated: 2026-04-17T10:55:00Z
round: 2
---

## Current Test

[all tests passed — phase approved by user]

## Tests

### 1. G-01 end-to-end — revert closes tree row AND editor tab
expected: Create a file in the project, open it in editor tab, revert via Git sidebar (delete path). Within 1s: (a) file-tree row disappears, (b) editor tab closes automatically, (c) no unsaved-changes modal, (d) no error toast.
result: passed

### 2. G-02 per-row Finder highlight tracks cursor
expected: Drag a file from Finder, slowly move cursor over multiple folder rows. Each folder row gets its own blue left-border highlight as the cursor enters it; highlight disappears from previous row.
result: passed

### 3. UAT Test 17 regression guard — drop outside tree
expected: Drag file from Finder onto terminal panel (outside tree). "Drop target outside file tree" toast fires; no file copied to project.
result: passed

### 4. UAT Test 5 regression guard — Cmd+Backspace delete
expected: Select file in tree, press Cmd+Backspace. Confirm-delete modal appears.
result: passed

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
