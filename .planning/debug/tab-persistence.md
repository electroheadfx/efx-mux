---
status: investigating
trigger: "Tab persistence not working across app restart"
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## Current Focus

hypothesis: Tab state is persisted to state.json session section but never restored on app startup
test: Check if bootstrap/initFirstTab reads terminal-tabs from state.json and recreates saved tabs
expecting: No restore logic exists - only one tab is ever created on startup
next_action: Trace the full save/restore flow

## Symptoms

expected: Create 2+ tabs, restart app, same tabs reappear with sessions restored
actual: New terminal session tabs are not stored/restored after app quit
errors: None reported
reproduction: Create 2+ tabs, quit app, relaunch
started: Discovered during UAT test 6

## Eliminated

## Evidence

- timestamp: 2026-04-10T12:05:00Z
  checked: persistTabState() in terminal-tabs.tsx line 345-351
  found: Tab state IS saved to state.json via updateSession({ 'terminal-tabs': JSON.stringify({tabs, activeTabId}) })
  implication: Save side works correctly

- timestamp: 2026-04-10T12:06:00Z
  checked: bootstrap() in main.tsx and all imports from terminal-tabs.tsx
  found: bootstrap only calls initFirstTab() once (line 225). No code reads session['terminal-tabs'] from appState. No loop recreates additional tabs.
  implication: Restore side is completely missing

- timestamp: 2026-04-10T12:07:00Z
  checked: grep for 'terminal-tabs' across entire src/ directory
  found: Only one write occurrence (terminal-tabs.tsx:350), zero read occurrences
  implication: The persisted data is written but never consumed on startup

## Resolution

root_cause: Tab state is persisted to state.json on every tab change (persistTabState writes session['terminal-tabs']), but no restore logic exists. On app startup, bootstrap() in main.tsx only ever creates a single tab via initFirstTab(). The saved tab metadata (session names, labels, active tab ID) in state.json is never read back or used to recreate additional tabs.
fix:
verification:
files_changed: []
