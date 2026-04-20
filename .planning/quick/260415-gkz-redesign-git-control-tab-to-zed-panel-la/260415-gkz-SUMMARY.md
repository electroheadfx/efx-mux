---
status: complete
phase: quick-260415-gkz
plan: 01
subsystem: git-panel
tags: [git, ui, diff-stats, checkbox, zed-layout]
dependency_graph:
  requires: [git2, tauri-invoke]
  provides: [get_file_diff_stats, checkbox-stage-toggle, click-to-diff]
  affects: [git-control-tab, git-service, git_status, lib]
tech_stack:
  added: []
  patterns: [git2-patch-api, custom-event-dispatch]
key_files:
  created: []
  modified:
    - src-tauri/src/git_status.rs
    - src-tauri/src/lib.rs
    - src/services/git-service.ts
    - src/components/git-control-tab.tsx
decisions:
  - "Used git2 Patch::from_diff API for per-file line_stats instead of diff.foreach() callbacks -- cleaner, per-delta access"
  - "Used diff_tree_to_workdir_with_index for combined staged+unstaged stats in a single pass"
  - "SVG checkmark inline instead of external icon dependency"
metrics:
  duration: "2m 55s"
  completed: "2026-04-15T10:03:44Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 2
  tests_total: 44
---

# Quick Task 260415-gkz: Redesign GitFileRow Summary

Per-file diff stats via git2 Patch API with Zed-style checkbox stage/unstage and click-to-diff row interaction.

## What Changed

### Task 1: Backend diff stats command (ea783b4)

Added `FileDiffStats` struct and `get_file_diff_stats_impl` to `git_status.rs`. Uses git2's `Patch::from_diff` API to iterate deltas and extract per-file `line_stats()` (additions, deletions). Diffs HEAD tree against workdir-with-index to capture both staged and unstaged changes in a single pass.

Registered `get_file_diff_stats` async Tauri command in `lib.rs` invoke handler.

Added `getFileDiffStats` wrapper and `FileDiffStats` interface to `git-service.ts` with graceful error handling (returns empty array on failure).

Added 2 new Rust tests: one verifying additions/deletions for a modified file, one verifying empty stats for a clean repo.

**Files:** `src-tauri/src/git_status.rs`, `src-tauri/src/lib.rs`, `src/services/git-service.ts`

### Task 2: Redesigned GitFileRow component (0031f71)

Replaced the status dot with a gray checkbox (14x14px, rounded corners). When staged, the checkbox fills with `textMuted` color and shows an SVG checkmark. Clicking the checkbox calls `onToggle()` with `stopPropagation` to prevent the row click from firing.

Clicking anywhere else on the row dispatches a `CustomEvent('open-diff', { detail: { path } })` which is caught by both `diff-viewer.tsx` (loads the diff) and `right-panel.tsx` (switches to the Diff tab).

Added diff stats display (+N in green, -N in red) between filename and status badge. Only shown when additions or deletions are non-zero.

Updated `GitFile` interface with `additions` and `deletions` fields. Updated `refreshGitFiles` to call `getFileDiffStats` and merge stats into file objects via a Map lookup.

**Files:** `src/components/git-control-tab.tsx`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `cargo test --manifest-path src-tauri/Cargo.toml` -- 44 tests pass (7 git_status, 12 git_ops, others)
- `cargo build --manifest-path src-tauri/Cargo.toml` -- compiles clean
- `pnpm exec tsc --noEmit` -- zero TypeScript errors

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src-tauri/src/git_status.rs` -- FOUND (contains get_file_diff_stats)
- [x] `src-tauri/src/lib.rs` -- FOUND (contains get_file_diff_stats registration)
- [x] `src/services/git-service.ts` -- FOUND (contains getFileDiffStats)
- [x] `src/components/git-control-tab.tsx` -- FOUND (contains checkbox, open-diff, diff stats)
- [x] Commit ea783b4 -- FOUND
- [x] Commit 0031f71 -- FOUND
