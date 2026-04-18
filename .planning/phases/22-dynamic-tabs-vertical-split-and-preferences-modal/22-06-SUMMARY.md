---
phase: 22
plan: 06
subsystem: terminal-tabs
tags: [gap-closure, hierarchical-scopes, defensive-remap, uat-blocker]
requires:
  - 22-01 (hierarchical scope registry in terminal-tabs.tsx)
  - 22-04 (right-0 D-02 seeding wired in main.tsx)
  - sub-scope-pane.tsx getActiveSubScopesForZone()
provides:
  - getTerminalScope() accepts legacy 'main'/'right' ids and remaps to 'main-0'/'right-0'
  - persistActiveTabIdForScope() accepts legacy ids via identical remap
  - main.tsx save/restore loops iterate getActiveSubScopesForZone('right')
affects:
  - Cold start console (zero `unknown terminal scope: right` rejections)
  - Project switch persistence (right sub-scopes save/restore hierarchically)
  - Unblocks: 22-07, 22-08, 22-09, 22-10, 22-11, 22-12, 22-13 (all assume cold start succeeds)
tech-stack:
  added: []
  patterns:
    - Defensive legacy-id remap (narrow surface: exactly 2 legacy strings mapped to -0 scopes)
    - Iteration via getActiveSubScopesForZone to support N ≤ 3 sub-scopes
key-files:
  created: []
  modified:
    - src/components/terminal-tabs.tsx (getTerminalScope remap + persistActiveTabIdForScope remap)
    - src/components/terminal-tabs.test.ts (3 new Phase 22 gap-closure tests)
    - src/main.tsx (5 legacy callsites migrated; obsolete sticky-tab fallback deleted; import added)
decisions:
  - Remap lives inside the exported accessors (getTerminalScope + persistActiveTabIdForScope);
    the internal getScope() stays strict so any new callsite bug still throws early.
  - Error message keeps the user-supplied scope string (not the remapped one) so bogus-id
    reports remain copy-paste-identifiable in logs.
  - The 3 new tests compare signal references (.tabs === .tabs), not wrapper object identity,
    because getTerminalScope returns a fresh wrapper per call.
metrics:
  duration: "16min"
  completed: "2026-04-18"
---

# Phase 22 Plan 06: Gap-Closure — Cold-Start `unknown terminal scope: right` Summary

Defensive legacy-id remap in `getTerminalScope()` plus a full sweep of `main.tsx` to iterate hierarchical right-scope ids via `getActiveSubScopesForZone('right')`.

## Tasks Completed

| # | Task                                                                           | Commit  |
| - | ------------------------------------------------------------------------------ | ------- |
| 1 | Defensive legacy `'right'`/`'main'` remap in `getTerminalScope` + RED tests    | 7392a6f |
| 2 | Migrate main.tsx callsites to iterate hierarchical right-scope ids             | 96ddb80 |

## Exact Line Deltas

### `src/components/terminal-tabs.tsx`
- **`getTerminalScope(scope)`** (≈line 919): inserted 9-line defensive remap (`'right' → 'right-0'`, `'main' → 'main-0'`) before `getScope()` lookup; reassigns `scope = remapped` so the captured closure methods use the hierarchical id.
- **`persistActiveTabIdForScope(scope)`** (≈line 886): mirrored the same remap — this helper was also throwing `unknown terminal scope: right` when unified-tab-bar called it with the legacy id after a sticky-tab click.

### `src/components/terminal-tabs.test.ts`
Added a new top-level describe block (before the existing `terminal-tabs scope registry` block):

```
describe("Phase 22 gap-closure: legacy scope-id remap (22-06)", () => {
  it("getTerminalScope remaps legacy 'right' id to 'right-0' instead of throwing", ...)
  it("getTerminalScope remaps legacy 'main' id to 'main-0' instead of throwing", ...)
  it("getTerminalScope still throws for genuinely unknown scope ids", ...)
})
```

### `src/main.tsx`
Migrated 5 legacy callsites and deleted the obsolete sticky-tab fallback:

| Before                                                                        | After                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Line 501 `getTerminalScope('right').restoreProjectTabs(activeName, ...)`      | `for (const scope of getActiveSubScopesForZone('right'))` loop            |
| Lines 508-517 `rightScope` + `rightActive === 'file-tree'` sticky fallback    | Deleted — replaced with comment citing D-03/D-06 (empty scope allowed)    |
| Line 572 `getTerminalScope('right').saveProjectTabs(oldName)`                 | `for (const scope of getActiveSubScopesForZone('right'))` save loop       |
| Line 629 `getTerminalScope('right').restoreProjectTabs(newProjectName, ...)`  | `for (const scope of getActiveSubScopesForZone('right'))` restore loop    |
| Lines 635-647 second sticky fallback block (project-changed)                  | Deleted — replaced with D-03/D-06 comment                                 |
| **New import** (line 30)                                                      | `import { getActiveSubScopesForZone } from './components/sub-scope-pane'` |
| Line 647 comment prose still referred to `getTerminalScope('right')`          | Refreshed to cite Phase 22 D-10 hierarchical scopes                       |

**Net:** +26 / -39 in `src/main.tsx` (one insertion of loop, two deletions of obsolete fallback blocks).

## Verification Results

| Check                                                                              | Result                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| `grep -cE "getTerminalScope\(['\"]right['\"]\)" src/main.tsx`                      | 0                                            |
| `grep -cE "getTerminalScope\(['\"]main['\"]\)" src/main.tsx`                       | 0                                            |
| `grep -c "getActiveSubScopesForZone" src/main.tsx`                                 | 4 (1 import + 3 iteration call sites)        |
| `grep -cE "rightActive === 'file-tree'\|rightActive === 'gsd'" src/main.tsx`       | 0 (sticky fallback deleted)                  |
| `grep -c "scope === 'right'" src/components/terminal-tabs.tsx`                     | 2 (both remap sites: getTerminalScope + persistActiveTabIdForScope) |
| `grep -c "remaps legacy 'right'" src/components/terminal-tabs.test.ts`             | 1                                            |
| `grep -c "remaps legacy 'main'" src/components/terminal-tabs.test.ts`              | 1                                            |
| `grep -c "still throws for genuinely unknown scope" src/components/terminal-tabs.test.ts` | 1                                      |
| `pnpm exec tsc --noEmit` — errors in `src/main.tsx`                                | 0                                            |
| `pnpm exec tsc --noEmit` — errors in `src/components/terminal-tabs.tsx`            | 0                                            |
| `pnpm exec tsc --noEmit` — total error count (project-wide baseline 104)           | 97 (net drop of 7 — no regression)           |
| `pnpm exec vitest run` — project-wide results (baseline 22-04: 65 failed)          | 49 failed / 354 passed (16 tests recovered)  |
| 3 new `Phase 22 gap-closure` tests                                                 | All pass                                     |

## Pre-existing Failures Recovered

The 22-04-SUMMARY baseline was 65 project-wide test failures. After this plan the count is 49 — **16 prior-failing tests recovered**, comfortably exceeding the plan's ≥11 target.

The 16 recovered tests are in `src/components/terminal-tabs.test.ts` and previously died on the `unknown terminal scope: right` throw inside `getTerminalScope`. They now progress past the throw. The 12 tests that still fail in that file are pre-existing Phase 22 D-10/D-12 shape mismatches (legacy session-naming `-r1`/`-r2`, legacy persistence keys `right-terminal-tabs:<project>`) — out of scope for 22-06. Those are tracked for a later gap-closure plan or test refresh (not in the 22-06 through 22-14 gap-closure chain).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] `persistActiveTabIdForScope` also threw for legacy ids**
- **Found during:** Task 1 verification (test "restoreProjectTabs preserves right-scope sticky activeTabId (file-tree / gsd)" failed with `Error: [efxmux] unknown terminal scope: right`).
- **Issue:** The plan specified the remap only inside `getTerminalScope`, but `persistActiveTabIdForScope` — another exported helper called from `unified-tab-bar` sticky-tab handlers — calls `persistTabStateScoped(scope)` directly with the user-supplied scope. Legacy `'right'` therefore still threw.
- **Fix:** Mirrored the identical 4-line remap inside `persistActiveTabIdForScope`. The internal `getScope()` stays strict (no behavioral change there).
- **Files modified:** `src/components/terminal-tabs.tsx`
- **Commit:** 7392a6f (same commit as Task 1; tight coupling)

**2. [Rule 1 — Bug / scope closure fidelity] Closure methods captured the pre-remap scope**
- **Found during:** Task 1 implementation.
- **Issue:** The plan's pseudocode creates `const remapped = ...; const state = scopes.get(remapped)` but did not address that the returned wrapper's closure methods reference `scope` (the unmapped string). If a caller does `getTerminalScope('right').saveProjectTabs(oldName)`, the wrapper would pass `'right'` into `saveProjectTabsScoped` and the inner `getScope('right')` would throw.
- **Fix:** After `const s = getScope(remapped)`, added `scope = remapped;` so the closure captures the hierarchical id.
- **Files modified:** `src/components/terminal-tabs.tsx`
- **Commit:** 7392a6f

### Plan specification refinements

**3. Test assertion uses signal identity instead of wrapper identity**
- **Found during:** Task 1 test draft.
- **Issue:** Plan specified `expect(right).toBe(right0)` (wrapper object reference equality), but `getTerminalScope` builds a fresh wrapper on every call.
- **Fix:** Tests now assert `right.tabs === right0.tabs` and `right.activeTabId === right0.activeTabId` (signal reference equality). This actually exercises the D-11 backward-compat guarantee (same underlying scope state), which is the test's intent.
- **Files modified:** `src/components/terminal-tabs.test.ts`
- **Commit:** 7392a6f

## Success Criteria

- [x] `getTerminalScope()` accepts and remaps legacy `'main'`/`'right'` to `'main-0'`/`'right-0'` (defensive — emits no warning, no throw)
- [x] Every callsite in `src/main.tsx` that previously used legacy ids now iterates hierarchical scopes via `getActiveSubScopesForZone`
- [x] The obsolete Phase-20 sticky-tab `activeTabId` fallback (two blocks in main.tsx) is deleted
- [x] Zero new test regressions (49 failures before this plan's scope; 49 after on different baselines — no new failures introduced by my changes, and 16 existing failures recovered)
- [x] 3 new gap-closure tests pass

## Hand-off Note for Plan 22-07

Right-scope tabs now restore correctly under the hierarchical scope model, and cold start no longer throws `unknown terminal scope: right`. **However**, per-project split persistence (UAT gap 9) is still open — `activeRightSubScopes` and `activeMainSubScopes` are currently stored at `layout.*-active-subscopes` (project-global). Plan 22-07 should move these to per-project keys so each project remembers its own vertical split count. That work is isolated from 22-06's fixes and does not require any further getTerminalScope migration.

## Self-Check: PASSED

Files verified present:
- `src/components/terminal-tabs.tsx` — FOUND (getTerminalScope remap at line 919; persistActiveTabIdForScope remap at line 886)
- `src/components/terminal-tabs.test.ts` — FOUND (Phase 22 gap-closure describe block at line 105)
- `src/main.tsx` — FOUND (import at line 30; save loop in project-pre-switch; restore loops in bootstrap + project-changed)

Commits verified present via `git log --oneline -5`:
- 7392a6f `fix(22-06): defensive legacy 'right'/'main' remap in getTerminalScope` — FOUND
- 96ddb80 `fix(22-06): main.tsx iterates hierarchical right-scopes instead of legacy 'right'` — FOUND
