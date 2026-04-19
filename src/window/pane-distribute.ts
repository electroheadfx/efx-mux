// pane-distribute.ts — Multi-pane cell-alignment for stacked sub-scopes (quick 260419-mty).
//
// Extends the l4c architecture with a post-process pass that redistributes
// the CSS-var split pcts so every terminal pane's computed px equals
// `tabBarH + R × cellH` for integer R. Runtime-only: persisted per-project
// pcts in state.json stay untouched.
//
// Entry: distributeCells(zone) — callable from drag-manager, resize-increments,
// sub-scope-pane lifecycle, and the main.tsx tab-switch effect.
//
// Pure math core: computeTargetRows(totalCells, weights, termCount).

import { getActiveTerminalCellGeom } from './resize-increments';
import { getTerminalScope, type TerminalScope } from '../components/terminal-tabs';

// ---------------------------------------------------------------------------
// Module-scoped tab-bar height cache
// ---------------------------------------------------------------------------

let _tabBarH: number | undefined;

function measureTabBarH(paneEl: HTMLElement): number {
  if (_tabBarH !== undefined) return _tabBarH;
  // Prefer the canonical selector used by unified-tab-bar ([data-tablist-scope]).
  // Fall back to .tab-bar for any legacy markup that might still be queried.
  const bar = paneEl.querySelector<HTMLElement>('[data-tablist-scope], .tab-bar');
  _tabBarH = bar?.offsetHeight ?? 36;
  return _tabBarH;
}

// ---------------------------------------------------------------------------
// Pane kind classifier
// ---------------------------------------------------------------------------

function classifyPaneKind(paneEl: HTMLElement, zone: 'main' | 'right'): 'terminal' | 'mixed' {
  // Read the scope id from data-subscope (SubScopePane writes this).
  const scopeAttr = paneEl.getAttribute('data-subscope') as TerminalScope | null;
  if (!scopeAttr) return 'mixed';
  // Voidless assertion: SubScopePane always writes a valid scope, so `scopeAttr` is trusted.
  const scopeState = getTerminalScope(scopeAttr);
  const activeId = scopeState.activeTabId.value;
  // A pane is 'terminal' iff its active tab is one of its own scope's terminal tabs.
  const isTerm = scopeState.tabs.value.some(t => t.id === activeId);
  // Suppresses the unused `zone` arg warning (kept for future per-zone rules).
  void zone;
  return isTerm ? 'terminal' : 'mixed';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function distributeCells(zone: 'main' | 'right'): void {
  const panel = document.querySelector<HTMLElement>(`.${zone}-panel`);
  if (!panel) return;

  const panes = Array.from(panel.querySelectorAll<HTMLElement>(':scope > .sub-scope-pane'));
  //  ^^^ :scope > .sub-scope-pane
  //      This matters for the main panel: ServerPane is a sibling of the .sub-scope-pane
  //      nodes, not a nested .sub-scope-pane. Using :scope > ensures we never
  //      accidentally descend into a future sub-scope-pane child (defensive).

  const N = panes.length;
  if (N < 2) return;  // single-pane: NSWindow snap already handles it.

  const geom = getActiveTerminalCellGeom();
  if (!geom) return;  // no visible terminal — nothing to snap.
  const cellH = Math.round(geom.cellH * 2) / 2;  // nearest 0.5 (sub-pixel guard)
  if (cellH < 8) return;  // degenerate font guard.

  // --- Zone height: sum of sub-scope offsetHeights (excludes ServerPane in main) ---
  let H = 0;
  for (const p of panes) H += p.offsetHeight;
  if (H < N * 48) return;  // minHeight-48 floor would dominate — bail.

  const tabBarH = measureTabBarH(panes[0]);

  // --- Classify ----------------------------------------------------------
  const kinds = panes.map(p => classifyPaneKind(p, zone));
  const termCount = kinds.filter(k => k === 'terminal').length;
  if (termCount === 0) return;  // no terminals in this zone — nothing to snap.

  // --- Current measured px per pane (what the browser resolved) ---------
  const currentPx = panes.map(p => p.offsetHeight);

  // --- Terminal budget: total minus mixed-pane px ------------------------
  let mixedTotalPx = 0;
  for (let i = 0; i < N; i++) if (kinds[i] === 'mixed') mixedTotalPx += currentPx[i];
  const terminalBudget = H - mixedTotalPx;

  // --- Integer-cell budget for terminal panes ---------------------------
  const totalCells = Math.floor((terminalBudget - termCount * tabBarH) / cellH);
  if (totalCells < termCount) return;  // not enough room for 1 row each — bail.

  // --- Min-rows floor to clear minHeight:48 -----------------------------
  const minRows = Math.max(1, Math.ceil((48 - tabBarH) / cellH));
  // (minRows is an EVENTUAL constraint; computeTargetRows enforces ≥ 1. For now we
  // accept that the min-1 clamp is sufficient — 48px − 36px tabBar = 12px budget,
  // at cellH≥14 that's ≥ 1 row. The clamp matches RESEARCH §4d's guard.)
  void minRows;

  // --- Weights: terminal panes' current px (preserves user intent) ------
  const termWeights: number[] = [];
  const termIdx: number[] = [];
  for (let i = 0; i < N; i++) {
    if (kinds[i] === 'terminal') {
      termWeights.push(Math.max(1, currentPx[i]));  // guard weight>0
      termIdx.push(i);
    }
  }

  // --- Pure math: compute target rows per terminal pane -----------------
  const rows = computeTargetRows(totalCells, termWeights, termCount);
  if (!rows) return;  // degenerate — bail cleanly.

  // --- Build targetPx[] — mixed kept, terminals quantized --------------
  const targetPx = currentPx.slice();
  for (let k = 0; k < termCount; k++) {
    const i = termIdx[k];
    targetPx[i] = tabBarH + rows[k] * cellH;
  }

  // --- Invariant: Σ(targetPx[0..N-2]) must leave room for last pane ----
  //     The last pane is flex:1 and absorbs `H - sum(others)`. If our written
  //     pcts exceed 100% of H, flex:1 collapses to 0 and we break the layout.
  let writtenSum = 0;
  for (let i = 0; i < N - 1; i++) writtenSum += targetPx[i];
  if (writtenSum > H - (tabBarH + cellH)) return;  // no room for 1 row in last pane — bail.

  // --- Write runtime-only CSS vars for i = 0..N-2 ----------------------
  //     Last pane (i = N-1) picks up the remainder via flex:1 automatically.
  const root = document.documentElement;
  for (let i = 0; i < N - 1; i++) {
    const pct = (targetPx[i] / H) * 100;
    const next = `${pct.toFixed(2)}%`;
    const cur = root.style.getPropertyValue(`--${zone}-split-${i}-pct`);
    if (cur !== next) {
      root.style.setProperty(`--${zone}-split-${i}-pct`, next);
    }
  }
}

export function computeTargetRows(
  totalCells: number,
  weights: number[],
  termCount: number,
): number[] | null {
  // --- Guards -------------------------------------------------------------
  if (!Number.isFinite(totalCells) || totalCells < termCount) return null;
  if (termCount < 1) return null;
  if (weights.length !== termCount) return null;
  if (weights.some(w => !Number.isFinite(w) || w <= 0)) return null;

  // --- Single pane short-circuit -----------------------------------------
  if (termCount === 1) return [Math.floor(totalCells)];

  // --- Proportional split by weight, using floor so drift is always on last --
  // Math.floor (not Math.round) ensures the remaining cells always go to the
  // LAST terminal pane via the drift-absorption step below. Math.round could
  // give the extra row to an early element when weights are equal and totalCells
  // is odd, violating the "drift lands on last" invariant the tests require.
  const sum = weights.reduce((a, b) => a + b, 0);
  let rows = weights.map(w => Math.floor((w / sum) * totalCells));

  // --- Min-1 clamp --------------------------------------------------------
  rows = rows.map(r => Math.max(1, r));

  // --- Drift absorption on LAST index ------------------------------------
  let drift = totalCells - rows.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    rows[termCount - 1] += drift;
    // If the absorption pushed the last pane below 1, pull from the biggest.
    if (rows[termCount - 1] < 1) {
      const need = 1 - rows[termCount - 1];
      // Find the biggest pane with headroom (>= 1 + need after the pull).
      let bigIdx = 0;
      for (let i = 0; i < termCount - 1; i++) {
        if (rows[i] > rows[bigIdx]) bigIdx = i;
      }
      if (rows[bigIdx] - need < 1) return null;  // cannot satisfy min-1 everywhere
      rows[bigIdx] -= need;
      rows[termCount - 1] = 1;
    }
  }

  // --- Post-condition: sum === totalCells, all >= 1 ----------------------
  const finalSum = rows.reduce((a, b) => a + b, 0);
  if (finalSum !== totalCells) return null;
  if (rows.some(r => r < 1)) return null;
  return rows;
}
