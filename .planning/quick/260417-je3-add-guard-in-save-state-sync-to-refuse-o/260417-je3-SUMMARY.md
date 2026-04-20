---
status: complete
phase: quick-260417-je3
plan: 01
subsystem: state-persistence
tags: [rust, tauri, defensive-guard, hmr-fix, state-management]
dependency_graph:
  requires:
    - src-tauri/src/state.rs (existing AppState, save_state_sync, load_state_sync)
  provides:
    - state::would_wipe_projects (pub fn)
    - state::guarded_save (pub fn)
  affects:
    - save_state Tauri command (now guarded)
tech_stack:
  added: []
  patterns:
    - "Pre-write disk read for defensive overwrite check"
    - "Mutex-serialized HOME env mutation in Rust unit tests"
key_files:
  created: []
  modified:
    - src-tauri/src/state.rs
decisions:
  - "Guard at JS-facing boundary (Option A) rather than full default-snapshot diff (Option B)"
  - "Silent Ok(()) return on refuse + stderr warning -- no error propagated to JS"
  - "No frontend console.warn -- stderr from Tauri Rust process surfaces in dev console"
metrics:
  duration_seconds: 98
  completed: "2026-04-17"
  tasks: 1
  files_modified: 1
  test_count_delta: "8 -> 11"
---

# Quick Task 260417-je3: HMR-Wipe Guard for save_state Summary

Added defensive guard to the `save_state` Tauri command that refuses to overwrite a non-empty on-disk project list with an empty/default-only project list, preventing the catastrophic state.json wipe scenario where Vite HMR remounts Preact with empty in-memory state during a `git checkout` and atomically replaces the user's project registry.

## What Was Built

### New Public Functions (src-tauri/src/state.rs)

**`pub fn would_wipe_projects(incoming: &AppState) -> bool`**
Pure helper. Returns `true` only when the incoming state has zero projects AND the on-disk state has at least one project. Reads disk via `load_state_sync()`.

**`pub fn guarded_save(state: &AppState) -> Result<(), String>`**
Thin wrapper over `save_state_sync`. If `would_wipe_projects` returns `true`, logs a clear stderr warning naming the HMR scenario and returns `Ok(())` without writing. Otherwise delegates to `save_state_sync`.

### Modified Tauri Command

The `save_state` Tauri command now routes its `spawn_blocking` write through `guarded_save(&state)` instead of `save_state_sync(&state)`. All other behavior (JSON parse, ManagedAppState mutex update, error mapping) is unchanged.

## What Was NOT Touched

- `save_state_sync` -- unchanged. Internal Rust callers continue to use it directly.
- `src-tauri/src/project.rs` -- unchanged. `add_project`, `remove_project`, `switch_project`, `update_project` all call `save_state_sync` directly inside their own `spawn_blocking`. They bypass the guard naturally because they mutate state first then save the already-mutated payload, so an intentional "user removed last project" still persists correctly.
- `load_state_sync` -- unchanged.
- Frontend code -- no changes; the guard is invisible to JS callers (returns `Ok(())` on refuse).

## Tests Added

Test count in `state.rs`: **8 -> 11** (3 new).

| Test | Scenario | Asserts |
|---|---|---|
| `save_state_guard_refuses_wipe` | Disk has 1 project, incoming has 0 | `would_wipe_projects == true`, `guarded_save` returns `Ok`, disk still has 1 project |
| `save_state_guard_allows_empty_to_empty` | Disk empty, incoming empty | `would_wipe_projects == false`, save succeeds, file exists with 0 projects |
| `save_state_guard_allows_non_empty_write` | Disk has 1, incoming has 2 | `would_wipe_projects == false`, save succeeds, disk now has 2 |

### Test Infrastructure

- `with_temp_home(name, closure)` helper sandboxes `HOME` to a unique temp dir per test (PID + test name) and restores `HOME` even on panic.
- `HOME_LOCK: Mutex<()>` at module scope serializes the 3 guard tests so parallel `cargo test` threads don't clobber each other's `HOME` env var. Existing tests are unaffected because they don't touch `HOME`.
- Mutex poisoning is recovered with `unwrap_or_else(|e| e.into_inner())`.

## Verification

- `cd src-tauri && cargo test --lib state::` -> 11/11 pass
- `cd src-tauri && cargo test --lib` -> 72/72 pass (full suite, no regressions)
- `cd src-tauri && cargo build` -> clean, no new warnings
- `git diff cc163bd..HEAD --stat` -> only `src-tauri/src/state.rs` changed (38 lines: +36/-2 in feat commit, +146 in test commit)

## Why This Approach (Option A)

- The bug is specifically the JS frontend round-tripping a default state through the Tauri command. Internal Rust mutations always go through `save_state_sync` directly, so guarding only at the JS boundary is sufficient and surgical.
- Option B (full `AppState::default()` equality check) is fragile: any benign field that legitimately differs from default (e.g., layout sidebar resized to 250px before HMR) would defeat the guard. The "empty projects" check is the actual invariant we care about and is robust to layout/theme/session drift.

## Deviations from Plan

None -- plan executed exactly as written. The TDD RED phase compiled-failed (functions didn't exist) as expected; GREEN phase made all 11 tests pass on first run; no REFACTOR was needed.

## Commits

- `5aaa6ff` -- test(quick-260417-je3): add failing tests for save_state HMR-wipe guard (RED)
- `90a6569` -- feat(quick-260417-je3): add HMR-wipe guard to save_state Tauri command (GREEN)

## Self-Check: PASSED

- FOUND: src-tauri/src/state.rs (modified, contains `would_wipe_projects` and `guarded_save`)
- FOUND: commit 5aaa6ff (test/RED)
- FOUND: commit 90a6569 (feat/GREEN)
- FOUND: 11 state tests pass, 72 total tests pass, clean build
- FOUND: src-tauri/src/project.rs untouched (not in `git diff --stat HEAD~2..HEAD`)
