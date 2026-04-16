---
status: diagnosed
trigger: "yes, but I can't revert a new file - per-file revert button in git sidebar fails for untracked files"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Backend `revert_file_impl` runs `git checkout -- <path>` unconditionally with no per-file-status branching. For untracked files this exits 1 with stderr 'pathspec ... did not match any file(s) known to git', which is captured into `GitError::RevertError(stderr)` and surfaced to the user as a toast/error. Frontend wires the revert button onto every entry in the Changes section (which includes untracked `?` files), so every click on an untracked file triggers this failure path."
  confirming_evidence:
    - "src-tauri/src/git_ops.rs:467-502 — `revert_file_impl` runs `Command::new(\"git\").args([\"checkout\", \"--\", &rel_str])` unconditionally, with no `git2 status_file` check or status-aware branching."
    - "src-tauri/src/git_ops.rs:496-499 — `if !output.status.success() { return Err(GitError::RevertError(stderr)); }` — non-zero git exit becomes a propagated error."
    - "Empirical test in /tmp/revert-test: `git checkout -- untracked.txt` exits 1 with stderr 'error: pathspec ... did not match any file(s) known to git'. The code comment at git_ops.rs:465-466 claiming this is a no-op is factually WRONG."
    - "src/components/git-control-tab.tsx:870-877 — Changes section maps every `changedFiles.value` entry to GitFileRow with `onRevert={() => handleRevertFile(file)}`, with no filter by status."
    - "src/components/git-control-tab.tsx:120-130 — `staged: f.status.startsWith('S') || f.status === 'A'` is false for status `'?'`, so untracked files land in the Changes (unstaged) section that exposes the revert button."
    - "src/components/git-control-tab.tsx:214-225 — `handleRevertFile` calls `revertFile(project.path, file.path)` with no client-side status check."
    - "src/services/git-service.ts:87-93 — `revertFile` is a thin wrapper over `invoke('revert_file', ...)` — no status filtering at the service layer either."
  falsification_test: "If the bug were elsewhere (e.g., a path-encoding issue or a git2 lock) then `git checkout -- <untracked-path>` would succeed in a clean shell. The /tmp/revert-test reproduction proves it doesn't — git itself rejects the operation. So the failure is exactly where the trace points: no status branching in `revert_file_impl`."
  fix_rationale: "Two valid intents collide: (a) the user expects 'revert' on a new file to delete it (since git revert / git checkout is meaningless for untracked content); (b) the original code author intentionally avoided silent deletion (per code comment at git_ops.rs:465-466) — but their assumption that this was a no-op is wrong (it errors). The correct fix is to make the backend status-aware: open repo → check status of the relative path via `git2 Repository::status_file` → if untracked (`Status::WT_NEW`), delete from filesystem (fs::remove_file or trash crate); if tracked-modified/deleted/renamed, run `git checkout -- <path>` as today. Also handle the staged-but-uncommitted-new-file case (status `INDEX_NEW`): the per-file revert button is currently NOT shown for staged files, but `handleRevertAll` does iterate stagedFiles? — re-check: lines 227-243 only iterate `changedFiles.value` (unstaged), so staged-new is out of scope for this bug, but `revert_file_impl` should still behave sensibly if called on one (e.g., `git rm --cached` then delete, or refuse with a clear error)."
  blind_spots: "Have not run the actual app to reproduce the toast error message verbatim. Have not checked if there's a confirmation dialog before revert (UX concern: deleting an untracked file is destructive). Have not checked for any gitignore interaction. Have not checked Windows path separators in `rel_str.to_string_lossy()` — irrelevant to root cause but relevant to fix robustness. Have not investigated whether `handleRevertAll` aborts on first untracked failure (likely yes, since it awaits each call sequentially and doesn't catch per-file)."

hypothesis: "Backend `revert_file_impl` runs `git checkout -- <path>` unconditionally; on untracked files git exits 1 with 'pathspec did not match', which is propagated as `GitError::RevertError`."
test: "Confirmed via code read + empirical /tmp test."
expecting: "Confirmed."
next_action: "Return ROOT CAUSE FOUND diagnosis."

## Symptoms

expected: Per-file revert button in git sidebar removes/discards untracked (new) files (since `git revert` is not valid for untracked, "revert" semantically means "delete" for new files)
actual: Clicking revert next to an untracked file produces a generic "git revert" error or no-op
errors: Generic "git revert" error reported by user (not transcribed). User quote: "yes, but I can't revert a new file"
reproduction: Phase 18 UAT Test 18 — Create a new file (or have an untracked file from Finder drop). In the git sidebar, click revert next to the file → error or no-op.
started: Per-file revert button was added pre-Phase 18 (Quick Task 260415-he6 "Add per-file revert button and replace ellipsis with Revert All in Git tab"). Bug surfaced during Phase 18 UAT because Phase 18 is the first phase that lets users easily create files in-app.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-16T00:00:00Z
  checked: Knowledge base (.planning/debug/knowledge-base.md)
  found: No prior entries with keywords "revert", "untracked", "checkout HEAD"
  implication: Novel investigation, no shortcut available

- timestamp: 2026-04-16T00:00:01Z
  checked: src-tauri/src/git_ops.rs lines 463-511 (`revert_file_impl` and `revert_file` Tauri command)
  found: |
    `revert_file_impl` opens repo, computes relative path, then unconditionally runs:
      Command::new("git").args(["checkout", "--", &rel_str]).current_dir(repo_path).output()
    No `Repository::status_file` call. No branching by file status.
    Code comment at lines 463-466 explicitly states: "For untracked files (`?` status),
    git checkout is a no-op which is correct -- untracked files should not be silently
    deleted." This comment is factually WRONG (verified below).
    Lines 496-499: Any non-zero exit from git becomes `GitError::RevertError(stderr)`.
  implication: Backend has a single code path that assumes file is tracked. Untracked
    files take this path and fail.

- timestamp: 2026-04-16T00:00:02Z
  checked: Empirical reproduction in /tmp/revert-test (init repo, commit existing.txt, create untracked.txt, run `git checkout -- untracked.txt`)
  found: |
    Exit code: 1
    stderr: "error: pathspec 'untracked.txt' did not match any file(s) known to git"
    This is NOT a no-op — it's a hard error that propagates to the frontend.
  implication: The code comment in revert_file_impl is wrong. Every per-file revert
    on an untracked file fails at the git invocation, with the literal pathspec error
    surfaced to the user via toast.

- timestamp: 2026-04-16T00:00:03Z
  checked: src/components/git-control-tab.tsx lines 100-225, 820-880
  found: |
    Line 120-130: Files with status `'?'` (untracked) get `staged: false` (the only
      conditions for staged are status startsWith 'S' or status === 'A'). So untracked
      files appear in `changedFiles.value` (the unstaged "Changes" section).
    Lines 870-877: Changes section maps every entry to GitFileRow with
      `onRevert={() => handleRevertFile(file)}` — no filter by status. So untracked
      files get a clickable revert button.
    Lines 214-225: `handleRevertFile` calls `revertFile(project.path, file.path)`
      with no client-side gating. On error: appends to error log and shows toast
      "Failed to revert {file.name}".
    Lines 227-243: `handleRevertAll` iterates `changedFiles.value` sequentially with
      `await revertFile(...)`. The first untracked file throws and aborts the loop —
      subsequent reverts (including legitimately-tracked-and-modified files later in
      the list) never run. So Revert All also breaks when ANY untracked file is present.
  implication: Frontend has no status awareness either. Both per-file revert and
    Revert All are broken in the presence of untracked files.

- timestamp: 2026-04-16T00:00:04Z
  checked: src/services/git-service.ts lines 80-93 (`revertFile`)
  found: Thin wrapper over `invoke('revert_file', { repoPath, filePath })`. Catches
    error and rethrows as `GitError('RevertError', String(e))`. No status filtering
    at the service layer.
  implication: Service layer is a pass-through. The bug must be fixed in either
    backend (recommended) or frontend (less ideal — duplicates status logic).

- timestamp: 2026-04-16T00:00:05Z
  checked: src-tauri/src/git_ops.rs lines 785-810 (existing `revert_file_discards_changes` test)
  found: Only one test exists. It covers the tracked-modified path (write file, commit,
    modify, revert, assert original content restored). NO test covers the untracked
    path. The bug was never tested.
  implication: Test coverage gap. Fix must add an untracked-file test (e.g.,
    `revert_file_deletes_untracked`) to lock in the new behavior and prevent regression.

## Resolution

root_cause: |
  `revert_file_impl` (src-tauri/src/git_ops.rs:467-502) unconditionally shells out to
  `git checkout -- <path>` regardless of the file's git status. For untracked files,
  this command exits with code 1 and stderr "error: pathspec '<path>' did not match
  any file(s) known to git". The non-zero exit is captured into `GitError::RevertError(stderr)`
  and surfaced to the user as a toast: "Failed to revert {file.name}".

  The frontend (src/components/git-control-tab.tsx) compounds the problem: it places
  untracked (`?`) files in the unstaged "Changes" section and unconditionally wires
  the revert button (line 875), with no status-based gating. `handleRevertAll`
  (lines 227-243) iterates sequentially and aborts on the first untracked-file error,
  also breaking Revert All when any untracked file is present.

  The original code comment at git_ops.rs:463-466 claims `git checkout` is a no-op
  for untracked files; this is factually wrong (it errors).

fix: |
  (NOT APPLIED — diagnose-only mode. Recommended direction below.)

  Backend (src-tauri/src/git_ops.rs):
    1. In `revert_file_impl`, after opening the repo and computing rel_path, call
       `repo.status_file(rel_path)` to inspect the file's status.
    2. Branch on status flags:
       - `Status::WT_NEW` (untracked, working-tree-only): delete the file from disk
         (`std::fs::remove_file(workdir.join(rel_path))`). Optional: prefer the
         `trash` crate to send to system Trash for safety.
       - `Status::WT_MODIFIED | WT_DELETED | WT_TYPECHANGE | WT_RENAMED`: keep the
         current `git checkout -- <path>` invocation.
       - `Status::INDEX_*` only (staged but not in working tree): out-of-scope for
         the per-file revert button (button is not shown for staged files), but
         add a clear error like `RevertError("File is staged; unstage first")` so
         the codepath is robust if called.
       - `Status::CURRENT` (no changes): no-op, return Ok(()).
    3. Update the misleading code comment.
    4. Add a test `revert_file_deletes_untracked` that creates an untracked file,
       calls `revert_file_impl`, and asserts the file no longer exists.

  Frontend (src/components/git-control-tab.tsx):
    1. (Optional UX) For untracked files, change the button tooltip from
       "Revert changes" to "Delete file" or "Discard new file" to set user
       expectation.
    2. (Optional UX) For untracked files, show a confirmation dialog before
       calling backend, since deletion is destructive and not undoable via git
       (only possible if the trash crate is used backend-side).
    3. In `handleRevertAll`, wrap each `await revertFile(...)` in try/catch so a
       single file failure does not abort the loop. Collect errors and show one
       summary toast at the end.

  No changes needed in src/services/git-service.ts — the wrapper is correct as-is.

verification: |
  (NOT APPLIED — diagnose-only mode. Verification plan for the fix:)
    - Backend test: new `revert_file_deletes_untracked` passes.
    - Backend test: existing `revert_file_discards_changes` still passes.
    - Manual: in app, create new file via in-app file creation → click revert in
      git sidebar → file is removed from disk and disappears from Changes list.
    - Manual: modify a tracked file AND create an untracked file → click Revert All →
      both operations succeed.
    - Manual: error toast no longer fires for untracked-file revert.

files_changed: []  # diagnose-only — fix to be applied in gap-closure plan

