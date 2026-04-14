---
phase: 15
plan: 01
subsystem: ui-components
tags: [menu, dropdown, context-menu, accessibility, keyboard-navigation]

dependency_graph:
  requires: []
  provides:
    - ContextMenu component for right-click menus
    - Dropdown component for click-triggered menus with keyboard nav
  affects:
    - file-tree.tsx (Phase 18 - will use ContextMenu)
    - tab-bar.tsx (Phase 17 - will use Dropdown)
    - sidebar.tsx (Phase 16 - will use Dropdown for git actions)

tech_stack:
  added: []
  patterns:
    - Preact functional components with hooks
    - useRef for DOM element references
    - useState for component-local state
    - useCallback for memoized event handlers
    - useEffect for event listeners and focus management
    - ARIA attributes for accessibility (role=menu, role=menuitem, aria-haspopup, aria-expanded)

key_files:
  created:
    - src/components/context-menu.tsx
    - src/components/context-menu.test.tsx
    - src/components/dropdown-menu.tsx
    - src/components/dropdown-menu.test.tsx
  modified: []

decisions:
  - "Used useState instead of signals for component-local state (isOpen, selectedIndex) - signals not needed for non-shared state"
  - "Added data-selected attribute for test assertions instead of checking styles"
  - "Implemented type-ahead with setTimeout/clearTimeout pattern per W3C APG"

metrics:
  duration: "2 minutes"
  tasks_completed: 2
  tests_added: 21
  completed: "2026-04-14T21:25:00Z"
---

# Phase 15 Plan 01: Menu Components Summary

ContextMenu and Dropdown UI primitives with full ARIA accessibility and keyboard navigation.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ContextMenu component with tests | 2ac8f3e | context-menu.tsx, context-menu.test.tsx |
| 2 | Create Dropdown component with keyboard navigation | 9b9499e | dropdown-menu.tsx, dropdown-menu.test.tsx |

## Implementation Details

### ContextMenu Component

**Location:** `src/components/context-menu.tsx`

Features implemented per CONTEXT.md decisions:
- **D-01:** Flat array item structure with `{label, action, icon?, disabled?, separator?}`
- **D-02:** Auto-flip positioning - menu flips when it would overflow viewport edges
- **D-03:** Close triggers - Escape key, click outside, item selection

ARIA accessibility:
- `role="menu"` on container
- `role="menuitem"` on each item
- `role="separator"` on dividers
- `aria-disabled` on disabled items

### Dropdown Component

**Location:** `src/components/dropdown-menu.tsx`

Features implemented per CONTEXT.md decisions:
- **D-04:** Uncontrolled state - component manages isOpen internally via useState
- **D-05:** Full keyboard navigation:
  - ArrowDown/ArrowUp - move selection
  - Home/End - jump to first/last item
  - Enter/Space - activate selected item
  - Escape - close menu and restore focus
  - Type-ahead search with 500ms buffer timeout
- **D-06:** Render prop trigger pattern - caller provides trigger element

Focus management:
- Menu container receives focus when opened (tabIndex={-1})
- Focus returns to trigger element on close

## Test Coverage

**21 tests total:**

`context-menu.test.tsx` (8 tests):
- Renders menu items with correct labels
- Calls onClose when Escape key pressed
- Calls onClose when clicking outside menu
- Calls item action and onClose when item clicked
- Does not call action when disabled item clicked
- Renders separator between items
- Has role="menu" on container
- Has role="menuitem" on each item

`dropdown-menu.test.tsx` (13 tests):
- Dropdown is closed by default
- Clicking trigger opens dropdown
- Pressing Escape closes dropdown
- ArrowDown moves selection to next item
- ArrowUp moves selection to previous item
- Enter activates selected item
- Space activates selected item
- Home moves to first item
- End moves to last item
- Type-ahead filters to matching item
- Type-ahead buffer clears after 500ms
- Has aria-haspopup on trigger
- Has aria-expanded that reflects open state

## Verification Results

```
pnpm test -- context-menu: 8 passed
pnpm test -- dropdown-menu: 13 passed
Total: 21 tests passing
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] src/components/context-menu.tsx exists
- [x] src/components/context-menu.test.tsx exists
- [x] src/components/dropdown-menu.tsx exists
- [x] src/components/dropdown-menu.test.tsx exists
- [x] Commit 2ac8f3e exists
- [x] Commit 9b9499e exists
- [x] All 21 tests pass
