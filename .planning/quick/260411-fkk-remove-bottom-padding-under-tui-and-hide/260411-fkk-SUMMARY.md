---
phase: quick-260411-fkk
plan: 01
subsystem: terminal-ui
tags: [css, tmux, terminal, visual-fix]
dependency_graph:
  requires: []
  provides: [tmux-status-hidden, terminal-bottom-gap-fix]
  affects: [terminal-area, pty-sessions]
tech_stack:
  added: []
  patterns: [tmux-set-option-status-off, xterm-viewport-bg-fill]
key_files:
  created: []
  modified:
    - src-tauri/src/terminal/pty.rs
    - src/styles/app.css
    - src/components/main-panel.tsx
decisions: []
metrics:
  duration: 141s
  completed: "2026-04-11T09:18:04Z"
---

# Quick Task 260411-fkk: Remove bottom padding under TUI and hide tmux status bar

Hid the tmux green status bar via `set-option status off` on session creation and switch, and filled the sub-row pixel gap below xterm.js by setting terminal background on xterm viewport/screen elements.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Hide tmux status bar on session creation | 86265e1 | src-tauri/src/terminal/pty.rs |
| 2 | Remove bottom gap below xterm.js terminal | 081e8f7 | src/styles/app.css, src/components/main-panel.tsx |

## Changes Made

### Task 1: Hide tmux status bar
- Added `set-option -t <session> status off` in `spawn_terminal` after remain-on-exit option
- Added same `status off` call in `switch_tmux_session` after mouse-on option
- Both new and switched-to sessions now hide the green bar

### Task 2: Remove bottom gap below terminal
- Added `position: relative` to `.terminal-area` CSS rule
- Added `.terminal-area .xterm { height: 100% }` to fill container
- Added `.terminal-area .xterm-viewport` and `.xterm-screen` background-color rules matching `--color-bg-terminal` to fill the sub-row pixel gap
- Removed the wrapper `<div class="p-3 pb-0">` around `<AgentHeader />` in main-panel.tsx -- the component has its own internal padding

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No `reattach_pty` function exists**
- **Found during:** Task 1
- **Issue:** Plan referenced a `reattach_pty` function that does not exist in the codebase
- **Fix:** Applied `status off` to `switch_tmux_session` instead, which is the actual function that handles session switching (equivalent to reattach)
- **Files modified:** src-tauri/src/terminal/pty.rs
- **Commit:** 86265e1

## Verification

- `cargo check` passes (Rust compiles clean)
- `pnpm exec tsc --noEmit` passes (TypeScript valid)
- Visual: tmux status bar hidden, terminal background fills edge-to-edge
