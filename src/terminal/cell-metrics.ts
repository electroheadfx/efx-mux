// cell-metrics.ts — shared xterm cell dimension helper for quantized pane sizing.
//
// Phase-22 follow-up (quick 260419-k1n): quantize pane resize paths (split-drag,
// sidebar-drag, window-resize) so the row-remainder bottom band and
// column-remainder right gap disappear on terminal panes.
//
// Only terminal scopes get snapped; mixed-content panes (editor / file-tree /
// gsd / git-changes) return null and are left untouched by all callers.

import { getTerminalScope, type TerminalScope } from '../components/terminal-tabs';
import type { Terminal } from '@xterm/xterm';

export interface CellMetrics {
  cellWidth: number;   // px — width of one xterm cell in the active terminal
  cellHeight: number;  // px — height of one xterm cell in the active terminal
}

/**
 * Returns true when the given scope's active tab is a terminal tab (as opposed
 * to editor / file-tree / gsd / git-changes). Mirrors the `isTerminalActive`
 * check in sub-scope-pane.tsx so we do not snap on non-terminal panes.
 */
export function isTerminalScopeActive(scope: TerminalScope): boolean {
  const s = getTerminalScope(scope);
  const tabs = s.tabs.value;
  const activeId = s.activeTabId.value;
  return tabs.some(t => t.id === activeId);
}

/**
 * Read the ACTIVE terminal's css cell dimensions for the given scope.
 *
 * Returns null when:
 *   - no active terminal tab in this scope (mixed content — caller must NOT snap)
 *   - xterm renderer not mounted yet (cell dimensions undefined)
 *   - cellWidth or cellHeight is 0 / NaN
 *
 * Primary source: `terminal._core._renderService.dimensions.css.cell`.
 * This is the same path FitAddon reads internally (see
 * node_modules/@xterm/addon-fit/lib/addon-fit.mjs) so it's as public as it gets
 * without a formal API. We optional-chain every step to survive xterm internal
 * shuffles.
 */
export function getCellMetricsForScope(scope: TerminalScope): CellMetrics | null {
  if (!isTerminalScopeActive(scope)) return null;
  const s = getTerminalScope(scope);
  const tab = s.tabs.value.find(t => t.id === s.activeTabId.value);
  if (!tab) return null;
  return readCellMetrics(tab.terminal);
}

/** Extracted so tests can feed a mock terminal directly. */
export function readCellMetrics(terminal: Terminal): CellMetrics | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (terminal as any)?._core;
  const cell = core?._renderService?.dimensions?.css?.cell;
  const w = Number(cell?.width);
  const h = Number(cell?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { cellWidth: w, cellHeight: h };
}

/** Snap `value` down to the nearest multiple of `step`, respecting a minimum. */
export function snapDown(value: number, step: number, min = 0): number {
  if (step <= 0) return value;
  const snapped = Math.floor(value / step) * step;
  return Math.max(min, snapped);
}
