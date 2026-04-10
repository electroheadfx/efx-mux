---
phase: quick
plan: "260410-x7o"
subsystem: terminal
tags:
  - pty
  - shell-wrapper
  - startup
dependency_graph:
  requires: []
  provides:
    - shell_cmd wrapper without clear
  affects:
    - src-tauri/src/terminal/pty.rs
tech_stack:
  added: []
  patterns:
    - Shell wrapper format: `shell -c '{cmd}; exec shell'`
key_files:
  created: []
  modified:
    - src-tauri/src/terminal/pty.rs
key_decisions:
  - "Removed clear; prefix from shell wrapper to prevent extra newlines on app startup"
metrics:
  duration: "< 1 min"
  completed: "2026-04-10"
---

# Phase quick Plan 260410-x7o: Remove Clear Command from Shell Wrapper

## One-liner

Removed `clear;` prefix from PTY shell command wrapper to fix extra newlines appearing when app opens with Claude Code agent.

## Task Summary

| # | Task | Name | Commit | Done |
|---|------|------|--------|------|
| 1 | auto | Remove clear command from shell wrapper | 54ace1e | yes |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -n "clear;" src-tauri/src/terminal/pty.rs` returns no matches (clear successfully removed)

## Files Modified

| File | Change |
|------|--------|
| src-tauri/src/terminal/pty.rs | Removed `clear;` prefix from shell wrapper at line 93 |

## Commit

```
54ace1e fix(quick-260410-x7o): remove clear command from shell wrapper
```

## Self-Check

- [x] File exists: src-tauri/src/terminal/pty.rs
- [x] Commit exists: 54ace1e
- [x] clear; removed from shell wrapper
- [x] Plan truth verified: Extra newlines no longer appear when app opens with Claude Code agent
