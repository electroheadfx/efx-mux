---
phase: 22
plan: 07
subsystem: sub-scope-pane
tags: [gap-closure, per-project-persistence, first-launch-gate, uat-blocker]
requires:
  - 22-01 (hierarchical scope registry + sticky-id drop migration)
  - 22-04 (D-02 first-launch default seeding wired in main.tsx)
  - 22-06 (hierarchical right-scope iteration in main.tsx project lifecycle)
provides:
  - Per-project active-sub-scope lists keyed `${zone}-active-subscopes:<project>`
  - Per-project split-ratio CSS vars keyed `${zone}-split-${idx}-pct:<project>`
  - Per-project first-launch gate flag `first-launch:<project>` in state.session
  - shouldSeedFirstLaunch / markFirstLaunchSeeded helpers
  - restoreActiveSubScopes(projectName?) overload with CSS var clear-before-restore
affects:
  - Cold start: restores active project's split state instead of the stale global
  - Project switch: split state + first-launch seed both re-applied per project
  - Delete-then-restart: D-02 defaults no longer recreate deleted tabs (flag short-circuits seed)
  - Closes UAT gap 2 (deletes survive restart — flag half) and UAT gap 9 (per-project split persistence)
tech-stack:
  added: []
  patterns:
    - Per-project key suffix (`:<project>`) on layout keys
    - Clear-before-restore for CSS custom properties on project switch (no leakage)
    - Existence-gate flag in state.session for one-shot defaults
key-files:
  created:
    - src/components/sub-scope-pane.test.ts
  modified:
    - src/components/sub-scope-pane.tsx (per-project keys + first-launch helpers)
    - src/drag-manager.ts (intra-zone handle writes per-project split ratio keys)
    - src/main.tsx (restoreActiveSubScopes per-project + first-launch-gated seed blocks in bootstrap and project-changed)
    - src/components/main-panel.test.tsx (updated assertion to per-project key)
decisions:
  - Clear ALL split-ratio CSS vars before restoring so projects with no
    saved ratio start fresh (prevents project A's 60% ratio bleeding into
    project B — test 4).
  - Reset activeMainSubScopes / activeRightSubScopes signals to defaults
    at the top of restoreActiveSubScopes so projects without a per-project
    entry do NOT inherit the prior project's scope list.
  - No migration of pre-existing global keys: Phase 22 is fresh and the
    keys added here (`*-active-subscopes:*`, `*-split-*-pct:*`,
    `first-launch:*`) are all-new. Legacy bare keys (if any) remain in
    state.json as harmless dead values; future cleanup plan may sweep.
  - Closure captures `activeProjectName.value` at call time in
    spawnSubScopeForZone + drag-manager's intra-zone onEnd — both execute
    synchronously on user gestures, so no race.
  - Test 1 assertion relaxed from `not.toHaveProperty(bare key)` to
    `toBe(stale pre-existing value)` — the state.layout blob carries
    pre-existing fixture keys through save cycles; the semantic we care
    about is "our write targeted the per-project key, not the bare one."
metrics:
  duration: "~20min"
  completed: "2026-04-18"
---

# Phase 22 Plan 07: Gap-Closure — Per-Project Split State + First-Launch Flag Summary

Per-project persistence for vertical split state (active-sub-scope lists + CSS var ratios) plus a one-shot `first-launch:<project>` gate in `state.session` that prevents D-02 defaults from recreating deleted tabs on restart.

## Tasks Completed

| # | Task                                                                           | Commit   |
| - | ------------------------------------------------------------------------------ | -------- |
| 1 | RED tests in `sub-scope-pane.test.ts` (5 failing tests targeting new APIs)     | e8f331f  |
| 2 | GREEN: per-project keys in `sub-scope-pane.tsx` + `drag-manager.ts`, plus      | 8b11812  |
|   | `shouldSeedFirstLaunch` / `markFirstLaunchSeeded` helpers                      |          |
| 3 | Wire per-project restore + first-launch seed gates in `src/main.tsx`           | d4be22f  |

## New Per-Project Key Formats

| Key                                            | Source                                                    | Type           |
| ---------------------------------------------- | --------------------------------------------------------- | -------------- |
| `main-active-subscopes:<project>`              | `spawnSubScopeForZone('main')` when project active        | state.layout   |
| `right-active-subscopes:<project>`             | `spawnSubScopeForZone('right')` when project active       | state.layout   |
| `main-split-0-pct:<project>`                   | drag-manager intra-zone handle `onEnd`                    | state.layout   |
| `main-split-1-pct:<project>`                   | drag-manager intra-zone handle `onEnd`                    | state.layout   |
| `right-split-0-pct:<project>`                  | drag-manager intra-zone handle `onEnd`                    | state.layout   |
| `right-split-1-pct:<project>`                  | drag-manager intra-zone handle `onEnd`                    | state.layout   |
| `first-launch:<project>`                       | `markFirstLaunchSeeded` (one-shot after D-02 seed)        | state.session  |

When `activeProjectName.value` is `null` (pre-project-open), the key-builders fall back to the bare global string. This path is only hit in tests; real flow always has a project set before split operations run.

## Migration Story

**No migration needed.** Phase 22's vertical split was introduced in this phase (Plans 22-03 / 22-04). The bare global keys (`main-active-subscopes`, `right-active-subscopes`, `main-split-0-pct`, etc.) only existed for a brief window between 22-04 and 22-07. Any values written by pre-22-07 builds remain in `state.json` as harmless dead entries — the loader ignores them because it reads per-project keys. A future phase could sweep them if desired.

## Exact Line Deltas

### `src/components/sub-scope-pane.tsx`

Replaced the global `MAIN_SUBSCOPES_KEY` / `RIGHT_SUBSCOPES_KEY` constants and the no-arg `restoreActiveSubScopes()` with:

- Three private key builders (`activeSubScopesKey`, `splitRatioKey`, `firstLaunchKey`) that fall back to the bare key when `projectName` is nullish.
- `spawnSubScopeForZone(zone)`: now reads `activeProjectName.value` and writes to `activeSubScopesKey(zone, project)`.
- `restoreActiveSubScopes(projectName?: string | null)`:
  - Resets `activeMainSubScopes` / `activeRightSubScopes` to defaults so the prior project's list cannot leak.
  - Clears all four `--{zone}-split-{i}-pct` CSS vars via `removeProperty` BEFORE restoring (the clear-before-restore pattern — test 4).
  - Reads per-project keys only.
- New exports `shouldSeedFirstLaunch(projectName)` / `markFirstLaunchSeeded(projectName)` — the first returns `state.session['first-launch:<project>'] === undefined`; the second writes `'1'` via `updateSession`.

### `src/drag-manager.ts`

Added `activeProjectName` import alongside `updateLayout`. Inside `attachIntraZoneHandles`'s `onEnd` callback:

```ts
const project = activeProjectName.value;
const key = project
  ? `${zone}-split-${idx}-pct:${project}`
  : `${zone}-split-${idx}-pct`;
void updateLayout({ [key]: `${clamped.toFixed(1)}%` });
```

The `onDrag` callback still writes the CSS var unqualified (it's transient per-drag UI, not persistence).

### `src/main.tsx`

| Location   | Before                                                     | After                                                                                                        |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Line 30    | `import { getActiveSubScopesForZone } from ...`            | `import { getActiveSubScopesForZone, shouldSeedFirstLaunch, markFirstLaunchSeeded } from ...`                |
| Line 155   | `restoreActiveSubScopes();` (no arg)                       | `restoreActiveSubScopes(activeProjectName.value);`                                                           |
| Lines 515-519 | Unconditional right-0 seed (file-tree + gsd)            | Wrapped in `if (shouldSeedFirstLaunch(activeName))` + `await markFirstLaunchSeeded(activeName)` (lines 518-525) |
| After line 635 right-scope restore loop (project-changed handler) | No per-project restore; comment only       | Added `restoreActiveSubScopes(newProjectName)` (line 644) + matching `if (shouldSeedFirstLaunch(...))` + `markFirstLaunchSeeded` seed gate (lines 650-658) |

### `src/components/main-panel.test.tsx`

Updated the `persistence of active sub-scopes` test to assert `main-active-subscopes:testproj` (the per-project key produced under the new contract) instead of the bare global key.

### `src/components/sub-scope-pane.test.ts` (new file)

5 tests covering:
1. `spawnSubScopeForZone` writes per-project key when project is active.
2. `restoreActiveSubScopes(projectName)` reads per-project keys and ignores stale global keys.
3. Split ratio CSS var is restored per-project.
4. Switching projects clears prior project's split CSS vars (clear-before-restore).
5. `shouldSeedFirstLaunch` / `markFirstLaunchSeeded` round-trip through state.session.

## The Clear-Before-Restore Pattern

**Why it matters (test 4):** CSS custom properties set on `document.documentElement` persist across renders — `restoreActiveSubScopes` is called on project switch, not on unmount/remount. If project A had `--main-split-0-pct = 30%` and project B has no saved ratio, simply skipping the `setProperty` call for B would leave A's value in place. B's terminals would render with A's visual proportion.

**Implementation** (sub-scope-pane.tsx, inside `restoreActiveSubScopes`):

```ts
// Always clear ALL split-ratio CSS vars first so blank projects start fresh.
for (const zone of ['main', 'right'] as const) {
  for (let i = 0; i < 2; i++) {
    document.documentElement.style.removeProperty(`--${zone}-split-${i}-pct`);
  }
}
```

This runs unconditionally, BEFORE reading per-project values, so the CSS falls back to whatever default the CSS itself defines (or unset). Only if the per-project key has a stored value does a fresh `setProperty` run.

## The `shouldSeedFirstLaunch` Gate

**Location(s) in main.tsx:**

- **Cold-start bootstrap (lines 518-525):** After right-scope restore, gate the file-tree + gsd seed. Only runs when `first-launch:<active-project>` is absent in `state.session`. Marks the flag after seeding.
- **Project-changed handler (lines 650-658):** Same gate, same seed, same mark, but keyed on the newly-activated project name.

**Before this plan:** The seed block was unconditional — `if (!rightFileTreeExists && !gsdTab.value) { ... }`. This check passed when the user had deleted both seeded tabs and restarted (state restore correctly loaded the empty tab lists, so the seed's check `!rightFileTreeExists` was true and it ran again).

**After this plan:** The seed check is AND-gated with `shouldSeedFirstLaunch(projectName)`. On first project open, the flag is absent → seed runs → flag is set. On subsequent opens (or project switches), the flag is present → seed short-circuits → the user's deletions persist.

## Verification Results

| Check                                                                                                                        | Result            |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `grep -c "function activeSubScopesKey" src/components/sub-scope-pane.tsx`                                                     | 1                 |
| `grep -c "function splitRatioKey" src/components/sub-scope-pane.tsx`                                                          | 1                 |
| `grep -c "function firstLaunchKey" src/components/sub-scope-pane.tsx`                                                         | 1                 |
| `grep -c "export function shouldSeedFirstLaunch" src/components/sub-scope-pane.tsx`                                           | 1                 |
| `grep -c "export function markFirstLaunchSeeded" src/components/sub-scope-pane.tsx`                                           | 1                 |
| `grep -cE "restoreActiveSubScopes\(activeProjectName\.value\)\|restoreActiveSubScopes\(newProjectName\)" src/main.tsx`       | 2                 |
| `grep -cE "restoreActiveSubScopes\(\)" src/main.tsx` (no-arg count — must be 0)                                              | 0                 |
| `grep -c "shouldSeedFirstLaunch" src/main.tsx`                                                                                | 3 (1 import + 2 gates) |
| `grep -c "markFirstLaunchSeeded" src/main.tsx`                                                                                | 3 (1 import + 2 calls) |
| `grep -cE "if \(shouldSeedFirstLaunch\(.+\)\)" src/main.tsx`                                                                  | 2                 |
| `pnpm exec tsc --noEmit` — errors in `src/main.tsx`                                                                           | 0                 |
| `pnpm exec tsc --noEmit` — errors in `src/components/sub-scope-pane.tsx`                                                      | 0                 |
| `pnpm exec tsc --noEmit` — errors in `src/drag-manager.ts`                                                                    | 0                 |
| `pnpm exec vitest run src/components/sub-scope-pane.test.ts`                                                                  | 5 passed / 0 failed |
| `pnpm exec vitest run src/components/main-panel.test.tsx`                                                                     | 6 passed / 0 failed |
| Project-wide (vs 22-06 baseline 49 failed / 354 passed)                                                                       | 49 failed / 359 passed (+5 new, zero regressions) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `main-panel.test.tsx` asserted the old bare global key**
- **Found during:** Task 3 full test-suite regression check.
- **Issue:** The existing test `Phase 22: split spawning > persistence of active sub-scopes` called `spawnSubScopeForZone('main')` with an active project (`testproj`) and then asserted `'main-active-subscopes' in patch`. With the new per-project contract, the write targets `main-active-subscopes:testproj` and the bare key is never produced.
- **Fix:** Updated the test to assert the per-project key (`main-active-subscopes:testproj`). This matches the new contract and is what the test was morally trying to validate.
- **Files modified:** `src/components/main-panel.test.tsx`
- **Commit:** d4be22f (same commit as Task 3; the assertion change is a direct consequence of the contract change).

**2. [Rule 1 — Test fixture semantics] Task 1 `not.toHaveProperty('main-active-subscopes')` clashed with stale-key fixture**
- **Found during:** Task 2 verification (Task 1's written tests actually ran after Task 2 landed).
- **Issue:** The test fixture pre-seeds `'main-active-subscopes': '["main-0"]'` in the layout (used by test 2 to prove stale-global-ignore on restore). `updateLayout` merges into `state.layout` and serializes the whole blob, so the stale key stays in the saved snapshot even though our write targeted only the per-project key. The plan's literal `not.toHaveProperty` assertion fails on presence, not on authorship.
- **Fix:** Relaxed the assertion to `expect(lastPatch['main-active-subscopes']).toBe('["main-0"]')` — the pre-existing stale value is unchanged, which is the semantic the test actually wants (our write did not overwrite the bare key to the new value).
- **Files modified:** `src/components/sub-scope-pane.test.ts`
- **Commit:** 8b11812 (same commit as Task 2; adjusted during GREEN iteration).

**3. [Rule 1 — Bug] `.at(-1)` requires ES2022 lib**
- **Found during:** Task 2 `pnpm exec tsc --noEmit` check.
- **Issue:** Plan pseudocode used `layoutPatches.at(-1)`, which the project's current `tsconfig` lib target does not expose on `any[]` (TS2550).
- **Fix:** Replaced with `layoutPatches[layoutPatches.length - 1]`.
- **Files modified:** `src/components/sub-scope-pane.test.ts`
- **Commit:** 8b11812.

## Success Criteria

- [x] All split-state persistence keys include project name suffix (`${zone}-active-subscopes:<project>`, `${zone}-split-${i}-pct:<project>`)
- [x] Split-ratio CSS vars are cleared on project switch (no leakage — test 4 passes)
- [x] D-02 first-launch defaults run exactly once per project (`first-launch:<project>` flag gate — test 5 passes + verified by main.tsx deltas)
- [x] Per-project restore wired in main.tsx bootstrap AND project-changed handler

## Hand-off Note for Plan 22-08

22-07 closes UAT gap 9 (split persistence) and the flag-half of gap 2 (deletes survive restart).

**Still open for 22-08:** per-scope tab persistence — even with the first-launch flag in place, tabs created under `right-0` / `right-1` / `right-2` may not fully restore per-scope on project switch if the per-scope persistence key routing is incomplete. 22-06 migrated main.tsx to iterate `getActiveSubScopesForZone('right')` for save/restore, which is the right shape, but 22-08 should audit that each per-scope blob (`terminal-tabs:<project>:<scope>`) round-trips cleanly through the new per-project split state — i.e. that switching away from a project that has `right-1` active, then switching back, re-creates the `right-1` sub-scope AND its tabs in the correct pane.

## Self-Check: PASSED

Files verified present:
- `src/components/sub-scope-pane.test.ts` — FOUND (5 tests)
- `src/components/sub-scope-pane.tsx` — FOUND (exports `shouldSeedFirstLaunch`, `markFirstLaunchSeeded`, `restoreActiveSubScopes(projectName?)`)
- `src/drag-manager.ts` — FOUND (per-project split ratio key branch at line ~162)
- `src/main.tsx` — FOUND (per-project restore at lines 155, 644; first-launch gates at lines 518 and 650)

Commits verified present via `git log --oneline -4`:
- `e8f331f test(22-07): add failing tests for per-project split state + first-launch flag` — FOUND
- `8b11812 feat(22-07): per-project split state + first-launch flag helpers` — FOUND
- `d4be22f fix(22-07): per-project restore + first-launch seed gate in main.tsx` — FOUND
