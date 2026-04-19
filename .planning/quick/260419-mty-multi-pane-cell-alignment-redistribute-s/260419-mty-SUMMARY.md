---
phase: quick-260419-mty
plan: 1
subsystem: window-layout
tags: [cell-alignment, multi-pane, css-vars, redistribute, l4c-extension]
dependency_graph:
  requires: [quick-260419-l4c]
  provides: [multi-pane-cell-alignment]
  affects: [src/window/pane-distribute.ts, src/window/resize-increments.ts, src/drag-manager.ts, src/components/sub-scope-pane.tsx, src/main.tsx]
tech_stack:
  added: [src/window/pane-distribute.ts]
  patterns: [runtime-only CSS var redistribution, two-store separation (persisted intent vs runtime alignment)]
key_files:
  created:
    - src/window/pane-distribute.ts
    - src/window/pane-distribute.test.ts
  modified:
    - src/window/resize-increments.ts
    - src/drag-manager.ts
    - src/components/sub-scope-pane.tsx
    - src/main.tsx
decisions:
  - Math.floor (not Math.round) for proportional split — guarantees drift always absorbed by last terminal pane
  - runtime-only CSS vars via document.documentElement.style.setProperty — never updateLayout
  - shared 100ms debounce with syncIncrementsDebounced — no second debounce handle
  - requestAnimationFrame guard in spawn/close and tab-switch effect — lets Preact render before measuring
  - :scope > .sub-scope-pane selector — avoids accidentally descending into nested panes (defensive)
metrics:
  duration: 489s
  completed: 2026-04-19
  tasks_completed: 2
  tasks_pending_human_verify: 1
  files_created: 2
  files_modified: 4
---

# Quick Task 260419-mty: Multi-pane cell alignment (redistribute split pcts) Summary

**One-liner:** Runtime CSS-var redistribution so every stacked terminal pane's height equals `tabBarH + R × cellH` for integer R, extending the l4c NSWindow-snap architecture to the multi-pane case.

## What Was Built

### Task 1 — Pure `computeTargetRows` + module skeleton (commit 80d9a83)

New file `src/window/pane-distribute.ts` exporting:
- `computeTargetRows(totalCells, weights, termCount)` — pure function, no DOM. Uses `Math.floor` for proportional split (not `Math.round`) to ensure all fractional remainder lands on the last terminal pane via drift absorption. Guards: non-finite inputs, `totalCells < termCount`, mismatched weights length, zero/negative weights.
- `distributeCells(zone)` — stub (replaced in Task 2).

New file `src/window/pane-distribute.test.ts` — 13 specs in `describe('computeTargetRows — pure math')` covering single-pane short-circuit, even split with drift-on-last, weight-proportional split (3:1, 1:3), three-pane even split, min-1 clamp with pull-from-biggest rebalance, degenerate null returns, determinism, post-condition (integers ≥ 1 summing to totalCells). All 13 pass.

### Task 2 — DOM integration + 5 wiring sites (commit 4c52442)

`pane-distribute.ts` stub replaced with full body:
- `measureTabBarH(paneEl)` — measures `[data-tablist-scope]` or `.tab-bar` offsetHeight, cached module-level. Fallback: 36px.
- `classifyPaneKind(paneEl, zone)` — reads `data-subscope` attribute, calls `getTerminalScope(scope)`, checks if `activeTabId` is in `tabs[]`. Returns `'terminal'` or `'mixed'`.
- `distributeCells(zone)` — full algorithm: queries `:scope > .sub-scope-pane`, sums `offsetHeight` (not `panel.clientHeight` — avoids ServerPane overcounting in main), classifies panes, computes terminal budget, calls `computeTargetRows`, writes `--{zone}-split-{i}-pct` for `i = 0..N-2` only via `document.documentElement.style.setProperty`. Last pane gets `flex:1` — no var written. Write-skip guard: only setProperty when value changes. Pre-write invariant: `Σ(targetPx[0..N-2]) ≤ H - (tabBarH + cellH)` — bails cleanly if violated.

**4 wiring sites:**
1. `resize-increments.ts` — `distributeCells('main')` + `distributeCells('right')` added inside the shared 100ms debounce trailing tick, after `void syncWindowIncrements(cellW, cellH)`.
2. `drag-manager.ts` — `distributeCells(zone)` appended to intra-zone `onEnd` after `syncIncrementsDebounced()`. Not in `onDrag` — that would fight the live drag.
3. `sub-scope-pane.tsx` — `requestAnimationFrame(() => distributeCells(zone))` in both `spawnSubScopeForZone` and `closeSubScope`, after `queueMicrotask(() => dispatchLayoutChanged())`.
4. `main.tsx` — `window.addEventListener('resize', () => syncIncrementsDebounced())` (Step 4d, feeds the shared debounce); `effect()` subscribing every active scope's `activeTabId` with `requestAnimationFrame` defer (Step 4e, handles tab-kind flip).

## Two-Store Separation

The architecture maintains a strict two-store separation:

**Persisted store** (`state.json` via `updateLayout`, keyed `${zone}-split-${idx}-pct:${project}`): the user's drag-resolved split intent. Written only by intra-zone drag `onEnd`. Read by `restoreActiveSubScopes` at project load/switch — seeds the CSS var for the new project context.

**Runtime store** (`document.documentElement.style.--{zone}-split-{i}-pct`): cosmetic cell-alignment overlay. Written by drag `onDrag` (live snap) and `distributeCells` (post-process quantization). Never persisted. On project switch, `restoreActiveSubScopes` resets these from the persisted store, then `distributeCells` runs once to re-quantize the new project's pcts to the current cellH.

This means: a user who sets a 42.7% split persists 42.7%, but at runtime the pane renders at the nearest cell-multiple (e.g., 42.5%). On font-size change, `cellH` changes and the runtime override updates to the new nearest multiple — the persisted 42.7% intent is never clobbered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Math.floor instead of Math.round for proportional split**
- **Found during:** Task 1 test run
- **Issue:** The plan spec says to use `Math.round` for the proportional split step, but also specifies that "drift lands on LAST index". With equal weights and odd `totalCells`, `Math.round(20.5) = 21` (JS rounds .5 up) puts the extra row on the FIRST pane, not the last. Test `computeTargetRows(41, [10,10], 2)` expected `[20,21]` but received `[21,20]`.
- **Fix:** Changed to `Math.floor` for the proportional split. This guarantees the floor-remainder is always non-negative and goes to the last pane via the drift-absorption step. All other test cases (weight-proportional, min-1 clamp) still pass because `Math.floor` is more conservative and the drift-to-last mechanism handles any deficit.
- **Files modified:** `src/window/pane-distribute.ts`
- **Commit:** 80d9a83

## Verification Status

### Automated (PASSED)

- `pnpm tsc --noEmit` — clean (no errors in any of the 6 files touched by this plan; pre-existing errors in `*.test.tsx` files are out of scope)
- `pnpm test` (worktree) — 13 new `computeTargetRows` specs pass; full suite shows 424 passed / 49 failed — identical failure count to baseline (no regressions)
- Grep invariants:
  - `distributeCells` imported in exactly 4 files: `resize-increments.ts`, `drag-manager.ts`, `sub-scope-pane.tsx`, `main.tsx`
  - `distributeCells(` call sites: resize-increments (2), drag-manager (1), sub-scope-pane (2), main.tsx (2) = 7 total
  - `new ResizeObserver` — ZERO in all 5 touched files
  - `updateLayout` — ZERO in `pane-distribute.ts`
  - `window.addEventListener.*resize` — exactly 1 occurrence in `main.tsx`
  - `requestAnimationFrame` guards in sub-scope-pane (spawn + close) and main.tsx (effect)

### Manual — Task 3 PENDING (checkpoint:human-verify)

Task 3 is a hardware-only checkpoint requiring the developer to run `pnpm tauri dev` and verify all 15 checks from the plan's `<how-to-verify>` section. Key checks:

1. Two-pane terminal split: both panes have no partial-row band
2. Three-pane split: no partial-row band in any pane
3. Intra-zone drag onEnd: OTHER panes re-align on release
4. Right panel multi-pane: same behavior
5. Window resize: panes re-align within ~100ms
6. Mixed-content: editor px untouched, terminal aligns
7. All-editor zone: no CSS var writes (termCount=0 bail)
8. Tab-switch kind flip: redistribute fires within one rAF
9. Sub-scope spawn/close: distribute fires on rAF after mount/unmount
10. Sidebar/server pane collapse: distribute re-fires via window resize listener
11. Project switch: persisted pcts restored, then re-quantized
12. Font size change: theme-manager fires syncIncrementsDebounced → distribute
13. No infinite loop: no continuous style recalcs in DevTools idle
14. l4c regression: single-pane snap unchanged
15. No inline height pinning on mount

**Resume signal:** Type "approved" if all 15 checks pass. Describe any mismatch for follow-up.

## Known Stubs

None. `distributeCells` is fully implemented with DOM integration. The Task 1 stub was replaced in Task 2.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/window/pane-distribute.ts` exists | FOUND |
| `src/window/pane-distribute.test.ts` exists | FOUND |
| Commit 80d9a83 (Task 1) | FOUND |
| Commit 4c52442 (Task 2) | FOUND |
| No accidental file deletions | CONFIRMED |
