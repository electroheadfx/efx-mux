---
phase: "04"
plan: "03"
subsystem: state-persistence
tags: [bug-fix, gap-closure, state, close-handler]
dependency_graph:
  requires: ["04-01", "04-02"]
  provides: ["version-default-fix", "close-handler-save"]
  affects: ["src-tauri/src/state.rs", "src-tauri/src/lib.rs"]
tech_stack:
  added: []
  patterns: ["ManagedAppState mutex wrapper", "on_window_event close handler"]
key_files:
  created: []
  modified:
    - src-tauri/src/state.rs
    - src-tauri/src/lib.rs
decisions:
  - "Used window.state() instead of try_state() since ManagedAppState is always registered in setup"
  - "Clone state out of MutexGuard before passing to save_state_sync to satisfy borrow checker"
metrics:
  duration: "2m 42s"
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 04 Plan 03: Gap Closure for CR-01 and WR-03 Summary

Fix two bugs blocking session persistence: AppState version defaulting to 0 (CR-01) and unreliable JS beforeunload save (WR-03). Added default_version() returning 1 with manual Default impl, plus Rust-side ManagedAppState with CloseRequested handler for guaranteed synchronous save on window close.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Fix AppState version default to 1 (CR-01) | b415a4f | Done |
| 2 | Add Rust-side CloseRequested handler (WR-03) | 2562eba | Done |

## Changes Made

### Task 1: Fix AppState version default to 1 (CR-01)

- Added `default_version()` function returning `1` to `state.rs`
- Changed `#[serde(default)]` to `#[serde(default = "default_version")]` on the version field
- Removed `Default` from AppState derive macro, replaced with manual `impl Default for AppState` that calls `default_version()`
- Ensures both serde deserialization and Rust `AppState::default()` produce version=1, so `load_state_sync` accepts saved state

### Task 2: Add Rust-side CloseRequested handler (WR-03)

- Added `ManagedAppState(pub Mutex<AppState>)` wrapper struct to `state.rs`
- Updated `save_state` Tauri command to accept `tauri::State<'_, ManagedAppState>` and update in-memory copy on every save
- Added `use tauri::Manager` import and `app.manage(ManagedAppState(...))` in `setup()` with initial state loaded from disk
- Added `.on_window_event()` handler that intercepts `WindowEvent::CloseRequested` and synchronously writes state to disk
- JS beforeunload handler remains as belt-and-suspenders approach

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Tauri 2 API: try_state -> state**
- **Found during:** Task 2 verification
- **Issue:** Plan specified `window.try_state::<ManagedAppState>()` but Tauri 2's Window type does not have `try_state` -- only `state()` (via `Manager` trait)
- **Fix:** Changed to `window.state::<ManagedAppState>()` and added `use tauri::Manager`
- **Files modified:** src-tauri/src/lib.rs
- **Commit:** 2562eba

**2. [Rule 3 - Blocking] Fixed borrow checker issue with MutexGuard lifetime**
- **Found during:** Task 2 verification
- **Issue:** `managed.0.lock()` guard was borrowed in `if let Ok(guard)` but dropped at wrong scope boundary, causing E0597
- **Fix:** Clone state out of lock guard before passing to `save_state_sync`
- **Files modified:** src-tauri/src/lib.rs
- **Commit:** 2562eba

## Verification Results

- `cargo check --manifest-path src-tauri/Cargo.toml` passes with no errors
- `fn default_version` found in state.rs
- `#[serde(default = "default_version")]` found in state.rs
- `WindowEvent::CloseRequested` handler found in lib.rs
- `ManagedAppState` defined in state.rs and used in lib.rs (3 references)
- No `derive(Default)` on AppState (manual impl instead)

## Self-Check: PASSED

All files exist, all commits verified.
