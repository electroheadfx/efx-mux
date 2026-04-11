# Milestones

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
