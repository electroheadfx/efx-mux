---
status: diagnosed
phase: 07-server-pane-agent-support
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md, 07-06-SUMMARY.md, 07-07-SUMMARY.md]
started: 2026-04-09T14:00:00Z
updated: 2026-04-09T14:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start the app fresh (pnpm tauri dev). App boots without errors, main window appears, terminal loads, server pane strip visible at bottom.
result: pass

### 2. Ctrl+S Server Pane Toggle
expected: Press Ctrl+S (or click the server strip) to cycle: collapsed strip → expanded pane with toolbar/logs → collapsed. Each state visually distinct.
result: issue
reported: "its not Ctrl+` its Ctrl+s. And the cycle switch was fixed to remove the 'hide' step and worked, but now it was re-added again! I dont want hide state"
severity: major

### 3. Start Server via Toolbar
expected: With server pane expanded, click Start. Server launches, status indicator turns green, log output streams in real time.
result: pass

### 4. ANSI Color Rendering in Logs
expected: Server log output with ANSI colors (including 256-color and truecolor sequences) renders as colored text. No raw escape sequences visible.
result: issue
reported: "Third pass at fixing this and it was never actually fixed. ANSI colors still not rendering."
severity: major

### 5. Auto-scroll to Latest Log
expected: As new log lines arrive, the log view automatically scrolls to the bottom. No manual scrolling needed to see latest output.
result: pass

### 6. Stop Server (Reliable Kill)
expected: Click Stop. Server process AND all child processes are killed (port freed). No zombie processes. Exit code 143/137 shown as clean stop, not crash. Start button re-enabled.
result: pass

### 7. Restart Server
expected: Click Restart. Server stops and restarts cleanly. Toolbar stays stable during transition (no flickering, no stale button states). New log output appears.
result: pass

### 8. Open in Browser
expected: With server running and URL detected in logs, click Open. Default browser opens the server URL.
result: pass

### 9. Drag Resize Server Pane
expected: Drag the horizontal divider between terminal and server pane. Height adjusts smoothly. Height persists across toggle cycles.
result: pass

### 10. Agent Detection on Startup
expected: On launch in a project with a known agent binary (e.g., claude), the agent is detected and launched in the terminal. No agent = bash fallback.
result: pass

### 11. Agent Detection on Project Switch
expected: Switch to a project with a different agent. The new terminal session launches with that project's detected agent binary.
result: pass

### 12. Project Switch Preserves Server State
expected: Start a server in Project A. Switch to Project B. Switch back to Project A. Server A's logs, status, and URL are restored. Server A is still running (not killed on switch).
result: pass

### 13. Clear Log Button
expected: Click Clear in the server toolbar. All log output clears. Works in any server state (running, stopped, idle).
result: pass

### 14. Full Project Name in Header
expected: Server pane header shows "SERVER projectname" with the full project name (not truncated). Hover shows tooltip with full name.
result: issue
reported: "truncated name, no hover tooltip"
severity: cosmetic

### 15. Multi-stage Command (pnpm tauri dev)
expected: Start server with a multi-stage command like "pnpm tauri dev". Status stays green through all startup stages. No false crash indicator from shell wrapper exiting.
result: pass

### 16. App Close Kills All Servers
expected: With servers running in multiple projects, quit the app. All server processes are terminated (no orphan processes left).
result: issue
reported: "All servers processes remain and not killed, and the Logs of each project are cleared, no persistants"
severity: blocker

### 17. Clean Exit Code Handling
expected: After stopping a server, the log shows the exit without treating it as a crash. Exit codes 143 (SIGTERM) and 137 (SIGKILL) display as clean stop messages.
result: pass

## Summary

total: 17
passed: 13
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Ctrl+S toggle cycles between collapsed strip and expanded pane (2 states only, no hide state)"
  status: failed
  reason: "User reported: hide state was previously removed but has regressed — cycle should be 2-state (strip/expanded), not 3-state"
  severity: major
  test: 2
  root_cause: "3-state cycle in two places: server-pane.tsx handleToggle (lines 284-288) and main.tsx Ctrl+S handler (lines 132-134) both cycle strip->expanded->collapsed->strip"
  artifacts:
    - path: "src/components/server-pane.tsx"
      issue: "handleToggle has 3-state cycle including 'collapsed' state"
    - path: "src/main.tsx"
      issue: "Ctrl+S handler has same 3-state cycle"
  missing:
    - "Replace 3-way branch with 2-state toggle: strip <-> expanded in both locations"
    - "Remove 'collapsed' from signal type and clean up CSS/rendering references"

- truth: "ANSI colored text renders visibly in server log output"
  status: failed
  reason: "User reported: third pass at fixing and never actually fixed. ANSI colors still not rendering."
  severity: major
  test: 4
  root_cause: "ansiToHtml regex expects raw \\x1b bytes but ANSI escape chars are likely stripped or mangled during Rust->JSON->JS serialization via Tauri event system. The converter produces zero colored spans because the regex never matches."
  artifacts:
    - path: "src/server/ansi-html.ts"
      issue: "Regex assumes raw \\x1b bytes arrive intact from Rust"
    - path: "src-tauri/src/server.rs"
      issue: "emit() may strip/mangle \\x1b during JSON serialization"
  missing:
    - "Verify what Rust actually sends (console.log JSON.stringify in listener)"
    - "Either preserve \\x1b through serialization or do ANSI-to-HTML conversion on Rust side before emitting"

- truth: "Server pane header shows full project name with hover tooltip"
  status: failed
  reason: "User reported: name is truncated, no hover tooltip"
  severity: cosmetic
  test: 14
  root_cause: "flex-shrink-0 on project name span prevents shrinking but parent has no overflow-hidden/min-w-0, so text clips. title attribute is present in source but element is not visible due to layout."
  artifacts:
    - path: "src/components/server-pane.tsx"
      issue: "Project name span has flex-shrink-0 (wrong), parent div lacks min-w-0/overflow-hidden"
  missing:
    - "Remove flex-shrink-0, add truncate class to project name span"
    - "Add min-w-0 and overflow-hidden to parent left-side div"

- truth: "App close kills all running server processes across all projects"
  status: failed
  reason: "User reported: all server processes remain running after app close, not killed. Logs of each project are also cleared (not persistent)."
  severity: blocker
  test: 16
  root_cause: "on_window_event CloseRequested only fires on window close button click, NOT on Cmd+Q. Cmd+Q triggers RunEvent::ExitRequested on the App, not a window event. kill_all_servers never executes on quit. Logs are in-memory only (Preact signals), not persisted to disk."
  artifacts:
    - path: "src-tauri/src/lib.rs"
      issue: "Close handler uses on_window_event(CloseRequested) which misses Cmd+Q"
    - path: "src/components/server-pane.tsx"
      issue: "Logs in memory only, not persisted to disk"
  missing:
    - "Move kill_all_servers to RunEvent::ExitRequested handler via .build() + .run() pattern"
    - "Persist server logs to disk (state.json or separate log files) and reload on startup"
