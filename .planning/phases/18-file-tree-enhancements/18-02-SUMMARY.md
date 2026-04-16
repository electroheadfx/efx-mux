---
phase: 18-file-tree-enhancements
plan: 02
subsystem: ui
tags: [preact, context-menu, submenu, tauri-config, drag-drop, accessibility, tdd]

# Dependency graph
requires:
  - phase: 15-foundation-primitives
    provides: ContextMenu component (D-01, D-02, D-03) — flat-item array, auto-flip, click-outside/Escape close
provides:
  - Extended ContextMenuItem with optional `children?: ContextMenuItem[]` for submenu support
  - Submenu rendering with 150ms hover delay, recursive ContextMenu reuse for auto-flip
  - ArrowRight/ArrowLeft keyboard navigation (submenu enter/exit)
  - ARIA: aria-haspopup="menu" and aria-expanded on parent rows
  - Chevron `▸` indicator on rows with children (accent color when hovered)
  - Shared onClose propagates to entire menu stack on child action invocation
  - `dragDropEnabled: true` on app.windows[0] — unblocks getCurrentWebviewWindow().onDragDropEvent()
affects:
  - 18-03 (file-tree integration — uses ContextMenu with children for "Open In ▸")
  - 18-04 (external editor integration — consumes submenu for "Open In" → Zed / VSCode / …)
  - 18-05 (Finder drop import — consumes dragDropEnabled flag for OS drop events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive ContextMenu render — submenu is a <ContextMenu> instance, inheriting auto-flip for free"
    - "Hover-delay timer via useRef<ReturnType<typeof setTimeout> | null> — cancellation-safe across re-renders"
    - "Row refs array via useRef<Array<HTMLDivElement | null>> — geometry read for submenu positioning"
    - "ArrowRight opens submenu by scanning rowRefs for :hover match — works without explicit focus state"

key-files:
  created: []
  modified:
    - src/components/context-menu.tsx (115 → 210 lines; added submenu state, hover-delay, recursive render, keyboard nav)
    - src/components/context-menu.test.tsx (113 → 164 lines; 4 new submenu test cases in describe('submenu'))
    - src-tauri/tauri.conf.json (added dragDropEnabled: true on app.windows[0])

key-decisions:
  - "Recursive <ContextMenu> for submenu — reuses existing auto-flip logic instead of reimplementing"
  - "150ms hover delay matches macOS native submenu behavior (per RESEARCH.md §6 and UI-SPEC)"
  - "ArrowRight scans rowRefs.current[i]?.matches(':hover') instead of tracking focused index — simpler state, equivalent UX"
  - "Click on parent row with children is a no-op (not an error): hover is the only affordance to open submenu"
  - "submenu mouseenter clears close timer; mouseleave starts 150ms close timer — cancellation-safe back-and-forth hover"

patterns-established:
  - "Optional action field on ContextMenuItem when children present — action?: () => void"
  - "Shared onClose across parent and submenu — child action click closes entire stack"
  - "Click-outside check includes BOTH menuRef and submenuRef (submenu is outside parent DOM subtree via React render order)"

requirements-completed: [TREE-03, TREE-05]

# Metrics
duration: 3m 8s
completed: 2026-04-16
---

# Phase 18 Plan 02: ContextMenu Submenu + Tauri dragDropEnabled Summary

**ContextMenu extended with optional `children` field for 150ms-hover-delayed nested submenus (recursive render inherits auto-flip) and Tauri window dragDropEnabled: true to unblock Finder drop events for Plan 18-05.**

## Performance

- **Duration:** 3m 8s
- **Started:** 2026-04-16T18:42:07Z
- **Completed:** 2026-04-16T18:45:15Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 3

## Accomplishments
- ContextMenuItem now accepts optional `children?: ContextMenuItem[]`; `action?` made optional for parent rows
- Submenu reveals after 150ms hover at `parentRow.right + 2px`; viewport overflow auto-flips via recursive ContextMenu reuse
- ArrowRight opens submenu on currently hovered parent; ArrowLeft closes submenu; Escape closes entire stack
- Click-outside handler extended to treat parent menu + submenu as a single logical cluster
- ARIA attributes (`aria-haspopup="menu"`, `aria-expanded`) applied to parent rows with children
- Chevron `▸` indicator (10px) at right edge of submenu parents; textMuted default, accent color on hover
- `dragDropEnabled: true` set on `app.windows[0]` in `tauri.conf.json` — Plan 18-05's `getCurrentWebviewWindow().onDragDropEvent()` listener now wired
- 4 new submenu Vitest cases added and passing; all 12 tests green (8 original + 4 new)
- `cargo check` passes — Tauri 2.10.3 accepts the new config field without complaint

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing submenu tests** — `a918b91` (test)
2. **Task 1 GREEN: submenu implementation in context-menu.tsx** — `c7aa3f4` (feat)
3. **Task 2: dragDropEnabled config flag** — `c461e2a` (feat)

_Note: Task 1 was TDD — RED commit preceded GREEN. Task 2's test additions were merged into the Task 1 RED commit since they define the behavior that Task 1 implements._

## Files Created/Modified
- `src/components/context-menu.tsx` — Added submenu state (submenuIndex, submenuPos, hoverTimerRef, rowRefs, submenuRef), recursive ContextMenu render for submenus, 150ms hover-delay logic, ArrowRight/ArrowLeft keyboard nav, extended click-outside handler
- `src/components/context-menu.test.tsx` — Added `describe('submenu', ...)` block with 4 test cases covering hover reveal, child action invocation + close propagation, absence of chevron for plain items, aria-haspopup attribute
- `src-tauri/tauri.conf.json` — Added `"dragDropEnabled": true` to `app.windows[0]`

## Decisions Made
- **Recursive submenu render:** Chose to render submenus as a full `<ContextMenu>` instance instead of a bespoke submenu panel. Benefit: existing `useEffect` auto-flip logic runs unchanged on the submenu's own `x`/`y` props, so viewport overflow on the right edge auto-flips via the same mechanism as parent menus. No duplicated flip logic.
- **ArrowRight via `:hover` match:** Instead of tracking a focused index as separate state, the keydown handler scans `rowRefs.current[i]?.matches(':hover')` to find the target. Equivalent UX to focus-based navigation with less state machinery. ArrowLeft simply clears `submenuIndex`.
- **Click on parent row is no-op:** `handleItemClick` early-returns when `item.children` is present. Parent rows are hover-only affordances; accidental click doesn't fire a phantom action or close the menu.
- **Submenu mouseenter/mouseleave share timer:** Both parent-row and submenu wrapper use the same `hoverTimerRef` — re-entering the submenu cancels the pending close, keeping the menu open during natural cursor movement from parent → submenu.

## Deviations from Plan

None — plan executed exactly as written. All Task 1 acceptance criteria (11 grep patterns + 1 compile check) and Task 2 acceptance criteria (3 JSON fields + 3 test additions + 2 command exit codes) verified.

## Issues Encountered

**pnpm dependencies not installed at worktree start.** The worktree was freshly checked out at base commit `808d8398` and did not yet have `node_modules/`. Resolved by running `pnpm install` (1.5s). Not a blocker — expected parallel-executor worktree behavior.

**Planning artifact files not in worktree base.** The `18-{01..05}-PLAN.md` files exist in the main repo but were created after commit `808d839` (the worktree base). Copied them into the worktree from the main directory so the plan reference in my context could be read. Left as untracked — they are not part of this plan's deliverable.

## Self-Check: PASSED

- `src/components/context-menu.tsx` exists and contains `children?: ContextMenuItem[]` (line 17)
- `src/components/context-menu.tsx` contains `action?: () => void` (line 13, now optional)
- `src/components/context-menu.tsx` contains `submenuRef` (3 occurrences at lines 29, 51, 191)
- `src/components/context-menu.tsx` contains `hoverTimerRef` (8 occurrences)
- `src/components/context-menu.tsx` contains `150` timeout (4 occurrences)
- `src/components/context-menu.tsx` contains `items[submenuIndex].children!` (line 201)
- `src/components/context-menu.tsx` contains `aria-haspopup` (line 136)
- `src/components/context-menu.tsx` contains `▸` (line 183)
- `src/components/context-menu.tsx` contains `if (item.children) return;` (line 99)
- `src/components/context-menu.tsx` contains `ArrowLeft` / `ArrowRight` handling (lines 72, 86)
- `src/components/context-menu.tsx` is 210 lines (plan min_lines: 180 — ✓)
- `src/components/context-menu.test.tsx` contains `describe('submenu'` (line 115)
- `src/components/context-menu.test.tsx` contains `aria-haspopup` assertion (line 162)
- `src/components/context-menu.test.tsx` contains `setTimeout(r, 200)` (lines 130, 143)
- `src-tauri/tauri.conf.json` contains `"dragDropEnabled": true` (line 22)
- `src-tauri/tauri.conf.json` preserves `"title": "Efxmux"` and `"titleBarStyle": "Overlay"`
- Commit `a918b91` exists (test — RED phase)
- Commit `c7aa3f4` exists (feat — GREEN phase)
- Commit `c461e2a` exists (feat — Tauri config)
- `pnpm test` → PASS (12) FAIL (0)
- `cd src-tauri && cargo check` → Finished dev profile (exit 0)
- `pnpm tsc --noEmit` → compilation completed (exit 0)

## Next Phase Readiness

- **Plan 18-03 (file-tree integration)** can now build `ContextMenu` `items` arrays with `{ label: 'Open In', children: [...] }` entries; the submenu renders automatically.
- **Plan 18-04 (external editor launch)** can populate the `children` array with detected editors (Zed, VSCode, Cursor, Sublime, IntelliJ) — icon + label + action calling `invoke('launch_external_editor', ...)`.
- **Plan 18-05 (Finder drop import)** can register `getCurrentWebviewWindow().onDragDropEvent(...)` knowing the Tauri config now surfaces OS drop events.
- No architectural or design blockers identified. Submenu positioning handles viewport edges via inherited auto-flip — no follow-up needed.

---
*Phase: 18-file-tree-enhancements*
*Plan: 02*
*Completed: 2026-04-16*
