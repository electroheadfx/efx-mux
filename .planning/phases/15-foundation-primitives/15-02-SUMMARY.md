---
phase: 15-foundation-primitives
plan: 02
subsystem: backend, services
tags: [git, file-ops, ipc, tauri, typescript]
dependency_graph:
  requires: [git2, tauri]
  provides: [git_ops.rs, file-service.ts, git-service.ts]
  affects: [lib.rs, file_ops.rs]
tech_stack:
  added: []
  patterns: [spawn_blocking, typed_errors, atomic_write]
key_files:
  created:
    - src-tauri/src/git_ops.rs
    - src/services/git-service.ts
    - src/services/git-service.test.ts
    - src/services/file-service.ts
    - src/services/file-service.test.ts
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/src/file_ops.rs
decisions:
  - "GitError enum with typed variants for frontend error handling"
  - "Unstage handles both tracked files (reset_default) and new files (index.remove_path)"
  - "Push auth discovery: SSH key from agent first, then file-based, HTTPS via credential helper"
metrics:
  duration: 5m
  completed: 2026-04-14T21:27:00Z
  tasks: 3
  files: 7
---

# Phase 15 Plan 02: Git Operations & Service Layer Summary

Git ops module and TypeScript service wrappers for stage/unstage/commit/push and file CRUD operations.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create git_ops.rs with stage/unstage/commit/push | 0ad3d3b | src-tauri/src/git_ops.rs |
| 2 | Extend file_ops.rs with write/delete/rename/create | eee681a | src-tauri/src/file_ops.rs |
| 3 | Create git-service.ts and file-service.ts | 9ba9440 | src/services/*.ts |

## What Was Built

### Rust Backend (git_ops.rs)

New module implementing git operations via git2:

- **GitError enum**: Typed error variants (NotARepo, FileNotFound, IndexError, CommitError, PushRejected, AuthFailed)
- **stage_file_impl**: Adds file to git index via `index.add_path()` + `index.write()`
- **unstage_file_impl**: Removes from index; handles both tracked (reset_default) and new files (index.remove_path)
- **commit_impl**: Creates commit with signature, checks for staged changes before committing
- **push_impl**: Pushes to remote with auth discovery (D-09): SSH via agent/file, HTTPS via credential helper

### Rust Backend (file_ops.rs extensions)

Extended existing module with file CRUD operations:

- **write_file_content_impl**: Atomic write using tmp file + rename pattern
- **delete_file_impl**: Handles both files and directories (remove_dir_all)
- **rename_file_impl**: Standard fs::rename
- **create_file_impl**: Creates empty file with parent directory creation

All operations validate paths with `is_safe_path()` to prevent directory traversal (T-15-01).

### TypeScript Services

New `src/services/` directory with IPC wrappers:

**git-service.ts**:
- GitError class with code/details properties
- stageFile, unstageFile, commit, push functions
- Push error detection for AuthFailed and PushRejected codes

**file-service.ts**:
- FileError class with code/details properties
- writeFile, deleteFile, renameFile, createFile functions

### Command Registration

All new commands registered in lib.rs invoke_handler:
- git_ops: stage_file, unstage_file, commit, push
- file_ops: write_file_content, delete_file, rename_file, create_file

## Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| git_ops.rs | 6 | PASS |
| file_ops.rs | 18 | PASS |
| git-service.test.ts | 11 | PASS |
| file-service.test.ts | 10 | PASS |

Total: 45 new tests added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unstage_file for new files**
- **Found during:** Task 1 test execution
- **Issue:** Initial unstage implementation used reset_default which fails for files not in HEAD (newly added files)
- **Fix:** Check if file exists in HEAD tree; use index.remove_path() for new files
- **Files modified:** src-tauri/src/git_ops.rs
- **Commit:** 0ad3d3b

## Verification Results

```
cargo test -- git_ops: 6 passed
cargo test -- file_ops: 18 passed
pnpm test -- git-service: 11 passed
pnpm test -- file-service: 10 passed
```

## Self-Check: PASSED

- [x] src-tauri/src/git_ops.rs exists
- [x] src/services/git-service.ts exists
- [x] src/services/file-service.ts exists
- [x] Commit 0ad3d3b exists (git_ops)
- [x] Commit eee681a exists (file_ops extensions)
- [x] Commit 9ba9440 exists (TypeScript services)
