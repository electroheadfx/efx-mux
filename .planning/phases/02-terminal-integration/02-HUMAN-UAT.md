---
status: partial
phase: 02-terminal-integration
source: [02-VERIFICATION.md]
started: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Terminal end-to-end
expected: Type `echo hello`, verify output appears; type `tmux ls`, verify `efx-mux` session listed
result: [pending]

### 2. tmux session survival
expected: Close app, wait 10s, run `tmux ls` in system terminal, verify `efx-mux` still alive
result: [pending]

### 3. WebGL status
expected: Check DevTools console for `[efx-mux] WebGL not available` message (absence means WebGL active)
result: [pending]

### 4. Resize reflow
expected: Drag split handles, verify terminal content reflows without corruption
result: [pending]

### 5. Heavy output flow control
expected: Run `cat /dev/urandom | head -c 100000 | xxd`, verify app stays responsive
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

### LOW watermark hysteresis missing
Flow control in `src-tauri/src/terminal/pty.rs` only defines HIGH watermark (400KB). Missing LOW watermark (100KB) for hysteresis — loop could oscillate at boundary during sustained output. Fix: add `const FLOW_LOW_WATERMARK: u64 = 100_000;` and update resume condition.
