# Roadmap: Efxmux

## Milestones

- ✅ **v0.1.0 MVP** -- Phases 1-10 + 6.1 (shipped 2026-04-11)
- ✅ **v0.2.0 Testing & Consolidation** -- Phases 11-14 (shipped 2026-04-12)
- 🚧 **v0.3.0 Workspace Evolution** -- Phases 15-21 (in progress)

## Phases

<details>
<summary>✅ v0.1.0 MVP (Phases 1-10 + 6.1) -- SHIPPED 2026-04-11</summary>

- [x] Phase 1: Scaffold + Entitlements (4/4 plans) -- completed 2026-04-06
- [x] Phase 2: Terminal Integration (3/3 plans) -- completed 2026-04-07
- [x] Phase 3: Terminal Theming (4/4 plans) -- completed 2026-04-07
- [x] Phase 4: Session Persistence (4/4 plans) -- completed 2026-04-07
- [x] Phase 5: Project System + Sidebar (2/2 plans) -- completed 2026-04-07
- [x] Phase 6: Right Panel Views (7/7 plans) -- completed 2026-04-08
- [x] Phase 6.1: Migrate Arrow.js -> Preact (6/6 plans) -- completed 2026-04-08 (INSERTED)
- [x] Phase 7: Server Pane + Agent Support (9/9 plans) -- completed 2026-04-09
- [x] Phase 8: Keyboard + Polish (8/8 plans) -- completed 2026-04-10
- [x] Phase 9: Professional UI Overhaul (6/6 plans) -- completed 2026-04-10
- [x] Phase 10: Pixel-Perfect UI Rewrite (10/10 plans) -- completed 2026-04-11

</details>

<details>
<summary>✅ v0.2.0 Testing & Consolidation (Phases 11-14) -- SHIPPED 2026-04-12</summary>

- [x] Phase 11: Test Infrastructure (2/2 plans) -- completed 2026-04-12
- [x] Phase 12: TypeScript Tests (2/2 plans) -- completed 2026-04-12
- [x] Phase 13: Rust Tests (2/2 plans) -- completed 2026-04-12
- [x] Phase 14: Consolidation (2/2 plans) -- completed 2026-04-12

</details>

### v0.3.0 Workspace Evolution (In Progress)

**Milestone Goal:** Transform Efxmux from terminal-focused MVP to full-featured development workspace with file editing, git control, and enhanced navigation.

- [x] **Phase 15: Foundation Primitives** (2 plans) -- Shared UI components and Rust write commands (completed 2026-04-14)
- [x] **Phase 16: Sidebar Evolution + Git Control** (3 plans) -- 3-tab sidebar with git staging/commit/push (completed 2026-04-15)
- [x] **Phase 17: Main Panel File Tabs** (5 plans) -- CodeMirror editor tabs with dropdown menu (completed 2026-04-15)
- [x] **Phase 18: File Tree Enhancements** -- Delete, drag/drop, external editor integration (completed 2026-04-16)
- [ ] **Phase 19: GSD Sub-Tabs** -- 5 sub-tabs for Milestones, Phases, Progress, History, State
- [ ] **Phase 20: Right Panel Multi-Terminal** -- Plus menu for Terminal/Agent sub-TUI
- [ ] **Phase 21: Bug Fix Sprint** -- File watcher, phantom chars, scrollbar, padding fixes

## Phase Details

### Phase 15: Foundation Primitives
**Goal**: Shared UI components and Rust write commands are available for all downstream features
**Depends on**: Phase 14
**Requirements**: None directly (infrastructure phase enabling downstream features)
**Success Criteria** (what must be TRUE):
  1. Context menu component renders on right-click with configurable items
  2. Dropdown menu component renders with click-to-toggle and keyboard navigation
  3. `write_file_content` Rust command writes file and returns success/error
  4. `git-service.ts` module exposes stage/unstage/commit/push IPC wrappers
  5. `file-service.ts` module exposes file CRUD IPC wrappers
**Plans**: 2 plans
  - [x] 15-01-PLAN.md -- Context Menu and Dropdown Menu UI components
  - [x] 15-02-PLAN.md -- Git operations, file operations, and TypeScript services

### Phase 16: Sidebar Evolution + Git Control
**Goal**: Users can stage, commit, and push changes from a dedicated git control pane in the sidebar
**Depends on**: Phase 15
**Requirements**: SIDE-01, GIT-01, GIT-02, GIT-03, GIT-04 (GIT-05 deferred)
**Success Criteria** (what must be TRUE):
  1. User can switch between 3 sidebar tabs: Projects, File Tree, Git Control
  2. User can stage individual files via checkboxes in git control pane
  3. User can unstage individual files via checkboxes
  4. User can commit staged changes with message input
  5. User can push commits to remote repository
**Plans**: 3 plans
  - [x] 16-01-PLAN.md -- Backend get_unpushed_count and service layer + test stubs
  - [x] 16-02-PLAN.md -- Sidebar tab system and Toast notification component
  - [x] 16-03-PLAN.md -- GitControlTab with staging/commit/push workflow
**UI hint**: yes

### Phase 17: Main Panel File Tabs
**Goal**: Users can edit files in CodeMirror tabs with save/close workflow and add new tab types via dropdown
**Depends on**: Phase 15
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, MAIN-01, MAIN-02
**Success Criteria** (what must be TRUE):
  1. User can open files in main panel tabs with CodeMirror 6 syntax highlighting
  2. User sees unsaved indicator (dot) in tab title when file has uncommitted changes
  3. User can save file with Cmd+S keyboard shortcut
  4. User sees confirmation modal when closing tab with unsaved changes
  5. User can reorder tabs via drag and drop
  6. User can add new tabs via dropdown menu (Terminal Zsh, Agent, Git changes)
  7. User can view git changes panel with accordion per-file diffs
**Plans**: 5 plans
Plans:
  - [x] 17-01-PLAN.md -- CM6 packages, editor infrastructure (theme, languages, setup), confirmation modal
  - [x] 17-02-PLAN.md -- Unified tab bar, editor tab component, terminal-tabs refactor
  - [x] 17-03-PLAN.md -- Git changes tab, main panel rewire, file-opened flow, human verification
  - [x] 17-04-PLAN.md -- Gap closure: DnD reorder fix, dropdown click fix, remove Diff tab
  - [x] 17-05-PLAN.md -- Gap closure: git refresh after save, editor revert sync, terminal tab persistence
**UI hint**: yes

### Phase 18: File Tree Enhancements
**Goal**: Users can delete files, open in external editors, and drag/drop within the tree
**Depends on**: Phase 17
**Requirements**: TREE-01, TREE-02, TREE-03, TREE-04, TREE-05, MAIN-03
**Success Criteria** (what must be TRUE):
  1. User can delete files/folders via context menu with confirmation dialog
  2. User can delete files/folders via Delete key with confirmation dialog
  3. User can open file in external editor (Zed, VSCode) via context menu
  4. User can drag/drop files and folders to reorder within tree
  5. User can drag files from Finder into tree to import
  6. User can create new file from folder context in file tree
**Plans**: 5 plans
Plans:
  - [x] 18-01-PLAN.md -- Rust file ops + external editor + file-service wrappers (Wave 1)
  - [x] 18-02-PLAN.md -- ContextMenu submenu extension + tauri.conf dragDropEnabled (Wave 1)
  - [x] 18-03-PLAN.md -- File tree context menu, Delete flow, InlineCreateRow (Wave 2)
  - [x] 18-04-PLAN.md -- Open In submenu + header [+] and Open In buttons (Wave 3)
  - [x] 18-05-PLAN.md -- Intra-tree drag + Finder drop import (Wave 4)
**UI hint**: yes

### Phase 19: GSD Sub-Tabs
**Goal**: Users can view GSD planning context across 5 specialized sub-tabs
**Depends on**: Phase 15
**Requirements**: GSD-01, GSD-02, GSD-03, GSD-04, GSD-05
**Success Criteria** (what must be TRUE):
  1. User can view Milestones sub-tab parsed from ROADMAP.md
  2. User can view Phases sub-tab parsed from ROADMAP.md
  3. User can view Progress sub-tab parsed from ROADMAP.md
  4. User can view History sub-tab from MILESTONES.md
  5. User can view State sub-tab (current position + decisions) from STATE.md
**Plans**: TBD
**UI hint**: yes

### Phase 20: Right Panel Multi-Terminal
**Goal**: Users can spawn multiple terminal/agent sub-TUIs in the right panel
**Depends on**: Phase 15
**Requirements**: SIDE-02
**Success Criteria** (what must be TRUE):
  1. User can add Terminal/Agent sub-TUI via plus menu in sidebar bash pane
  2. User can switch between multiple terminal tabs in right panel bottom pane
  3. Each terminal tab maintains independent PTY session
**Plans**: TBD
**UI hint**: yes

### Phase 21: Bug Fix Sprint
**Goal**: Known architectural debts and UI bugs are resolved
**Depends on**: Phases 16-20 (runs after core features are stable)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04
**Success Criteria** (what must be TRUE):
  1. File tree updates when files are changed by external editors
  2. No phantom characters appear during fast terminal scroll
  3. Terminal has thin draggable scrollbar with faster wheel scroll
  4. Sidebar bottom TUI has no black padding and aligns to top correctly
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 15 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Entitlements | v0.1.0 | 4/4 | Complete | 2026-04-06 |
| 2. Terminal Integration | v0.1.0 | 3/3 | Complete | 2026-04-07 |
| 3. Terminal Theming | v0.1.0 | 4/4 | Complete | 2026-04-07 |
| 4. Session Persistence | v0.1.0 | 4/4 | Complete | 2026-04-07 |
| 5. Project System + Sidebar | v0.1.0 | 2/2 | Complete | 2026-04-07 |
| 6. Right Panel Views | v0.1.0 | 7/7 | Complete | 2026-04-08 |
| 6.1 Migrate Arrow.js -> Preact | v0.1.0 | 6/6 | Complete | 2026-04-08 |
| 7. Server Pane + Agent Support | v0.1.0 | 9/9 | Complete | 2026-04-09 |
| 8. Keyboard + Polish | v0.1.0 | 8/8 | Complete | 2026-04-10 |
| 9. Professional UI Overhaul | v0.1.0 | 6/6 | Complete | 2026-04-10 |
| 10. Pixel-Perfect UI Rewrite | v0.1.0 | 10/10 | Complete | 2026-04-11 |
| 11. Test Infrastructure | v0.2.0 | 2/2 | Complete | 2026-04-12 |
| 12. TypeScript Tests | v0.2.0 | 2/2 | Complete | 2026-04-12 |
| 13. Rust Tests | v0.2.0 | 2/2 | Complete | 2026-04-12 |
| 14. Consolidation | v0.2.0 | 2/2 | Complete | 2026-04-12 |
| 15. Foundation Primitives | v0.3.0 | 2/2 | Complete    | 2026-04-14 |
| 16. Sidebar Evolution + Git Control | v0.3.0 | 4/4 | Complete   | 2026-04-15 |
| 17. Main Panel File Tabs | v0.3.0 | 5/5 | Complete   | 2026-04-15 |
| 18. File Tree Enhancements | v0.3.0 | 5/5 | Complete   | 2026-04-16 |
| 19. GSD Sub-Tabs | v0.3.0 | 0/? | Not started | - |
| 20. Right Panel Multi-Terminal | v0.3.0 | 0/? | Not started | - |
| 21. Bug Fix Sprint | v0.3.0 | 0/? | Not started | - |

---
*Roadmap created: 2026-04-06*
*Last updated: 2026-04-15 (Phase 17 gap closure plans added)*
