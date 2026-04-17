---
phase: 18-file-tree-enhancements
plan: 07
subsystem: ui
tags: [preact, tauri, drag-drop, wkwebview, hit-test, gap-closure, vitest]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-05 Finder drop pipeline (main.tsx onDragDropEvent subscriber + file-tree.tsx handleFinderDrop/Dragover + outside-container toast guard)"
provides:
  - "MACOS_TITLE_BAR_OFFSET constant in main.tsx (Tauri Issue #10744 mitigation for titleBarStyle: Overlay coord system)"
  - "2D rect hit-tests in all 4 [data-file-tree-index] sites (onTreeDocMouseMove, onTreeDocMouseUp, handleFinderDragover, handleFinderDrop)"
  - "Reachable outside-container guard in handleFinderDrop (toast fires when cursor.x is outside the scroll container)"
  - "3 regression tests with realistic non-zero getBoundingClientRect mocks exercising production geometry"
affects: [file-tree-enhancements, drag-drop, finder-import, wkwebview-coordinates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Element.prototype.getBoundingClientRect spy pattern with afterEach restore — unlocks realistic geometry testing that jsdom zero-rects hide"
    - "Co-mount ToastContainer alongside tested component when asserting toast text in DOM"
    - "Hardcoded platform-specific offset constants named explicitly (MACOS_TITLE_BAR_OFFSET) so they are grep-findable for future macOS version adjustments"

key-files:
  created: []
  modified:
    - "src/main.tsx - MACOS_TITLE_BAR_OFFSET constant + offset subtraction in onDragDropEvent dispatch"
    - "src/components/file-tree.tsx - x-axis bounds added to all 4 [data-file-tree-index] hit-test call sites"
    - "src/components/file-tree.test.tsx - repaired 2 existing zero-rect tests (position.x/clientX: * -> 0) + new 3-case describe block with realistic rect mocks"

key-decisions:
  - "Hardcode MACOS_TITLE_BAR_OFFSET = 28 rather than computing at runtime via getCurrentWebview().position() − getCurrentWindow().innerPosition(). Stable on Sonoma/Sequoia per Tauri Issue #10744; runtime computation deferred unless a future macOS version regresses the value."
  - "Fix lives in main.tsx dispatch layer (pre-CustomEvent), keeping file-tree.tsx agnostic of platform. Single point of correction prevents drift across future drag handlers."
  - "Repaired existing drag test (mouseup on folder row) with clientX 60 -> 0 instead of adding a new mock — keeps the zero-rect test as lightweight baseline while the new describe block provides realistic-geometry coverage."
  - "Mount ToastContainer alongside FileTree in the outside-x regression test to assert on actual rendered DOM text rather than on an internal signal."

patterns-established:
  - "Pattern: Platform-specific coordinate corrections live at the Tauri-to-CustomEvent dispatch boundary, not inside UI consumers — prevents diffusion of platform knowledge across components."
  - "Pattern: All cursor-vs-element hit-tests check the full 2D rect (left/right + top/bottom), never y-only, even when rows tile the full width."
  - "Pattern: Regression tests for hit-test geometry use vi.spyOn(Element.prototype, 'getBoundingClientRect') with realistic non-zero rects + afterEach mockRestore, because jsdom's default zero-rects would silently pass buggy y-only code."

requirements-completed: [TREE-04, TREE-05]

# Metrics
duration: 5m
completed: 2026-04-17
---

# Phase 18 Plan 07: Finder Drop Coordinate + Hit-Test Fix (UAT Tests 16 + 17) Summary

**Hardcoded macOS overlay title-bar offset (28 px) subtracted from Tauri onDragDropEvent.payload.position.y in main.tsx, plus 2D-rect x-axis bounds added to all 4 [data-file-tree-index] hit-tests in file-tree.tsx, closing UAT Test 16 (wrong folder) and UAT Test 17 BLOCKER (silent copy on outside-container drop).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T05:40:09Z
- **Completed:** 2026-04-17T05:45:23Z
- **Tasks:** 3
- **Files modified:** 3 (main.tsx, file-tree.tsx, file-tree.test.tsx)

## Accomplishments

- UAT Test 16 (major) fixed: Tauri window-coordinates are now aligned with viewport-relative `getBoundingClientRect()` via a single-point offset subtraction at the dispatch layer (MACOS_TITLE_BAR_OFFSET = 28, matching Tauri Issue #10744 recommendation).
- UAT Test 17 (BLOCKER) fixed: all four cursor-vs-row hit-tests in file-tree.tsx now check the full 2D rect (left/right + top/bottom). The previously-structurally-unreachable "Drop target outside file tree" toast guard at handleFinderDrop:794-803 now fires correctly when cursor.x lies outside the scroll container.
- Regression coverage added: new `describe('finder drop hit-test geometry (UAT Test 17 regression)')` block with 3 cases that mock `Element.prototype.getBoundingClientRect` to return realistic non-zero rects (rows 100..172 px, container 0..280 px), exercising production geometry in CI — closing the exact test gap documented in Plan 18-05 SUMMARY.
- Repaired 2 pre-existing zero-rect tests broken by the x-axis bounds addition: `tree-finder-drop with outside path invokes copy_path` (position.x 5 -> 0) and `mouseup on a folder row invokes rename_file` (clientX 60 -> 0) — both single-character fixes that preserve the tests' original intent by making the zero-rect row match on both axes after the x-axis bounds check was added.

## Task Commits

Each task was committed atomically:

1. **Task 1: Subtract macOS overlay title-bar offset from payload.position.y in main.tsx (UAT Test 16 fix)** - `19f3cc2` (fix)
2. **Task 2: Add x-axis bounds to all 4 [data-file-tree-index] hit-tests in file-tree.tsx (UAT Test 17 fix)** - `a90f7f8` (fix)
3. **Task 3: Regression tests with non-zero rect mocks + repair existing zero-rect tests** - `a551006` (test)

## Files Created/Modified

- `src/main.tsx` — MACOS_TITLE_BAR_OFFSET constant declared at module scope (line 55); subtraction applied inside onDragDropEvent dispatch after DPR division (line 299). DPR correction preserved, anyOutside filter preserved, leave/enter/over/drop branches untouched. +16 / -1 LOC.
- `src/components/file-tree.tsx` — x-axis bounds added to 4 sites: Site 1 onTreeDocMouseMove:437 (intra-tree drag highlight), Site 2 onTreeDocMouseUp:467 (intra-tree drop target resolution), Site 3 handleFinderDragover:759 (Finder drop highlight), Site 4 handleFinderDrop:791 (Finder drop target resolution). Outside-container guard at handleFinderDrop:813 (`showToast({ type: 'error', message: 'Drop target outside file tree' })`) preserved and now reachable. +16 / -4 LOC.
- `src/components/file-tree.test.tsx` — added `afterEach` import; repaired 2 existing zero-rect tests (position.x 5 -> 0, clientX 60 -> 0); added `import { ToastContainer } from './toast'` so the outside-x regression test can assert the toast's rendered text; appended new describe block with 3 it() cases using `vi.spyOn(Element.prototype, 'getBoundingClientRect')` mock + `afterEach(() => getBCRSpy?.mockRestore())` cleanup. +135 / -5 LOC.

## Decisions Made

- **Hardcoded offset vs runtime computation.** The MACOS_TITLE_BAR_OFFSET is a literal `28`. Runtime computation via `getCurrentWebview().position()` minus `getCurrentWindow().innerPosition()` would be more robust across macOS versions, but adds Tauri API surface + async resolution inside the event handler. Per the plan's threat register (T-18-07-06), 28 is stable across Sonoma and Sequoia; deferred runtime computation unless a future macOS version regresses.
- **Dispatch-layer correction vs consumer-layer correction.** Fix lives in main.tsx (pre-CustomEvent dispatch), not inside file-tree.tsx handlers. This keeps the UI consumer agnostic of the platform bug and establishes a single correction point — any future Tauri drag consumer inherits the fix automatically.
- **Repair existing zero-rect tests in place rather than replacing them.** Both the existing `tree-finder-drop with outside path invokes copy_path` test and the pre-existing `mouseup on a folder row invokes rename_file` drag test were repaired with 1-character edits (`position.x: 5 -> 0`, `clientX: 60 -> 0`). This preserves their role as lightweight baselines that validate the basic dispatch → copy_path / rename_file pipeline with degenerate jsdom geometry, while the new describe block provides the realistic-geometry coverage. Simpler than refactoring to full non-zero mocks.
- **Mount ToastContainer in the outside-x regression test.** Asserting `document.body.textContent` requires the toast actually be rendered into the DOM. Since the existing `finder drop` describe block does not render ToastContainer (it tests drop mechanics, not toast text), the new describe block imports `ToastContainer` and renders it via a fragment (`<><FileTree /><ToastContainer /></>`). This exercises the full path from guard → showToast signal → DOM render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Repaired pre-existing `mouseup on a folder row invokes rename_file` drag test broken by Task 2's x-axis bounds check**
- **Found during:** Task 3 (running the full `pnpm vitest run src/components/file-tree.test.tsx` suite)
- **Issue:** Plan 18-07 explicitly called out the need to repair the `tree-finder-drop with outside path invokes copy_path` test (position.x 5 -> 0), but did NOT flag a second pre-existing test at file-tree.test.tsx:398-428 that uses the same zero-rect pattern: `fireEvent.mouseMove(document, { clientX: 60, clientY: 0 })` / `mouseUp` at `clientX: 60`. After Task 2 added `e.clientX >= rect.left && e.clientX <= rect.right` to Site 2 (onTreeDocMouseUp, intra-tree drop), `60 >= 0 && 60 <= 0` became FALSE for the zero-rect row and the hit-test dropped through — so `rename_file` was never called, and `expect(renameArgs).toBeDefined()` failed.
- **Fix:** Applied the same 1-character pattern: `clientX: 60 -> 0` in both `mouseMove` and `mouseUp` events. The `mouseDown` anchor at `clientX: 50` was left alone because it only records the drag START position (the DRAG_THRESHOLD_PX check uses absolute delta `Math.sqrt((x-startX)^2 + (y-startY)^2) >= 5`, so `Math.sqrt((0-50)^2 + (0-50)^2) ≈ 70.7 >= 5` is still TRUE — drag still triggers).
- **Files modified:** src/components/file-tree.test.tsx
- **Verification:** `pnpm vitest run src/components/file-tree.test.tsx` all 34 tests pass.
- **Committed in:** a551006 (Task 3 commit, co-housed with the new describe block and the originally-planned position.x repair).
- **Rule rationale:** Rule 1 (auto-fix bugs directly caused by current task's changes). The failure was 100% caused by Task 2's x-axis bounds addition; the fix pattern was already approved by the plan for the sibling test; zero risk of scope creep.

**2. [Rule 1 - Bug] Mounted ToastContainer alongside FileTree in outside-x regression test so toast text is assertable**
- **Found during:** Task 3 (first run of new `finder drop hit-test geometry` describe block)
- **Issue:** The plan's Edit Set B prescribed `expect(document.body.textContent).toContain('Drop target outside file tree')` for the outside-x test. But `showToast()` in toast.tsx writes to a module-local `toasts` signal that is only rendered to the DOM by the `<ToastContainer />` component. The plan's test renders only `<FileTree />`, so the `toasts` signal mutates but nothing appears in `document.body.textContent` — the assertion failed with received text "File Tree/tmp/projsrcREADME.md1.0Kindex.ts2.0K".
- **Fix:** Added `import { ToastContainer } from './toast'` and changed `render(<FileTree />)` to `render(<><FileTree /><ToastContainer /></>)` so the ToastContainer subscribes to the signal and renders the toast into the DOM. No changes to runtime behavior — ToastContainer is already mounted in production via App() in main.tsx.
- **Files modified:** src/components/file-tree.test.tsx
- **Verification:** Targeted `pnpm vitest run src/components/file-tree.test.tsx -t "finder drop hit-test geometry"` — 3/3 pass.
- **Committed in:** a551006 (Task 3 commit).
- **Rule rationale:** Rule 1 (auto-fix bug in test construction caused directly by Task 3's own plan scope). The plan's prescribed assertion was structurally impossible without ToastContainer rendering; the fix is a test-only mount with no behavioral impact.

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs in test support)
**Impact on plan:** Both deviations were test-side repairs necessary to make the plan's prescribed assertions actually executable. No production code changes beyond what the plan specified. No scope creep — the 4 production-code edits (main.tsx constant, main.tsx subtraction, 4 file-tree.tsx hit-tests) match the plan exactly.

## Issues Encountered

- Running `pnpm test -- --run src/components/file-tree.test.tsx` also exercises sidebar.test.tsx (which fails unrelated on a Tauri API listen-before-mock issue in terminal-tabs.tsx). Switched to `pnpm vitest run src/components/file-tree.test.tsx` which scopes to just the plan's target file. The sidebar failure is pre-existing and out-of-scope per the executor `SCOPE BOUNDARY` rule — logged here for awareness, NOT fixed.

## Verification

### Acceptance Grep Proof

```
grep -c "MACOS_TITLE_BAR_OFFSET" src/main.tsx                        → 2  (declaration + usage)  ✓ >= 2
grep -c "rect.left" src/components/file-tree.tsx                     → 6  (4 new hit-tests + 2 pre-existing headerMenu uses)  ✓ >= 4
grep -c "rect.right" src/components/file-tree.tsx                    → 4  (exactly the 4 new hit-tests)  ✓ >= 4
grep -c "Drop target outside file tree" src/components/file-tree.tsx → 1  ✓ >= 1 (outside-container guard preserved)
grep -c "vi.spyOn(Element.prototype, 'getBoundingClientRect'" src/components/file-tree.test.tsx → 1  ✓ >= 1
grep -c "position: { x: 5, y: 0 }" src/components/file-tree.test.tsx → 0  ✓ == 0 (bogus pre-fix coordinate gone)
```

### Type + Test Proof

```
pnpm tsc --noEmit                                                   → exit 0  ✓
pnpm vitest run src/components/file-tree.test.tsx                    → 34/34 pass, 0 fail  ✓
pnpm vitest run -t "finder drop hit-test geometry"                   → 3/3 pass (new describe block)  ✓
pnpm vitest run -t "tree-finder-drop with outside path"              → 1/1 pass (repaired existing test)  ✓
```

### Task 2 Site Verification

Line numbers after edits (all four x-axis bounds now present):
- Site 1 onTreeDocMouseMove:437  `if ( e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom )`
- Site 2 onTreeDocMouseUp:467    `if ( e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom )`
- Site 3 handleFinderDragover:759  `if ( position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom )`
- Site 4 handleFinderDrop:791    `if ( position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom )`

### Known Stubs

None. Scanned main.tsx and file-tree.tsx for TODO/FIXME/placeholder patterns; only matches are legitimate `placeholder={…}` attribute values on the inline-create `<input>` element (unchanged by this plan).

### Threat Flags

None. This plan strictly narrows existing surface (adds x-axis rejection to hit-tests, subtracts a constant from y). No new network endpoints, no new file access patterns, no new IPC. Trust-boundary inventory in the plan's `<threat_model>` (T-18-07-01..07) fully covers the changed surface; no new flags discovered.

## Next Phase Readiness

- UAT Tests 16 and 17 closed. Finder drop pipeline now has correct coordinate translation (y-axis overlay offset compensated) and correct hit-test bounds (full 2D rect). Data-integrity blocker resolved.
- Remaining Phase 18 gap-closure plans (18-08, 18-09) are unaffected by this change — they target different UAT bugs.
- Intra-tree drag handlers (Sites 1+2) now also have proper 2D bounds, defending against any future similar bug where cursor-y happens to coincide with a row while cursor-x is outside the panel.

## Self-Check: PASSED

- FOUND: src/main.tsx (Task 1 edits)
- FOUND: src/components/file-tree.tsx (Task 2 edits)
- FOUND: src/components/file-tree.test.tsx (Task 3 edits)
- FOUND: .planning/phases/18-file-tree-enhancements/18-07-SUMMARY.md
- FOUND: 19f3cc2 — fix(18-07): subtract macOS overlay title-bar offset in onDragDropEvent
- FOUND: a90f7f8 — fix(18-07): add x-axis bounds to 4 [data-file-tree-index] hit-tests
- FOUND: a551006 — test(18-07): add x-axis hit-test regression tests with non-zero rect mocks

---
*Phase: 18-file-tree-enhancements*
*Completed: 2026-04-17*
