---
status: diagnosed
phase: 07-server-pane-agent-support
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md]
started: 2026-04-09T12:30:00Z
updated: 2026-04-09T12:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start the app fresh (pnpm tauri dev). App boots without errors, main window appears, terminal loads.
result: pass

### 2. Ctrl+` Server Pane Toggle
expected: Press Ctrl+` (or Ctrl+S if remapped) to cycle through states: collapsed (strip) -> expanded (logs/toolbar) -> collapsed. Each transition is visually distinct.
result: pass

### 3. Start Server via Toolbar
expected: With server pane expanded, click Start. Server launches, status indicator turns green, log output streams in real time.
result: pass

### 4. ANSI Color Rendering in Logs
expected: Server log output with ANSI colors renders as colored text in the pane. No raw escape sequences visible. 256-color and truecolor sequences also render correctly.
result: issue
reported: "I dont see colored text, I doubt ANSI colors renders. Also the logs show but the window do not move to the last log, I need to scroll, I want an auto scroll"
severity: minor

### 5. Stop Server via Toolbar
expected: Click Stop. Server terminates cleanly. No ELIFECYCLE error in logs. Exit code 143/137 treated as clean stop, not crash. Toolbar shows Start re-enabled.
result: pass

### 6. Restart Server via Toolbar
expected: Click Restart. Server stops and restarts. Toolbar stays stable during transition (no flickering, no Start button while running). Logs show new output.
result: issue
reported: "yes but when I stop it doesn't kill the server; it showed it stopped but its not. PORT 5173 node vite.js still running. its only a restart which bug the stop server"
severity: major

### 7. Open in Browser
expected: With server running and URL detected, click Open. Default browser opens the server URL.
result: pass

### 8. Drag Resize Server Pane
expected: Drag the horizontal divider between terminal and server pane. Height adjusts smoothly. Height persists across toggle cycles.
result: pass

### 9. Agent Detection on Startup
expected: On launch in a project with a known agent binary, the agent is detected and launched in the terminal. No agent = bash fallback banner.
result: pass

### 10. Project Switch Resets Server Pane
expected: Switch to a different project. Server stops, logs clear, status resets, project name updates in header.
result: issue
reported: "When I switch on another project, it lost the server logs and button states, so the server looks like closed but its not, so user re click on start and another server open (2 servers are online). Each project should save the logs and buttons state. If I quit the app it should close all servers."
severity: major

### 11. Clear Log Button
expected: Click Clear in the server toolbar. All log output clears. Works in any server state (running, stopped, idle).
result: pass

### 12. Project Name in Server Pane Header
expected: Server pane header shows "SERVER projectname" with the current project's natural-case name.
result: issue
reported: "could enter the full name instead truncated? Should show full project name, not truncated"
severity: cosmetic

### 13. Tauri Project Server (pnpm tauri dev)
expected: Start server with a Tauri project command (pnpm tauri dev). Status shows green while running. Multi-stage startup doesn't trigger false crash. Quitting the spawned app updates buttons/status correctly.
result: pass

## Summary

total: 13
passed: 9
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Server log output with ANSI colors renders as colored text, with auto-scroll to latest output"
  status: failed
  reason: "User reported: no colored text visible, logs don't auto-scroll to bottom"
  severity: minor
  test: 4
  root_cause: "CSS `color: inherit` on .server-pane-logs (app.css:173) overrides inline color styles from ansiToHtml() spans. Auto-scroll useEffect measures scrollHeight before browser paint, so scroll position is stale."
  artifacts:
    - path: "src/styles/app.css"
      issue: ".server-pane-logs color:inherit overrides inline span colors"
    - path: "src/components/server-pane.tsx"
      issue: "Auto-scroll useEffect needs requestAnimationFrame for correct timing"
  missing:
    - "Remove color:inherit from .server-pane-logs"
    - "Wrap auto-scroll logic in requestAnimationFrame"
  debug_session: ""

- truth: "Stop server actually kills the server process"
  status: failed
  reason: "User reported: stop shows stopped in UI but process still running on port (node vite.js). Only restart works, stop is broken."
  severity: major
  test: 6
  root_cause: "killpg() in server.rs may be called with wrong PID/PGID. Additionally, stopServer() frontend invoke may not properly reach the Rust backend. The process group kill fails silently, leaving vite running."
  artifacts:
    - path: "src-tauri/src/server.rs"
      issue: "killpg() call at lines 180/187 may use wrong PID sign or fail silently"
    - path: "src/server/server-bridge.ts"
      issue: "stopServer() invoke may not properly trigger backend kill"
  missing:
    - "Verify killpg() is called with correct PGID"
    - "Add error logging to stop_server to surface silent failures"
    - "Ensure process group kill covers all child processes"
  debug_session: ""

- truth: "Project switch kills old server and preserves per-project server state"
  status: failed
  reason: "User reported: switching projects loses server logs/button state, server keeps running as zombie. Re-clicking start opens second server. Multiple zombie servers accumulate."
  severity: major
  test: 10
  root_cause: "Single global ServerProcess state in lib.rs. Project-changed handler calls stopServer() which fails silently (test 6 root cause), then resetServerPane() only resets UI. No per-project server state map. Close handler only kills last stored process."
  artifacts:
    - path: "src-tauri/src/lib.rs"
      issue: "Single global ServerProcess, not per-project HashMap"
    - path: "src/main.tsx"
      issue: "project-changed listener catches and ignores stopServer errors"
    - path: "src-tauri/src/lib.rs"
      issue: "Close handler only kills one process, orphans remain"
  missing:
    - "Replace ServerProcess with HashMap<String, Child> keyed by project"
    - "Fix stop_server to actually kill (depends on test 6 fix)"
    - "Close handler must loop and kill all stored processes"
    - "Per-project log/state preservation on frontend"
  debug_session: ""

- truth: "Server pane header shows full project name"
  status: failed
  reason: "User reported: project name is truncated, should show full name"
  severity: cosmetic
  test: 12
  root_cause: "Project name span in server-pane.tsx toolbar lacks flex-1 sizing. Parent justify-between compresses the text. No title attribute for hover."
  artifacts:
    - path: "src/components/server-pane.tsx"
      issue: "Project name span missing flex-1 and truncate classes"
  missing:
    - "Add flex-1 truncate classes and title attribute to project name span"
  debug_session: ""
