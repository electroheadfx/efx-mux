---
status: resolved
trigger: "GSD reorder bug: drag works but position doesn't change"
created: 2026-04-20
updated: 2026-04-20
---

# Debug: GSD Tab Reorder Position Not Updating

## Symptoms

- **Expected behavior:** Dragging GSD tab to new position should persist that position
- **Actual behavior:** Drag works visually but position doesn't change after drop
- **Error messages:** None observed
- **Timeline:** Phase 22 UAT - discovered during tab reorder testing
- **Reproduction:** Drag GSD tab to different position in tab bar, observe it snaps back

## Suspected Root Causes

User hypothesis:
1. `setScopedTabOrder` not triggering re-render for GSD's position
2. `computeDynamicTabsForScope` re-sorting GSD to its original position on next render

## Focus Files

- `src/components/unified-tab-bar.tsx` - drag/drop handlers and tab ordering logic

## Current Focus

- hypothesis: confirmed - GSD ID stripped from order array in setScopedTabOrder
- test: trace setScopedTabOrder to see if 'gsd' is persisted
- expecting: 'gsd' ID should be in the order array
- next_action: complete
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-20T12:00:00Z
  observation: Line 197 in unified-tab-bar.tsx explicitly filters out 'gsd' ID
  file: src/components/unified-tab-bar.tsx:197
  code: `const clean = order.filter(id => id !== 'gsd');`
  
- timestamp: 2026-04-20T12:01:00Z
  observation: computeDynamicTabsForScope (line 1381-1383) appends tabs not in order to end
  file: src/components/unified-tab-bar.tsx:1381-1383
  code: |
    all.forEach(t => {
      if (!ordered.find(ot => ot.id === t.id)) ordered.push(t);
    });

- timestamp: 2026-04-20T12:02:00Z
  observation: git-changes singleton IS allowed in order (no filter), only GSD is stripped
  reasoning: Inconsistent handling - git-changes can be reordered but GSD cannot

## Eliminated

(none - first hypothesis was correct)

## Resolution

- root_cause: setScopedTabOrder (line 197) explicitly filters out 'gsd' ID from the order array before persisting. This causes computeDynamicTabsForScope to append GSD to the end of the tab list on every render, since it's never found in the persisted order.
- fix: Removed the filter that strips 'gsd' from the order array. Also updated misleading comment at line 100.
- verification: Drag GSD tab to new position, verify position persists after drop
- files_changed: [src/components/unified-tab-bar.tsx]
