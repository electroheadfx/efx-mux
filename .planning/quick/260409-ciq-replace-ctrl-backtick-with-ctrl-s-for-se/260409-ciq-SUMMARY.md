---
status: complete
phase: quick
plan: 260409-ciq
subsystem: ui, terminal
tags: [keyboard-shortcuts, azerty, tmux, preact, datalist]

provides:
  - Ctrl+S server pane toggle (AZERTY compatible)
  - Bash survival after agent exit in tmux
  - Free-text agent input with datalist suggestions
affects: [server-pane, project-modal, pty]

key-files:
  modified:
    - src/main.tsx
    - src/components/server-pane.tsx
    - src/components/project-modal.tsx
    - src-tauri/src/terminal/pty.rs

key-decisions:
  - "Ctrl+S chosen over Ctrl+` for French AZERTY compatibility"
  - "bash -c 'cmd; exec bash' wrapping keeps tmux session alive after agent exit"
  - "datalist over select for agent field -- allows arbitrary commands while suggesting common ones"

duration: 2min
completed: 2026-04-09
---

# Quick Task 260409-ciq: Replace Ctrl+` with Ctrl+S, fix terminal exit, free-text agent input

**Ctrl+S server pane toggle for AZERTY keyboards, bash survival after agent exit via tmux wrapping, and free-text agent input with datalist suggestions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-09T06:46:14Z
- **Completed:** 2026-04-09T06:48:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Ctrl+S now toggles server pane 3-state cycle (collapsed/strip/expanded), replacing broken Ctrl+` on French AZERTY keyboards
- Agent exit in tmux (Ctrl+C, /exit) drops to bash shell instead of killing the session, via `bash -c 'cmd; exec bash'` wrapping in both spawn_terminal and switch_tmux_session
- Agent field in project modal is now a text input with datalist suggestions (claude, opencode, bash), allowing any custom command

## Task Commits

1. **Task 1: Replace Ctrl+` with Ctrl+S and fix terminal exit behavior** - `eb929c9` (fix)
2. **Task 2: Replace agent dropdown with free-text input** - `4d824b3` (feat)

## Files Modified
- `src/main.tsx` - Ctrl+S keybinding replacing Ctrl+` with guard for shift/alt modifiers
- `src/components/server-pane.tsx` - Updated comment referencing Ctrl+S
- `src/components/project-modal.tsx` - Replaced select with input+datalist, empty fallback to "bash"
- `src-tauri/src/terminal/pty.rs` - Wrapped shell_command in both spawn_terminal and switch_tmux_session

## Decisions Made
- Ctrl+S with `!e.shiftKey && !e.altKey` guard to avoid intercepting Ctrl+Shift+S or other combos
- `bash -c 'cmd; exec bash'` pattern chosen over tmux `remain-on-exit` because it gives a live interactive shell, not a frozen pane
- datalist chosen over select because it allows typing arbitrary commands while still offering suggestions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Self-Check: PASSED
