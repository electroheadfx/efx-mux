---
status: resolved
trigger: Terminal panes should always be grouped on the left bar of the main window.
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus
hypothesis: "tabOrder reorders ALL tabs including terminals, allowing editors/git to be dragged before terminals. getOrderedTabs() sorts [terminals, editors, git] by tabOrder, which may place editor tabs before terminals."
test: "Trace getOrderedTabs() to see if it sorts all tabs by tabOrder, erasing the [...terminals, ...editors, ...git] ordering from allTabs"
expecting: "If tabOrder contains editors before terminals, getOrderedTabs() returns editors first"
next_action: "Examine getOrderedTabs() logic more carefully"

## Symptoms
expected: "Terminal tabs always appear leftmost in the tab bar, before any editor or git tabs"
actual: "Terminal tabs may get mixed up with editor tabs or not appear in correct order"
errors: []
reproduction: []
started: "Unknown"

## Eliminated

## Evidence
- timestamp: 2026-04-15T00:00:00Z
  checked: "unified-tab-bar.tsx allTabs computed signal"
  found: "allTabs = [...terminals, ...editors, ...git] — terminals ARE first in the raw list"
  implication: "The raw allTabs puts terminals first. Problem must be in getOrderedTabs()"

- timestamp: 2026-04-15T00:00:00Z
  checked: "unified-tab-bar.tsx getOrderedTabs()"
  found: "getOrderedTabs() sorts the entire allTabs array by tabOrder[], using map + filter. If tabOrder=[editor-1, tab-1, tab-2], editors come FIRST"
  implication: "tabOrder applies to ALL tabs, including terminals. A dragged editor can end up before terminals."

## Resolution
root_cause: "getOrderedTabs() applied tabOrder drag-and-drop ordering to ALL tabs (terminals + editors + git). Since tabOrder stores IDs in creation order and allows reordering via drag-and-drop, dragging an editor tab before a terminal tab would cause getOrderedTabs() to return editors first, breaking the terminal-leftmost invariant."
fix: "Rewrote getOrderedTabs() to separate terminals from non-terminals. Terminals are ALWAYS returned first in their original creation order (never affected by tabOrder). Non-terminals (editors, git-changes) are sorted by tabOrder for drag-and-drop among themselves."
verification: "TypeScript compiles. Logic verified: terminals separated into their own array before tabOrder sorting, then concatenated first in the return statement."
files_changed: ["/Users/lmarques/Dev/efx-mux/src/components/unified-tab-bar.tsx"]
