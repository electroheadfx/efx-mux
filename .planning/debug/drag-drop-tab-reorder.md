---
status: resolved
trigger: "Drag-and-drop tab reorder not working — 4th attempt"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T17:30:00Z
---

## Current Focus
hypothesis: "Three combined HTML5 drag-drop API issues in unified-tab-bar.tsx: (1) drag image clone removed mid-drag, (2) container missing dragover handler, (3) missing stopPropagation"
test: "Verify drag cursor shows move icon (not green plus/copy), tabs reorder after drop"
expecting: "Move cursor during drag, tabs reorder correctly on drop"
next_action: "RESOLVED -- fix applied, TypeScript compiles clean"

## Symptoms
expected: "Drag-and-drop tab reorder moves tab to new position"
actual: "Can drag, green plus icon appears (not a reorder icon), tabs not re-ordered after drop"
errors: []
reproduction: "Drag a tab and drop it"
started: "unknown"
context: "4th attempt to fix. Previous hypothesis (activeProjectName null race condition) was likely wrong — the green plus/copy cursor is a browser-level drag-drop API issue, not a Preact signal issue."

## Eliminated
- hypothesis: "activeProjectName null race condition causes setProjectTabOrder to no-op"
  reason: "Even if this were true, the green plus/copy cursor icon indicates the browser drag-drop API itself is misconfigured — the visual feedback problem is upstream of any signal logic"

## Evidence

- timestamp: 2026-04-15T00:00
  checked: "unified-tab-bar.tsx handleDrop logic"
  found: "handleDrop computes allIds via getOrderedTabs(), splices source out, inserts at targetIdx, calls setProjectTabOrder(allIds). Logic structurally sound."
  implication: "Drop handler logic is correct but may never execute if dragover doesn't preventDefault"

- timestamp: 2026-04-15T17:15
  checked: "handleDragStart drag image clone lifecycle"
  found: "Clone element removed from DOM after 100ms via setTimeout(() => clone.remove(), 100) on line 415. The HTML5 drag-drop spec requires the drag image element to remain in the DOM for the entire drag duration. On macOS/WKWebView, removing it mid-drag causes the browser to fall back to the native OS drag badge -- the green plus/copy icon."
  implication: "ROOT CAUSE 1: Early clone removal causes the green plus/copy icon on macOS"

- timestamp: 2026-04-15T17:18
  checked: "Tab bar container div (role=tablist) drag event handlers"
  found: "Container div has NO onDragOver or onDrop handlers. CSS gap-1 creates gaps between tabs, and px-2 py-2 adds padding. When cursor moves into these areas during drag, dragover fires on the container (not a tab element). Without e.preventDefault() on the container's dragover, the browser treats the container as a non-drop-zone, showing copy/not-allowed cursor feedback."
  implication: "ROOT CAUSE 2: Missing container-level dragover handler causes drop rejection between tabs"

- timestamp: 2026-04-15T17:20
  checked: "Event propagation and Tauri title bar interaction"
  found: "Title bar div has onMouseDown -> getCurrentWindow().startDragging(). While the tab bar is in a sibling subtree (not a child of the title bar), adding stopPropagation() to drag handlers ensures no edge-case bubbling interference with Tauri native drag."
  implication: "CONTRIBUTING FACTOR: Missing stopPropagation could allow edge-case interference"

- timestamp: 2026-04-15T17:22
  checked: "Tauri config and native drag-drop interception"
  found: "tauri.conf.json has no dragDropEnabled or file_drop config. capabilities/default.json has core:window:allow-start-dragging (for native window dragging, not HTML5 drag-drop). CSS -webkit-app-region: drag is ONLY on .titlebar-drag-region, not on the tab bar."
  implication: "Tauri native drag not interfering -- issue is purely in HTML5 drag-drop handler code"

## Resolution
root_cause: "Three combined issues: (1) setDragImage clone removed from DOM after 100ms via setTimeout -- must persist for entire drag duration or macOS/WKWebView falls back to native copy badge (green plus icon); (2) tab bar container div missing onDragOver/onDrop handlers -- cursor entering gap/padding areas between tabs fires dragover on container which lacks preventDefault(), making browser reject drop; (3) missing stopPropagation on drag handlers"
fix: "Keep drag image clone alive until handleDragEnd; add handleContainerDragOver (preventDefault + dropEffect=move) and handleContainerDrop (nearest-tab proximity detection) on container div; add stopPropagation to handleDragStart, handleDragOver, handleDrop"
verification: "TypeScript compiles clean (npx tsc --noEmit). Manual test: drag tab should show move cursor, drop should reorder."
files_changed: ["src/components/unified-tab-bar.tsx"]
