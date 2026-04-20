---
status: resolved
trigger: Split resize jumps to default position at drag start instead of staying at current position
created: 2026-04-20
updated: 2026-04-20
---

# Debug: Split Resize Position Reset

## Symptoms

- **Expected**: Divider stays at current position when drag starts, smooth incremental resize
- **Actual**: At start of drag/resize, split position resets to default/init value instead of staying at initial position
- **After initial jump**: Resize works correctly -- only the START of drag is broken
- **Timeline**: Always been broken (never worked correctly)
- **Reproduction**: Start resizing any split tab

## Current Focus

- hypothesis: RESOLVED
- test: vitest drag-manager.test.ts 6/6 passed
- expecting: N/A
- next_action: none
- reasoning_checkpoint: Fix verified via tests

## Evidence

- timestamp: 2026-04-20T15:00Z
  observation: |
    Found reference frame mismatch in attachIntraZoneHandles (drag-manager.ts lines 205-211).
    
    The code calculates:
    ```
    const totalPx = pane0.offsetHeight + pane1.offsetHeight;
    const newPane0Px = (clamped / 100) * totalPx;
    ```
    
    But `clamped` is a percentage of PANEL height (computed from mouse position / rect.height).
    `totalPx` is only the sum of TWO adjacent panes, not the full panel.
    
    With 3 panes (panel=600px, panes ~200px each, handles ~8px):
    - Mouse at 250px -> clamped = 41.67% (of 600px panel)
    - totalPx = 200 + 200 = 400px (only 2 panes)
    - newPane0Px = (41.67/100) * 400 = 166.68px (WRONG!)
    - Expected = (41.67/100) * 600 = 250px
    
    The pane jumps from 200px to 166.68px on first drag event instead of going to 250px.
  file: src/drag-manager.ts
  lines: 200-211

## Eliminated

- CSS var initialization issues - vars are set correctly by spawnSubScopeForZone
- CSS specificity override - no conflicting rules for .sub-scope-pane height
- Race condition in handle registration - handles are registered after render
- Duplicate event listeners - idempotency guard prevents duplicates

## Resolution

- root_cause: |
    In attachIntraZoneHandles (drag-manager.ts lines 200-211), the inline style calculation used
    totalPx (sum of 2 adjacent panes' offsetHeight) but clamped is a percentage of panel height.
    This reference frame mismatch caused position jumps especially with 3+ panes where
    totalPx << panel.height.

- fix: |
    Changed the inline style calculation to use rect.height (panel height) as the reference frame
    since clamped is a percentage of panel height. Also improved handling of the last pane:
    non-last panes get explicit height + flex:none, while the last pane keeps flex:1 to absorb
    remaining space.
    
    Key changes in drag-manager.ts onDrag handler:
    1. Use `rect.height` instead of `totalPx` for computing newPane0Px
    2. Detect if pane1 is the last pane; if so, set flex:1 instead of flex:none
    3. For middle panes, compute height from their CSS var percentage
    
    Updated drag-manager.test.ts to reflect correct expected behavior:
    - pane0 (non-last): flex: none (fixed height)
    - pane1 (last pane in 2-pane setup): flex: 1 (absorbs remainder)

- verification: vitest drag-manager.test.ts - 6/6 tests passed
- files_changed:
  - src/drag-manager.ts
  - src/drag-manager.test.ts
