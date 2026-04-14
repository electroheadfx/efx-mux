# Architecture Research: v0.3.0 Workspace Evolution

**Domain:** Tauri desktop application extending existing MVP
**Researched:** 2026-04-14
**Confidence:** HIGH (based on existing codebase analysis)

## Existing Architecture Overview

```
+-----------------------------------------------------------------------------+
|                           TAURI SHELL (Rust)                                |
+-----------------------------------------------------------------------------+
|  lib.rs          | Entrypoint, menu setup, managed state init, invoke       |
|  terminal/pty.rs | PTY spawn, read loop, flow control, tmux integration    |
|  server.rs       | Agent process management (start/stop/restart)            |
|  git_status.rs   | git2 read ops: status, branch, file list                 |
|  file_ops.rs     | File read, directory list, checkbox write-back           |
|  file_watcher.rs | notify crate watching .planning/*.md                     |
|  state.rs        | state.json persistence (AppState struct)                 |
|  project.rs      | Project registry CRUD                                    |
+-----------------------------------------------------------------------------+
                              |
                    Tauri IPC (invoke / Channel)
                              |
+-----------------------------------------------------------------------------+
|                         PREACT FRONTEND                                      |
+-----------------------------------------------------------------------------+
|                                                                             |
|  state-manager.ts          | Signals + Rust state bridge                    |
|  theme-manager.ts          | Theme loading, terminal/chrome registration    |
|  terminal-manager.ts       | xterm.js instance creation                     |
|  pty-bridge.ts             | spawn_terminal + Channel listener              |
|                                                                             |
|  +-- components/ ---------------------------------------------------+       |
|  | sidebar.tsx        | Projects list, git changes, project switch  |       |
|  | main-panel.tsx     | Terminal tabs area, file viewer overlay     |       |
|  | terminal-tabs.tsx  | Multi-tab PTY management, tab bar UI        |       |
|  | right-panel.tsx    | GSD/Diff/FileTree tabs + Bash terminal      |       |
|  | file-tree.tsx      | Directory listing, tree/flat modes          |       |
|  | gsd-viewer.tsx     | Markdown render + checkbox write-back       |       |
|  | diff-viewer.tsx    | git diff display                            |       |
|  | server-pane.tsx    | Agent server output                         |       |
|  +------------------------------------------------------------------+       |
+-----------------------------------------------------------------------------+
```

## New Features Integration Map

### 1. File Editing in Main Panel Tabs (NEW)

**Current state:** MainPanel has read-only file viewer overlay (show-file-viewer event)
**Required:** Editable file tabs alongside terminal tabs

**Integration Points:**
- **New component:** `file-tab.tsx` - CodeMirror/Monaco editor wrapper
- **New signals:** `fileTabs: Signal<FileTab[]>`, `activeFileTabId: Signal<string>`
- **Modify:** `main-panel.tsx` - Render file tabs when present
- **Modify:** `terminal-tabs.tsx` - Extract TabBar into shared component or extend to support file tabs
- **New Rust command:** `write_file_content(path: String, content: String)` in `file_ops.rs`
- **Data flow:** 
  ```
  FileTree double-click -> file-opened event -> openFileTab() 
                        -> read_file_content IPC -> FileTab mount
  FileTab save (Cmd+S) -> write_file_content IPC -> file written
  ```

**Architecture decision:** Keep terminal tabs and file tabs in separate signal arrays but render in same TabBar UI. Reason: Different lifecycle (terminal tabs have PTY state, file tabs have dirty/clean state).

### 2. Git Control Pane - Sidebar Tab (NEW)

**Current state:** Sidebar shows read-only git status/file list
**Required:** Stage, unstage, commit, push actions

**Integration Points:**
- **New component:** `git-control.tsx` - Stage checkboxes, commit message input, push button
- **New Rust commands in git_status.rs:**
  - `stage_file(path: String)` - git add single file
  - `unstage_file(path: String)` - git reset HEAD single file
  - `stage_all()` - git add -A
  - `commit(message: String)` - git commit -m
  - `push()` - git push (with SSH key handling via git2)
- **Modify:** `sidebar.tsx` - Add tab switcher (Projects | File tree | Git control)
- **New signal:** `sidebarActiveTab: Signal<'projects' | 'filetree' | 'git'>`
- **Data flow:**
  ```
  User checks file checkbox -> stage_file IPC -> git2::add
  User clicks Commit -> commit IPC -> git2::commit
  User clicks Push -> push IPC -> git2::push (needs credential callback)
  ```

**Architecture decision:** git2 supports staging/commit directly. For push, git2 requires credential handling - use system SSH agent via `CredentialType::SshKeyFromAgent`. If push fails (no SSH key), show error dialog suggesting `git push` in terminal.

### 3. Left Sidebar Tab Switching (MODIFY)

**Current state:** Single-mode sidebar with Projects + Git Changes sections
**Required:** 3 tabs: Projects, File Tree (full sidebar), Git Control

**Integration Points:**
- **Modify:** `sidebar.tsx` - Add TabBar at top, conditionally render content
- **Move:** FileTree import from right-panel to sidebar (when in File Tree tab)
- **Data flow:**
  ```
  Tab click -> sidebarActiveTab.value = 'filetree'
            -> Conditional render: Projects | FileTree | GitControl
  ```

**Component Responsibilities:**

| Tab | Content | Behavior |
|-----|---------|----------|
| Projects | Current sidebar content (project list + git changes summary) | Project switching |
| File Tree | Full FileTree component (currently in right panel) | Navigate + open files |
| Git Control | New GitControl component | Stage/commit/push |

### 4. File Tree Enhancements (MODIFY)

**Current state:** View-only, click opens file viewer
**Required:** Delete, drag/drop, Finder drop, external editor

**Integration Points:**
- **New Rust commands in file_ops.rs:**
  - `delete_file(path: String)` - fs::remove_file / fs::remove_dir_all
  - `move_file(src: String, dest: String)` - fs::rename
  - `copy_file(src: String, dest: String)` - fs::copy
  - `create_file(dir: String, name: String)` - fs::write empty
  - `open_in_external_editor(path: String, editor: String)` - Command::new(editor).arg(path)
- **Modify:** `file-tree.tsx`:
  - Add context menu (right-click) with Delete, Open in Editor options
  - Add drag handlers (`draggable`, `onDragStart`, `onDragOver`, `onDrop`)
  - Add Finder drop zone (`onDrop` for `event.dataTransfer.files`)
- **New component:** `context-menu.tsx` - Reusable right-click menu
- **Modify:** `file_watcher.rs` - Add file change detection (currently watches .md only)

**Data flow for drag/drop:**
```
Internal drag: onDragStart stores path -> onDrop calls move_file IPC
Finder drop:   onDrop reads event.dataTransfer.files 
            -> for each file: read + write_file_content IPC (copy)
```

**Architecture decision:** For external editor, store preference in state.json under `preferences.externalEditor`. Default to `code` (VS Code). Validate binary exists before calling.

### 5. GSD Sub-Tabs (MODIFY)

**Current state:** Single GSD viewer rendering one .md file
**Required:** 5 sub-tabs parsing ROADMAP.md sections + MILESTONES.md + STATE.md

**Integration Points:**
- **Modify:** `gsd-viewer.tsx` - Add internal TabBar, parse ROADMAP.md by section
- **New helper:** `parseRoadmapSection(content: string, section: string): string`
- **New signal:** `gsdSubTab: Signal<'milestones' | 'phases' | 'progress' | 'milestones-full' | 'state'>`

**File mapping:**
| Sub-tab | Source file | Parse method |
|---------|-------------|--------------|
| Milestones | ROADMAP.md | Extract `## Milestones` section |
| Phases | ROADMAP.md | Extract `## Phases` section |
| Progress | ROADMAP.md | Extract `## Progress` section |
| Milestones (full) | MILESTONES.md | Full file |
| State | STATE.md | Full file |

**Architecture decision:** Parse on load, cache per file. Re-parse on md-file-changed event.

### 6. Main Panel Tab Dropdown (MODIFY)

**Current state:** TabBar with `+` button creates terminal
**Required:** Dropdown menu: Terminal, Agent, Git Changes

**Integration Points:**
- **Modify:** `terminal-tabs.tsx` - Replace `+` button with dropdown trigger
- **New component:** `dropdown-menu.tsx` - Reusable dropdown (or use existing pattern)
- **New component:** `git-changes-tab.tsx` - Accordion diff viewer per file
- **Data flow:**
  ```
  Click + -> Dropdown: Terminal | Agent | Git Changes | Create File
  Select Terminal -> createNewTab() (existing)
  Select Agent -> createNewTab() with agentBinary
  Select Git Changes -> createGitChangesTab() (new)
  Select Create File -> prompt for filename -> create in selected folder
  ```

**Git Changes tab architecture:**
- Query `get_git_files` for file list
- Render each file as accordion header
- Lazy-load `get_file_diff` on accordion expand
- Store in new `gitChangesTabs: Signal<GitChangesTab[]>` (separate from terminals)

### 7. Sidebar Bash Pane Enhancement (MODIFY)

**Current state:** Right panel has single Bash terminal in bottom pane
**Required:** Plus menu to add Terminal or Agent sub-terminals

**Integration Points:**
- **Modify:** `right-panel.tsx` - Add dropdown next to Bash tab
- **New signal:** `rightBottomTabs: Signal<{id: string, type: 'terminal' | 'agent', sessionName: string}[]>`
- **Reuse:** `terminal-tabs.tsx` patterns for multi-tab management in right panel

## Component Boundaries

| Component | Current Responsibility | v0.3.0 Changes |
|-----------|----------------------|----------------|
| `sidebar.tsx` | Project list + git summary | Add tab switcher, host FileTree/GitControl tabs |
| `main-panel.tsx` | Terminal area + file overlay | Add file tabs alongside terminal tabs |
| `terminal-tabs.tsx` | Terminal tab management | Add dropdown for tab types, support git-changes tabs |
| `file-tree.tsx` | Directory browse | Add delete, drag/drop, context menu, Finder drop |
| `gsd-viewer.tsx` | Markdown render | Add sub-tabs, multi-file support |
| `right-panel.tsx` | GSD/Diff/FileTree + Bash | Multi-terminal support in bottom pane |
| **NEW** `git-control.tsx` | - | Stage/unstage/commit/push UI |
| **NEW** `file-tab.tsx` | - | Code editor for open files |
| **NEW** `git-changes-tab.tsx` | - | Accordion diff viewer |
| **NEW** `context-menu.tsx` | - | Reusable right-click menu |
| **NEW** `dropdown-menu.tsx` | - | Reusable dropdown trigger |

## New Rust Commands Summary

| Command | Module | Purpose |
|---------|--------|---------|
| `write_file_content` | file_ops.rs | Save edited file |
| `delete_file` | file_ops.rs | Delete file/folder |
| `move_file` | file_ops.rs | Rename/move file |
| `copy_file` | file_ops.rs | Copy file |
| `create_file` | file_ops.rs | Create new file |
| `open_external_editor` | file_ops.rs | Launch external editor |
| `stage_file` | git_status.rs | git add single file |
| `unstage_file` | git_status.rs | git reset HEAD file |
| `stage_all` | git_status.rs | git add -A |
| `commit` | git_status.rs | git commit -m |
| `push` | git_status.rs | git push |

## Data Flow Changes

### File Editing Flow (NEW)
```
FileTree double-click
    |
    v
file-opened event (detail: {path, name})
    |
    v
main-panel.tsx: openFileTab()
    |
    +-> read_file_content IPC
    |
    v
FileTab mount (content loaded)
    |
User edits...
    |
Cmd+S
    |
    v
write_file_content IPC
    |
    v
Rust: atomic write (tmp + rename)
```

### Git Commit Flow (NEW)
```
GitControl: User selects files to stage
    |
    v
stage_file IPC (per file) or stage_all IPC
    |
    v
Rust: git2::Index::add_path / add_all
    |
User enters commit message, clicks Commit
    |
    v
commit IPC (message)
    |
    v
Rust: git2::Commit::create
    |
    v
[Optional] User clicks Push
    |
    v
push IPC
    |
    v
Rust: git2::Remote::push (SSH agent credentials)
```

### Drag/Drop Flow (NEW)
```
Internal drag:
    FileTree item -> onDragStart (store source path in dataTransfer)
    FileTree folder -> onDragOver (highlight target)
                    -> onDrop (call move_file IPC)

Finder drop:
    Finder files -> FileTree onDrop
                 -> event.dataTransfer.files
                 -> for each: read + copy_file IPC
```

## Suggested Build Order

Based on dependencies and risk:

**Phase 1: Foundation Components**
1. `context-menu.tsx` + `dropdown-menu.tsx` - Reused by multiple features
2. File write command (`write_file_content`) - Required for editing
3. Git write commands (`stage_file`, `unstage_file`, `commit`) - Required for git control

**Phase 2: Sidebar Evolution**
4. `sidebarActiveTab` signal + tab switcher UI
5. Move FileTree to sidebar (when in File Tree tab)
6. `git-control.tsx` component
7. Push command with credential handling

**Phase 3: Main Panel Tabs**
8. Tab dropdown component
9. `file-tab.tsx` with basic editor (textarea first, upgrade to CodeMirror later)
10. `git-changes-tab.tsx` accordion viewer
11. Integrate file tabs into main panel

**Phase 4: FileTree Enhancements**
12. Delete file/folder (with confirmation dialog)
13. Context menu integration
14. Internal drag/drop
15. Finder drop

**Phase 5: GSD Enhancements**
16. GSD sub-tabs
17. ROADMAP.md section parsing

**Phase 6: Right Panel Enhancements**
18. Multi-terminal support in bottom pane
19. Terminal/Agent dropdown

**Phase 7: Bug Fixes** (can be interleaved)
- File watcher reliability
- Newline injection fix
- Phantom characters on fast scroll
- Custom scrollbar
- TUI padding/alignment

## Anti-Patterns to Avoid

### 1. Monolithic Tab Component
**What people do:** Put all tab types (terminal, file, git-changes) in one giant switch statement
**Why it's wrong:** Terminal tabs have PTY lifecycle, file tabs have dirty state, git tabs have refresh state - conflating them creates coupling
**Do this instead:** Separate signal arrays (`terminalTabs`, `fileTabs`, `gitChangesTabs`) rendered by a unified TabBar that dispatches to appropriate handlers

### 2. Inline Rust Calls in Components
**What people do:** `invoke('stage_file', {...})` scattered throughout components
**Why it's wrong:** Duplicates error handling, makes testing hard, IPC details leak into UI
**Do this instead:** Centralize in service modules (`git-service.ts`, `file-service.ts`) that handle errors and expose clean async functions

### 3. Direct DOM Manipulation for Drag/Drop
**What people do:** `document.addEventListener('drag...')` in useEffect
**Why it's wrong:** Conflicts with Preact's VDOM, hard to clean up
**Do this instead:** Use Preact's `onDragStart`, `onDragOver`, `onDrop` props, store drag state in signals

### 4. Polling for Git Status
**What people do:** `setInterval(() => getGitStatus(), 1000)`
**Why it's wrong:** Wastes CPU, creates race conditions with user actions
**Do this instead:** Refresh git status after git operations (stage/unstage/commit) and on file watcher events

## Risk Areas

| Feature | Risk | Mitigation |
|---------|------|------------|
| git push | SSH credential handling can fail | Fallback to error message "Use terminal to push" |
| Finder drop | Large file copies can block UI | Show progress indicator, use streaming copy |
| File editing | Data loss on crash | Auto-save to tmp, restore on reopen |
| Drag/drop in tree | Complex state management | Build incrementally, test each interaction |
| ROADMAP.md parsing | Brittle string parsing | Use robust section markers, handle malformed gracefully |

## Sources

- Existing codebase: `/Users/lmarques/Dev/efx-mux/src-tauri/src/*.rs`
- Existing codebase: `/Users/lmarques/Dev/efx-mux/src/components/*.tsx`
- git2 staging: https://docs.rs/git2/latest/git2/struct.Index.html
- git2 commit: https://docs.rs/git2/latest/git2/struct.Repository.html#method.commit
- Tauri drag/drop: https://v2.tauri.app/develop/drop/

---
*Architecture research for: Efxmux v0.3.0 Workspace Evolution*
*Researched: 2026-04-14*
