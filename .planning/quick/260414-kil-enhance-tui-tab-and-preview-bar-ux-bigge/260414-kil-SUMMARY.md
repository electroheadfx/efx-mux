---
phase: quick
plan: 260414-kil
subsystem: ui
tags: [styling, ux, terminal-tabs, tab-bar, file-viewer]
dependency_graph:
  requires: []
  provides: [enlarged-terminal-tab-bar, bigger-close-button, padded-file-viewer-header, padded-right-panel-tabs]
  affects: [src/components/terminal-tabs.tsx, src/components/main-panel.tsx, src/components/tab-bar.tsx]
tech_stack:
  added: []
  patterns: [Tailwind class changes, inline style padding adjustments]
key_files:
  created: []
  modified:
    - src/components/terminal-tabs.tsx
    - src/components/main-panel.tsx
    - src/components/tab-bar.tsx
decisions:
  - Used e.currentTarget instead of e.target on the new close button's hover handlers to reliably target the button element itself (not text node children)
metrics:
  duration_minutes: 1
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260414-kil: Enhance TUI Tab and Preview Bar UX — Summary

**One-liner:** Increased TerminalTabBar height to 40px with 18x18px close button, file viewer header to py-2.5, and right panel TabBar to 9px 16px button padding for reduced mis-click frustration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Enlarge TerminalTabBar height, tab padding, and close button | 57e353e | src/components/terminal-tabs.tsx |
| 2 | Increase file viewer preview bar padding and right panel TabBar padding | 5e41fe3 | src/components/main-panel.tsx, src/components/tab-bar.tsx |

## Changes Made

### Task 1: TerminalTabBar (terminal-tabs.tsx)

- Container height: `h-[34px]` → `h-[40px]`
- Tab button vertical padding: `py-2` → `py-2.5` (both active and inactive variants)
- Close button: replaced `<span class="ml-1 text-[10px]">` with `<button>` element sized 18x18px at fontSize 13, with `cursor: pointer`, flex centering, and proper hover color handlers using `e.currentTarget`

### Task 2: File viewer header and right panel TabBar

**main-panel.tsx:**
- File viewer header bar: `py-1.5` → `py-2.5`
- Close button: `px-2.5 py-1` → `px-3 py-1.5`

**tab-bar.tsx:**
- Container row: `py-1.5` → `py-2`
- Tab buttons: `padding: '7px 14px'` → `padding: '9px 16px'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used e.currentTarget instead of e.target for close button hover handlers**
- **Found during:** Task 1
- **Issue:** The plan's template used `e.target` on `onMouseEnter`/`onMouseLeave` for the new `<button>` close element. With a `<button>`, `e.target` can be a text node child, causing `style.color` assignment to fail silently. The original `<span>` worked because it had no children with distinct targets.
- **Fix:** Changed to `e.currentTarget` which always refers to the element the handler is attached to.
- **Files modified:** src/components/terminal-tabs.tsx
- **Commit:** 57e353e

## Known Stubs

None.

## Threat Flags

None. Pure styling changes — no new network surface, auth paths, or data flow introduced.

## Verification

- TypeScript compilation: clean (no errors)
- All three files modified as specified
- Success criteria met:
  - TerminalTabBar height: 40px (was 34px)
  - Close button: 18x18px `<button>` element (was `text-[10px]` span)
  - File viewer preview bar: py-2.5 (was py-1.5)
  - Right panel TabBar button padding: 9px 16px (was 7px 14px)

## Self-Check: PASSED

Files exist:
- FOUND: src/components/terminal-tabs.tsx
- FOUND: src/components/main-panel.tsx
- FOUND: src/components/tab-bar.tsx

Commits exist:
- 57e353e: style(quick-260414-kil): enlarge TerminalTabBar height, tab padding, and close button
- 5e41fe3: style(quick-260414-kil): increase file viewer preview bar and right panel TabBar padding
