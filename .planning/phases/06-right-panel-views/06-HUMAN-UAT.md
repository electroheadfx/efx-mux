---
status: complete
phase: 06-right-panel-views
source: [06-VERIFICATION.md]
started: 2026-04-07T19:51:00Z
updated: 2026-04-07T21:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. GSD Viewer checkbox write-back
expected: Open a project's PLAN.md in GSD Viewer, click a checkbox — checkbox state toggled in the .md file within milliseconds
result: issue
reported: "Can't add a project at all. Browse [...] button doesn't work (no file picker). After filling form manually and clicking Add Project, nothing happens — sidebar still shows 'No projects yet'."
severity: blocker

### 2. GSD Viewer auto-refresh
expected: With a project loaded, externally edit the PLAN.md — viewer content updates automatically within ~200ms (notify debounce)
result: blocked
blocked_by: prior-phase
reason: "Requires working Add Project (Test 1 blocker)"

### 3. Diff Viewer from sidebar
expected: Click a modified file in sidebar git-changed section — git diff renders with green additions, red deletions, accent-colored hunk headers
result: blocked
blocked_by: prior-phase
reason: "Requires working Add Project (Test 1 blocker)"

### 4. File Tree -> file viewer
expected: Navigate to a file in File Tree, press Enter or click — main panel shows READ-ONLY badge, filename, preformatted content; Close button and Escape key dismiss it
result: blocked
blocked_by: prior-phase
reason: "Requires working Add Project (Test 1 blocker)"

### 5. Bash Terminal connection
expected: Switch to Bash tab in right-bottom panel — xterm.js terminal connects to efx-mux-right tmux session
result: issue
reported: "Bash tab renders but no terminal appears inside — empty panel"
severity: major

### 6. Tab bar visual state
expected: Click each tab in right-top panel (GSD, Diff, File Tree) — active tab shows accent-colored underline; content switches to corresponding view
result: pass

## Summary

total: 6
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 3

## Gaps

- truth: "Add Project flow works — browse button opens file picker, Add Project button saves and shows project in sidebar"
  status: failed
  reason: "User reported: Can't add a project. Browse [...] button doesn't work. After filling form manually and clicking Add Project, nothing happens."
  severity: blocker
  test: 1
  root_cause: "Two bugs: (1) @tauri-apps/plugin-dialog not installed, so browse button silently fails. (2) state-manager.js addProject() calls save_state with stale JS currentState after Rust add_project mutated in-memory state — Rust save_state replaces in-memory state with the stale copy, wiping the just-added project."
  artifacts:
    - path: "src/state-manager.js"
      issue: "addProject calls save_state with stale currentState, overwriting Rust mutation"
    - path: "src-tauri/src/state.rs"
      issue: "save_state replaces in-memory state from JS JSON (line 292)"
    - path: "src/components/project-modal.js"
      issue: "handleBrowse imports @tauri-apps/plugin-dialog which is not installed"
  missing:
    - "Install @tauri-apps/plugin-dialog (Cargo + npm + capabilities)"
    - "Make Rust project mutation commands (add_project, remove_project, switch_project) persist to disk"
    - "Remove stale save_state calls from JS addProject/removeProject/switchProject"
    - "Reload currentState from Rust after project mutations to keep JS in sync"
  debug_session: ""

- truth: "Bash tab connects xterm.js terminal to efx-mux-right tmux session"
  status: failed
  reason: "User reported: Bash tab renders but no terminal appears — empty panel"
  severity: major
  test: 5
  root_cause: "Arrow.js does not support React-style ref callbacks. The ref=\"${(el) => {...}}\" on the bash-terminal div (right-panel.js:119) is not executed — it's serialized as a string attribute. bashContainerEl stays null, so connectBashTerminal() exits early."
  artifacts:
    - path: "src/components/right-panel.js"
      issue: "ref callback on line 119 is not Arrow.js compatible — bashContainerEl never assigned"
  missing:
    - "Replace ref callback with post-render querySelector or Arrow.js-compatible DOM access pattern"
  debug_session: ""
