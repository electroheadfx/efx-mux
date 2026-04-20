---
status: investigating
trigger: "3-split persistence: splits lost on restart despite updateLayout writing the scope list"
created: 2026-04-20
updated: 2026-04-20
---

# Debug: 3-Split Persistence Lost on Restart

## Symptoms

- **Expected behavior:** 3-pane split layout should persist across app restart
- **Actual behavior:** Splits lost on restart despite updateLayout writing the scope list
- **Error messages:** None observed
- **Timeline:** Phase 22 UAT
- **Reproduction:** Create 3-pane split, quit app, restart, observe splits gone

## Suspected Root Causes

User hypothesis:
1. state.json not being written correctly on quit
2. state.json written but not read correctly on startup
3. Layout restoration logic ignoring the third split

## Focus Files

- State persistence layer (state.json read/write)
- Layout restoration on startup

## Current Focus

- hypothesis: restoreActiveSubScopes is not receiving correct projectName or state.layout doesn't contain the key at read time
- test: added console.warn debug logging to trace the restore flow
- expecting: logs will show exactly what projectName, mainKey, mainRaw values are at runtime
- next_action: user restarts app and checks console for DEBUG output
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-20T12:10:00Z
  observation: state.json contains correct data
  file: ~/.config/efx-mux/state.json
  data: |
    "main-active-subscopes:efx-mux": "[\"main-0\",\"main-1\",\"main-2\"]"
    "right-active-subscopes:efx-mux": "[\"right-0\",\"right-1\",\"right-2\"]"

- timestamp: 2026-04-20T12:11:00Z
  observation: code logic appears correct - restoreActiveSubScopes reads from getCurrentState().layout with per-project key
  file: src/components/sub-scope-pane.tsx:174-203
  
- timestamp: 2026-04-20T12:12:00Z
  observation: added debug logging to trace projectName, mainKey, mainRaw, parsed values
  file: src/components/sub-scope-pane.tsx:174-203

## Eliminated

(none yet)

## Resolution

- root_cause: null
- fix: null
- verification: null
- files_changed: []
