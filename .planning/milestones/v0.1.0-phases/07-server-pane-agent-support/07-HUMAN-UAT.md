---
status: partial
phase: 07-server-pane-agent-support
source: [07-VERIFICATION.md]
started: 2026-04-09T14:10:00Z
updated: 2026-04-09T14:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Server Start/Stop/Restart controls
expected: Start launches server, Stop kills process (port freed within 3s), Restart stops then starts
result: [pending]

### 2. Ctrl+S pane state cycle
expected: Ctrl+S cycles strip → expanded → collapsed → strip; clickable toolbar button does the same
result: [pending]

### 3. ANSI color rendering in server logs
expected: Colored output (e.g., Vite dev server) renders with visible distinct colors, not monochrome
result: [pending]

### 4. Crash detection with grace period
expected: Server process exit after 3-second grace period shows "crashed" status, not false positive on startup
result: [pending]

### 5. Agent binary launch at startup and project switch
expected: Claude Code or OpenCode binary detected and launched in tmux PTY session
result: [pending]

### 6. Bash fallback banner when agent missing
expected: If no agent binary found, server pane shows informational banner (not crash)
result: [pending]

### 7. Open in Browser via plugin-opener
expected: Clicking "Open in Browser" opens detected URL in default browser
result: [pending]

### 8. Server pane drag-resize with persistence
expected: Drag handle resizes server pane height, persisted across sessions
result: [pending]

### 9. Per-project server state isolation
expected: Switch project A→B→A: project A server still running, logs preserved, correct status shown
result: [pending]

### 10. App close kills all server processes
expected: Quit app with 2+ servers running, verify all ports freed (lsof -i :PORT)
result: [pending]

### 11. Auto-scroll to latest log output
expected: New log lines cause automatic scroll to bottom
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
