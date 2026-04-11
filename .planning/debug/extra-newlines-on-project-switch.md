---
status: awaiting_human_verify
trigger: "extra newlines accumulate in Claude Code CLI prompt when switching projects via sidebar"
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED -- keep tmux sessions alive but clear screen/history before re-attach prevents newlines while preserving tabs
test: Reverted kill-session, added clear-history before re-attach, added per-project tab cache for restore on switch-back
expecting: Tabs preserved across project switches AND no extra newlines
next_action: awaiting human verification

## Symptoms

expected: Switching projects via sidebar should display the terminal cleanly without adding newlines
actual: Each project switch adds extra newlines to the Claude Code CLI prompt in xterm.js. Switching several times compounds the problem.
errors: No error messages reported
reproduction: Open Efxmux, have multiple projects. Switch between projects via sidebar several times. Observe accumulating newlines in the terminal prompt.
started: Used to work correctly, regressed at some point

## Eliminated

## Evidence

- timestamp: 2026-04-11T00:01:00Z
  checked: project switch flow in main.tsx (line 317-362)
  found: project-changed listener calls clearAllTabs() then initFirstTab() with new session name. clearAllTabs -> disposeTab only disconnects JS handlers, disposes xterm Terminal, removes container. Does NOT clean up Rust PtyManager or kill tmux sessions.
  implication: Old PTY sessions for previous projects persist in Rust PtyManager HashMap with their read threads still running

- timestamp: 2026-04-11T00:02:00Z
  checked: PtyManager HashMap in pty.rs (line 136)
  found: map.insert(sanitized.clone(), state) replaces entry by key. Different projects have different session names (keys). So switching A->B leaves A's PtyState alive. Switching B->A creates new PtyState for A, dropping old A's PtyState at that moment -- but new tmux client is already spawned before old is dropped.
  implication: Brief overlap of two tmux clients for same session during switch-back, causing transient resize

- timestamp: 2026-04-11T00:03:00Z
  checked: Previous fix attempts in git history
  found: Commit 7249d6f added "clear;" before agent launch to fix newlines, then 54ace1e removed it because it caused newlines on open. Both were band-aids for the same underlying issue.
  implication: The newlines problem is systemic (resize/reattach related), not a shell command issue

- timestamp: 2026-04-11T00:04:00Z
  checked: disposeTab function (terminal-tabs.tsx line 340-345)
  found: disconnectPty() only disposes JS onData/onResize handlers. No IPC call to Rust to clean up PtyState or kill tmux session. The old PTY master stays connected as a tmux client.
  implication: Each project visit leaves behind a zombie tmux client that persists until the same session name is reused

- timestamp: 2026-04-11T00:06:00Z
  checked: destroy_pty_session in pty.rs (line 404-418) and tmux new-session -A behavior
  found: destroy_pty_session removes PtyState from HashMap (closing master fd, detaching tmux client) but does NOT kill the tmux session. Comment explicitly says "Does NOT kill the tmux session -- it stays alive for re-attach." On next switch back, spawn_terminal calls tmux new-session -A which RE-ATTACHES to the existing session. tmux dumps old screen content (previous prompt, scrollback reflow) to the new PTY client. xterm.js renders this as extra blank lines.
  implication: First switch is clean (fresh tmux session created). Subsequent switches re-attach to existing sessions that have accumulated screen content from prior runs. The xterm.js Terminal was disposed (scrollback gone on JS side) but tmux kept everything server-side.

- timestamp: 2026-04-11T00:06:01Z
  checked: monitoring thread lifecycle after destroy_pty_session
  found: Each spawn_terminal creates a monitoring thread that polls tmux every 500ms. The stopped flag is NOT set by destroy_pty_session -- only by the monitoring thread itself. So monitoring threads accumulate across project switches, creating orphaned pollers for the same session name.
  implication: Resource leak (minor) and potential for stale pty-exited events hitting new tabs with same sessionName. Not the direct cause of newlines but should be fixed.

## Resolution

root_cause: Three-part issue. (1) clearAllTabs/disposeTab only cleaned up JS-side resources, leaving Rust PtyState alive. (2) Adding destroy_pty_session fixed PTY cleanup but killing tmux sessions was too aggressive -- it destroyed user tabs (agent sessions, extra terminals) that should persist across project switches. (3) Without kill-session, re-attaching to existing tmux sessions via `tmux new-session -A` causes tmux to dump stale screen content to the fresh xterm.js terminal, rendering as extra blank lines.

fix: Three-part fix. (a) pty.rs destroy_pty_session: reverted kill-session -- now only removes PtyState (closes master fd, detaching tmux client) but keeps tmux session alive. (b) pty.rs spawn_terminal: before opening the PTY, checks if the tmux session already exists; if so, sends C-l (clear screen) and runs clear-history to wipe scrollback, preventing stale content dump on re-attach. (c) terminal-tabs.tsx + main.tsx: added per-project tab cache (in-memory Map). On project-pre-switch, saves tab metadata (sessionName + label) for the old project. On project-changed, tries to restore cached tabs via restoreTabs (which re-attaches to the surviving tmux sessions) before falling back to creating a fresh first tab.

verification: Rust cargo check and TypeScript tsc --noEmit both pass. Awaiting human verification.

files_changed: [src-tauri/src/terminal/pty.rs, src/components/terminal-tabs.tsx, src/main.tsx]
