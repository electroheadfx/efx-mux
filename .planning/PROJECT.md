# Efxmux

> Terminal Multiplexer for AI-Assisted Development
> Stack: Tauri 2 + Preact + xterm.js 6.0 + tmux + Tailwind 4

---

## What This Is

A native macOS desktop application that wraps Claude Code and OpenCode terminal sessions in a structured, multi-panel workspace. Developers get a single window that co-locates: the AI agent terminal, a live GSD progress viewer (Markdown with write-back), git diff, and file tree -- all around a real terminal that runs the original CLI binaries without any modification.

## Core Value

Developers using Claude Code or OpenCode lose context switching between the terminal, their editor, and their planning docs. Efxmux collapses all of that into one native window with a terminal-first aesthetic -- dark, fast, keyboard-driven.

## Who It's For

Laurent (the developer) and other developers who use Claude Code / OpenCode as their primary coding agent and want a structured workspace without leaving the terminal paradigm.

## Requirements

### Validated

- ✓ 3-zone layout: sidebar (collapsible) + main terminal panel + right split panels -- v0.1.0
- ✓ Real xterm.js terminals with GPU-accelerated WebGL rendering -- v0.1.0
- ✓ tmux session backend -- sessions survive app close/reopen -- v0.1.0
- ✓ Full terminal theming: Solarized Dark palette with theme.json hot-reload -- v0.1.0
- ✓ Dark / light theme toggle for app chrome -- v0.1.0
- ✓ Drag-resizable splits with state.json persistence -- v0.1.0
- ✓ Session state persistence: close app → reopen → exact same layout + reattach -- v0.1.0
- ✓ Multi-project sidebar with git2 integration and project switching -- v0.1.0
- ✓ GSD Markdown viewer with checkbox write-back and auto-refresh -- v0.1.0
- ✓ Git diff viewer via git2 crate -- v0.1.0
- ✓ File tree with keyboard navigation -- v0.1.0
- ✓ Server pane with agent detection (Claude Code / OpenCode) -- v0.1.0
- ✓ Keyboard shortcut system with terminal pass-through -- v0.1.0
- ✓ First-run wizard -- v0.1.0
- ✓ PTY crash recovery with restart option -- v0.1.0
- ✓ Navy-blue pixel-perfect UI matching Pencil mockups -- v0.1.0
- ✓ Vitest test infrastructure with Tauri IPC + xterm.js mocks, coverage reporting -- v0.2.0 Phase 11
- ✓ 89 unit tests for 5 critical TypeScript modules (ansi-html, tokens, state-manager, theme-manager, server-bridge) -- v0.2.0 Phase 12
- ✓ 30 component render tests for 4 workspace components (sidebar, server-pane, gsd-viewer, file-tree) -- v0.2.0 Phase 12
- ✓ Rust unit tests for state serde, git_status, and file_ops (19 tests total) -- v0.2.0 Phase 13
- ✓ Consolidation: dead code removal, any-type elimination, dependency audit -- v0.2.0 Phase 14

### Active

#### Current Milestone: v0.3.0 Workspace Evolution

**Goal:** Transform Efxmux from terminal-focused MVP to full-featured development workspace with file editing, git control, and enhanced navigation.

**Target features:**
- Filetree: delete, preview/open, edit in tab, external editor, drag/drop
- Bug fixes: file watcher, newline injection, phantom chars, scroll, TUI padding/alignment
- Main panel: dropdown to add Terminal/Agent/Git changes tabs, accordion diffs
- GSD viewer: 5 sub-tabs (Milestones, Phases, Progress, History, State)
- Left sidebar: 3 tabs (Projects, File tree, Git control with stage/commit/push)
- Sidebar bash: plus menu for new Terminal/Agent sub-TUI

### Out of Scope

- Mac App Store distribution -- Apple sandbox prevents PTY spawning. No entitlement exists to override.
- Windows / Linux -- macOS first. Multi-platform support deferred indefinitely.
- Built-in code editor -- Files open in $EDITOR via xterm.js tab. Not building a Monaco/CodeMirror editor.
- Custom AI agent protocol -- Claude Code and OpenCode are spawned as-is. No protocol interception, hook injection, or output parsing.
- AI output parsing for context -- No scraping of Claude Code output. GSD context comes from .md files, not terminal stdout.
- FiraCode ligatures in terminal -- Ligatures force CoreText over Core Graphics with measurable perf regression.
- Multi-window support -- Single window MVP only.

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Desktop shell | Tauri 2 (Rust) | Native window, PTY management, IPC, system access |
| UI framework | Preact + @preact/signals | Lightweight vDOM, signal-based reactivity, TSX |
| Build tool | Vite | Fast HMR, TypeScript, Tailwind 4 integration |
| CSS framework | Tailwind 4 | @theme tokens, utility-first, design token system |
| Terminal emulator | xterm.js 6.0 + WebGL addon | GPU-accelerated, full theming |
| Session backend | tmux | Session persistence for free -- processes survive app close |
| PTY management | portable-pty (Rust) | Spawn/manage PTY processes from Rust |
| Git integration | git2 (Rust crate) | Status/diff/branch without shelling out |
| File watching | notify (Rust crate) | Live reload of GSD files and theme |
| State persistence | serde + JSON | Serialize/deserialize full app state |
| Markdown renderer | marked.js + custom | Checkboxes, progress bars, write-back to .md file |
| Typography | Geist / Geist Mono | UI chrome fonts; FiraCode inside xterm.js |

## Context

Shipped v0.1.0 MVP with 9,517 LOC (TypeScript + Rust + CSS) in 6 days.
Shipped v0.2.0 Testing & Consolidation with 7,287 LOC (2,821 TS + 4,466 Rust), 119 tests (89 TS + 30 component + 19 Rust), 8 plans across 4 phases.
Tech stack evolved during development: Arrow.js was replaced by Preact + Vite + TypeScript + Tailwind 4 in Phase 6.1.
UI went through two design passes: Phase 9 (GitHub-dark palette) then Phase 10 (navy-blue Pencil reference design).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Arrow.js → Preact migration | Arrow.js reactive template bugs were unfixable; Preact + signals + TSX eliminated the class of bugs | ✓ Good |
| macOS sandbox disabled | PTY spawning incompatible with App Sandbox; no entitlement exists | ✓ Necessary |
| tmux as session backend | Free persistence -- Claude Code keeps running when app closes | ✓ Good |
| No AI CLI wrapping | Spawn binaries directly in tmux PTY -- zero protocol hacks | ✓ Constraint |
| Channel<Vec<u8>> for PTY streaming | Ordered, low-latency delivery vs emit() events | ✓ Good |
| Two-pass UI (Phase 9 → 10) | Phase 9 established design patterns; Phase 10 matched Pencil mockups pixel-perfect | ✓ Good |
| Dual token system (tokens.ts + @theme) | tokens.ts for inline styles, @theme CSS vars for Tailwind utilities | ✓ Good |
| BufReader::lines() for server output | Prevents ANSI sequence splitting in server pane | ✓ Good |
| git2 crate (no shell-out) | Reliable, cross-platform, no dependency on system git PATH | ✓ Good |
| Vitest + @testing-library/preact | jsdom environment, signal reset per test, vi.mock hoisting patterns | ✓ Good |
| Class-based xterm.js Terminal mock | vi.fn() not new-able via dynamic import in Vitest 4.x; class works with `new` | ✓ Good |
| Sync inner functions for Rust tests | Tauri commands are async; extracted `*_impl()` sync functions for unit testability | ✓ Good |

## Constraints

- macOS only (App Sandbox permanently disabled)
- tmux required at runtime (startup probe with install prompt)
- xterm.js 6.0 (canvas addon removed; WebGL + DOM fallback only)

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after v0.2.0 milestone*
