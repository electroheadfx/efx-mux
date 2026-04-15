---
status: complete
quick_id: 260415-he6
description: Add per-file revert button and replace ellipsis with Revert All in Git tab
date: 2026-04-15
---

# Quick Task 260415-he6: Summary

## What Changed

### Task 1: Rust backend — revert_file command
- Added `RevertError` variant to `GitError` enum in `git_ops.rs`
- Implemented `revert_file_impl()` using git2 checkout to discard working tree changes
- Registered `revert_file` Tauri command in `lib.rs`

### Task 2: Frontend — per-file revert + Revert All button
- Added `revertFile` wrapper in `git-service.ts`
- Replaced `MoreHorizontal` ellipsis button with "Revert All" button in header bar
- Added per-file Undo2 revert icon in `GitFileRow` for unstaged changed files
- Wired `handleRevertFile` and `handleRevertAll` handlers with confirmation, error logging, and refresh

## Commits
- `dd76794` feat(quick-260415-he6): add revert_file Rust backend command
- `3a7ba5f` feat(quick-260415-he6): add per-file revert button and Revert All in header
