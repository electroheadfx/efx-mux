---
status: awaiting_human_verify
trigger: "File Tree pane preferences (font, font size, line height, BG color) not persisted on app restart"
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - File tree pref signals are never saved to or restored from state.layout
test: Compared with sidebar-w, server-pane-state which use updateLayout() pattern
expecting: N/A - root cause confirmed
next_action: Awaiting human verification of the fix

## Symptoms

expected: File Tree pane preferences (font family, font size, line height, BG color) should be saved when the app is quit and restored when the app is reopened.
actual: When the app is quit and reopened, File Tree preferences are reset to defaults — the user's customizations are lost.
errors: No error messages reported.
reproduction: 1) Open preferences, change File Tree font/size/line-height/BG color. 2) Quit the app. 3) Reopen the app. 4) File Tree preferences are back to defaults.
started: After quick task 260411-c1y which added these preferences.

## Eliminated

## Evidence

- timestamp: 2026-04-11
  checked: file-tree.tsx signals (fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor)
  found: Signals initialized with hardcoded defaults, never read from or written to persisted state
  implication: Values are lost on app restart because they only exist in memory

- timestamp: 2026-04-11
  checked: preferences-panel.tsx onInput handlers
  found: Handlers set signal values but never call updateLayout() to persist
  implication: Changes are visible in-session but not saved to state.json

- timestamp: 2026-04-11
  checked: main.tsx bootstrap layout restore
  found: No code reads file-tree-* keys from appState.layout
  implication: Even if values were saved, they would not be restored on startup

- timestamp: 2026-04-11
  checked: Existing persistence pattern (sidebar-w, server-pane-state, right-h-pct)
  found: All use updateLayout() on change + read from appState.layout on bootstrap
  implication: File tree prefs need the same two-step wiring

## Resolution

root_cause: File tree preference signals (fileTreeFontSize, fileTreeLineHeight, fileTreeBgColor) were added in quick-260411-c1y as in-memory Preact signals but were never wired into the state persistence layer. The updateLayout() calls to save values on change and the bootstrap restore from appState.layout were both missing.
fix: Added updateLayout() calls in preferences-panel.tsx for all 3 file tree pref inputs (including the BG color Reset button). Added restore logic in main.tsx bootstrap to read file-tree-font-size, file-tree-line-height, and file-tree-bg-color from appState.layout and set the signals.
verification: TypeScript compiles cleanly. Awaiting human verification of save/restore cycle.
files_changed: [src/components/preferences-panel.tsx, src/main.tsx]
