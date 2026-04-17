---
slug: git-blank-filenames
status: resolved
trigger: "I have empty files in git"
created: 2026-04-17
updated: 2026-04-17
---

# Debug Session: Git Panel Shows Blank Filename Rows

## Symptoms

DATA_START
- **Trigger (verbatim):** "I have empty files in git [Image #1]"
- **Bug type:** Filenames blank in UI. Git panel shows 4 changed files but only 1 row renders a filename (`260417-iat-PLAN.md`); 3 rows are blank.
- **Reality check:** Actual `git status --short` shows only `?? .claude/worktrees/` — a single untracked entry. UI is showing phantom rows that do not match git CLI output.
- **Reproduction:** May be project-specific. Always reproduces on this project on git tab load.
- **Timeline:** Started recently (today, 2026-04-17). Possibly related to recent quick task `260417-iat` (delete folder shortcut) or earlier git panel work.
- **Visible row's filename:** `260417-iat-PLAN.md` — a `.planning/` file that may be gitignored or filtered.
- **Right panel:** Shows 4 collapsed expandable items each tagged `[U]` (untracked), only the last shows a name.
DATA_END

## Environment

- App: efx-mux v0.2.2 (per window title)
- Branch: `feat/phase-18`
- Project: efx-mux (self-hosting — debugging the app while running it)
- Recent commits touched: `quick-260417-iat` (folder delete shortcut, file tree)

## Hypothesis Candidates (initial — to verify)

1. Git panel reads stale state (cached snapshot vs. live `git status`)
2. Filename parsing fails for certain status codes/path prefixes (e.g., directory entries like `.claude/worktrees/`)
3. Untracked directory expansion: `.claude/worktrees/` is a dir, app expands children but child paths return empty
4. Race condition: file watcher fires before git status completes, renders empty entries
5. Recent file-tree code (Phase 18 / 260417-iat) introduced a regression in git status mapping

## Current Focus

- hypothesis: Filename parsing fails for git2 entries that end with `/` (untracked nested-repo / worktree dirs)
- test: Reproduce by running git2 with the same StatusOptions as the app against the live repo and inspecting the returned `entry.path()` strings
- expecting: paths ending in `/` for `.claude/worktrees/agent-*` entries → `split('/').last()` returns empty string → blank UI rows
- next_action: Confirmed; implement fix in `extract_display_name` helper and add regression test
- reasoning_checkpoint: confirmed via standalone git2 reproducer
- tdd_checkpoint:

## Evidence

- timestamp: 2026-04-17T00:00:00Z
  source: bash `git status --short`
  observation: Only `?? .claude/worktrees/` returned. Single untracked entry.
- timestamp: 2026-04-17T00:00:00Z
  source: user screenshot
  observation: UI displays "4 Changed Files", 4 checkbox rows in left sidebar (3 blank), right diff panel shows 4 [U]-tagged expandable rows with only `260417-iat-PLAN.md` named.
- timestamp: 2026-04-17T00:00:00Z
  source: standalone git2 reproducer at /tmp/git_test (libgit2 0.20.4, same StatusOptions as `get_git_files_impl`)
  observation: |
    Total entries: 4 (matches the screenshot exactly)
    path=".claude/worktrees/agent-a515d87e/" flags=Status(WT_NEW)
    path=".claude/worktrees/agent-a701c801/" flags=Status(WT_NEW)
    path=".claude/worktrees/agent-a8db6e19/" flags=Status(WT_NEW)
    path=".planning/quick/.../260417-iat-PLAN.md" flags=Status(WT_NEW)
    The three worktree dirs are reported with a TRAILING SLASH because each contains a `.git` file (they are git worktrees / nested repos), and libgit2's `recurse_untracked_dirs(true)` does not descend into nested repos — it returns the directory itself.
- timestamp: 2026-04-17T00:00:00Z
  source: code inspection of `src-tauri/src/git_status.rs:81`
  observation: |
    `let name = rel_path.split('/').last().unwrap_or(&rel_path).to_string();`
    For an input ending in `/`, `split('/').last()` returns `""` (empty string),
    not the directory's basename. This produces `GitFileEntry { name: "", ... }`,
    which renders as a blank row in both `git-control-tab.tsx` (sidebar checkbox
    list) and `git-changes-tab.tsx` (right accordion panel).
- timestamp: 2026-04-17T00:00:00Z
  source: cargo test (after fix)
  observation: |
    13 git_status tests pass (5 new unit tests for `extract_display_name`,
    1 new regression test `get_git_files_handles_untracked_nested_repo_dir`,
    7 pre-existing tests still green). Full lib suite: 69 passed, 0 failed.
- timestamp: 2026-04-17T00:00:00Z
  source: standalone reproducer rerun with patched `extract_display_name`
  observation: |
    All 5 current entries now produce non-blank names:
    name="agent-a515d87e" path="...worktrees/agent-a515d87e"
    name="agent-a701c801" path="...worktrees/agent-a701c801"
    name="agent-a8db6e19" path="...worktrees/agent-a8db6e19"
    name="git-blank-filenames.md" path="...debug/git-blank-filenames.md"
    name="git_status.rs" path="...src-tauri/src/git_status.rs"
    Trailing slashes also stripped from `path` so downstream stage/diff calls
    receive a clean filesystem path.

## Eliminated

- "Stale state" hypothesis (#1): backend really does return 4 entries; not a caching issue.
- "Race condition" hypothesis (#4): purely deterministic — same result on every call.
- "Phase 18 / 260417-iat regression" hypothesis (#5): `git_status.rs` was last modified in commit `ea783b4` (Phase 13/quick-260415-gkz, before Phase 18). The bug only became visible because the user recently created git worktrees in `.claude/worktrees/`.

## Resolution

- root_cause: |
    `get_git_files_impl` extracts the displayed filename via
    `rel_path.split('/').last()`. libgit2's status iterator returns untracked
    directories that are themselves git repos (such as git worktrees) as a
    single entry with a trailing `/` because `recurse_untracked_dirs(true)`
    does not descend into nested repos. For paths ending in `/`,
    `split('/').last()` returns `""` rather than the directory's basename, so
    the UI renders a blank row. The recently-added `.claude/worktrees/agent-*`
    worktrees are why the bug only became visible now.
- fix: |
    Added `extract_display_name(rel_path)` helper that trims any trailing `/`
    before extracting the basename via `rsplit('/').next()`. Applied to the
    `name` field in `get_git_files_impl`. Also strip trailing `/` from the
    `path` field (`full_path = format!("{}/{}", path, trimmed_rel)`) so
    downstream stage/diff calls do not receive a directory-style path.
    Added 5 unit tests for `extract_display_name` and 1 regression test
    `get_git_files_handles_untracked_nested_repo_dir` that creates a real
    nested repo and asserts the entry has a non-empty name with no trailing
    slash on the path.
- verification: |
    cargo test --lib → 69 passed / 0 failed.
    Standalone git2 reproducer against the live efx-mux repo confirms all
    entries now have non-blank names. User must reload the GIT tab in the
    running app (the dev server is owned by the user; the Rust change requires
    a cargo rebuild + Tauri restart).
- files_changed:
  - src-tauri/src/git_status.rs (added `extract_display_name` helper, applied
    in `get_git_files_impl`, added 6 new tests)
