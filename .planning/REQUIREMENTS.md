# Requirements: Efxmux v0.3.0

**Defined:** 2026-04-14
**Core Value:** Single native macOS window that co-locates AI agent terminals alongside live GSD progress, git diff, and file tree

## v0.3.0 Requirements

Requirements for Workspace Evolution release. Each maps to roadmap phases.

### File Editing (EDIT)

- [ ] **EDIT-01**: User can open files in main panel tabs with CodeMirror 6 syntax highlighting
- [ ] **EDIT-02**: User sees unsaved indicator (dot) in tab title when file has uncommitted changes
- [ ] **EDIT-03**: User can save file with Cmd+S keyboard shortcut
- [ ] **EDIT-04**: User sees confirmation modal when closing tab with unsaved changes
- [ ] **EDIT-05**: User can reorder tabs via drag and drop

### Git Control (GIT)

- [ ] **GIT-01**: User can stage individual files via checkboxes in git control pane
- [ ] **GIT-02**: User can unstage individual files via checkboxes
- [ ] **GIT-03**: User can commit staged changes with message input
- [ ] **GIT-04**: User can push commits to remote repository
- [ ] **GIT-05**: User can undo last commit (soft reset)

### File Tree (TREE)

- [ ] **TREE-01**: User can delete files/folders via context menu with confirmation dialog
- [ ] **TREE-02**: User can delete files/folders via Delete key with confirmation dialog
- [ ] **TREE-03**: User can open file in external editor (Zed, VSCode) via context menu
- [ ] **TREE-04**: User can drag/drop files and folders to reorder within tree
- [ ] **TREE-05**: User can drag files from Finder into tree to import

### GSD Viewer (GSD)

- [ ] **GSD-01**: User can view Milestones sub-tab parsed from ROADMAP.md
- [ ] **GSD-02**: User can view Phases sub-tab parsed from ROADMAP.md
- [ ] **GSD-03**: User can view Progress sub-tab parsed from ROADMAP.md
- [ ] **GSD-04**: User can view History sub-tab from MILESTONES.md
- [ ] **GSD-05**: User can view State sub-tab (current position + decisions) from STATE.md

### Sidebar (SIDE)

- [ ] **SIDE-01**: User can switch between 3 sidebar tabs: Projects, File Tree, Git Control
- [ ] **SIDE-02**: User can add Terminal/Agent sub-TUI via plus menu in sidebar bash pane

### Main Panel (MAIN)

- [ ] **MAIN-01**: User can add new tabs via dropdown menu (Terminal Zsh, Agent, Git changes)
- [ ] **MAIN-02**: User can view git changes panel with accordion per-file diffs
- [ ] **MAIN-03**: User can create new file from folder context in file tree

### Bug Fixes (FIX)

- [ ] **FIX-01**: File tree updates when files are changed by external editors
- [ ] **FIX-02**: No phantom characters appear during fast terminal scroll
- [ ] **FIX-03**: Terminal has thin draggable scrollbar with faster wheel scroll
- [ ] **FIX-04**: Sidebar bottom TUI has no black padding and aligns to top correctly

## Future Requirements (v0.3.x)

Deferred to patch releases after core is stable.

- **GIT-06**: User can stage/unstage individual hunks within a file
- **EDIT-06**: User can use AI-generated commit messages
- **TREE-06**: User sees visual git status badges on file tree nodes

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full Monaco editor | 50MB+ bundle, WebGL conflicts with xterm.js, overkill for terminal-first tool |
| Git graph visualization | Complex canvas rendering, marginal daily value, defer to external tools |
| Auto-save | Dangerous with code; accidental saves break builds |
| Syntax highlighting in diffs | High complexity for read-only view; keep line-level +/- coloring |
| Multi-window support | Breaks single-window value proposition per PROJECT.md |
| Real-time collaborative editing | Massive complexity, single-user tool |
| Branch switching UI | Terminal-based workflow sufficient for v0.3.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EDIT-01 | — | Pending |
| EDIT-02 | — | Pending |
| EDIT-03 | — | Pending |
| EDIT-04 | — | Pending |
| EDIT-05 | — | Pending |
| GIT-01 | — | Pending |
| GIT-02 | — | Pending |
| GIT-03 | — | Pending |
| GIT-04 | — | Pending |
| GIT-05 | — | Pending |
| TREE-01 | — | Pending |
| TREE-02 | — | Pending |
| TREE-03 | — | Pending |
| TREE-04 | — | Pending |
| TREE-05 | — | Pending |
| GSD-01 | — | Pending |
| GSD-02 | — | Pending |
| GSD-03 | — | Pending |
| GSD-04 | — | Pending |
| GSD-05 | — | Pending |
| SIDE-01 | — | Pending |
| SIDE-02 | — | Pending |
| MAIN-01 | — | Pending |
| MAIN-02 | — | Pending |
| MAIN-03 | — | Pending |
| FIX-01 | — | Pending |
| FIX-02 | — | Pending |
| FIX-03 | — | Pending |
| FIX-04 | — | Pending |

**Coverage:**
- v0.3.0 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29

---
*Requirements defined: 2026-04-14*
*Last updated: 2026-04-14 after initial definition*
