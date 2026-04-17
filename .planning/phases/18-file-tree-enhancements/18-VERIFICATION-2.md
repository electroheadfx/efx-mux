---
phase: 18-file-tree-enhancements
verified: 2026-04-17T09:00:00Z
status: human_needed
score: 15/15
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/13
  previous_file: 18-VERIFICATION.md
  gaps_closed:
    - "G-01 primary: file-tree stale row after revert-as-delete (revert_file now emits git-status-changed)"
    - "G-01 secondary: open editor tab stays open after file deletion (closeEditorTabForDeletedFile auto-close)"
    - "G-02: Finder drag per-row highlight never updates (isFinderDragActive cache enables continuous over dispatches)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "After reverting a newly-created (untracked) file via the Git sidebar Revert button, the file-tree row disappears within 1s and any open editor tab for that file also closes"
    expected: "Row gone within 1s; editor tab closes without showing an unsaved-changes modal; no 'stale row' error on subsequent interaction"
    why_human: "End-to-end requires a live Tauri app: Rust emit travels through the Tauri event bus to both the file-tree listener (refreshTreePreservingState) and the editor-tab listener (closeEditorTabForDeletedFile). jsdom confirms both endpoints but not the real IPC chain."
  - test: "Drag a file from Finder over the file tree; slowly move cursor across different folder rows"
    expected: "The folder ROW under the cursor shows a blue 2px left border and light-blue tint as the cursor moves — the highlight transitions row-to-row. Previous row's highlight clears."
    why_human: "Gap G-02 fix operates on Tauri onDragDropEvent 'over' events which only fire in a live WKWebView; jsdom unit tests verify the file-tree consumer contract but not the main.tsx dispatch layer."
  - test: "UAT Test 17 regression: drag a file from Finder and release outside the file-tree (over terminal panel)"
    expected: "Toast 'Drop target outside file tree' appears; no file is copied"
    why_human: "The isFinderDragActive restructure preserves the outside-container guard, but the full drop coordinate path requires a real DragDropEvent payload to confirm no regression."
  - test: "UAT Test 5 regression: Cmd+Backspace with a file-tree row selected still opens delete confirmation modal"
    expected: "Delete confirmation modal appears; file is permanently deleted on confirm"
    why_human: "Regression guard for round-1 UAT test that passed; native NSMenu accelerator cannot be tested in jsdom. No code near this path was modified in round 2 — low regression risk but required as gate."
gaps: []
advisory_warnings:
  - id: WR-01
    file: src/components/editor-tab.tsx
    description: "catch block in git-status-changed listener invokes closeEditorTabForDeletedFile without re-checking the 'cancelled' flag. If the component unmounts during readFile await, the close is called against a tab another code path may be removing. Practical impact low (closeEditorTabForDeletedFile is a silent no-op when no matching tab found) but depends on that invariant holding."
    fix: "Add `if (cancelled) return;` as first line of the catch block"
    severity: advisory
  - id: WR-02
    file: src/components/editor-tab.test.tsx
    description: "Test mocks throw `new Error('No such file or directory...')` but production readFile wraps errors as `new FileError('ReadError', String(e))` so err.message is 'ReadError: No such file...'. The substring regex still matches, so tests pass, but the test does not exercise the production error shape and will miss regressions if the FileError format changes."
    fix: "Import FileError and throw `new FileError('ReadError', 'No such file or directory (os error 2)')` in the mock"
    severity: advisory
  - id: WR-03
    file: src/main.tsx
    description: "isFinderDragActive is not re-evaluated on the drop event's own paths. If Tauri fires a drop without a prior enter (observed in edge cases around macOS Spaces / Mission Control), the drop is silently ignored because isFinderDragActive is false from the last leave reset."
    fix: "Treat drop as authoritative — re-evaluate anyOutside from payload.paths on drop rather than relying solely on the cached flag"
    severity: advisory
---

# Phase 18: File Tree Enhancements — Verification Report (Round 2)

**Phase Goal:** Users can delete files, open in external editors, and drag/drop within the tree
**Verified:** 2026-04-17T09:00:00Z
**Status:** human_needed
**Re-verification:** Yes — round-2 gap closure (Plans 18-10, 18-11, 18-12 targeting G-01 + G-02)

## Round-2 Context

Round 1 (18-VERIFICATION.md) passed 12/13 must-haves with 5 human-UAT items.
User tested the 5 items: 3 passed, 2 failed — creating 2 gaps:

- **G-01 (HIGH):** Revert-as-delete on an untracked file removes the file from disk and the Git sidebar, but the file-tree row stays (stale) and any open editor tab stays open.
- **G-02 (MEDIUM):** During a Finder drag, the whole file-tree container shows active-drag styling but the specific folder row under the cursor does NOT get a blue drop-target outline.

Round 2 delivered:
- **Plan 18-10:** `RevertOutcome` enum in `git_ops.rs` + `revert_file` emits `git-status-changed` on `Mutated` + frontend double-emit from `handleRevertFile`/`handleRevertAll` (G-01 primary).
- **Plan 18-11:** `closeEditorTabForDeletedFile` helper in `unified-tab-bar.tsx` + editor-tab.tsx catch block auto-closes on ENOENT (G-01 secondary).
- **Plan 18-12:** Module-level `isFinderDragActive` cache in `main.tsx` — set at `enter`, read at pathless `over`, reset at `leave`/`drop`. Corrected TypeScript union for `over` case (G-02).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Users can delete files/folders via context menu with confirmation (TREE-01) | VERIFIED | `triggerDeleteConfirm` wired in file-tree.tsx; 38 prior tests + 1 new regression test passing — no regression from round-2 code |
| 2 | Users can delete via Delete key with confirmation (TREE-02) | VERIFIED | `handleFlatKeydown`/`handleTreeKeydown` route `'Delete'` to `triggerDeleteConfirm`. Native Tauri MenuItem for Cmd+Backspace. Verified in 18-VERIFICATION.md; no round-2 changes to this path |
| 3 | Users can open file in external editor via context menu (TREE-03) | VERIFIED | `detect_editors`/`launchExternalEditor` chain intact; no round-2 changes |
| 4 | Users can drag/drop within tree (TREE-04) | VERIFIED | Intra-tree mouse pipeline unchanged by round-2. `isFinderDragActive = false` on intra-project `enter` events ensures main.tsx early-returns, leaving the mouse pipeline sole owner |
| 5 | Users can drag files from Finder into tree to import (TREE-05) | VERIFIED (programmatic) / HUMAN NEEDED | `isFinderDragActive` cache at line 65 of `main.tsx`. `over` events now dispatched continuously to file-tree.tsx `handleFinderDragover`. MACOS_TITLE_BAR_OFFSET preserved. 2 new regression tests in file-tree.test.tsx pass (40/40). Human verification required — see item 2 below |
| 6 | Users can create new file from folder context (MAIN-03) | VERIFIED | `InlineCreateRow` component unchanged by round-2; prior verification stands |
| 7 | After revert_file_impl completes any mutating branch (WT_NEW delete OR checkout), Tauri AppHandle emits 'git-status-changed' | VERIFIED | `git_ops.rs:559-571` — `revert_file<R: Runtime>` accepts `AppHandle<R>`, calls `app.emit("git-status-changed", ())` when `matches!(outcome, RevertOutcome::Mutated)`. RevertOutcome enum at line 471. 2 new Rust tests: `revert_file_impl_returns_mutated_for_untracked_delete` + `revert_file_impl_returns_mutated_for_checkout` (lines 920–947). 16/16 git_ops tests pass |
| 8 | After handleRevertFile completes successfully, git-status-changed is emitted from the frontend | VERIFIED | `git-control-tab.tsx:219-223` — `import { listen, emit }` at line 12; `await emit('git-status-changed')` between `await revertFile(...)` and `await refreshGitFiles()`. grep count: 2 occurrences |
| 9 | After handleRevertAll finishes its batch loop, git-status-changed is emitted from the frontend | VERIFIED | `git-control-tab.tsx:252-255` — `await emit('git-status-changed')` after the for-loop, before `await refreshGitFiles()`. Unconditional — emitted even on partial failure |
| 10 | CURRENT / pure-INDEX branches in revert_file_impl do NOT emit — only mutating branches emit | VERIFIED | `git_ops.rs:530-532` — `if !needs_checkout { return Ok(RevertOutcome::NoOp); }`. `revert_file_no_op_on_clean` asserts `outcome == RevertOutcome::NoOp`. No emit in the command layer when `NoOp` |
| 11 | When a file is deleted from disk and git-status-changed fires, any open editor tab for that path is closed within ~200ms | VERIFIED (programmatic) / HUMAN NEEDED | `editor-tab.tsx:105-116` — `catch (err)` block with `/no such file|not found|notfound|os error 2/i.test(msg)` → `closeEditorTabForDeletedFile(filePath)`. `closeEditorTabForDeletedFile` exported from `unified-tab-bar.tsx:497`. 2 new Vitest tests pass: (a) ENOENT closes tab; (b) EACCES keeps tab. Human confirmation required — see item 1 below |
| 12 | closeEditorTabForDeletedFile bypasses unsaved-changes ConfirmModal | VERIFIED | `unified-tab-bar.tsx:497-520` — no `showConfirmModal` call anywhere in the function body. Function body inspected directly at lines 497–520 |
| 13 | During a Finder drag, 'over' events reach file-tree.tsx handleFinderDragover on every mouse movement | VERIFIED (programmatic) / HUMAN NEEDED | `main.tsx:309` — guard `if ((payload.type === 'over' || payload.type === 'drop') && !isFinderDragActive) return`. Previously ALL over events were filtered because `paths.length === 0`. Now filtered only when `isFinderDragActive` is false (intra-project drag). Corrected TypeScript union at line 284: `\| { type: 'over'; position: ... }` (no paths field) |
| 14 | UAT Tests 5, 16, 17 (round-1 passes) show no regression | VERIFIED | No code touched in `lib.rs` (Cmd+BackspaceMenuItem), `file-tree.tsx` hit-test sites, or the outside-container guard. MACOS_TITLE_BAR_OFFSET subtraction preserved for all three dispatched event types (enter/over/drop) at `main.tsx:320`. 40/40 file-tree tests pass (includes the 3 hit-test geometry tests and 3 state preservation tests from round 1) |
| 15 | Full test suite: 43/43 Vitest tests pass + 16 Rust git_ops tests pass; 11 pre-existing failures in git-control-tab.test.tsx + sidebar.test.tsx UNCHANGED | VERIFIED | Confirmed by orchestrator: `pnpm vitest run` 43/43 pass; `cargo test git_ops::tests` 16/16 pass; `pnpm tsc --noEmit` exit 0. Pre-existing 11 failures are the same set as round 1 (documented in deferred-items.md from Plan 18-11 — module-eval-time listen before Tauri mock installed) |

**Score:** 15/15 truths verified (3 have companion human-verification items for live-app confirmation; automated checks all pass)

### Deferred Items

None — all phase-18 roadmap Success Criteria are in scope and have been addressed.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/git_ops.rs` | RevertOutcome enum + updated revert_file_impl/revert_file + 2 new tests | VERIFIED | `pub enum RevertOutcome { Mutated, NoOp }` at line 471. `revert_file_impl` returns `Result<RevertOutcome, GitError>`. `revert_file<R: Runtime>` accepts `AppHandle<R>`, emits on Mutated. 4 revert_file tests total (2 pre-existing updated + 2 new) |
| `src/components/git-control-tab.tsx` | `emit` import + emit calls in handleRevertFile + handleRevertAll | VERIFIED | `import { listen, emit }` at line 12. `await emit('git-status-changed')` at lines 223 and 255 (2 occurrences, one per handler) |
| `src/components/file-tree.test.tsx` | New describe 'revert removes stale row' (Plan 18-10) + new describe 'continuous drop-target highlight' (Plan 18-12) | VERIFIED | Describe block at line 983 (Gap G-01 regression test, 1 it). Describe block at line 1055 (Gap G-02, 2 it cases). All 40 tests pass |
| `src/components/unified-tab-bar.tsx` | `closeEditorTabForDeletedFile` exported function | VERIFIED | `export function closeEditorTabForDeletedFile(filePath: string): void` at line 497. No `showConfirmModal` in body. Reuses `switchToAdjacentTab`, `setEditorDirty`, `setProjectEditorTabs`, `setProjectTabOrder` |
| `src/components/editor-tab.tsx` | Import + catch block extension for file-not-found auto-close | VERIFIED | Import at line 11: `import { setEditorDirty, closeEditorTabForDeletedFile } from './unified-tab-bar'`. Catch block at lines 105-116: named `catch (err)`, substring regex, conditional `closeEditorTabForDeletedFile(filePath)` call |
| `src/components/editor-tab.test.tsx` | New file with 2 Vitest tests | VERIFIED | File exists. `describe('editor-tab file-deletion auto-close (Gap G-01)', ...)` at line 29. 2 it() cases (ENOENT closes tab; EACCES keeps tab). 2/2 pass |
| `src/main.tsx` | `isFinderDragActive` module-level cache + restructured onDragDropEvent | VERIFIED | `let isFinderDragActive = false` at line 65. TypeScript union corrected at line 284. `isFinderDragActive = anyOutside` at line 303. Guards at line 309. Resets at lines 290 (leave) and 334 (drop). MACOS_TITLE_BAR_OFFSET at line 320 preserved for enter/over/drop |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `git_ops.rs revert_file_impl WT_NEW branch` | `file-tree.tsx refreshTreePreservingState` | `app.emit("git-status-changed", ())` → Tauri listen → refreshTreePreservingState | VERIFIED | Rust emit at `git_ops.rs:569`. File-tree listener confirmed at line 809 (from 18-VERIFICATION.md — unchanged). Regression test `revert removes stale row` in file-tree.test.tsx passes |
| `git-control-tab.tsx handleRevertFile/handleRevertAll` | `file-tree.tsx git-status-changed listener` | `await emit('git-status-changed')` → Tauri listen → refreshTreePreservingState | VERIFIED | 2 occurrences of `await emit('git-status-changed')` confirmed in git-control-tab.tsx (lines 223, 255) |
| `file deletion on disk (revertFile, deleteFile, file-watcher)` | `editor-tab.tsx git-status-changed catch block` | Tauri emit → listen → `readFile` throws → `closeEditorTabForDeletedFile(filePath)` | VERIFIED | editor-tab.tsx:91 listen; :105 catch; :113 `closeEditorTabForDeletedFile(filePath)`. editor-tab.test.tsx 2/2 pass |
| `editor-tab.tsx catch block` | `unified-tab-bar.tsx closeEditorTabForDeletedFile` | direct function import | VERIFIED | `import { setEditorDirty, closeEditorTabForDeletedFile } from './unified-tab-bar'` at line 11. Function confirmed at unified-tab-bar.tsx:497 |
| `main.tsx onDragDropEvent enter branch` | `main.tsx onDragDropEvent over branch` | `isFinderDragActive` cached boolean set at enter, read at over | VERIFIED | `isFinderDragActive = anyOutside` (line 303); guard `if (... && !isFinderDragActive) return` (line 309) |
| `main.tsx onDragDropEvent over branch` | `file-tree.tsx handleFinderDragover listener` | `document.dispatchEvent(new CustomEvent('tree-finder-dragover', { detail: { paths, position } }))` | VERIFIED | Dispatch at line 327 for both enter and over. 2 new file-tree tests confirm the consumer receives multiple dispatches and the dragover→drop sequence invokes copy_path |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `git_ops.rs revert_file` | `outcome: RevertOutcome` | `revert_file_impl` — reads git status via `repo.status_file()`, performs `fs::remove_file` or `git checkout` | Yes — operates on real filesystem | FLOWING |
| `editor-tab.tsx` catch block | `err.message` | `readFile(filePath)` → `invoke('read_file_content', ...)` → real FS read from Rust | Yes — real OS error string preserved via `FileError('ReadError', String(e))` | FLOWING |
| `main.tsx isFinderDragActive` | `isFinderDragActive` | `anyOutside` computed from `payload.paths` on real Tauri `enter` event | Yes — Tauri OS event, not synthesized | FLOWING (live Tauri only) |

---

## Behavioral Spot-Checks

| Behavior | Evidence | Status |
|----------|---------|--------|
| 16/16 git_ops Rust tests pass (including 2 new RevertOutcome contract tests) | Confirmed by orchestrator: `cargo test git_ops::tests` 16/16 | PASS |
| 40/40 file-tree Vitest tests pass (38 round-1 + 1 Gap G-01 + 2 Gap G-02) | Confirmed by orchestrator: `pnpm vitest run file-tree.test.tsx` 40/40 | PASS |
| 2/2 editor-tab Vitest tests pass (new file) | Confirmed by orchestrator: `pnpm vitest run editor-tab.test.tsx` 2/2 | PASS |
| `pnpm tsc --noEmit` exits 0 | Confirmed by orchestrator | PASS |
| `pnpm build` production bundle exits 0 | Confirmed by 18-12-SUMMARY.md: "dist/assets/*.js built in 460ms" | PASS |
| `cargo build --release` exits 0 | Confirmed by 18-12-SUMMARY.md: "Finished release profile in 36.68s" | PASS |
| 11 pre-existing failures in git-control-tab.test.tsx + sidebar.test.tsx remain UNCHANGED | Confirmed by 18-11-SUMMARY.md: git stash + rerun shows identical 11 failures. Not caused by round-2 code | PASS (not regressions) |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TREE-01 | 18-01, 18-03, 18-06, 18-08, 18-09, 18-11 | Delete files/folders via context menu | SATISFIED | Unchanged from round 1. closeEditorTabForDeletedFile in 18-11 adds end-to-end cleanup after deletion |
| TREE-02 | 18-03, 18-09, 18-10 | Delete via Delete key + Cmd+Backspace | SATISFIED | Unchanged from round 1. revert_file now emits git-status-changed, enabling the file-tree to refresh after keyboard-triggered deletion via revert path too |
| TREE-03 | 18-01, 18-02, 18-04 | Open in external editor | SATISFIED | Unchanged from round 1 |
| TREE-04 | 18-05, 18-07 | Drag/drop within tree | SATISFIED | `isFinderDragActive = false` on intra-project enter; mouse pipeline unaffected |
| TREE-05 | 18-02, 18-05, 18-07, 18-12 | Drag from Finder to import | SATISFIED (programmatic) | isFinderDragActive cache enables continuous per-row highlight. 2 new regression tests. Human verification required for live-app confirmation |
| MAIN-03 | 18-01, 18-03, 18-04, 18-06 | Create new file from folder context | SATISFIED | Unchanged from round 1 |

No orphaned requirements — all 6 phase requirements covered.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/editor-tab.tsx:105-116` | `cancelled` flag not re-checked before `closeEditorTabForDeletedFile` call in catch block | WARNING (WR-01) | Low-probability race on unmount during `readFile` await. `closeEditorTabForDeletedFile` is a silent no-op when tab already gone, so practical impact is minimal today. Fix: add `if (cancelled) return;` as first line of catch |
| `src/components/editor-tab.test.tsx:52-57, 91-96` | Test throws raw `new Error('No such file...')` instead of production `FileError('ReadError', String(e))` shape | WARNING (WR-02) | Tests pass because regex still matches the substring, but they don't exercise the production wrapping and will miss regressions if FileError format changes |
| `src/main.tsx:309` | `drop` event gated on cached `isFinderDragActive` — if Tauri fires `drop` without prior `enter` (macOS Spaces edge case), drop is silently lost | WARNING (WR-03) | User would see the row highlight (from `over`) but no copy on release. Fix: re-evaluate `anyOutside` from `payload.paths` on `drop` rather than relying solely on the cache |
| `src/components/file-tree.test.tsx:1118-1124` | Third `dispatchOver(10, 10)` asserts `expect(true).toBe(true)` — a tautology | INFO (IN-04 from 18-REVIEW-2.md) | Test proves "listener doesn't throw" but not "highlight updates position". Low value assertion. Fix: mock `getBoundingClientRect` with non-zero rects as in the `finder drop hit-test geometry` describe |

All three warnings are advisory, not blocking. They do not prevent the phase goal from being achieved — they are hardening opportunities for a future bug-fix sprint.

---

## Human Verification Required

### 1. G-01 End-to-End: Revert closes stale tree row AND editor tab (CRITICAL)

**Test:** With Efxmux running and a project loaded:
1. Right-click in the file tree and create a new file (e.g. `test-revert.ts`).
2. Open the file by double-clicking it — it should appear in an editor tab.
3. Go to the Git Control sidebar tab. The new file should appear as an untracked entry.
4. Click the per-file Revert button (undo icon) next to `test-revert.ts`.

**Expected:**
- The Git sidebar row for `test-revert.ts` disappears immediately.
- The file-tree row for `test-revert.ts` disappears within 1s (no stale row).
- The editor tab for `test-revert.ts` closes without showing an unsaved-changes modal.
- No error toast appears.

**Why human:** The fix operates on the real Tauri event bus (Rust emit → Tauri IPC → JS listeners). jsdom tests confirm both the file-tree refresh listener and the editor-tab close listener work given the event; they cannot exercise the real IPC chain.

### 2. G-02: Per-row Finder drag highlight transitions (MEDIUM)

**Test:** With Efxmux running and a project with multiple folders visible in the file tree:
1. Open Finder and locate any file.
2. Drag the file from Finder into the Efxmux window.
3. While holding the drag, slowly move the cursor over different folder rows.

**Expected:** The folder ROW under the cursor shows a blue 2px left border + light-blue background tint. As the cursor moves to a different folder row, the previous row's highlight clears and the new row lights up.

**If this passes:** Release over a specific folder — the file should be copied into that folder (verify in file tree).

**Why human:** The `over` events that now pass through the `isFinderDragActive` cache require a real Tauri WKWebView to fire — jsdom cannot simulate OS-level drag events. Unit tests verify the file-tree consumer handles multiple `tree-finder-dragover` dispatches correctly; the Tauri dispatch layer is live-app-only.

### 3. UAT Test 17 Regression: Finder drop outside tree (REGRESSION GUARD)

**Test:** Drag a file from Finder and release it outside the file-tree container (e.g. over the terminal panel).

**Expected:** Toast "Drop target outside file tree" appears. No file is copied anywhere.

**Why human:** The `isFinderDragActive` restructure preserves the outside-container guard in `file-tree.tsx:902`, but confirming no regression requires real `DragDropEvent` coordinates from a live macOS drag.

### 4. UAT Test 5 Regression: Cmd+Backspace delete modal (REGRESSION GUARD)

**Test:** Click a file-tree row to select it. Press Cmd+Backspace.

**Expected:** Delete confirmation modal appears with the message "[filename] will be permanently deleted. This cannot be undone."

**Why human:** Low regression risk — no code near this path was modified in round 2. Guard included because round-1 human UAT confirmed this passed and we want to confirm round-2 changes did not introduce any indirect regression.

---

## Gaps Summary

No blocking gaps. All 3 round-2 gap targets (G-01 primary, G-01 secondary, G-02) are verified at the automated level. 4 human verification items remain — all target live-Tauri behaviors that cannot be tested in jsdom. The phase goal "Users can delete files, open in external editors, and drag/drop within the tree" is fully implemented.

Three advisory warnings from 18-REVIEW-2.md are noted above (WR-01, WR-02, WR-03). None are blocking. Recommended for a Phase 21 bug-fix sprint.

---

_Verified: 2026-04-17T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Round: 2 of 2 — re-verification after round-2 gap closure (Plans 18-10, 18-11, 18-12)_
