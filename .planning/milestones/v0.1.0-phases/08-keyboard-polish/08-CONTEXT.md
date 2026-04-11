# Phase 8: Keyboard + Polish - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

User has a complete, conflict-free keyboard shortcut system and a polished first-run experience. The app handles crashes gracefully and never eats terminal control sequences. Covers UX-01, UX-02, UX-03, UX-04.

</domain>

<decisions>
## Implementation Decisions

### Shortcut conflict resolution
- **D-01:** Capture-before-terminal pattern: all app shortcuts use `document.addEventListener('keydown', ..., { capture: true })` to fire before xterm.js, same as existing Ctrl+S handler. Ctrl+T/W/Tab always trigger app actions regardless of focus.
- **D-02:** Terminal passthrough set: Ctrl+C (SIGINT), Ctrl+D (EOF), Ctrl+Z (suspend), Ctrl+L (clear), Ctrl+R (reverse search) always pass through to the terminal. Everything else is fair game for app shortcuts.
- **D-03:** Shortcut cheatsheet: Ctrl+? opens a dismissable overlay showing all app keyboard shortcuts. Dismisses on any key press or click outside.

### Tab management
- **D-04:** Ctrl+T creates a new terminal session tab in the main panel. Each tab is its own tmux session — like iTerm2 tab behavior.
- **D-05:** Terminal tab bar rendered at the top of the main terminal area, showing session name per tab. Reuses existing TabBar component pattern from right-panel.tsx.
- **D-06:** Ctrl+W closes the active terminal tab. Ctrl+Tab cycles through terminal tabs.
- **D-07:** Closing the last tab auto-creates a fresh default terminal session. The user always has at least one terminal open.

### PTY crash recovery
- **D-08:** Exit code-based detection: exit code 0 = normal exit (show "Session ended" + Restart button), non-zero = crash (show "Process crashed (code N)" + Restart button in warning style).
- **D-09:** Crash/exit banner is an inline overlay centered inside the terminal area. Terminal content remains visible behind it (dimmed). Matches terminal-first aesthetic.
- **D-10:** Restart button re-spawns the same session type (agent or bash) in a new tmux session for that tab.

### First-run wizard
- **D-11:** On first launch (no state.json), open a focused modal wizard. 2-5 steps: Welcome, Add project (dir + name), Choose agent (claude/opencode/bash), Import theme (iTerm2), Server command + GSD file path.
- **D-12:** Each wizard step is skippable with sensible defaults (bash agent, no server, no theme import, no GSD file). User can configure later via project settings.
- **D-13:** Reuse existing project-modal.tsx fields and patterns for the project setup step. Theme import reuses existing iTerm2 importer from Phase 3.

### Claude's Discretion
- Shortcut cheatsheet visual design and layout
- Tab bar styling (consistent with existing right-panel TabBar)
- Crash overlay dimming opacity and animation
- Wizard step transitions and progress indicator
- Default session naming convention for new tabs (e.g., "Terminal 1", "Terminal 2")
- Exact passthrough key detection implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Keyboard & UX requirements
- `.planning/REQUIREMENTS.md` -- UX-01 through UX-04: exact acceptance criteria for this phase

### Existing keyboard infrastructure
- `src/main.tsx` lines 112-138 -- Current keyboard handler setup: Ctrl+B (sidebar), Ctrl+Shift+T (theme), Ctrl+S (server pane with capture:true pattern)

### Tab bar component
- `src/components/tab-bar.tsx` -- Existing reusable TabBar component (tabs[], activeTab signal, onSwitch callback)
- `src/components/right-panel.tsx` -- TabBar usage pattern for right panel views

### PTY infrastructure
- `src-tauri/src/terminal/pty.rs` -- PtyManager HashMap, spawn_terminal, session management
- `src/terminal/pty-bridge.ts` -- Frontend PTY bridge with connectPty(sessionName)
- `src/terminal/terminal-manager.ts` -- createTerminal() for xterm.js instances

### Server process exit handling (reference pattern)
- `src-tauri/src/server.rs` lines 63-144 -- Exit code detection pattern via waitpid/WIFEXITED, server-exited event emission

### Project modal (wizard reuse)
- `src/components/project-modal.tsx` -- Existing project add/edit modal with dir, name, agent, server_cmd fields
- `src/components/fuzzy-search.tsx` -- Existing fuzzy search component (Ctrl+P project switcher)

### State persistence
- `src-tauri/src/state.rs` -- AppState with layout, sessions, projects. Atomic write pattern.
- `src/state-manager.ts` -- JS bridge signals (rightTopTab, rightBottomTab, etc.)

### Theme import
- `src/theme/theme-manager.ts` -- Existing theme loading, iTerm2 import, hot-reload infrastructure

### Prior phase context
- `.planning/phases/07-server-pane-agent-support/07-CONTEXT.md` -- Server pane decisions, Ctrl+S keybinding approach

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabBar` component (tab-bar.tsx): Generic tab bar with signal-based active state. Can be reused for main terminal tabs.
- `project-modal.tsx` (9.7K): Full project add/edit form. Wizard can reuse fields and validation logic.
- `fuzzy-search.tsx`: Overlay pattern with keyboard navigation. Cheatsheet overlay can follow similar dismiss-on-escape pattern.
- `capture: true` keydown pattern in main.tsx: Proven approach for intercepting keys before xterm.js.
- Server exit detection in server.rs: waitpid + WIFEXITED pattern can inform PTY exit code detection.

### Established Patterns
- Tauri command pattern: `#[tauri::command]` with `spawn_blocking` for I/O ops
- State persistence: atomic write to state.json via tmp+rename
- Event-driven UI: Tauri events emitted from Rust, listened in frontend
- Signal-based state: Preact signals for reactive UI updates (state-manager.ts)

### Integration Points
- `main.tsx`: Add Ctrl+T/W/Tab/? handlers alongside existing Ctrl+B/S handlers
- `main-panel.tsx`: Add terminal tab bar above `.terminal-area`, manage multiple terminal instances
- `pty.rs`: Extend PtyManager to support multiple named sessions per panel, emit exit events with exit codes
- `state.rs`: Persist terminal tab list and active tab in state.json
- `lib.rs`: Register any new Tauri commands for tab/session management

</code_context>

<specifics>
## Specific Ideas

- Tab bar at top of main terminal area, iTerm2 style — each tab is its own tmux session
- Crash overlay is inline (not replacing content), terminal content dimmed behind it
- Wizard modal reuses existing project-modal.tsx patterns, not a separate full-screen flow
- Full wizard collects: project dir, agent, theme import, server command, GSD file path
- Every wizard step skippable — get coding fast with sensible defaults

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 08-keyboard-polish*
*Context gathered: 2026-04-09*
