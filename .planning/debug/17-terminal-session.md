---
status: investigating
trigger: "terminal sessions unstable across tab switching and app restart"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus

hypothesis: "restoreTabs infers isAgent=true for Zsh tabs when saved.isAgent is undefined and project has agentBinary"
test: "Trace restoreTabs path for a Zsh tab with saved.isAgent=undefined on a project with agent=claude"
expecting: "isAgentTab becomes true incorrectly, causing shellCmd=agentBinary, causing session kill-and-spawn"
next_action: "Complete analysis and write structured report"

## Symptoms

expected: "Terminal sessions (Zsh) persist across app restart; switching tabs preserves correct session type"
actual: "Sessions restart (Zsh replaced by Claude Code); Zsh tabs restored as agent after restart"
errors: []
reproduction: "Create project with agent=claude, create Zsh tab (Tab 1), create Claude tab (Tab 2), restart app, observe Tab 1 opens Claude instead of Zsh"
started: "Unknown, reported in phase 17"

## Evidence

- timestamp: 2026-04-15
  checked: "src/state/terminal-tabs.ts restoreTabs function (line 621-706)"
  found: "Line 662: const isAgentTab = saved.isAgent ?? (i === 0 && !!agentBinary);"
  implication: "If saved.isAgent is undefined (e.g., old state format), first tab with agentBinary defined gets isAgent=true"

- timestamp: 2026-04-15
  checked: "src/state/terminal-tabs.ts persistTabState function (line 426-440)"
  found: "Line 431: isAgent: t.isAgent ?? false — correctly saves isAgent but uses ?? which does NOT default undefined to false if isAgent is falsy but explicitly set"
  implication: "Old state.json entries without isAgent field will have saved.isAgent=undefined on restore"

- timestamp: 2026-04-15
  checked: "src-tauri/src/terminal/pty.rs spawn_terminal function (line 51-367)"
  found: "Lines 85-126: Session kill logic — if shellCommand is truthy (agent tab), existing session is KILLED before creating new one"
  implication: "If isAgent=true for a Zsh tab due to bug, shellCmd=agentBinary triggers session kill+respawn as agent"

- timestamp: 2026-04-15
  checked: "src/state/terminal-tabs.ts switchToTab function (line 396-413)"
  found: "Only toggles CSS display:none/block; does NOT call switch_tmux_session to switch tmux client"
  implication: "All PTY masters and tmux sessions remain active regardless of visible tab"

- timestamp: 2026-04-15
  checked: "src/state/terminal-tabs.ts clearAllTabs function (line 595-611)"
  found: "Does NOT clear projectTabCache after destroying sessions; does NOT call persistTabState"
  implication: "Stale cache entries persist; tab state not updated on disk after clear"

## Resolution

root_cause: "restoreTabs uses fallback heuristic (i === 0 && !!agentBinary) for isAgent when saved.isAgent is undefined, incorrectly marking Zsh tabs as agent tabs, causing spawn_terminal to kill the Zsh session and spawn Claude instead"
fix: ""
verification: ""
files_changed: []
---
