---
status: complete
---

# Quick Task 260411-c1y: File Tree Line Height & Theme Controls

## Changes

### src/components/file-tree.tsx
- Changed `fileTreeLineHeight` default from `5` to `2` for tighter row spacing

### src/components/preferences-panel.tsx
- Added `fileTreeBgColor` to imports from `./file-tree.tsx`
- Added BG Color control in FILE TREE preferences section:
  - Color picker input bound to `fileTreeBgColor` signal
  - Reset button (shown only when custom color is set) reverts to default `bgDeep`

## Result
File tree entries are now more compact by default. All three file tree appearance settings (font size, line height, BG color) are controllable from the preferences panel with real-time updates.

## Commit
`4c83882` fix(quick-260411-c1y): tighter file tree line height and add BG color control to preferences
