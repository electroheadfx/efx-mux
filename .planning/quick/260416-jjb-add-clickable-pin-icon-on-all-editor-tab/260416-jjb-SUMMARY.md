---
status: complete
quick_id: 260416-jjb
date: 2026-04-16
---

# Quick Task 260416-jjb: Clickable pin icon on all editor tabs

## What Changed

### Task 1: Pin icon always visible with toggle (unified-tab-bar.tsx)
- All editor tabs now show a clickable Pin icon
- Pinned tabs: blue pin icon (#258AD1)
- Unpinned/preview tabs: gray pin icon (#556A85)
- Clicking pin icon toggles pin state (stopPropagation prevents tab switch)
- Right-click context menu toggle removed (replaced by icon click)
- Dirty dot rendered as separate element between label and close button
- Pin icon clicks excluded from drag initiation
- 0.15s color transition on pin icon

## Commits
- `4b8979a` feat(quick-260416-jjb): add clickable pin icon to all editor tabs

## Files Modified
- src/components/unified-tab-bar.tsx
