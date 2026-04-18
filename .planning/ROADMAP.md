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
- [x] **Phase 19: GSD Sub-Tabs** -- 5 sub-tabs for Milestones, Phases, Progress, History, State (completed 2026-04-17)
- [x] **Phase 20: Right Panel Multi-Terminal** -- Plus menu for Terminal/Agent sub-TUI (completed 2026-04-18)
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
**Plans**: 8 plans + 4 gap-closure plans
Plans:
  - [x] 18-01-PLAN.md -- Rust file ops + external editor + file-service wrappers (Wave 1)
  - [x] 18-02-PLAN.md -- ContextMenu submenu extension + tauri.conf dragDropEnabled (Wave 1)
  - [x] 18-03-PLAN.md -- File tree context menu, Delete flow, InlineCreateRow (Wave 2)
  - [x] 18-04-PLAN.md -- Open In submenu + header [+] and Open In buttons (Wave 3)
  - [x] 18-05-PLAN.md -- Intra-tree drag + Finder drop import (Wave 4)
  - [x] 18-06-PLAN.md -- UAT gap closure: create_file existence guard + revert_file branching + handleRevertAll resilience
  - [x] 18-07-PLAN.md -- UAT gap closure: macOS title-bar y-offset + x-axis hit-test bounds
  - [x] 18-08-PLAN.md -- UAT gap closure: refreshTreePreservingState (expand/collapse persistence)
  - [x] 18-09-PLAN.md -- UAT gap closure: Cmd+Backspace via native menu (WKWebView NSResponder bypass)
  - [x] 18-10-PLAN.md -- Human UAT gap G-01 primary: revert emits git-status-changed so file-tree refreshes (Wave 1)
  - [x] 18-11-PLAN.md -- Human UAT gap G-01 secondary: editor-tab auto-close on file deletion (Wave 2)
  - [x] 18-12-PLAN.md -- Human UAT gap G-02: per-row drop-target highlight during Finder drag (Wave 1)
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
**Plans**: 4 plans
Plans:
  - [x] 19-01-PLAN.md -- Wave 0 foundation: install unified/remark deps, extend PanelsState + gsdSubTab signal, vitest ESM config, failing parser + pane test scaffolds
  - [x] 19-02-PLAN.md -- Wave 1: implement all 5 parse functions (parseMilestones/parsePhases/parseProgress/parseHistory/parseState) with unified/remark, turn Plan 01 tests green
  - [x] 19-03-PLAN.md -- Wave 2: build StatusBadge + 5 sub-tab components (Milestones/Phases/Progress/History/State), token-only, prop-driven
  - [x] 19-04-PLAN.md -- Wave 3: GSDPane container with md-file-changed path filtering, swap right-panel.tsx, delete gsd-viewer.tsx, human UAT checkpoint
**UI hint**: yes

### Phase 20: Right Panel Multi-Terminal
**Goal**: Users can spawn Terminal/Agent/Git-Changes sub-TUIs in the right panel via a unified tab bar that replaces the prior split layout with a single full-height pane; File Tree and GSD become sticky always-present tabs
**Depends on**: Phases 15, 17, 19
**Requirements**: SIDE-02
**Success Criteria** (what must be TRUE, post-discussion effective criteria):
  1. User can add Terminal/Agent sub-TUI via the `+` menu in the **right-panel tab bar** (original wording "sidebar bash pane" is stale pre-Phase-17 phrasing — interpreted per 20-CONTEXT.md §canonical_refs as the right-panel tab bar)
  2. User can switch between multiple terminal tabs in the right-panel tab bar
  3. Each terminal tab maintains an independent PTY session (named `<project>-r<N>`)
  4. File Tree + GSD remain always available as sticky uncloseable tabs in the right-panel bar
  5. Horizontal split + dedicated bottom Bash pane are removed entirely
**Plans**: 4 plans
Plans:
  - [x] 20-01-PLAN.md — terminal-tabs.tsx scope registry (main + right) with backward-compat exports
  - [x] 20-02-PLAN.md — unified-tab-bar.tsx scope prop + sticky tabs + scope-aware plus menu + Git Changes owningScope handoff
  - [x] 20-03-PLAN.md — state-manager legacy key migration + Rust kill_legacy_right_sessions command
  - [x] 20-04-PLAN.md — right-panel.tsx single-pane rewrite + main.tsx dual-scope bootstrap + human UAT
**UI hint**: yes

### Phase 21: Bug Fix Sprint
**Goal**: Known architectural debts and UI bugs are resolved (scope reconciled in 21-CONTEXT.md D-01)
**Depends on**: Phases 16-20 (runs after core features are stable)
**Requirements**: FIX-01, FIX-05, FIX-06 (FIX-02/03/04 superseded by Phase 21 — see 21-CONTEXT.md D-01); also closes WR-01, WR-02, WR-03 (verified pre-resolved), IN-02
**Success Criteria** (what must be TRUE):
  1. File tree refreshes (no app re-init / no focus loss) when files change externally; clean editor tabs reload in place; dirty tabs show "changed on disk" indicator (FIX-01)
  2. Open-in-external-editor works from header button AND row context menu; failures surface a toast (FIX-05)
  3. Clicking CLAUDE.md (and any file) opens it in an editor tab; failures surface a toast (FIX-06)
  4. Code-review debt closed: WR-01 (dropdown timeout cleanup), WR-02 (PTY cleanup logging), WR-03 (verified), IN-02 (editor-tab refs refactor)
**Plans**: 4 plans
Plans:
  - [x] 21-01-PLAN.md — FIX-01: file-tree-changed event + incremental refresh + dirty-aware editor reload
  - [x] 21-02-PLAN.md — FIX-05: Open-in-external-editor regression diagnosis + fix
  - [x] 21-03-PLAN.md — FIX-06: CLAUDE.md tab-open chain diagnosis + fix
  - [ ] 21-04-PLAN.md — Code-review debt bundle (WR-01, WR-02, WR-03 verify, IN-02) + REQUIREMENTS/ROADMAP scope reconciliation

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
| 18. File Tree Enhancements | v0.3.0 | 12/12 | Complete    | 2026-04-17 |
| 19. GSD Sub-Tabs | v0.3.0 | 4/4 | Complete   | 2026-04-17 |
| 20. Right Panel Multi-Terminal | v0.3.0 | 9/4 | Complete    | 2026-04-18 |
| 21. Bug Fix Sprint | v0.3.0 | 3/4 | In Progress|  |

---
*Roadmap created: 2026-04-06*
*Last updated: 2026-04-15 (Phase 17 gap closure plans added)*
