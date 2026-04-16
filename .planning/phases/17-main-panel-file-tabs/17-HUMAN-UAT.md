---
status: partial
phase: 17-main-panel-file-tabs
source: [17-VERIFICATION.md]
started: 2026-04-15T22:00:00Z
updated: 2026-04-15T22:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Cmd+S Save End-to-End
expected: Press Cmd+S on dirty editor tab — yellow dot clears, "Saved {filename}" toast appears, file updated on disk
result: [pending]

### 2. Terminal Tab Restore After Restart
expected: With agent project, create Zsh tab, close/reopen app — first tab is Agent, second is Zsh (not Agent)
result: [pending]

### 3. Drag-and-Drop Reorder
expected: Drag tabs of different types to new positions — tabs reorder visually, no green plus icon, content switches correctly
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
