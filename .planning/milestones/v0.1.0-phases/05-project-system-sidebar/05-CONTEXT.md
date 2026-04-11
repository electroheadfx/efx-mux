# Phase 5: Project System + Sidebar - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

User can register multiple project directories and switch between them -- each switch atomically updates the terminal session, sidebar git status, and all panel content. Covers PROJ-01 through PROJ-04 and SIDE-01 through SIDE-02.

</domain>

<decisions>
## Implementation Decisions

### Project data model
- **D-01:** Project registry stored in state.json as a `projects` array alongside existing layout/theme/session fields. Each entry: `{ path, name, agent, gsd_file, server_cmd }`. Active project tracked by `project.active` (already exists in state.rs as `ProjectState { active: Option<String> }`).
- **D-02:** Rust `ProjectState` struct extended with `projects: Vec<ProjectEntry>` where `ProjectEntry` has all PROJ-01 fields. Serialized to state.json via existing atomic write.

### Project registration
- **D-03:** Add-project triggered from sidebar via a "+" button. Opens a modal dialog with fields: path (directory picker via Tauri dialog API), name (auto-filled from directory basename, editable), agent (dropdown: claude/opencode/bash), gsd_file (optional path), server_cmd (optional string).
- **D-04:** First-run detection: if `projects` array is empty on startup, show the add-project modal automatically (satisfies UX-04 first-run wizard partially).

### Sidebar layout
- **D-05:** Expanded sidebar has two sections: project list (top, scrollable) and git changes (bottom, collapsible). Active project highlighted with Solarized Dark accent color (#258ad1). Each project shows name + current git branch as a badge.
- **D-06:** Collapsed sidebar (40px icon strip) shows project initials/icons only. Click expands sidebar and highlights clicked project.

### Git status integration
- **D-07:** Use `git2` crate via `tauri::async_runtime::spawn_blocking` (same pattern as state.rs). Expose `get_git_status` Tauri command returning `{ branch, modified, staged, untracked }` counts.
- **D-08:** Git status refreshes on: (a) project switch, (b) file system `notify` events on the `.git` directory, (c) manual sidebar refresh button. No polling interval.
- **D-09:** Sidebar git section shows file counts as colored badges (modified=yellow, staged=green, untracked=gray). Clicking a changed file opens its diff in the right panel (SIDE-02 — wired as event, actual diff viewer is Phase 6).

### Project switching
- **D-10:** Atomic switch sequence: (1) update state.json active project, (2) `tmux send-keys` to cd into new project directory in existing tmux session, (3) refresh sidebar git status, (4) emit `project-changed` event for panels to react. Keep same tmux session — cd, not kill+recreate.
- **D-11:** If the new project's directory doesn't exist (deleted/moved), show warning toast and keep current project active. Don't crash or silently fail.

### Fuzzy search (Ctrl+P)
- **D-12:** Overlay modal with text input, fuzzy-match against project names. Arrow keys + Enter to select, Escape to dismiss. Plain JS implementation — no external fuzzy search library needed for small project counts.
- **D-13:** Ctrl+P captured at app level (before terminal focus). Modal appears centered, dimmed background. Results update as user types.

### Claude's Discretion
- Modal styling and animation details
- Exact sidebar section heights and spacing
- Git badge icon choices
- Fuzzy search scoring algorithm
- Error toast styling and duration

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### State persistence layer
- `src-tauri/src/state.rs` — Existing AppState struct with ProjectState, atomic write pattern, spawn_blocking I/O
- `src/state-manager.js` — JS bridge to Rust state, loadAppState/updateLayout/updateSession pattern

### Sidebar scaffold
- `src/components/sidebar.js` — Phase 1 placeholder with NAV_ICONS array, ready for project list replacement

### Layout and bootstrap
- `src/main.js` — App bootstrap, reactive state, component mounting, keyboard handler wiring
- `src/drag-manager.js` — Split handle drag logic, CSS custom property updates

### Requirements
- `.planning/REQUIREMENTS.md` §Project System (PROJ-01 through PROJ-04) — Project registration fields, switching behavior, fuzzy search
- `.planning/REQUIREMENTS.md` §Sidebar (SIDE-01, SIDE-02) — Git status display, file click to diff

No external specs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `state-manager.js`: Pattern for Rust state bridge — extend with `updateProject()`, `getProjects()`, `switchProject()` helpers
- `state.rs` `ProjectState`: Already has `active: Option<String>` — extend with `projects: Vec<ProjectEntry>`
- `sidebar.js`: Arrow.js component with collapsed/expanded modes — replace NAV_ICONS with dynamic project list
- `drag-manager.js`: CSS custom property pattern for layout persistence
- `theme-manager.js`: Event-driven update pattern (file watcher → re-render) reusable for git status refresh

### Established Patterns
- Arrow.js `reactive({})` + `html` template literals for UI (no virtual DOM, expression-level reactivity)
- Tauri `#[tauri::command]` for Rust-JS bridge, `invoke()` from JS side
- `spawn_blocking` for sync I/O operations (git2, file I/O)
- CSS custom properties for layout dimensions
- Solarized Dark theme with `--accent: #258ad1`

### Integration Points
- `src/main.js` needs to pass project data to Sidebar component
- `src-tauri/src/lib.rs` needs new Tauri commands: `get_git_status`, `add_project`, `remove_project`, `switch_project`
- Ctrl+P keybinding needs to be added alongside existing Ctrl+B handler
- `project-changed` custom event for cross-component communication (sidebar → main panel → right panel)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- Diff viewer for clicked files (SIDE-02 click handler wired in Phase 5, actual diff rendering is Phase 6 PANEL-04)
- Project-specific agent launching (AGENT-06 — Phase 7)
- Full first-run wizard (UX-04 — spans multiple phases; Phase 5 handles project registration part only)

</deferred>

---

*Phase: 05-project-system-sidebar*
*Context gathered: 2026-04-07*
