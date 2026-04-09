# Requirements: GSD⚡MUX

**Defined:** 2026-04-06
**Core Value:** A single native macOS window that co-locates Claude Code / OpenCode terminal sessions alongside live GSD progress, git diff, and file tree — all persisted across restarts via tmux.

---

## v1 Requirements

### Layout & Shell

- [ ] **LAYOUT-01**: User sees a 3-zone layout (sidebar + main panel 50% + right split 2×25%) on launch
- [ ] **LAYOUT-02**: User can drag split handles to resize zones; ratios persist in state.json
- [ ] **LAYOUT-03**: User can collapse/expand sidebar with Ctrl+B (40px icon strip ↔ 200px full)
- [ ] **LAYOUT-04**: User can copy/paste with Cmd+C/Cmd+V in all terminal panels (Tauri macOS clipboard wired via menu)
- [ ] **LAYOUT-05**: User sees app chrome styled in forest-green dark palette (derived from iTerm2 theme JSON)

### Terminal

- [ ] **TERM-01**: User sees a real terminal (xterm.js 6.0) in the main panel connected to a live PTY process
- [ ] **TERM-02**: Terminal uses WebGL renderer with automatic fallback to DOM renderer on context loss (onContextLoss handler wired from day one)
- [ ] **TERM-03**: Terminal processes survive app close — tmux sessions keep running in background (spawned via `std::process::Command`, not a crate)
- [ ] **TERM-04**: PTY output respects flow control — backpressure applied when xterm.js write buffer exceeds HIGH watermark (400KB), resumed at LOW (100KB)
- [ ] **TERM-05**: Terminal resizes correctly when user drags panel split handle (FitAddon → PTY SIGWINCH via Tauri command)
- [ ] **TERM-06**: PTY stdout is streamed via `tauri::ipc::Channel<Vec<u8>>` (not JSON emit events) for ordered, low-latency delivery

### Theming

- [ ] **THEME-01**: User can define terminal colors/font in `~/.config/gsd-mux/theme.json`; all xterm.js instances apply the theme on load
- [ ] **THEME-02**: User can import their iTerm2 `.json` export and it is automatically converted to theme.json format
- [ ] **THEME-03**: When user saves changes to theme.json, all terminals hot-reload the new theme without restarting the app
- [ ] **THEME-04**: User can toggle app chrome between dark (forest-green) and light modes; toggle persists in state.json

### Session Persistence

- [ ] **PERS-01**: When user closes app, full layout state is saved to `~/.config/gsd-mux/state.json` (split ratios, active tabs, session IDs, active project)
- [ ] **PERS-02**: When user reopens app, layout is restored exactly and all tmux sessions are reattached
- [ ] **PERS-03**: When a saved tmux session no longer exists (tmux daemon died), user is warned and a fresh session is created automatically
- [ ] **PERS-04**: When state.json is missing or corrupted, app starts with default layout and logs a warning

### Project System

- [ ] **PROJ-01**: User can register a project directory (path, name, agent, gsd_file, server_cmd) and switch between registered projects
- [ ] **PROJ-02**: Sidebar shows list of registered projects; active project is highlighted with current git branch
- [ ] **PROJ-03**: Switching project updates the active tmux session and refreshes all panels (git, GSD viewer, file tree)
- [ ] **PROJ-04**: User can open a fuzzy-search project switcher with Ctrl+P and switch by typing project name

### Sidebar

- [ ] **SIDE-01**: Sidebar shows git changes section: modified/staged/untracked file counts via `git2` crate (no shell-out)
- [ ] **SIDE-02**: User can click a changed file in the sidebar to open its diff in the right panel diff viewer

### Right Panel Views

- [ ] **PANEL-01**: Right panels have independent tab bars; user can switch between GSD Viewer, Diff Viewer, File Tree, and Bash Terminal per panel
- [ ] **PANEL-02**: GSD Markdown Viewer renders the project's PLAN.md with progress bars and checkboxes; user can check/uncheck a task and it writes back to the .md file
- [ ] **PANEL-03**: GSD Viewer auto-refreshes when the watched .md file changes on disk (via `notify` crate file watcher)
- [ ] **PANEL-04**: Diff Viewer shows syntax-highlighted unified diff from `git2` — full-repo or per-file
- [ ] **PANEL-05**: File Tree shows the project directory as an interactive tree; user can navigate with ↑↓ and open files with Enter
- [ ] **PANEL-06**: Clicking a file in the File Tree opens it as a new read-only tab in the main panel
- [ ] **PANEL-07**: Bash Terminal panel is a second xterm.js instance connected to an independent tmux session for ad-hoc commands

### Server Pane & Agent Launcher

- [x] **AGENT-01**: Main panel has a collapsable server pane (bottom split, Ctrl+\` toggle) with Open in Browser / Restart / Stop actions
- [ ] **AGENT-02**: Open in Browser launches the dev server URL in the system default browser via Tauri `shell::open`
- [x] **AGENT-03**: App detects `claude` binary and launches it directly in a tmux PTY (no wrapping, no protocol modification)
- [ ] **AGENT-04**: App detects `opencode` binary and launches it directly in a tmux PTY (no wrapping, no protocol modification)
- [ ] **AGENT-05**: If neither `claude` nor `opencode` is found, app falls back to spawning a plain bash session with a banner message
- [x] **AGENT-06**: Per-project config specifies which agent to launch (claude / opencode / custom / bash)

### Keyboard & UX

- [ ] **UX-01**: App-level keyboard shortcuts are captured before terminal; terminal receives keys only when focused (no conflicts with Ctrl+C/D/Z in terminal)
- [ ] **UX-02**: User can open a new tab in the focused panel with Ctrl+T, close active tab with Ctrl+W, cycle tabs with Ctrl+Tab
- [ ] **UX-03**: When a PTY process crashes, user sees a banner with an option to restart the session
- [ ] **UX-04**: First-run wizard prompts user to add their first project and choose a default agent (Claude Code / OpenCode / bash)

---

## v2 Requirements

### Multi-Window

- **MWI-01**: User can pop out any panel into a separate native window

### Extended Theming

- **ETHM-01**: Ghostty config importer (parse Ghostty palette → theme.json)
- **ETHM-02**: Per-project theme override

### Advanced Terminal

- **ATERM-01**: In-terminal text search (Ctrl+Shift+F via `@xterm/addon-search`)
- **ATERM-02**: Scrollback search with match highlighting
- **ATERM-03**: Click URL to open in browser (`@xterm/addon-web-links`)

### Collaboration

- **COLLAB-01**: Share terminal session read-only with another user via URL

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mac App Store distribution | Permanently blocked — Apple sandbox prevents PTY spawning. No entitlement exists to override. |
| Windows / Linux | macOS first. Multi-platform support deferred indefinitely. |
| Built-in code editor | Files open in $EDITOR via xterm.js tab. Not building a Monaco/CodeMirror editor. |
| Custom AI agent protocol | Claude Code and OpenCode are spawned as-is. No protocol interception, hook injection, or output parsing. |
| AI output parsing for context | No scraping of Claude Code output. GSD context comes from .md files, not terminal stdout. |
| FiraCode ligatures in terminal | Ligatures force CoreText over Core Graphics — measurable perf regression on streaming output. Disable in terminal, keep in static panels only. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 1 | Pending |
| LAYOUT-02 | Phase 1 | Pending |
| LAYOUT-03 | Phase 1 | Pending |
| LAYOUT-04 | Phase 1 | Pending |
| LAYOUT-05 | Phase 1 | Pending |
| TERM-01 | Phase 2 | Pending |
| TERM-02 | Phase 2 | Pending |
| TERM-03 | Phase 2 | Pending |
| TERM-04 | Phase 2 | Pending |
| TERM-05 | Phase 2 | Pending |
| TERM-06 | Phase 2 | Pending |
| THEME-01 | Phase 3 | Pending |
| THEME-02 | Phase 3 | Pending |
| THEME-03 | Phase 3 | Pending |
| THEME-04 | Phase 3 | Pending |
| PERS-01 | Phase 4 | Pending |
| PERS-02 | Phase 4 | Pending |
| PERS-03 | Phase 4 | Pending |
| PERS-04 | Phase 4 | Pending |
| PROJ-01 | Phase 5 | Pending |
| PROJ-02 | Phase 5 | Pending |
| PROJ-03 | Phase 5 | Pending |
| PROJ-04 | Phase 5 | Pending |
| SIDE-01 | Phase 5 | Pending |
| SIDE-02 | Phase 5 | Pending |
| PANEL-01 | Phase 6 | Pending |
| PANEL-02 | Phase 6 | Pending |
| PANEL-03 | Phase 6 | Pending |
| PANEL-04 | Phase 6 | Pending |
| PANEL-05 | Phase 6 | Pending |
| PANEL-06 | Phase 6 | Pending |
| PANEL-07 | Phase 6 | Pending |
| AGENT-01 | Phase 7 | Complete |
| AGENT-02 | Phase 7 | Pending |
| AGENT-03 | Phase 7 | Complete |
| AGENT-04 | Phase 7 | Pending |
| AGENT-05 | Phase 7 | Pending |
| AGENT-06 | Phase 7 | Complete |
| UX-01 | Phase 8 | Pending |
| UX-02 | Phase 8 | Pending |
| UX-03 | Phase 8 | Pending |
| UX-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
