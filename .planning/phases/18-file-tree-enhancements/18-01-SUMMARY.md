---
phase: 18
plan: 01
subsystem: file-tree-enhancements
tags: [rust, tauri, file-ops, backend, ipc, service, phase-18]
wave: 1
status: complete
completed: 2026-04-16

dependency_graph:
  requires:
    - Phase 15 file CRUD (delete_file, rename_file, create_file, list_directory)
    - is_safe_path guard helper (file_ops.rs)
    - tauri::Emitter trait
    - @tauri-apps/api/core (invoke) and @tauri-apps/api/event (emit)
  provides:
    - create_folder Tauri command (mkdir, rejects existing)
    - copy_path Tauri command (file + recursive dir, aborts on conflict)
    - count_children Tauri command (capped at 10_000)
    - launch_external_editor Tauri command (open -a)
    - open_default Tauri command (open <path>)
    - reveal_in_finder Tauri command (open -R)
    - detect_editors Tauri command (which probes)
    - createFolder, copyPath, launchExternalEditor, openDefault, revealInFinder, detectEditors TS wrappers
    - DetectedEditors TS interface
    - deleteFile/renameFile/createFile now emit git-status-changed
  affects:
    - Plans 18-02 (ContextMenu submenu + file-tree UI) consume these commands
    - Plans 18-03 (delete flow + confirm modal) consume count_children + deleteFile
    - Plans 18-04 (drag-drop + Finder import) consume copyPath
    - Plans 18-05 (inline create + external editors) consume createFolder + launchExternalEditor + detectEditors

tech-stack:
  added:
    - None (std-only Rust, no new crates)
  patterns:
    - is_safe_path guard on every new command (2-layer: async wrapper + sync impl)
    - spawn_blocking wrapper for sync FS ops
    - emit('git-status-changed') on mutations (Rust side via AppHandle.emit; JS side via @tauri-apps/api/event.emit)
    - *_impl sync helper + async wrapper for Rust unit testability
    - argv-safe process spawning (no shell interpolation)
    - TypeScript FileError class for typed failures
    - Vitest mockIPC for service wrapper tests
    - tempfile::TempDir for Rust FS fixture tests

key-files:
  created: []
  modified:
    - src-tauri/src/file_ops.rs (+430 lines: 7 cmds + 2 structs + 13 tests)
    - src-tauri/src/lib.rs (+8 lines: 7 command registrations + comment header)
    - src/services/file-service.ts (+93 lines: 6 wrappers + DetectedEditors + 3 emit additions)
    - src/services/file-service.test.ts (+144 lines: 12 test cases across 6 describe blocks)

decisions:
  - 10_000 entry cap on count_children is hardcoded in the async wrapper; sync impl takes cap param for testability
  - copy_path follows symlinks (no cycle detection); risk is LOW for typical project files (documented in RESEARCH.md A4)
  - Partial-failure cleanup: best-effort remove_dir_all on target if recursive copy fails mid-way
  - Editor launch via `open -a` (LaunchServices) rather than direct CLI invocation — works even for GUI-only installs
  - No `-n` flag on `open` — want editor to reuse existing window (LaunchServices default)
  - No `-W` flag either — fire-and-forget to avoid blocking the Tokio runtime
  - detect_editors is a sync synchronous probe, not cached — called once at app start by downstream plans
  - FileError codes: CreateFolderError, CopyError, LaunchError, OpenDefaultError, RevealError, DetectError (all distinct)
  - emit('git-status-changed') added to existing deleteFile/renameFile/createFile (previously only writeFile emitted)

metrics:
  plan_start: 2026-04-16T18:41:35Z
  duration_seconds: 374
  duration_human: "6m 14s"
  tasks_completed: 3
  files_modified: 4
  lines_added: 675
  tests_added: 25 (13 Rust + 12 TypeScript)
  commits: 3
---

# Phase 18 Plan 01: File Ops Backend + TS Service Summary

> Rust file operations (create_folder, copy_path, count_children, external editor launch commands) + editor detection + file-service TS wrappers with tests. Provides the complete Rust/IPC surface area downstream Phase 18 UI plans (18-02 through 18-05) consume — without it, no new command can be invoked from the frontend.

---

## What Was Built

### 7 New Tauri Commands (`src-tauri/src/file_ops.rs`)

| Command | Signature | Purpose |
|---------|-----------|---------|
| `create_folder` | `(path: String, app: AppHandle) -> Result<(), String>` | mkdir-style; rejects existing paths; emits git-status-changed |
| `copy_path` | `(from: String, to: String, app: AppHandle) -> Result<(), String>` | File + recursive dir copy; aborts on conflict; cleans partial state on failure |
| `count_children` | `(path: String) -> Result<ChildCount, String>` | Recursive count of files + folders; capped at 10_000 entries |
| `launch_external_editor` | `(app: String, path: String) -> Result<(), String>` | `open -a <app> <path>` argv-safe (no shell interp) |
| `open_default` | `(path: String) -> Result<(), String>` | `open <path>` macOS default app |
| `reveal_in_finder` | `(path: String) -> Result<(), String>` | `open -R <path>` Finder reveal |
| `detect_editors` | `() -> Result<DetectedEditors, String>` | Probes `which zed\|code\|subl\|cursor\|idea` |

### 2 New Structs (Rust + TS mirrors)

```rust
pub struct ChildCount { pub files: u32, pub folders: u32, pub total: u32, pub capped: bool }
pub struct DetectedEditors { pub zed: bool, pub code: bool, pub subl: bool, pub cursor: bool, pub idea: bool }
```

### 6 New TS Wrappers (`src/services/file-service.ts`)

| Wrapper | FileError Code | Emits git-status-changed |
|---------|----------------|--------------------------|
| `createFolder(path)` | `CreateFolderError` | ✓ |
| `copyPath(from, to)` | `CopyError` | ✓ |
| `launchExternalEditor(app, path)` | `LaunchError` | — (not a mutation) |
| `openDefault(path)` | `OpenDefaultError` | — (not a mutation) |
| `revealInFinder(path)` | `RevealError` | — (not a mutation) |
| `detectEditors()` | `DetectError` | — (read-only probe) |

### 3 Existing Wrappers Now Emit `git-status-changed`

Previously only `writeFile` emitted. Now `deleteFile`, `renameFile`, `createFile` emit too — so the File Tree and Git sidebar re-render after any mutation. Pattern matches the existing `writeFile` line (`await emit('git-status-changed')` after successful `invoke`).

### Test Coverage

- **13 new Rust inline tests** in `#[cfg(test)] mod tests`:
  - `create_folder_creates_directory`, `create_folder_rejects_existing`, `create_folder_rejects_traversal`
  - `copy_path_copies_file`, `copy_path_copies_directory_recursively`, `copy_path_rejects_existing_target`, `copy_path_rejects_traversal`
  - `count_children_counts_files_and_dirs`, `count_children_caps_at_limit`
  - `launch_external_editor_rejects_traversal`, `open_default_rejects_traversal`, `reveal_in_finder_rejects_traversal`, `detect_editors_returns_struct`
- **12 new Vitest cases** in `file-service.test.ts`: 6 wrappers × (invoke-with-args + FileError-on-fail)

## Security Posture

All new commands defend against:

1. **Directory traversal** — `is_safe_path()` guard on both the async wrapper and the sync impl (two-layer check). Rejects any path containing `..` component.
2. **Shell injection** — `std::process::Command::args([...])` passes each argument as a separate argv element. Even if `app` contained shell metacharacters (`;`, `|`, `&`), they are treated as literal bytes by the argv interface.
3. **Silent overwrite on copy** — `copy_path` pre-checks target existence; returns error before touching filesystem.
4. **Partial-copy state** — On recursive copy failure, best-effort `remove_dir_all(to)` cleans the partial target.
5. **DoS via huge trees** — `count_children` caps at 10_000 entries with `capped: true` flag. Prevents UI thread hanging on `node_modules` (~30k files) or `.git` loose objects.

## Validated Against Acceptance Criteria

All 28 acceptance-criteria `grep -c` checks from the plan pass. Specifically:

- `cd src-tauri && cargo test --lib file_ops::tests` → 31 passed, 0 failed
- `cd src-tauri && cargo check` → clean
- `pnpm exec vitest run src/services/file-service.test.ts` → 22 passed, 0 failed (10 existing + 12 new)
- 7 commands registered in `lib.rs` `generate_handler!`
- 6 `emit('git-status-changed')` calls in `file-service.ts` (writeFile + deleteFile + renameFile + createFile + createFolder + copyPath)

## Commits

| Task | Hash | Description |
|------|------|-------------|
| 1 | 9131199 | feat(18-01): add create_folder, copy_path, count_children Rust commands |
| 2 | 1b89f69 | feat(18-01): add external editor Rust commands (launch, open, reveal, detect) |
| 3 | 5f2edcb | feat(18-01): register Phase 18 commands, add TS wrappers + tests |

## Deviations from Plan

None. The plan was executed exactly as written. All decisions from CONTEXT.md (D-02, D-06, D-08, D-09, D-17, D-20, D-25) and RESEARCH.md (§2, §3, §4, §7) were followed verbatim.

One minor adjustment: the plan's `<verify>` command for Task 2 listed four test targets separated by spaces, but `cargo test` accepts only one `TESTNAME` argument. Verified all four tests individually via `cargo test --lib file_ops::tests` (runs all 31 tests) — this is a broader-but-equivalent run and confirms the same coverage.

## Deferred Issues

Unrelated pre-existing test failures found while verifying. These are NOT caused by Plan 18-01 changes and are OUT OF SCOPE per the SCOPE BOUNDARY rule:

- `src/components/sidebar.test.tsx` — 2 failing tests (pre-existing; reference `unified-tab-bar.tsx:13` which Plan 18-01 does not modify)
- `src/components/terminal-tabs.tsx:734` — unhandled rejection from `listen('pty-exited', ...)` calling `transformCallback` on undefined (pre-existing Tauri API mock gap, not introduced here)

These should be tracked separately. Running `pnpm exec vitest run src/services/file-service.test.ts` (the plan's own target) passes cleanly.

## Auth Gates

None encountered.

## Self-Check: PASSED

- ✓ `src-tauri/src/file_ops.rs` modified and contains all 7 new commands + 2 structs + 13 tests
- ✓ `src-tauri/src/lib.rs` modified and contains 7 new command registrations
- ✓ `src/services/file-service.ts` modified and contains 6 new wrappers + DetectedEditors + 3 emit additions
- ✓ `src/services/file-service.test.ts` modified and contains 6 new describe blocks
- ✓ Commit 9131199 exists in git log (Task 1)
- ✓ Commit 1b89f69 exists in git log (Task 2)
- ✓ Commit 5f2edcb exists in git log (Task 3)
- ✓ All 31 Rust file_ops tests pass
- ✓ All 22 file-service TS tests pass
- ✓ `cargo check` clean

## Downstream Consumers

This plan unblocks Wave 2 and beyond:

- **18-02** (ContextMenu submenu extension) — can now wire menu items to `launchExternalEditor`
- **18-03** (Delete flow + confirm modal) — can now call `count_children` for the folder-delete message
- **18-04** (Drag-drop intra-tree + Finder import) — can now call `copyPath` for Finder drops
- **18-05** (Inline create file/folder, header buttons) — can now call `createFolder` and `detectEditors`
