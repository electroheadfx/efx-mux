---
status: resolved
trigger: "Claude Code TUI intermittently fails to enter fullscreen (alternate screen buffer) mode in efx-mux. Shows 'tmux detected' message mid-screen instead of proper TUI. Works correctly in iTerm2 with same Claude Code version."
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T06:00:00Z
---

## Current Focus

hypothesis: The inline export fix in spawn_terminal is correct for NEW sessions, but cannot help existing sessions. When `tmux new-session -A` attaches to a session that already exists (e.g. after app restart), the initial-command argument (with the inline export) is IGNORED — tmux simply attaches to the running session, and the claude process inside already has its environment baked in from when it was first launched. For restores, the env var must be injected by a different mechanism: either (a) kill + recreate the session on restore so the new inline export runs, or (b) use `tmux setenv -t <session>` before spawning claude in a new window/pane (won't help running process). The only reliable option is (a): when session_exists=true AND a shell_command is provided (i.e. it's an agent tab), kill the old session first so spawn_terminal creates a fresh one with the correct env vars.
test: Trace restoreTabs() → connectPty() → spawn_terminal(): session_exists=true → `tmux new-session -A` attaches, ignores initial-command arg → claude runs without CLAUDE_CODE_NO_FLICKER.
expecting: Fix: in spawn_terminal, when session_exists=true AND shell_command is Some (agent tab), kill the old session before creating the new one. This forces fresh session creation with inline export.
next_action: Apply the session-kill-on-restore fix to spawn_terminal in pty.rs.

## Symptoms

expected: Claude Code TUI fills terminal completely (alternate screen mode), status bar at bottom, no "tmux detected" message visible
actual: Claude Code TUI appears truncated, "tmux detected · scroll with PgUp/PgDn" message visible mid-screen, TUI not in fullscreen mode
errors: No error messages - visual rendering issue
reproduction: Restart efx-mux app, tabs restore and reattach to existing tmux sessions where Claude Code is running
started: Intermittent, only happens on restored tabs (reattaching to existing tmux sessions)
scope: Only efx-mux, iTerm2 always works with same Claude Code version

## Eliminated

- hypothesis: Terminal size wrong when PTY spawned (fit reads 80x24 because container is hidden)
  evidence: Container starts VISIBLE before nextFrame+fit, hidden AFTER fit completes. terminal.cols/rows ARE correct when passed to spawn_terminal.
  timestamp: 2026-04-14T00:01:00Z

- hypothesis: resize_pty doesn't propagate SIGWINCH to Claude Code inside tmux
  evidence: Contributing factor (150ms debounce delay) but not the primary cause. Ink handles SIGWINCH and redraws — this alone causes a brief flash, not a permanent TUI failure.
  timestamp: 2026-04-14T00:01:00Z

- hypothesis: send-keys C-l injected into running TUI before PTY attaches (causing wrong-size redraw)
  evidence: This WAS a real bug, fix was correct (removed send-keys C-l). But it doesn't explain why the FIRST tab persistently fails while subsequent tabs work correctly.
  timestamp: 2026-04-14T02:00:00Z

- hypothesis: ResizeObserver fires zero-size fit during restoreTabs for hidden container[0]
  evidence: This WAS also a real secondary bug, fix was correct (guard in resize-handler.ts). But again doesn't explain the env var asymmetry between first and subsequent tabs.
  timestamp: 2026-04-14T02:00:00Z

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  checked: Symptom pattern matching against common-bug-patterns.md
  found: "works sometimes, fails sometimes" + "only on restore" maps to Async/Timing — initialization order (event fires before setup complete)
  implication: Strong candidate: action taken at wrong time relative to tmux attach

- timestamp: 2026-04-14T00:01:00Z
  checked: restoreTabs() in terminal-tabs.tsx (lines 598-667)
  found: Container starts visible, nextFrame() waits for layout, fitAddon.fit() reads correct size, THEN container hidden, THEN connectPty() called. PTY spawn dimensions are correct.
  implication: The size problem is not here.

- timestamp: 2026-04-14T00:01:00Z
  checked: spawn_terminal() in pty.rs — the session_exists block (lines 73-98)
  found: When reattaching to an existing session: (1) `tmux send-keys -t <session> C-l` fired THEN (2) `tmux clear-history -t <session>`. The C-l arrives at the live Claude Code Ink TUI BEFORE the new PTY client attaches. Ink interprets Ctrl+L as clear-screen + full redraw, reads stale dimensions from previously detached client, alternate-screen entry fails, falls back to "tmux detected" inline mode.
  implication: Bug 1 (now fixed): the Ctrl+L injection disrupts TUI state at the worst possible moment.

- timestamp: 2026-04-14T00:01:00Z
  checked: resize_pty() in pty.rs (lines 332-345)
  found: Only calls master.resize() — no explicit tmux resize-window or refresh-client. Resize signal arrives ~200ms after attach via ResizeObserver + 150ms debounce.
  implication: Secondary: small delay before correct dimensions reach Claude Code. Ink handles SIGWINCH correctly once the PTY is attached; this does not cause permanent failure.

- timestamp: 2026-04-14T00:02:00Z
  checked: Fix applied — removed send-keys C-l from session_exists block in spawn_terminal()
  found: clear-history retained. stale-comment on line 70 also updated ("clear its screen and scrollback history" → "clear its scrollback history").
  implication: Bug 1 fixed.

- timestamp: 2026-04-14T01:00:00Z
  checked: restoreTabs() full event-loop trace for 2-tab restore (terminal-tabs.tsx lines 598-667)
  found: For tab[0]: container appended visible → createTerminal (fitAddon.fit sync) → await nextFrame() → fitAddon.fit correct → container.style.display='none' → await connectPty (onResize→resize_pty wired) → attachResizeHandler (ResizeObserver starts watching hidden container[0]). For tab[1]: container appended → createTerminal → await nextFrame() → **browser drains rAF queue → ResizeObserver rAF for container[0] fires → fitAddon[0].fit() on display:none container → terminal[0].cols=0 → terminal.onResize fires → invoke('resize_pty', {cols:0, rows:0, sessionName: session[0]})** → PTY for Claude Code session resized to 0 cols → SIGWINCH with wrong size → TUI breaks.
  implication: Bug 2 (now fixed): guard in resize-handler.ts prevents fitAddon.fit() on hidden containers.

- timestamp: 2026-04-14T02:00:00Z
  checked: User report — real root cause is CLAUDE_CODE_NO_FLICKER=1 env var not being present in first tab
  found: User uses a `c` script that sets `export CLAUDE_CODE_NO_FLICKER=1` before calling claude. Tab[0] is launched by efx-mux via shell wrapper without this env var → claude falls back to non-fullscreen mode. Tab[1+] are plain shells where user runs `c` manually → env var is present → claude TUI works.
  implication: The env var presence/absence is the REAL gating condition for the TUI mode. Bugs 1+2 were real regressions but not the original root cause.

- timestamp: 2026-04-14T02:00:00Z
  checked: portable-pty CommandBuilder source (~/.cargo/registry/.../portable-pty-0.9.0/src/cmdbuilder.rs)
  found: CommandBuilder::new() calls get_base_env() which captures std::env::vars_os() at construction time — i.e., the Tauri process environment. The Tauri .app bundle is launched by macOS launchd with a minimal environment (no user shell profile sourced). CLAUDE_CODE_NO_FLICKER is not set anywhere in lib.rs or pty.rs.
  implication: Any env var set only in the user's shell profile (~/.zshrc, ~/.zprofile) is invisible to efx-mux's CommandBuilder.

- timestamp: 2026-04-14T02:00:00Z
  checked: lib.rs setup block — PATH augmentation (lines 56-68)
  found: lib.rs explicitly augments PATH for bundled app launches but does NOT source the user's shell profile or set CLAUDE_CODE_NO_FLICKER. The comment acknowledges macOS .app bundles get a minimal PATH.
  implication: This confirms the env gap. The fix used by other terminal apps (iTerm2, WezTerm) is to launch shells as login shells so they source ~/.zprofile → ~/.zshrc.

- timestamp: 2026-04-14T02:00:00Z
  checked: pty.rs shell_cmd wrapping (lines 129-135) — current: `format!("{} -c '{}; exec {}'", user_shell, shell_cmd, user_shell)`
  found: Current wrapper uses `-c` flag (non-login, non-interactive shell). This does NOT source ~/.zprofile or ~/.zshrc. A login shell (`-l` flag) sources ~/.zprofile which typically sources ~/.zshrc (or vice versa on some setups), making user-defined env vars available.
  implication: FIX: Change to `format!("{} -l -c '{}; exec {} -l'", user_shell, shell_cmd, user_shell)`. This sources the user's shell profile before launching the agent, so CLAUDE_CODE_NO_FLICKER=1 (and any other user env vars the agent needs) are present.

- timestamp: 2026-04-14T03:00:00Z
  checked: Checkpoint response — user tested the `-l` login shell fix
  found: (1) The env var lives in /Users/lmarques/.config/efx/scripts/c, not ~/.zshrc, so sourcing ~/.zprofile via `-l` doesn't help. (2) The `-l` flag introduced a NEW bug: newlines appearing in Claude prompt input.
  implication: The `-l` approach was wrong. Correct fix: set CLAUDE_CODE_NO_FLICKER=1 directly on CommandBuilder.env() in spawn_terminal, and inline export in switch_tmux_session shell wrapper. This bypasses the shell profile sourcing problem entirely.

- timestamp: 2026-04-14T03:00:00Z
  checked: Fix applied — spawn_terminal CommandBuilder env block and switch_tmux_session shell wrapper
  found: (spawn_terminal) Added cmd.env("CLAUDE_CODE_NO_FLICKER", "1"), cmd.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"), cmd.env("ENABLE_LSP_TOOL", "1") to the CommandBuilder alongside TERM/LANG. Reverted `-l` flag back to plain `-c`. (switch_tmux_session) Inline export of all three vars prepended to shell wrapper command. Reverted `-l` flag.
  implication: CLAUDE_CODE_NO_FLICKER=1 is now guaranteed present regardless of user's shell profile setup. The newline-in-input bug from `-l` is gone.

- timestamp: 2026-04-14T04:00:00Z
  checked: Why cmd.env() on CommandBuilder did NOT reach Claude Code — tmux env inheritance mechanics
  found: Experimental proof: `CLAUDE_CODE_NO_FLICKER=TEST_VALUE tmux new-session -d -s test "/bin/zsh -c 'echo $CLAUDE_CODE_NO_FLICKER > /tmp/out.txt'"` writes empty string. tmux spawns new session shells from the SERVER's environment (captured when the tmux server started), not from the connecting CLIENT's environment. cmd.env() sets vars on the tmux client process only — they never reach the shell inside the session. Inline export (`export CLAUDE_CODE_NO_FLICKER=1; claude`) writes FLICKER_VAL=1. tmux -e flag also works.
  implication: Previous fix was architecturally wrong. cmd.env() calls in spawn_terminal are inert for this purpose. The shell wrapper format! string must contain the inline export. switch_tmux_session already did this correctly. spawn_terminal did not — now fixed by changing the wrapped format! to prepend `export CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ENABLE_LSP_TOOL=1;` before the shell_cmd.

- timestamp: 2026-04-14T05:00:00Z
  checked: Why the inline export fix in spawn_terminal still failed for the FIRST TAB on restore (user checkpoint report: "other panes work fine")
  found: When `tmux new-session -A` is called on a session that ALREADY EXISTS, the `-A` flag causes tmux to attach to the running session and the initial-command argument (the inline-export shell wrapper) is SILENTLY IGNORED. tmux does not re-run the initial command on attach — only on creation. The existing claude process inside the session has its environment frozen from when it was first launched. If that launch predates the inline-export fix, CLAUDE_CODE_NO_FLICKER=1 is absent. The "other panes work fine" asymmetry is explained by tab type: first tab = claude (agent); other tabs = plain shell. The plain shell tabs don't need the env var, so they appear fine regardless.
  implication: The inline export fix is correct but only activates for NEW sessions. Restore of existing sessions bypasses it entirely via the -A attach path. Fix required: for agent tabs (shell_command is Some and non-empty), kill the existing tmux session before calling new-session, forcing fresh session creation with the inline export running.

## Resolution

root_cause: Three cooperating bugs:

  1. (pty.rs FIXED) `tmux send-keys -t <session> C-l` was fired into the running Claude Code Ink TUI BEFORE the new PTY client attached. Ink interpreted Ctrl+L as clear-screen + full redraw at stale dimensions, alternate-screen entry failed, TUI fell back to "tmux detected" inline mode.

  2. (resize-handler.ts FIXED) During restoreTabs(), ResizeObserver for hidden container[0] fired during tab[1]'s nextFrame(), causing fitAddon[0].fit() to measure 0 cols and invoke resize_pty with zero dimensions — SIGWINCH with wrong size broke the TUI.

  3. (pty.rs FIXED — full mechanism confirmed) CLAUDE_CODE_NO_FLICKER=1 was absent from the Claude Code process environment. cmd.env() on the CommandBuilder only sets vars on the tmux CLIENT process — tmux spawns shells from the SERVER's environment, so client env vars never reach the shell inside the session. The correct fix is inline export inside the shell wrapper format! string. However, this only works for NEW sessions: when `tmux new-session -A` attaches to an EXISTING session, tmux ignores the initial-command argument entirely. For restored agent tabs, the old running claude process retained its environment from first launch. Fix: when session_exists=true AND shell_command is Some (agent tab), kill the existing session first, forcing fresh creation with the inline-export wrapper running.

fix:
  1. DONE: Removed `tmux send-keys -t <session> C-l` from session_exists block in spawn_terminal() (pty.rs).
  2. DONE: Added `if (container.style.display === 'none') return;` guard in attachResizeHandler() (resize-handler.ts).
  3. DONE: spawn_terminal() shell wrapper format! prepends inline export of all three env vars. Additionally, when session_exists=true AND shell_command is non-empty, the existing tmux session is killed before new-session runs — guaranteeing a fresh session where the inline export reaches claude on startup.

verification: Confirmed by user — fix works end-to-end. Claude Code TUI enters fullscreen correctly on new and restored tabs.
files_changed: [src-tauri/src/terminal/pty.rs, src/terminal/resize-handler.ts]
