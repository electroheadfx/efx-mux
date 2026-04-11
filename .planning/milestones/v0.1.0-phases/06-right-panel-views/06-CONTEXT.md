# Phase 6: Right Panel Views - Context

**Gathered:** 2026-04-07 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

User has a fully functional right panel with tabbed views for GSD plan tracking, git diffs, file browsing, and an independent bash terminal -- with live file watching and checkbox write-back. Covers PANEL-01 through PANEL-07.

</domain>

<decisions>
## Implementation Decisions

### GSD Viewer (PANEL-02, PANEL-03)
- **D-01:** GSD Viewer reads PLAN.md via new Rust `read_file` Tauri command, rendered with marked.js v14. Checkboxes rendered as `<input type="checkbox" class="task-checkbox" data-line="N" ${checked ? 'checked' : ''}>` via listitem post-processing (since checkbox token has no line number). On change event: invoke `write_checkbox({ path, line, checked })` Rust command to rewrite the .md line.
- **D-02:** File watcher: reuse `notify`-based watcher from `theme/watcher.rs` pattern (notify-debouncer-mini, 200ms debounce, background thread, Tauri event to frontend). Single shared watcher for both theme changes and project .md files.
- **D-03:** GSD Viewer auto-refresh: frontend listens for `file-changed` Tauri event, re-fetches and re-renders on receipt.

### Diff Viewer (PANEL-04)
- **D-04:** New Rust command `get_file_diff(path: String) -> String` using git2 `Patch::to_buf()` API. Frontend receives unified diff string, syntax-highlighted with CSS (additions=green bg, deletions=red bg, context=muted). No additional highlighting library needed.
- **D-05:** `open-diff` event from sidebar (already wired in Phase 5) triggers `invoke('get_file_diff', { path })` and renders result in Diff tab of right-top panel.

### File Tree (PANEL-05, PANEL-06)
- **D-06:** New Rust commands: `list_directory(path: String) -> Vec<FileEntry>` where `FileEntry { name, path, is_dir }`, and `read_file_content(path: String) -> String`. Both use `spawn_blocking`.
- **D-07:** File Tree JS component: Arrow.js reactive component with keyboard navigation (↑↓ updates `selectedIndex`, Enter opens file). Mirrors FuzzySearch keyboard pattern from `fuzzy-search.js`.
- **D-08:** Clicking a file or pressing Enter dispatches `file-opened` CustomEvent. `main.js` catches it and opens file content in a new read-only tab in the main panel (same tab mechanism as main panel tabs).

### Bash Terminal (PANEL-07)
- **D-09:** PtyManager restructured as `HashMap<String, PtyState>` wrapper (Tauri 2 state management pattern). Each PTY identified by session name. Main terminal uses `main-tmux-session`, right-bottom uses `right-tmux-session`.
- **D-10:** Right-bottom bash terminal connects to `right-tmux-session` via `connectPty(rightTerminal, 'right-tmux-session')`. Uses same `createTerminal()` pattern from `terminal-manager.js`.

### Tab Bars (PANEL-01)
- **D-11:** Right-top panel tabs: GSD Viewer | Diff Viewer | File Tree. Right-bottom panel tabs: Bash Terminal (only one for now, structure allows expansion).
- **D-12:** Tab bar component: Arrow.js component with `tabs: string[]` reactive array and `activeTab` reactive string. Click tab → update `activeTab`. CSS: active tab has accent bottom border.

### Claude's Discretion
- Exact CSS for syntax highlighting in diff viewer (shade of green/red)
- GSD Viewer markdown styling (heading sizes, code block styling)
- File tree expand/collapse behavior (click arrow vs click row)
- Tab bar visual design (pill vs underline style)
- File open tab styling (read-only badge, close button)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Right panel scaffold
- `src/components/right-panel.js` — Phase 1 placeholder with two sub-panels, split handle, "[ GSD Viewer / Diff -- Phase 6 ]" and "[ File Tree / Bash -- Phase 6 ]" placeholders
- `src/components/sidebar.js` — Phase 5: dispatches 'open-diff' event on file click (line 175)

### Terminal architecture
- `src/terminal/terminal-manager.js` — Phase 2: `createTerminal()` pattern, `connectPty(terminal, sessionName)`
- `src/terminal/pty-bridge.js` — Phase 2: PTY bridge with `connectPty(sessionName)`
- `src-tauri/src/terminal/pty.rs` — Current single PtyState, needs refactor to HashMap wrapper

### State management
- `src-tauri/src/state.rs` — SessionState has `right_tmux_session: String` (line 89)
- `src/state-manager.js` — Phase 5: project helpers

### Theme watcher (reusable pattern for file watcher)
- `src-tauri/src/theme/watcher.rs` — notify-debouncer-mini, 200ms debounce, background thread, Tauri event emission

### Phase 5 decisions
- `.planning/phases/05-project-system-sidebar/05-CONTEXT.md` — D-09: open-diff event wired, diff viewer deferred to Phase 6
- `.planning/phases/05-project-system-sidebar/05-UI-SPEC.md` — Section 4 wireframes for right panel tab layout

### Requirements
- `.planning/REQUIREMENTS.md` §Right Panel Views (PANEL-01 through PANEL-07)
- `.planning/REQUIREMENTS.md` §Sidebar (SIDE-02): "User can click a changed file in the sidebar to open its diff in the right panel"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `theme/watcher.rs`: Complete file watcher pattern to replicate for .md file watching
- `git_status.rs`: git2 spawn_blocking command pattern — extend with `get_file_diff` and `list_directory`
- `fuzzy-search.js` keyboard navigation (↑↓ Enter): Mirror for File Tree
- `state.rs` `right_tmux_session`: Already exists in SessionState, just needs PtyManager refactor
- `terminal-manager.js` `createTerminal()`: Reuse for right-bottom bash terminal

### Established Patterns
- Arrow.js `reactive({})` + `html` template literals
- Tauri `#[tauri::command]` async wrappers over `spawn_blocking`
- CustomEvent cross-component communication (`open-diff`, `project-changed`)
- CSS custom properties for theming (Solarized Dark palette)

### Integration Points
- `sidebar.js` → `open-diff` event → main.js → Diff tab in right-top
- `project-changed` event → GSD Viewer refresh
- `right-tmux-session` from state.json → PtyManager lookup → right-bottom terminal
- File Tree `file-opened` event → main.js tab opening

</code_context>

<deferred>
## Deferred Ideas

- Per-file git status list in sidebar (UI-SPEC shows file rows in GIT CHANGES section, Phase 5 git_status returns counts only, per-file status is Phase 6 or later)
- Multiple bash terminals (PANEL-07 is one bash terminal; tab support for additional shells is Phase 8 keyboard work)
- Tab management: close tab, drag-reorder tabs (Phase 8)

</deferred>
