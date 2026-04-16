---
status: investigating
trigger: "Git Changes tab shows endless loading (never completes). invoke('get_git_status', { path }) either never returns or returns an error that's not being handled."
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus

hypothesis: "get_git_status" command returns wrong data type (GitStatus: {branch, modified, staged, untracked}) but git-changes-tab.tsx expects GitFile[] (array of {name, path, status, staged, additions, deletions}). TypeScript type mismatch causes invoke to return unexpected data structure. No error is displayed to user - loading stays true indefinitely.
test: Compare exact invoke calls between git-control-tab.tsx (working) and git-changes-tab.tsx (broken)
expecting: git-changes-tab.tsx calls get_git_status which returns single GitStatus object; should call get_git_files which returns file array
next_action: Fix loadGitStatus to call get_git_files (correct command) and handle errors properly

## Symptoms

expected: Git Changes tab loads git status and displays file list, with Loading... spinner appearing briefly then resolving
actual: Git Changes tab shows "Loading..." indefinitely and never completes
errors: None visible to user (errors are caught but only logged, not displayed)
reproduction: Open app, navigate to Git Changes tab, see endless loading
started: Unknown when it started

## Eliminated

- hypothesis: Path format issue (absolute vs relative)
  evidence: Both git-control-tab.tsx and git-changes-tab.tsx pass project.path (absolute). git-control-tab.tsx works.
  timestamp: 2026-04-15T00:10:00Z

- hypothesis: get_git_status command not registered
  evidence: Command is registered in lib.rs (line 118) and has correct #[tauri::command] attribute
  timestamp: 2026-04-15T00:11:00Z

- hypothesis: Backend returns error for get_git_status
  evidence: get_git_status uses spawn_blocking + git2 Repository::open - standard git2, no obvious failure modes
  timestamp: 2026-04-15T00:12:00Z

## Evidence

- timestamp: 2026-04-15T00:05:00Z
  checked: git-changes-tab.tsx loadGitStatus function (line 153-167)
  found: Calls invoke<GitFile[]>('get_git_status', { path: project.path })
  implication: TypeScript expects GitFile[] (array of file entries)

- timestamp: 2026-04-15T00:06:00Z
  checked: git-status.rs get_git_status return type
  found: Returns Result<GitStatus, String> where GitStatus = {branch: String, modified: usize, staged: usize, untracked: usize} - a SINGLE object, NOT an array
  implication: MAJOR TYPE MISMATCH - component expects array of files, gets single status object

- timestamp: 2026-04-15T00:07:00Z
  checked: git-control-tab.tsx refreshGitFiles function (line 97-154)
  found: git-control-tab calls get_git_files (not get_git_status) for file list. get_git_status is only used for branch name extraction (lines 134-139)
  implication: git-control-tab uses the correct command (get_git_files). git-changes-tab uses wrong command (get_git_status).

- timestamp: 2026-04-15T00:08:00Z
  checked: Error handling in git-changes-tab.tsx loadGitStatus
  found: catch block only logs to console.error, does not update any error signal or display error to user. isLoading is NOT set to false in error path (only in finally block).
  implication: If invoke throws error (TypeScript type mismatch causing deserialization failure?), error is silently logged and loading stays true forever

- timestamp: 2026-04-15T00:09:00Z
  checked: file_ops.rs get_file_diff command registration
  found: get_file_diff is registered in lib.rs at line 139. toggleExpand calls it correctly.
  implication: get_file_diff command exists and is registered. Not the source of endless loading.

## Resolution

root_cause: git-changes-tab.tsx calls get_git_status (returns GitStatus={branch,modified,staged,untracked}) but expects GitFile[] (array of file entries). TypeScript type mismatch causes invoke to return unexpected data. No error is displayed to user. isLoading never set to false in error path.
fix: Change loadGitStatus to call get_git_files instead of get_git_status. Add error display to user. Ensure isLoading=false in error path.
verification: Pending user test
files_changed:
  - src/components/git-changes-tab.tsx