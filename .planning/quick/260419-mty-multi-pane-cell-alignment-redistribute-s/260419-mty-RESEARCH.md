# Quick Task: Multi-pane cell alignment (redistribute split pcts so every terminal pane cell-aligns)

**Researched:** 2026-04-19
**Domain:** Multi-pane height redistribution + CSS-var split-pct writes + hook timing
**Confidence:** HIGH (extends the verified l4c architecture; pure math + DOM integration)
**Parent:** `.planning/quick/260419-l4c-cell-based-window-pane-resize-like-iterm/260419-l4c-RESEARCH.md`

## Summary

l4c solved window-level + handle-level cell snap for the **single-pane** case: when the
NSWindow content rect is a cell-multiple, the (only) terminal's pane height matches
`R × cellH` exactly. The moment you split the zone into 2+ sub-scopes, only ONE pane
(the one whose size happens to coincide with the window's global snap) is cell-aligned.
The others get a remainder band at the bottom because their pct is driven by the user's
last drag, not by cell math.

**Primary recommendation:** add a `distributeCells(zone)` function that post-processes
the existing CSS-var split pcts so every terminal pane's computed px height ≈ integer
rows × cellH. Call it at three hook points: (1) after each intra-zone drag `onEnd`
(to re-align the OTHER panes once the dragged one snapped), (2) on window resize
(debounced, shared with `syncIncrementsDebounced`), and (3) when tab-switch within a
pane flips its content-type between terminal and non-terminal. Write runtime CSS vars
only — do NOT overwrite persisted split pcts. Preserve the last-pane `flex:1` contract.

---

## 1. Pane distribution algorithm

### Inputs (per zone)

- `H` — zone total px height, measured via `panel.getBoundingClientRect().height`
  where `panel = document.querySelector('.main-panel' | '.right-panel')`
- `cellH` — active terminal's cell height (from `getActiveTerminalCellGeom()`)
- `tabBarH` — tab-bar height per pane, constant ≈ 28-36px. Measure from DOM once:
  `paneEl.querySelector('.tab-bar, [data-tablist-scope]').offsetHeight`.
  Cached per zone to avoid thrash. Fallback: 32.
- `N` panes with existing pcts `[p0, p1, ..., p_{N-2}]` read from CSS vars
  `--{zone}-split-{i}-pct`. Last pane (index N-1) is implicit — `flex:1`.
- Per-pane kind vector `[k0, k1, ..., k_{N-1}]` where `k ∈ {terminal, mixed}`.
  A pane is `terminal` iff its active tab is in `getTerminalScope(scope).tabs.value`
  (the same test main.tsx uses for the main-0 gate). Otherwise `mixed`.

### Target shape

For each terminal pane i: `pane_px(i) = tabBarH + rows(i) × cellH` with `rows(i) ≥ 1`.
For each mixed pane i: keep `pane_px(i)` equal to its current measured height (no snap).

Sum constraint: `Σ pane_px(i) = H`.

### Algorithm (pseudocode)

```
distributeCells(zone):
  panel = document.querySelector(`.${zone}-panel`)
  if !panel: return
  H = panel.clientHeight
  geom = getActiveTerminalCellGeom()
  if !geom: return                        // no terminal mounted anywhere — nothing to snap
  cellH = round(geom.cellH * 2) / 2       // nearest 0.5 (l4c sub-pixel guard)
  if cellH < 8: return                    // degenerate font guard

  panes = panel.querySelectorAll('.sub-scope-pane')
  N = panes.length
  if N < 2: return                        // single-pane case is handled by NSWindow snap

  tabBarH = measureTabBarH(panes[0])      // cached

  // 1. Classify each pane.
  kinds = panes.map(classify)             // 'terminal' | 'mixed'

  // 2. Read current measured px for each pane (what the browser currently renders).
  currentPx = panes.map(p => p.offsetHeight)

  // 3. Compute target px for each pane.
  //    - mixed panes KEEP their current px (we don't touch them)
  //    - terminal panes round to tabBarH + R*cellH
  //
  //    Budget for terminal panes = H - Σ mixed_pane_px
  mixedTotal = Σ currentPx[i] where kinds[i] === 'mixed'
  terminalBudget = H - mixedTotal
  termCount = count(kinds[i] === 'terminal')
  if termCount === 0: return             // zone has no terminals — nothing to snap

  // 4. Rows-per-terminal: divide budget into integer rows, distribute leftover.
  //    totalCells = floor((terminalBudget - termCount*tabBarH) / cellH)
  totalCells = floor((terminalBudget - termCount * tabBarH) / cellH)
  if totalCells < termCount: return      // not enough room for 1 row each — bail, let flex handle

  // Proportional split by existing pct among terminal panes only.
  // Use existing pcts weighted by their current px (preserves user intent).
  termWeights = terminals' currentPx[]
  termWeightSum = Σ termWeights
  rawRows = termWeights.map(w => round((w / termWeightSum) * totalCells))
  // Guarantee each ≥ 1
  rawRows = rawRows.map(r => max(1, r))
  // Fix sum drift caused by rounding + min-1 clamp.
  drift = totalCells - Σ rawRows
  if drift !== 0:
    // Apply the drift to the LAST terminal pane (absorbs remainder — matches flex:1).
    lastTermIdx = indexOf last 'terminal' in kinds
    rawRows[relativeIndex(lastTermIdx)] += drift
    // If that made it < 1, pull from the biggest terminal pane instead.
    if rawRows[that] < 1: rebalance proportionally

  // 5. Build targetPx[] — mixed kept, terminals quantized.
  targetPx = currentPx.slice()
  for each terminal pane i with row count R[i]:
    targetPx[i] = tabBarH + R[i] * cellH

  // 6. Convert targetPx[] to split-pcts.
  //    SubScopePane writes: first N-1 panes use `height: var(--{zone}-split-{i}-pct)`;
  //    last pane uses `flex:1`. So we only write pcts for i = 0..N-2.
  //    For each i < N-1: pct = (targetPx[i] / H) * 100
  for i in 0..N-2:
    pct = (targetPx[i] / H) * 100
    document.documentElement.style.setProperty(`--${zone}-split-${i}-pct`, `${pct.toFixed(2)}%`)

  // The last pane picks up (H - Σ targetPx[0..N-2]) via flex:1 automatically,
  // which by construction equals targetPx[N-1]. No write needed.
```

### Edge cases

| Case | Behavior |
|------|----------|
| **All N panes terminal** | All panes get `rows(i) × cellH + tabBarH`; totalCells is split by weight. Every pane cell-aligns. |
| **Mixed content (terminal + editor)** | Editor panes keep their measured px. Terminal panes divide the leftover into integer rows. |
| **All panes mixed** | `termCount === 0` — function returns without writing. No snap pressure, existing pcts preserved. |
| **Single pane (N = 1)** | Early return — NSWindow content snap already handles this. |
| **`H < N * (tabBarH + cellH)`** | `totalCells < termCount` — bail. The minHeight:48 on `.sub-scope-pane` will kick in and the UI is cramped regardless. |
| **cellH < 8 (degenerate font)** | Bail. Prevents division-by-near-zero producing ~thousands of rows. |
| **Last pane is terminal** | Drift-absorption lands on the last terminal pane, matching the `flex:1` layout contract — the last-pane height IS the remainder of `H`. Math guarantees `R_last ≥ 1`. |
| **Last pane is mixed (editor)** | Drift-absorption lands on the last *terminal* pane in the list (not literally the last pane). The last (mixed) pane absorbs whatever pixel slack remains via `flex:1` — which is fine because mixed panes don't care about cell alignment. |
| **`display:none` hidden pane** | `panel.querySelectorAll('.sub-scope-pane')` includes all mounted panes regardless of display. All N count toward the split. Hidden panes are rare in this zone model — always-mounted bodies are display-toggled, but panes themselves are always visible. Safe to ignore. |

### Why weight by `currentPx` instead of raw `pct`

Reading the CSS var string (`"42.5%"`) and parsing it re-introduces the `parseFloat` + N-1-vs-N mismatch the l4c plan already stumbled on (the implicit last-pane pct is NOT stored anywhere). Reading `offsetHeight` gives the REAL current layout — whatever Preact + flex + CSS var resolved to — and it sums to exactly `H`. The function then redistributes the integer-row budget by those weights. This preserves user intent (bigger pane stays bigger) without recomputing an implicit pct.

---

## 2. Hook points — where to trigger `distributeCells`

### 2a. Intra-zone drag `onEnd`

In `drag-manager.ts` `attachIntraZoneHandles`, after the current `onEnd` body (which already calls `syncIncrementsDebounced()`), add `distributeCells(zone)`.

**Why after `onEnd`, not `onDrag`**: live drag already calls `snapToCell(clientY, 'y')` so the *dragged pane's* boundary hits cell grid during drag — that's the l4c behavior. But the OTHER panes in the zone didn't move; their pcts remain. After the drag settles, redistribute so everybody is cell-aligned. Snapping during onDrag would fight the user's drag (every frame you'd rewrite the var they're pulling on).

**Pitfall — write collision**: `onEnd` just called `updateLayout({ '${zone}-split-${idx}-pct:${project}': ... })` which persists the drag-resolved pct. Then `distributeCells` writes NEW runtime-only pcts to `document.documentElement.style`. The two writes target different stores (state.json vs. DOM style). On next load, `restoreActiveSubScopes()` pushes the persisted pct back into the CSS var. That's the right sequence — persist user intent, redistribute transient cell-alignment at runtime.

### 2b. Window resize

Use `window.addEventListener('resize', debouncedDistribute)` NOT `ResizeObserver` on `.main-panel`.

**Why**: ResizeObserver on the panel div is the infinite-loop trap the focus block warns about — distributeCells writes CSS vars that change pane heights that (via flex) change the panel's contentHeight → observer re-fires. The observer is a render-cycle risk.

`window.addEventListener('resize', ...)` fires ONCE per window geometry change. Panel height tracks window height via flex, so we recompute on the right signal without a feedback loop.

**Debounce**: share a single debounce with `syncIncrementsDebounced`. Extend `resize-increments.ts`:

```ts
// In the existing 100ms debounce callback, AFTER invoke('set_content_resize_increments'):
//   import { distributeCells } from './pane-distribute';
//   distributeCells('main');
//   distributeCells('right');
```

Rationale: these two run back-to-back anyway (both depend on `cellH`). Single debounce = single frame of work, ordered correctly (NSWindow sync first so the window's content is already at the new cell multiple before we divide it up).

### 2c. Tab switch changing content type

Subscribe to EACH scope's `activeTabId` signal — not just `main-0`. A `preact/signals` `effect()` per zone:

```ts
// In main.tsx bootstrap, AFTER restoreActiveSubScopes():
effect(() => {
  // Touch every scope's activeTabId so the effect re-runs when any pane flips
  // between terminal and non-terminal content.
  for (const zone of ['main', 'right'] as const) {
    const scopes = (zone === 'main' ? activeMainSubScopes : activeRightSubScopes).value;
    for (const scope of scopes) {
      // Subscribing read — value matters only for dependency tracking.
      void getTerminalScope(scope).activeTabId.value;
    }
  }
  // Defer to next frame so display:none toggles have applied before we measure.
  requestAnimationFrame(() => {
    distributeCells('main');
    distributeCells('right');
  });
});
```

The active-sub-scope signals (`activeMainSubScopes`, `activeRightSubScopes`) are also dependencies implicitly because the `for…of` over `scopes` reads them. When a pane is added/removed, the effect re-subscribes.

**Pitfall — `rAF` necessity**: SubScopePane toggles `display` on body children synchronously when `activeId` changes, but `.tab-bar` is always present and `pane.offsetHeight` doesn't actually change on tab switch within a pane. What DOES change is the pane KIND — which changes whether we count it as 'terminal' or 'mixed'. Still, measuring after rAF is safer (no hidden layout pending).

### 2d. Sub-scope add/remove

`spawnSubScopeForZone` and `closeSubScope` in `sub-scope-pane.tsx` already `queueMicrotask(() => dispatchLayoutChanged())`. Append `distributeCells(zone)` there (after `dispatchLayoutChanged` so fits land on new geometry first).

### Avoiding infinite loops

- **Never** use `ResizeObserver` on the panel div or pane divs in this codepath.
- **Never** read the CSS var back after writing it and then re-run in the same tick.
- **Always** gate writes: if `pct === existingPct` (within 0.01), skip setProperty.
- **Always** debounce window resize at ≥ 100ms (shared handle).

---

## 3. CSS var write strategy — match existing pattern

### What drag-manager does today

Reading `drag-manager.ts:160-217` (`attachIntraZoneHandles`):

```ts
// onDrag (live): runtime-only, fast path
document.documentElement.style.setProperty(`--${zone}-split-${idx}-pct`, ...);

// onEnd (settled): persist via updateLayout
const key = project ? `${zone}-split-${idx}-pct:${project}` : `${zone}-split-${idx}-pct`;
void updateLayout({ [key]: `${clamped.toFixed(1)}%` });
```

And `restoreActiveSubScopes` in `sub-scope-pane.tsx:197-204` reads the persisted key and sets the SAME CSS var on mount.

### `distributeCells` should use Option A (runtime-only)

**Recommendation:** `distributeCells` writes ONLY to `document.documentElement.style.setProperty` — not via `updateLayout`. Justification:

- **Matches intent**: user's persisted pct is their INTENT ("I want this pane to be ~40% of the zone"). Cell-alignment is a transient COSMETIC round-off for pixel-perfect terminal rendering. They're different stores of information.
- **Survives font change**: if the user changes font size, cellH changes, and the cell-aligned pct changes with it. Persisting would overwrite their stored intent every time `distributeCells` runs.
- **Survives zone resize**: if the window grows, `H` changes, and the exact cell-aligned pct changes. Re-distribution on window resize should not mutate persisted state 60 times during a drag of the window corner.
- **No drift across projects**: persisted pct is per-project (`${zone}-split-${idx}-pct:${project}`). Runtime var has no project suffix. Switching projects calls `restoreActiveSubScopes` which re-seeds the CSS var from the per-project stored pct — then `distributeCells` runs once on the new zone and writes the cell-aligned runtime var.
- **Consistent with drag**: intra-zone drag writes `document.documentElement.style` live during `onDrag`, persists only on `onEnd`. `distributeCells` is the opposite of a drag — it's a re-alignment, not a user gesture. It stays in the "transient live" lane.

**Option C (per-project prefix runtime var)** is not needed. The `--{zone}-split-{i}-pct` namespace is not project-scoped at the CSS layer; only the persistence key is. Runtime vars are always global on `document.documentElement`. Project switching calls `restoreActiveSubScopes` which re-seeds them — that's already the separation point.

### Write-skip optimization

Before setProperty, read the current value with `getPropertyValue` and compare:

```ts
const cur = document.documentElement.style.getPropertyValue(`--${zone}-split-${i}-pct`);
const next = `${pct.toFixed(2)}%`;
if (cur !== next) {
  document.documentElement.style.setProperty(`--${zone}-split-${i}-pct`, next);
}
```

This prevents style recalc when `distributeCells` fires (e.g. window resize burst) and the math resolves to the same pct.

---

## 4. Pitfalls

### 4a. Last-pane `flex:1` remainder contract

SubScopePane code: `height: isLast ? undefined : 'var(--...)'; flex: isLast ? 1 : 'none'`.

The last pane's height is `H - Σ(others)` by CSS. `distributeCells` MUST guarantee:
- `totalCells >= termCount` (room for 1 row minimum per terminal pane)
- `rawRows[lastTerm] >= 1` after drift absorption (the fallback rebalance rule above)

If the math would produce `lastTerm rows = 0`, the pane collapses to just `tabBarH` — which falls back to `minHeight: 48` (the inline style on `.sub-scope-pane`). That's a degenerate-UI state; prefer bailing cleanly to that.

### 4b. Mixed-content panes don't snap; but their pct affects neighbors

If pane 0 is an editor and pane 1 is a terminal, we can't snap pane 0 — but pane 0's current px determines pane 1's budget. So the algorithm reads `currentPx[0]` (keeps it as-is) and distributes the remainder (`H - currentPx[0]`) to pane 1's terminal budget. Pane 1 becomes `tabBarH + R × cellH` with R the maximal row count that fits in the remainder.

The editor pane gets `currentPx[0]` px (no change). The terminal pane gets exactly R rows. The sum may be < H by up to `cellH - 1` — the leftover goes to the `flex:1` last pane (the terminal in this example), but we just said the terminal's target is `tabBarH + R*cellH` exactly. Solution: when the LAST pane is the terminal, pick R such that `tabBarH + R*cellH = H - currentPx[0]` exactly; the flex:1 means setting no var — the last pane auto-takes the remainder. So we skip the setProperty write for the last pane regardless of kind; mixed-but-not-last keeps its pct via the var write.

Put another way: the function writes vars for i = 0..N-2 ONLY. Last pane is always the flex:1 remainder. Math reduces to: compute target px for panes 0..N-2, sum, `last_pane_px = H - sum`. Last pane is cell-aligned iff sum is.

**Consequence**: when `lastPane.kind === 'terminal'`, you want `sum` to be `H - (tabBarH + R*cellH)` for integer R. Pick R so that `sum` lands on that value. Easiest: fix rows for all OTHER terminal panes by weight; then the last pane absorbs whatever rows remain.

### 4c. xterm `overviewRuler = 1`

From CLAUDE.md: overviewRuler width 1 eats 1px of WIDTH, not height. Height math is unaffected. Confirmed.

### 4d. `minHeight: 48` floor

`sub-scope-pane.tsx:290`: `minHeight: 48`. A pane with R = 1 row at cellH = 17 and tabBarH = 32 = 49px — just clears minHeight. At R = 1, cellH = 14, tabBarH = 32 = 46 → minHeight kicks in, flex ignores our height var. Safe guard: compute `minRows = ceil((48 - tabBarH) / cellH)` and clamp `R >= max(1, minRows)`.

### 4e. Tab-bar height assumption

`.tab-bar` has no fixed height in CSS — content-driven. Measure once at module load (cached):

```ts
let _tabBarH: number | undefined;
function measureTabBarH(paneEl: HTMLElement): number {
  if (_tabBarH !== undefined) return _tabBarH;
  const bar = paneEl.querySelector<HTMLElement>('.tab-bar, [data-tablist-scope]');
  _tabBarH = bar?.offsetHeight ?? 32;
  return _tabBarH;
}
```

Invalidate cache on font-size change (theme-manager emits). For MVP, don't bother — font-chrome changes tab bar height by <= 2px which is within the cellH rounding slop. Re-measure if `distributeCells` is misaligned by more than cellH/2.

### 4f. Persistence non-interference

`distributeCells` MUST NOT call `updateLayout`. It writes runtime-only CSS vars. User drag still persists pcts via `onEnd → updateLayout`. Separation:

- **Persisted** (`state.json` → per-project key): user-resolved split intent. Set by drag onEnd, read by `restoreActiveSubScopes` at mount.
- **Runtime** (`document.documentElement.style.--{zone}-split-{i}-pct`): cosmetic cell-alignment. Set by drag onDrag, `distributeCells`, restore at mount. Never read back for persistence.

Flow on reload: restore reads persisted pct → writes CSS var → `distributeCells` runs after mount → re-writes CSS var to cell-aligned value → persisted pct unchanged. On next drag, user drags from the cell-aligned position, drag writes live CSS var, onEnd persists the drag-resolved pct, `distributeCells` fires → re-aligns the *other* panes.

### 4g. Rapid window resize → debounce

Window corner drag fires `resize` ~60/s. Share the 100ms debounce with `syncIncrementsDebounced`. Adding `distributeCells` to the existing debounce callback means one call every 100ms max — cheap enough (three DOM reads + up to N-1 style writes per zone).

Do NOT add a second debounce handle. The focus block explicitly calls this out: "share 100ms debounce with syncIncrementsDebounced".

### 4h. Right panel may not exist

`RightPanel` is always rendered (it's in the top-level app tree), but `activeRightSubScopes.value` is `['right-0']` by default and the panel can be width-collapsed (not display-hidden). `document.querySelector('.right-panel')` still resolves — no null guard blocks the call. But if the panel has width 0 (unlikely in current layout) or the user has toggled it hidden in the future, `panel.clientHeight === 0` → early return via the `cellH < 8` or the `totalCells < termCount` branch. Safe.

### 4i. No visible terminal anywhere → no snap

`getActiveTerminalCellGeom()` reads the FIRST visible terminal in `.main-panel`. If the user has the main panel showing an editor AND the right panel showing a terminal, this helper returns null (matches l4c's design — `set_content_resize_increments` only applies when main-0's active tab is a terminal).

Consequence: if the right panel is the only terminal, `distributeCells('right')` also bails because `geom === null`. Acceptable — this matches Architecture C: snap is a terminal-first UX feature; when main is not a terminal, nothing snaps.

**Enhancement (future, not this phase):** `getActiveTerminalCellGeom` could search both panels. For now, match l4c exactly and keep the coupling simple.

### 4j. Writing pcts that don't sum to 100

The N-1 written pcts + implicit flex:1 sum to whatever the browser resolves. Flex:1 absorbs the remainder exactly, so the total is always 100% even if our written pcts sum to, say, 73%. No invariant violation — flex layout is the source of truth for the last pane.

But: if our sum EXCEEDS 100% (e.g., you told pane 0 it's 70% and pane 1 it's 40%), flex:none clamps win, flex:1 resolves to 0 → last pane collapses. Math safeguard: `Σ pct_written` must be `< 100` with headroom (≥ tabBarH / H for the last pane at minimum).

Explicit invariant before writing: `Σ(targetPx[0..N-2]) ≤ H - (tabBarH + cellH)`. If violated, bail (don't write anything; leave runtime vars as-is).

---

## 5. Implementation shape (for the planner)

One new file: `src/window/pane-distribute.ts`

Exports:
```ts
export function distributeCells(zone: 'main' | 'right'): void;
```

Internal:
- `measureTabBarH(paneEl)` — cached
- `classifyPane(paneEl, zone, index)` — reads the scope's `activeTabId` and checks if it's in `tabs[]`
- `computeTargetRows(totalCells, weights, termCount)` — pure function, unit-testable
- Write-skip + invariant checks

Three wiring sites:
1. `drag-manager.ts` → append `distributeCells(zone)` to the intra-zone `onEnd` callback (after `syncIncrementsDebounced`).
2. `resize-increments.ts` → inside the existing 100ms debounce callback, after `syncWindowIncrements`, call `distributeCells('main')` and `distributeCells('right')`.
3. `main.tsx` → new `effect()` that subscribes to every scope's `activeTabId` and calls `distributeCells` per zone on next rAF. Also one `window.addEventListener('resize', ...)` that calls `syncIncrementsDebounced()` (which now also runs distribute).

Two sub-scope-pane sites:
4. `spawnSubScopeForZone` → after `dispatchLayoutChanged`, call `distributeCells(zone)`.
5. `closeSubScope` → same.

No new Rust. Pure frontend.

---

## 6. Sources

### Primary (HIGH)
- `.planning/quick/260419-l4c-cell-based-window-pane-resize-like-iterm/260419-l4c-RESEARCH.md` — §3 cell-geom reader, §4 sync hooks, §5 sub-pixel + minHeight pitfalls
- `src/drag-manager.ts:160-217` — intra-zone handle pattern, CSS-var write lane, persist-per-project key
- `src/components/sub-scope-pane.tsx:248-293` — SubScopePane flex:1 vs CSS-var contract, minHeight 48, inline style shape
- `src/window/resize-increments.ts` — existing 100ms debounce, `getActiveTerminalCellGeom` — source of `cellH`
- `src/components/main-panel.tsx`, `src/components/right-panel.tsx` — panel wrappers (have `.main-panel` / `.right-panel` class, no internal overrides)

### Secondary (MEDIUM)
- `src/state-manager.ts` — `updateLayout` persistence flow, per-project key scheme
- `src/styles/app.css:460` — `.tab-bar` has no fixed CSS height (content-driven, ~28-36px typical)

### Tertiary (LOW)
- None needed — this is pure integration; no new libraries.

---

## 7. Metadata

**Confidence breakdown:**
- Algorithm: HIGH — pure math; edge cases enumerated; pitfalls covered by preconditions + bails.
- Hook points: HIGH — verified against existing drag-manager + resize-increments code.
- CSS-var strategy: HIGH — matches existing drag-manager pattern exactly (runtime var, persist only on onEnd).
- Pitfalls: MEDIUM-HIGH — covered known traps (last-pane flex:1, minHeight, debounce loops). Real-hardware testing (font changes mid-drag, rapid project switching) may expose more.

**Valid until:** 2026-05-19 (30 days — depends on l4c staying shape-stable)
