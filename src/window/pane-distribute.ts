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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function distributeCells(_zone: 'main' | 'right'): void {
  // TODO(260419-mty Task 2): implement DOM-integration body.
  // See RESEARCH §1 — algorithm pseudocode.
  return;
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
