---
phase: quick
plan: 260416-gah
subsystem: git-sidebar
tags: [clipboard, ux, git-history]
dependency_graph:
  requires: []
  provides: [commit-hash-copy-to-clipboard]
  affects: [git-control-tab]
tech_stack:
  added: []
  patterns: [navigator.clipboard.writeText, async-onClick-handler]
key_files:
  created: []
  modified:
    - src/components/git-control-tab.tsx
decisions: []
metrics:
  duration: 35s
  completed: 2026-04-16
---

# Quick Task 260416-gah: Click Commit History Row to Copy Hash

Click-to-copy on git history rows using Web Clipboard API with success/error toast feedback.

## Changes Made

### Task 1: Add click-to-copy handler on HistoryEntry rows
**Commit:** `6ddb77b`

Added an `onClick` handler to the `HistoryEntry` component outer div that:
- Calls `navigator.clipboard.writeText(entry.hash)` to copy the full 40-char commit hash
- Shows a success toast with `'Copied ' + entry.short_hash` on success
- Shows an error toast `'Failed to copy hash'` if clipboard access fails (e.g., webview loses focus)
- Added `cursor: 'pointer'` to indicate the row is clickable

Existing tooltip (`title`), hover effects (`onMouseEnter`/`onMouseLeave`), and `userSelect: 'none'` are all preserved unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
