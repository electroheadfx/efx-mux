---
status: investigating
trigger: "Theme mode not persisted across app restarts; OS theme changes don't trigger theme changes"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
---

## Current Focus

hypothesis: Two root causes found - see Resolution
test: Code trace confirmed both issues
expecting: n/a
next_action: Return diagnosis

## Symptoms

expected: Theme mode (dark/light) persists across restarts; OS theme changes trigger app theme change
actual: Theme toggle works in-session but not across restarts; OS changes ignored
errors: None reported
reproduction: Toggle theme with ctrl+shift+t, restart app, theme resets to dark
started: Phase 04 session persistence

## Eliminated

## Evidence

- timestamp: 2026-04-07
  checked: state.json on disk
  found: theme.mode is present and set to "dark" -- write path works
  implication: Persistence write path (toggleThemeMode -> persistThemeMode -> saveAppState -> Rust save_state) is functional

- timestamp: 2026-04-07
  checked: initTheme() restore path in theme-manager.js:155-173
  found: savedMode is read correctly from state, data-theme attribute is set, BUT applyTheme() then unconditionally sets inline dark chrome CSS vars which override light CSS rules
  implication: Light mode restore is visually broken on startup -- inline styles beat :root[data-theme="light"] selectors

- timestamp: 2026-04-07
  checked: initOsThemeListener() in theme-manager.js:130-145
  found: OS change listener checks localStorage 'efxmux:theme-manual' flag; toggleThemeMode() sets this flag permanently and it is never cleared
  implication: Once user toggles theme even once, OS theme changes are permanently ignored across all future sessions

## Resolution

root_cause: Two issues. (1) initTheme() reads saved mode but never calls setThemeMode() to properly apply it -- it sets data-theme attribute then applyTheme() overwrites with inline dark CSS vars, defeating light mode restore. (2) OS theme listener is permanently disabled after first manual toggle because localStorage flag 'efxmux:theme-manual' is set but never cleared.
fix:
verification:
files_changed: []
