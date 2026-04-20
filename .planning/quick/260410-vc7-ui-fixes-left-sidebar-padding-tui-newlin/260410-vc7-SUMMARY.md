---
status: complete
quick_id: 260410-vc7
slug: ui-fixes-left-sidebar-padding-tui-newlin
description: UI fixes: left sidebar padding, TUI newlines, pane backgrounds, git pane font size
date: 2026-04-10
commit: $(git rev-parse HEAD --short=7)
---

# Quick Task Summary: 260410-vc7

## Changes Made

### 1. Left sidebar project tabs padding
- **File:** `src/components/sidebar.tsx`
- Changed `ProjectRow` padding from `10px 16px` with `marginLeft: spacing['4xl']` and `marginRight: spacing['4xl']` to just `padding: '10px 2px 10px 2px'`
- Result: 2px left/right padding as requested

### 2. TUI extra newlines in error handlers
- **File:** `src/components/terminal-tabs.tsx`
- Removed `\r\n` prefix from 5 `writeln` calls in PTY error handlers:
  - `createNewTab` error handler
  - `initFirstTab` warning messages (2 lines)
  - `restartTabSession` error handler
  - `restoreTabs` error handler
- Result: Error messages no longer add extra blank lines at session start

### 3. Server pane background color
- **File:** `src/styles/app.css`
- Added `background: var(--color-bg)` to `.server-pane-logs`
- Default color: #111927 (matches theme bgBase)
- User can change via CSS variable or theme

### 4. Git changes pane font sizes
- **File:** `src/components/diff-viewer.tsx`
- Header filename: 12px → 14px
- Header +/- counts: 11px → 12px
- Diff content: 12px → 13px
- All left padding: 16px → 2px
- Result: More readable diff content with minimal padding

## Files Modified
- `src/components/sidebar.tsx`
- `src/components/terminal-tabs.tsx`
- `src/components/diff-viewer.tsx`
- `src/styles/app.css`
