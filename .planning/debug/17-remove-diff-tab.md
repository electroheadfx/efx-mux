---
status: investigating
trigger: "remove Diff tab from right sidebar, wire left sidebar Git tab clicks to open Git Changes in main panel"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus
hypothesis: "GitControlTab's GitFileRow dispatches 'open-diff' event which has no handler (DiffViewer not mounted), so file clicks in sidebar's Git tab do nothing. Should call openGitChangesTab() instead."
test: "Grep for all open-diff event listeners and DiffViewer mount points"
expecting: "No listener found for open-diff; DiffViewer is dead code"
next_action: "Write up findings"

## Symptoms
expected: "Clicking a file row in the sidebar Git tab opens Git Changes tab in the main panel; right sidebar has no Diff tab"
actual: "Clicking files in sidebar Git tab appears to have no effect (open-diff event has no handler)"
errors: []
reproduction: "Click any file row in left sidebar Git tab"
started: "feature gap — behavior never fully wired"

## Evidence
- timestamp: 2026-04-15T00:00
  checked: "right-panel.tsx lines 15-16, 29-32"
  found: "RIGHT_TOP_TABS = ['File Tree', 'GSD'] — Diff is NOT in the array. Guard at line 29-31 handles stale 'Diff' state by falling back to 'File Tree'."
  implication: "Right sidebar Diff tab already removed from UI"

- timestamp: 2026-04-15T00:00
  checked: "sidebar.tsx GitFileRow (line 371) and GitControlTab's GitFileRow (git-control-tab.tsx line 376)"
  found: "sidebar.tsx GitFileRow calls openGitChangesTab() on click (line 390) — correct. git-control-tab.tsx GitFileRow dispatches 'open-diff' event (line 400) — broken."
  implication: "Two different GitFileRow components: one in sidebar's file-list view (works), one in GitControlTab staging UI (broken)"

- timestamp: 2026-04-15T00:00
  checked: "grep for DiffViewer mount points"
  found: "DiffViewer is exported from diff-viewer.tsx but never imported anywhere else in the codebase"
  implication: "DiffViewer is dead code; open-diff event has no handler"

- timestamp: 2026-04-15T00:00
  checked: "grep for 'open-diff' event listeners"
  found: "Only git-control-tab.tsx line 400 dispatches the event. DiffViewer (diff-viewer.tsx line 146) adds a listener but DiffViewer is never mounted."
  implication: "open-diff event is orphaned — dispatched but nothing handles it"

- timestamp: 2026-04-15T00:00
  checked: "main-panel.tsx"
  found: "GitChangesTab component is mounted and shown when currentTab.type === 'git-changes'. Managed by openGitChangesTab() in unified-tab-bar.tsx."
  implication: "Main panel Git Changes infrastructure is in place and working"

## Eliminated

## Resolution
root_cause: ""
fix: ""
verification: ""
files_changed: []
