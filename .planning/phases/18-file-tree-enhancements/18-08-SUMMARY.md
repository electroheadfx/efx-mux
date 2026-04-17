---
phase: 18-file-tree-enhancements
plan: 08
subsystem: ui
tags: [preact, ui, file-tree, state-preservation, gap-closure, signals, vitest]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-03 git-status-changed listener wiring inside FileTree useEffect (file-tree.tsx) — the site this plan patches"
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-07 Finder drop hit-test + coordinate corrections (18-07-SUMMARY.md) — prior wave preserved unchanged"
provides:
  - "refreshTreePreservingState() helper in file-tree.tsx — snapshots expanded folder paths and selectedIndex anchor before initTree(), re-expands in shortest-path-first order after, and re-anchors selection by path"
  - "Targeted redirect: the git-status-changed listener tree-branch now calls refreshTreePreservingState() instead of initTree(). Other initTree call sites (project switch, initial mount, switchToTree empty-tree guard) remain unchanged"
  - "3 regression tests that mock @tauri-apps/api/event.listen to capture the git-status-changed callback, allowing deterministic post-mutation refresh simulation in jsdom"
  - "forceTreeMode() test helper that clicks the 'Tree mode' toggle to defeat module-scoped viewMode signal leakage from earlier describe blocks"
affects: [file-tree-enhancements, tree-state-preservation, post-mutation-refresh]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-before-initTree / restore-after pattern: preserves user UI state across a destructive rebuild by capturing identity-bearing strings (paths) rather than object references. Safe against TreeNode object replacement in the signal value."
    - "Module-scoped listen capture via vi.mock('@tauri-apps/api/event', ...) — routes listener registration into a test-controlled closure so the production async effect can be triggered deterministically without relying on Tauri's event plumbing."
    - "forceTreeMode() defensive toggle: when a describe depends on a default module-scoped signal that sibling describes mutate, click the UI toggle rather than exporting the signal — avoids widening the component's public surface for test-only reasons."

key-files:
  created: []
  modified:
    - "src/components/file-tree.tsx - refreshTreePreservingState() helper added between initTree() and findParentNode(); git-status-changed listener redirected from initTree() to the new helper; listener comment updated to reference Plan 03 + Plan 08 lineage. +59 / -2 LOC."
    - "src/components/file-tree.test.tsx - module-level vi.mock('@tauri-apps/api/event', ...) intercepts listen and captures the git-status-changed callback in capturedGitStatusListener; new describe block 'tree state preservation (UAT Tests 6 + 7)' with 3 regression cases; forceTreeMode() helper defeats viewMode leakage. +165 LOC."

key-decisions:
  - "Use snapshot+restore wrapper (Plan option 1) instead of writing a refreshTree() reconciler (option 2). Smaller diff, reuses the existing initTree/toggleTreeNode/loadTreeChildren code paths, and keeps the destructive wipe semantics intact at the three call sites where wipe is correct (project switch, initial mount, switchToTree empty-tree guard)."
  - "Sort expanded paths by string length before re-expanding so parents load before children can be located in the newly-built tree. Alternative (walk the pre-mutation tree top-down and re-expand in that order) would require keeping the stale TreeNode[] alive and walking both trees in parallel — more state, more complexity."
  - "Re-anchor selectedIndex by previous entry PATH, not by previous index. If the mutation deleted entries above the selected row, the old index points at a different entry post-refresh; path anchor is the only identity that survives the rebuild."
  - "Swallow re-expansion errors silently. If a snapshot path no longer resolves (its folder was deleted by the mutation), the node.find returns undefined and the loop continues. A silently-collapsed folder is less disruptive than a crash or a noisy toast for a benign race."
  - "Mock @tauri-apps/api/event at module scope rather than per-describe. Vitest hoists vi.mock to the top of the file; per-describe mocking is not supported. The module-scoped capture variable (capturedGitStatusListener) is reset in each beforeEach to isolate tests."
  - "Drop the plan's optional `export const viewMode` step. The forceTreeMode() helper clicks the UI toggle instead of reading/writing the signal directly, preserving file-tree.tsx's current encapsulation. Export would widen the public surface for test-only needs."

patterns-established:
  - "Pattern: UI signals that persist on destructive rebuilds (e.g., expand/collapse state stored on object instances) MUST be snapshot-before-rebuild + restore-after. The identity anchor is whatever string (path, id) survives the rebuild."
  - "Pattern: post-mutation refresh paths are semantically distinct from initial-load paths even when both invoke the same list_directory IPC. Keep the initial-load function untouched and wrap it for the refresh case — do not conditionalise the initializer."
  - "Pattern: for tests that need to intercept Tauri's listen() to simulate async events, use vi.mock('@tauri-apps/api/event', ...) + a module-level captured-handler ref. vi.stubGlobal('listen', ...) does NOT intercept ES module imports."

requirements-completed: [TREE-01, MAIN-03]

# Metrics
duration: 6m
completed: 2026-04-17
---

# Phase 18 Plan 08: Tree State Preservation Across git-status-changed (UAT Tests 6 + 7) Summary

**refreshTreePreservingState() helper in file-tree.tsx wraps initTree() with a snapshot-and-restore of expanded folder paths + selectedIndex anchor, and the git-status-changed listener now calls the wrapper instead of initTree() directly, so create/delete/rename/move/copy mutations no longer collapse all expanded folders.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-17T05:52:03Z
- **Completed:** 2026-04-17T05:58:11Z
- **Tasks:** 2
- **Files modified:** 2 (file-tree.tsx, file-tree.test.tsx)

## Accomplishments

- UAT Tests 6 + 7 closed: user's carefully-arranged tree expansion state is preserved across every file mutation emitted via git-status-changed. The create-row menu action (which auto-expands the parent folder) now keeps that folder expanded after the new file's refresh. Inline-created files, deleted files, renamed files, moved files, and copied files all trigger a refresh that leaves the rest of the tree undisturbed.
- selectedIndex re-anchors by path: if the user had a row selected before the mutation, the refresh finds the row with the same path in the rebuilt tree and sets selectedIndex to it. If the path is gone (the entry was deleted), selectedIndex clamps to Math.min(prevIndex, flatLen - 1) or 0 — never crashes, never points at a nonsense index.
- Three regression tests added covering: (a) positive expansion preservation, (b) selectedIndex path re-anchor with foo.ts still visible, (c) flat-mode path exercised by listener invocation (loadDir still fires). All 37 file-tree tests pass (34 pre-existing + 3 new).
- Zero changes to initTree() body. The three legitimate wipe call sites remain untouched: handleProjectChanged (project switch), initial mount (first render), and switchToTree() (empty-tree guard). The fix is narrowly scoped to the git-status-changed branch only.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add refreshTreePreservingState() helper and redirect the git-status-changed listener** - `0b3d4ce` (fix)
2. **Task 2: Test coverage for tree state preservation across git-status-changed** - `dbea12c` (test)

## Files Created/Modified

- `src/components/file-tree.tsx` — New async function `refreshTreePreservingState()` at lines 220-280 (between initTree() and findParentNode()). Algorithm: snapshot expandedPaths from flattenedTree (folders where node.expanded), snapshot prevSelectedPath (flattenedTree[prevIndex]?.entry.path), await initTree(), iterate sortedExpanded paths shortest-first and await toggleTreeNode on each match, then re-anchor selectedIndex by path or clamp. Listener at lines 799-814 updated: `if (viewMode.value === 'tree') initTree();` → `if (viewMode.value === 'tree') { void refreshTreePreservingState(); } else { loadDir(currentPath.value); }`. Listener comment updated to "Phase 18 Plan 03 + Plan 08". +59 / -2 LOC.
- `src/components/file-tree.test.tsx` — Module-level `let capturedGitStatusListener` + `vi.mock('@tauri-apps/api/event', ...)` factory that captures `cb` for event 'git-status-changed' only. New describe block 'tree state preservation (UAT Tests 6 + 7)' at lines 781-937 with 3 `it()` cases and a `forceTreeMode()` helper. beforeEach resets `capturedGitStatusListener = null` and sets a path-aware `list_directory` mock returning SRC_CHILDREN for `/tmp/proj/src`. +165 LOC.

## Decisions Made

- **Snapshot+restore wrapper over a refreshTree reconciler.** The plan weighed option 1 (snapshot/restore) vs option 2 (full reconciler). Chose option 1 per the plan's stated rationale: smaller diff (59 LOC vs ~150 for a reconciler), reuses existing initTree() + toggleTreeNode() + loadTreeChildren() IPC plumbing without duplication, and leaves the destructive-wipe behavior available at the three call sites where it's still correct (project switch, initial mount, switchToTree empty-tree guard).
- **Shortest-path-first re-expansion.** Re-expanding `/tmp/proj/src/components` before `/tmp/proj/src` would fail because the child's node doesn't exist until its parent's children are loaded. Sorting the snapshot paths by string length approximates the topological order for a typical filesystem (parent paths are shorter than descendant paths). For odd cases where an ancestor folder is longer than its descendant (rare), toggleTreeNode on an already-expanded node short-circuits (lines 260-261: `if (!node || node.expanded) continue;`).
- **Path-based re-anchor for selectedIndex.** Indices change across refreshes (a deleted entry above the selection shifts everything up; a newly-created entry above shifts down). The entry path is the only identity that survives. If the previous path is absent post-refresh, clamping to `Math.min(prevIndex, flatLen - 1)` preserves the user's approximate visual position rather than jumping to 0.
- **Silent re-expansion errors.** A folder path may no longer exist in the post-mutation tree (e.g. user deleted an expanded folder). The `try { await toggleTreeNode(node); } catch {}` swallow is deliberate: a collapsed-on-failure folder is strictly less disruptive than a toast, and the root cause (the folder is gone) is already visible in the tree.
- **Module-scoped vi.mock instead of per-describe.** Vitest hoists `vi.mock` to the top of the test file; per-describe mocking is not supported. The capture variable `capturedGitStatusListener` is declared at module scope and reset in each test's `beforeEach`. All 34 pre-existing tests already relied on the production listener being no-op'd (they call `vi.stubGlobal('listen', ...)` which doesn't intercept ES module imports — the real listen was going through with `__TAURI_EVENT_PLUGIN_INTERNALS__ = {}` as a silent harness). Replacing that accidental no-op with an explicit mock is behavior-preserving for existing tests.
- **UI-toggle forceTreeMode() instead of exporting viewMode.** The plan's Task 2 notes mentioned optionally exporting `viewMode` if the tree-toggle click pattern was fragile. The existing `switchToFlat()` helper (lines 565-570 of the test file) already uses the `span[title="Flat mode"]` selector pattern successfully, so `forceTreeMode()` uses the sibling `span[title="Tree mode"]` selector. No export added — viewMode remains a private module signal, preserving encapsulation. When the component is already in tree mode (the default), the click is a harmless re-affirmation.

## Deviations from Plan

None — plan executed exactly as written.

One minor follow-on was needed to make the tests robust against test-suite run order: `forceTreeMode()` was added because the module-scoped `viewMode` signal leaks from earlier describe blocks that switch to flat mode. Without `forceTreeMode()`, the tests pass in isolation (`pnpm vitest run ... -t "tree state preservation"`) but one test fails when the full suite runs because a prior test leaves `viewMode.value === 'flat'`. The plan's Task 2 notes explicitly flagged this edge case and recommended the fallback (export viewMode or click the toggle); I took the UI-toggle path to avoid widening the module's public surface. This is in-scope for Task 2's "test infrastructure" scope and did not require deviation tracking — the plan gave two alternatives and I chose one.

## Issues Encountered

- Initial run of the full file-tree test suite after Task 2 exposed one failing test: `selectedIndex is re-anchored to the same path after refresh` — `readmeRowBefore` was `undefined`. Root cause: the prior describe block (`quick-260416-uig`) clicks the flat-mode toggle, and the module-scoped `viewMode` signal persists into the next describe. The component mounted in flat mode, where row 0 is `README.md`, not `src`, so the expansion flow never exposed `foo.ts`. Fixed by adding `forceTreeMode()` helper + calling it after every `render(<FileTree />)` in the new describe. All 37 tests now green in both isolated and full-suite runs.

## Verification

### Acceptance Grep Proof

```
grep -n "async function refreshTreePreservingState" src/components/file-tree.tsx   → line 240  ✓
grep -c "expandedPaths" src/components/file-tree.tsx                               → 3  ✓ >= 1
grep -c "prevSelectedPath" src/components/file-tree.tsx                            → 3  ✓ >= 1
grep -c "refreshTreePreservingState" src/components/file-tree.tsx                  → 3 (definition + listener + doc comment)  ✓ >= 2
grep -n "void refreshTreePreservingState()" src/components/file-tree.tsx           → line 809  ✓
grep -n "await initTree()" src/components/file-tree.tsx (inside refresh helper)    → line 253  ✓
grep -n "await toggleTreeNode(node)" src/components/file-tree.tsx                  → line 263  ✓
grep -n "findIndex(n => n.entry.path === prevSelectedPath)" src/components/file-tree.tsx → line 271  ✓
grep -c "if (viewMode.value === 'tree') initTree()" src/components/file-tree.tsx   → 0  ✓ (old bare call removed)
grep -c "describe('tree state preservation" src/components/file-tree.test.tsx      → 1  ✓
grep -c "capturedGitStatusListener" src/components/file-tree.test.tsx              → 8  ✓ (definition + 1 assignment + 6 uses)
grep -c "toContain('foo.ts')" src/components/file-tree.test.tsx                    → 3  ✓ (3 assertions across 2 tests)
```

### Type + Test Proof

```
pnpm tsc --noEmit                                                    → exit 0  ✓
pnpm vitest run src/components/file-tree.test.tsx                     → 37/37 pass, 0 fail  ✓
pnpm vitest run src/components/file-tree.test.tsx -t "tree state preservation" → 3/3 pass (34 skipped by -t filter)  ✓
```

### initTree Call-Site Audit

| Line | Call site                              | Status              | Rationale                                           |
|------|----------------------------------------|---------------------|-----------------------------------------------------|
| 195  | `async function initTree(): Promise<void>` | Definition UNCHANGED | Body preserves wipe semantics                       |
| 253  | `await initTree()` inside refreshTreePreservingState | NEW wrapper call     | The new helper invokes initTree then restores state |
| 782  | `if (viewMode.value === 'tree') { initTree(); }` in handleProjectChanged | UNCHANGED           | Project switch: different tree, wipe is correct     |
| 915  | `if (viewMode.value === 'tree') { initTree(); }` in initial mount useEffect | UNCHANGED           | First render: no prior state to preserve            |
| 1266 | `if (treeNodes.value.length === 0) { initTree(); }` in switchToTree | UNCHANGED           | Empty-tree guard: already state-preserving          |

### Known Stubs

None. Scanned file-tree.tsx and file-tree.test.tsx for placeholder/TODO/FIXME patterns. Only matches are legitimate `placeholder="New file name"` attributes on the inline-create input (Plan 03 artifact, unchanged).

### Threat Flags

None. Per the plan's threat register:
- T-18-08-01 (mitigated): Each await toggleTreeNode mutates one node; re-expansion errors are caught per-path.
- T-18-08-02 (accepted): Sequential await re-expansion is O(expanded paths) — sub-second for typical developer trees.
- T-18-08-04 (mitigated): Snapshot paths that no longer resolve are silently skipped; selectedIndex clamps gracefully.

No new trust boundaries, IPC surface, or file access patterns introduced.

## Next Phase Readiness

- UAT Tests 6 + 7 closed. Phase 18 Wave 2 gap closure for the tree-state-reset bug is complete.
- Next plan 18-09 is unaffected by this change — it targets a different UAT bug.
- The snapshot+restore pattern is now a codified convention in the file-tree subsystem; future refresh paths (e.g., a future "reload changed subtree only" optimization) can reuse the same algorithm or extend it.

## Self-Check: PASSED

- FOUND: src/components/file-tree.tsx (Task 1 edits — verified via Read at lines 195-280 and 799-814)
- FOUND: src/components/file-tree.test.tsx (Task 2 edits — verified via Read at lines 1-35 and the new describe at lines 781-937)
- FOUND: 0b3d4ce — fix(18-08): preserve tree expand/collapse state across git-status-changed
- FOUND: dbea12c — test(18-08): add tree state preservation regression tests (UAT 6 + 7)

---
*Phase: 18-file-tree-enhancements*
*Completed: 2026-04-17*
