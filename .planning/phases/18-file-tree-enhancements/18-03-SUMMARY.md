---
phase: 18-file-tree-enhancements
plan: 03
subsystem: ui
tags: [preact, file-tree, context-menu, delete, create, keyboard, tauri, tdd]

# Dependency graph
requires:
  - phase: 18-01
    provides: deleteFile + createFile + createFolder TS wrappers, count_children Rust command, git-status-changed emit on mutations
  - phase: 18-02
    provides: ContextMenu component with children submenu field (not yet consumed by 18-03; submenu lands in 18-04)
  - phase: 15-foundation-primitives
    provides: ContextMenu base component, ConfirmModal base component, FileError class, file-service CRUD wrappers
provides:
  - Right-click context menu on tree rows with New File / New Folder / Delete items
  - Delete key + Cmd+Backspace keyboard shortcuts (both flat and tree modes) that route through ConfirmModal
  - Child-count-aware folder delete confirm message ("and N items" / "and 10000+ items")
  - InlineCreateRow Preact component — VSCode-style inline input with autofocus, Enter commit, Escape cancel, blur commit
  - Inline validation: empty → "Name required"; slash/null → "Invalid characters"; conflict → "'{name}' already exists"
  - git-status-changed Tauri event listener that re-renders tree (initTree for tree mode, loadDir for flat mode)
  - selectedIndex clamp after delete to prevent UI crash on empty list
  - 7 new Vitest test cases across 3 describe blocks (context menu, delete key, inline create)
affects:
  - Plan 18-04 (header buttons + external-editor "Open In" submenu — will extend the same context menu)
  - Plan 18-05 (intra-tree drag + Finder drop — will share the data-file-tree-index hit-testing pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Menu state as module-level signal (activeMenu signal<MenuState | null>) — keeps right-click state out of component props"
    - "Signal-backed inline create row state (activeCreateRow) — render conditionally alongside tree rows, unmount on onDone callback"
    - "Committed ref pattern in InlineCreateRow (committedRef.current boolean) — prevents double-commit race between Enter keydown and onBlur"
    - "Error-preserving onBlur: on validation/conflict failure, committedRef reset and input re-focused via requestAnimationFrame so user can fix and retry without row unmount"
    - "Per-row onContextMenu handler captures entry by closure at right-click time — no race with selectedIndex changes (T-18-03-05 mitigation)"
    - "selectedIndex clamp Math.min(selectedIndex.value, flatLen) where flatLen = max(0, length-1) — survives empty list after batch delete"

key-files:
  created: []
  modified:
    - src/components/file-tree.tsx (685 → 992 lines; +307 lines — context menu wiring, triggerDeleteConfirm, InlineCreateRow, Delete/Cmd+Backspace in both keydown handlers, onContextMenu on both render paths, ContextMenu at root, git-status-changed listener)
    - src/components/file-tree.test.tsx (81 → 225 lines; +144 lines — 3 new describe blocks with 7 test cases)
    - src/components/context-menu.tsx (ContextMenuItem.icon type widened to ComponentType<{ size?: number | string }> — accommodates lucide-preact LucideIcon whose LucideProps.size is string | number)

key-decisions:
  - "InlineCreateRow merged into Task 1 GREEN commit: the component reference appears inside Task 1's JSX render blocks (New File / New Folder menu actions insert an activeCreateRow which the render paths dereference), so the component had to be defined alongside Task 1's tree edits for the code to compile and for tests to pass."
  - "Relaxed ContextMenuItem.icon from ComponentType<{ size?: number }> to ComponentType<{ size?: number | string }> (Rule 3 — blocking). Lucide-preact's LucideIcon carries LucideProps where size is string | number; the current Phase 18-02 type annotation was too strict for the first real consumer (this plan). Change is additive and backward-compatible."
  - "Delete keyboard handler added to BOTH flat and tree keydown switches instead of a shared Delete dispatcher, because the two paths read from different data sources (entries.value[i] vs flattenedTree.value[i].entry)."
  - "Plain Backspace preserved for parent navigation in flat mode (existing behavior). Only Cmd+Backspace triggers delete — matches macOS convention. Tree mode's Backspace is Cmd-gated only (plain Backspace is not bound in tree mode)."
  - "Folder child count on delete confirm uses try/catch fallback: on IPC error, suffix becomes empty string and the modal still renders with a generic 'will be permanently deleted' message. Never blocks the delete path on count failure."

patterns-established:
  - "Context menu triggered by onContextMenu on each data-file-tree-index row; menu items built per-entry via buildRowMenuItems; menu rendered at component root under conditional {activeMenu.value && ...}"
  - "Inline create flow: context menu action sets activeCreateRow signal → render paths conditionally render <InlineCreateRow> after the row whose index matches activeCreateRow.afterIndex → onDone callback clears the signal"
  - "Auto-expand collapsed folder when opening New File / New Folder on a tree-mode folder (toggleTreeNode before render) — matches VSCode UX"

requirements-completed: [TREE-01, TREE-02, MAIN-03]

# Metrics
duration: 6m 0s
completed: 2026-04-16
---

# Phase 18 Plan 03: File Tree Context Menu + Delete + Inline Create Summary

**Right-click context menu with Delete (menu + Delete key + Cmd+Backspace), child-count-aware confirm modal, VSCode-style inline New File / New Folder input, and git-status-changed listener — all wired into the existing file-tree.tsx on both flat and tree render paths.**

## Performance

- **Duration:** 6m 0s
- **Started:** 2026-04-16T18:55:24Z
- **Completed:** 2026-04-16T19:01:24Z
- **Tasks:** 3 (Task 2 + Task 3 folded into Task 1 GREEN per TDD structure)
- **Files modified:** 3

## Accomplishments
- Right-click on any tree row opens a ContextMenu with New File / New Folder / Delete items
- Delete key on focused scroll container (both flat and tree modes) routes through ConfirmModal with `confirmLabel: 'Delete'`
- Cmd+Backspace triggers the same delete flow on macOS; plain Backspace still navigates to parent in flat mode (existing behavior preserved)
- Folder deletion confirm message includes recursive child count: "'node_modules' and 7 items will be permanently deleted..." or "'node_modules' and 10000+ items..." when count_children returns capped:true
- InlineCreateRow component: autofocused input mounts under the target folder; Enter commits via createFile/createFolder; Escape unmounts without mutation; blur commits (only if valid)
- Inline validation: empty → "Name required"; contains `/` or `\0` → "Invalid characters (no / or null)"; Rust-side conflict → "'{name}' already exists" with input re-focused for retry
- git-status-changed Tauri event listener in useEffect refreshes the tree (initTree / loadDir) after any mutation from anywhere in the app
- selectedIndex clamp after delete — `Math.min(selectedIndex.value, flatLen)` where `flatLen = max(0, length - 1)` — prevents UI crash on empty list (T-18-03-03 mitigation)
- 7 new Vitest cases pass (context menu: 2; delete key: 2; inline create: 3); total 14 in file-tree.test.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests for context menu, delete flow, inline create** — `8e33e6c` (test)
2. **Task 1 GREEN + Task 2 implementation + Task 3 coverage** — `2bb2227` (feat)

_Note: Task 2's InlineCreateRow had to be defined alongside Task 1's render-path edits because the new JSX unconditionally references the component — see "Deviations from Plan" below. Task 3's tests were written upfront in the RED commit, consistent with TDD ordering._

## Files Created/Modified
- `src/components/file-tree.tsx` — Imports for useState/useRef/lucide-preact/listen/ContextMenu/showConfirmModal/showToast/file-service; activeMenu and activeCreateRow module-level signals; triggerDeleteConfirm helper with count_children fetch; buildRowMenuItems constructor; handleRowContextMenu handler; InlineCreateRow component with autofocus/validation/error-preserving commit; Delete and Cmd+Backspace cases in handleFlatKeydown and handleTreeKeydown; onContextMenu on all tree rows; ContextMenu rendered at component root; git-status-changed listener in useEffect with cleanup
- `src/components/file-tree.test.tsx` — 3 new describe blocks (context menu, delete key, inline create) with 7 test cases covering menu render on right-click, New File/New Folder presence, Delete key dispatch, Backspace pass-through, input mount, Escape unmount, empty-name error surface
- `src/components/context-menu.tsx` — ContextMenuItem.icon type widened from `ComponentType<{ size?: number }>` to `ComponentType<{ size?: number | string }>` for lucide-preact compatibility (see Deviations §Rule 3)

## Decisions Made
- **Merge InlineCreateRow into Task 1 GREEN:** The component reference is embedded in both render-path JSX (flat and tree mode) as part of Task 1's context-menu wiring. Defining the component in a later commit would leave the repo in a non-compiling intermediate state. Keeping the RED/GREEN split clean required the component to ship with the render edits.
- **Split Delete keyboard case per view mode:** handleFlatKeydown reads from `entries.value[selectedIndex.value]`; handleTreeKeydown reads from `flattenedTree.value[selectedIndex.value]?.entry`. Different data sources — duplicating the 4-line switch case is cleaner than pulling out a shared dispatcher.
- **Try/catch fallback on count_children:** If the IPC call fails (permissions, filesystem error), the confirm message gracefully degrades to "will be permanently deleted" without the "(N items)" suffix rather than blocking the delete path. Matches plan's CONTEXT.md D-02 spirit — count is informational, not a gate.
- **Cmd+Backspace on tree mode added despite no pre-existing Backspace case:** The plan explicitly calls for it ("For `handleTreeKeydown`, there is currently NO `Backspace` case. Add one AFTER the existing `ArrowLeft` case"). Added both Delete and Cmd+Backspace cases, the latter guarded by `e.metaKey`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened ContextMenuItem.icon type to accept lucide-preact LucideIcon**
- **Found during:** Task 1 GREEN (implementing buildRowMenuItems)
- **Issue:** Plan says "icon: FilePlus" from lucide-preact. context-menu.tsx's `ContextMenuItem.icon?: ComponentType<{ size?: number }>` rejected `FilePlus` because LucideIcon's `size` is `string | number`, not just `number`. TS2322 errors at 3 call sites.
- **Fix:** Changed the type to `ComponentType<{ size?: number | string }>`. Additive change — all existing `{ size?: number }`-compatible consumers still pass the new constraint. Added an explanatory comment near the field.
- **Files modified:** `src/components/context-menu.tsx`
- **Verification:** `pnpm tsc --noEmit` clean; `pnpm exec vitest run src/components/context-menu.test.tsx` → 12/12 green
- **Committed in:** `2bb2227` (part of Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Merged Task 2 (InlineCreateRow implementation) into Task 1 GREEN commit**
- **Found during:** Task 1 GREEN implementation
- **Issue:** Task 1's changes to the flat-mode and tree-mode `.map()` blocks insert unconditional `<InlineCreateRow parentDir={cr.parentDir} kind={cr.kind} .../>` JSX. If InlineCreateRow is not defined in the same commit, the file fails type-check and the test suite fails to boot.
- **Fix:** Added the complete `InlineCreateRow` component (props interface + function body with useState/useRef/useEffect hooks, validation, commit/cancel flow, error rendering) before the `export function FileTree()` definition. Plan's Task 2 Step 1 was executed as part of Task 1 GREEN.
- **Files modified:** `src/components/file-tree.tsx`
- **Verification:** `pnpm tsc --noEmit` clean; 14/14 tests in file-tree.test.tsx green
- **Committed in:** `2bb2227` (Task 1 GREEN commit)
- **Impact:** Task 2's separate commit was not created. The plan's 3-task structure is represented as 2 commits (RED + combined GREEN). Per TDD convention this is an acceptable compaction when Task 2's deliverables are structurally inseparable from Task 1's — the alternative is an intermediate non-compiling commit, which is worse.

**3. [Rule 3 - Blocking] Merged Task 3 (test coverage) into Task 1 RED commit**
- **Found during:** Task 1 RED planning
- **Issue:** Task 1 is `tdd="true"`. Writing failing tests first (TDD RED) means writing tests for Task 2 and Task 3's behavior too, because a TDD RED commit should capture the full test surface before implementation.
- **Fix:** Wrote all 7 new test cases (3 describe blocks) upfront in the RED commit. Task 3's work is entirely test authorship — it was completed during the RED phase of Task 1.
- **Files modified:** `src/components/file-tree.test.tsx`
- **Verification:** After Task 1 GREEN, all 7 new tests + 7 existing tests → 14/14 green
- **Committed in:** `8e33e6c` (Task 1 RED commit)

---

**Total deviations:** 3 auto-fixed (1 type widening for library compat, 2 task-structure compaction to avoid non-compiling intermediate states)
**Impact on plan:** No scope creep; all task acceptance criteria met in fewer commits. The 2-commit structure (RED + merged GREEN) is consistent with TDD when tasks have structural code-dependency.

## Issues Encountered

**1. pnpm tsc surfaced 3 LucideIcon type errors on first build.** Caused by overly narrow `icon` type in context-menu.tsx (shipped by Plan 18-02 as `ComponentType<{ size?: number }>`, but lucide-preact's `LucideIcon = FunctionComponent<LucideProps>` has `size?: string | number`). Resolved via Rule 3 type widening (see Deviation #1).

**2. `.planning/config.json` has a one-line modification** (`"_auto_chain_active": true` — was `false`). This was already present in the worktree at agent start (not caused by any task action) and belongs to the orchestrator's state-management sphere. Left untouched per parallel-executor rule "Do NOT modify STATE.md or ROADMAP.md" — config.json's mutation is the orchestrator's responsibility, not the executor's.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

Verified all files and commits exist:

- `src/components/file-tree.tsx` — FOUND (992 lines; plan min_lines: 900 ✓)
  - Contains `import { ContextMenu` ✓
  - Contains `import { showConfirmModal } from './confirm-modal'` ✓
  - Contains `import { deleteFile, createFile, createFolder } from '../services/file-service'` ✓
  - Contains `import { listen } from '@tauri-apps/api/event'` ✓
  - Contains `import { Trash2, FilePlus, FolderPlus }` ✓
  - Contains `function triggerDeleteConfirm(` ✓ (6 occurrences — definition + keydown + menu actions)
  - Contains `confirmLabel: 'Delete'` ✓
  - Contains `invoke<ChildCount>('count_children'` ✓
  - Contains `case 'Delete'` ✓ (2 occurrences — one per keydown handler)
  - Contains `e.metaKey` ✓ (2 occurrences — one per keydown handler)
  - Contains `onContextMenu={` ✓ (2 occurrences — one per render path)
  - Contains `<ContextMenu` ✓
  - Contains `listen('git-status-changed'` ✓
  - Contains `activeMenu.value = null` ✓
  - Contains `Math.min(selectedIndex.value, flatLen)` ✓
  - Contains `function InlineCreateRow(` ✓
  - Contains `'Name required'` ✓
  - Contains `'Invalid characters (no / or null)'` ✓
  - Contains `'already exists'` ✓
  - Contains `aria-invalid` ✓
  - Contains `activeCreateRow.value = null` ✓ (2 occurrences)
  - Contains `<InlineCreateRow` ✓ (2 occurrences — one per render path)
  - Contains `await createFile(target)` ✓
  - Contains `await createFolder(target)` ✓
- `src/components/file-tree.test.tsx` — FOUND (225 lines)
  - Contains `describe('context menu'` ✓
  - Contains `describe('delete key'` ✓
  - Contains `describe('inline create'` ✓
  - Contains `fireEvent.contextMenu(` ✓
  - Contains `fireEvent.keyDown(fileList, { key: 'Delete' })` ✓
  - Contains `'Name required'` ✓
  - Contains `count_children` ✓
- `src/components/context-menu.tsx` — FOUND (213 lines, 210 → 213)
  - Contains widened `ComponentType<{ size?: number | string }>` ✓
- Commit `8e33e6c` (Task 1 RED) — FOUND in git log ✓
- Commit `2bb2227` (Task 1 GREEN + Task 2 + Task 3) — FOUND in git log ✓
- `pnpm tsc --noEmit` exits 0 ✓
- `pnpm exec vitest run src/components/file-tree.test.tsx` → 14/14 pass ✓
- `pnpm exec vitest run src/components/context-menu.test.tsx` → 12/12 pass ✓ (no regression)
- `pnpm exec vitest run src/services/file-service.test.ts` → 22/22 pass ✓ (no regression)

## TDD Gate Compliance

- **RED gate:** `test(18-03): add failing tests for context menu, delete flow, inline create` — commit `8e33e6c` ✓
- **GREEN gate:** `feat(18-03): wire context menu + Delete key flow in file-tree.tsx` — commit `2bb2227` ✓
- **REFACTOR gate:** Not required — initial GREEN implementation is clean and follows existing analog patterns (unified-tab-bar mouse-drag scaffolding, context-menu submenu pattern, file-service wrapper shape). No refactor opportunity surfaced.

## Next Phase Readiness

- **Plan 18-04 (header [+] + external-editor "Open In")** can now extend `buildRowMenuItems` with the `children` array of detected editors. The ContextMenuItem.children field (shipped by 18-02) is ready; lucide icons for detected editors are already in the package.
- **Plan 18-05 (intra-tree drag + Finder import)** can reuse the `data-file-tree-index` attribute for hit-testing and the row rendering structure is stable. The git-status-changed listener added here will automatically refresh the tree after any Finder-copy or intra-move operation, no additional wiring needed.
- **No architectural blockers** — the ContextMenu children type is now compatible with lucide-preact across the board.

## Downstream Consumers

This plan ships the menu infrastructure and the delete/create flows TREE-01, TREE-02, MAIN-03 require:

- **TREE-01 (Delete via context menu)** — ✓ menu + ConfirmModal + deleteFile wired end-to-end
- **TREE-02 (Delete via Delete key)** — ✓ both Delete and Cmd+Backspace routed through same confirm flow
- **MAIN-03 (Create new file from folder context)** — ✓ right-click folder → New File / New Folder → inline input → createFile/createFolder IPC

Plans 18-04 (TREE-03 external editors) and 18-05 (TREE-04 intra-drag, TREE-05 Finder import) remain for later waves.

---
*Phase: 18-file-tree-enhancements*
*Plan: 03*
*Completed: 2026-04-16*
