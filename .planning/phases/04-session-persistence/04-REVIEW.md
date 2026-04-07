---
phase: 04-session-persistence
reviewed: 2026-04-07T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src-tauri/src/state.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/theme/watcher.rs
  - src/state-manager.js
  - src/main.js
  - src/drag-manager.js
  - src/theme/theme-manager.js
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-07T12:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 4 introduces session persistence via `state.json` backed by a Rust file I/O layer. The architecture is sound: Rust handles file reads/writes on `spawn_blocking` threads, the JS layer maintains an in-memory copy with update helpers, and a file watcher enables external edits to propagate. However, there is one critical correctness bug (default version mismatch causes state loss on re-read), several warnings around data loss on write and a feedback loop in the file watcher, and one dead code path in the initial DOM layout application.

## Critical Issues

### CR-01: Default AppState version is 0, but load rejects anything except version 1

**File:** `src-tauri/src/state.rs:5-8` and `src-tauri/src/state.rs:171-178`
**Issue:** `AppState` derives `Default`, which sets `version: u32` to `0`. However, `load_state_sync` (line 172) checks `if v != 1` and returns defaults when the version is not 1. This means:
1. On first launch, `load_state_sync` returns `AppState::default()` with `version: 0`.
2. `save_state_sync` writes `{"version": 0, ...}` to disk.
3. On next launch, `load_state_sync` reads `version: 0`, rejects it as unsupported, and returns defaults again -- discarding all persisted layout, session, and panel state.

All user customizations are silently lost on every restart.

**Fix:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    #[serde(default = "default_version")]
    pub version: u32,
    // ... rest unchanged
}

fn default_version() -> u32 {
    1
}
```
Remove `Default` derive from `AppState` and implement it manually, or add the `default_version` function and use `#[serde(default = "default_version")]`. The key requirement is that the default version must be `1`, not `0`.

## Warnings

### WR-01: Non-atomic file write risks state.json corruption

**File:** `src-tauri/src/state.rs:210`
**Issue:** `save_state_sync` uses `std::fs::write` directly. If the app crashes or is force-quit mid-write, `state.json` will be truncated/corrupt. The `load_state_sync` function handles corrupt JSON gracefully (falls back to defaults), but the user loses their persisted state.
**Fix:** Write to a temporary file then rename atomically:
```rust
pub fn save_state_sync(state: &AppState) -> Result<(), String> {
    ensure_config_dir();
    let path = state_path();
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}
```

### WR-02: File watcher re-emits state-changed on self-writes, creating feedback loop

**File:** `src-tauri/src/theme/watcher.rs:64-86`
**Issue:** The watcher watches `~/.config/efxmux/` for changes to `state.json`. When `save_state` writes to `state.json`, the watcher fires and emits a `state-changed` event back to JS. If the JS frontend listens on `state-changed` and re-applies the state, this creates a write-read-write feedback loop. Even without an explicit listener today, this is a latent hazard -- any future consumer of `state-changed` will trigger it.
**Fix:** Either (a) add an `AtomicBool` flag that `save_state_sync` sets before writing and the watcher checks before emitting, or (b) compare the incoming JSON to a cached last-written value and skip the emit if identical.

### WR-03: beforeunload handler cannot guarantee async save completes

**File:** `src/state-manager.js:97-105`
**Issue:** The `beforeunload` event handler calls `invoke('save_state', ...)` which is async, but `beforeunload` does not wait for promises to resolve. In most browsers and WebViews, the page is torn down immediately after the synchronous portion of the handler returns. The Tauri IPC call may not complete, resulting in lost state on app close.
**Fix:** Use `navigator.sendBeacon` as a fallback, or better, have the Rust `setup` hook register a `on_window_event(WindowEvent::CloseRequested)` handler that saves state synchronously before the window closes:
```rust
// In lib.rs setup:
let app_handle = app.handle().clone();
app.on_window_event(move |_window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let state = /* load current state from managed state */;
        let _ = state::save_state_sync(&state);
    }
});
```

### WR-04: Initial right-h-pct DOM application targets elements that do not exist yet

**File:** `src/main.js:29-45`
**Issue:** Lines 36-44 attempt to query `.right-panel`, `.right-top`, and `.right-bottom` to apply the persisted split percentage. However, Arrow.js components are not mounted until line 74 (`html\`...\`(app)`), so `document.querySelector('.right-panel')` returns `null` at this point. The code silently does nothing, and the split percentage is not restored until the duplicate logic in `requestAnimationFrame` (lines 150-161).

The early block (lines 29-45) is dead code for `right-h-pct`. The `sidebar-w` and `right-w` CSS custom property assignments (lines 31-32) do work because they target `document.documentElement.style`, not DOM elements.

**Fix:** Remove the dead right-h-pct block from lines 33-44. The `requestAnimationFrame` block at lines 150-161 already handles this correctly after DOM mount.

## Info

### IN-01: config_dir falls back to /tmp on missing HOME

**File:** `src-tauri/src/state.rs:141-148`
**Issue:** When `HOME` is not set, `config_dir` falls back to `/tmp/efxmux-fallback`. On macOS, `/tmp` is world-readable. While this is an edge case (HOME is virtually always set on macOS), writing user configuration to a world-readable directory could leak session names, layout preferences, and theme settings to other users on multi-user systems.
**Fix:** Consider using `dirs::config_dir()` from the `dirs` crate which handles platform-specific config paths robustly, or at minimum create the fallback directory with restricted permissions (`std::fs::create_dir_all` + explicit `std::fs::set_permissions` with mode `0o700`).

---

_Reviewed: 2026-04-07T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
