---
phase: 07-server-pane-agent-support
plan: 01
subsystem: server-process-management
tags: [rust, tauri-commands, server-lifecycle, ansi-html, event-streaming]
dependency_graph:
  requires: []
  provides: [server.rs, server-bridge.ts, ansi-html.ts, ServerProcess-state, opener-plugin]
  affects: [lib.rs, state.rs, state-manager.ts, Cargo.toml, package.json]
tech_stack:
  added: [libc, "@tauri-apps/plugin-opener"]
  patterns: [process-group-isolation, waitpid-crash-detection, ansi-to-html-xss-safe]
key_files:
  created:
    - src-tauri/src/server.rs
    - src/server/ansi-html.ts
    - src/server/server-bridge.ts
  modified:
    - src-tauri/src/state.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
    - src/state-manager.ts
    - package.json
    - pnpm-lock.yaml
key_decisions:
  - "Used libc::waitpid in waiter thread for crash detection instead of Child::wait (avoids Mutex contention)"
  - "Process group isolation via process_group(0) + killpg ensures child trees are fully terminated"
  - "HTML-escape before ANSI processing (T-07-03) prevents XSS from crafted server output"
metrics:
  duration: "4min"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 9
---

# Phase 07 Plan 01: Server Process Manager and Frontend Bridge Summary

Rust server process manager with start/stop/restart/detect_agent commands, process group isolation via libc, crash detection via waitpid waiter thread, and frontend bridge modules with XSS-safe ANSI-to-HTML conversion.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Rust server process manager + state updates + lib.rs wiring | ffd2203 | server.rs, state.rs, lib.rs, Cargo.toml |
| 2 | Frontend bridge modules + JS opener install + state-manager update | e1f38e3 | ansi-html.ts, server-bridge.ts, state-manager.ts, package.json |

## Decisions Made

1. **libc::waitpid for crash detection**: The waiter thread uses `libc::waitpid(pid)` instead of `Child::wait()` to avoid holding the Mutex lock while waiting for process exit. The PID is captured before storing the Child in managed state.

2. **Process group isolation**: `process_group(0)` on spawn + `libc::killpg()` on stop ensures the entire server process tree (including child processes) is terminated cleanly.

3. **XSS-safe ANSI conversion**: `ansiToHtml()` HTML-escapes all input (`&`, `<`, `>`) before processing ANSI codes, preventing injection via crafted server output (T-07-03 mitigation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unnecessary unsafe blocks around libc macros**
- **Found during:** Task 1 verification
- **Issue:** `libc::WIFEXITED` and `libc::WEXITSTATUS` are safe functions on this platform, compiler warned about unnecessary unsafe blocks
- **Fix:** Removed the inner unsafe blocks, kept the outer unsafe for waitpid call
- **Files modified:** src-tauri/src/server.rs
- **Commit:** ffd2203

## Verification Results

- `cargo build --manifest-path src-tauri/Cargo.toml` exits 0 (no warnings)
- `pnpm exec tsc --noEmit` exits 0
- server.rs contains all 4 commands: start_server, stop_server, restart_server, detect_agent
- server.rs waiter thread emits server-stopped with exit code via libc::waitpid (D-14)
- lib.rs registers all 4 commands + opener plugin + ServerProcess managed state + close handler cleanup
- state.rs has server_url, server_pane_height, server_pane_state fields
- ansi-html.ts exports ansiToHtml and extractServerUrl
- server-bridge.ts exports all 7 functions, listenServerStopped passes exitCode: number

## Self-Check: PASSED

All 20 acceptance criteria verified. All files exist, both commits present, all content checks pass.
