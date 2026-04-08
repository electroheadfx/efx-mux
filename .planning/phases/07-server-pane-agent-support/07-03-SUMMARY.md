---
phase: 07-server-pane-agent-support
plan: 03
subsystem: terminal
tags: [tmux, agent-detection, tauri, pty, plugin-opener]

# Dependency graph
requires:
  - phase: 07-server-pane-agent-support/02
    provides: server pane UI, agent detection on initial launch, detectAgent bridge
provides:
  - "@tauri-apps/plugin-opener installed and TypeScript-resolvable (unblocks AGENT-02)"
  - "Agent detection on project switch via project-changed listener (AGENT-03, AGENT-04)"
  - "shell_command parameter on switch_tmux_session Rust command"
affects: [server-pane, project-switching, agent-launch]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Agent binary passed to tmux new-session via shell_command param on session creation"]

key-files:
  created: []
  modified:
    - src/main.tsx
    - src-tauri/src/terminal/pty.rs

key-decisions:
  - "Extended Rust switch_tmux_session with shell_command param rather than using write_pty fallback -- cleaner: agent launches as tmux session command, not typed into bash"

patterns-established:
  - "Agent detection pattern in project-changed mirrors bootstrap pattern: detectAgent -> pass to session function"

requirements-completed: [AGENT-02, AGENT-03, AGENT-04]

# Metrics
duration: 3min
completed: 2026-04-08
---

# Phase 7 Plan 3: Gap Closure -- Plugin-Opener Install + Agent Detection on Project Switch

**Installed missing plugin-opener dependency for TypeScript compilation and added agent detection to project-changed listener so switching projects launches the correct agent binary in tmux**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T22:50:53Z
- **Completed:** 2026-04-08T22:53:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Confirmed @tauri-apps/plugin-opener installs correctly from pnpm lockfile (was already declared, just not in worktree node_modules)
- TypeScript compiles cleanly with plugin-opener resolved (unblocks AGENT-02 Open in Browser)
- Added shell_command parameter to Rust switch_tmux_session so new tmux sessions can launch an agent binary directly
- Project-changed listener now calls detectAgent for the new project and passes the agent binary when switching sessions (AGENT-03, AGENT-04)
- Cargo build passes with the Rust-side changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Install missing plugin-opener dependency** - no commit (dependency already in package.json/lockfile; pnpm install populates gitignored node_modules only)
2. **Task 2: Add agent detection to project-changed listener** - `9b7908a` (feat)

## Files Created/Modified
- `src/main.tsx` - Added detectAgent call and agentBinary pass-through in project-changed listener; updated switchTmuxSession wrapper to accept shellCommand param
- `src-tauri/src/terminal/pty.rs` - Added shell_command: Option<String> parameter to switch_tmux_session; passes agent binary to tmux new-session when creating sessions

## Decisions Made
- Extended the Rust switch_tmux_session command with a shell_command parameter rather than using the write_pty fallback approach. This is cleaner because the agent launches as the tmux session's initial command rather than being typed into an existing bash session.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 required no source file changes -- the dependency was already declared in package.json and pnpm-lock.yaml. The gap was simply that node_modules was not populated (worktree-specific). Running pnpm install resolved it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AGENT-02 (Open in Browser) is unblocked with plugin-opener installed
- AGENT-03 and AGENT-04 are satisfied for both initial launch and project switching paths
- All verification gaps from 07-VERIFICATION.md addressed by this plan

---
*Phase: 07-server-pane-agent-support*
*Completed: 2026-04-08*

## Self-Check: PASSED
