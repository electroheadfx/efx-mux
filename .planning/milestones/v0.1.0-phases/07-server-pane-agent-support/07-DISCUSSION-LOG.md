# Phase 7: Server Pane + Agent Support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 07-server-pane-agent-support
**Areas discussed:** Server pane behavior, Agent detection & launch, Server process management, Fallback & error states

---

## Server Pane Behavior

### Collapse/expand mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+` toggle | Keyboard toggle between collapsed (0px) and expanded (persisted height) | |
| Always visible, min-height | Server pane always shows at least a toolbar strip (28px) | |
| You decide | Claude picks | |

**User's choice:** Custom -- 3-state cycle: toolbar strip (28px, default) -> expanded -> collapsed -> strip. Combines aspects of both options.
**Notes:** User wanted both the always-visible toolbar strip AND the ability to fully collapse. Ctrl+` cycles through all three states.

### Process type

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated tmux session | Server in its own tmux session, survives app close | |
| Raw child process | Server via std::process::Command, dies with app | |
| xterm.js terminal in pane | Full terminal emulation in server pane | |

**User's choice:** Initially said "dedicated tmux session with HTML band toolbar", then chose "Rust child process with piped output" for execution. Reconciled as: Rust child process (not tmux) with HTML toolbar band at top.
**Notes:** Server pane is NOT a full terminal -- it's a scrollable HTML log viewer with a toolbar. Server process intentionally dies with app.

### Height persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in state.json | Save server pane height ratio | ✓ |
| No, default each time | Always start at default height | |

**User's choice:** Yes, in state.json
**Notes:** Consistent with existing persistence pattern.

---

## Agent Detection & Launch

### Binary detection

| Option | Description | Selected |
|--------|-------------|----------|
| Use per-project config | ProjectEntry.agent field + `which` check | ✓ |
| Auto-detect from PATH | Scan PATH for binaries | |
| Config with auto-detect fallback | Config first, auto-detect if missing | |

**User's choice:** Use per-project config
**Notes:** Simple, explicit. No guessing.

### Agent pane placement

| Option | Description | Selected |
|--------|-------------|----------|
| Agent IS the main terminal | Main terminal already spawns the agent | ✓ |
| Agent in a new dedicated pane | Separate pane for agent | |

**User's choice:** Agent IS the main terminal
**Notes:** This is already the current behavior. Phase 7 just makes detection configurable.

### Project switching

| Option | Description | Selected |
|--------|-------------|----------|
| Switch tmux session | Each project has own tmux sessions | ✓ |
| Kill and respawn | Kill current, spawn new | |
| You decide | Claude picks | |

**User's choice:** Switch tmux session
**Notes:** Already developed in Phase 5. All TUI panes have their own session from the workspace project.

---

## Server Process Management

### Server execution method

| Option | Description | Selected |
|--------|-------------|----------|
| tmux send-keys into server session | Server in dedicated tmux session | |
| Rust child process with piped output | std::process::Command, piped stdout/stderr | ✓ |
| You decide | Claude picks | |

**User's choice:** Rust child process with piped output
**Notes:** Server process dies with app -- this is intentional for dev servers.

### Open in Browser URL detection

| Option | Description | Selected |
|--------|-------------|----------|
| Per-project config field | Add server_url to ProjectEntry | |
| Parse server output for URL | Scan stdout for http://localhost patterns | |
| Config with output fallback | Config first, parse stdout as fallback | ✓ |

**User's choice:** Config with output fallback
**Notes:** Best of both worlds -- explicit config preferred, stdout parsing as safety net.

### Server pane rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Scrollable HTML log | Styled HTML text in scrollable div | ✓ |
| Full xterm.js terminal | Real terminal emulation | |
| You decide | Claude picks | |

**User's choice:** Scrollable HTML log
**Notes:** Lighter approach. ANSI codes stripped or converted to CSS.

---

## Fallback & Error States

### No agent binary found

| Option | Description | Selected |
|--------|-------------|----------|
| Bash with banner | Plain bash + non-intrusive banner | ✓ |
| Block with install prompt | Modal blocking terminal until dismissed | |
| You decide | Claude picks | |

**User's choice:** Bash with banner
**Notes:** Matches AGENT-05 requirement.

### Server process crash

| Option | Description | Selected |
|--------|-------------|----------|
| Show exit code + restart button | Append exit info, enable restart | ✓ |
| Auto-restart with backoff | Exponential backoff, stop after 3 failures | |
| You decide | Claude picks | |

**User's choice:** Show exit code + restart button
**Notes:** No auto-restart. User decides when to restart.

### No server_cmd configured

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'No server configured' | Muted message, Start button disabled | ✓ |
| Hide server pane entirely | Collapse and disable toggle | |
| You decide | Claude picks | |

**User's choice:** Show 'No server configured'
**Notes:** Server pane always exists in layout, just shows informative message when no server is configured.

---

## Claude's Discretion

- ANSI color stripping/conversion approach for server logs
- Exact toolbar button styling and disabled state appearance
- Server log scrollback buffer size
- URL regex pattern for stdout parsing fallback
- Banner styling for missing agent binary message
- Ctrl+` keycode capture implementation

## Deferred Ideas

None -- discussion stayed within phase scope.
