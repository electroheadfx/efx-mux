---
status: partial
phase: 04-session-persistence
source: [04-VERIFICATION.md]
started: 2026-04-07T13:30:00Z
updated: 2026-04-07T13:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Layout restore after restart
expected: Drag sidebar to ~300px, close app, reopen — expect ~300px restored
result: [pending]

### 2. Dark/light mode persists across restarts
expected: Toggle to light mode, close app, reopen — expect light mode (validates 04-04 fix)
result: [pending]

### 3. OS theme listener works after fresh restart
expected: Change macOS appearance with no manual toggle — expect app follows OS theme
result: [pending]

### 4. Dead session recovery
expected: Run `tmux kill-server`, open app — expect yellow warning + fresh session created
result: [pending]

### 5. Rust close handler writes state.json
expected: Drag sidebar, close via red button, verify `~/.config/efxmux/state.json` timestamp and content updated
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
