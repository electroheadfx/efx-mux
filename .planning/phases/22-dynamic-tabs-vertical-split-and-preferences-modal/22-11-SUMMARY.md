---
phase: 22
plan: 11
subsystem: drag-manager + sub-scope-pane
tags: [gap-closure, intra-zone-resize, tab-bar-polish, uat-test-12]
requires:
  - 22-04 (attachIntraZoneHandles + spawnSubScopeForZone)
  - 22-07 (per-project split ratio persistence)
provides:
  - Visibly working intra-zone resize (drag between stacked sub-scopes actually moves pane heights)
  - SubScopePane props `index` + `total` for CSS-var-driven height on non-last panes
  - [data-tablist-scope] top border so the tab bar is visually distinct
  - .tab-bar-split-icon margin-right: 6px breathing room
affects:
  - All zones (main + right) with >1 sub-scope — drag handle now produces visible resize
  - Tab bar visual treatment — top + bottom borders instead of bottom-only
  - Closes UAT test 12 (intra-zone resize broken) and the tab-bar polish half of test 9
tech-stack:
  added: []
  patterns:
    - CSS var + explicit inline height (pane consumes `var(--${zone}-split-${index}-pct)` for non-last, flex:1 for last)
    - Drag handler mutates DOM directly (pane.style.height + pane.style.flex) in addition to writing the CSS var, so non-Preact consumers observe the resize synchronously
    - [data-tablist-scope] selector as the canonical tab-bar wrapper (no literal .tab-bar class in the codebase)
key-files:
  created: []
  modified:
    - src/drag-manager.ts (onDrag also mutates adjacent panes' inline height + flex)
    - src/components/sub-scope-pane.tsx (props extended with index + total; root style now conditional on isLast)
    - src/components/main-panel.tsx (pass index + total; drop extra flex wrapper div)
    - src/components/right-panel.tsx (pass index + total; drop extra flex wrapper div)
    - src/styles/app.css ([data-tablist-scope] border-top, .tab-bar-split-icon margin-right)
    - src/drag-manager.test.ts (2 new RED→GREEN tests for 22-11)
decisions:
  - Mutate pane inline style from the drag handler (not just the CSS var) — the signal-driven Preact path alone does not re-render fast enough for the test contract, and the test documents the end-state the user actually sees during a drag. Belt-and-braces is the correct tradeoff here.
  - Drop the extra `<div style={{flex:1}}>` wrapper in main-panel / right-panel — SubScopePane is now the flex item directly, so its inline height is respected by the column flex container. Previously the wrapper was the flex item with flex:1, and setting a height on SubScopePane had no effect because the wrapper absorbed all remaining space.
  - Use [data-tablist-scope] as the canonical tab-bar wrapper selector rather than introducing a new .tab-bar class. The tab bar JSX already has `data-tablist-scope={scope}` and is already consumed by drag-affordance CSS (.drop-target). Adding a parallel .tab-bar class would be redundant; extending [data-tablist-scope] keeps the selector surface single.
  - Relaxed RED test 2's final flex assertion from `toBe('none')` to `toMatch(/^(none|0 0 auto)$/)` — jsdom normalizes `style.flex = 'none'` to `'0 0 auto'` on read, so the strict equality check fails post-implementation. The assertion still correctly distinguishes the RED state (pane keeps its original `'1 1 0%'` flex) from the GREEN state (pane becomes `'0 0 auto'`).
metrics:
  duration: "~4m30s"
  completed: "2026-04-18"
---

# Phase 22 Plan 11: Gap-Closure — Intra-Zone Resize + Tab-Bar Polish Summary

Fixes the intra-zone resize handle that silently no-oped on drag (UAT test 12), plus two tab-bar polish items — missing top border and flush-right split icon (UAT test 9).

## Tasks Completed

| # | Task                                                                             | Commit   |
| - | -------------------------------------------------------------------------------- | -------- |
| 1 | RED: 2 failing tests in drag-manager.test.ts targeting the Nyquist end-state     | d228d19  |
| 2 | GREEN: drag mutates pane inline style; SubScopePane consumes CSS var; CSS polish | 19f3f7d  |

## Diagnosis: Why Intra-Zone Resize Was Silently Broken

The `attachIntraZoneHandles` binding (added in Plan 22-04) was CORRECT — it bound fresh handles, wrote the CSS var on drag, and persisted the ratio to state. The bug was downstream: **no consumer read the CSS var**.

Two concurrent root causes:
1. `SubScopePane` used `style={{ flex: 1 }}` unconditionally, so every pane took equal share of the column regardless of the `--${zone}-split-${i}-pct` value.
2. `MainPanel` / `RightPanel` wrapped each `<SubScopePane />` in an extra `<div style={{ flex: 1 }}>`. Even if `SubScopePane` had applied the CSS var, the wrapper div was the actual flex item — setting a height on the inner SubScopePane would not have altered the wrapper's flex:1 behavior.

The visible result: the user dragged the handle, saw no movement, concluded the feature was broken. The CSS var was being written correctly to `document.documentElement`, but nothing consumed it for layout.

## The New SubScopePane Contract

### Props

```ts
interface SubScopePaneProps {
  scope: TerminalScope;
  zone: Zone;
  index?: number;   // NEW: 22-11. Defaults to 0.
  total?: number;   // NEW: 22-11. Defaults to 1.
}
```

Both `index` and `total` are optional with sensible defaults so the 22-07 test fixtures (which construct SubScopePane without the new props) keep working.

### Height / flex switch

```tsx
const isLast = index === total - 1;
// ...
<div
  class="sub-scope-pane flex flex-col"
  data-subscope={scope}
  style={{
    position: 'relative',
    height: isLast ? undefined : `var(--${zone}-split-${index}-pct, ${(100 / total).toFixed(1)}%)`,
    flex: isLast ? 1 : 'none',
    minHeight: 48,
    overflow: 'hidden',
  }}
>
```

- **Non-last panes:** take their persisted ratio via CSS var (with a fallback of `100/total %` so fresh splits start evenly distributed).
- **Last pane:** keeps `flex: 1` and absorbs remaining space. This avoids "rounding gap" where the sum of explicit percentages does not equal 100% exactly.

### Wrapper-div removal in consumers

Before (main-panel.tsx):
```tsx
{scopes.map((scope, i) => (
  <div key={scope} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
    <SubScopePane scope={scope} zone="main" />
    {i < scopes.length - 1 && <div class="split-handle-h-intra" ... />}
  </div>
))}
```

After:
```tsx
{scopes.map((scope, i) => (
  <>
    <SubScopePane key={scope} scope={scope} zone="main" index={i} total={scopes.length} />
    {i < scopes.length - 1 && (
      <div key={`main-intra-${i}`} class="split-handle-h-intra" ... />
    )}
  </>
))}
```

The Fragment wrapper carries no styles, so the `main-panel` flex-column container sees `SubScopePane` and `.split-handle-h-intra` as its direct flex children. `SubScopePane`'s inline height is now the single source of truth for its size (no grandparent absorbing it).

## The drag-manager `onDrag` Extension

The drag handler now writes THREE things on every mousemove:

```ts
onDrag(clientY: number) {
  // ... existing clamp math ...

  // (1) CSS var — for Preact-reactive consumers (future re-renders)
  document.documentElement.style.setProperty(
    `--${zone}-split-${idx}-pct`,
    `${clamped.toFixed(1)}%`,
  );

  // (2) + (3) — Phase 22 gap-closure 22-11: DIRECT DOM MUTATION so non-Preact
  // consumers (and the 22-11 RED tests) observe the resize synchronously.
  const panes = panel.querySelectorAll<HTMLElement>('.sub-scope-pane');
  const pane0 = panes[idx];
  const pane1 = panes[idx + 1];
  if (pane0 && pane1) {
    const totalPx = pane0.offsetHeight + pane1.offsetHeight;
    if (totalPx > 0) {
      const newPane0Px = (clamped / 100) * totalPx;
      pane0.style.height = `${newPane0Px}px`;
      pane0.style.flex = 'none';
      pane1.style.height = `${totalPx - newPane0Px}px`;
      pane1.style.flex = 'none';
    }
  }
}
```

Belt-and-braces: the CSS var remains the persistence source of truth (onEnd writes it to state.layout), but the inline style gives immediate visual feedback during the drag without waiting for a Preact re-render cycle.

## CSS Additions

### Tab bar top border

```css
.tab-bar,
[data-tablist-scope] {
  border-top: 1px solid var(--color-border);
}
```

**Canonical wrapper:** the tab bar JSX in `unified-tab-bar.tsx` uses `role="tablist"` + `data-tablist-scope={scope}` + Tailwind's `border-b` for the bottom border. No literal `.tab-bar` class exists in the codebase. This rule doubles up — `[data-tablist-scope]` is the real selector; `.tab-bar` is a future-proofing alias in case a class is added later.

### Split icon right margin

```css
.tab-bar-split-icon {
  /* ...existing... */
  margin-right: 6px;
}
```

6px matches the breathing room UI-SPEC calls for. The close-split icon (22-10) already has `margin-left: 4px` so the two icons still sit close-but-not-adjacent.

## Verification Results

| Check                                                                                  | Result                |
| -------------------------------------------------------------------------------------- | --------------------- |
| `grep -n "border-top: 1px solid var(--color-border)" src/styles/app.css`               | 3 matches             |
| `grep -n "margin-right: 6px" src/styles/app.css` (near .tab-bar-split-icon)            | 1 match, line 428     |
| `grep -n "var(--\${zone}-split-\${index}-pct" src/components/sub-scope-pane.tsx`       | 1 match, line 271     |
| `grep -n "isLast \? 1 : 'none'" src/components/sub-scope-pane.tsx`                     | 1 match, line 272     |
| `grep -n "index\?: number" src/components/sub-scope-pane.tsx`                          | 1 match, line 213     |
| `grep -n "<SubScopePane[^/]*index={" src/components/{main,right}-panel.tsx`            | 2 matches (both)      |
| `grep -n "pane0.style.height" src/drag-manager.ts`                                     | 1 match, line 165     |
| `pnpm exec vitest run src/drag-manager.test.ts`                                        | 4 passed / 0 failed   |
| `pnpm exec vitest run src/components/main-panel.test.tsx src/components/sub-scope-pane.test.ts` | 16 passed / 0 failed |
| `pnpm exec tsc --noEmit` — errors in drag-manager.ts / sub-scope-pane.tsx / main-panel.tsx / right-panel.tsx | 0 |
| Full suite (vs 22-10 baseline 49 failed / 364 passed)                                  | 49 failed / 366 passed (+2 new, 0 regressions) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test semantics] RED test 2 unexpectedly passed in its initial form**
- **Found during:** Task 1 initial run.
- **Issue:** The plan's literal test 2 asserted only that the CSS var was set to a percentage after drag. But this behavior was already correct in current code (22-04 and 22-07 both wrote the var correctly). Test 2 passed immediately, violating the Nyquist RED requirement.
- **Fix:** Rewrote test 2 to assert the actual end-state gap — that the drag flips each adjacent pane's `style.flex` to `'none'` (so the height sticks). Current code only writes the CSS var and never mutates pane inline style, so the assertion fails correctly. Still also sanity-checks that the CSS var is written.
- **Files modified:** `src/drag-manager.test.ts`
- **Commit:** d228d19 (same commit as Task 1 — no separate fix commit).

**2. [Rule 1 — jsdom normalization] `style.flex = 'none'` reads back as `'0 0 auto'`**
- **Found during:** Task 2 GREEN verification.
- **Issue:** jsdom parses `element.style.flex = 'none'` into the expanded shorthand `0 0 auto` and returns that from `element.style.flex`. The initial test assertion `toBe('none')` failed on post-implementation because the read-back value was `'0 0 auto'`.
- **Fix:** Relaxed both post-drag assertions to `toMatch(/^(none|0 0 auto)$/)` — accepts either the raw keyword or jsdom's expansion. The pre-drag assertion was also loosened from `toBe('1')` to `toContain('1')` for the same reason (jsdom normalizes `'flex: 1'` to `'1 1 0%'`).
- **Files modified:** `src/drag-manager.test.ts`
- **Commit:** 19f3f7d (same commit as Task 2 GREEN).

**3. [Rule 3 — Blocking] Wrapper div in main-panel / right-panel absorbed SubScopePane's height**
- **Found during:** Task 2 mid-implementation. After adding the CSS-var height on SubScopePane, visual tests still showed equal panes.
- **Issue:** The outer `<div style={{ flex: 1 }}>` wrapper around each SubScopePane was the actual flex item in the column. Its `flex: 1` overrode anything SubScopePane tried to do internally with height.
- **Fix:** Replaced the wrapper div with a Preact Fragment so SubScopePane + handle are direct children of the parent flex container, making SubScopePane's own inline height the source of truth.
- **Files modified:** `src/components/main-panel.tsx`, `src/components/right-panel.tsx`
- **Commit:** 19f3f7d (same commit as Task 2 GREEN — inseparable from the SubScopePane height fix).

## Success Criteria

- [x] Intra-zone resize handle drags adjust pane heights via persisted CSS var + direct style mutation
- [x] Tab bar visually distinct from background (top + bottom borders via [data-tablist-scope])
- [x] Split icon has 6px right margin
- [x] All resize tests green (4/4)

## The .tab-bar vs [data-tablist-scope] Question

**Answer:** `[data-tablist-scope]` is the canonical wrapper selector in this codebase. The tab bar JSX (`unified-tab-bar.tsx` line 1737) uses:

```tsx
<div
  class="flex shrink-0 items-center border-b"
  role="tablist"
  data-tablist-scope={scope}
  ...
>
```

No literal `.tab-bar` class exists. Existing drag-affordance CSS (`.drop-target`) already targets `[data-tablist-scope]`. The border-top rule doubles up with a `.tab-bar` alias for future-proofing but the active selector is the data attribute.

## Hand-off Note for Plan 22-12

Plan 22-11 closes UAT test 12 + tab-bar polish half of test 9. The
SubScopePane contract now requires `index` + `total` — future plans that
construct sub-scopes programmatically should pass them (fixtures are
tolerant via default props, but real consumers must supply them for
correct CSS-var-driven sizing). Plan 22-12 can now rely on visible resize
as a stable UX primitive; any future intra-zone behavior (snap-to-grid,
keyboard resize, etc) should hook the same `attachIntraZoneHandles`
callback chain.

## Self-Check: PASSED

Files verified present:
- `src/drag-manager.ts` — FOUND (onDrag mutates pane heights)
- `src/components/sub-scope-pane.tsx` — FOUND (index, total props; CSS var height)
- `src/components/main-panel.tsx` — FOUND (passes index + total; Fragment wrapper)
- `src/components/right-panel.tsx` — FOUND (passes index + total; Fragment wrapper)
- `src/styles/app.css` — FOUND (border-top on [data-tablist-scope]; margin-right on .tab-bar-split-icon)
- `src/drag-manager.test.ts` — FOUND (2 new 22-11 tests, both green)

Commits verified present via `git log --oneline -3`:
- `d228d19 test(22-11): RED tests for intra-zone resize — must fail until panes consume CSS var` — FOUND
- `19f3f7d fix(22-11): intra-zone resize binds + applies via CSS var; tab-bar border-top; split icon margin` — FOUND
