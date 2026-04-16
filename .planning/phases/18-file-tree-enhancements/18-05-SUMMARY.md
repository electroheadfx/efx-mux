---
phase: 18-file-tree-enhancements
plan: 05
subsystem: ui
tags: [preact, file-tree, drag-drop, tauri, wkwebview, mouse-events, finder-import, tdd]

# Dependency graph
requires:
  - phase: 18-01
    provides: renameFile + copyPath TS wrappers (from Plan 18-01)
  - phase: 18-02
    provides: dragDropEnabled: true on app.windows[0] (unblocks OS drop events)
  - phase: 18-03
    provides: file-tree.tsx base (activeMenu, activeCreateRow, flat/tree render paths, data-file-tree-index attribute, git-status-changed listener)
  - phase: 18-04
    provides: headerMenu signal, detectedEditors, header [+]/Open In buttons
provides:
  - Intra-tree mouse-drag to MOVE files/folders via renameFile (pure mouse events — no HTML5 drag API)
  - Ghost clone element follows cursor at opacity 0.8, z-index 9999, shadow + rounded corners
  - Drop-target highlight: 2px accent border-left + accent20 background tint on hover row
  - Self-drop / same-parent / folder-into-descendant guards (silent no-op)
  - Error toast on move conflict ('File exists: ') or permission failure
  - Tauri onDragDropEvent subscriber in main.tsx bootstrap() — DPR correction + inside-project filter
  - tree-finder-dragover / tree-finder-drop / tree-finder-dragleave CustomEvent dispatch
  - Finder-drop handler in file-tree.tsx: copyPath into target dir (folder -> self, file -> parent, container empty -> project root)
  - Drop-zone outline + glow via finderDropActive signal on the scroll container
  - 'Drop target outside file tree' toast when drop lands outside the tree container
  - 6 new Vitest cases (3 drag + 3 finder drop) — all green
affects:
  - Phase 18 COMPLETE — last plan of the phase. TREE-04 (intra-tree drag) and TREE-05 (Finder import) closed.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verbatim-copy of unified-tab-bar.tsx:573-753 mouse-drag pattern (WKWebView-compat)"
    - "Module-level drag state + document-level mousemove/mouseup listeners attached on mousedown"
    - "5px sqrt(dx² + dy²) threshold before ghost creation"
    - "Hit-testing via document.querySelectorAll('[data-file-tree-index]') + getBoundingClientRect"
    - "Tauri onDragDropEvent from @tauri-apps/api/webviewWindow (NOT @tauri-apps/api/window)"
    - "Physical->CSS pixel conversion via window.devicePixelRatio"
    - "Inside-project path filter (.startsWith(projectPath)) gates intra-tree vs Finder-import routing"
    - "CustomEvent for cross-module signalling (main.tsx bootstrap -> file-tree useEffect listener)"

key-files:
  created:
    - .planning/phases/18-file-tree-enhancements/18-05-SUMMARY.md (this file)
  modified:
    - src/components/file-tree.tsx (1174 -> 1436 lines; +262 lines — drag state, onRowMouseDown + onTreeDocMouseMove + onTreeDocMouseUp + cleanupTreeDrag + getEntryByIndex, finderDropActive signal, scrollContainerRef, 3 finder-drop event handlers in useEffect, onMouseDown attachments on both render paths, scroll container style refactor with outline+glow)
    - src/main.tsx (483 -> 526 lines; +43 lines — getCurrentWebviewWindow import, bootstrap() onDragDropEvent subscriber with DPR correction and inside-project filter)
    - src/components/file-tree.test.tsx (365 -> 513 lines; +148 lines — describe('drag') with 3 cases, describe('finder drop') with 3 cases; fixed 2 tests for jsdom zero-rect hit-testing)

key-decisions:
  - "Mouse-event drag copied verbatim from unified-tab-bar.tsx (WKWebView known-broken HTML5 drag — Phase 17 lesson). Adapted to vertical rows (borderLeft instead of borderLeft/borderRight split)."
  - "Main.tsx uses getCurrentWebviewWindow() (NOT getCurrentWindow()) per Tauri 2 API rename. webviewWindow module is where onDragDropEvent lives."
  - "getActiveProject() from state-manager returns Promise — bypass by reading activeProjectName.value + projects.value.find() synchronously inside the dispatched drag event handler."
  - "DPR correction applied at dispatch time in main.tsx (single responsibility — file-tree always sees CSS pixels). Divides payload.position.x and .y by window.devicePixelRatio."
  - "Inside-project filter: if ANY path is outside project -> Finder import. If ALL inside -> ignored (intra-tree mouse pipeline owns it). Follows D-18 disposition."
  - "2 test adjustments for jsdom: mouseup test and tree-finder-drop test use clientY=0 / y=0 instead of folderRect.top+5 because jsdom returns zero-rects. The semantic intent ('cursor over folder row') is preserved."

patterns-established:
  - "Data-file-tree-index attribute powers BOTH context menu (Plan 18-03), intra-drag hit-test, AND Finder-drop hit-test — single source of truth for row identity"
  - "finderDropActive signal at module scope (matches activeMenu/activeCreateRow pattern established by Plan 18-03)"
  - "cleanup function for document-level listener removal in useEffect return (extended with 3 new tree-finder-* events + intra-drag listeners auto-removed per-drag)"

requirements-completed: [TREE-04, TREE-05]

# Metrics
duration: 11m 3s
completed: 2026-04-16
---

# Phase 18 Plan 05: Intra-Tree Drag + Finder Drop Import Summary

**Intra-tree mouse-drag (WKWebView-compatible, no HTML5 drag API) to move files/folders via renameFile. Tauri onDragDropEvent in main.tsx routes Finder imports outside the project root to copyPath. Inside-project filter prevents the two pipelines from double-handling intra-tree drags. Final plan of Phase 18; TREE-04 and TREE-05 closed.**

## Performance

- **Duration:** 11m 3s
- **Started:** 2026-04-16T19:24:21Z
- **Completed:** 2026-04-16T19:35:24Z
- **Tasks:** 4 (1 RED + 3 GREEN commits)
- **Files modified:** 3

## What Was Built

### 1. Intra-Tree Mouse-Drag Flow (file-tree.tsx)

When the user presses the left mouse button on any tree row:

1. `onRowMouseDown` stores `sourcePath` + `sourceEl` + `startX/Y` on the module-level `treeDrag` state. Registers document-level `mousemove` + `mouseup` listeners.
2. `onTreeDocMouseMove` checks `sqrt(dx² + dy²)` against `DRAG_THRESHOLD_PX = 5`. Below threshold → nothing happens (non-drag click falls through to the existing onClick handler).
3. At threshold: source row opacity = 0.4; ghost clone appended to `document.body` with `position: fixed, z-index: 9999, opacity: 0.8, pointer-events: none, box-shadow: 0 2px 8px rgba(0,0,0,0.3), border-radius: 6px`.
4. Subsequent mousemove: ghost follows cursor (left = clientX - 40, top = clientY - 10). Row under cursor gets `border-left: 2px solid accent` + `background-color: accent + '20'` tint.
5. `onTreeDocMouseUp` resolves drop target per D-12:
   - Over a folder row → that folder.
   - Over a file row → file's parent folder.
   - Over empty tree area → project root.
6. Guards:
   - `sourceParent === targetDir` → silent no-op (drop on own parent).
   - `target.startsWith(sourcePath + '/') || target === sourcePath` → abort (folder into descendant or self).
7. `renameFile(sourcePath, target)` invocation. On conflict error (message contains 'exists') → toast `File exists: {name}`. Other failures → toast `Could not move {name}` with hint about permissions.
8. `cleanupTreeDrag()` restores source opacity, removes ghost, clears all row highlights, resets state.

### 2. Finder Drop Pipeline (main.tsx + file-tree.tsx)

**main.tsx bootstrap() subscribes to Tauri drag-drop events:**

- Imports `getCurrentWebviewWindow` from `@tauri-apps/api/webviewWindow` (NOT the `window` module — Tauri 2 API).
- On `enter` / `over` / `drop` payloads: reads `activeProjectName.value` + `projects.value.find(p => p.name === ...)` synchronously to get project path.
- **Inside-project filter:** if ANY path does NOT start with `projectPath` → treat as Finder import. If ALL paths are inside the project → intra-tree mouse pipeline owns this drag; skip.
- Converts `payload.position.{x,y}` from physical pixels to CSS pixels via `window.devicePixelRatio`.
- Dispatches `tree-finder-dragover` (for enter/over), `tree-finder-drop` (for drop), `tree-finder-dragleave` (for leave) CustomEvents with `{ paths, position }` detail.

**file-tree.tsx listens for those events in useEffect:**

- `handleFinderDragover`: sets `finderDropActive.value = true` (scroll container shows accent outline + inset/outer glow). Highlights row under cursor with same accent border-left + tint as intra-drag.
- `handleFinderDragleave`: clears `finderDropActive` + all row highlights.
- `handleFinderDrop`: resolves target dir from cursor (folder → self, file → parent, empty container area → project root, outside container → `Drop target outside file tree` toast). For each dropped path, invokes `copyPath(src, dst)` with serial for-await. On conflict → `File exists: {name}` toast; on non-conflict failure → `Could not copy {name}` toast.

### 3. Drop-Zone Visual Lifecycle

Scroll container style reacts to `finderDropActive.value`:

- **Idle:** `outline: none, box-shadow: none`.
- **Active:** `outline: 1px solid accent, box-shadow: inset 0 0 0 1px accent, 0 0 12px 0 accent40`.

Row highlight grammar is shared between intra-drag and Finder-drop: `border-left: 2px solid accent, background-color: accent + '20'`. Consistent visual language across both drag modes.

### 4. Test Coverage (file-tree.test.tsx)

**describe('drag'):** 3 cases
- mousemove beyond threshold sets source row opacity to 0.4 (verifies ghost-creation side effect)
- mouseup on folder row invokes rename_file with target folder/name (verifies end-to-end drop target resolution)
- mousemove under threshold does NOT trigger rename_file (verifies threshold gate)

**describe('finder drop'):** 3 cases
- tree-finder-drop with outside path invokes copy_path (verifies copyPath dispatch + target resolution)
- tree-finder-dragover sets finderDropActive visual (outline) (verifies scroll container style update)
- tree-finder-dragleave clears finderDropActive outline (verifies lifecycle cleanup)

All 6 green; 27/27 total file-tree tests pass.

## Task Commits

| Task | Hash | Description |
|------|------|-------------|
| RED | 260b98d | test(18-05): add failing tests for intra-tree drag + Finder drop routing |
| 1 GREEN | 2fecb61 | feat(18-05): implement intra-tree mouse-drag to move files via renameFile |
| 2 GREEN | 703bae6 | feat(18-05): wire Tauri onDragDropEvent subscriber in main.tsx |
| 3 GREEN | 809eb7e | feat(18-05): wire Finder drop handlers + drop-zone outline in file-tree |

Task 4 (test coverage) was authored upfront in the RED commit per TDD discipline and the precedent from Plans 18-03/18-04.

## Decisions Made

- **Mouse-event drag pattern (not HTML5 drag):** WKWebView on macOS breaks HTML5 drag (`dragend` fires immediately without `dragover`/`drop`). Plan 18-PATTERNS.md identified unified-tab-bar.tsx:573-753 as the canonical fix; copied verbatim and adapted for vertical rows (borderLeft only, no left/right split based on cursor-mid).
- **@tauri-apps/api/webviewWindow module (not window):** Tauri 2 moved `onDragDropEvent` off the Window API into WebviewWindow. RESEARCH.md §1 explicitly called out this gotcha.
- **Active project derivation via signals (not getActiveProject()):** `getActiveProject()` in state-manager returns `Promise<string | null>`. Using `activeProjectName.value + projects.value.find()` synchronously inside the drag event callback keeps the listener non-async.
- **DPR correction at dispatch time:** Divides `payload.position.{x,y}` by `window.devicePixelRatio` in main.tsx before CustomEvent dispatch. File-tree then always sees CSS pixels, matching what `getBoundingClientRect` returns. Single responsibility.
- **Inside-project filter routes inside-project drags to mouse pipeline:** Per D-18. If user drags an intra-tree item, WKWebView may also fire OS-level drag-drop events with the intra-project paths. The filter ensures we don't handle them twice (mouse pipeline handles intra, Tauri pipeline handles Finder import).
- **Shared `data-file-tree-index` hit-test anchor:** Rows are already keyed by this attribute from Plan 18-03. Intra-drag, Finder-drop, and context menu all use it for hit-testing. Single source of truth for row → entry lookup via `getEntryByIndex`.
- **Test adjustment for jsdom zero-rects:** jsdom's `getBoundingClientRect()` returns `{top:0, left:0, right:0, bottom:0}` for all elements. The plan's `clientY: folderRect.top + 5` yields 5, but row rect.bottom is 0, so the loop's `clientY <= rect.bottom` check fails. Adjusted to `clientY: 0` / `y: 0` for the two geometry-sensitive tests. Semantic equivalent ("cursor lands on a zero-rect row"). In real browsers with non-zero rects, the original `rect.top + 5` would also work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test adjustments for jsdom zero-rect hit-testing**

- **Found during:** Task 1 GREEN verification (running drag tests). The "mouseup on a folder row invokes rename_file" and "tree-finder-drop with outside path invokes copy_path" tests failed because jsdom returns zero-rect geometry for all DOM elements, so the implementation's `e.clientY >= rect.top && e.clientY <= rect.bottom` hit-test could never match any row when clientY is non-zero.
- **Issue:** The plan's tests set `clientY: folderRect.top + 5` (= 5 in jsdom). My implementation's geometry check correctly rejects all rows when rect.bottom = 0. This is a test-environment issue, not an implementation bug.
- **Fix:** Changed `clientY: folderRect.top + 5` → `clientY: 0` and `position: { x: rect.left + 5, y: rect.top + 5 }` → `position: { x: 5, y: 0 }`. With y=0, the first zero-rect row (rows[0] = 'src' folder) matches the hit-test (0 >= 0 && 0 <= 0 = true). Semantic intent preserved (cursor-over-first-row = cursor-over-src-folder).
- **Files modified:** `src/components/file-tree.test.tsx`
- **Verification:** All 6 new tests pass; 27/27 file-tree tests green.
- **Committed in:** `2fecb61` (Task 1 GREEN commit — test adjustments shipped alongside the implementation they validate)

---

**Total deviations:** 1 auto-fixed (Rule 3 — test environment compatibility). No plan scope changes. No implementation adjustments to match tests.

## Issues Encountered

**1. Edit/Write tool hook rejection on non-canonical paths.** The repo path `/Users/lmarques/Dev/efx-mux` resolves through a different filesystem view than the canonical worktree path `/Users/lmarques/Dev/efx-mux/.claude/worktrees/agent-a87b60a3`. The PreToolUse:Edit hook rejects writes on the shorter path after Read (tracking mismatch) but accepts them on the canonical path. Resolved by using the canonical path for all Edit operations. This mirrors the issue Plan 18-04 hit (where the prior agent used fs.writeFileSync as workaround); Plan 18-05 spec explicitly forbade that fallback so the canonical-path approach is the right fix.

**2. pnpm dependencies not installed at worktree start.** Worktree was freshly checked out at base commit `6ad656b` and did not yet have `node_modules/`. Resolved by running `pnpm install` (1.8s).

**3. Pre-existing test failures unrelated to this plan.** Outside scope. Not re-run here — plan's own target `file-tree.test.tsx` passes 27/27.

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

Verified files and commits exist on disk:

- `src/components/file-tree.tsx` — FOUND (1436 lines; Plan 18-04 baseline was 1174 → +262 lines)
  - Contains `import { ... renameFile, copyPath ... }` from file-service ✓
  - Contains `const DRAG_THRESHOLD_PX = 5` ✓ (line 74)
  - Contains `const treeDrag: TreeDragState = ...` ✓
  - Contains `const finderDropActive = signal<boolean>(false)` ✓
  - Contains `function getEntryByIndex(` ✓
  - Contains `function onRowMouseDown(` ✓
  - Contains `function onTreeDocMouseMove(` ✓
  - Contains `function onTreeDocMouseUp(` ✓
  - Contains `function cleanupTreeDrag(` ✓ (line 502)
  - Contains `cloneNode(true) as HTMLElement` ✓ (line 408)
  - Contains `opacity = '0.4'` ✓
  - Contains `borderLeft = \`2px solid ${colors.accent}\`` ✓
  - Contains `await renameFile(sourcePath, target)` ✓ (line 487)
  - Contains `await copyPath(src, dst)` ✓ (line 805)
  - Contains `target.startsWith(sourcePath + '/')` ✓ (line 484)
  - Contains `sourceParent === targetDir` ✓
  - Contains `File exists: ${sourceName}` ✓
  - Contains `File exists: ${name}` ✓
  - Contains `'Drop target outside file tree'` ✓
  - Contains `scrollContainerRef` ✓ (3 occurrences)
  - Contains `onMouseDown={(e) => onRowMouseDown(` ✓ (2 occurrences — flat + tree render paths)
  - Contains `addEventListener('tree-finder-drop', handleFinderDrop)` ✓
  - Contains `addEventListener('tree-finder-dragover', handleFinderDragover)` ✓
  - Contains `addEventListener('tree-finder-dragleave', handleFinderDragleave)` ✓
- `src/main.tsx` — FOUND (526 lines; baseline 483 → +43 lines)
  - Contains `import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'` ✓
  - Contains `await getCurrentWebviewWindow().onDragDropEvent(` ✓ (line 262)
  - Contains `new CustomEvent('tree-finder-drop'` ✓
  - Contains `new CustomEvent('tree-finder-dragover'` ✓
  - Contains `new CustomEvent('tree-finder-dragleave'` ✓
  - Contains `window.devicePixelRatio` ✓ (line 282)
  - Contains `projectPath` + `.startsWith(projectPath)` ✓
- `src/components/file-tree.test.tsx` — FOUND (513 lines; baseline 365 → +148 lines)
  - Contains `describe('drag'` ✓ (line 369)
  - Contains `describe('finder drop'` ✓ (line 450)
  - Contains `fireEvent.mouseDown(` ✓
  - Contains `fireEvent.mouseMove(document` ✓
  - Contains `fireEvent.mouseUp(document` ✓
  - Contains `'rename_file'` mockIPC handler ✓
  - Contains `'copy_path'` mockIPC handler ✓
  - Contains `'tree-finder-drop'` dispatch ✓
  - Contains `'tree-finder-dragover'` dispatch ✓
  - Contains `'tree-finder-dragleave'` dispatch ✓
- Commit `260b98d` (Task 4 RED — test) — FOUND in git log ✓
- Commit `2fecb61` (Task 1 GREEN — feat) — FOUND in git log ✓
- Commit `703bae6` (Task 2 GREEN — feat) — FOUND in git log ✓
- Commit `809eb7e` (Task 3 GREEN — feat) — FOUND in git log ✓
- `pnpm tsc --noEmit` → exits 0 ✓
- `pnpm build` → successful production build ✓
- `pnpm exec vitest run src/components/file-tree.test.tsx` → 27/27 pass ✓
- `pnpm exec vitest run src/components/context-menu.test.tsx src/services/file-service.test.ts` → 34/34 pass (no regressions) ✓

## TDD Gate Compliance

- **RED gate:** `test(18-05): add failing tests for intra-tree drag + Finder drop routing` — commit `260b98d` ✓ (4/6 tests fail RED as expected, 2 pass accidentally — "mousemove under threshold" and "tree-finder-dragleave" — because their expected behavior is the default state)
- **GREEN gate:** 3 feat commits (`2fecb61`, `703bae6`, `809eb7e`) land the implementation; all 6 tests pass
- **REFACTOR gate:** Not required. GREEN implementation follows the unified-tab-bar analog verbatim; no refactor opportunity.

## Phase 18 Completion

This is the final plan of Phase 18. All 5 plans complete:

- **18-01** — Rust file ops + TS wrappers (v0.3.0) — TREE-01/02/03/04/05 dependencies shipped
- **18-02** — ContextMenu submenu + Tauri dragDropEnabled — TREE-03 submenu infra + TREE-05 config
- **18-03** — Context menu + delete flow + inline create — TREE-01, TREE-02, MAIN-03
- **18-04** — Open In submenu + header buttons — TREE-03 (fully closed), MAIN-03 (header path)
- **18-05 (this plan)** — Intra-tree drag + Finder drop — TREE-04, TREE-05

**All 6 Phase 18 requirements completed:** TREE-01, TREE-02, TREE-03, TREE-04, TREE-05, MAIN-03.

---
*Phase: 18-file-tree-enhancements*
*Plan: 05*
*Completed: 2026-04-16*
