---
quick_id: 260418-b1a
slug: fix-right-panel-crash-overlay
description: fix right-panel crash overlay + main-panel startup race
status: complete
date: 2026-04-18
---

# Quick Task 260418-b1a — Summary

## Scope expanded during execution

Original scope (right-panel overlay mount only) was diagnosed as incomplete after
user reported the `[exited]` symptom also reproduces in the main panel. A second
root cause was found and a unified fix was applied in-session (option c — direct
apply, no replan). See `.planning/debug/terminal-exited-no-restart.md`.

## Root causes

**Bug A — Right-panel missing overlay:**
`right-panel.tsx` did not mount `ActiveTabCrashOverlay` for `scope='right'`.
`tab.exitCode` was being set correctly by the shared `pty-exited` listener, but
no component in the right-panel subtree subscribed to that state.

**Bug B — Startup TOCTOU race (main + right):**
`restoreTabsScoped` in `terminal-tabs.tsx` only committed `s.tabs.value =
restoredTabs` AFTER the full await loop finished. Meanwhile the Rust monitor
thread (pty.rs:284-364) fires `pty-exited` at t≈1s. If a reattached tmux pane
was already dead, the event arrived while `state.tabs.value` was still an empty
array, the listener found no tab with matching `sessionName`, and the event was
silently dropped — so `tab.exitCode` stayed `undefined` forever. No crash
overlay ever rendered, user saw raw tmux `[exited]` text.

## Fixes applied

1. **`src/components/right-panel.tsx`** — mount `ActiveTabCrashOverlay` from
   `getTerminalScope('right')` (aliased `RightCrashOverlay`), rendered
   conditionally on `isDynamic` inside the right-panel content region alongside
   the terminal-containers wrapper. Mirrors `main-panel.tsx:36`.

2. **`src/components/terminal-tabs.tsx`** (`restoreTabsScoped`) — construct
   each `TerminalTab` object before calling `connectPty`, push to
   `restoredTabs`, and commit `s.tabs.value = [...restoredTabs]` immediately.
   Late-arriving `detachResize` and `disconnectPty` are assigned in-place on
   the already-committed tab object. The final `s.tabs.value = [...restoredTabs]`
   is kept as a no-op guard for downstream signal consumers that require a
   fresh identity on completion.

3. **`src-tauri/src/terminal/pty.rs`** — monitor thread initial sleep reduced
   from `Duration::from_secs(1)` to `Duration::from_millis(100)`. Tightens the
   window in which an already-dead reattached pane can be detected. Combined
   with (2), the tab is reliably in `state.tabs.value` before the first
   `pty-exited` emit can fire.

## Files changed

- `src/components/right-panel.tsx`
- `src/components/terminal-tabs.tsx`
- `src-tauri/src/terminal/pty.rs`

## Verification

- `pnpm exec tsc --noEmit` — clean.
- `cargo check` — clean (in `src-tauri`).
- `cargo test --lib` — 74/74 pass.
- `pnpm test -- terminal-tabs` — 24/24 pass.
- Full `pnpm test` — pre-existing unrelated failures in GitControlTab
  (state-manager `updateSession` mock export missing); not touched by this
  task.

## Follow-ups (not in scope)

- `AgentHeader` is hard-coded to main-scope (`terminalTabs` + `activeTabId` at
  module level) so right-scope agent tabs have no Ready/Stopped pill. Track
  separately.
