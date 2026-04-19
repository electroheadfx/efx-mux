---
quick_id: 260419-k1n
phase: quick-260419-k1n
plan: 1
subsystem: terminal-layout
tags: [quantization, xterm, resize, drag, split-pane, cell-metrics]
dependency_graph:
  requires: []
  provides:
    - cell-metrics helper (getCellMetricsForScope, snapDown, readCellMetrics)
    - quantized intra-zone split-drag onEnd
    - quantized sidebar-main drag onEnd
    - post-fit pane-height quantization in runFit()
    - initial mount pane-height quantization in SubScopePane
  affects:
    - src/drag-manager.ts
    - src/terminal/resize-handler.ts
    - src/components/sub-scope-pane.tsx
tech_stack:
  added: []
  patterns:
    - "getCellMetricsForScope: null-return guard for mixed-content panes"
    - "snapDown: floor-to-multiple with min clamp"
    - "double-RAF useEffect in Preact for post-mount measurement"
    - "vi.mock('./terminal/cell-metrics') at module level for drag/resize tests"
key_files:
  created:
    - src/terminal/cell-metrics.ts
    - src/terminal/cell-metrics.test.ts
    - src/components/sub-scope-pane.quant.test.tsx
  modified:
    - src/drag-manager.ts
    - src/drag-manager.test.ts
    - src/terminal/resize-handler.ts
    - src/terminal/resize-handler.test.ts
    - src/components/sub-scope-pane.tsx
decisions:
  - "readCellMetrics extracted as pure function so tests feed mock terminals without module mocks; getCellMetricsForScope is integration concern"
  - "resize-handler quantization placed AFTER lastCols/lastRows guard update so it only fires when dims actually change"
  - "snapDown min=48 matches existing minHeight:48 floor in SubScopePane style"
  - "sidebar snap direction: snap residual DOWN (never crops content), then recompute sidebar width"
  - "double-RAF in SubScopePane useEffect mirrors createTerminal double-RAF so cell dims are readable on mount"
  - "vi.mock at module level in test files so imported production code uses mocked getCellMetricsForScope"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-19T12:41:51Z"
  tasks_completed: 3
  tasks_total: 4
  files_modified: 7
  tests_added: 21
---

# Quick 260419-k1n: Grid-snap pane resize — quantize split-drag, sidebar-drag, window-resize

**One-liner:** Cell-grid snap for terminal pane dimensions via a shared `getCellMetricsForScope` helper wired into three resize paths (split-drag onEnd, sidebar onEnd, post-fit runFit) and SubScopePane mount, eliminating the xterm row-remainder bottom band and column-remainder right gap.

## Files Changed

| File | Change | Why |
|------|--------|-----|
| `src/terminal/cell-metrics.ts` | New | Shared helper: `getCellMetricsForScope`, `isTerminalScopeActive`, `readCellMetrics`, `snapDown` |
| `src/terminal/cell-metrics.test.ts` | New | 13 unit tests for `readCellMetrics` and `snapDown` |
| `src/drag-manager.ts` | Modified | Sidebar-main `onEnd` + intra-zone `onEnd` quantization |
| `src/drag-manager.test.ts` | Modified | Tests A/B/C (intra-zone snap), G/H/I (sidebar snap) + vi.mock cell-metrics |
| `src/terminal/resize-handler.ts` | Modified | `runFit()` pane-height quantization after `fitAddon.fit()` |
| `src/terminal/resize-handler.test.ts` | Modified | Tests D/E/F (post-fit snap, mixed-content skip, no-churn) + vi.mock cell-metrics |
| `src/components/sub-scope-pane.tsx` | Modified | Second `useEffect` with double-RAF mount quantization |
| `src/components/sub-scope-pane.quant.test.tsx` | New | Tests J/K (mount snap, mixed-content no-op) |

## Test Files and Count

| File | Tests Added | Description |
|------|-------------|-------------|
| `src/terminal/cell-metrics.test.ts` | 13 | `readCellMetrics` null paths, valid path; `snapDown` arithmetic and edge cases |
| `src/drag-manager.test.ts` | 6 | Tests A/B/C: intra-zone snap+skip+floor; Tests G/H/I: sidebar snap+skip+clamp |
| `src/terminal/resize-handler.test.ts` | 3 | Tests D/E/F: post-fit snap, mixed-content no-op, no-churn when aligned |
| `src/components/sub-scope-pane.quant.test.tsx` | 2 | Tests J/K: mount snap, mixed-content no-op |
| **Total** | **24** | All pass; 10 pre-existing tests in sub-scope-pane.test.ts unaffected |

## Implementation Notes

### xterm internal API path
`terminal._core._renderService.dimensions.css.cell.{width,height}` — same path used by FitAddon internally. Full optional-chaining guards every step so if xterm reshuffles internals the helper returns null gracefully (treated as mixed-content → no snap).

### Mixed-content guard
`getCellMetricsForScope` returns `null` when:
- No active terminal tab in scope (editor/file-tree/gsd/git-changes active)
- xterm renderer not mounted yet
- Cell dimensions are 0/NaN

All three quantization paths guard on null → skip. Editor, file-tree, GSD, git-changes panes keep pixel-accurate behavior.

### Snap direction
Always snap DOWN (`Math.floor(value / step) * step`). Rounding up would crop the last displayed row; rounding down gives a slightly smaller pane which the remainder strip previously occupied anyway.

### Sidebar quantization direction
Snap the RESIDUAL main-panel width (not the sidebar width directly). This ensures the terminal column grid aligns without clipping content. Sidebar width = `window.innerWidth - rightPanelW - snappedResidual`.

### jsdom flex normalization
jsdom normalizes `element.style.flex = 'none'` to `'0 0 auto'`. All test assertions use `/^(none|0 0 auto)$/` regex to handle both environments.

### Task 2 TDD deviation
Test B (mixed-content skip) and Tests E/F (no-churn, mixed-content) passed in RED phase — correct, because current code already did not apply quantization. Only Tests A/C/D were genuinely red. All turn green after implementation.

## Discovered Edge Cases

1. **node_modules not in worktree:** The git worktree had no `node_modules` directory. Created a symlink `node_modules -> /Users/lmarques/Dev/efx-mux/node_modules` so vitest could run from the worktree context. This is expected for pnpm workspaces.

2. **jsdom flex shorthand expansion:** Setting `flex = 'none'` in production code results in `'0 0 auto'` when read back via `element.style.flex` in jsdom. Tests use regex match rather than string equality.

3. **lastCols/lastRows guard in resize-handler:** The quantization must be placed AFTER the guard updates `lastCols = cols; lastRows = rows;` so it fires on legitimate resize events only, not on every layout-changed broadcast when terminal size hasn't changed.

4. **Double-RAF in SubScopePane:** The mount useEffect uses two nested `requestAnimationFrame` calls (not `Promise.resolve` or `queueMicrotask`) to match the timing of `createTerminal()`'s own double-RAF fit, ensuring xterm cell dimensions are populated before the snap measurement.

## Task 4: Manual Verification (Pending)

**Status:** Awaiting user verification. The user runs the dev server (`pnpm tauri dev`). No automated verification available.

**What to verify:**
1. Baseline — main-0 terminal: no dark band at bottom after app opens
2. Window resize — drag OS window corner, release; no band on terminal panes
3. Sidebar drag (terminal active) — release; no column-remainder gap on main-0 terminal
4. Sidebar drag (editor active) — smooth pixel movement (no visible snap)
5. Intra-zone split drag (terminal+terminal) — release; no band on either pane
6. Intra-zone split drag (terminal+editor) — smooth pixel drag, mixed-content preserved
7. Tab switch to terminal — no band on first paint
8. Project switch — no band on mount

**Resume signal:** Type "approved" or describe which step shows a regression.

## Commits

| Commit | Description |
|--------|-------------|
| `2674b83` | feat(quick-260419-k1n-1): add cell-metrics helper + unit tests |
| `83e2511` | feat(quick-260419-k1n-2): quantize intra-zone split-drag + window-resize pane height |
| `52f374c` | feat(quick-260419-k1n-3): quantize sidebar-main drag + SubScopePane mount height |

## Known Stubs

None. All quantization paths are wired to real data (xterm cell dimensions via `_core._renderService.dimensions.css.cell`). No hardcoded empty values or placeholder behavior.

## Self-Check: PASSED

- `src/terminal/cell-metrics.ts` — FOUND
- `src/terminal/cell-metrics.test.ts` — FOUND
- `src/drag-manager.ts` (modified) — FOUND
- `src/drag-manager.test.ts` (modified) — FOUND
- `src/terminal/resize-handler.ts` (modified) — FOUND
- `src/terminal/resize-handler.test.ts` (modified) — FOUND
- `src/components/sub-scope-pane.tsx` (modified) — FOUND
- `src/components/sub-scope-pane.quant.test.tsx` — FOUND
- Commit `2674b83` — FOUND
- Commit `83e2511` — FOUND
- Commit `52f374c` — FOUND
- All 44 tests across 5 test files pass
- `tsc --noEmit`: no errors in production files
