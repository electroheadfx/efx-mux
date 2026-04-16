---
phase: quick-260416-uig
plan: 01
subsystem: ui
tags: [preact, signals, context-menu, file-tree, hover, user-select, polish]

requires:
  - phase: 18-file-tree-enhancements
    provides: "File tree flat/tree render paths and ContextMenu with submenu support"
provides:
  - "Per-item hover background tint (colors.bgSurface) on every ContextMenu item, main menu + submenu"
  - "File tree row hoveredIndex signal decoupled from selectedIndex — hover no longer steals click-selection"
  - "userSelect:'none' on file tree rows so right-click does not highlight the filename text"
affects: [ui polish, right-click flows, visual keyboard-vs-mouse feedback]

tech-stack:
  added: []
  patterns:
    - "Local useState hoveredIndex in ContextMenu (each instance; submenu inherits via recursion)"
    - "Module-scope signal hoveredIndex = signal(-1) alongside selectedIndex in file-tree.tsx"
    - "Row-style ternary: submenu-open cue > hover tint > transparent (precedence enforced by order)"

key-files:
  created: []
  modified:
    - src/components/context-menu.tsx
    - src/components/context-menu.test.tsx
    - src/components/file-tree.tsx
    - src/components/file-tree.test.tsx

key-decisions:
  - "Use per-ContextMenu instance useState for hoveredIndex (not a shared signal) so submenus naturally have independent hover state via the recursive render."
  - "Keep submenuIndex === i branch FIRST in the ContextMenu style ternary so an open-submenu row keeps its distinct bgBorder cue even when hovered."
  - "Do not couple filename color to hoveredIndex. Color remains driven solely by isSelected (click-/keyboard-selected) — this is the core of bug 3's fix."
  - "Guard onMouseLeave with 'if (hoveredIndex.value === i)' before clearing so a faster cursor doesn't accidentally clear a newer hover that already moved on."

patterns-established:
  - "ContextMenu hover state: useState<number|null> alongside existing submenuIndex; setHoveredIndex(i) in onMouseEnter, setHoveredIndex(null) in onMouseLeave, style ternary reads both."
  - "FileTree hover vs. click selection: separate signals, independent handlers. Click/keyboard/reveal → selectedIndex. Mouse hover → hoveredIndex. BG uses OR; filename color uses only isSelected."

requirements-completed:
  - BUG-01-dropdown-hover
  - BUG-02-no-text-select-on-right-click
  - BUG-03-decouple-hover-from-selected

duration: 10 min
completed: 2026-04-16
---

# quick-260416-uig Plan 01: Fix 3 File Tree Polish Bugs Summary

**Per-item ContextMenu hover tint, userSelect:'none' on file-tree rows, and a dedicated hoveredIndex signal that keeps click-selected filenames white while the mouse is elsewhere.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-16T22:03:00Z (worktree-local)
- **Completed:** 2026-04-16T22:13:00Z
- **Tasks:** 3 (Tasks 1 and 2 via TDD RED+GREEN; Task 3 verification-only)
- **Files modified:** 4

## Accomplishments

- **Bug 1 fixed:** ContextMenu items now show a visible `colors.bgSurface` (#324568) hover tint on `onMouseEnter` and clear it on `onMouseLeave`. The recursive submenu inherits the same behaviour without additional wiring.
- **Bug 2 fixed:** File tree rows (flat + tree) carry `userSelect: 'none'` so right-clicking never highlights the filename text as selectable OS text.
- **Bug 3 fixed:** New module-scope `hoveredIndex = signal(-1)` decouples hover from click-selection. Clicking row 0 and then hovering row 1 leaves row 0's filename white (`colors.textPrimary`) and row 0's background lit. Row 1 picks up only the background tint; its filename stays `colors.textMuted`.
- Existing open-submenu `bgBorder` cue in ContextMenu is preserved — it takes precedence over the hover tint, so a row whose submenu is open doesn't lose its distinct visual state.
- 6 new tests added (2 ContextMenu hover + 4 file-tree hover-vs-click) covering both render paths and both bugs.

## Task Commits

Each TDD cycle produced two commits (RED + GREEN):

1. **Task 1 RED: failing ContextMenu hover tests** — `fc3141e` (test)
2. **Task 1 GREEN: implement hoveredIndex in ContextMenu** — `54f382c` (feat)
3. **Task 2 RED: failing file-tree hover-vs-click tests** — `3ed5b1e` (test)
4. **Task 2 GREEN: decouple hover from click-selection in FileTree** — `db0e845` (feat)
5. **Task 3: verification-only (no files modified)** — no commit

**Plan metadata:** (orchestrator will commit SUMMARY.md)

## Files Created/Modified

- `src/components/context-menu.tsx` — added `useState<number|null> hoveredIndex`; `setHoveredIndex(i)` in `onMouseEnter`; `setHoveredIndex(null)` in `onMouseLeave`; row style ternary updated to `submenuIndex === i ? bgBorder : (hoveredIndex === i ? bgSurface : 'transparent')`.
- `src/components/context-menu.test.tsx` — 2 new tests in `describe('hover background')`: main-menu hover/leave and submenu-item hover.
- `src/components/file-tree.tsx` — new module-scope `const hoveredIndex = signal(-1)`; both flat and tree row `<div>`s updated with `backgroundColor: (hoveredIndex.value === i || isSelected) ? bgElevated : 'transparent'`, `userSelect: 'none'`, `onMouseEnter={() => { hoveredIndex.value = i; }}`, and `onMouseLeave={() => { if (hoveredIndex.value === i) hoveredIndex.value = -1; }}`. `selectedIndex.value = i` removed from `onMouseEnter` handlers. All other `selectedIndex.value` assignments (onClick, keyboard handlers, revealFileInTree) are UNCHANGED.
- `src/components/file-tree.test.tsx` — 4 new tests in `describe('hover vs. click selection')`: flat-mode filename color persistence after hover, flat-mode background persistence after leave, flat-mode `userSelect:'none'`, and tree-mode filename color persistence after hover. Tests click file rows (README.md / index.ts) instead of the folder row, because clicking a folder navigates and drops the row list.

**grep-verifiable diffs**

| grep | Count | Location |
|------|-------|----------|
| `hoveredIndex` in context-menu.tsx | 3 | declaration + setter + style read |
| `colors.bgSurface` in context-menu.tsx | 1 | item bg ternary |
| `setHoveredIndex(null)` in context-menu.tsx | 1 | onMouseLeave |
| `const hoveredIndex` in file-tree.tsx | 1 | module scope (line 45) |
| `hoveredIndex.value = i` in file-tree.tsx | 2 | flat + tree onMouseEnter |
| `hoveredIndex.value = -1` in file-tree.tsx | 2 | flat + tree onMouseLeave |
| `hoveredIndex.value === i \|\| isSelected` in file-tree.tsx | 2 | flat + tree row bg |
| `userSelect: 'none'` in file-tree.tsx | 3 | existing line 1202 + 2 new row divs |
| `color: isSelected ? colors.textPrimary : colors.textMuted` in file-tree.tsx | 2 | flat + tree filename spans (unchanged — confirming filename color is NOT hover-dependent) |

**Test counts**

| File | Before | After |
|------|--------|-------|
| `src/components/context-menu.test.tsx` | 12 | 14 (2 new) |
| `src/components/file-tree.test.tsx` | 27 | 31 (4 new) |
| **Total** | **39** | **45** |

## Decisions Made

- **ContextMenu hoveredIndex is local useState, not a shared signal** — the submenu is rendered via a recursive `<ContextMenu ...>` instance, so each instance has its own state and identical behaviour without extra wiring. A shared signal would have required extra tracking to distinguish "hovering a main-menu row" vs "hovering a submenu row".
- **Submenu-open (bgBorder) takes precedence over hover (bgSurface)** — keeping `submenuIndex === i ? colors.bgBorder : ...` first preserves the existing open-submenu visual cue. Hovering a row whose submenu is already open shouldn't downgrade its tint.
- **FileTree mouseLeave guard** — `if (hoveredIndex.value === i) hoveredIndex.value = -1;` prevents a slower mouseLeave from clobbering a newer mouseEnter (which would otherwise leave hoveredIndex permanently reset while the mouse still sits on the next row).
- **Filename color is decoupled from hover on purpose** — only `isSelected` drives `colors.textPrimary` vs `colors.textMuted`. This is the whole point of bug 3's fix.

## Deviations from Plan

None - plan executed exactly as written.

The only minor adjustment was in the RED-phase tests: I click `rows[1]` (README.md, a file) instead of `rows[0]` (src, a folder) to stabilise the row list during the test. Clicking a folder in flat mode navigates via `loadDir()` and in tree mode calls `toggleTreeNode()`, both of which can mutate the row list and invalidate cached indices. The plan's action description specifies "click row 0", but the plan's own `<read_first>` note highlighted that `rows[0]` in `MOCK_ENTRIES` is a folder — so this is a sensible test-authorship refinement, not a divergence from the fix itself.

## Issues Encountered

- **Pre-existing unrelated test failures** (not caused by this plan): `src/components/sidebar.test.tsx` (2 failures) and `src/components/git-control-tab.test.tsx` (9 failures) fail under the full `pnpm test --run` due to an unhandled promise rejection in a module-scope `listen<'pty-exited'>(...)` call in `src/components/terminal-tabs.tsx`. Those test files transitively import `unified-tab-bar.tsx → terminal-tabs.tsx`. This plan does NOT touch `terminal-tabs.tsx`, `unified-tab-bar.tsx`, `sidebar.tsx`, or `git-control-tab.tsx`; the failures reproduce on the base commit `46206a9` before any of this plan's changes land. Filed as a follow-up; treat as advisory for Task 3's acceptance criterion "pnpm test --run → exit 0 (or only pre-existing unrelated failures clearly called out)".
- **Tooling note:** the parallel-execution worktree initially had no `node_modules` — test runs used the main repo's binary at `/Users/lmarques/Dev/efx-mux/node_modules/.bin/vitest` directly. All 45 tests in the two files this plan touches pass. `pnpm tsc --noEmit` exits 0.

## Verification

- `pnpm test src/components/context-menu.test.tsx --run` → 14/14 pass
- `pnpm test src/components/file-tree.test.tsx --run` → 31/31 pass
- `pnpm test src/components/context-menu.test.tsx src/components/file-tree.test.tsx --run` → 45/45 pass
- `pnpm tsc --noEmit` → exit 0 (clean)
- Full suite `pnpm test --run` → 221/232 pass; 11 pre-existing unrelated failures in `sidebar.test.tsx` + `git-control-tab.test.tsx` (see Issues Encountered).

## Next Phase Readiness

- All three bugs fixed with regression tests.
- Manual verification (per plan `<verification>` block) requires the app running — deferred to user. Expected UX:
  - Right-click a row → open "Open In" (if editors detected); each menu item tint-highlights on hover; child menu items also highlight.
  - Right-click a row → filename text no longer gets OS text-selection highlight.
  - Click a row → filename white + bg; hover another row → original row STAYS white; move mouse out of tree → clicked row's bg persists.
  - ArrowUp/Down/Enter still drive the white-text row.
- No follow-ups required from this plan itself. The unrelated `terminal-tabs.tsx` module-scope `listen()` rejection is a pre-existing issue worth filing but is out-of-scope here.

## TDD Gate Compliance

Both TDD tasks (1 and 2) produced a RED `test(...)` commit followed by a GREEN `feat(...)` commit, with tests transitioning from failing → passing. No REFACTOR cycles were needed (GREEN implementations are already minimal and matched the plan's acceptance criteria on the first pass).

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 — ContextMenu hover | fc3141e | 54f382c | — | Pass |
| Task 2 — FileTree hover/click split | 3ed5b1e | db0e845 | — | Pass |

## Self-Check

- [x] `src/components/context-menu.tsx` on disk (modified)
- [x] `src/components/context-menu.test.tsx` on disk (modified, +49 lines)
- [x] `src/components/file-tree.tsx` on disk (modified)
- [x] `src/components/file-tree.test.tsx` on disk (modified, +111 lines)
- [x] Commit `fc3141e` present in `git log`
- [x] Commit `54f382c` present in `git log`
- [x] Commit `3ed5b1e` present in `git log`
- [x] Commit `db0e845` present in `git log`
- [x] All acceptance criteria for Task 1 pass (grep counts verified)
- [x] All acceptance criteria for Task 2 pass (grep counts verified)
- [x] Task 3 acceptance criteria pass (typecheck exit 0; pre-existing unrelated failures documented)

## Self-Check: PASSED

---
*Phase: quick-260416-uig*
*Completed: 2026-04-16*
