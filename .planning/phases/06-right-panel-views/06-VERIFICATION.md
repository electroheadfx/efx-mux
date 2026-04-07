---
phase: 06-right-panel-views
verified: 2026-04-07T18:30:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "GSD Viewer auto-refreshes when watched .md file changes on disk (set_project_path now wired in main.js)"
    - "File Tree opens files in main panel (file-opened handler + file-viewer overlay now implemented)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "GSD Viewer checkbox write-back: open a project's PLAN.md in the GSD Viewer, click a checkbox, then check the .md file on disk"
    expected: "Checkbox state toggled in the file within milliseconds"
    why_human: "Requires running app + a project with a PLAN.md containing task checkboxes"
  - test: "GSD Viewer auto-refresh: with a project loaded, externally edit the PLAN.md, check that GSD Viewer updates without manual reload"
    expected: "Viewer content updates automatically within ~200ms (notify debounce)"
    why_human: "Requires running app + tmux session + external file edit"
  - test: "Diff Viewer integration with sidebar: click a modified file in the sidebar git-changed section, check the Diff tab in the right panel"
    expected: "Git diff renders with green additions, red deletions, accent-colored hunk headers"
    why_human: "Requires a project with uncommitted changes"
  - test: "File Tree -> file viewer: navigate to a file in the File Tree, press Enter (or click), verify file viewer overlay appears in main panel"
    expected: "Main panel shows READ-ONLY badge, filename, preformatted content; Close button and Escape key dismiss it"
    why_human: "Requires running app + a project with files to browse"
  - test: "Bash Terminal connection: launch app, switch to Bash tab in right-bottom panel"
    expected: "xterm.js terminal appears and connects to efx-mux-right tmux session"
    why_human: "Requires running app + tmux installed"
  - test: "Tab bar visual state: click each tab in right-top panel (GSD, Diff, File Tree)"
    expected: "Active tab shows accent-colored underline; content area switches to the corresponding view"
    why_human: "Visual appearance requires running app"
---

# Phase 6: Right Panel Views — Verification Report (Re-verification)

**Phase Goal:** User has a fully functional right panel with tabbed views for GSD plan tracking, git diffs, file browsing, and an independent bash terminal -- with live file watching and checkbox write-back
**Verified:** 2026-04-07T18:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plan 03)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Right panels have independent tab bars; user can switch between GSD Viewer, Diff Viewer, File Tree, and Bash Terminal per panel | VERIFIED | right-panel.js: TabBar(RIGHT_TOP_TABS, ...) and TabBar(RIGHT_BOTTOM_TABS, ...) wired. tab-bar.js is a substantive component with active-state styling. |
| 2 | GSD Viewer renders PLAN.md with checkboxes; checking writes back to .md file | VERIFIED | gsd-viewer.js: invoke('read_file_content'), marked.parse(), buildLineMap(), injectLineNumbers(), invoke('write_checkbox') all present and wired |
| 3 | GSD Viewer auto-refreshes when the watched .md file changes on disk | VERIFIED | listen('md-file-changed') present in gsd-viewer.js. set_project_path now called in main.js initProjects() (line 126) and project-changed handler (line 143). Watcher activation chain is complete. |
| 4 | Diff Viewer shows syntax-highlighted unified diffs from git2 | VERIFIED | diff-viewer.js: listens for open-diff event from sidebar.js, calls invoke('get_file_diff'), renders with CSS per-line highlighting (+/-/@@ patterns) |
| 5 | File tree keyboard navigation (ArrowUp/Down, Enter, Backspace) | VERIFIED | file-tree.js: handleKeydown() implements all four keys, tabindex="0" present, @keydown wired |
| 6 | Clicking a file in the File Tree opens it as a read-only viewer in the main panel | VERIFIED | main.js: document.addEventListener('file-opened') handler (line 151) reads file via invoke('read_file_content') and dispatches show-file-viewer. main-panel.js: show-file-viewer listener, reactive file-viewer-overlay with READ-ONLY badge, escapeHtml, Close/Escape dismiss. |
| 7 | Bash Terminal tab connects to independent tmux session | VERIFIED | right-panel.js: connectBashTerminal() lazy-connects on mount, calls connectPty(terminal, sessionName) with right-tmux-session name from persisted state |

**Score:** 7/7 truths verified

### Re-verification: Gap Closure Confirmation

| Gap (from previous verification) | Closed? | Evidence |
|-----------------------------------|---------|----------|
| PANEL-03: set_project_path never called from frontend | CLOSED | main.js line 126: `invoke('set_project_path', { path: project.path })` in initProjects(). Line 143: same call in project-changed handler. grep -c "set_project_path" returns 2. |
| PANEL-06: file-opened event orphaned, no handler, no tab system | CLOSED | main.js lines 151-161: file-opened handler reads file content, dispatches show-file-viewer. main-panel.js: full file-viewer-overlay implementation with reactive state, READ-ONLY badge, escapeHtml, keyboard dismiss. |

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/components/tab-bar.js` | Reusable TabBar component | VERIFIED | Substantive: TabBar(tabs, activeTab, onSwitch). Used in right-panel.js |
| `src/components/gsd-viewer.js` | GSD Markdown viewer | VERIFIED | marked.js, checkbox write-back, md-file-changed listener |
| `src/components/diff-viewer.js` | Git diff renderer | VERIFIED | escapeHtml, renderDiffHtml, get_file_diff invoke, open-diff listener |
| `src/components/file-tree.js` | Keyboard-navigable file tree | VERIFIED | keyboard nav + file-opened dispatch |
| `src/components/right-panel.js` | Right panel with tab bars | VERIFIED | All 4 components imported and used, Bash lazy-connect |
| `src/main.js` | set_project_path wiring + file-opened handler | VERIFIED | set_project_path called in initProjects() and project-changed. file-opened handler present. |
| `src/components/main-panel.js` | File viewer overlay | VERIFIED | file-viewer-overlay with reactive state, READ-ONLY badge, escapeHtml, show/hide wired |
| `src-tauri/src/file_ops.rs` | File operations backend | VERIFIED | get_file_diff, list_directory, read_file_content, write_checkbox, read_file |
| `src-tauri/src/file_watcher.rs` | .md file watcher | VERIFIED | start_md_watcher with 200ms debounce, set_project_path command |
| `src-tauri/src/lib.rs` | All Phase 6 commands registered | VERIFIED | All file_ops + file_watcher commands in generate_handler!, PtyManager initialized in setup() |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/components/right-panel.js | src/components/tab-bar.js | TabBar() renders tab bar UI | WIRED | TabBar(RIGHT_TOP_TABS, ...) and TabBar(RIGHT_BOTTOM_TABS, ...) |
| src/components/right-panel.js | src/components/gsd-viewer.js | GSDViewer(activeProject) | WIRED | GSDViewer(() => state.activeProject) |
| src/components/gsd-viewer.js | src-tauri/src/file_ops.rs | invoke('write_checkbox'), invoke('read_file_content') | WIRED | invoke('read_file_content') + invoke('write_checkbox') both present |
| src/components/diff-viewer.js | src-tauri/src/file_ops.rs | invoke('get_file_diff') | WIRED | invoke('get_file_diff', { path: filePath }) |
| src/components/diff-viewer.js | src/components/sidebar.js | open-diff CustomEvent | WIRED | sidebar.js dispatches; diff-viewer.js listens |
| src/components/file-tree.js | src-tauri/src/file_ops.rs | invoke('list_directory') | WIRED | invoke('list_directory', { path }) |
| src/components/file-tree.js | src/main.js | file-opened CustomEvent | WIRED | file-tree.js dispatches; main.js addEventListener('file-opened') consumes |
| src/main.js | src/components/main-panel.js | show-file-viewer CustomEvent | WIRED | main.js dispatches; main-panel.js document.addEventListener('show-file-viewer') consumes |
| src/main.js | src-tauri/src/file_watcher.rs | invoke('set_project_path') | WIRED | Called in initProjects() on startup and in project-changed handler |
| src/components/right-panel.js | src/terminal/pty-bridge.js | connectPty(rightTerminal, session) | WIRED | connectPty(terminal, sessionName) |
| src-tauri/src/lib.rs | src-tauri/src/terminal/pty.rs | PtyManager state via app.manage() | WIRED | setup(): app.manage(PtyManager(...)) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| gsd-viewer.js | contentEl innerHTML | invoke('read_file_content') -> marked.parse() | Yes — Rust reads file from disk | FLOWING |
| diff-viewer.js | contentEl innerHTML | invoke('get_file_diff') -> renderDiffHtml() | Yes — Rust git2 diff | FLOWING |
| file-tree.js | state.entries | invoke('list_directory') | Yes — Rust reads directory | FLOWING |
| right-panel.js | state.activeProject | getProjects() + getActiveProject() -> Rust | Yes — project registry | FLOWING |
| gsd-viewer.js | md-file-changed event trigger | set_project_path -> start_md_watcher -> Tauri emit | Yes — watcher now activated from main.js on startup and project switch | FLOWING |
| main-panel.js | state.fileContent | file-opened -> invoke('read_file_content') | Yes — Rust reads file content | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cargo check passes | cargo check in src-tauri/ | "Finished `dev` profile" | PASS |
| set_project_path called at least twice in main.js | grep -c set_project_path src/main.js | 2 | PASS |
| file-opened handler in main.js | grep -n file-opened src/main.js | line 151: addEventListener present | PASS |
| show-file-viewer dispatched in main.js | grep show-file-viewer src/main.js | line 155: CustomEvent dispatch | PASS |
| file-viewer-overlay in main-panel.js | grep file-viewer-overlay src/components/main-panel.js | line 52: present | PASS |
| show-file-viewer listener in main-panel.js | grep show-file-viewer src/components/main-panel.js | line 14: addEventListener | PASS |
| terminal-area preserved in main-panel.js | grep terminal-area src/components/main-panel.js | line 50: present | PASS |
| server-pane preserved in main-panel.js | grep server-pane src/components/main-panel.js | lines 126-135: present | PASS |
| No TODO in project-changed handler | grep TODO src/main.js | no output | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PANEL-01 | 06-01, 06-02 | Right panels have independent tab bars | SATISFIED | TabBar in right-panel.js for both sub-panels |
| PANEL-02 | 06-01, 06-02 | GSD Viewer renders PLAN.md with checkboxes; write-back on check | SATISFIED | gsd-viewer.js full implementation verified |
| PANEL-03 | 06-01, 06-02, 06-03 | GSD Viewer auto-refreshes via notify crate file watcher | SATISFIED | set_project_path now wired in main.js; full chain complete |
| PANEL-04 | 06-01, 06-02 | Diff Viewer shows syntax-highlighted unified diffs from git2 | SATISFIED | diff-viewer.js wired to get_file_diff via open-diff event |
| PANEL-05 | 06-02 | File Tree keyboard navigation (arrows + Enter) | SATISFIED | handleKeydown() in file-tree.js implements ArrowUp/Down/Enter/Backspace |
| PANEL-06 | 06-02, 06-03 | Clicking file in File Tree opens it as read-only viewer in main panel | SATISFIED | file-opened chain complete: file-tree -> main.js -> main-panel overlay |
| PANEL-07 | 06-02 | Bash Terminal tab connected to independent tmux session | SATISFIED | connectBashTerminal() in right-panel.js with session-aware connectPty |

### Anti-Patterns Found

None. The TODO comment previously present in the project-changed handler (line 127) has been removed. No placeholders, stubs, or TODO comments found in Phase 6 modified files.

### Human Verification Required

**1. GSD Viewer Checkbox Write-Back**

**Test:** Open a project's PLAN.md in the GSD Viewer. Click a checkbox. Check the .md file on disk.
**Expected:** Checkbox state toggled in the file within milliseconds.
**Why human:** Requires running app + a project with a PLAN.md file containing task checkboxes.

**2. GSD Viewer Auto-Refresh**

**Test:** With a project loaded, externally edit the project's PLAN.md (or any .md file in the project dir) using a text editor. Check if the GSD Viewer updates without a manual reload.
**Expected:** Viewer content updates automatically within ~200ms (notify debounce interval).
**Why human:** Requires running app + set_project_path activation confirmed at runtime.

**3. Diff Viewer Integration with Sidebar**

**Test:** Click a modified file in the sidebar git-changed section. Check the Diff tab in the right panel.
**Expected:** Git diff renders with green additions, red deletions, accent-colored hunk headers.
**Why human:** Requires a project with uncommitted changes.

**4. File Tree File Viewer**

**Test:** Navigate to a file in the File Tree, then press Enter (or click). Verify the file viewer overlay appears in the main panel.
**Expected:** Main panel shows READ-ONLY badge, filename, preformatted file content; Close button and Escape key both dismiss the overlay and reveal the terminal underneath.
**Why human:** Requires running app + a project with files to browse.

**5. Bash Terminal Connection**

**Test:** Launch the app. Switch to the Bash tab in the right-bottom panel.
**Expected:** An xterm.js terminal appears and connects to a tmux session (efx-mux-right or the persisted session name).
**Why human:** Requires running app + tmux installed.

**6. Tab Bar Visual State**

**Test:** Click each tab in the right-top panel (GSD, Diff, File Tree).
**Expected:** Active tab shows accent-colored bottom border; content area switches to the correct view; state is preserved when switching back (GSD Viewer does not reload from scratch on every tab switch).
**Why human:** Visual appearance and state preservation require running app.

### Gaps Summary

No gaps remain. Both gaps from the initial verification (2026-04-07T18:00:00Z) were closed by Plan 03:

- **PANEL-03 closed:** `invoke('set_project_path', { path: project.path })` is now called in `initProjects()` on app startup (if an active project exists) and in the `project-changed` event handler on every project switch. The md file watcher activation chain is now fully wired.

- **PANEL-06 closed:** `document.addEventListener('file-opened', ...)` handler in `main.js` reads file content via `invoke('read_file_content')` and dispatches `show-file-viewer`. `main-panel.js` was rewritten to include a reactive file-viewer-overlay with READ-ONLY badge, filename display, `escapeHtml`-protected content, and both Close button and Escape key dismiss. The terminal `div.terminal-area` and `div.server-pane` are preserved underneath the overlay.

All 7 observable truths are now VERIFIED by code inspection. The phase proceeds to human verification for runtime behavior.

---

_Verified: 2026-04-07T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after gap closure: Plan 03 (06-03-PLAN.md)_
