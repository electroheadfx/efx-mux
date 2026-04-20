---
status: complete
phase: quick
plan: 260416-h3i
subsystem: ui/tabs
tags: [agent, modal, pty, quit]
dependency_graph:
  requires: [confirm-modal, terminal-tabs, unified-tab-bar]
  provides: [agent-quit-modal, saveLabel-prop]
  affects: [tab-close-flow]
tech_stack:
  patterns: [modal-interception, pty-command-injection]
key_files:
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/confirm-modal.tsx
decisions:
  - Reused existing ConfirmModal with new saveLabel prop rather than creating a separate modal component
  - Used onSave slot (blue button) for "Quit Agent Only" action since it already renders correctly
metrics:
  duration: 75s
  completed: "2026-04-16T10:24:00Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 260416-h3i: Agent Quit Modal on Tab Close

Agent tab close now shows a 3-option modal (Cancel / Quit Terminal / Quit Agent Only) instead of immediately destroying the PTY session.

## What Changed

### confirm-modal.tsx
- Added `saveLabel?: string` to `ConfirmModalState` and `ShowConfirmModalOptions` interfaces
- Blue button text now uses `{saveLabel ?? 'Save File'}` instead of hardcoded "Save File"
- Backward compatible: existing editor dirty-state modals still show "Save File" by default

### unified-tab-bar.tsx
- Added `invoke` import from `@tauri-apps/api/core`
- Modified `closeUnifiedTab` to check `termTab?.isAgent` before closing terminal tabs
- Agent tabs: shows modal with three actions:
  - Cancel: dismisses modal, tab untouched
  - Quit Terminal (red): destroys PTY and removes tab (existing `closeTab` behavior)
  - Quit Agent Only (blue): sends `/exit\r` to PTY via `invoke('write_pty')`, keeps tab open
- Non-agent terminal tabs: close immediately without modal (unchanged behavior)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7e6b324 | feat(quick-260416-h3i): add agent quit modal when closing agent tabs |

## Verification

- TypeScript compiles without errors (`pnpm tsc --noEmit`)
- Manual verification required: open agent tab, close it, confirm modal appears with 3 options

## Self-Check: PASSED

- FOUND: src/components/unified-tab-bar.tsx
- FOUND: src/components/confirm-modal.tsx
- FOUND: commit 7e6b324
