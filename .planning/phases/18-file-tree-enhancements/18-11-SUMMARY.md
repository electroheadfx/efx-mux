---
phase: 18-file-tree-enhancements
plan: 11
subsystem: editor
tags: [preact, frontend, editor, tauri, gap-closure, human-uat, tab-cleanup]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-10 revert_file emits git-status-changed — without that emit, the editor-tab listener never fires after revert and the secondary symptom of G-01 cannot be observed/triggered"
  - phase: 18-file-tree-enhancements
    provides: "Plan 15 file-service.ts FileError wrapper (readFile throws FileError with String(e) preserving macOS FS error text) — the substring match in editor-tab's catch relies on 'No such file' surviving the wrapper intact"
  - phase: 18-file-tree-enhancements
    provides: "Plan 02 unified-tab-bar.tsx closeUnifiedTab + switchToAdjacentTab + setProjectEditorTabs / setProjectTabOrder / setEditorDirty helpers — the primitives reused by closeEditorTabForDeletedFile"
provides:
  - "closeEditorTabForDeletedFile(filePath: string): void exported from src/components/unified-tab-bar.tsx — tab-removal helper that bypasses the unsaved-changes ConfirmModal (since the file is gone and saving is impossible)"
  - "editor-tab.tsx git-status-changed catch block now branches on error-message substring match (/no such file|not found|notfound|os error 2/i). File-not-found → closeEditorTabForDeletedFile; other errors → preserved silent-ignore behavior"
  - "Pattern: bypass-confirm-modal for deletion-driven tab removal (distinct from user-initiated close). Future file-ops-driven tab invalidation (e.g., rename, move-out-of-project) can reuse the same pattern"
  - "editor-tab.test.tsx with 2 new Vitest cases pinning the auto-close contract for both the file-not-found case and the transient-error case"
affects: [future tab-invalidation patterns, future file-ops that need to invalidate open editor views]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Substring-regex error detection at the IPC boundary: when FileError wraps a Rust/macOS error verbatim via String(e), the frontend consumer can pattern-match on the error text. Brittle to error-message format changes but adequate for macOS ENOENT ('No such file or directory (os error 2)'). A structured error-code field (e.g., err.code === 'NotFound') would be a cleaner long-term contract"
    - "Bypass-confirm-modal tab removal: when the backing resource for a tab is gone (deleted file), the standard user-initiated-close flow (which surfaces a ConfirmModal for dirty state) is meaningless and actively harmful — saving is impossible, so the modal would wedge the UI. closeEditorTabForDeletedFile mirrors the closeUnifiedTab NON-dirty branch but skips the dirty-check entirely, additionally clearing dirty=false before removal to keep persistence clean"
    - "Multi-tab-per-file safety: editorTabs.value.filter(t => t.filePath === filePath) covers the edge case where the same file is opened in both a pinned and an unpinned tab (pin toggle leaves the old tab, D-03 preview). The helper removes ALL matching tabs in one pass rather than iterating one-at-a-time"

key-files:
  created:
    - "src/components/editor-tab.test.tsx — new Vitest file (114 LOC). Module-level vi.mock of @tauri-apps/api/event captures the git-status-changed listener (Plan 18-08 pattern). Two it() cases under a single describe. Case 1 seeds a foo.ts editor tab, mocks read_file_content to throw 'No such file or directory (os error 2)', invokes the captured listener, asserts the tab is removed from editorTabs.value. Case 2 does the same for bar.ts with a 'Permission denied (os error 13)' error and asserts the tab REMAINS (regex does not match)."
    - ".planning/phases/18-file-tree-enhancements/deferred-items.md — logs 11 pre-existing test failures in sidebar.test.tsx + git-control-tab.test.tsx that are NOT caused by 18-11 (confirmed via git stash + rerun). Recommends a dedicated test-infra-hardening plan to fix them. Out of scope for 18-11."
  modified:
    - "src/components/unified-tab-bar.tsx — +36 LOC. New export `closeEditorTabForDeletedFile(filePath: string): void` inserted between closeUnifiedTab (ends line 484) and setEditorDirty (line 540 after insertion). Uses editorTabs.value.filter for exact-match selection, switchToAdjacentTab for active-tab transfer, setEditorDirty(tab.id, false) per match to clear dirty state, and setProjectEditorTabs + setProjectTabOrder to remove. Silent no-op when no match. No showConfirmModal call."
    - "src/components/editor-tab.tsx — +10 / -3 LOC. Import at line 11 extended: `import { setEditorDirty, closeEditorTabForDeletedFile } from './unified-tab-bar'`. Catch block at lines 105-107 (previously `catch { /* ignore */ }`) replaced with a named `catch (err)` that extracts `err instanceof Error ? err.message : String(err)`, runs the /no such file|not found|notfound|os error 2/i regex, and invokes closeEditorTabForDeletedFile(filePath) on match. Other errors preserve the silent-ignore behavior."

key-decisions:
  - "Substring regex match (/no such file|not found|notfound|os error 2/i) over a structured err.code field: minimal change, no Rust-side refactor, adequate for the macOS ENOENT case (FileError wraps the Rust error verbatim via String(e) preserving the substring). Structured error codes would require plumbing FileError.code through readFile at a minimum, deferred to a future refactor"
  - "closeEditorTabForDeletedFile is a NEW function (not a parameter on closeUnifiedTab) because the control flow is fundamentally different: no ConfirmModal, no dirty-state gate, multi-tab-per-file removal. Overloading closeUnifiedTab with a `{ skipConfirmModal: true }` flag would blur the abstraction"
  - "Clear dirty via setEditorDirty(tab.id, false) BEFORE removing the tab: prevents the persist-subscriber (editorTabs.subscribe) from serializing a dirty=true entry for a deleted file. This is harmless in the current persistence code (which only persists filePath, fileName, pinned, displayName) but defensive against future dirty-persistence changes"
  - "switchToAdjacentTab before removal (not after): switchToAdjacentTab reads getOrderedTabs() which filters against allTabs.value. If we removed first, the tab would be gone and adjacent-tab calculation would be wrong. Matches the existing closeUnifiedTab pattern (see lines 425-428, 465-471)"
  - "Multi-tab-per-file: use Set<string> of matching IDs and filter both editorTabs and tabOrder in a single pass. Simpler than iterating per-tab and handles the (rare but possible) case of two tabs pointing at the same file"
  - "Test file creation over vitest config tweaks: editor-tab.test.tsx uses the same vi.mock('@tauri-apps/api/event') pattern Plan 18-08 established in file-tree.test.tsx (module-level listener capture). No shared test fixture module was introduced; the pattern is small enough to duplicate"
  - "Task 2 was a verification-only no-op: readFile in file-service.ts (lines 94-100) already wraps invoke in try/catch and throws `new FileError('ReadError', String(e))`. String(e) preserves 'No such file' from the macOS FS error. No file changes needed; no commit produced for Task 2"

patterns-established:
  - "Pattern: when an IPC-wrapped function can fail with a predictable FS error, the frontend consumer may substring-match on err.message (provided the wrapper preserves the original error text via String(e)). Not a replacement for structured error codes but a pragmatic minimum-change strategy for macOS-only apps. See editor-tab.tsx:111-113"
  - "Pattern: tab removal for vanished backing resources BYPASSES the user-confirm-modal. closeEditorTabForDeletedFile is the template — future additions (e.g., close-tab-when-project-removed, close-tab-when-file-moved-out-of-project) should follow the same control flow: exact-match select → active-tab transfer → clear dirty → remove from editorTabs + tabOrder"
  - "Pattern: Plan 18-08-style listener capture via vi.mock at the module scope of a test file, re-used for Gap G-01 in editor-tab.test.tsx. This pattern is now used in both file-tree.test.tsx (18-08, 18-10, 18-12) and editor-tab.test.tsx (18-11). Future Tauri event-driven tests should continue to use this pattern"

requirements-completed: [TREE-01, TREE-02]

# Metrics
duration: 4min
completed: 2026-04-17
---

# Phase 18 Plan 11: Auto-close Editor Tab on File-Not-Found (Gap G-01 Secondary) Summary

**New closeEditorTabForDeletedFile helper in unified-tab-bar.tsx + extended editor-tab.tsx git-status-changed catch block to detect file-not-found and invoke the helper — closes the HIGH-severity Gap G-01 secondary symptom ("editor tab stays open pointing at a deleted file"). Works in tandem with Plan 18-10 (which makes revert_file emit git-status-changed) to deliver end-to-end closure of G-01.**

## Performance

- **Duration:** 3 min 55 s
- **Started:** 2026-04-17T08:29:06Z
- **Completed:** 2026-04-17T08:33:01Z
- **Tasks:** 3 (Task 2 was a verification-only no-op — no file changes)
- **Files modified:** 2
- **Files created:** 2 (test + deferred-items.md)

## Accomplishments

- **Gap G-01 secondary symptom closed:** when a file is deleted from disk (via revert, Delete key, context menu, or any other file-ops path that emits git-status-changed), an open editor tab pointing at that file now auto-closes within ~200 ms. No stale editor views, no ghost save attempts against a vanished path, no ConfirmModal wedging the UI for a file that cannot be saved.
- **Multi-tab-per-file edge case handled:** closeEditorTabForDeletedFile removes ALL editor tabs matching the deleted filePath (the pinned + unpinned co-existence case can occur when pin-toggling a preview tab). Uses a single-pass Set<string> filter for both editorTabs.value and tabOrder.value.
- **Transient error robustness:** permission-denied / I/O errors (non-ENOENT) do NOT trigger auto-close — the regex /no such file|not found|notfound|os error 2/i is ENOENT-specific, and all other errors fall through to the pre-existing silent-ignore path so the listener retries on the next emit.
- **Dirty-state cleared before removal:** setEditorDirty(tab.id, false) is called for each matching tab before removal, preventing the persist-subscriber from saving a dirty=true entry pointing at a deleted file.
- **Test coverage:** 2 new Vitest cases in editor-tab.test.tsx (new file) pin both the file-not-found-closes-tab contract and the transient-error-preserves-tab contract. Test suite uses the Plan 18-08 listener-capture pattern via vi.mock at module scope.

## Task Commits

1. **Task 1: add closeEditorTabForDeletedFile to unified-tab-bar** — `f26da2d` (feat)
2. **Task 2: verify readFile error shape** — no commit (verification-only; readFile already matches the required pattern per file-service.ts:94-100, which throws `new FileError('ReadError', String(e))` preserving the FS error text)
3. **Task 3: auto-close editor tab on file-not-found in git-status-changed** — `2ecc9b7` (feat, includes both implementation + tests + deferred-items.md)

## Files Created/Modified

- `src/components/unified-tab-bar.tsx` — +36 LOC (no deletions). Inserted `export function closeEditorTabForDeletedFile(filePath: string): void` between `closeUnifiedTab` (ends line 484 in the pre-Plan-11 file) and `setEditorDirty` (line 489 pre-, line 540 post-). Function body: exact-match filter on editorTabs.value, switchToAdjacentTab(activeId) if any match is the active tab, setEditorDirty(tab.id, false) per match, then setProjectEditorTabs + setProjectTabOrder to remove. Silent no-op when no match. No showConfirmModal reference anywhere in the new function.
- `src/components/editor-tab.tsx` — +10 / -3 LOC. Line 11 import extended: `import { setEditorDirty, closeEditorTabForDeletedFile } from './unified-tab-bar'`. Catch block at the git-status-changed useEffect (pre-Plan-11 lines 105-107) replaced with a named `catch (err)` that runs the substring regex against err.message (or String(err)) and calls closeEditorTabForDeletedFile(filePath) on match. Other errors preserve the silent-ignore behavior.
- `src/components/editor-tab.test.tsx` — new file, 114 LOC. Two it() cases under `describe('editor-tab file-deletion auto-close (Gap G-01)', ...)`. Uses the Plan 18-08 module-level listener-capture pattern. Case 1: seed foo.ts tab → mockIPC throws ENOENT → invoke captured listener → assert foo.ts tab gone. Case 2: seed bar.ts tab → mockIPC throws EACCES (not ENOENT) → invoke captured listener → assert bar.ts tab REMAINS.
- `.planning/phases/18-file-tree-enhancements/deferred-items.md` — new file documenting 11 pre-existing test failures in sidebar.test.tsx + git-control-tab.test.tsx that surfaced during the full-suite run. Confirmed pre-existing via `git stash + rerun`. Not caused by 18-11. Recommends a dedicated test-infra-hardening plan to address (the root cause appears to be module-evaluation-time `listen('pty-exited', ...)` in terminal-tabs.tsx firing before the jsdom Tauri mock is installed for those test files — out of scope for 18-11).

## Decisions Made

- **Substring regex for error detection** — not an enum, not a structured error code. Minimal change, no Rust-side refactor. `FileError` already preserves `String(e)` which includes the macOS FS error text verbatim. The regex `/no such file|not found|notfound|os error 2/i` covers macOS ENOENT formats, is case-insensitive, and leaves room for future error-text variations without being over-specific.
- **Bypass-confirm-modal as a separate function** — closeEditorTabForDeletedFile is a NEW export, not an option flag on closeUnifiedTab, because the control flow is fundamentally different: no ConfirmModal, no dirty gate, multi-tab-per-file removal. Overloading closeUnifiedTab with `{ skipConfirmModal: true }` would blur the abstraction — the NAME of closeEditorTabForDeletedFile communicates intent.
- **Clear dirty before remove** — `setEditorDirty(tab.id, false)` is called per matching tab BEFORE the filter-and-remove step. Harmless in the current persistence code (which only serializes filePath, fileName, pinned, displayName) but defensive against future dirty-persistence additions.
- **switchToAdjacentTab before removal** — mirrors the existing closeUnifiedTab pattern (the comment there explicitly notes "switchToAdjacentTab reads getOrderedTabs() which needs the tab still present"). Removing first would make switch-to-adjacent find nothing and the user would be left on an empty main pane.
- **Multi-tab-per-file with Set<string>** — `const matchingIds = new Set(matching.map(t => t.id))` + `.filter(t => !matchingIds.has(t.id))` handles the (rare but possible) pinned+unpinned co-existence case in one pass. Simpler than iterating per tab.
- **Task 2 as verification-only** — readFile in file-service.ts already throws `new FileError('ReadError', String(e))`. String(e) preserves the Rust/macOS error text verbatim, which for ENOENT contains "No such file or directory (os error 2)". All acceptance criteria for Task 2 are met WITHOUT any file changes, so Task 2 produced no commit.

## Deviations from Plan

None — plan executed exactly as written. Task 2 was a verification-only no-op per the plan's explicit Step 2: "If it matches this pattern (FileError with String(e) preserving the original error text), **DO NOTHING**." Plan anticipated this outcome and the implementation matched it.

### Notes on Task Ordering

- Task 3 was marked `tdd="true"` in the plan frontmatter, but the plan's `<action>` block ordered implementation (Steps 1-3) before test creation (Steps 4-5). The tdd flag here functions more as "tests accompany this change" than strict RED→GREEN sequencing. The resulting commit is feat (not test + feat separately) because the test and implementation were introduced in a single atomic commit per the plan's literal action steps. No TDD gate commits are expected for this plan.
- Task 1 (unified-tab-bar) was purely additive; no RED gate applicable since the function did not exist prior.
- Task 2 produced no commit (pure verification).

## Issues Encountered

- **11 pre-existing test failures** in sidebar.test.tsx + git-control-tab.test.tsx surfaced during the full-suite run. Confirmed pre-existing via `git stash` → rerun → 11 failures, identical set → stash pop. Not caused by Plan 18-11. Root cause appears to be module-evaluation-time `listen('pty-exited', ...)` in terminal-tabs.tsx firing before the jsdom Tauri mock is installed for those specific test files. Logged to `.planning/phases/18-file-tree-enhancements/deferred-items.md`. A dedicated test-infra-hardening plan is recommended; out of scope for 18-11.

## Verification

### Acceptance Grep Proof

```
grep -c "export function closeEditorTabForDeletedFile" src/components/unified-tab-bar.tsx   → 1  ✓ (expected 1)
grep -c "closeEditorTabForDeletedFile" src/components/editor-tab.tsx                        → 3  ✓ (>= 2: 1 import + 1 call + 1 comment mention)
grep -cE "os error 2|No such file|not found" src/components/editor-tab.tsx                  → 1  ✓ (>= 1: the regex line)
grep -c "describe('editor-tab file-deletion auto-close" src/components/editor-tab.test.tsx  → 1  ✓ (expected 1)
```

### Type + Test Proof

```
pnpm tsc --noEmit                                                                  → exit 0, no errors  ✓
pnpm exec vitest run src/components/editor-tab.test.tsx                            → 2/2 pass  ✓
pnpm exec vitest run src/services/file-service.test.ts                             → 22/22 pass (Task 2 no-op verification)  ✓
pnpm exec vitest run (full suite)                                                  → 233 pass / 11 fail (all 11 pre-existing, stash-confirmed out-of-scope)  ✓
```

### Post-Commit Deletion Check

```
git diff --diff-filter=D --name-only f26da2d~1 HEAD  → (empty) ✓ no unintended file deletions across either 18-11 commit
```

### Threat Flags

None. Per the plan's threat register (T-18-11-01..T-18-11-05):
- T-18-11-01 (Tampering, mitigate): the listener calls readFile against the REAL filesystem; an attacker cannot forge a "No such file" error without first deleting the file, in which case closing the tab is correct.
- T-18-11-02 (DoS, accept): rapid emits → rapid readFile calls. Tokio spawn_blocking throughput is adequate; no data loss risk.
- T-18-11-03 (Information disclosure, n/a): filePath is already visible in tab metadata; no new disclosure.
- T-18-11-04 (Spoofing, mitigate): exact-string filePath match (no substring, no glob) prevents sibling-tab false-positives.
- T-18-11-05 (EoP, accept): bypassing ConfirmModal for a deleted file is the INTENDED behavior — saving is impossible, ConfirmModal would wedge the UI. Content recovery via "unsaved vault" is out of scope.

No new trust boundaries, no new IPC surface, no new file-access patterns introduced. The change is a pure frontend consumer extension of an existing event.

### Known Stubs

None. Scanned both modified files and the new test file for stub patterns:
- `src/components/unified-tab-bar.tsx` — new function body is concrete (filter + switchToAdjacentTab + setEditorDirty + setProjectEditorTabs + setProjectTabOrder); no hardcoded empties, no TODO/FIXME.
- `src/components/editor-tab.tsx` — catch block extension invokes a real function; comments reference concrete plan/gap numbers; no placeholders.
- `src/components/editor-tab.test.tsx` — tests make real assertions on editorTabs.value.find and use concrete mockIPC error strings; no skipped cases, no test.todo.

## User Setup Required

None. No external service, no environment variable, no CLI auth, no manual step. The plan is pure code change.

## Next Phase Readiness

- **Gap G-01 END-to-END closed.** Plan 18-10 made revert_file emit git-status-changed; Plan 18-11 makes the editor-tab listener auto-close its tab when readFile fails with ENOENT on that emit. Combined, the user's reported G-01 scenario (create file → revert → file vanishes → stale tree row + stale editor tab) is now covered: the tree row disappears (18-10 listener in file-tree.tsx), and any open editor tab for the reverted file auto-closes (18-11 listener in editor-tab.tsx) within the same ~200ms window.
- **Manual UAT re-run ready.** The user can re-test HUMAN-UAT.md Test 3 with both the tree and the editor open on the file: expected → after revert, both the tree row AND the editor tab vanish within 1 s. The automated tests prove both ends of the plumbing; manual UAT confirms the end-to-end UX.
- **Pattern codified for future file-ops invalidation.** Any future file-ops command that VANISHES a backing resource for an editor tab (e.g., a project-removal flow that deletes all files under a project root, or a rename-out-of-project path) can reuse the closeEditorTabForDeletedFile bypass-confirm-modal pattern.
- **Deferred-items.md queued** for a dedicated test-infra-hardening plan to unlock the 11 pre-existing failing tests in sidebar.test.tsx + git-control-tab.test.tsx. Not blocking 18-11, but worth addressing before the phase closes.

## Self-Check: PASSED

- FOUND: `src/components/unified-tab-bar.tsx` closeEditorTabForDeletedFile export — grep count 1
- FOUND: `src/components/editor-tab.tsx` closeEditorTabForDeletedFile references — grep count 3 (import + call + comment)
- FOUND: `src/components/editor-tab.tsx` error-regex line — grep count 1
- FOUND: `src/components/editor-tab.test.tsx` describe block — grep count 1
- FOUND: commit `f26da2d` — feat(18-11): add closeEditorTabForDeletedFile to unified-tab-bar
- FOUND: commit `2ecc9b7` — feat(18-11): auto-close editor tab on file-not-found in git-status-changed
- pnpm tsc --noEmit: exit 0 ✓
- vitest editor-tab.test.tsx: 2/2 pass ✓
- vitest file-service.test.ts: 22/22 pass ✓
- All acceptance grep counts match expected values ✓
- No unintended deletions across the two commits ✓

---
*Phase: 18-file-tree-enhancements*
*Plan: 11*
*Completed: 2026-04-17*
