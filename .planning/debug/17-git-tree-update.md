---
status: investigating
trigger: "git tree not updating after file save, editor not updating after git revert"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus

hypothesis: "CONFIRMED - revert_file_impl does not emit git-status-changed event"
test: "Traced code paths for save and revert flows"
expecting: "Identify missing event emissions"
next_action: "Compile findings into structured report"

## Symptoms

expected: "Git tree updates after file save; Editor refreshes after git revert"
actual: "Git tree not updated after save; Editor not updated after git revert"
errors: []
reproduction: "User reports these issues but truth claims they work"
started: "Not specified"

## Eliminated

## Evidence

- timestamp: 2026-04-15
  checked: "src/services/file-service.ts writeFile function"
  found: "writeFile emits 'git-status-changed' via emit() after successful invoke"
  implication: "Save path has explicit event emission on frontend side"

- timestamp: 2026-04-15
  checked: "src-tauri/src/git_ops.rs revert_file_impl"
  found: "revert_file_impl runs 'git checkout -- <file>' but does NOT emit any event"
  implication: "Revert path has NO explicit event emission - relies only on file watcher"

- timestamp: 2026-04-15
  checked: "src-tauri/src/file_watcher.rs start_git_watcher"
  found: "Watches .git/ directory, filters for .git/index, .git/HEAD, .git/refs, etc. Uses 300ms debounce"
  implication: "Git watcher can detect .git/index changes from git checkout, but timing is indirect and debounced"

- timestamp: 2026-04-15
  checked: "src/components/editor-tab.tsx"
  found: "EditorTab has useEffect listening for 'git-status-changed' to re-read file from disk (lines 88-113)"
  implication: "Editor expects git-status-changed event to trigger refresh after revert"

- timestamp: 2026-04-15
  checked: "src/components/sidebar.tsx"
  found: "Sidebar listens for 'git-status-changed' and calls refreshAllGitStatus() (lines 594-600)"
  implication: "Sidebar expects git-status-changed event to trigger refresh after save"

## Resolution

root_cause: "revert_file_impl does not emit git-status-changed event after git checkout; relies on file watcher which is indirect, debounced, and not guaranteed"
fix: "Add emit('git-status-changed') call after successful revert_file_impl in git_ops.rs"
verification: "Pending - user needs to verify after fix"
files_changed:
  - src-tauri/src/git_ops.rs: need to add event emission after revert_file_impl success
