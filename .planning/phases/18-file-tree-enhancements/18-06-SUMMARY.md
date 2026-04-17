---
phase: 18-file-tree-enhancements
plan: 06
subsystem: file-ops
tags: [rust, tauri, file-ops, git, git2, frontend, preact, gap-closure, uat]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: Phase 18 UAT diagnosis (inline-create-overwrites-existing, revert-button-fails-untracked) + per-file revert button (pre-18 Quick 260415-he6)
provides:
  - "create_file_impl Path::exists() guard matching create_folder_impl"
  - "revert_file_impl status-aware branching (WT_NEW delete, WT_MODIFIED checkout, CURRENT no-op)"
  - "handleRevertAll per-file try/catch with summary toast"
  - "Three new Rust unit tests pinning the fixes"
affects: [18-07, 18-08, 18-09, future file-ops changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-write existence guard for fs::write operations (mirror create_folder pattern)"
    - "Status-aware git operations via git2::Repository::status_file before shell-out"
    - "Per-iteration try/catch in sequential async loops for resilience"

key-files:
  created: []
  modified:
    - src-tauri/src/file_ops.rs
    - src-tauri/src/git_ops.rs
    - src/components/git-control-tab.tsx

key-decisions:
  - "Error string contract: 'File already exists: <path>' — contains 'already exists' substring so file-tree.tsx:626-634 matcher fires"
  - "revert on untracked = delete (no trash crate) — matches the 'revert' semantic the user expects for new files"
  - "Drop repo handle AFTER status_file() but BEFORE fs::remove_file/shell-out to avoid lock contention"
  - "workdir.to_path_buf() + rel_path.to_path_buf() — own the paths so drop(repo) releases cleanly"
  - "Summary toast message 'Reverted X of Y files' — shows both counts; hint truncates at 3 failures + '+N more'"

patterns-established:
  - "Asymmetric command guards: any fs::write/create_dir_all command with 'create' semantics MUST check Path::exists() first"
  - "Status branching before shell-out: git2 checks the state, then shell git performs the side effect"
  - "Sequential async loop resilience: outer try/finally for cleanup, inner try/catch per iteration for continuation"

requirements-completed: [TREE-01, MAIN-03]

# Metrics
duration: 3min
completed: 2026-04-17
---

# Phase 18 Plan 06: UAT Gap Closure (Backend + Revert All) Summary

**Path::exists() guard on create_file, status-aware revert_file branching, and per-file resilient handleRevertAll — closes UAT Test 8 BLOCKER and UAT Test 18.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T05:40:04Z
- **Completed:** 2026-04-17T05:43:21Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **UAT Test 8 BLOCKER closed:** `create_file_impl` now rejects existing paths with `File already exists: <path>` instead of silently truncating via `std::fs::write(path, "")`. The frontend `InlineCreateRow.commit()` catch at file-tree.tsx:626-634 now fires and renders the inline `'<name>' already exists` error. Data loss path removed.
- **UAT Test 18 backend fix:** `revert_file_impl` now branches on `git2::Status`: WT_NEW → `fs::remove_file` (so untracked files actually get reverted), WT_MODIFIED/WT_DELETED/WT_TYPECHANGE/WT_RENAMED → `git checkout -- <path>` (unchanged), CURRENT or INDEX-only → `Ok(())` no-op. Misleading "git checkout is a no-op which is correct" comment removed.
- **UAT Test 18 frontend fix:** `handleRevertAll` wraps each `await revertFile(...)` in an inner try/catch. Failures are counted, logged via `addLogEntry`, and surfaced as one summary toast (`Reverted X of Y files` + truncated failure list). A single failing file no longer aborts the batch.
- **Test coverage:** 3 new Rust unit tests (create_file_rejects_existing, revert_file_deletes_untracked, revert_file_no_op_on_clean). All pre-existing tests pass: file_ops 32/32, git_ops 14/14.

## Task Commits

Each task was committed atomically following TDD RED → GREEN discipline:

1. **Task 1 RED: add failing test for create_file_rejects_existing** — `159dbf4` (test)
2. **Task 1 GREEN: create_file rejects existing path instead of truncating** — `df6741f` (fix)
3. **Task 2 RED: add failing tests for revert_file untracked + clean cases** — `3f76445` (test)
4. **Task 2 GREEN: revert_file deletes untracked, no-ops on clean files** — `db87aa3` (fix)
5. **Task 3: handleRevertAll continues after per-file failures** — `8ed6d47` (fix)

## Files Created/Modified

- `src-tauri/src/file_ops.rs` — Added `Path::exists()` guard to `create_file_impl` (line 361-365); added `create_file_rejects_existing` test covering error substring + content preservation
- `src-tauri/src/git_ops.rs` — Replaced unconditional `git checkout` with status_file branching (WT_NEW / WT_MODIFIED cluster / CURRENT); added `revert_file_deletes_untracked` + `revert_file_no_op_on_clean` tests
- `src/components/git-control-tab.tsx` — `handleRevertAll`: inner per-file try/catch, `successCount` + `failures` tracking, summary toast with truncated hint

## Decisions Made

- **Error string format:** `File already exists: {path}` (symmetric with `Path already exists: {path}` from create_folder_impl). The lowercase `already exists` substring is the frontend matcher contract — both strings satisfy it.
- **Untracked revert = delete (no trash):** The debug session proposed an optional `trash` crate for safety. Plan explicitly chose `std::fs::remove_file` to keep the fix minimal and match the user's expressed intent (revert on a new file = make it go away). If users later request undo-safety, swapping in `trash` is a one-line change.
- **Status-aware branching location:** Chose backend (`git_ops.rs`) over frontend gating. Frontend-side would duplicate status logic and break symmetry with handleRevertAll. Backend is the right place.
- **Path ownership in revert_file_impl:** Used `workdir.to_path_buf()` and `rel_path.to_path_buf()` so we own the paths before `drop(repo)`. The original code had `&str` borrows that would have been invalid after drop, a latent bug revealed by the rewrite.
- **Summary toast design:** `Reverted X of Y files` shows both numbers so the user sees partial success. `failures.slice(0, 3)` + `+N more` keeps the toast hint readable with large batches.

## Deviations from Plan

None — plan executed exactly as written.

### Notes on TDD Behavior

- `revert_file_deletes_untracked` correctly failed RED with the predicted error: `RevertError("error: pathspec 'untracked.txt' did not match any file(s) known to git\n")`. GREEN fix made it pass.
- `revert_file_no_op_on_clean` already passed RED. This was expected and called out in the plan: "Current impl may pass or fail depending on git's behavior; either way the test pins the contract." `git checkout -- <unchanged-path>` exits 0 on system git, so the test pinned the existing behavior and was re-verified after the rewrite.
- `create_file_rejects_existing` failed RED on the content-preservation assertion (not the error assertion) — the current impl returned `Ok(())` after truncating. GREEN fix made it pass on both assertions.

## Issues Encountered

None — three commits flowed cleanly through cargo test and tsc.

## Verification

```bash
cd src-tauri && cargo test --lib file_ops::tests       # 32/32 pass
cd src-tauri && cargo test --lib git_ops::tests        # 14/14 pass (including 3 revert_file tests)
cd src-tauri && cargo check                             # clean, no warnings
pnpm tsc --noEmit                                       # clean

# Acceptance grep counts
grep -c "if Path::new(path).exists()" src-tauri/src/file_ops.rs      # 2 (create_folder + create_file)
grep -c "git2::Status::WT_NEW" src-tauri/src/git_ops.rs               # 1
grep -c "fn revert_file_deletes_untracked" src-tauri/src/git_ops.rs   # 1
grep -c "fn create_file_rejects_existing" src-tauri/src/file_ops.rs   # 1
grep -c "successCount" src/components/git-control-tab.tsx             # 4
grep -c "git checkout is a no-op which is correct" src-tauri/src/git_ops.rs  # 0 (comment removed)
```

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 18-06 closes the two backend UAT bugs (create_file silent overwrite + revert_file on untracked) and the one frontend gap (Revert All batch abort) without touching Plans 18-07 / 18-08 / 18-09 scope.
- Frontend matcher in `file-tree.tsx:626-634` is now reachable for file-kind conflicts — manual UAT can retest the inline-create error path.
- Per-file revert button in `git-control-tab.tsx` can now be clicked on untracked files without errors.
- No new blockers. Ready for manual UAT re-run on tests 8 and 18.

## Self-Check: PASSED

- All 3 modified files present on disk
- All 5 task commits present in git log (159dbf4, df6741f, 3f76445, db87aa3, 8ed6d47)
- file_ops tests: 32/32 pass
- git_ops tests: 14/14 pass
- cargo check: clean
- pnpm tsc --noEmit: clean
- All acceptance grep counts match expectations

---
*Phase: 18-file-tree-enhancements*
*Plan: 06*
*Completed: 2026-04-17*
