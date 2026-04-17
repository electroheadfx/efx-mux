---
phase: 18-file-tree-enhancements
verified: 2026-04-17T06:17:19Z
status: human_needed
score: 12/13
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Press Cmd+Backspace with a file-tree row selected (file tree scroll container has focus) — confirm delete modal appears"
    expected: "'[filename] will be permanently deleted. This cannot be undone.' modal surfaces"
    why_human: "Requires running macOS app; native NSMenu accelerator behaviour cannot be exercised in jsdom/vitest"
  - test: "Press Cmd+Backspace while editing text inside the git commit message textarea — confirm no spurious delete modal appears"
    expected: "Textarea receives standard macOS 'delete to line start' behaviour; no ConfirmModal surfaces for the file tree"
    why_human: "WR-01 (code review): the MenuItem accelerator is registered unconditionally (enabled=true) and currently fires for ALL focused contexts. If the modal does appear this is a user-facing regression that blocks the fix from landing as-is"
  - test: "Click 'Revert' on a file in the Git sidebar for an untracked directory (new folder that was never committed)"
    expected: "The folder is deleted from disk, the git sidebar refreshes, and no error toast appears"
    why_human: "WR-02 (code review): revert_file_impl calls remove_file on WT_NEW entries unconditionally; this succeeds for files but returns an OS error for directories. Manual check needed to confirm the current build fails gracefully or not"
  - test: "Drag a file from Finder onto a folder row in the file tree — confirm file lands in the folder shown under cursor, not a row above or below"
    expected: "The copied file appears inside the folder row where the cursor was positioned at drop time"
    why_human: "UAT Test 16 (drag y-offset) fixed programmatically; end-to-end coordinate correction requires a live Tauri window on macOS to verify the 28px offset eliminates the off-by-one-row bug"
  - test: "Drag a file from Finder onto the terminal panel (outside the file tree) — confirm no file is copied and the 'Drop target outside file tree' toast appears"
    expected: "Toast 'Drop target outside file tree' appears; no copy occurs"
    why_human: "UAT Test 17 BLOCKER (x-axis hit-test) fixed programmatically; the outside-container guard requires the real Tauri DragDropEvent pipeline to confirm the coordinate path is fully wired after the title-bar offset fix"
gaps: []
---

# Phase 18: File Tree Enhancements — Verification Report

**Phase Goal:** Users can delete files, open in external editors, and drag/drop within the tree
**Verified:** 2026-04-17T06:17:19Z
**Status:** human_needed
**Re-verification:** No — initial verification (gap-closure pass, plans 18-06..18-09 just landed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can delete files/folders via context menu with confirmation dialog (TREE-01) | VERIFIED | `triggerDeleteConfirm` wired to context menu Delete item in `file-tree.tsx`. `deleteFile` service call confirmed. `count_children` IPC used for child count message. |
| 2 | User can delete files/folders via Delete key with confirmation dialog (TREE-02) | VERIFIED | `handleFlatKeydown`/`handleTreeKeydown` switch on `'Delete'` → `triggerDeleteConfirm`. ConfirmModal mounted in tests; assertion on `/permanently deleted/` passes (38/38 file-tree tests green). |
| 3 | User can open file in external editor (Zed, VSCode) via context menu (TREE-03) | VERIFIED | `detect_editors` called on load; `launchExternalEditor` wired through `buildOpenInChildren` submenu. `launch_external_editor` Tauri command confirmed in `lib.rs` handler registration and `file_ops.rs`. |
| 4 | User can drag/drop files and folders to reorder within tree (TREE-04) | VERIFIED | `treeDrag` state + `onTreeDocMouseMove`/`onTreeDocMouseUp` pipeline in `file-tree.tsx`. 2D hit-tests (x+y) confirmed at Sites 1 and 2 (`e.clientX >= rect.left && e.clientX <= rect.right`). `renameFile` invoked on drop resolution. |
| 5 | User can drag files from Finder into tree to import (TREE-05) | VERIFIED (programmatic) | `onDragDropEvent` subscribed in `main.tsx` with `MACOS_TITLE_BAR_OFFSET = 28` correction. Finder drop pipeline dispatches `tree-finder-drop` CustomEvent. `copy_path` IPC confirmed in handler. Outside-container guard at `file-tree.tsx:902` now reachable after x-axis check. **Human confirmation required** — see human verification items 4 and 5. |
| 6 | User can create new file from folder context in file tree (MAIN-03) | VERIFIED | `InlineCreateRow` component in `file-tree.tsx:664`. `createFile`/`createFolder` services wired. Inline error for existing names confirmed reachable (UAT Test 8 BLOCKER closed: `create_file_impl` now returns `Err("File already exists: ...")` before `fs::write`). |
| 7 | create_file rejects existing filename (BLOCKER fix — UAT Test 8) | VERIFIED | `if Path::new(path).exists()` guard at `file_ops.rs:363`. Error string `"File already exists: ..."` contains "already exists" substring consumed by `file-tree.tsx:626-634`. Rust test `create_file_rejects_existing` passes (cargo test 61/61). |
| 8 | revert_file on untracked file deletes from disk (UAT Test 18 fix) | VERIFIED | `repo.status_file(&rel_path)` branch in `git_ops.rs:494`. `Status::WT_NEW` → `fs::remove_file`. `revert_file_deletes_untracked` test passes. Old misleading comment removed. |
| 9 | handleRevertAll continues after per-file failure (UAT Test 18 frontend fix) | VERIFIED | `const failures: string[] = []` + inner try/catch in `git-control-tab.tsx:231-244`. Summary toast `"Reverted ${successCount} of ${totalAttempted} files"` confirmed. `isReverting` cleared in `finally`. |
| 10 | Drag y-offset corrected for macOS overlay title bar (UAT Test 16 fix) | VERIFIED | `const MACOS_TITLE_BAR_OFFSET = 28` at `main.tsx:55`. Subtraction `payload.position.y / dpr - MACOS_TITLE_BAR_OFFSET` at line 299. x-axis unchanged. |
| 11 | All four hit-tests check both x and y bounds (UAT Test 17 BLOCKER fix) | VERIFIED | `e.clientX >= rect.left && e.clientX <= rect.right` at Sites 1+2 (lines 499, 529). `position.x >= rect.left && position.x <= rect.right` at Sites 3+4 (lines 848, 880). Outside-container guard at line 902 preserved. |
| 12 | Tree preserves folder expand/collapse state after mutation (UAT Tests 6+7 fix) | VERIFIED | `refreshTreePreservingState()` defined at `file-tree.tsx:240`. Snapshots `expandedPaths` + `prevSelectedPath`, calls `initTree()`, re-expands sorted by path length. `git-status-changed` listener calls wrapper (line 809) not `initTree` directly. 3 regression tests pass. |
| 13 | Cmd+Backspace triggers delete confirm modal on macOS (UAT Test 5 fix) | VERIFIED (programmatic) / ? HUMAN | Native MenuItem `"delete-selection"` with `Some("CmdOrCtrl+Backspace")` registered in `lib.rs:54-59`. `on_menu_event` emits `"delete-selected-tree-row"` (line 217). `file-tree.tsx` listens and routes to `triggerDeleteConfirm` (line 823). Test with captured listener + ConfirmModal passes. **Human confirmation required** — also see WR-01 (focus-gate missing). |

**Score:** 12/13 truths fully programmatically verified; 1 needs human confirmation (Test 13 confirmed in tests but WR-01 concern blocks full pass)

### Deferred Items

None — all roadmap Success Criteria are in scope for this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/file_ops.rs` | 7 new commands + impls + tests | VERIFIED | `create_folder`, `copy_path`, `count_children`, `launch_external_editor`, `open_default`, `reveal_in_finder`, `detect_editors` confirmed. `ChildCount`, `DetectedEditors` structs present. `is_safe_path` on all paths. |
| `src-tauri/src/git_ops.rs` | `revert_file_impl` with status branching + 2 new tests | VERIFIED | `status_file` branch confirmed. `WT_NEW` → `fs::remove_file`. `revert_file_deletes_untracked` + `revert_file_no_op_on_clean` tests green. |
| `src-tauri/src/lib.rs` | 7 new commands registered + delete-selection MenuItem | VERIFIED | All 7 `file_ops::*` commands in `generate_handler!`. `delete_selection_item` with `CmdOrCtrl+Backspace`. `"delete-selection"` match arm emitting `"delete-selected-tree-row"`. |
| `src/main.tsx` | `MACOS_TITLE_BAR_OFFSET` constant + subtraction | VERIFIED | `const MACOS_TITLE_BAR_OFFSET = 28` at line 55. Subtraction in dispatch payload at line 299. |
| `src/components/file-tree.tsx` | Context menu, delete flow, drag/drop, 2D hit-tests, `refreshTreePreservingState`, `delete-selected-tree-row` listener | VERIFIED | All components confirmed via grep: `triggerDeleteConfirm`, `InlineCreateRow`, `treeDrag`, 4 x-axis bounds sites, `refreshTreePreservingState`, `unlistenDelete`. |
| `src/components/file-tree.test.tsx` | Regression tests for x-axis geometry, tree state preservation, delete key (UAT Test 5) | VERIFIED | `describe('finder drop hit-test geometry')` at line 706. `describe('tree state preservation')` at line 832. `describe('delete key (UAT Test 5 fix)')` at line 150. All 38 tests pass. |
| `src/components/git-control-tab.tsx` | `handleRevertAll` per-file try/catch with summary toast | VERIFIED | `const failures: string[] = []`, inner `try/catch`, `successCount`, `totalAttempted` all confirmed. |
| `src/services/file-service.ts` | 6 new TS wrappers + `DetectedEditors` + git-status-changed on mutations | VERIFIED | `createFolder`, `copyPath`, `launchExternalEditor`, `openDefault`, `revealInFinder`, `detectEditors` all exported. `DetectedEditors` interface at line 24. 6 `emit('git-status-changed')` calls confirmed. |
| `src/services/file-service.test.ts` | Vitest cases for new wrappers | VERIFIED | `describe('createFolder')`, `describe('copyPath')`, `describe('launchExternalEditor')`, `describe('detectEditors')` confirmed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `file_ops.rs::create_folder` | `AppHandle.emit('git-status-changed')` | `app.emit("git-status-changed", ())` | VERIFIED | Confirmed in `file_ops.rs` (6 emit calls for mutation commands) |
| `lib.rs generate_handler!` | `file_ops` module | 7 new command references | VERIFIED | All 7 at lines 179-185 |
| `file-service.ts::createFolder` | `invoke('create_folder', { path })` | `@tauri-apps/api/core invoke` | VERIFIED | Confirmed at `file-service.ts:109` |
| `lib.rs Edit menu` | `file-tree.tsx delete flow` | MenuItem → `on_menu_event` → `app.emit('delete-selected-tree-row')` → `listen` → `triggerDeleteConfirm` | VERIFIED (programmatic) | Full chain confirmed by grep across 3 files |
| `main.tsx onDragDropEvent` | `tree-finder-drop CustomEvent` | DPR division + title-bar offset subtraction | VERIFIED | `MACOS_TITLE_BAR_OFFSET` in both declaration and usage |
| `file-tree.tsx handleFinderDrop hit-test` | Row resolution | `rect` 2D containment (left/right/top/bottom) | VERIFIED | `position.x >= rect.left` confirmed at Sites 3+4 |
| `git-status-changed listener` | `refreshTreePreservingState()` | Replaces bare `initTree()` call | VERIFIED | `void refreshTreePreservingState()` at line 809; bare `initTree()` no longer present in listener |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `file-tree.tsx` entries/treeNodes | `entries.value` / `treeNodes.value` | `invoke('list_directory', ...)` in `loadDir` / `initTree` | Yes — Rust `list_directory` reads actual filesystem | FLOWING |
| `git-control-tab.tsx` changedFiles | `changedFiles.value` | `invoke('get_git_files', ...)` in `refreshGitFiles` | Yes — `git_status.rs` `get_git_files` queries libgit2 | FLOWING |
| `file-service.ts` mutations | N/A (void returns) | `invoke` + `emit('git-status-changed')` | Yes — side-effectful commands confirmed by Rust test passes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Rust unit tests pass | `cd src-tauri && cargo test --lib` | 61 passed; 0 failed | PASS |
| All file-tree TS tests pass | `pnpm vitest run src/components/file-tree.test.tsx` | 38 passed; 0 failed | PASS |
| `create_file_rejects_existing` test | Included in cargo test | PASS | PASS |
| `revert_file_deletes_untracked` test | Included in cargo test | PASS | PASS |
| `revert_file_no_op_on_clean` test | Included in cargo test | PASS | PASS |
| finder drop hit-test geometry (3 new tests) | Included in vitest | PASS | PASS |
| tree state preservation (3 new tests) | Included in vitest | PASS | PASS |
| delete key UAT Test 5 fix (3 tests) | Included in vitest | PASS | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TREE-01 | 18-01, 18-03, 18-06, 18-08, 18-09 | Delete files/folders via context menu with confirmation dialog | SATISFIED | `triggerDeleteConfirm` → `showConfirmModal` → `deleteFile`. InlineCreateRow conflict now errors instead of overwriting (UAT Test 8). |
| TREE-02 | 18-03, 18-09 | Delete via Delete key with confirmation dialog | SATISFIED | `handleFlatKeydown`/`handleTreeKeydown` `'Delete'` case → `triggerDeleteConfirm`. Native Tauri MenuItem for Cmd+Backspace. Test assertion on `/permanently deleted/` passes. |
| TREE-03 | 18-01, 18-02, 18-04 | Open in external editor via context menu | SATISFIED | `detect_editors` IPC called on load; `launchExternalEditor` in submenu items. All 7 Rust commands registered. |
| TREE-04 | 18-05, 18-07 | Drag/drop within tree | SATISFIED | Mouse-drag pipeline + 2D hit-tests at Sites 1+2. `renameFile` on drop. Regression tests green. |
| TREE-05 | 18-02, 18-05, 18-07 | Drag from Finder to import | SATISFIED (programmatic) | `dragDropEnabled: true` in tauri.conf.json. `onDragDropEvent` with y-offset correction. x-axis bounds on Sites 3+4 make outside-container guard reachable. Human verification required for end-to-end. |
| MAIN-03 | 18-01, 18-03, 18-04, 18-06 | Create new file from folder context | SATISFIED | `InlineCreateRow` from context menu and header `[+]` button. `create_file_impl` now rejects existing names — the frontend error path is now reachable. |

No orphaned requirements: all 6 phase requirements (TREE-01..05, MAIN-03) are mapped to plans and verified.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/file-tree.tsx:707,726-727` | `placeholder` attributes on `<input>` | INFO | HTML input placeholder text — not a code stub. Legitimate use of `placeholder` HTML attribute. No action needed. |
| `src/components/file-tree.tsx:1186-1196, 1254-1261` | Dead `e.metaKey` branches in `handleFlatKeydown`/`handleTreeKeydown` | INFO (WR-02 from REVIEW.md) | After Plan 18-09 routes Cmd+Backspace through the native menu, these JS branches are unreachable on macOS. Dead code that could mislead maintainers. Not a blocker. |
| `src/components/file-tree.test.tsx:3` | Unused `screen` import | INFO (IN-04 from REVIEW.md) | Pre-existing; not introduced by Phase 18. Zero functional impact. |
| `src-tauri/src/git_ops.rs:501-507` | `remove_file` on WT_NEW path — fails for untracked directories | WARNING (WR-02 from REVIEW.md) | Will return an OS error (`Is a directory`) if user tries to revert an untracked folder. Fix: dispatch `remove_dir_all` vs `remove_file` based on metadata. |
| `src-tauri/src/lib.rs:54-59` + `src/components/file-tree.tsx:823-835` | `delete-selection` MenuItem enabled unconditionally — fires from any focus context | WARNING (WR-01 from REVIEW.md) | Cmd+Backspace in commit message textarea surfaces delete confirm modal. Requires focus-gate in the `delete-selected-tree-row` listener to restrict to file-tree focus. |
| `src/components/file-tree.tsx:240-280` | `refreshTreePreservingState` not guarded against concurrent invocations | WARNING (WR-03 from REVIEW.md) | Two rapid `git-status-changed` events can interleave; re-expansion state may be inconsistent. Fix: in-flight guard with trailing-edge coalesce. |

### Human Verification Required

#### 1. Cmd+Backspace — Delete Modal Surfaces (UAT Test 5)

**Test:** With the Efxmux app running and a project loaded, click the file tree to give it focus (verify a row is highlighted). Press Cmd+Backspace.
**Expected:** The delete confirmation modal appears with the message containing "permanently deleted" for the selected file or folder.
**Why human:** Native NSMenu accelerator behaviour requires a running macOS app with a real WKWebView; not testable in jsdom.

#### 2. Cmd+Backspace — No Spurious Modal from Text Inputs (WR-01)

**Test:** With the app running, open the Git Control tab and click inside the commit message textarea. Type some text. Press Cmd+Backspace (expected macOS behaviour: delete to start of line).
**Expected:** The textarea line is deleted as normal. NO delete confirmation modal appears for the file tree.
**Why human:** WR-01 (code review warning): the MenuItem accelerator is registered `enabled: true` unconditionally, so it currently fires from any focused context. If this test FAILS (modal appears), a focus-gate must be added to `file-tree.tsx`'s `delete-selected-tree-row` listener before the Cmd+Backspace feature can be considered fully safe.

#### 3. Revert on Untracked Directory (WR-02)

**Test:** Create a new folder in the file tree (right-click → New Folder). Go to the Git Control tab — the new folder should appear as an untracked entry. Click the per-file Revert button on that folder entry.
**Expected:** The folder is deleted from disk, the git sidebar refreshes, and no error toast appears.
**Why human:** WR-02 (code review): `revert_file_impl` calls `std::fs::remove_file` on WT_NEW entries, which succeeds for files but returns an OS error for directories. This test confirms whether the current build handles this case or surfaces an error.

#### 4. Finder Drop — Correct Row Targeting (UAT Test 16)

**Test:** In Finder, locate a file. Drag it from Finder and drop it precisely onto a specific folder row in the file tree (not the root). Release.
**Expected:** The file is copied into the folder that was highlighted at the moment of release — not the row above or below it.
**Why human:** The `MACOS_TITLE_BAR_OFFSET = 28` y-correction resolves the documented Tauri Issue #10744 coordinate mismatch. Confirmation requires a live Tauri app on macOS Sonoma/Sequoia.

#### 5. Finder Drop Outside Tree — Toast Fires, No Copy (UAT Test 17)

**Test:** Drag a file from Finder. Move the cursor over the terminal panel or any area outside the file tree container. Release.
**Expected:** "Drop target outside file tree" toast appears. No file is copied anywhere.
**Why human:** The x-axis hit-test fix makes the outside-container guard reachable for the first time. Confirmation with a live `DragDropEvent` coordinate payload is required to verify the fix works end-to-end.

### Gaps Summary

No blocking gaps found. All 6 roadmap Success Criteria map to verified implementation. Automated tests (38 TS + 61 Rust) pass cleanly.

Three code-review warnings exist that do NOT block the phase goal but should be addressed before or alongside Phase 21 (Bug Fix Sprint):

1. **WR-01 (WARNING):** Cmd+Backspace fires from all focus contexts. A focus-gate in the `delete-selected-tree-row` listener would prevent a surprising delete modal appearing while editing the commit textarea. This is a UX regression in the standard macOS text-editing shortcut. Recommend treating as part of the human verification gate — if Test 2 above fails, this becomes a gap.

2. **WR-02 (WARNING):** `revert_file_impl` fails for untracked directories. Fix is a 3-line dispatch on `metadata.is_dir()`. Recommend adding to Phase 21 backlog.

3. **WR-03 (WARNING):** `refreshTreePreservingState` is not re-entrant safe. Fix is an in-flight guard with trailing-edge coalesce. Low probability in practice but worth hardening before heavy use.

---

_Verified: 2026-04-17T06:17:19Z_
_Verifier: Claude (gsd-verifier)_
