---
status: complete
phase: quick
plan: 260416-o1k
subsystem: ui
tags: [preact, signals, tab-bar, file-tree, focus-management]

key-files:
  modified:
    - src/components/file-tree.tsx
    - src/components/unified-tab-bar.tsx

key-decisions:
  - "Defer reveal via pendingRevealPath signal rather than polling or retry loop"
  - "Move onClick(tab) after double-click check rather than adding focus override"

duration: 2min
completed: 2026-04-16
---

# Quick 260416-o1k: Fix revealFileInTree Timing and Terminal Tab Rename Focus Summary

**Deferred file-tree reveal via pendingRevealPath signal when tree not loaded, and prevented terminal.focus() from stealing rename input focus on tab double-click**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-16T15:21:46Z
- **Completed:** 2026-04-16T15:23:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- revealFileInTree now works even when Files sidebar was not previously open (defers via pendingRevealPath signal, executed after initTree loads tree data)
- Double-clicking terminal/agent tab labels now correctly enters rename mode without terminal.focus() stealing focus from the rename input

## Task Commits

1. **Task 1: Fix revealFileInTree timing when FileTree not yet mounted** - `53d6917` (fix)
2. **Task 2: Fix terminal/agent tab rename by preventing focus theft on double-click** - `0968b4c` (fix)

## Files Modified

- `src/components/file-tree.tsx` - Added pendingRevealPath signal, deferred reveal in revealFileInTree when treeNodes empty, execute pending reveal in initTree after load
- `src/components/unified-tab-bar.tsx` - Moved onClick(tab) call after double-click detection so second click skips switchToTab/terminal.focus()

## Decisions Made

- Used a signal-based deferred reveal pattern (pendingRevealPath) rather than a retry loop or setTimeout polling -- cleaner and guaranteed to execute exactly once after initTree completes
- Moved onClick(tab) after the double-click check rather than trying to cancel the deferred terminal.focus() -- simpler and avoids race conditions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

---
*Quick: 260416-o1k*
*Completed: 2026-04-16*
