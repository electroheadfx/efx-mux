---
phase: 06-right-panel-views
verified: 2026-04-07T18:00:00Z
status: gaps_found
score: 5/7 truths verified
overrides_applied: 0
gaps:
  - truth: "GSD Viewer auto-refreshes when watched .md file changes on disk"
    status: failed
    reason: "set_project_path is registered as a Tauri command but is never invoked from the frontend. The md file watcher never starts, so md-file-changed events never fire. The project-changed handler in main.js has a TODO comment acknowledging this is incomplete."
    artifacts:
      - path: "src/main.js"
        issue: "project-changed handler (line 127) has TODO: 'update tmux session, GSD viewer path, git panels' — set_project_path is not called on project load or switch"
      - path: "src/state-manager.js"
        issue: "switchProject() does not call set_project_path"
    missing:
      - "Call invoke('set_project_path', { path: project.path }) when a project is loaded (on app init with active project) and on each project-changed event"
      - "Call set_project_path in the project-changed handler in main.js (or in right-panel.js loadActiveProject())"

  - truth: "File Tree is keyboard-navigable (arrows + Enter) and opens files in main panel"
    status: partial
    reason: "Keyboard navigation works (ArrowUp/Down, Enter, Backspace all implemented). But 'opens files in main panel' fails: file-tree.js dispatches file-opened CustomEvent, but no handler exists anywhere in the app to consume it. The main panel (main-panel.js) has a single terminal-area div — no tab infrastructure. PANEL-06 requires opening the file as a new read-only tab."
    artifacts:
      - path: "src/components/file-tree.js"
        issue: "Dispatches file-opened CustomEvent (line 53) but no handler consumes it"
      - path: "src/main.js"
        issue: "No addEventListener('file-opened') handler present"
      - path: "src/components/main-panel.js"
        issue: "No tab system — only a single terminal-area div, no mechanism to open read-only file tabs"
    missing:
      - "Add document.addEventListener('file-opened', handler) in main.js or right-panel.js"
      - "Implement file tab rendering in main-panel.js (or an alternative view) to display file content read-only"
      - "Call invoke('read_file_content', { path }) on file-opened and render the content"
---

# Phase 6: Right Panel Views — Verification Report

**Phase Goal:** User has a fully functional right panel with tabbed views for GSD plan tracking, git diffs, file browsing, and an independent bash terminal -- with live file watching and checkbox write-back
**Verified:** 2026-04-07T18:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Right panels have independent tab bars; user can switch between GSD Viewer, Diff Viewer, File Tree, and Bash Terminal per panel | VERIFIED | right-panel.js: TabBar(RIGHT_TOP_TABS, ...) and TabBar(RIGHT_BOTTOM_TABS, ...) wired. tab-bar.js substantive component. |
| 2 | GSD Viewer renders PLAN.md with checkboxes; checking writes back to .md file | VERIFIED | gsd-viewer.js: invoke('read_file_content'), marked.parse(), buildLineMap(), injectLineNumbers(), invoke('write_checkbox') all present and wired |
| 3 | GSD Viewer auto-refreshes when the watched .md file changes on disk | FAILED | listen('md-file-changed') is present in gsd-viewer.js but the watcher is NEVER activated — set_project_path is never called from any frontend code |
| 4 | Diff Viewer shows syntax-highlighted unified diffs from git2 | VERIFIED | diff-viewer.js: listens for open-diff event from sidebar.js, calls invoke('get_file_diff'), renders with CSS per-line highlighting (+/-/@@ patterns) |
| 5 | File tree keyboard navigation (ArrowUp/Down, Enter, Backspace) | VERIFIED | file-tree.js: handleKeydown() implements all four keys, tabindex="0" present, @keydown wired |
| 6 | Clicking a file in the File Tree opens it as a read-only tab in the main panel | FAILED | file-tree.js dispatches file-opened CustomEvent (line 53) but no handler exists anywhere. main-panel.js has no tab system — only a single terminal-area div. |
| 7 | Bash Terminal tab connects to independent tmux session | VERIFIED | right-panel.js: connectBashTerminal() lazy-connects on mount, calls connectPty(terminal, sessionName) with right-tmux-session name from persisted state |

**Score:** 5/7 truths verified

### Deferred Items

None identified — gaps are not covered by later milestone phases.

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|---------- |--------|---------|
| `src/components/tab-bar.js` | Reusable TabBar component | VERIFIED | Substantive: exports TabBar(tabs, activeTab, onSwitch). Used in right-panel.js |
| `src/components/gsd-viewer.js` | GSD Markdown viewer | VERIFIED | Substantive: 152 lines, marked.js, checkbox write-back, md-file-changed listener |
| `src/components/diff-viewer.js` | Git diff renderer | VERIFIED | Substantive: 101 lines, escapeHtml, renderDiffHtml, get_file_diff invoke |
| `src/components/file-tree.js` | Keyboard-navigable file tree | VERIFIED (partial) | Substantive: 153 lines, keyboard nav works; file-opened dispatch unwired |
| `src/components/right-panel.js` | Right panel with tab bars | VERIFIED | Substantive: 133 lines, imports all 4 components, Bash lazy-connect |
| `src-tauri/src/terminal/pty.rs` | PtyManager HashMap, session-aware PTY commands | VERIFIED | PtyManager(Mutex<HashMap<String, PtyState>>), all 4 commands take session_name |
| `src-tauri/src/file_ops.rs` | File operations backend | VERIFIED | 217 lines: get_file_diff, list_directory, read_file_content, write_checkbox, read_file |
| `src-tauri/src/file_watcher.rs` | .md file watcher | VERIFIED (infrastructure) | 100 lines, start_md_watcher with 200ms debounce, set_project_path command |
| `src-tauri/src/lib.rs` | All Phase 6 commands registered | VERIFIED | All file_ops + file_watcher commands in generate_handler!, PtyManager initialized in setup() |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/components/right-panel.js | src/components/tab-bar.js | TabBar() renders tab bar UI | WIRED | Line 92, 115: TabBar(RIGHT_TOP_TABS, ...) and TabBar(RIGHT_BOTTOM_TABS, ...) |
| src/components/right-panel.js | src/components/gsd-viewer.js | GSDViewer(activeProject) | WIRED | Line 85: GSDViewer(() => state.activeProject) |
| src/components/gsd-viewer.js | src-tauri/src/file_ops.rs | invoke('write_checkbox'), invoke('read_file_content') | WIRED | Line 82: invoke('read_file_content'), line 124: invoke('write_checkbox') |
| src/components/diff-viewer.js | src-tauri/src/file_ops.rs | invoke('get_file_diff') | WIRED | Line 67: invoke('get_file_diff', { path: filePath }) |
| src/components/diff-viewer.js | src/components/sidebar.js | open-diff CustomEvent | WIRED | sidebar.js line 175 dispatches; diff-viewer.js line 75 listens |
| src/components/file-tree.js | src-tauri/src/file_ops.rs | invoke('list_directory') | WIRED | Line 32: invoke('list_directory', { path }) |
| src/components/file-tree.js | main panel | file-opened CustomEvent | NOT WIRED | file-tree.js dispatches file-opened (line 53) but NO handler exists anywhere |
| src/components/right-panel.js | src/terminal/pty-bridge.js | connectPty(rightTerminal, session) | WIRED | Line 71: connectPty(terminal, sessionName) |
| src-tauri/src/lib.rs | src-tauri/src/terminal/pty.rs | PtyManager state via app.manage() | WIRED | setup() line 64: app.manage(PtyManager(...)) |
| Frontend | src-tauri/src/file_watcher.rs | invoke('set_project_path') | NOT WIRED | set_project_path registered as command but never invoked from any frontend code |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| gsd-viewer.js | contentEl.innerHTML | invoke('read_file_content') → marked.parse() | Yes — Rust reads file from disk | FLOWING |
| diff-viewer.js | contentEl.innerHTML | invoke('get_file_diff') → renderDiffHtml() | Yes — Rust git2 diff | FLOWING |
| file-tree.js | state.entries | invoke('list_directory') | Yes — Rust reads directory | FLOWING |
| right-panel.js | state.activeProject | getProjects() + getActiveProject() → Rust | Yes — project registry | FLOWING |
| gsd-viewer.js | md-file-changed event trigger | start_md_watcher → Tauri emit | No — watcher never started | DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cargo check passes | cargo check in src-tauri/ | "Finished `dev` profile" | PASS |
| All Phase 6 commands registered | grep file_ops lib.rs | file_ops::get_file_diff, list_directory, read_file_content, read_file, write_checkbox found | PASS |
| PtyManager initialized once | grep PtyManager lib.rs | app.manage(PtyManager(Mutex::new(HashMap::new()))) in setup() | PASS |
| pty-bridge passes sessionName | grep sessionName pty-bridge.js | invoke('write_pty', { data, sessionName }), invoke('ack_bytes', { count, sessionName }) | PASS |
| marked.js in import map | grep marked index.html | "marked": "/vendor/marked.mjs" found | PASS |
| file-opened handler exists | grep file-opened src/ | Only defined in file-tree.js dispatch — no consumer | FAIL |
| set_project_path called from frontend | grep set_project_path src/ | Not found — watcher never activated | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PANEL-01 | 06-01, 06-02 | Right panels have independent tab bars | SATISFIED | TabBar in right-panel.js for both sub-panels |
| PANEL-02 | 06-01, 06-02 | GSD Viewer renders PLAN.md with checkboxes; write-back on check | SATISFIED | gsd-viewer.js full implementation verified |
| PANEL-03 | 06-01, 06-02 | GSD Viewer auto-refreshes via notify crate file watcher | BLOCKED | md-file-changed listener exists in frontend but set_project_path never called |
| PANEL-04 | 06-01, 06-02 | Diff Viewer shows syntax-highlighted unified diffs from git2 | SATISFIED | diff-viewer.js wired to get_file_diff via open-diff event |
| PANEL-05 | 06-02 | File Tree keyboard navigation (arrows + Enter) | SATISFIED | handleKeydown() in file-tree.js implements ArrowUp/Down/Enter/Backspace |
| PANEL-06 | 06-02 | Clicking file in File Tree opens it as read-only tab in main panel | BLOCKED | file-opened event dispatched but no handler; main-panel.js has no tab system |
| PANEL-07 | 06-02 | Bash Terminal tab connected to independent tmux session | SATISFIED | connectBashTerminal() in right-panel.js with session-aware connectPty |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/main.js | 127 | TODO comment: "update tmux session, GSD viewer path, git panels" in project-changed handler | Warning | Confirms set_project_path is intentionally deferred but not done — affects PANEL-03 |

### Human Verification Required

The following behaviors require human testing in the running app:

**1. GSD Viewer Checkbox Write-Back**
Test: Open a project's PLAN.md in the GSD Viewer. Click a checkbox. Check the .md file on disk.
Expected: Checkbox state toggled in the file within milliseconds.
Why human: Requires running app + a project with a PLAN.md file containing task checkboxes.

**2. Diff Viewer Integration with Sidebar**
Test: Click a modified file in the sidebar. Check the right panel Diff tab.
Expected: Git diff renders with green additions, red deletions, accent hunk headers.
Why human: Requires a project with uncommitted changes.

**3. Bash Terminal Connection**
Test: Launch the app. Check the right-bottom panel's Bash tab.
Expected: A bash terminal connected to efx-mux-right tmux session appears.
Why human: Requires running app + tmux installed.

**4. Tab Bar Visual State**
Test: Click each tab in right-top panel (GSD, Diff, File Tree).
Expected: Active tab shows accent-colored underline; content switches correctly.
Why human: Visual appearance requires running app.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — PANEL-03: md file watcher never activated**
The `file_watcher.rs` infrastructure is complete and substantive. The frontend `gsd-viewer.js` listens for `md-file-changed` events. However, the Tauri command `set_project_path` (which starts the watcher) is never invoked from the frontend. The `project-changed` handler in `main.js` (line 124-128) has a TODO comment acknowledging incomplete integration. Without calling `set_project_path` with the project path on app load and on project switch, the notify watcher never starts and `md-file-changed` events never fire.

Fix: In `src/state-manager.js` `switchProject()` or in `src/main.js` `project-changed` handler, add `invoke('set_project_path', { path: project.path })` after determining the active project.

**Gap 2 — PANEL-06: file-opened event orphaned**
`file-tree.js` dispatches a `file-opened` CustomEvent when the user presses Enter or clicks a file. The comment says "for main.js to handle." However, no handler exists in `main.js`, `right-panel.js`, or any other file. Additionally, `main-panel.js` has no tab system — it is a single `terminal-area` div. PANEL-06 requires "opens it as a new read-only tab in the main panel" which requires both a handler and a tab rendering mechanism that does not exist.

Fix: Add a `document.addEventListener('file-opened', ...)` handler that invokes `read_file_content` and displays the content. Given there is no tab system in the main panel, a simpler approach (overlay or right-panel tab) may be appropriate as a partial implementation.

---

_Verified: 2026-04-07T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
