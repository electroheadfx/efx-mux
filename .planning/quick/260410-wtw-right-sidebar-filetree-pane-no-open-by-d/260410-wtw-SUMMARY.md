# Quick Task 260410-wtw: Fix FileTree default open on launch

**Completed:** 2026-04-10
**Commit:** (pending)

## Summary

Fixed the right sidebar so the GSD tab is shown by default on app launch instead of the File Tree tab.

## Root Cause

`src-tauri/src/state.rs` — `default_right_top_tab()` returned `"gsd"` (lowercase) but the JS `RIGHT_TOP_TABS` array uses `"GSD"` (capitalized). This case mismatch caused the wrong tab to be selected on fresh launch.

## Changes

| File | Change |
|------|--------|
| `src-tauri/src/state.rs` | Changed `"gsd".into()` → `"GSD".into()` in `default_right_top_tab()` |

## Verification

```bash
grep -n "default_right_top_tab" src-tauri/src/state.rs | grep "GSD"
```

## Notes

- Task is atomic (single line change)
- No research or discussion needed for this fix
