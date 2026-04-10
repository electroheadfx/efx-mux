# Quick Task 260410-wtw: Open FileTree by default on launch

**Completed:** 2026-04-10
**Commit:** 751cfcb

## Summary

Fixed the right sidebar so the **File Tree tab is shown by default on app launch**.

## Root Cause

`src-tauri/src/state.rs` — `default_right_top_tab()` was returning `"GSD"` but should return `"File Tree"` to match the JS `RIGHT_TOP_TABS` array.

## Changes

| File | Change |
|------|--------|
| `src-tauri/src/state.rs` | Changed `"GSD".into()` → `"File Tree".into()` in `default_right_top_tab()` |

## Verification

```bash
grep -n "default_right_top_tab" src-tauri/src/state.rs
```

App should launch with the File Tree tab active in the right-top panel.
