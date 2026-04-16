---
phase: quick
plan: 260416-jvl
subsystem: editor
tags: [minimap, ux, codemirror, tab-bar]
dependency_graph:
  requires: []
  provides: [minimap-toggle, minimap-selection-fix]
  affects: [editor-tab, unified-tab-bar]
tech_stack:
  added: []
  patterns: [codemirror-compartment-reconfiguration, preact-signal-toggle]
key_files:
  created: []
  modified:
    - src/editor/theme.ts
    - src/editor/setup.ts
    - src/components/unified-tab-bar.tsx
decisions:
  - Compartment-based minimap toggle so all existing views update simultaneously
  - pointerEvents none only on inner layer to preserve scroll-to-position interaction
metrics:
  duration: 1m 34s
  completed: 2026-04-16
---

# Quick Task 260416-jvl: Minimap UX -- Disable Text Selection, Add Hide/Show Toggle

Compartment-based minimap toggle with CSS selection prevention across all editor views, controlled via tab bar icon button.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Disable text selection in minimap and add Compartment-based toggle | cae403c | theme.ts: userSelect/pointerEvents CSS; setup.ts: Compartment, signal, toggleMinimap |
| 2 | Add minimap toggle button to unified tab bar | 34d54b1 | unified-tab-bar.tsx: PanelRightClose/PanelRight toggle button |

## Changes Made

### theme.ts
- Added `userSelect: 'none'` and `WebkitUserSelect: 'none'` to `.cm-minimap` rule
- Added `userSelect: 'none'`, `WebkitUserSelect: 'none'`, and `pointerEvents: 'none'` to `.cm-minimap .cm-minimap-inner` rule
- `pointerEvents: 'none'` only on inner layer preserves scroll-to-position on the outer minimap overlay

### setup.ts
- Imported `Compartment` from `@codemirror/state` and `signal` from `@preact/signals`
- Created module-level `minimapCompartment` for runtime reconfiguration
- Exported `minimapVisible` signal (default: true)
- Extracted minimap config into `minimapExtension()` helper function
- Exported `toggleMinimap()` that flips signal and dispatches reconfigure to all registered EditorViews
- Replaced inline `showMinimap.compute(...)` in `createEditorState` with `minimapCompartment.of(...)` -- new editor tabs respect current visibility state

### unified-tab-bar.tsx
- Added `PanelRightClose` and `PanelRight` to lucide-preact imports
- Added `minimapVisible` and `toggleMinimap` imports from editor/setup
- Inserted minimap toggle button before the "+" dropdown, conditionally rendered when editor tabs exist
- Icon switches between PanelRightClose (visible) and PanelRight (hidden)
- Hover styling matches existing "+" button pattern (textDim -> textPrimary + bgElevated)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compiles with zero errors (both tasks verified with `pnpm exec tsc --noEmit`)
- All must-have truths satisfied:
  - Text in minimap is not selectable by mouse (CSS userSelect + pointerEvents)
  - Toggle icon in tab bar hides/shows minimap on all open editors (Compartment reconfigure)
  - Minimap visibility persists across new editor tabs (signal checked in createEditorState)

## Self-Check: PASSED
