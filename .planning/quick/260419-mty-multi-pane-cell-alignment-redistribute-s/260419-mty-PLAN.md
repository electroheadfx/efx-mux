---
phase: quick-260419-mty
plan: 1
quick_id: 260419-mty
type: quick-full
wave: 1
depends_on: []
files_modified:
  - src/window/pane-distribute.ts
  - src/window/pane-distribute.test.ts
  - src/window/resize-increments.ts
  - src/drag-manager.ts
  - src/components/sub-scope-pane.tsx
  - src/main.tsx
autonomous: false
requirements:
  - quick-260419-mty
must_haves:
  truths:
    - "When the main panel holds 2+ stacked sub-scopes all showing terminals, every pane's rendered height equals `tabBarH + R_i × cellH` for integer R_i (no partial-row band at the bottom of any terminal pane, in any zone)."
    - "Dragging an intra-zone split handle and releasing re-aligns the OTHER terminal panes in that zone to integer cell rows (not just the pane whose boundary was dragged)."
    - "Resizing the macOS window (corner drag) redistributes cell heights across every terminal pane in both zones within ≤100ms after the drag settles, with no ResizeObserver feedback loop."
    - "Switching a pane's active tab from a terminal to an editor (or vice versa) triggers a redistribute within one rAF so the pane-kind change recomputes the split."
    - "Mixed-content zones (terminal + editor) keep the editor pane's measured px untouched and quantize only the terminal panes into the remaining cell budget."
    - "Persisted split pcts (`${zone}-split-${i}-pct:${project}` in state.json) are NEVER overwritten by the distribute call — only runtime-only `document.documentElement.style` vars are mutated by distributeCells."
    - "All single-pane (N=1) behaviour and non-regression targets from l4c hold: NSWindow snap still works, sidebar collapse still works, server pane collapse still works, no pane carries inline `height:Npx + flex:none` on mount."
    - "When no terminal is visible anywhere (`getActiveTerminalCellGeom()` returns null) distributeCells bails without writing any CSS var — never divides by zero, never sets NaN pcts."
  artifacts:
    - path: "src/window/pane-distribute.ts"
      provides: "distributeCells(zone) public entry; computeTargetRows(totalCells, weights, termCount) pure function; measureTabBarH cache; classifyPane helper."
      exports: ["distributeCells", "computeTargetRows"]
    - path: "src/window/pane-distribute.test.ts"
      provides: "Unit coverage for computeTargetRows: single-pane short-circuit, all-terminal even split, weight-proportional split, drift-to-last absorption, minRows floor clamp, degenerate inputs."
      contains: "describe('computeTargetRows'"
    - path: "src/window/resize-increments.ts"
      provides: "Extended syncIncrementsDebounced callback: after invoke succeeds, call distributeCells('main') + distributeCells('right') inside the same 100ms trailing tick."
      contains: "distributeCells"
    - path: "src/drag-manager.ts"
      provides: "attachIntraZoneHandles onEnd callback appends distributeCells(zone) after syncIncrementsDebounced."
      contains: "distributeCells(zone)"
    - path: "src/components/sub-scope-pane.tsx"
      provides: "spawnSubScopeForZone + closeSubScope each call distributeCells(zone) after the existing queueMicrotask(dispatchLayoutChanged) dispatch."
      contains: "distributeCells(zone)"
    - path: "src/main.tsx"
      provides: "window resize listener (NOT ResizeObserver) feeding syncIncrementsDebounced; per-scope effect() that subscribes to every active sub-scope's activeTabId and re-runs distributeCells after rAF."
      contains: "window.addEventListener('resize'"
  key_links:
    - from: "src/drag-manager.ts"
      to: "src/window/pane-distribute.ts"
      via: "attachIntraZoneHandles onEnd calls distributeCells(zone) AFTER syncIncrementsDebounced — runtime-only CSS var rewrite for the non-dragged panes in the zone."
      pattern: "distributeCells\\(zone\\)"
    - from: "src/window/resize-increments.ts"
      to: "src/window/pane-distribute.ts"
      via: "Inside the existing 100ms debounced callback, after invoke('set_content_resize_increments', ...) resolves, call distributeCells for both zones."
      pattern: "distributeCells\\('main'\\)"
    - from: "src/components/sub-scope-pane.tsx"
      to: "src/window/pane-distribute.ts"
      via: "spawnSubScopeForZone + closeSubScope call distributeCells(zone) after dispatchLayoutChanged — keeps newly added/removed panes cell-aligned immediately."
      pattern: "distributeCells\\(zone\\)"
    - from: "src/main.tsx"
      to: "src/window/pane-distribute.ts"
      via: "effect() subscribes to every active sub-scope's activeTabId.value; on change, requestAnimationFrame(() => { distributeCells('main'); distributeCells('right'); }). A separate window.addEventListener('resize', syncIncrementsDebounced) owns the window-resize hook."
      pattern: "distributeCells\\('(main|right)'\\)"
---

<objective>
Kill the multi-pane remainder band. When a zone has 2+ stacked terminal sub-scopes, only ONE pane cell-aligned (whichever coincides with the window's global NSWindow snap); the others drifted by sub-pixel amounts because their split pct came from the user's last drag. This plan post-processes CSS-var split pcts so EVERY terminal pane's computed px is `tabBarH + R × cellH` for integer R.

**Architecture (from RESEARCH §§1-5)**:
- New module `src/window/pane-distribute.ts` exporting `distributeCells(zone)` + pure `computeTargetRows(totalCells, weights, termCount)`.
- Five wiring sites: drag-manager (intra-zone onEnd), resize-increments.ts (extended debounce body), sub-scope-pane.tsx (spawn + close), main.tsx (window resize listener + tab-switch effect).
- Runtime-only CSS vars via `document.documentElement.style.setProperty` — the persisted per-project pcts in state.json stay untouched. Two stores: persisted = user intent; runtime = cell alignment.
- NO `ResizeObserver` — feedback-loop trap. `window.addEventListener('resize', ...)` fires once per window geometry change, panel tracks via flex.
- NO pane inline `height:Npx + flex:none` on mount. That's the k1n-regression shape. The 22-11 intra-zone drag pane.style lifecycle stays untouched.
- Mixed-content panes (editor / file-tree / gsd / git-changes) keep their measured px — algorithm skips them, quantizes only remaining terminal budget.
- Last pane has `flex:1` — algorithm writes vars for i=0..N-2 only. Drift absorbs into the last TERMINAL pane (not necessarily the last pane).

**Non-regression guarantee**: The 746ee9c-state is preserved — window-level snap, single-pane terminals, server pane collapse, responsive height resize, sidebar collapse.

Purpose: complete the iTerm2/Ghostty parity story begun by l4c. Currently multi-pane splits show a 1-4px remainder band at the bottom of one or more terminal panes; after this quick-fix every visible terminal row is drawn edge-to-edge.

Output:
- One new TS module + unit tests (pure-function core).
- One new export from resize-increments.ts's debounce body.
- Four wiring diffs (drag-manager, main.tsx, sub-scope-pane.tsx x2).
- Zero Rust changes.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260419-mty-multi-pane-cell-alignment-redistribute-s/260419-mty-RESEARCH.md
@.planning/quick/260419-l4c-cell-based-window-pane-resize-like-iterm/260419-l4c-PLAN.md
@.planning/STATE.md
@CLAUDE.md
@src/window/resize-increments.ts
@src/drag-manager.ts
@src/components/sub-scope-pane.tsx
@src/components/main-panel.tsx
@src/components/right-panel.tsx
@src/main.tsx

<interfaces>
<!-- Contracts the executor must honour verbatim — extracted from the codebase. -->

From src/window/resize-increments.ts (l4c):
```typescript
export interface CellGeom { originX: number; originY: number; cellW: number; cellH: number; }
export function getActiveTerminalCellGeom(): CellGeom | null;
export function snapToCell(px: number, axis: 'x' | 'y'): number;
export function syncWindowIncrements(cellW: number, cellH: number): Promise<void>;
export function syncIncrementsDebounced(): void;       // reads geom internally, debounced 100ms
export function clearWindowIncrements(): Promise<void>;
```

From src/components/terminal-tabs.tsx (active scope accessor):
```typescript
export type TerminalScope = 'main-0' | 'main-1' | 'main-2' | 'right-0' | 'right-1' | 'right-2';
export function getTerminalScope(scope: TerminalScope): {
  tabs: Signal<TerminalTab[]>;
  activeTabId: Signal<string>;
  // A pane is 'terminal' iff its active tab id appears in tabs[].
};
```

From src/components/sub-scope-pane.tsx (shape the algorithm consumes):
```typescript
// Exported active-sub-scope signals:
export const activeMainSubScopes: Signal<TerminalScope[]>;   // default ['main-0']
export const activeRightSubScopes: Signal<TerminalScope[]>;  // default ['right-0']

// Each SubScopePane renders:
//   .sub-scope-pane (class name — queried by algorithm)
//     data-subscope={scope}
//     style:
//       height: isLast ? undefined : `var(--${zone}-split-${index}-pct, ${(100 / total).toFixed(1)}%)`
//       flex:   isLast ? 1 : 'none'
//       minHeight: 48
//     children:
//       .tab-bar  (wrapped by [data-tablist-scope] — use EITHER selector to measure)
//       .sub-scope-body (flex:1)
```

From src/components/main-panel.tsx + right-panel.tsx:
```typescript
// Panel wrappers — algorithm queries these by class:
//   .main-panel    → holds N sub-scopes + ServerPane (panel.clientHeight EXCLUDES ServerPane only if ServerPane is NOT inside — CHECK)
//   .right-panel   → holds N sub-scopes, nothing else
```
NOTE: `.main-panel` contains `<ServerPane />` as its LAST child. `panel.clientHeight` includes the server pane's px. When iterating `.sub-scope-pane` children of `.main-panel`, sum their `offsetHeight` + intra-handle heights for H; do NOT use `panel.clientHeight` directly (it overcounts by server pane height). See algorithm step 1 below.

From src/drag-manager.ts (the intra-zone handle body we're extending):
```typescript
// attachIntraZoneHandles('main' | 'right') registers handles matching
// [data-handle="${zone}-intra-N"]. Current onEnd (lines 199-215) already:
//   1. snapToCell(clientY, 'y')
//   2. computes pct from panel rect
//   3. void updateLayout({ [key]: `${pct}%` })   // persists per project
//   4. syncIncrementsDebounced();                // keeps NSWindow snap in sync
// Append distributeCells(zone) as step 5 (AFTER syncIncrementsDebounced so
// the window has the new-snapped geometry before we divide it up).
```

From src/window/resize-increments.ts (the debounce body we're extending):
```typescript
// Inside the existing 100ms trailing-edge callback (after `void syncWindowIncrements(...)`),
// add two calls:
//   distributeCells('main');
//   distributeCells('right');
// This is the "share a single debounce with syncIncrementsDebounced" rule
// from RESEARCH §2b — no second debounce handle.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure `computeTargetRows` + pane-distribute module skeleton with unit tests</name>
  <files>
    src/window/pane-distribute.ts,
    src/window/pane-distribute.test.ts
  </files>
  <behavior>
    - `computeTargetRows(totalCells, weights, termCount)` is a PURE function (no DOM, no globals). Inputs: totalCells (integer ≥ termCount), weights (array of positive numbers, length = termCount), termCount (positive integer). Output: integer[] of length termCount, each ≥ 1, summing to exactly totalCells.
    - Edge case — single terminal (termCount=1): returns `[totalCells]` regardless of weights[0].
    - Even split (weights = [10, 10]): rows = [totalCells/2, totalCells/2] (±1 for odd totalCells, drift lands on LAST index).
    - Weight-proportional: weights = [300, 100], totalCells = 40 → rows ≈ [30, 10]. weights = [100, 300], totalCells = 40 → rows ≈ [10, 30].
    - Drift absorption: rounding that would leave total ≠ totalCells is corrected by adding/subtracting the delta from the LAST terminal pane (index termCount-1). After absorption, sum must equal totalCells exactly.
    - Min-1 clamp: any pane whose proportional share would round to 0 is raised to 1; the LAST pane then absorbs the negative drift (and is clamped to ≥ 1 by a rebalance step that pulls from the biggest pane).
    - Degenerate rebalance: weights = [1, 1, 1, 1], totalCells = 4 → [1,1,1,1]. weights = [1, 1, 1], totalCells = 2 → function returns null (cannot satisfy both sum=2 and min=1 for 3 panes). Caller treats null as "bail, don't write".
    - Determinism: same inputs → same output across calls (no Math.random, no Date).
  </behavior>
  <action>
Create two new files. This task produces ONLY the pure core + test coverage — no DOM integration yet (Task 2 wires that in).

### 1a. `src/window/pane-distribute.ts` (skeleton)

Module header comment:
```ts
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
```

**Exports (stable public API)**:
```ts
export function distributeCells(zone: 'main' | 'right'): void;
export function computeTargetRows(
  totalCells: number,
  weights: number[],
  termCount: number,
): number[] | null;
```

**`computeTargetRows` algorithm (implement this in Task 1; Task 2 wires `distributeCells`)**:
```ts
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

  // --- Proportional split by weight --------------------------------------
  const sum = weights.reduce((a, b) => a + b, 0);
  let rows = weights.map(w => Math.round((w / sum) * totalCells));

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
```

**`distributeCells` in this task**: write a TODO stub that logs to console and returns:
```ts
export function distributeCells(_zone: 'main' | 'right'): void {
  // TODO(260419-mty Task 2): implement DOM-integration body.
  // See RESEARCH §1 — algorithm pseudocode.
  return;
}
```
The stub exists so Task 2's wiring-site imports resolve and the type contract is stable. Task 2 will replace this body.

### 1b. `src/window/pane-distribute.test.ts`

Follow the vitest pattern used by `src/window/resize-increments.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeTargetRows } from './pane-distribute';

describe('computeTargetRows — pure math', () => {
  it('single pane: returns [totalCells] regardless of weights', () => {
    expect(computeTargetRows(40, [10], 1)).toEqual([40]);
    expect(computeTargetRows(1, [99999], 1)).toEqual([1]);
  });

  it('two panes, even weights: splits evenly with drift on last', () => {
    expect(computeTargetRows(40, [10, 10], 2)).toEqual([20, 20]);
    expect(computeTargetRows(41, [10, 10], 2)).toEqual([20, 21]); // drift on last
  });

  it('two panes, weight 3:1 → 30:10 of 40', () => {
    expect(computeTargetRows(40, [300, 100], 2)).toEqual([30, 10]);
  });

  it('two panes, weight 1:3 → 10:30 of 40', () => {
    expect(computeTargetRows(40, [100, 300], 2)).toEqual([10, 30]);
  });

  it('three panes, equal weights, totalCells=12 → [4,4,4]', () => {
    expect(computeTargetRows(12, [1, 1, 1], 3)).toEqual([4, 4, 4]);
  });

  it('three panes, equal weights, totalCells=13 → drift to last [4,4,5]', () => {
    expect(computeTargetRows(13, [1, 1, 1], 3)).toEqual([4, 4, 5]);
  });

  it('min-1 clamp: small pane gets 1 even if weight share would round to 0', () => {
    // weights = [1000, 1], totalCells = 10 → naive round = [10, 0] → clamp [10, 1] → drift = -1 → pull from biggest → [9, 1]
    const r = computeTargetRows(10, [1000, 1], 2);
    expect(r).toEqual([9, 1]);
  });

  it('returns null when totalCells < termCount', () => {
    expect(computeTargetRows(2, [1, 1, 1], 3)).toBeNull();
  });

  it('returns null on non-finite totalCells', () => {
    expect(computeTargetRows(NaN, [1, 1], 2)).toBeNull();
    expect(computeTargetRows(Infinity, [1, 1], 2)).toBeNull();
  });

  it('returns null on mismatched weights length', () => {
    expect(computeTargetRows(10, [1, 1, 1], 2)).toBeNull();
  });

  it('returns null on zero or negative weight', () => {
    expect(computeTargetRows(10, [0, 1], 2)).toBeNull();
    expect(computeTargetRows(10, [-1, 1], 2)).toBeNull();
  });

  it('deterministic: same inputs produce same output across calls', () => {
    const a = computeTargetRows(37, [123, 456, 789], 3);
    const b = computeTargetRows(37, [123, 456, 789], 3);
    expect(a).toEqual(b);
  });

  it('post-condition: all outputs are integers ≥ 1 and sum to totalCells', () => {
    const cases: Array<[number, number[], number]> = [
      [100, [1, 2, 3], 3],
      [50, [5, 7], 2],
      [40, [10, 10, 10, 10], 4],
    ];
    for (const [tc, w, n] of cases) {
      const r = computeTargetRows(tc, w, n);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(r.length).toBe(n);
      expect(r.every(x => Number.isInteger(x) && x >= 1)).toBe(true);
      expect(r.reduce((a, b) => a + b, 0)).toBe(tc);
    }
  });
});
```

**DO NOT**:
- Do NOT import anything from DOM in this task (no `document`, no `window`).
- Do NOT implement the `distributeCells` body yet — stub only. Task 2 owns it.
- Do NOT change any existing files in this task. Task 1 is purely additive (two new files).
- Do NOT use `Math.floor` in the drift-absorption branch — `Math.round` is specified for the proportional split (matches RESEARCH §1 raw rounding step).
  </behavior>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux &amp;&amp; pnpm test -- --run src/window/pane-distribute.test.ts 2>&amp;1 | tail -40</automated>
  </verify>
  <done>
`pnpm test -- --run src/window/pane-distribute.test.ts` reports every spec in `describe('computeTargetRows — pure math')` passing. `src/window/pane-distribute.ts` exports exactly two symbols (`distributeCells`, `computeTargetRows`). `distributeCells` is an exported no-op stub that does nothing but typechecks. `pnpm tsc --noEmit` clean. No existing file modified.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Implement `distributeCells` DOM-integration body + wire 5 call sites</name>
  <files>
    src/window/pane-distribute.ts,
    src/window/resize-increments.ts,
    src/drag-manager.ts,
    src/components/sub-scope-pane.tsx,
    src/main.tsx
  </files>
  <action>
Replace the Task 1 stub `distributeCells` with the DOM-integration body, then wire the 5 call sites per RESEARCH §2 and the frontmatter key_links.

### 2a. `src/window/pane-distribute.ts` — implement `distributeCells`

Add these imports at the top (above the existing export block):
```ts
import { getActiveTerminalCellGeom } from './resize-increments';
import { getTerminalScope, type TerminalScope } from '../components/terminal-tabs';
```

Add a module-scoped tab-bar height cache:
```ts
let _tabBarH: number | undefined;

function measureTabBarH(paneEl: HTMLElement): number {
  if (_tabBarH !== undefined) return _tabBarH;
  // Prefer the canonical selector used by unified-tab-bar ([data-tablist-scope]).
  // Fall back to .tab-bar for any legacy markup that might still be queried.
  const bar = paneEl.querySelector<HTMLElement>('[data-tablist-scope], .tab-bar');
  _tabBarH = bar?.offsetHeight ?? 36;
  return _tabBarH;
}
```

Add a pane-kind classifier:
```ts
function classifyPaneKind(paneEl: HTMLElement, zone: 'main' | 'right'): 'terminal' | 'mixed' {
  // Read the scope id from data-subscope (SubScopePane writes this).
  const scopeAttr = paneEl.getAttribute('data-subscope') as TerminalScope | null;
  if (!scopeAttr) return 'mixed';
  // Voidless assertion: SubScopePane always writes a valid scope, so `scopeAttr` is trusted.
  const scopeState = getTerminalScope(scopeAttr);
  const activeId = scopeState.activeTabId.value;
  // A pane is 'terminal' iff its active tab is one of its own scope's terminal tabs.
  const isTerm = scopeState.tabs.value.some(t => t.id === activeId);
  return isTerm ? 'terminal' : 'mixed';
  // Suppresses the unused `zone` arg warning (kept for future per-zone rules).
  void zone;
}
```

Now replace the `distributeCells` stub with the full body — follow RESEARCH §1 pseudocode verbatim:

```ts
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
```

Keep the existing `computeTargetRows` export untouched from Task 1.

### 2b. `src/window/resize-increments.ts` — extend debounce body

Add import at the top (near the existing `import { invoke }`):
```ts
import { distributeCells } from './pane-distribute';
```

Inside `syncIncrementsDebounced`'s setTimeout callback, AFTER `void syncWindowIncrements(cellW, cellH);`, append the two distribute calls:
```ts
_debounceHandle = setTimeout(() => {
  _debounceHandle = undefined;
  const g = getActiveTerminalCellGeom();
  if (!g) return;

  const cellW = Math.round(g.cellW * 2) / 2;
  const cellH = Math.round(g.cellH * 2) / 2;

  void syncWindowIncrements(cellW, cellH);

  // 260419-mty: post-distribute cell-aligned pcts across all stacked sub-scopes.
  // Runs in the SAME 100ms trailing tick — single coalescer (RESEARCH §2b).
  // Ordering: NSWindow snap IPC fires first (void — fire-and-forget), then we
  // divide up the new cell-multiple zone heights. The IPC is async but the
  // distribute reads DOM px that the NSWindow snap mutation will produce NEXT
  // frame; both distributeCells + IPC converge to the same geometry.
  distributeCells('main');
  distributeCells('right');
}, 100);
```

### 2c. `src/drag-manager.ts` — append `distributeCells(zone)` to intra-zone onEnd

Add import at top of the existing import block:
```ts
import { distributeCells } from './window/pane-distribute';
```
(sibling to the existing `import { snapToCell, syncIncrementsDebounced } from './window/resize-increments';`)

In `attachIntraZoneHandles`, inside the intra-zone `onEnd(clientY)` callback, append ONE line AFTER `syncIncrementsDebounced();` (which lives at the END of the current onEnd body — line ~214):
```ts
onEnd(clientY: number) {
  // ... existing body up through syncIncrementsDebounced() ...
  syncIncrementsDebounced();
  // 260419-mty: re-align the OTHER terminal panes in this zone after the
  // dragged pane snapped. Runtime-only write; persisted per-project pct
  // (set by updateLayout above) stays the user's intent.
  distributeCells(zone);
},
```

DO NOT add `distributeCells` to `onDrag` — that would fight the user's drag. Live snap during drag is already handled by `snapToCell(clientY, 'y')` at the top of onDrag (RESEARCH §2a).

DO NOT add it to sidebar-main / main-right / main-h onEnd — those are not intra-zone (they resize the zone ITSELF, and the `syncIncrementsDebounced` they already call will trigger distribute through 2b).

### 2d. `src/components/sub-scope-pane.tsx` — call distribute after spawn + close

Add import at the top (after the existing `import { attachIntraZoneHandles } from '../drag-manager';` line):
```ts
import { distributeCells } from '../window/pane-distribute';
```

In `spawnSubScopeForZone`, append after the existing `queueMicrotask(() => dispatchLayoutChanged());`:
```ts
export function spawnSubScopeForZone(zone: Zone): void {
  // ... existing body up through queueMicrotask(() => dispatchLayoutChanged()); ...
  queueMicrotask(() => dispatchLayoutChanged());
  // 260419-mty: the new pane was just mounted — its CSS var pct is the default
  // `${100 / total}%`, which rarely lands on a cell boundary. Schedule a
  // distribute for the next rAF so Preact has rendered the new pane first.
  requestAnimationFrame(() => distributeCells(zone));
}
```

In `closeSubScope`, append after the existing `queueMicrotask(() => dispatchLayoutChanged());` near the end of the function:
```ts
export function closeSubScope(zone: Zone, index: number): void {
  // ... existing body up through queueMicrotask(() => dispatchLayoutChanged()); ...
  queueMicrotask(() => dispatchLayoutChanged());
  // 260419-mty: the remaining panes just grew to absorb the closed pane's
  // space. Their pcts are now stale (summed to < 100). Distribute so they
  // re-align to cell rows.
  requestAnimationFrame(() => distributeCells(zone));
}
```

### 2e. `src/main.tsx` — window resize listener + tab-switch effect

Add import (alongside the existing `import { syncIncrementsDebounced, clearWindowIncrements } from './window/resize-increments';`):
```ts
import { distributeCells } from './window/pane-distribute';
```

Add also (if not already imported — the file already imports getTerminalScope on line 30):
```ts
// already present on line 30:
// import { ..., getTerminalScope, ... } from './components/terminal-tabs';
import { activeMainSubScopes, activeRightSubScopes } from './components/sub-scope-pane';
```

In `bootstrap()`, AFTER the existing Step 4b effect (line ~224-234, the `if (isTerminal) syncIncrementsDebounced() else clearWindowIncrements()` effect), add THREE new blocks.

**Block 1 — window resize listener (NOT ResizeObserver)**:
```ts
// Step 4d (260419-mty): window resize → shared debounce. The syncIncrementsDebounced
// handler already triggers distributeCells('main') + distributeCells('right')
// inside its 100ms trailing tick (Task 2b). This is the ONE listener that feeds
// both window-increment sync AND multi-pane redistribute — single 100ms coalescer.
window.addEventListener('resize', () => syncIncrementsDebounced());
```

**Block 2 — per-scope activeTabId effect for distribute on tab-kind flip**:
```ts
// Step 4e (260419-mty): when a sub-scope's active tab flips between terminal
// and non-terminal content, redistribute in the next frame (so display:none
// toggles have landed). Subscribing reads on activeMainSubScopes /
// activeRightSubScopes + each scope's activeTabId register the effect as a
// dependency — signals re-fire when any pane's active tab changes or when a
// pane is added/removed.
effect(() => {
  // Touch the active-sub-scope lists so add/remove re-subscribes.
  const mainScopes = activeMainSubScopes.value;
  const rightScopes = activeRightSubScopes.value;
  // Touch every scope's activeTabId so tab-kind flips re-fire.
  for (const s of mainScopes) void getTerminalScope(s).activeTabId.value;
  for (const s of rightScopes) void getTerminalScope(s).activeTabId.value;
  // Defer to the next frame so display:none toggles in SubScopePane have
  // applied before we measure.
  requestAnimationFrame(() => {
    distributeCells('main');
    distributeCells('right');
  });
});
```

Place both blocks in the same area as Step 4b / 4c (immediately after the DPR listener `try { mql1.addEventListener(...) } catch { }` block, still inside `bootstrap()`).

**DO NOT**:
- Do NOT add a ResizeObserver on `.main-panel` / `.right-panel` / `.sub-scope-pane` anywhere in this task. RESEARCH §2b explicitly bans it (feedback-loop trap).
- Do NOT mutate `.sub-scope-pane` inline styles from any new code path. All pct writes go through `document.documentElement.style.setProperty('--${zone}-split-${i}-pct', …)` — same lane as drag-manager + restoreActiveSubScopes.
- Do NOT call `updateLayout` from `distributeCells` or its callers. Persistence is the drag-onEnd lane; distribute is runtime-only (RESEARCH §4f).
- Do NOT duplicate the debounce. `syncIncrementsDebounced` owns the single 100ms debounce that fans out to both NSWindow sync AND distribute (Task 2b).
- Do NOT handle the `cellH < 8` / `termCount === 0` / `totalCells < termCount` bail-outs in the call sites. The `distributeCells` body owns all bail conditions — call sites just invoke it.

**Non-regression cross-check before committing**:
- Run `pnpm tsc --noEmit` — should be clean.
- `grep -n distributeCells` across the codebase must return exactly 10 hits:
  - `src/window/pane-distribute.ts`: 2 (export + definition)
  - `src/window/pane-distribute.test.ts`: 0 (only `computeTargetRows`)
  - `src/window/resize-increments.ts`: 2 (import + 2 invocations inside debounce, so 3 hits total counting import)
  - Actually 3: import + 2 calls. Accept range 9-11.
  - `src/drag-manager.ts`: 2 (import + 1 call)
  - `src/components/sub-scope-pane.tsx`: 3 (import + 2 calls)
  - `src/main.tsx`: 3 (import + 2 calls inside effect)
- `grep -n ResizeObserver` in any of the 5 touched files: must be ZERO hits.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux &amp;&amp; pnpm test 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit 2>&amp;1 | tail -20</automated>
  </verify>
  <done>
`pnpm test` full suite passes (existing drag-manager, resize-handler, resize-increments, theme-manager, state-manager, tokens + new pane-distribute tests — no regressions). `pnpm tsc --noEmit` clean. Grep invariants:
- `distributeCells` imported in exactly 4 files (resize-increments, drag-manager, sub-scope-pane, main.tsx).
- `computeTargetRows` accessed only inside `pane-distribute.ts` + `pane-distribute.test.ts`.
- `ResizeObserver` appears in ZERO of the 5 touched files.
- `.sub-scope-pane` inline-style `height` mutations exist only inside `attachIntraZoneHandles` (the unchanged 22-11 onDrag body).
- No `updateLayout` call inside `pane-distribute.ts`.
All 3 integration sites in sub-scope-pane + main.tsx use `requestAnimationFrame` before distribute (per RESEARCH §2c rAF-necessity guard).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual hardware verification — multi-pane cell alignment (build on l4c parity)</name>
  <files>(none — hardware verification only)</files>
  <action>Follow the steps in &lt;how-to-verify&gt;. User confirms that multi-pane splits now cell-align like single-pane + window did after l4c, with no regressions.</action>
  <verify>User confirms per resume-signal below.</verify>
  <done>User types "approved" OR describes a specific mismatch for follow-up.</done>
  <what-built>
Tasks 1-2 complete: new `src/window/pane-distribute.ts` with pure `computeTargetRows` (unit-tested) + DOM-integrated `distributeCells(zone)`. Wired into 5 sites — intra-zone drag onEnd, the shared 100ms resize-increments debounce, sub-scope spawn + close, and a main.tsx effect subscribing to every active scope's activeTabId. A `window.addEventListener('resize', syncIncrementsDebounced)` owns the window-geometry hook (no ResizeObserver — feedback-loop trap).

Persisted per-project split pcts in state.json are NEVER touched by distribute — runtime-only CSS var lane, matching the l4c drag-onDrag convention. All automated tests passing, tsc clean.

The user now verifies multi-pane iTerm2-grade feel on real hardware. AppKit + xterm cell measurements cannot be unit-tested.
  </what-built>
  <how-to-verify>
Run the app: `pnpm tauri dev` (per CLAUDE.md, user runs the server themselves — developer should launch only if the user asks).

**Critical checks — multi-pane cell alignment (the mty goal):**

1. **Two-pane terminal split, main panel**:
   - Start with a single terminal in the main panel.
   - Click the "+ split" button on the main-panel tab bar (or whichever gesture spawns a second sub-scope with a terminal).
   - Observe the split: TWO stacked terminal panes in main-panel. Both should have NO partial-row band at the bottom — every visible row is drawn edge-to-edge.
   - Pre-l4c/pre-mty: one pane snapped, the OTHER had 1-4px gap at its bottom.
   - Post-mty: BOTH panes align flush. The intra-zone handle sits on a cell boundary.

2. **Three-pane terminal split, main panel**:
   - Split again → THREE stacked terminals.
   - EXPECT: no partial-row band in any of the three panes.

3. **Intra-zone drag — redistribute fires on onEnd**:
   - With 2 or 3 stacked terminals, drag an intra-zone handle downward by a pixel or two.
   - DURING drag: the dragged handle snaps to cell rows (l4c behavior — this is live `snapToCell`).
   - ON RELEASE: the OTHER pane(s) in the zone re-align so their bottoms land on cell boundaries. If you only see the dragged pane snap and the others keep their remainder band — distribute-on-onEnd didn't fire. Grep `distributeCells(zone)` in drag-manager.ts to confirm it's called at the end of intra-zone onEnd.

4. **Right panel, multi-pane**:
   - Split the right panel (if the UI supports it — it does, via activeRightSubScopes).
   - EXPECT: same behavior — all right-panel terminal panes cell-aligned.

5. **Window resize with multi-pane**:
   - With 2+ stacked terminals in main, grab the window bottom edge and drag.
   - EXPECT: the window snaps to cell-rows (l4c), AND within ~100ms of the drag settling, all terminal panes re-align so each one ends on a cell boundary. No partial-row band should "flash" or persist.

6. **Mixed-content split**:
   - Main-panel: split into 2 sub-scopes. In sub-scope 0, open an editor tab (click a file in the file-tree). In sub-scope 1, keep a terminal tab active.
   - EXPECT: the editor pane's px height stays untouched (editor can have any pixel height). The terminal pane aligns to `tabBarH + R × cellH` exactly — no partial-row band at the bottom of the terminal.
   - Resize the window → editor pane flexes (no snap), terminal pane re-aligns to cell grid.

7. **All-editor zone**:
   - Main-panel: split into 2 sub-scopes, both showing editor tabs.
   - EXPECT: no CSS-var writes by distribute (termCount === 0 bail). Both panes keep their drag-persisted pct. No breakage.

8. **Tab-switch flips pane kind**:
   - Start with 2 stacked terminals in main.
   - In pane 1, switch its active tab from terminal to editor (open a file in a pane-1 file-tree tab, or drag an editor tab into pane 1).
   - EXPECT: within one frame, pane 0 (terminal) re-aligns to the new cell budget. Before: pane 1's prior terminal px was in the terminal budget; after the flip it's 'mixed' and keeps its px, so pane 0's budget shrinks and its row count quantizes down.
   - Switch back to terminal → pane 0 re-expands to its cell-aligned share.

9. **Sub-scope spawn / close**:
   - Start with 1 terminal. Spawn a second sub-scope with a terminal. EXPECT: distribute fires on rAF after the mount; both panes cell-aligned immediately (no "flash of unaligned").
   - Close the newly spawned pane. EXPECT: pane 0 grows back, cell-aligned.

10. **Sidebar / server pane collapse still works**:
    - With multi-pane active in main, hit Ctrl+B to collapse the sidebar. EXPECT: sidebar collapses to 40px; main panel expands; distribute re-fires via the window resize listener; terminal panes stay cell-aligned.
    - Hit Ctrl+S to toggle server pane expansion. EXPECT: server pane shows; main's sub-scope area shrinks vertically; distribute re-fires; terminal panes stay cell-aligned within the new zone height.

11. **Project switch keeps persisted pcts**:
    - In project A, multi-pane main with a specific split (e.g. drag handle to make pane 0 ~70%). Switch to project B. Switch back to project A.
    - EXPECT: the split restores to ~70% (persisted state.json), then distribute re-aligns it to the nearest cell multiple. If the persisted value is 70.0% and cell-alignment produces 69.8%, the pane LOOKS like 69.8% — that's correct (runtime CSS var override). On next drag + release, the new drag-resolved pct persists.

12. **Font size change**:
    - Open Preferences (Cmd+,) → change chrome font size.
    - EXPECT: theme-manager fits all terminals + fires syncIncrementsDebounced → distribute runs in the same tick. All terminal panes re-align to the new cellH.

13. **No infinite loop**:
    - Open DevTools → Performance tab → record for 5 seconds while idle (no drag, no resize).
    - EXPECT: NO continuous reflows / style recalcs. If you see a Selection/Style recalc spike every frame, distribute is feedback-looping. Check that `window.addEventListener('resize', …)` is bound but NOT fired idle, and that no ResizeObserver exists in the new code.

14. **Regression sanity (l4c parity preserved)**:
    - With a single terminal in main-panel (no splits): drag the window corner. EXPECT: cell-snap behavior from l4c unchanged (window snaps to cell multiples; the single pane cell-aligns).
    - Open an editor tab in a single-pane main. Drag window corner. EXPECT: free pixel resize (l4c's activeUnifiedTabId gate + clearWindowIncrements).
    - Drag the sidebar-main / main-right / main-h handles. EXPECT: snap-to-cell during drag (l4c live snap), distribute runs on onEnd via syncIncrementsDebounced → no visible difference for single-pane.

15. **Non-goal sanity — no inline height pinning on mount**:
    - With multi-pane mounted: DevTools → inspect `<div class="sub-scope-pane">`. EXPECT: style attribute contains `height: var(--main-split-0-pct, 33.3%)` (or similar) + `flex: none` (or `flex: 1` for last). NO literal `height: 123px` + `flex: none` on mount (that's the k1n regression shape).
    - During an active intra-zone drag, pane.style.height IS set to a literal px value (22-11 behavior — this is correct). After the drag ends, the pane should resume its CSS-var-driven height — verify by re-inspecting after the drag settles.

**Troubleshooting if any check fails**:
- Check 1-2 fail (partial-row band remains in multi-pane): `distributeCells` not firing. Grep `distributeCells` in drag-manager.ts / sub-scope-pane.tsx / resize-increments.ts — should appear in onEnd + spawn/close + debounce body. If import missing, the module-level stub from Task 1 is still active.
- Check 3 fails (intra-zone onEnd doesn't redistribute): drag-manager.ts onEnd didn't append `distributeCells(zone)`. See Task 2c.
- Check 8 fails (tab-switch doesn't re-align): main.tsx effect is missing or not subscribing to every scope's activeTabId. See Task 2e Block 2.
- Check 13 shows infinite loop: a ResizeObserver was added. Grep the codebase — should be ZERO uses in the 5 touched files.
- Check 11 fails (persisted pct overwritten): `distributeCells` is calling `updateLayout`. It must NEVER call `updateLayout` — only `document.documentElement.style.setProperty`.
  </how-to-verify>
  <resume-signal>Type "approved" if all 15 checks pass (multi-pane cell-alignment + no l4c regressions + no loop). Describe any mismatch to trigger a follow-up fix.</resume-signal>
</task>

</tasks>

<verification>
Automated:
- `pnpm test` passes across the whole suite, including new `src/window/pane-distribute.test.ts` specs (computeTargetRows pure function).
- `pnpm tsc --noEmit` clean — all 5 touched files typecheck.

Grep invariants:
- `distributeCells` imported in exactly 4 files: `resize-increments.ts`, `drag-manager.ts`, `sub-scope-pane.tsx`, `main.tsx`.
- `distributeCells(` call sites: resize-increments.ts body (2 — main + right), drag-manager.ts intra-onEnd (1), sub-scope-pane.tsx spawn + close (2), main.tsx tab-switch effect (2). Total ≈ 7 call sites across 4 files.
- `ResizeObserver` appears in ZERO of the 5 touched files.
- `.sub-scope-pane` inline `height` writes ONLY inside the pre-existing `attachIntraZoneHandles` onDrag body.
- No `updateLayout` call inside `pane-distribute.ts`.
- `requestAnimationFrame` used to guard distributeCells in sub-scope-pane.tsx (spawn + close) and main.tsx (effect).
- `window.addEventListener('resize'` appears exactly once in main.tsx.

Manual (Task 3 checkpoint):
- All 15 verification checks pass per user sign-off, including l4c regression checks (single-pane + all three fixed handles still work).
</verification>

<success_criteria>
- Multi-pane main/right zones with 2-3 stacked terminals: every terminal pane's rendered height is `tabBarH + R × cellH` for integer R. No partial-row band at the bottom of any terminal pane.
- Intra-zone drag onEnd redistributes the non-dragged panes so they re-align to cell boundaries.
- Window resize (corner drag) fires the shared 100ms debounce → NSWindow snap + multi-pane distribute converge on cell-aligned layout.
- Tab-switch flipping pane kind (terminal ↔ mixed) triggers redistribute within one rAF.
- Sub-scope spawn + close trigger redistribute on rAF so new/closed pane transitions stay cell-aligned.
- Mixed-content zones: editor panes keep their current px, terminal panes quantize into the remainder.
- Persisted per-project pcts in state.json unchanged by distribute — only runtime CSS vars written.
- No pane carries inline `height:Npx + flex:none` on mount (the k1n regression shape is forbidden).
- No `ResizeObserver` anywhere in the five touched files.
- `pnpm test` + `pnpm tsc --noEmit` clean.
- All l4c behavior preserved: window-level snap, single-pane terminals, sidebar/server pane collapse, responsive flex.
- User confirms iTerm2/Ghostty parity on multi-pane hardware (Task 3 checkpoint).
</success_criteria>

<output>
After completion, create `.planning/quick/260419-mty-multi-pane-cell-alignment-redistribute-s/260419-mty-SUMMARY.md` recording: final file diffs, test counts for computeTargetRows, any Task 3 mismatches + resolutions, and a one-paragraph note on the two-store separation (persisted per-project intent in state.json vs runtime cell-alignment in document.documentElement.style).
</output>
