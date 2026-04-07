---
phase: 04-session-persistence
reviewed: 2026-04-07T14:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src-tauri/src/state.rs
  - src-tauri/src/lib.rs
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-07T14:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the `state.rs` module (session persistence via `state.json`) and the updated `lib.rs` integration. The architecture is sound: state is loaded at startup into Tauri managed state, the `save_state` command updates both in-memory and disk copies via `spawn_blocking`, and the close handler flushes state synchronously. The serde model with per-field defaults and manual `Default` impls is well-designed for forward compatibility. The prior CR-01 (version defaulting to 0) and WR-03 (beforeunload race) have been fixed.

Key concerns: non-atomic file writes risk data loss on crash, the `save_state` command silently swallows mutex poison errors (which causes the close handler to overwrite newer state with stale data), and the `/tmp` fallback for missing HOME is a latent security issue.

## Critical Issues

### CR-01: Non-atomic write to state.json risks data loss or corruption

**File:** `src-tauri/src/state.rs:230-231`
**Issue:** `save_state_sync` uses `std::fs::write` directly. This call truncates the file then writes new content. If the process is killed (SIGKILL, OOM killer, power loss) mid-write, `state.json` will be partially written or empty (zero bytes). On next launch, `load_state_sync` will detect corrupt JSON and fall back to defaults, silently discarding all persisted layout, session, and panel state. This is especially likely during the `on_window_event(CloseRequested)` path in `lib.rs:84-93`, where macOS may terminate the process shortly after the close event fires.
**Fix:** Write to a temporary file in the same directory, then rename (atomic on POSIX filesystems):
```rust
pub fn save_state_sync(state: &AppState) -> Result<(), String> {
    ensure_config_dir();
    let path = state_path();
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, &json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}
```

## Warnings

### WR-01: Mutex lock failure silently ignored in save_state command

**File:** `src-tauri/src/state.rs:260-262`
**Issue:** If the mutex is poisoned (a prior thread panicked while holding it), `managed.0.lock()` returns `Err` and the `if let Ok(...)` silently skips the in-memory update. The disk write still proceeds with the new state, but the close handler (`lib.rs:88`) reads from the in-memory copy and will then overwrite the newer disk state with the stale in-memory copy on shutdown. This creates a data-loss race: save succeeds to disk, close handler overwrites it with old data.
**Fix:** Recover from poison since `AppState` has no invariants to violate:
```rust
let mut guard = managed.0.lock().unwrap_or_else(|e| {
    eprintln!("[efxmux] WARNING: State mutex was poisoned, recovering");
    e.into_inner()
});
*guard = state.clone();
```

### WR-02: Fallback to /tmp/efxmux-fallback when HOME is unset

**File:** `src-tauri/src/state.rs:162-168`
**Issue:** `/tmp` is world-writable. Any local user can pre-create `/tmp/efxmux-fallback/` or place a symlink there before the app runs (symlink attack). On macOS this is lower risk since desktop apps virtually always have HOME set, but it is a latent security issue. The fallback also means the app silently uses a temp directory that is cleaned on reboot, losing state without any user-visible warning.
**Fix:** Fail hard instead of silently falling back. If HOME is unset in a desktop macOS app, something is fundamentally wrong:
```rust
fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .expect("[efxmux] FATAL: HOME environment variable is not set");
    PathBuf::from(home).join(".config/efxmux")
}
```
Alternatively, use `dirs::config_dir()` from the `dirs` crate which handles platform-specific config paths correctly.

## Info

### IN-01: Double JSON parse in load_state_sync

**File:** `src-tauri/src/state.rs:191-203`
**Issue:** The file content is parsed twice: first as `serde_json::Value` to check the version field (line 191), then again as `AppState` (line 202). This is functionally correct but redundant work. Since `AppState.version` already has `#[serde(default = "default_version")]`, the version is always available after a typed parse.
**Fix:** Parse once into `AppState`, then check `state.version`:
```rust
match serde_json::from_str::<AppState>(&content) {
    Ok(state) if state.version == 1 => return state,
    Ok(state) => {
        eprintln!(
            "[efxmux] WARNING: state.json version {} not supported. Using defaults.",
            state.version
        );
    }
    Err(err) => {
        eprintln!(
            "[efxmux] WARNING: Corrupt state.json ({}). Using defaults.",
            err
        );
    }
}
```
Note: This changes behavior slightly -- if a future version 2 adds new fields, the single-parse approach would fail at deserialization rather than at the version check. The current two-pass approach is more defensive in that regard, so this is informational only.

---

_Reviewed: 2026-04-07T14:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
