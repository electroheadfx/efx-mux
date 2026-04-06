# GSD⚡MUX

> Terminal Multiplexer for AI-Assisted Development
> Stack: Tauri 2 + Arrow.js + xterm.js + tmux

---

## What This Is

A native macOS desktop application that wraps Claude Code and OpenCode terminal sessions in a structured, multi-panel workspace. The goal is to give AI-assisted developers a single window that co-locates: the AI agent terminal, a live GSD progress viewer (Markdown with write-back), git diff, and a file tree — all around a real terminal that runs the original CLI binaries without any modification or hacking.

## Core Value

Developers using Claude Code or OpenCode lose context switching between the terminal, their editor, and their planning docs. GSD⚡MUX collapses all of that into one native window with a terminal-first aesthetic — dark, fast, keyboard-driven.

## Who It's For

Laurent (the developer) and other developers who use Claude Code / OpenCode as their primary coding agent and want a structured workspace without leaving the terminal paradigm.

## Key Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 3-zone layout: sidebar (collapsable) + main terminal panel (50%) + right split panels (2×25%)
- [ ] Real xterm.js terminals with GPU-accelerated WebGL rendering
- [ ] tmux session backend — sessions survive app close/reopen, processes keep running
- [ ] Claude Code and OpenCode launched as-is via direct PTY (no wrapping, no hacks — just spawn the binary in tmux)
- [ ] GSD Markdown viewer in right panel with write-back checkbox support (click → writes to .md file)
- [ ] File watcher on PLAN.md / GSD files — auto-refresh right panel on change
- [ ] Git diff viewer in right panel (via git2 Rust crate, no shell-out)
- [ ] File tree with keyboard navigation in right panel
- [ ] Drag-resizable splits (persist ratios in state.json)
- [ ] Full terminal theming: forest-green dark palette derived from user's iTerm2 theme (FiraCode Light 14)
- [ ] Dark / light theme toggle for app chrome
- [ ] Session state persistence: close app → reopen → exact same layout + reattach tmux sessions
- [ ] Multi-project sidebar: switch project → switch tmux session + update all panels
- [ ] Collapsable server pane (bottom split in main panel) with Open/Restart/Stop controls
- [ ] Keyboard shortcuts: Ctrl+B (sidebar), Ctrl+1/2/3 (focus), Ctrl+P (project switcher), Ctrl+Q (quit+save)

### Out of Scope

- Multi-window support — single window MVP only
- Built-in editor — files open in $EDITOR via xterm.js tab, not in-app editor
- Custom AI agent protocol — just spawn existing CLI binaries
- Windows/Linux support — macOS first

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Desktop shell | Tauri 2 (Rust) | Native window, PTY management, IPC, system access |
| UI framework | Arrow.js | Pure vanilla JS + web components, no vDOM, no bundler required, AI-skill bootstrappable |
| Terminal emulator | xterm.js + WebGL addon | GPU-accelerated, proven in VS Code, full theming |
| Session backend | tmux | Session persistence for free — processes survive app close |
| PTY management | portable-pty (Rust) | Spawn/manage PTY processes from Rust |
| Git integration | git2 (Rust crate) | Status/diff/branch without shelling out |
| File watching | notify (Rust crate) | Live reload of GSD files and theme |
| State persistence | serde + JSON | Serialize/deserialize full app state |
| Markdown renderer | marked.js + custom | Checkboxes, progress bars, write-back to .md file |

## Theme Spec

Derived from user's iTerm2 export (FiraCode Light 14, dark forest-green palette):

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#1e2d25` | App background, sidebar, panels |
| `--bg-raised` | `#2d3d32` | Tab bars, panel headers |
| `--border` | `#3a4d3f` | Split handles, dividers |
| `--text` | `#8e9a90` | Muted text, labels |
| `--text-bright` | `#c8d4ca` | Active text, filenames |
| `--accent` | `#26a641` | Git indicators, active tab, checkboxes |
| `--font` | `FiraCode Light 14` | All app chrome (mirrors terminal font) |

Terminal colors applied via xterm.js theme object, imported from `~/.config/gsd-mux/theme.json` (hot-reloads on change).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Arrow.js over Solid.js/Svelte | Pure vanilla JS, web components, no build complexity, AI-skill for bootstrapping | — In use |
| tmux as session backend | Free persistence — Claude Code keeps running when app closes | — In use |
| No AI CLI wrapping | Spawn `claude` or `opencode` binary directly in tmux PTY — zero protocol hacks | — Constraint |
| GSD checkbox write-back | Click checkbox in panel → write to .md → file watcher triggers refresh → Claude Code sees update | — Active |
| git2 crate (no shell-out) | Reliable, cross-platform, no dependency on system git PATH | — In use |

## Context

This is a greenfield project starting from a detailed research spec (RESEARCH/GSD-MUX-Spec-v1.0.md) and build plan (RESEARCH/PLAN.md). The spec was treated as a proposal — Arrow.js confirmed, tmux confirmed, Tauri 2 confirmed. iTerm2 theme colors are the design source of truth for app chrome.

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
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*
