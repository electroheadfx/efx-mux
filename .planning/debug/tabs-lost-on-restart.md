---
status: awaiting_human_verify
trigger: "Terminal tabs added to non-active projects are lost when quitting and re-running the app."
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - persistTabState() writes a single flat key 'terminal-tabs' that only captures the active project's tabs. projectTabCache (in-memory Map) is not persisted to disk.
test: n/a - root cause confirmed by code reading
expecting: n/a
next_action: Awaiting human verification of fix

## Symptoms

expected: All projects should preserve their terminal tabs across app restarts, including projects that were not the active/visible project at quit time.
actual: Only the active project's terminal tabs are preserved. Non-active (hidden) projects lose their custom tabs and reset to defaults on restart.
errors: No error messages reported.
reproduction: 1) Add custom terminal tabs to a non-active project. 2) Quit the app. 3) Reopen the app. 4) Switch to that project — tabs are gone/reset to defaults.
started: Never worked — tabs for hidden projects have always been lost on restart.

## Eliminated

## Evidence

- timestamp: 2026-04-11T00:00:30Z
  checked: terminal-tabs.tsx persistTabState() function (line 362)
  found: Writes to a single flat key 'terminal-tabs' in session state via updateSession(). Always overwrites with current terminalTabs.value (active project only).
  implication: When project B is active, project A's tabs are not in terminalTabs.value and get overwritten.

- timestamp: 2026-04-11T00:00:40Z
  checked: terminal-tabs.tsx projectTabCache (line 49)
  found: In-memory Map<string, Array<{sessionName, label}>> used during runtime project switches. saveProjectTabs() populates it, restoreProjectTabs() reads it. But it is never persisted to disk.
  implication: projectTabCache is lost on app restart -- non-active project tabs vanish.

- timestamp: 2026-04-11T00:00:50Z
  checked: main.tsx bootstrap tab restore (lines 230-241)
  found: On startup, reads only session['terminal-tabs'] (single key) and restores those tabs for the active project. No per-project tab data exists in state.json.
  implication: Confirms only active project tabs survive restart.

## Resolution

root_cause: persistTabState() saves tab metadata to a single flat key 'terminal-tabs' in state.json. The in-memory projectTabCache (Map) that holds non-active project tabs is never persisted to disk. On restart, only the last-active project's tabs are restored.
fix: Change persistence to per-project keys ('terminal-tabs:{projectName}'). Persist projectTabCache entries to disk when saving. On project switch, save outgoing project tabs to disk. On restore, read project-specific key.
verification: TypeScript compiles clean. Vite build succeeds. Awaiting manual test: add tabs to non-active project, quit, reopen, verify tabs persist.
files_changed: [src/components/terminal-tabs.tsx, src/main.tsx]
