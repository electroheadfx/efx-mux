---
quick_id: 260417-iat
description: add keyboard shortcut to delete folder in file tree
date: 2026-04-17
status: complete
---

# Quick Task 260417-iat: Summary

## Root cause

Keyboard delete handlers (`handleFlatKeydown`, `handleTreeKeydown`, `delete-selected-tree-row` listener) already supported folders — no `is_dir` filter. Two separate gaps made Delete/Backspace/Cmd+Backspace appear broken on folders:

1. **Focus gap (flat + tree):** Scroll container at `file-tree.tsx:1487-1488` has `tabIndex={0}` and `onKeyDown={handleKeydown}`, but clicking a nested row div did NOT transfer focus to the container. Keydowns never reached the handler. The dropdown Delete worked because it called `triggerDeleteConfirm(entry)` directly.
2. **Flat-mode single-click race:** Single-clicking a folder called `loadDir(entry.path)`, which reset `selectedIndex.value = -1`. Even if focus had landed, `entries.value[-1]` was undefined → no-op.

## Fix

`src/components/file-tree.tsx`:

- Added `scrollContainerRef.current?.focus({ preventScroll: true })` at the top of both flat-mode and tree-mode row `onClick` handlers.
- Flat-mode folder single-click: removed `loadDir` call — now selects only.
- Flat-mode folder `onDblClick={() => void loadDir(entry.path)}` — double-click navigates (matches Finder / VS Code / Zed).
- Exported `viewMode`, `selectedIndex`, `currentPath` signals for deterministic test assertions.

Not touched: `handleFlatKeydown`, `handleTreeKeydown`, `triggerDeleteConfirm`, `delete-selected-tree-row` listener, `src-tauri/src/lib.rs`, plain-Backspace parent-nav branch, drag-move, rename, context-menu.

## Tests added

`src/components/file-tree.test.tsx` — 4 new regression tests (TDD):

- **Test A:** tree-mode click folder → Delete → `Delete folder src?` ConfirmModal.
- **Test B:** clicking any row moves `document.activeElement` to the `[tabindex=0]` container.
- **Test C:** flat-mode folder single-click → `selectedIndex === 0`, `currentPath` unchanged, then Delete → folder ConfirmModal.
- **Test D:** flat-mode folder double-click → `currentPath` updated (navigation happened).

## Verification

- `pnpm exec vitest run src/components/file-tree.test.tsx` — 46/46 pass (4 new + all pre-existing regression tests)
- `pnpm exec tsc --noEmit` — clean
- Manual UAT (7 scenarios from plan) — approved by user

## Commits

- `029ee53` feat(quick-260417-iat): keyboard delete shortcut for folders in file tree
