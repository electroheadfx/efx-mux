---
status: resolved
trigger: "paste-truncation"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — PTY spawned at 80 cols (xterm.js default) because fitAddon.fit() ran before browser layout. Fix applied: await nextFrame() + fitAddon.fit() inserted before connectPty() in all four spawn paths.
test: n/a — fix applied
expecting: n/a
next_action: human verification — paste a long command and confirm it wraps at the correct column

## Symptoms

expected: Pasted text should wrap correctly at terminal's actual visible width
actual: Lines get truncated mid-word and wrap at wrong column. Example: `claude plugin uninstall better-code-review-graph` wraps badly, shows `@n24q02m-plugins` fragment on next line
errors: No error messages - visual rendering issue only
reproduction: Paste any long command (longer than ~40 chars) into any terminal
started: Always been broken - never worked correctly since terminal was added
scope: All xterm.js terminals (main terminal pane AND server pane)

## Eliminated

- hypothesis: PTY resize IPC is broken or never fires
  evidence: resize-handler.ts correctly calls invoke('resize_pty') on ResizeObserver changes with actual terminal.cols/rows. The debounce (150ms) and requestAnimationFrame wrapper are correct.
  timestamp: 2026-04-14

- hypothesis: CSS prevents FitAddon from measuring the container correctly
  evidence: `.terminal-containers` is `absolute inset-0` inside `.terminal-area` which is `position: relative`. This is the correct pattern for FitAddon. No overflow:hidden on the measured element itself.
  timestamp: 2026-04-14

- hypothesis: The ResizeObserver never fires at all
  evidence: The observer watches the container div, which is appended to `.terminal-containers`. Any layout change triggers it. The `requestAnimationFrame` wrapper ensures fit() runs after reflow.
  timestamp: 2026-04-14

## Evidence

- timestamp: 2026-04-14
  checked: terminal-manager.ts createTerminal()
  found: fitAddon.fit() is called at line 123 immediately after terminal.open(container). At this point the container was just passed in — but if the container is not yet in the DOM with real layout dimensions, fit() reads 0 or a default size and terminal.cols stays at 80 (xterm.js default).
  implication: terminal.cols may be 80 at the moment createTerminal() returns.

- timestamp: 2026-04-14
  checked: terminal-tabs.tsx initFirstTab() and createNewTab()
  found: Order is: (1) container created, (2) appended to wrapper, (3) createTerminal(container) called which calls fitAddon.fit(), (4) connectPty(terminal, sessionName, ..., terminal.cols) called immediately after. There is NO await or requestAnimationFrame between step 3 and step 4.
  implication: connectPty passes terminal.cols to spawn_terminal before the browser has reflowed the newly-appended container, so fit() likely measured 0px or the pre-layout default, leaving terminal.cols = 80.

- timestamp: 2026-04-14
  checked: pty-bridge.ts connectPty()
  found: Line 32-38: spawn_terminal is called with `cols: terminal.cols, rows: terminal.rows`. These values are read synchronously right after createTerminal() returns. No delay or second fit() call occurs here.
  implication: The PTY is opened at cols=80 (xterm.js default) regardless of the actual container width.

- timestamp: 2026-04-14
  checked: pty.rs spawn_terminal
  found: PtySize is set using the cols/rows passed from JS (lines 102-108). The tmux session is created with this size. tmux then enforces line wrapping at that col width for all terminal content, including paste.
  implication: tmux wraps at 80 cols. xterm.js renders at actual width (e.g., 120 cols). The paste input echoed by the shell wraps at column 80 inside tmux, but xterm.js displays it at column 120 — so the wrap appears to happen mid-word at an unexpected position from the user's perspective. This is the exact symptom described.

- timestamp: 2026-04-14
  checked: resize-handler.ts attachResizeHandler()
  found: ResizeObserver fires → requestAnimationFrame → fitAddon.fit() → checks cols/rows changed → debounced invoke('resize_pty'). This eventually corrects the PTY size AFTER the initial spawn, but the first correction only happens after the container is fully rendered (one or more frames after mount). Between spawn and first resize event, the PTY is at 80 cols.
  implication: During this window (spawn → first resize correction), any paste is processed by tmux at 80 cols. Even if resize_pty fires quickly, the paste may have already been echoed at the wrong width.

- timestamp: 2026-04-14
  checked: main.tsx bootstrap (line 273)
  found: `setTimeout(() => fitAddon.fit(), 100)` is called after initFirstTab — a 100ms deferred fit. But this is on the fitAddon returned from initFirstTab, NOT before connectPty is called. The PTY was already spawned with wrong cols inside initFirstTab.
  implication: The 100ms delayed fit corrects xterm.js display but does NOT retroactively fix the initial tmux spawn size.

- timestamp: 2026-04-14
  checked: server pane
  found: No server-pane terminal uses the same terminal-containers div. The symptom description says "all xterm.js terminals" — the server pane uses a different mechanism. The same initFirstTab / connectPty pattern applies to any terminal.
  implication: Same root cause applies to both terminal panes.

## Resolution

root_cause: At terminal spawn time, `terminal.cols` is 80 (xterm.js default) because `fitAddon.fit()` is called before the container element has been laid out by the browser. The PTY and tmux session are opened at 80 columns. The ResizeObserver eventually corrects xterm.js dimensions and issues a `resize_pty` IPC call, but this happens after the spawn — and any paste during the interim window (or if the resize IPC hasn't applied yet to the already-open tmux session) is echoed at 80 columns by tmux. The visual result is text wrapping mid-word at column 80 inside a wider terminal display.

fix: Added `nextFrame()` helper (wraps requestAnimationFrame in a Promise) to terminal-tabs.tsx. Inserted `await nextFrame(); fitAddon.fit()` before every `connectPty()` call across all four terminal spawn paths: `createNewTab`, `initFirstTab`, `restoreTabs`, and `restartTabSession`. For `createNewTab` specifically, the tab is shown via `switchToTab` first (to make the container visible) before the frame wait, because the container starts as `display:none`. For `restoreTabs`, containers are left visible during measurement then hidden with `display:none` after fit, letting `switchToTab` reveal only the active one.

verification: Fix applied. Awaiting user to confirm paste wraps correctly in running app.
files_changed:
  - src/components/terminal-tabs.tsx
