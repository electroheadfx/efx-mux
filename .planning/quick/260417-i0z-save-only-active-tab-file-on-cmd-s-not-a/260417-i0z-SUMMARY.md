---
quick_id: 260417-i0z
description: save only active tab file on Cmd+S not all tabs
date: 2026-04-17
status: complete
---

# Quick Task 260417-i0z: Summary

## Root cause

`src/main.tsx` Cmd+S handler dispatched `editor-save` CustomEvent on `document`. Every mounted `EditorTab` registered `document.addEventListener('editor-save', …)` and called `triggerEditorSave(tabId)` for its own tabId. Since tabs stay mounted (toggled via `display:none`), every open editor file was saved on every Cmd+S — producing "Saved CLAUDE.md / Saved README.md / Saved test.md" toasts.

## Fix

Replaced event-broadcast with direct function call:

- `src/main.tsx` — Cmd+S handler now calls `triggerEditorSave(activeUnifiedTabId.value)` directly when the active tab is an editor tab.
- `src/components/editor-tab.tsx` — removed the `useEffect` that listened for `editor-save` on `document`; removed the now-unused `triggerEditorSave` import.
- `src/editor/setup.ts` — updated a stale docstring referencing the removed event.

The existing `isActive` focus `useEffect` (editor-tab.tsx:82-86) keeps the active editor focused, so the previous `viewRef.focus()` inside the listener was redundant and was removed with the listener.

## Verification

- `pnpm tsc --noEmit` — clean
- `pnpm vitest run src/components/editor-tab.test.tsx` — 2/2 pass
- `grep "editor-save"` across src — only a docstring in setup.ts references the word "save" for the callback map; no remaining event listeners or dispatches.

## Commits

- `0991a79` fix(quick-260417-i0z): save only active tab on Cmd+S (from executor worktree, fast-forward merged)
- Polish commit (pending): trim verbose inline comment in main.tsx + refresh stale docstring in setup.ts

## Out of scope

Pre-existing test failures in `git-control-tab.test.tsx` and `sidebar.test.tsx` flagged by the executor — unrelated to this task, not touched.
