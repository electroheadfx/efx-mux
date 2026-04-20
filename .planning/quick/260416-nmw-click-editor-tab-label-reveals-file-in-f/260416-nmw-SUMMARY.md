---
status: complete
phase: quick
plan: 260416-nmw
subsystem: editor-tabs, file-tree, sidebar
tags: [ux, file-navigation, reveal-in-tree]
dependency_graph:
  requires: []
  provides: [reveal-file-in-tree, left-sidebar-tab-export]
  affects: [unified-tab-bar, file-tree, sidebar]
tech_stack:
  added: []
  patterns: [timer-based-click-distinction, custom-event-dispatch, scroll-into-view]
key_files:
  created: []
  modified:
    - src/components/sidebar.tsx
    - src/components/file-tree.tsx
    - src/components/unified-tab-bar.tsx
decisions:
  - Used 250ms timer pattern for single-click vs double-click distinction (matches existing file-tree.tsx pattern)
  - Used CustomEvent dispatch for scroll-to-selected communication (decoupled from component hierarchy)
  - Circular import between sidebar.tsx and unified-tab-bar.tsx is safe because only signal values are imported
metrics:
  duration: 172s
  completed: "2026-04-16T15:08:04Z"
  tasks: 2
  files: 3
---

# Quick Task 260416-nmw: Click Editor Tab Label Reveals File in File Tree

Single-click on editor tab label reveals file in tree with smart sidebar routing using timer-based click distinction and CustomEvent dispatch.

## What Changed

### Task 1: Export left sidebar tab signal and add revealFileInTree
- **sidebar.tsx**: Exported `leftSidebarActiveTab` signal (renamed from `activeTab`) and `SidebarTab` type. Updated all 8 internal references.
- **file-tree.tsx**: Added `revealFileInTree(filePath)` async function that:
  - In tree mode: walks tree from root, expanding folders along the path, then selects the target file
  - In flat mode: navigates to the parent directory, then selects the file
  - Dispatches `file-tree-scroll-to-selected` event to scroll the selection into view
- **file-tree.tsx**: Added `data-file-tree-index` attribute to both flat and tree mode row elements for scroll targeting
- **file-tree.tsx**: Added `file-tree-scroll-to-selected` event listener in the FileTree component useEffect with proper cleanup

### Task 2: Wire tab label click to reveal file with smart sidebar routing
- **unified-tab-bar.tsx**: Added module-level `tabLabelClickTimer` and `pendingTabLabelClick` variables for click distinction
- **unified-tab-bar.tsx**: Replaced the label span's `onDblClick` handler with a combined `onClick` handler that:
  - Always switches to the clicked tab first (calls parent onClick)
  - Detects double-click via pending timer: clears timer and triggers rename
  - On single-click (250ms timeout): determines routing and calls `revealFileInTree`
- **Smart routing logic**: If Files tab not active in left sidebar or right panel, switches left sidebar to Files tab before revealing
- Non-editor tabs (terminal, git-changes) are unaffected

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 44cf193 | Export leftSidebarActiveTab and add revealFileInTree |
| 2 | b4e6bc1 | Wire tab label click to reveal file in tree |

## Self-Check: PASSED
