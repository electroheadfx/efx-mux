# Milestones

## v0.3.0 Workspace Evolution (Shipped: 2026-04-20)

**Phases:** 8 (15-22) | **Plans:** 53 | **Tasks:** ~200
**Timeline:** 7 days (2026-04-14 → 2026-04-20)
**Codebase:** 30,434 LOC (25,004 TS + 5,430 Rust) | 555 commits
**Stack:** Tauri 2, Preact, CodeMirror 6, xterm.js 6.0, tmux, git2, Tailwind 4

**Delivered:** Full-featured development workspace with CodeMirror editor tabs, git staging/commit/push, file tree operations (delete, drag/drop, external editor), GSD planning viewer with 5 sub-tabs, multi-terminal right panel, and dynamic tabs with vertical split and cross-scope drag.

**Key accomplishments:**

1. **CodeMirror 6 editor tabs** -- Syntax highlighting for 15+ languages, unsaved indicator, Cmd+S save, dirty-close confirmation modal, drag-and-drop reorder
2. **Git control pane** -- 3-tab sidebar with Projects/File Tree/Git Control, staging checkboxes, commit with message, push to remote, undo last commit
3. **File tree enhancements** -- Delete via context menu and Delete key, Open In submenu (Zed/VSCode), intra-tree drag reorder, Finder drop import
4. **GSD sub-tabs** -- 5 specialized views (Milestones, Phases, Progress, History, State) parsing ROADMAP.md, MILESTONES.md, STATE.md via unified/remark
5. **Multi-terminal right panel** -- Plus menu for Terminal/Agent sub-TUI, unified tab bar replacing split layout, scope-aware PTY sessions
6. **Dynamic tabs and vertical split** -- GSD/Git Changes as closeable/reorderable tabs, 1-3 stacked sub-panes per zone, cross-scope drag-and-drop, stable PTY session names
7. **Bug fixes** -- File watcher sync with external editors, open-in-editor button, CLAUDE.md tab-open, code-review debt closure

**Deferred items at close:** 47 documentation hygiene items (37 debug session notes, 10 UAT/verification checkbox gaps) -- not blocking, work shipped

**Archives:**

- `milestones/v0.3.0-ROADMAP.md` -- Full phase details
- `milestones/v0.3.0-REQUIREMENTS.md` -- Requirements snapshot

---

## v0.2.0 Testing \& Consolidation (Shipped: 2026-04-12)

**Phases completed:** 4 phases, 8 plans, 18 tasks

**Key accomplishments:**

- Vitest test runner with jsdom, v8 coverage at 60% thresholds, and global mocks for Tauri IPC, xterm.js, and WebCrypto
- Canary test with 8 assertions across 5 INFRA requirements proving jsdom, WebCrypto, xterm mocks, Tauri IPC mocks, jest-dom matchers, and v8 coverage all work end-to-end
- 89 tests across 5 TypeScript modules — all passing with Tauri IPC mock infrastructure
- 30 render tests for 4 workspace components (sidebar, server-pane, gsd-viewer, file-tree) using @testing-library/preact and mockIPC
- Plan:
- Commit:
- Tasks completed (4/4):

---

## v0.1.0 MVP (Shipped: 2026-04-11)

**Phases:** 11 (1-10 + 6.1 insertion) | **Plans:** 63 | **Tasks:** 122
**Timeline:** 6 days (2026-04-06 → 2026-04-11)
**Codebase:** 9,517 LOC (TypeScript + Rust + CSS) | 509 files | 50 commits
**Stack:** Tauri 2, Preact, xterm.js 6.0, tmux, git2, Tailwind 4

**Delivered:** A native macOS terminal multiplexer that co-locates AI agent terminals (Claude Code / OpenCode) with live GSD progress tracking, git diffs, and file browsing in a single keyboard-driven window.

**Key accomplishments:**

1. **PTY terminal pipeline** -- xterm.js 6.0 with WebGL rendering connected to tmux sessions via portable-pty, with 400KB flow control and automatic fallback
2. **Multi-project workspace** -- Project registry with git2 integration, sidebar with branch/status badges, Ctrl+P fuzzy switching, and per-project tmux sessions
3. **Right panel views** -- GSD Markdown viewer with checkbox write-back and auto-refresh, GitHub-style diff viewer, keyboard-navigable file tree, and independent bash terminal
4. **Server pane + agent detection** -- Collapsible dev server pane with lifecycle controls, auto-detect Claude Code / OpenCode binaries, per-project agent configuration
5. **Full keyboard system** -- Capture-phase shortcut handler with terminal pass-through, multi-tab management (Ctrl+T/W/Tab), PTY crash recovery, first-run wizard
6. **Pixel-perfect navy-blue UI** -- Design token system (tokens.ts + Tailwind @theme), Geist typography, Pencil mockup-matched components, dark/light mode

**Architecture evolution:**

- Phase 6.1 (INSERTED): Migrated from Arrow.js to Preact + Vite + TypeScript + Tailwind 4
- Phase 9→10: Two-pass UI polish (GitHub-dark palette, then navy-blue Pencil reference design)

**Known Gaps:**

- REQUIREMENTS.md traceability table was not maintained during execution (all requirements implemented but checkboxes stale)
- No milestone audit performed

**Archives:**

- `milestones/v0.1.0-ROADMAP.md` -- Full phase details
- `milestones/v0.1.0-REQUIREMENTS.md` -- Requirements snapshot

---
