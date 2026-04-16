---
phase: quick
plan: 260416-gma
subsystem: ui/quit-confirmation
tags: [modal, quit, window-close, cmd-q]
dependency_graph:
  requires: [confirm-modal]
  provides: [quit-confirmation-interceptor]
  affects: [main-bootstrap, confirm-modal-api]
tech_stack:
  added: []
  patterns: [onCloseRequested, getCurrentWindow.destroy]
key_files:
  created: []
  modified:
    - src/main.tsx
    - src/components/confirm-modal.tsx
decisions:
  - "Use getCurrentWindow().destroy() to bypass onCloseRequested handler and avoid infinite loop"
  - "Add configurable confirmLabel to ConfirmModal rather than hardcoding Discard text"
metrics:
  duration: 64s
  completed: "2026-04-16T10:01:29Z"
---

# Quick Task 260416-gma: Add Quit Confirmation Modal on Cmd+Q Summary

**One-liner:** Quit confirmation modal via Tauri onCloseRequested interceptor with configurable confirm button label

## What Was Done

### Task 1: Wire quit confirmation on window close-requested

Wired a `getCurrentWindow().onCloseRequested()` handler in the `bootstrap()` function of `main.tsx` that intercepts Cmd+Q and window close button clicks. The handler calls `event.preventDefault()` to block the default close, then shows the existing `ConfirmModal` with:

- Title: "Quit Efxmux?"
- Message: "Are you sure you want to quit? Active terminal sessions will be preserved by tmux."
- Cancel button: dismisses modal, app stays running
- Quit button: calls `getCurrentWindow().destroy()` which force-closes the window

Also extended the `ConfirmModal` component with an optional `confirmLabel` field on both `ConfirmModalState` and `ShowConfirmModalOptions` interfaces, defaulting to `'Discard'` for backward compatibility. The quit confirmation passes `confirmLabel: 'Quit'` so the button reads "Quit" instead of "Discard".

**Commit:** `0e4732b`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation (`npx tsc --noEmit`): PASSED, zero errors
- Manual verification steps documented in plan (Cmd+Q shows modal, Cancel keeps app, Quit closes app, Escape dismisses)

## Self-Check: PASSED
