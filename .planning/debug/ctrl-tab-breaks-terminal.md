---
status: diagnosed
trigger: "Tab switching with Ctrl+Tab breaks terminal input"
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## Current Focus

hypothesis: switchToTab() calls fitAddon.fit() synchronously after display:none->block, before browser reflow, causing 0-dimension terminal
test: confirmed by code reading -- fit() is called in same synchronous block as display change
expecting: deferring fit()+focus() to requestAnimationFrame fixes the issue
next_action: return diagnosis

## Symptoms

expected: Tab switching with Ctrl+Tab preserves terminal input functionality
actual: When switching tabs with Ctrl+Tab, the terminal input becomes invisible and unresponsive. Cannot type CLI commands in the switched-to tab.
errors: None reported
reproduction: Test 5 in UAT -- open multiple tabs, press Ctrl+Tab
started: Discovered during UAT

## Eliminated

(none needed -- root cause found on first hypothesis)

## Evidence

- timestamp: 2026-04-10T12:00:00Z
  checked: switchToTab() in terminal-tabs.tsx lines 320-332
  found: focus() and fit() called synchronously immediately after setting container.style.display = 'block'
  implication: Browser hasn't reflowed yet, so fitAddon.fit() reads 0 dimensions from the just-unhidden container

- timestamp: 2026-04-10T12:00:00Z
  checked: resize-handler.ts line 26
  found: ResizeObserver callback already uses requestAnimationFrame before calling fit() -- the project knows this pattern is needed
  implication: switchToTab() lacks the same deferral pattern

- timestamp: 2026-04-10T12:00:00Z
  checked: terminal-manager.ts lines 79-84
  found: Ctrl+Tab is correctly blocked from reaching xterm (return false), so the keydown handler in main.tsx receives it
  implication: The keyboard routing is correct; the problem is in what happens after cycleToNextTab() calls switchToTab()

## Resolution

root_cause: switchToTab() in terminal-tabs.tsx calls terminal.focus() and fitAddon.fit() synchronously in the same JS execution frame as setting container.style.display from 'none' to 'block'. The browser has not performed layout reflow yet, so fitAddon.fit() reads zero or stale dimensions from the container, resizing the terminal to 0 cols / 0 rows. This makes the terminal invisible and unresponsive to input.
fix: Wrap the focus() and fit() calls in requestAnimationFrame (or double-rAF for safety) so the browser completes layout after display:block before measuring dimensions.
verification: 
files_changed: []
