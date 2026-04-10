---
status: diagnosed
trigger: "Ctrl+, shortcut not wired to preferences"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: Feature not implemented -- no comma key handler in keyboard listener and no preferences/settings panel component exists
test: Search codebase for comma key handling and preferences component
expecting: No results confirming feature was never built
next_action: Return diagnosis

## Symptoms

expected: Ctrl+, (or Cmd+, on macOS) opens a preferences/settings panel showing project settings
actual: Ctrl+, shortcut does not work
errors: None
reproduction: Press Ctrl+, in the app
started: Discovered during UAT -- feature was never implemented

## Eliminated

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: src/main.tsx keyboard handler (lines 105-158)
  found: No case for comma key in the switch block. Handler covers b, s, t, w, Tab, p, /, ? but NOT comma.
  implication: Shortcut was never wired

- timestamp: 2026-04-10T00:00:00Z
  checked: src/components/shortcut-cheatsheet.tsx SHORTCUTS data
  found: Ctrl+, is not listed in the cheatsheet either -- confirming it was never part of the implemented feature set
  implication: Feature was not planned in the shortcuts implementation

- timestamp: 2026-04-10T00:00:00Z
  checked: Codebase search for preferences/settings component
  found: No preferences panel component exists
  implication: Both the shortcut and the target UI are missing

## Resolution

root_cause: Feature not implemented. The keyboard handler in src/main.tsx has no case for the comma key, no preferences/settings panel component exists in the codebase, and Ctrl+, is not listed in the shortcut cheatsheet.
fix:
verification:
files_changed: []
