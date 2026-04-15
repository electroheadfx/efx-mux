---
status: fixing
trigger: "Fix: The [+] dropdown menu in the main window tab bar is truncated/moved outside the app window and has z-index issues."
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus
hypothesis: "The dropdown uses `position: absolute` with `top: 100%` inside a tab bar that has `overflow-x: auto`. The tab bar's overflow creates a containing block for absolutely positioned elements, causing the dropdown to scroll with the tab bar content and/or be clipped by `overflow: hidden` on `.main-panel`."
test: "Read the dropdown-menu.tsx and unified-tab-bar.tsx code to trace the positioning context"
expecting: "Confirm that the dropdown's positioning is affected by the scrollable tab bar container"
next_action: "Apply fix: change dropdown to use `position: fixed` with viewport-relative coordinates calculated from trigger button's `getBoundingClientRect()`"

## Symptoms
expected: "Dropdown menu appears below the [+] button, fully visible within the app window"
actual: "Dropdown is truncated, moved outside app window, or has z-index issues (appears behind panels)"
errors: []
reproduction: "Click the [+] button in the unified tab bar"
started: Unknown

## Eliminated

## Evidence
- timestamp: 2026-04-15T00:00:00Z
  checked: "dropdown-menu.tsx lines 143-211"
  found: "Dropdown uses `position: 'absolute'` with `top: '100%'`, `left: 0`, `zIndex: 1000`"
  implication: "Positioned relative to its immediate `position: relative` parent wrapper"

- timestamp: 2026-04-15T00:00:00Z
  checked: "unified-tab-bar.tsx lines 368-418"
  found: "UnifiedTabBar root div has `overflowX: 'auto'` and no explicit z-index"
  implication: "overflow-x: auto creates a containing block for absolutely positioned children - dropdown scrolls with tab bar"

- timestamp: 2026-04-15T00:00:00Z
  checked: "src/styles/app.css lines 119-126"
  found: ".main-panel has `overflow: hidden`"
  implication: "Clips content that overflows the main panel bounds"

- timestamp: 2026-04-15T00:00:00Z
  checked: "project-modal.tsx lines 188-197"
  found: "Modal uses `position: fixed` with `inset: 0` and `zIndex: 100`"
  implication: "Fixed positioning works correctly because it anchors to viewport, not a scrollable parent"

## Resolution
root_cause: "The dropdown uses `position: absolute` inside a scrollable tab bar (`overflow-x: auto`). This makes the dropdown's positioning context scroll with the tab bar content, and the `overflow: hidden` on `.main-panel` clips the dropdown when it would appear below the tab bar."
fix: "Change dropdown to use `position: fixed` with viewport-relative coordinates calculated from the trigger button's `getBoundingClientRect()`"
verification: ""
files_changed: []
