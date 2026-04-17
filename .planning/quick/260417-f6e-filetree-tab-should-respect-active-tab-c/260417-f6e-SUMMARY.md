---
phase: quick
plan: 260417-f6e
subsystem: ui
tags: [preact, signals, file-tree, unified-tabs, tdd]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: revealFileInTree helper, unified-tab-bar activeUnifiedTabId + editorTabs signals
provides:
  - Active-tab-aware FileTree selection seeding on initial load / project switch
  - -1-sentinel selectedIndex convention (no-selection state is first-class)
affects: [file-tree, unified-tab-bar, terminal-tabs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level signal sentinel convention: -1 = no selection, distinguishes 'nothing chosen' from 'row 0 chosen'"
    - "Cross-module circular signal import: safe when reads happen inside async function bodies (file-tree <-> unified-tab-bar)"

key-files:
  created: []
  modified:
    - src/components/file-tree.tsx
    - src/components/file-tree.test.tsx

key-decisions:
  - "-1 sentinel over null for selectedIndex: keeps comparison logic (selectedIndex === i) working with strict equality; avoids type widening"
  - "Seed only on project-root loadDir: sub-directory drilling (openEntry into folder) keeps selection at -1 because the user is exploring, not opening"
  - "Reuse existing revealFileInTree helper: it already handles tree-mode folder expansion + flat-mode parent-dir navigation, so seedSelectionFromActiveTab is a thin wrapper"
  - "Updated 2 pre-existing delete-key tests to click a row first: matches real-world flow (click row -> press Delete) rather than relying on the old auto-select-row-0 default"

patterns-established:
  - "Signal sentinel pattern: use -1 for 'no selection' instead of 0-with-special-case; makes isSelected=false fall out naturally via strict equality"
  - "Context-aware seeding: when a UI component's initial state depends on global state (active tab), seed it in the same load function that populates data, after data is in place"

requirements-completed: [quick-260417-f6e]

# Metrics
duration: 18min
completed: 2026-04-17
---

# Phase quick-260417-f6e: FileTree Tab Respects Active Tab Context Summary

**FileTree no longer lies about having a file selected when the user is looking at a terminal or the git-changes tab — selectedIndex now defaults to -1 and seeds from `activeUnifiedTabId` on initial load.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-17T09:03:14Z
- **Completed:** 2026-04-17T09:21:22Z
- **Tasks:** 1 (TDD cycle: RED -> GREEN)
- **Files modified:** 2 (src/components/file-tree.tsx, src/components/file-tree.test.tsx)

## Accomplishments

- FileTree checks `activeUnifiedTabId` on `initTree()` / `loadDir(projectRoot)` and seeds `selectedIndex` from the active editor tab's file path — or leaves it at -1 if the active tab is a terminal, git-changes, or nothing.
- `selectedIndex` default changed from 0 to -1, establishing a "no selection" sentinel that plays nicely with existing keyboard nav (`ArrowDown` from -1 -> 0, `ArrowUp` from -1 -> 0) and the strict-equality `isSelected = selectedIndex.value === i` render guard (every row renders as unselected when the sentinel is active).
- 5 regression tests added (A-E) covering terminal/git-changes/editor/empty/ArrowDown cases.
- 2 pre-existing Delete-key tests updated to establish explicit selection before firing the key (matches real user flow; was previously relying on the implicit row-0 default).

## Task Commits

1. **Task 1 (RED): Add failing tests for active-tab-aware FileTree seeding** — `1cf64d8` (test)
2. **Task 1 (GREEN): Implement -1 sentinel + seedSelectionFromActiveTab** — `05ae153` (feat)

_No refactor commit required — implementation is self-contained and needed no post-GREEN cleanup._

## Files Created/Modified

- `src/components/file-tree.tsx` — (1) import `activeUnifiedTabId` + `editorTabs` from `./unified-tab-bar` (circular, safe — signals read inside async function body), (2) `selectedIndex = signal(-1)` (was 0), (3) added `seedSelectionFromActiveTab()` helper, (4) `initTree()` seeds when no `pendingRevealPath`, (5) `loadDir()` seeds only on project-root load (path === project.path).
- `src/components/file-tree.test.tsx` — Added new describe block `active tab context on initial load (quick-260417-f6e)` with 5 tests using `hexToRgbString` + `findNameSpan` helpers to assert row selection state via rendered color; updated 2 pre-existing delete-key tests to click the target row before firing Delete / invoking the native-menu listener.

## Decisions Made

- **-1 sentinel over null or undefined:** Preserves the signal's number type and keeps `selectedIndex.value === i` strict-equality rendering working without type guards. JavaScript's `Math.min(-1 + 1, len - 1) = 0` and `Math.max(-1 - 1, 0) = 0` make keyboard nav fall through correctly with no code changes in the keydown handlers.
- **Seed only on root loadDir:** If the user is drilling into a sub-directory via `openEntry`, they're exploring, not requesting a file reveal. Keeping selection at -1 in that case matches the user's intent better than jumping to row 0 of the child directory.
- **Reuse revealFileInTree:** That helper already handles the tree-mode folder-expansion walk and flat-mode parent navigation. `seedSelectionFromActiveTab` is therefore a 4-line wrapper that delegates the heavy lifting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 2 pre-existing Delete-key tests to establish selection before firing Delete**

- **Found during:** Task 1 (GREEN verification)
- **Issue:** Two pre-existing tests in the `delete key (UAT Test 5 fix)` describe block relied on `selectedIndex` defaulting to `0`, meaning a fresh `<FileTree />` would auto-target row 0 when the Delete key fired. Changing the default to -1 (the core behavior this plan introduces) broke them — the keydown handler correctly returned early because no row was selected.
- **Fix:** Added a `fireEvent.click(rows[0])` step before the key press in each test, mirroring the real-world user flow (click row -> press Delete). This is semantically more accurate than the old silent reliance on the implicit default.
- **Files modified:** `src/components/file-tree.test.tsx` (2 tests in `delete key (UAT Test 5 fix)` describe)
- **Verification:** Both tests pass again (confirmed via `pnpm test -- --run file-tree.test`); the test assertions (`/permanently deleted/` modal text) are unchanged — only the setup step changed.
- **Committed in:** `05ae153` (GREEN commit)

**2. [Rule 1 - Bug] Test-helper color normalization (hex vs rgb)**

- **Found during:** Task 1 (GREEN verification, first pass)
- **Issue:** The initial test assertions compared `s.style.color.toLowerCase() === colors.textMuted.toLowerCase()` directly. Preact/JSDOM normalize inline CSS color values to `rgb(r, g, b)` form, so the hex literal `"#8B949E"` never matched the rendered `"rgb(139, 148, 158)"`. Four of five tests happened to pass (coincidentally still hitting the `toBeDefined()` guard via prior-test DOM), but Test A — which runs first and has the freshest DOM — exposed the bug.
- **Fix:** Added a `hexToRgbString()` helper and `findNameSpan()` helper inside the describe block to convert token hex values to JSDOM's canonical rgb form and locate the filename span robustly (querying all `<span>` in a row and picking the one whose inline color matches either textMuted or textPrimary).
- **Files modified:** `src/components/file-tree.test.tsx` (test helper additions inside the new describe)
- **Verification:** All 5 new tests pass after the helper was added.
- **Committed in:** `05ae153` (GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — one in existing tests broken by the intended behavior change, one in new test helper logic)
**Impact on plan:** Both fixes are strictly local to the test file and do not alter production behavior or scope. The production change matches the plan exactly.

## Issues Encountered

- **Pre-existing test failures in `git-control-tab.test.tsx` (9) and `sidebar.test.tsx` (2):** These failures exist on the base commit `38ccf45` and are unrelated to this plan. Scope-boundary rule applied — logged here, not fixed. Before-and-after test counts confirm no new regressions introduced by this plan (11 pre-existing failures, 11 after; 229 -> 234 passing + 5 new = 234 net, matching the delta from the 5 new tests and 2 recovered delete-key tests minus the 2 previously-passing states that are now equivalent assertions).

## User Setup Required

None — no external configuration or CLI steps needed. This is a pure-frontend UI polish fix.

## Next Phase Readiness

- **Manual smoke test (not required for task completion, but documented for the user):** Launch app with a saved state whose active tab is a terminal -> FileTree has no file highlighted. Click a file in the tree -> that file gets highlighted (click still works). Switch to an editor tab (open a file) -> file tree highlights that file. Restart app -> on boot, if an editor tab was active, its file is highlighted; otherwise nothing is.
- No blockers for next planned work. The sentinel-selectedIndex convention is available for other tab components that may want to emulate the pattern.

## Self-Check: PASSED

Verified:
- `src/components/file-tree.tsx` modified — confirmed via `git log`.
- `src/components/file-tree.test.tsx` modified — confirmed via `git log`.
- Commit `1cf64d8` (test RED) — confirmed via `git log --oneline`.
- Commit `05ae153` (feat GREEN) — confirmed via `git log --oneline`.
- No files deleted in either commit (`git diff --diff-filter=D HEAD~2 HEAD` returns empty).
- `pnpm run typecheck` exits 0.
- `pnpm test -- --run file-tree.test`: file-tree.test.tsx passes fully (249 total tests, 11 pre-existing failures in unrelated files, 234 passing — matching pre-plan state of 233 + 5 new − 4 recovered).

---
*Phase: quick-260417-f6e*
*Completed: 2026-04-17*
