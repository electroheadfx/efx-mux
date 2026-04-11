---
phase: 04-session-persistence
reviewed: 2026-04-07T13:26:25Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src-tauri/src/lib.rs
  - src-tauri/src/state.rs
  - src/drag-manager.js
  - src/main.js
  - src/state-manager.js
  - src/theme/theme-manager.js
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-07T13:26:25Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the full Phase 4 session persistence surface: Rust backend (state.rs, lib.rs) and JS frontend (state-manager.js, main.js, drag-manager.js, theme-manager.js). The architecture is sound -- state loads at startup into Tauri managed state, `save_state` updates both in-memory and disk copies via `spawn_blocking`, and the close handler flushes state synchronously as a safety net. Prior review findings (CR-01 non-atomic write, WR-01 mutex poison, WR-02 /tmp fallback) have all been fixed correctly: state.rs now uses tmp+rename for atomic writes, recovers from mutex poison via `into_inner()`, and panics on missing HOME instead of silently falling back.

One warning remains: the Arrow.js `watch()` in main.js fires immediately on creation, triggering an unnecessary save on every app startup. Two informational items noted: dead code in the early layout application and the double JSON parse pattern (carried forward from prior review, still informational).

## Warnings

### WR-01: Arrow.js watch fires immediately, saving state on every startup

**File:** `src/main.js:56-62`
**Issue:** Arrow.js `watch()` executes its callback immediately upon creation. This means `updateLayout({ 'sidebar-w': w, 'sidebar-collapsed': collapsed })` fires during app initialization, triggering a full `saveAppState()` round-trip (JSON serialize, IPC invoke, spawn_blocking, file write) before the app has finished mounting. This happens on every startup, even when no state has changed. While not a data corruption risk (the values are correct), it adds unnecessary I/O and could race with the initial `loadAppState()` if timing is unfortunate.
**Fix:** Guard the watch callback to skip the first invocation, or compare against the loaded state before saving:
```js
let initialRender = true;
watch(() => {
  const collapsed = state.sidebarCollapsed;
  const w = collapsed ? '40px' : '200px';
  document.documentElement.style.setProperty('--sidebar-w', w);
  if (initialRender) {
    initialRender = false;
    return;
  }
  updateLayout({ 'sidebar-w': w, 'sidebar-collapsed': collapsed });
});
```

## Info

### IN-01: Dead code -- early layout application before DOM exists

**File:** `src/main.js:29-44`
**Issue:** Lines 29-44 attempt to apply `right-h-pct` to `.right-panel`, `.right-top`, and `.right-bottom` elements. However, Arrow.js has not yet rendered the DOM at this point (that happens at line 74 with `html\`...\`(app)`). The `querySelector` calls will return null, making the inner `if` blocks unreachable. The same logic is correctly duplicated inside the `requestAnimationFrame` callback at lines 150-161, where the DOM does exist. The `--sidebar-w` and `--right-w` CSS property assignments on lines 31-32 do work because they target `document.documentElement`, not component-rendered elements.
**Fix:** Remove lines 33-44 (the `right-h-pct` block). The CSS custom property assignments on lines 31-32 should remain:
```js
if (appState?.layout) {
  const { layout } = appState;
  if (layout['sidebar-w']) document.documentElement.style.setProperty('--sidebar-w', layout['sidebar-w']);
  if (layout['right-w']) document.documentElement.style.setProperty('--right-w', layout['right-w']);
}
```

### IN-02: Double JSON parse in load_state_sync

**File:** `src-tauri/src/state.rs:188-207`
**Issue:** The file content is parsed twice: first as `serde_json::Value` to check the version field (line 188), then again as `AppState` (line 199). This is functionally correct but redundant. Since `AppState.version` has `#[serde(default = "default_version")]`, the version is always available after a typed parse. The current two-pass approach is more defensive against future schema changes (a version 2 with new required fields would fail deserialization, whereas the Value check catches it earlier with a cleaner message), so this is informational only.
**Fix:** Optional -- parse once into `AppState`, then check `state.version`:
```rust
match serde_json::from_str::<AppState>(&content) {
    Ok(state) if state.version == 1 => return state,
    Ok(state) => {
        eprintln!("[efxmux] WARNING: state.json version {} not supported.", state.version);
    }
    Err(err) => {
        eprintln!("[efxmux] WARNING: Corrupt state.json ({}). Using defaults.", err);
    }
}
```

---

_Reviewed: 2026-04-07T13:26:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
