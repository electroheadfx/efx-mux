# Phase 7: Server Pane + Agent Support - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

User can manage a dev server from a collapsible pane and launch Claude Code or OpenCode as native PTY processes -- no wrapping, no protocol hacks, just the raw binary in tmux. Covers AGENT-01 through AGENT-06.

</domain>

<decisions>
## Implementation Decisions

### Server pane collapse/expand
- **D-01:** Ctrl+` cycles through 3 states: toolbar strip (28px, default) -> expanded (persisted height) -> collapsed (0px, hidden) -> toolbar strip. This gives quick access to server status without taking space.
- **D-02:** Server pane height persisted in state.json alongside existing split ratios. Restore on app reopen. Consistent with existing persistence pattern from Phase 4.
- **D-03:** Split handle between main terminal and server pane enables drag-resize when server pane is expanded. Existing split-handle-h scaffold in main-panel.tsx is reused.

### Server pane UI
- **D-04:** Server pane has an HTML toolbar band at top with Start, Stop, Restart, and Open in Browser buttons. Below the toolbar is a scrollable HTML log area showing piped server output (not a full xterm.js terminal).
- **D-05:** Server output rendered as styled HTML text in a scrollable div. ANSI color codes stripped or converted to CSS. No terminal emulation needed -- this is a log viewer.

### Server process execution
- **D-06:** Server process spawned as a Rust child process via `std::process::Command` (not tmux). stdout/stderr piped to frontend via Tauri events or Channel. Process dies when app closes -- this is intentional (dev servers should restart fresh).
- **D-07:** Start button sends the project's `server_cmd` to Rust for execution. Stop sends SIGTERM/SIGKILL to the child process. Restart = Stop + Start sequence.

### Open in Browser URL detection
- **D-08:** Add a `server_url` field to `ProjectEntry` in state.rs (e.g., `http://localhost:3000`). Open button launches this URL via `tauri::shell::open`.
- **D-09:** If `server_url` is not configured, parse server stdout for `http://localhost` or `http://127.0.0.1` URL patterns as fallback. Use the first matched URL.

### Agent detection & launch
- **D-10:** Agent detection uses per-project config (`ProjectEntry.agent` field, already exists). At launch, verify binary exists via `which {agent}`. No auto-detection guessing.
- **D-11:** Agent IS the main terminal -- this doesn't change from current behavior. Phase 7 just makes the detection logic use per-project config instead of hardcoded defaults.
- **D-12:** Project switching already handles tmux session switching (Phase 5). Each project has its own tmux sessions for all panes. Agent type changes automatically when switching to a project with a different agent config.

### Fallback & error states
- **D-13:** When neither `claude` nor `opencode` binary is found, fall back to plain bash session with a non-intrusive banner: "No agent binary found. Install claude or opencode to enable AI assistance." (AGENT-05)
- **D-14:** When server process crashes, append "Process exited (code N)" to the log area. Enable the Restart button. No auto-restart -- user decides when to restart.
- **D-15:** When `server_cmd` is empty/not configured for a project, server pane shows muted message: "No server command configured for this project. Edit project settings to add one." Start button disabled.

### Claude's Discretion
- ANSI color stripping/conversion approach for server logs
- Exact toolbar button styling and disabled state appearance
- Server log scrollback buffer size
- URL regex pattern for stdout parsing fallback
- Banner styling for missing agent binary message
- Ctrl+` keycode capture implementation (before terminal focus)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server pane & agent requirements
- `.planning/REQUIREMENTS.md` -- AGENT-01 through AGENT-06: exact acceptance criteria for this phase

### Server pane scaffold
- `src/components/main-panel.tsx` -- Existing server pane HTML scaffold with placeholder toolbar (Start/Stop/Open buttons) and logs area. Split handle already rendered.

### PTY infrastructure
- `src-tauri/src/terminal/pty.rs` -- PtyManager HashMap, spawn_terminal with session_name + start_dir support, Channel-based output streaming
- `src/terminal/pty-bridge.ts` -- Frontend PTY bridge with connectPty(sessionName)
- `src/terminal/terminal-manager.ts` -- createTerminal() pattern for xterm.js instances

### State & project model
- `src-tauri/src/state.rs` -- ProjectEntry with agent, server_cmd, server_url fields. AppState persistence via atomic write. ProjectState with active project tracking.
- `src/state-manager.ts` -- JS bridge to Rust state, loadAppState/updateLayout/updateSession pattern

### Prior phase context
- `.planning/phases/02-terminal-integration/02-CONTEXT.md` -- tmux session spawning decisions, PTY streaming via Channel
- `.planning/phases/05-project-system-sidebar/05-CONTEXT.md` -- Project switching, ProjectEntry data model, per-project tmux sessions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PtyManager` HashMap in pty.rs: multi-session PTY support already working. Server pane doesn't need this (uses Rust child process), but agent detection can leverage spawn_terminal.
- `main-panel.tsx` server pane scaffold: toolbar with Start/Stop/Open buttons and logs area already rendered as placeholder. Needs wiring to Rust commands.
- `ProjectEntry` in state.rs: `agent`, `server_cmd` fields already exist. Need to add `server_url` field.
- Split handle infrastructure: existing drag-resize code from Phase 1 can be reused for server pane height.

### Established Patterns
- Tauri command pattern: `#[tauri::command]` with `spawn_blocking` for I/O ops (state.rs, pty.rs)
- State persistence: atomic write to state.json via tmp+rename (state.rs)
- Event-driven UI updates: Tauri events emitted from Rust, listened in frontend (file-changed, project-changed patterns)

### Integration Points
- `main-panel.tsx`: Wire toolbar buttons to new Tauri commands (start_server, stop_server, restart_server, open_in_browser)
- `state.rs`: Add `server_url` field to ProjectEntry, add server pane height to layout state
- `lib.rs`: Register new Tauri commands for server process management
- Project switching: extend switch logic to stop current server + start new project's server (if configured)

</code_context>

<specifics>
## Specific Ideas

- Server pane toolbar is an HTML band (not part of terminal), sitting above the scrollable log area
- 3-state cycle for Ctrl+` is specifically: strip -> expanded -> collapsed -> strip (not a simple toggle)
- Server process is deliberately NOT in tmux -- it should die with the app (dev servers restart fresh)
- Agent detection is simple `which` check, not clever auto-detection

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 07-server-pane-agent-support*
*Context gathered: 2026-04-08*
