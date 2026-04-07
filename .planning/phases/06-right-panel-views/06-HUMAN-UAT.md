---
status: partial
phase: 06-right-panel-views
source: [06-VERIFICATION.md]
started: 2026-04-07T19:51:00Z
updated: 2026-04-07T19:51:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. GSD Viewer checkbox write-back
expected: Open a project's PLAN.md in GSD Viewer, click a checkbox — checkbox state toggled in the .md file within milliseconds
result: [pending]

### 2. GSD Viewer auto-refresh
expected: With a project loaded, externally edit the PLAN.md — viewer content updates automatically within ~200ms (notify debounce)
result: [pending]

### 3. Diff Viewer from sidebar
expected: Click a modified file in sidebar git-changed section — git diff renders with green additions, red deletions, accent-colored hunk headers
result: [pending]

### 4. File Tree -> file viewer
expected: Navigate to a file in File Tree, press Enter or click — main panel shows READ-ONLY badge, filename, preformatted content; Close button and Escape key dismiss it
result: [pending]

### 5. Bash Terminal connection
expected: Switch to Bash tab in right-bottom panel — xterm.js terminal connects to efx-mux-right tmux session
result: [pending]

### 6. Tab bar visual state
expected: Click each tab in right-top panel (GSD, Diff, File Tree) — active tab shows accent-colored underline; content switches to corresponding view
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
