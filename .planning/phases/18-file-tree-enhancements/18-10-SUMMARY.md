---
phase: 18-file-tree-enhancements
plan: 10
subsystem: git
tags: [rust, tauri, git, git2, preact, frontend, gap-closure, human-uat, file-tree, refresh, ipc-emit]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-06 revert_file_impl status-aware branching (WT_NEW → fs::remove_file, WT_MODIFIED → git checkout) — the function whose emit path this plan fixes"
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-08 refreshTreePreservingState() listener in file-tree.tsx — the consumer of the git-status-changed event that this plan newly-emits from revert"
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-03 per-file revert button in git-control-tab.tsx (handleRevertFile / handleRevertAll) — the frontend call sites this plan instruments with belt-and-braces emits"
provides:
  - "RevertOutcome enum (Mutated / NoOp) in src-tauri/src/git_ops.rs — pinned contract for revert_file_impl return type"
  - "revert_file_impl returning Result<RevertOutcome, GitError> so the Tauri command layer can decide whether to emit"
  - "revert_file Tauri command generic over R: Runtime, accepting app: AppHandle<R>, emitting git-status-changed only on Mutated outcomes"
  - "handleRevertFile / handleRevertAll emit git-status-changed from the frontend as defense-in-depth, mirroring file-service.ts emit-after-invoke pattern"
  - "Frontend regression test in file-tree.test.tsx proving the git-status-changed listener removes a reverted row from the DOM"
affects: [18-11, 18-12, future file-ops changes that need to co-emit git-status-changed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outcome enum over unit-type Ok for mutation signaling: when a function mutates conditionally, returning an outcome flag lets the command layer branch on side effects without duplicating the status logic"
    - "Runtime-generic Tauri commands: `pub async fn foo<R: Runtime>(app: AppHandle<R>)` works with both production and test runtimes and matches the existing Tauri 2 pattern"
    - "Rust → JS double-emit defense-in-depth: authoritative emit from the backend + belt-and-braces emit from the caller site in JS. Idempotent — the consumer debounces internally via refreshTreePreservingState"

key-files:
  created: []
  modified:
    - "src-tauri/src/git_ops.rs — RevertOutcome enum added immediately before revert_file_impl (line 471). revert_file_impl signature updated to Result<RevertOutcome, GitError>; WT_NEW branch returns Ok(RevertOutcome::Mutated), no-op branch returns Ok(RevertOutcome::NoOp), checkout success returns Ok(RevertOutcome::Mutated) as final expression. revert_file Tauri command rewritten: generic over R: Runtime, accepts app: AppHandle<R>, emits git-status-changed via Emitter trait only when outcome is Mutated. tauri::{AppHandle, Emitter, Runtime} added to top-of-file use block. 4 tests total for revert_file now pin the contract (2 pre-existing updated + 2 new)."
    - "src/components/git-control-tab.tsx — `emit` added to the existing `import { listen }` named-imports line. handleRevertFile calls `await emit('git-status-changed')` between `await revertFile` success and `await refreshGitFiles()`. handleRevertAll calls `await emit('git-status-changed')` after the per-file loop completes (unconditional — emits even on partial failure since any revert changes git state). +10 / -1 LOC."
    - "src/components/file-tree.test.tsx — New describe block 'revert removes stale row via git-status-changed (Gap G-01)' appended at end-of-file (+75 LOC). Single `it()` case using call-count-based mockIPC (first call returns [foo.ts, bar.ts]; subsequent calls return [bar.ts]). Test captures the module-scoped git-status-changed listener via the existing Plan 18-08 vi.mock, invokes it, and asserts foo.ts is gone from DOM while bar.ts remains. All 39 tests pass (38 prior + 1 new)."

key-decisions:
  - "RevertOutcome enum (not bool) for mutation signaling — richer typing, matches Rust idiom, leaves room for future outcomes like DeferredMutation if needed"
  - "Derive PartialEq + Eq + Copy on RevertOutcome so tests can use assert_eq! and the command layer can pass by value through matches!()"
  - "Runtime-generic revert_file<R: Runtime> matches the standard Tauri 2 testability pattern (file_ops.rs uses concrete AppHandle because it doesn't need test-generic, but revert gets the generic because plans may need to unit-test the command layer in future)"
  - "Rust-side emit is authoritative; JS-side emit is defense-in-depth. Both run; the consumer is idempotent. Matches the existing file-service.ts emit-after-invoke pattern used by writeFile/deleteFile/renameFile/createFile/createFolder/copyPath"
  - "handleRevertAll emits unconditionally after the batch loop (not conditioned on successCount > 0) because even a partial failure that reverted one file still changes git state and the tree must reflect that"
  - "Use serde::Serialize (fully-qualified) on the enum rather than relying on `use serde::Serialize` — keeps the enum self-contained and matches GitError's existing `#[derive(..., serde::Serialize)]` style in the same file"
  - "Grep contract: `Ok(RevertOutcome::Mutated)` appears exactly twice (WT_NEW `return Ok(...)` statement + final checkout expression `Ok(RevertOutcome::Mutated)` without `return`). The plan's acceptance >= 2 is met by both occurrences (one with `return`, one as a final expression)"

patterns-established:
  - "Pattern: IPC commands that mutate the working tree MUST emit git-status-changed after success. revert_file now joins create_file / delete_file / write_file_content / rename_file / create_folder / copy_path in the emit-after-mutation club. Future file-ops additions (e.g., chmod, touch) should follow suit"
  - "Pattern: use RevertOutcome-style enum returns when an impl function conditionally mutates so the command layer can gate side effects (emit, log, cache-invalidate) without re-running the status logic"
  - "Pattern: double-emit (Rust authoritative + JS belt-and-braces) is the established contract for IPC operations that the frontend also wraps. See file-service.ts lines 43/56/70/83/110/124 + now git-control-tab.tsx handleRevertFile / handleRevertAll"

requirements-completed: [TREE-01, TREE-02]

# Metrics
duration: 7min
completed: 2026-04-17
---

# Phase 18 Plan 10: revert_file Emits git-status-changed (Gap G-01 Primary) Summary

**RevertOutcome enum + AppHandle.emit in Rust revert_file + double-emit from handleRevertFile/handleRevertAll — closes the HIGH-severity "stale file-tree row after revert-as-delete" gap from Phase 18 human UAT.**

## Performance

- **Duration:** 7 min 12 s
- **Started:** 2026-04-17T08:15:50Z
- **Completed:** 2026-04-17T08:23:02Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **Gap G-01 primary symptom closed:** reverting an untracked (WT_NEW) file via the Git sidebar now emits `git-status-changed` from Rust, the file-tree listener in `file-tree.tsx` (established by Plans 18-03 + 18-08) fires, and `refreshTreePreservingState()` rebuilds the tree so the reverted row disappears within ~200 ms. Subsequent delete clicks no longer error on a missing file. The checkout branch (WT_MODIFIED / WT_DELETED / WT_TYPECHANGE / WT_RENAMED) gets the same treatment.
- **RevertOutcome contract pinned:** `revert_file_impl` now returns `Result<RevertOutcome, GitError>` where `Mutated` is emitted only when the working tree actually changes (WT_NEW delete or checkout), and `NoOp` is returned for CURRENT / pure-INDEX paths. The Tauri command layer uses `matches!(outcome, RevertOutcome::Mutated)` to gate the emit.
- **Defense-in-depth in the frontend:** `handleRevertFile` and `handleRevertAll` in `git-control-tab.tsx` now call `await emit('git-status-changed')` after their respective success paths. Matches the Rust→JS double-emit pattern used by 6 existing file-ops wrappers in `file-service.ts`. Idempotent — the listener debounces internally.
- **Test coverage:** 16/16 Rust `git_ops::tests` pass (14 pre-existing + 2 new `revert_file_impl_returns_mutated_for_untracked_delete` / `revert_file_impl_returns_mutated_for_checkout`). 39/39 file-tree Vitest tests pass (38 pre-existing + 1 new `revert removes stale row via git-status-changed`). `cargo build --release` + `pnpm tsc --noEmit` clean.

## Task Commits

Each task was committed atomically following TDD RED → GREEN discipline for Task 1:

1. **Task 1 RED: add failing tests for RevertOutcome contract** — `dc66a7f` (test)
2. **Task 1 GREEN: revert_file emits git-status-changed on mutation** — `1c58a91` (feat)
3. **Task 2: emit git-status-changed from handleRevert\*** — `484eee2` (feat)
4. **Task 3: add file-tree refresh test for Gap G-01** — `f731a56` (test)

## Files Created/Modified

- `src-tauri/src/git_ops.rs` — +40 / −11 LOC. Imports `tauri::{AppHandle, Emitter, Runtime}` added at line 13. `pub enum RevertOutcome { Mutated, NoOp }` with derives `Debug, Clone, Copy, PartialEq, Eq, serde::Serialize` added at line 471 (immediately before `revert_file_impl`). `revert_file_impl` signature updated to `Result<RevertOutcome, GitError>`; WT_NEW branch `return Ok(RevertOutcome::Mutated)`; no-op branch `return Ok(RevertOutcome::NoOp)`; final success returns `Ok(RevertOutcome::Mutated)`. `revert_file` Tauri command rewritten as `pub async fn revert_file<R: Runtime>(repo_path: String, file_path: String, app: AppHandle<R>) -> Result<(), String>` with `if matches!(outcome, RevertOutcome::Mutated) { let _ = app.emit("git-status-changed", ()); }`. Two new tests + two updated tests pinning the RevertOutcome contract.
- `src/components/git-control-tab.tsx` — +10 / −1 LOC. `import { listen, emit } from '@tauri-apps/api/event'` (emit added to the existing listen import). `handleRevertFile` inserts `await emit('git-status-changed')` between `await revertFile(...)` and `await refreshGitFiles()`. `handleRevertAll` inserts the same `await emit('git-status-changed')` after the per-file for-loop completes (unconditional — emitted even on partial failure).
- `src/components/file-tree.test.tsx` — +75 LOC. New `describe('revert removes stale row via git-status-changed (Gap G-01)', ...)` block appended at EOF. Single `it()` test using a call-count-based mockIPC: first `list_directory` returns `[foo.ts, bar.ts]`; subsequent calls return `[bar.ts]`. Renders FileTree, force-switches to flat mode, asserts both rows visible, invokes `capturedGitStatusListener()` (the Plan 18-08 module-level listener capture), waits 200 ms, asserts foo.ts gone + bar.ts still present.

## Decisions Made

- **RevertOutcome enum over bool:** The Tauri command layer needs a yes/no signal for emit gating, but using `enum { Mutated, NoOp }` is more readable than `bool` and leaves room for future outcomes without a breaking API change. Derives `Debug, Clone, Copy, PartialEq, Eq` so tests use `assert_eq!` and the command layer uses `matches!()` without ownership issues.
- **Runtime-generic revert_file<R: Runtime>:** Per the plan's design note, this matches Tauri 2's testability pattern — production code calls with the real runtime, future unit tests of the command layer can pass a mock runtime. `file_ops.rs` uses concrete `AppHandle` because its command layer is not unit-tested, but `revert_file` gets the generic as insurance against a future integration-test need.
- **Rust authoritative + JS belt-and-braces double-emit:** The plan explicitly called for both, and this matches the existing `file-service.ts` pattern where 6 mutation wrappers emit from JS after their invoke resolves. The listener is idempotent (`refreshTreePreservingState` reads the filesystem via `list_directory` — a second call just re-renders the same tree). Two emits is the correct safety margin.
- **handleRevertAll emits unconditionally:** Even if 0 files reverted successfully, the plan does not gate on `successCount > 0` because partial failures still change git state and the tree must reflect that. The unconditional emit also simplifies the code (no extra branch) and matches the existing pattern of refreshGitFiles also being unconditional in that function.
- **`Ok(RevertOutcome::Mutated)` appears as both `return` statement and final expression:** WT_NEW needs an early-return with the mutation flag; the checkout path falls through to the function's final expression which returns `Ok(RevertOutcome::Mutated)` after validating `output.status.success()`. Two occurrences, one each, meets the plan's acceptance `>= 2`.
- **serde::Serialize fully-qualified on RevertOutcome:** Matches the local style for GitError in the same file (`#[derive(Debug, Clone, serde::Serialize)]`). Avoids a pointless `use serde::Serialize` at module scope when only one enum needs it.

## Deviations from Plan

None — plan executed exactly as written.

### Notes on TDD Behavior

- Task 1 RED tests failed at compile time with `E0433: use of undeclared type 'RevertOutcome'` (four instances of `assert_eq!(outcome, RevertOutcome::Mutated/NoOp)` across two new tests plus two updated existing tests). This is the correct RED signal for a type-system-driven contract — GREEN introduces the type.
- Task 1 GREEN: adding the enum + updating the signature + updating the Tauri command to accept `AppHandle<R>` compiled cleanly on first try. 16/16 tests pass.
- Task 2 required no RED phase because it is pure additive frontend wiring (add import + add emit calls). The TypeScript compiler + the existing test suite are the implicit verification.
- Task 3 test passed on first run both in isolation (`-t "revert removes stale row"`) and as part of the full file-tree suite. The `callCount`-based mockIPC closure is local to `beforeEach` so it resets per-test and does not leak.

## Issues Encountered

- **Initial worktree missing node_modules:** This parallel-executor worktree was freshly created and did not have `node_modules` yet. Ran `pnpm install --frozen-lockfile` successfully; the esbuild post-install script prompt was avoided by skipping the interactive approval (esbuild runs correctly without the approved script flag for test execution). Not a plan deviation — just worktree setup.
- **Duplicate grep quoting failure (shell):** Tried to run combined `grep -c` checks in a single bash invocation; RTK proxy compressed the output incorrectly on escaped quotes. Switched to the `Grep` tool directly and all acceptance counts verified cleanly.

## Verification

### Acceptance Grep Proof (Rust)

```
grep -c "pub enum RevertOutcome" src-tauri/src/git_ops.rs                             → 1  ✓ (expected 1)
grep -c "return Ok(RevertOutcome::Mutated)" src-tauri/src/git_ops.rs                  → 1  ✓ (>= 1, WT_NEW return)
grep -c "Ok(RevertOutcome::Mutated)" src-tauri/src/git_ops.rs                         → 2  ✓ (>= 2, WT_NEW return + final checkout expr)
grep -c "return Ok(RevertOutcome::NoOp)" src-tauri/src/git_ops.rs                     → 1  ✓ (== 1)
grep -c "app.emit(\"git-status-changed\"" src-tauri/src/git_ops.rs                    → 1  ✓ (>= 1)
grep -c "pub async fn revert_file<R: Runtime>" src-tauri/src/git_ops.rs               → 1  ✓ (== 1)
grep -c "app: AppHandle<R>" src-tauri/src/git_ops.rs                                  → 1  ✓ (== 1)
grep -c "fn revert_file_impl_returns_mutated_for_untracked_delete" src-tauri/src/git_ops.rs  → 1  ✓ (== 1)
grep -c "fn revert_file_impl_returns_mutated_for_checkout" src-tauri/src/git_ops.rs   → 1  ✓ (== 1)
grep -c "use tauri::{AppHandle, Emitter, Runtime}" src-tauri/src/git_ops.rs           → 1  ✓ (imports added)
```

### Acceptance Grep Proof (Frontend)

```
grep -c "import { listen, emit } from '@tauri-apps/api/event'" src/components/git-control-tab.tsx   → 1  ✓ (>= 1)
grep -c "await emit('git-status-changed')" src/components/git-control-tab.tsx                       → 2  ✓ (>= 2, one each in handleRevertFile + handleRevertAll)
```

### Acceptance Grep Proof (Test)

```
grep -c "describe('revert removes stale row via git-status-changed" src/components/file-tree.test.tsx  → 1  ✓ (== 1)
```

### Type + Build + Test Proof

```
pnpm tsc --noEmit                                                                    → exit 0  ✓
cd src-tauri && cargo check --all-targets                                             → exit 0, clean  ✓
cd src-tauri && cargo build --release --lib                                           → exit 0, clean release build  ✓
cd src-tauri && cargo test --lib git_ops::tests                                       → 16/16 pass (14 prior + 2 new)  ✓
pnpm exec vitest run src/components/file-tree.test.tsx                                → 39/39 pass (38 prior + 1 new)  ✓
pnpm exec vitest run src/components/file-tree.test.tsx -t "revert removes stale row"  → 1/1 pass (38 skipped)  ✓
```

### Post-Commit Deletion Check

```
git diff --diff-filter=D --name-only dc66a7f~1 HEAD  → (empty) ✓ no unintended file deletions
```

### Known Stubs

None. Scanned all three modified files for stub patterns:
- `src-tauri/src/git_ops.rs` — no hardcoded empty returns, no "coming soon" strings, no TODO/FIXME added.
- `src/components/git-control-tab.tsx` — no empty arrays wired to UI, no placeholder text, comments reference concrete plan numbers.
- `src/components/file-tree.test.tsx` — new test uses real mockIPC data, no skipped assertions or `test.todo` placeholders.

### Threat Flags

No new threat surface introduced. Per the plan's threat register:

- T-18-10-01 (accept): emit payload is unit `()`; a spurious emit causes at most a no-op refresh. Confirmed — emit is `app.emit("git-status-changed", ())` with no payload.
- T-18-10-02 (mitigate, deferred): rapid reverts → N emits → N tree refreshes. The known re-entrancy concern in `refreshTreePreservingState` (documented in 18-REVIEW.md WR-03) is out of scope; worst case is visual flicker, not data loss.
- T-18-10-03 (n/a): no payload, no information disclosure.
- T-18-10-04 (mitigate): single-window app, in-process emit sources only (file_watcher + file_ops + now git_ops).
- T-18-10-05 (n/a): no permission check bypassed; `is_safe_path` still enforced by the file-ops commands that run alongside revert.

No new trust boundaries, IPC surface, or file-access patterns introduced. The emit is purely a refresh signal.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Gap G-01 primary symptom closed.** The user's reported sequence (revert an untracked file → sidebar updates → file-tree should update within 1s) is now covered by an automated test and backed by both a Rust-side emit and a JS-side emit.
- **Plans 18-11 and 18-12 unaffected.** Plan 18-11 targets Gap G-02 (drop-target folder highlighting) in `main.tsx` + `file-tree.tsx` — a completely different subsystem (drag-drop, not git). Plan 18-12 is the follow-up verification plan. No coordination needed between 18-10 and 18-11.
- **Manual UAT re-run ready.** After this plan, the user can re-test the HUMAN-UAT.md Test 3 sequence (create a file, revert it via the Git sidebar, observe the tree). Expected: the row disappears within 1 s. The automated test proves the listener plumbing works; manual UAT confirms the end-to-end user experience.
- **Pattern codified for future file-ops.** Any future IPC command that mutates the working tree (e.g., a future `touch`, `chmod`, `symlink` command) should follow the same emit-after-mutation pattern now established in both `file_ops.rs` and `git_ops.rs`.

## Self-Check: PASSED

- FOUND: `src-tauri/src/git_ops.rs` — modifications verified via Read lines 1-15 (imports), 471-479 (enum), 559-572 (command signature)
- FOUND: `src/components/git-control-tab.tsx` — modifications verified via the diff in commit 484eee2 (10 insertions, 1 deletion)
- FOUND: `src/components/file-tree.test.tsx` — new describe block verified via the diff in commit f731a56 (75 insertions)
- FOUND: `dc66a7f` — test(18-10): add failing tests for RevertOutcome contract
- FOUND: `1c58a91` — feat(18-10): revert_file emits git-status-changed on mutation
- FOUND: `484eee2` — feat(18-10): emit git-status-changed from handleRevert*
- FOUND: `f731a56` — test(18-10): add file-tree refresh test for Gap G-01
- cargo test git_ops::tests: 16/16 pass ✓
- vitest file-tree.test.tsx: 39/39 pass ✓
- pnpm tsc --noEmit: clean ✓
- cargo build --release --lib: clean ✓
- All 12 acceptance grep counts match expected values ✓

---
*Phase: 18-file-tree-enhancements*
*Plan: 10*
*Completed: 2026-04-17*
