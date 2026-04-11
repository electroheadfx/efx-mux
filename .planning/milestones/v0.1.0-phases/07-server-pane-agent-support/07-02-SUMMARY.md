---
phase: 07-server-pane-agent-support
plan: 02
subsystem: server-pane-ui-agent-launch
tags: [preact, server-pane, agent-detection, ctrl-backtick, drag-resize, ansi-logs]
dependency_graph:
  requires: [server.rs, server-bridge.ts, ansi-html.ts]
  provides: [server-pane.tsx, ServerPane-component, serverPaneState-signal, agent-launch-wiring]
  affects: [main-panel.tsx, main.tsx, drag-manager.ts, pty-bridge.ts, pty.rs, app.css]
tech_stack:
  added: []
  patterns: [3-state-collapse-cycle, capture-phase-keydown, shell-command-passthrough]
key_files:
  created:
    - src/components/server-pane.tsx
  modified:
    - src/components/main-panel.tsx
    - src/main.tsx
    - src/styles/app.css
    - src/drag-manager.ts
    - src/terminal/pty-bridge.ts
    - src-tauri/src/terminal/pty.rs
    - src-tauri/Cargo.lock
key_decisions:
  - "Ctrl+` uses capture:true listener to fire before xterm.js (RESEARCH.md Pitfall 3)"
  - "Agent binary passed as shellCommand to spawn_terminal so tmux runs agent instead of default shell"
  - "Drag handle re-initialized via requestAnimationFrame after pane expands (Option A from plan)"
  - "dragInit dataset guard prevents duplicate listeners on repeated initDragManager calls"
metrics:
  duration: "5min"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 8
---

# Phase 07 Plan 02: Server Pane UI + Agent Detection + Launch Wiring Summary

Server pane Preact component with 3-state Ctrl+` collapse cycle, toolbar buttons wired to Rust start/stop/restart/open commands, live ANSI-colored log streaming, agent detection passing binary to tmux spawn_terminal, bash fallback banner, and drag-resizable server pane height with persistence.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ServerPane component + main-panel wiring + CSS + Ctrl+` handler + drag-resize + agent launch | b743498 | server-pane.tsx, main-panel.tsx, main.tsx, app.css, drag-manager.ts, pty-bridge.ts, pty.rs |
| 2 | UAT verification (auto-approved in auto mode) | - | - |

## Decisions Made

1. **Capture-phase Ctrl+` handler**: Uses `{ capture: true }` on the keydown listener to intercept before xterm.js terminal captures the key event. This is critical for the shortcut to work when terminal has focus.

2. **Shell command passthrough (Approach A)**: Added `shellCommand` parameter to `connectPty` and `shell_command: Option<String>` to Rust `spawn_terminal`. When provided, tmux runs the agent binary as the session command instead of default shell.

3. **Drag handle re-initialization**: After Ctrl+` expands the server pane, `initDragManager()` is called via `requestAnimationFrame` to wire the newly-rendered `main-h` handle. A `dataset.dragInit` guard prevents duplicate listener attachment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing pnpm dependency installation**
- **Found during:** Task 1 verification
- **Issue:** `@tauri-apps/plugin-opener` package was listed in package.json but not installed in the worktree's node_modules
- **Fix:** Ran `pnpm install` to restore dependencies
- **Files modified:** none (node_modules only)
- **Commit:** n/a (runtime artifact)

## Verification Results

- `pnpm exec tsc --noEmit` exits 0 (zero TypeScript errors)
- `cargo build --manifest-path src-tauri/Cargo.toml` exits 0 (Rust compiles cleanly)
- src/components/server-pane.tsx contains `export function ServerPane`
- src/components/server-pane.tsx contains `export const serverPaneState = signal`
- src/components/server-pane.tsx contains `export const serverStatus = signal`
- src/components/server-pane.tsx imports server-bridge and ansi-html
- src/components/server-pane.tsx contains `listenServerOutput` and `listenServerStopped`
- src/components/server-pane.tsx contains `Process exited (code` (D-14)
- src/components/server-pane.tsx contains `dangerouslySetInnerHTML` and `openInBrowser`
- src/components/main-panel.tsx imports ServerPane, no placeholder text
- src/main.tsx imports serverPaneState and detectAgent
- src/main.tsx contains `capture: true` and `No agent binary found`
- src/terminal/pty-bridge.ts contains shellCommand parameter
- src-tauri/src/terminal/pty.rs contains shell_command parameter
- src/drag-manager.ts contains main-h handler and server-pane-height persistence
- src/styles/app.css contains state-strip, state-expanded, state-collapsed, server-btn, server-pane-toolbar, server-pane-logs

## Self-Check: PASSED

All files exist, commit b743498 verified, all acceptance criteria pass.
