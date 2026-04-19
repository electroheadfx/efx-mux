---
slug: 22-sidebar-resize-dead
status: resolved
trigger: "Left sidebar resize broken - drag handle does nothing"
created: 2026-04-19
updated: 2026-04-19
phase: 22
---

# Debug Session: Sidebar Resize Handle Dead

## Symptoms

- Expected: Dragging left sidebar resize handle should resize sidebar width
- Actual: Drag handle does nothing (no visual feedback, no resize)
- Error messages: None reported
- Timeline: Worked earlier in Phase 22, broke mid-phase
- Reproduction: Hover/drag the left sidebar resize handle

## Context

Phase 22 (dynamic-tabs-vertical-split-and-preferences-modal) introduced vertical splits and dynamic tabs. Recent reverts:
- b015381 restored layout files to 768be19 state
- 735e3a3 reverted app.css + terminal-manager + theme-manager to 75a4dd1
- 15b1181 reverted xterm-internal height stretches

Likely affected areas:
- Left sidebar component/container
- Resize handle mount/pointer events
- CSS grid or flex layout that owns sidebar width
- Possible event handler regression from split-introduction work

## Current Focus

hypothesis: RESOLVED
test: fixed
expecting: drag now un-collapses sidebar and resizes correctly
next_action: none

## Evidence

- timestamp: 2026-04-19T14:00Z
  file: src/drag-manager.ts
  finding: initDragManager() had no idempotency guard on the sidebar handle (unlike mainHHandle which has dataset.dragInit). Multiple calls to initDragManager() register duplicate mousedown listeners.

- timestamp: 2026-04-19T14:01Z
  file: src/main.tsx lines 207-212
  finding: Preact effect subscribes to sidebarCollapsed signal and always sets --sidebar-w to '40px' or '200px'. Effect fires synchronously on any sidebarCollapsed change. Drag manager's onDrag updates --sidebar-w but effect can override it if signal also changes.

- timestamp: 2026-04-19T14:02Z
  file: src/styles/app.css
  finding: ROOT CAUSE. CSS rule `.sidebar.collapsed { width: 40px; min-width: 40px }` has higher specificity than base `.sidebar { width: var(--sidebar-w) }`. When sidebarCollapsed=true, the .collapsed class is applied and drag manager's setProperty('--sidebar-w', ...) has zero visual effect — the locked CSS rule wins.

- timestamp: 2026-04-19T14:03Z
  file: src/components/right-panel.tsx line 20
  finding: SECONDARY BUG. Inline style `flex: 1` (added Phase 22-04 commit 2c406dc) overrides CSS class `flex-shrink: 0; width: var(--right-w)`. The flex shorthand sets flex-basis: 0%, which takes precedence over explicit width, so --right-w CSS var changes from the main-right drag handle are visually invisible.

## Eliminated

- overflow: hidden on flex container — not applicable; siblings are not clipped
- z-index issues — handle at z-index 10 is above panels (auto)
- RAF timing for initDragManager — Preact renders synchronously, RAF fires after paint, handle elements exist
- dispatchLayoutChanged — only triggers terminal refit, unrelated to sidebar width
- Pointer events blocked — .app-dragging only disables panels during drag, not the handle itself

## Resolution

root_cause: When sidebarCollapsed=true, the CSS class `.sidebar.collapsed { width: 40px }` overrides `width: var(--sidebar-w)` via CSS specificity. The drag manager wrote to --sidebar-w but the locked rule prevented any visual change. Additionally, the sidebar handle had no idempotency guard, accumulating duplicate listeners on repeated initDragManager calls.

fix: |
  1. drag-manager.ts: Import sidebarCollapsed from state-manager. Add idempotency guard (dataset.dragInit) to sidebar handle matching the existing pattern for mainHHandle. In onDrag, clear sidebarCollapsed.value = false before setting --sidebar-w so the .collapsed class is removed and the CSS var takes effect. In onEnd, persist sidebar-collapsed: false alongside the new width.
  2. right-panel.tsx: Remove inline `flex: 1` from RightPanel's aside element. The CSS class already provides flex-shrink: 0 and width: var(--right-w); the inline override was making the main-right resize handle non-functional.

files_changed:
  - src/drag-manager.ts
  - src/components/right-panel.tsx

verified: tsc --noEmit clean, vitest drag-manager.test.ts 4/4 passed
