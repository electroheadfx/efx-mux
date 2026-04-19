---
phase: 22
plan: 08
subsystem: terminal-tabs
tags: [gap-closure, persistence, per-mutation, tab-counter, uat-blocker]
requires:
  - 22-01 (allocateNextSessionName + projectTabCounter signal)
  - 22-06 (hierarchical-scope id remap + persistTabStateScoped scope-suffixed key)
  - 22-07 (first-launch gate — prevents D-02 reseeding every launch)
provides:
  - Durable `tab-counter:<project>` write on every allocateNextSessionName call
  - Durable scope-suffixed tab list write on every createNewTab/closeTab mutation
  - Persisted-counter restore path in seedCounterFromRestoredTabs
affects:
  - UAT gap 2 / test 16 "Tab add/delete persists across restart"
  - Cold restart continues counter numbering instead of restarting at 1
  - Deletes stay deleted (no auto-recreate — combined with 22-07 first-launch flag)
tech-stack:
  added: []
  patterns:
    - Fire-and-forget updateSession for lightweight per-mutation writes
    - parseInt + Number.isFinite + sign check for tamper-safe counter restore (T-22-08-01)
key-files:
  created: []
  modified:
    - src/components/terminal-tabs.tsx (allocateNextSessionName counter write; seedCounterFromRestoredTabs counter read; 3 saveProjectTabs call sites on mutation)
    - src/components/terminal-tabs.test.ts (new describe block "Phase 22 gap-closure (22-08)" with 3 tests)
decisions:
  - The `saveProjectTabs(activeProjectName.value, scope)` call is additive to
    the existing `persistTabStateScoped(scope)` — persistTabStateScoped writes
    the disk payload; saveProjectTabs also refreshes the in-memory
    `projectTabCache` so cross-project switches see the latest tab set without
    round-tripping through load_state.
  - Persisted counter read lives in `seedCounterFromRestoredTabs` (not a new
    function) because that function is already the canonical counter-seeding
    hook on project load. It now resolves `max(sessionName-derived, persisted)`
    so the counter never regresses even if the persisted value has been hand-
    edited to a lower number.
  - `activeProjectName.value ?? ''` guards the save call for the bootstrap
    window where the project signal may be null; saveProjectTabsScoped itself
    no-ops on empty projectName (it only writes when `tabs.length > 0`), so
    the empty-string branch is harmless.
  - Test 1 & 2 in the new describe block are regression guards, not RED: the
    existing `persistTabStateScoped` already writes the scope-suffixed key on
    mutation, so those assertions already pass pre-fix. Only test 3 was RED
    (tab-counter write was genuinely missing). All three tests together
    lock down the full per-mutation durability contract.
metrics:
  duration: "9min"
  completed: "2026-04-18"
---

# Phase 22 Plan 08: Gap-Closure — Per-Mutation Tab + Counter Persistence Summary

Wired `tab-counter:<project>` persistence into `allocateNextSessionName`, added a persisted-counter read path in `seedCounterFromRestoredTabs`, and added `saveProjectTabs(activeProjectName.value, scope)` at three mutation sites so every create/close durably refreshes both disk state and the in-memory project cache.

## Tasks Completed

| # | Task                                                                          | Commit  |
| - | ----------------------------------------------------------------------------- | ------- |
| 1 | RED: 3 failing tests for per-mutation persistence                             | 8d8f750 |
| 2 | GREEN: counter write on allocate, counter read on seed, saveProjectTabs hooks | f341592 |

## Exact Line Deltas

### `src/components/terminal-tabs.tsx`

**`allocateNextSessionName` (≈line 104) — counter write:**
- After `projectTabCounter.value = new Map(projectTabCounter.value).set(key, n);` inserted:
  ```ts
  if (key) void updateSession({ [`tab-counter:${key}`]: String(n) });
  ```
- 5-line block including the rationale comment.

**`seedCounterFromRestoredTabs` (≈line 118) — counter read:**
- After the session-name-max loop, inserted 8-line persisted-counter resolve:
  ```ts
  const persisted = getCurrentState()?.session?.[`tab-counter:${project}`];
  if (persisted !== undefined) {
    const n = parseInt(persisted, 10);
    if (Number.isFinite(n) && n >= 0) {
      max = Math.max(max, n);
    }
  }
  ```
- T-22-08-01 tamper mitigation: parseInt + `Number.isFinite` + sign check; on parse failure keeps the sessionName-derived max.

**`createNewTabScoped` (≈line 310, after `persistTabStateScoped(scope)`):**
- Added `saveProjectTabs(activeProjectName.value ?? '', scope);`

**`closeActiveTabScoped` (≈line 339, after `persistTabStateScoped(scope)`):**
- Added `saveProjectTabs(activeProjectName.value ?? '', scope);`

**`closeTabScoped` (≈line 359, after `persistTabStateScoped(scope)`):**
- Added `saveProjectTabs(activeProjectName.value ?? '', scope);`

### `src/components/terminal-tabs.test.ts`

Appended a new top-level describe block at EOF:

```
describe('Phase 22 gap-closure (22-08): per-mutation persistence', () => {
  // capture all save_state session maps
  let savedSessions: Array<Record<string, string>> = [];
  // beforeEach resets all scopes + counters + mocks IPC

  it('createNewTab on main-0 persists terminal-tabs:projZ:main-0')
  it('closeTab on main-0 persists reduced terminal-tabs:projZ:main-0')
  it('allocateNextSessionName persists tab-counter:projZ on every allocation')
})
```

## Verification Results

| Check                                                                                   | Result                             |
| --------------------------------------------------------------------------------------- | ---------------------------------- |
| `grep -nE "saveProjectTabs\(activeProjectName" src/components/terminal-tabs.tsx \| wc -l` | 3 (plan required ≥2)               |
| `grep -c "tab-counter:" src/components/terminal-tabs.tsx`                                 | 3 (1 write, 1 read, 1 comment)     |
| `grep -nE "updateSession\(\{ \[\`tab-counter" src/components/terminal-tabs.tsx`           | 1 match on line 113                |
| `pnpm exec vitest run -t "per-mutation persistence"` — 3 new tests                       | 3 passed / 0 failed                |
| `pnpm exec vitest run src/components/terminal-tabs.test.ts` — full file                 | 12 failed / 21 passed (baseline 12 failed / 18 passed → +3 passing, 0 regression) |
| `pnpm exec tsc --noEmit` — errors in `src/components/terminal-tabs.tsx`                  | 0                                  |
| `pnpm exec tsc --noEmit` — errors in `src/components/terminal-tabs.test.ts`              | 70 (identical to baseline — all pre-existing legacy `'main'`/`'right'` scope-id strings; `getTerminalScope`'s defensive remap from 22-06 keeps them runtime-valid but compile-time narrow) |
| `pnpm exec vitest run` — project-wide                                                   | 49 failed / 357 passed (baseline 49 / 354 → +3 passing, 0 regression) |

## Deviations from Plan

### Plan specification refinements

**1. File extension: plan referenced `terminal-tabs.ts`; actual file is `terminal-tabs.tsx`**
- **Found during:** Task 2 implementation (initial grep of acceptance criteria returned 0 matches against `.ts`).
- **Rationale:** The file uses JSX (`ActiveTabCrashOverlayScoped` returns `<CrashOverlay .../>`) so `.tsx` is correct. Plan acceptance-criteria greps were updated to target `.tsx`.
- **Impact:** No code impact — all edits went to the correct real file.

**2. Tests 1 & 2 pass without fix (regression guards, not genuine RED)**
- **Found during:** Task 1 test run (expected 2+ failures; got 1).
- **Root cause:** `persistTabStateScoped(scope)` is already called at the end of `createNewTabScoped` / `closeActiveTabScoped` / `closeTabScoped` (carried in from Phase 20 Plan 05-B). It writes the scope-suffixed `terminal-tabs:<project>:<scope>` key via `updateSession`. The per-mutation-persists-tabs behavior is therefore already shipped; only the counter persistence (test 3) was genuinely missing.
- **Fix:** Kept all 3 tests — tests 1 and 2 now serve as regression guards ensuring the existing `persistTabStateScoped` contract doesn't regress on future refactors. This matches the plan's intent ("every add/close call writes the scope-suffixed terminal-tabs key to state.session").
- **Commits:** 8d8f750 (test commit includes the observation in the commit body).

**3. Counter restore lives in `seedCounterFromRestoredTabs`, not `restoreProjectTabs`**
- **Rationale:** `seedCounterFromRestoredTabs(project)` is already the canonical counter-seeding hook — it's called from `main.tsx` project-load paths after `restoreProjectTabsScoped` returns. Adding the persisted-counter read there keeps counter-seeding logic in one place. `restoreProjectTabsScoped` itself doesn't know about the shared counter (by design — each scope's internal `s.counter.n` is separate).
- **Impact:** Functionally identical to the plan's suggested location; call graph reaches the same persist value.

### Auto-fixed Issues

None. Plan executed as specified (modulo the two refinements above).

## Threat-Register Disposition

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-22-08-01 (Tampering of tab-counter session value) | `parseInt` + `Number.isFinite` + `n >= 0` guard in `seedCounterFromRestoredTabs`; on any parse failure or negative, keeps the sessionName-derived max. |
| T-22-08-02 (DoS via save_state spam) | Accepted as per plan — tab add/close are 1-per-user-click; state-manager's debounced save already coalesces bursts. |

## Success Criteria

- [x] Every add/close call writes the scope-suffixed `terminal-tabs:<project>:<scope>` key to `state.session` (already via `persistTabStateScoped`; now also refreshed via `saveProjectTabs` for cache consistency)
- [x] Counter writes on every allocation (fire-and-forget `updateSession` in `allocateNextSessionName`)
- [x] Counter restored on project load (`seedCounterFromRestoredTabs` now reads `tab-counter:<project>` with T-22-08-01 tamper guard)
- [x] Combined with 22-07 first-launch flag: deletes truly survive restart (no D-02 reseed, no counter reset)

## Hand-off Note

Gap 2 / UAT test 16 (`"Tab add/delete persists across restart (tabs stay added, deletes stay deleted)"`) is now structurally closed at the code level. Manual verification deferred to Plan 22-14 (UAT re-run). The specific contract now guaranteed:

- User creates N tabs → each create fires `updateSession({ 'terminal-tabs:<project>:<scope>': ..., 'tab-counter:<project>': ... })` → save_state debounce flushes to disk.
- User quits → user relaunches → `loadAppState()` hydrates `state.session` → bootstrap calls `restoreProjectTabsScoped` then `seedCounterFromRestoredTabs` → tabs N restored, counter N seeded.
- User creates tab N+1 → `allocateNextSessionName` reads current counter N, increments to N+1, persists — no collision with deleted tabs.
- User deletes all tabs → `closeTabScoped` persists empty array → quit → relaunch → 22-07's first-launch flag gates D-02 reseed → scope stays empty.

## Self-Check: PASSED

Files verified present:
- `src/components/terminal-tabs.tsx` — FOUND
  - Line 113: `if (key) void updateSession({ [\`tab-counter:${key}\`]: String(n) });`
  - Line 132: `const persisted = getCurrentState()?.session?.[\`tab-counter:${project}\`];`
  - 3× `saveProjectTabs(activeProjectName.value ?? '', scope);` in createNewTabScoped / closeActiveTabScoped / closeTabScoped
- `src/components/terminal-tabs.test.ts` — FOUND
  - New describe block `Phase 22 gap-closure (22-08): per-mutation persistence` at EOF (lines 578–673)
  - 3 `it(...)` blocks

Commits verified present via `git log --oneline -3`:
- 8d8f750 `test(22-08): add failing tests for per-mutation tab persistence` — FOUND
- f341592 `fix(22-08): persist scope-suffixed tab list + counter on every mutation` — FOUND
