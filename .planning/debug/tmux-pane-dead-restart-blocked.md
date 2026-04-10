---
status: diagnosed
trigger: "tmux pane dead, restart blocked permanently"
created: 2026-04-10T09:00:00Z
updated: 2026-04-10T09:05:00Z
---

## Current Focus

hypothesis: CONFIRMED - remain-on-exit prevents PTY EOF, blocking entire exit detection and overlay flow
test: Traced full code path from shell exit to pty-exited event
expecting: N/A - root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: Crash overlay shows red status dot, exit code, and working Restart button
actual: tmux pane shows 'Pane is dead' with status 0 after shell exits. Restart button does not work - app remains blocked in dead state even after quit and relaunch.
errors: "Pane is dead (status 0, Fri Apr 10 08:41:53 2026)" visible in terminal
reproduction: Test 8 in UAT - kill a process or exit shell
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-04-10T09:02:00Z
  checked: pty.rs spawn_terminal - remain-on-exit setting and PTY read loop
  found: pty.rs:107-109 sets remain-on-exit=on. pty.rs:170 read loop waits for EOF from portable-pty master. But the PTY master is connected to the tmux CLIENT process (not the inner shell). With remain-on-exit=on, tmux keeps the session alive after inner process dies, so the tmux client never exits, and the PTY master never gets EOF.
  implication: The entire exit detection path (pty.rs:183-229) never executes. pty-exited event is never emitted. Crash overlay never appears.

- timestamp: 2026-04-10T09:03:00Z
  checked: What the user actually sees
  found: tmux itself renders "Pane is dead (status 0)" in the terminal when remain-on-exit is on and the inner process exits. This text is sent through the PTY to xterm.js. The app has no crash overlay because pty-exited was never emitted.
  implication: User sees tmux's dead pane message instead of the app's crash overlay. No restart button visible.

- timestamp: 2026-04-10T09:04:00Z
  checked: Persistence across app restart
  found: When app quits, tmux server stays running (it's a separate daemon). The dead session with remain-on-exit=on persists. On relaunch, spawn_terminal calls "tmux new-session -A -s <name>" which reattaches to the existing dead session (the -A flag means attach-if-exists). User is stuck in dead pane again.
  implication: Dead state survives app lifecycle because tmux sessions are never cleaned up (kill-session at pty.rs:214-216 only runs after EOF, which never comes).

- timestamp: 2026-04-10T09:04:30Z
  checked: restartTabSession in terminal-tabs.tsx
  found: The restart function (line 357-407) is never reachable because the CrashOverlay component (which provides the Restart button) only renders when tab.exitCode is set (crash-overlay.tsx:14). Since pty-exited never fires, exitCode stays undefined, and the overlay never renders.
  implication: Even though restart logic exists and looks correct, it can never be triggered because the overlay that contains the button never appears.

## Resolution

root_cause: The `remain-on-exit on` tmux option (pty.rs:107-109) creates a deadlock in the exit detection flow. portable-pty spawns `tmux new-session` as the child process. The PTY master is connected to the tmux client, not to the inner shell. When the inner shell exits, `remain-on-exit` keeps the tmux session alive, which keeps the tmux client alive, which keeps the PTY master open -- so the read loop (pty.rs:170) never gets EOF. Without EOF, the exit detection code (pty.rs:183-229) never runs, `pty-exited` is never emitted, `tab.exitCode` is never set, and the CrashOverlay never renders. The user sees tmux's raw "Pane is dead" message. On app restart, `tmux new-session -A` reattaches to the still-alive dead session, perpetuating the broken state.
fix:
verification:
files_changed: []
