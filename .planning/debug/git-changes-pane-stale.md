---
status: awaiting_human_verify
trigger: "Git Changes pane shows stale/incorrect file list compared to actual git status"
created: 2026-04-13T00:00:00Z
updated: 2026-04-13T00:15:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED - Missing auto-refresh for git status changes
test: Implemented git watcher that monitors .git/ directory and emits git-status-changed event
expecting: Git Changes pane will auto-refresh when commits/stages occur
next_action: User verification that fix works

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Git Changes pane should show only files from `git status`:
- modified: src-tauri/src/lib.rs
- modified: src-tauri/src/terminal/pty.rs
- untracked: .planning/debug/tmux-path-bundle.md

actual: Git Changes pane shows 12+ files including:
- tmux-path-bundle.md (correct)
- lib.rs (correct)
- pty.rs (correct)
- gsd-advisor-resear... (STALE - not in git status)
- gsd-assumptions-an... (STALE)
- gsd-framework-sele... (STALE)
- gsd-integration-ch... (STALE)
- gsd-project-resear... (STALE)
- gsd-research-synth... (STALE)
- complete-milestone... (STALE)
- do.md (STALE)
- milestone-summary... (STALE)
- plan-milestone-gap... (STALE)

errors: None visible
reproduction: Open app, look at Git Changes pane - shows stale files
started: User comparing current git status output vs what pane displays

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Backend caching issue
  evidence: git_status.rs uses fresh Repository::open on each call, no caching
  timestamp: 2026-04-13T00:05:00Z

- hypothesis: Signal not being updated on refresh
  evidence: gitFiles.value = files; completely replaces old value with new data
  timestamp: 2026-04-13T00:06:00Z


## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-13T00:01:00Z
  checked: Backend git_status.rs get_git_files_impl
  found: Uses git2 directly with fresh Repository::open on each call. No caching at Rust layer.
  implication: Backend is NOT the source of staleness. Data is fresh from git2.

- timestamp: 2026-04-13T00:02:00Z
  checked: Frontend sidebar.tsx gitFiles signal
  found: `gitFiles` is a local signal (line 28) storing array of files. Updated by refreshGitFiles().
  implication: Frontend signal-based state could retain stale data if not properly refreshed.

- timestamp: 2026-04-13T00:03:00Z
  checked: Refresh triggers in sidebar.tsx
  found: refreshGitFiles called on: (1) initial mount, (2) project-changed event, (3) refresh button click
  implication: No automatic refresh on file system changes. If files committed/changed since app opened, list becomes stale.

- timestamp: 2026-04-13T00:04:00Z
  checked: file_watcher.rs
  found: Only watches for .md file changes (emits md-file-changed event). No watcher for git status refresh.
  implication: Git status is not auto-refreshed when files are committed or changed.


## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Git status is only refreshed on app mount, project switch, or manual refresh button click. There is no file watcher monitoring .git/ directory changes to trigger automatic refresh when files are committed/staged/changed via terminal or external tools.
fix: Added start_git_watcher() function that monitors .git/ directory for changes to index, HEAD, refs, and other git-relevant files. Emits git-status-changed Tauri event. Frontend sidebar listens for this event and calls refreshAllGitStatus().
verification: Pending user verification - rebuild app and test that git operations auto-refresh the Git Changes pane
files_changed:
  - src-tauri/src/file_watcher.rs
  - src/components/sidebar.tsx
