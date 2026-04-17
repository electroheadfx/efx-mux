---
status: partial
phase: 18-file-tree-enhancements
source: [18-VERIFICATION-2.md]
started: 2026-04-17T10:40:00Z
updated: 2026-04-17T10:40:00Z
round: 2
---

## Current Test

[awaiting human testing after round-2 gap closure]

## Tests

### 1. G-01 end-to-end — revert closes tree row AND editor tab
expected: Create a file in the project, open it in editor tab, revert via Git sidebar (delete path). Within 1s: (a) file-tree row disappears, (b) editor tab closes automatically, (c) no unsaved-changes modal, (d) no error toast.
result: [pending]

### 2. G-02 per-row Finder highlight tracks cursor
expected: Drag a file from Finder, slowly move cursor over multiple folder rows. Each folder row gets its own blue left-border highlight as the cursor enters it; highlight disappears from previous row.
result: [pending]

### 3. UAT Test 17 regression guard — drop outside tree
expected: Drag file from Finder onto terminal panel (outside tree). "Drop target outside file tree" toast fires; no file copied to project.
result: [pending]

### 4. UAT Test 5 regression guard — Cmd+Backspace delete
expected: Select file in tree, press Cmd+Backspace. Confirm-delete modal appears.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
