---
phase: quick-260415-i4n
plan: 01
subsystem: ui/sidebar
tags: [branding, title-bar, sidebar]
dependency_graph:
  requires: []
  provides: [os-title-bar-branding]
  affects: [sidebar-header]
tech_stack:
  added: []
  patterns: [tauri-window-setTitle]
key_files:
  created: []
  modified:
    - src/components/sidebar.tsx
decisions:
  - Moved branding to OS title bar via getCurrentWindow().setTitle() -- keeps version visible regardless of sidebar state
metrics:
  duration_seconds: 58
  completed: "2026-04-15T11:06:30Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 260415-i4n: Move Sidebar Header Title to OS Title Bar

Dynamic OS title bar shows "EFXMUX v{version}" via getCurrentWindow().setTitle(); sidebar header stripped to "+" button only.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Set OS title bar dynamically and remove sidebar title text | 81106e6 | src/components/sidebar.tsx |

## Changes Made

1. **Added import** -- `getCurrentWindow` from `@tauri-apps/api/window` (line 10)
2. **Set OS title in init()** -- After fetching app version, calls `getCurrentWindow().setTitle(`EFXMUX v${ver}`)` (line 557)
3. **Removed sidebar title text** -- Removed the `<span>EFXMUX v{version}</span>` from the sidebar header; changed `justifyContent` from `space-between` to `flex-end`; only the blue "+" add-project button remains

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Verification

- TypeScript compilation: PASSED (`npx tsc --noEmit`)
- Auto-approved checkpoint (auto-advance mode active)

## Self-Check: PASSED
