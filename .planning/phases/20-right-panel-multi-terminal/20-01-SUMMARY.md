---
phase: 20-right-panel-multi-terminal
plan: 01
subsystem: ui
tags: [preact, tauri, refactor, terminal, signals, scope-registry]

# Dependency graph
requires:
  - phase: 17-main-panel-file-tabs
    provides: Terminal tab infrastructure (module-global signals, lifecycle, persistence, crash overlay)
provides:
  - Scope-parametrized terminal-tabs module (main | right)
  - getTerminalScope(scope) accessor for right-panel call sites
  - Independent per-scope signals, counters, persistence keys, container selectors
  - Crash-restart session-name collision fix (rr<N> suffix universally)
  - Scope-agnostic pty-exited listener (single instance, iterates all scopes)
  - Test harness mocks for xterm attachCustomKeyEventHandler + FitAddon/WebglAddon classes + ResizeObserver polyfill
affects: [phase-20-plan-02 unified-tab-bar scope prop, phase-20-plan-03 right-panel rewrite, phase-20-plan-04 bootstrap dual-scope restore]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Scope registry (Map<TerminalScope, ScopeState>) with eager initialization and thin-wrapper backward-compat exports
    - Class-based vitest mocks for xterm addons (replaces vi.fn().mockImplementation(() => ({...})) which did not work as constructor in vitest 4.x)

key-files:
  created:
    - src/components/terminal-tabs.test.ts
    - .planning/phases/20-right-panel-multi-terminal/deferred-items.md
  modified:
    - src/components/terminal-tabs.tsx
    - vitest.setup.ts

key-decisions:
  - "Scope registry is a module-level Map<TerminalScope, ScopeState> with eager initialization for both 'main' and 'right' at load time — simpler than lazy/ensureProjectInMaps since the set of scopes is closed (exactly two)"
  - "Crash-restart suffix changed from r<N> to rr<N> universally (both main and right scopes), not conditional by scope — simpler, collision-proof, and the double-r is unambiguous in tmux ls output"
  - "pty-exited listener remains a single module-level instance (HMR-resilient pattern from Phase 17) but iterates all scopes via for..of; session-name uniqueness across scopes is guaranteed by construction (D-14)"
  - "Defensive .catch on listen() so sibling test files that transitively import terminal-tabs without mocking @tauri-apps/api/event no longer surface unhandled rejections"
  - "Test-only utility __resetScopeCountersForTesting is exported at module level (not guarded by process.env.NODE_ENV) because gating complicates the build and the cost of a 3-line no-op in production is zero"

patterns-established:
  - "Scope registry pattern: closed enum-like type keyed to a Map, with eager initialization and getScope(scope) accessor throwing on unknown keys — extendable to 'right-bottom' or other future scopes with a single array entry"
  - "Backward-compat export wrapper: top-level export X resolves internally to XScoped(scope, ...args) with scope='main' default — keeps call sites byte-identical while the internal surface becomes scope-aware"
  - "Scope-aware persistence key derivation: each ScopeState carries a persistenceKey(projectName) closure; main also writes the flat legacy 'terminal-tabs' key, right writes only the per-project form (D-15)"

requirements-completed: [SIDE-02]

# Metrics
duration: ~16 min
completed: 2026-04-17
---

# Phase 20 Plan 01: Scope-Parametrized Terminal Tabs Summary

**terminal-tabs.tsx refactored into a Map<TerminalScope, ScopeState> registry with full D-11 backward compatibility and a new getTerminalScope('right') accessor for right-panel callers — zero call-site changes required.**

## Performance

- **Duration:** ~16 min (22:17 → 22:33 UTC)
- **Started:** 2026-04-17T22:17:30Z
- **Completed:** 2026-04-17T22:33:30Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 (terminal-tabs.tsx, terminal-tabs.test.ts NEW, vitest.setup.ts, deferred-items.md NEW)

## Accomplishments

- Introduced `TerminalScope = 'main' | 'right'` type and a module-level `Map<TerminalScope, ScopeState>` registry eagerly populated for both scopes at load time.
- Renamed all lifecycle functions to `*Scoped(scope, ...)` internal forms; every prior top-level export (`terminalTabs`, `activeTabId`, `createNewTab`, `closeTab`, `closeActiveTab`, `cycleToNextTab`, `switchToTab`, `renameTerminalTab`, `getDefaultTerminalLabel`, `getActiveTerminal`, `initFirstTab`, `restoreTabs`, `clearAllTabs`, `saveProjectTabs`, `restoreProjectTabs`, `hasProjectTabs`, `ActiveTabCrashOverlay`, `restartTabSession`) is preserved and resolves to scope `'main'`.
- Added `ownerScope` field to every created `TerminalTab` and `scope?: TerminalScope` option to `CreateTabOptions`.
- Scope-aware session naming (D-14):
  - main: bare `<project>` (first tab), `<project>-<N>` (Nth, N>=2)
  - right: `<project>-r<N>` (every tab, N>=1)
- Scope-aware container selector: `.terminal-containers` (main) vs `.terminal-containers[data-scope="right"]` (right).
- Scope-aware persistence keys (D-15):
  - main: flat `terminal-tabs` + per-project `terminal-tabs:<project>` (backward compat)
  - right: per-project `right-terminal-tabs:<project>` only (no flat key)
- **Pitfall 1 fix**: `restartTabSession` now uses `rr<N>` suffix universally, avoiding collision with right-scope `-r<N>` naming.
- pty-exited listener is now scope-agnostic: iterates `scopes` map and updates the owning tab regardless of which scope it belongs to. Single listener instance, HMR-resilient.
- Exposed new `getTerminalScope(scope)` accessor returning an independent tabs signal, active-tab signal, and full lifecycle closure bound to the chosen scope — this is the primary API that Plan 04 (`right-panel.tsx` rewrite) will consume.
- Added 16 new unit tests covering D-10 scope isolation, D-11 backward-compat reference equality, D-14 session naming, D-15/D-16 persistence-key routing + restore round-trip, and Pitfall 1 crash-restart collision.

## Task Commits

Each task was committed atomically following the TDD RED/GREEN gate sequence:

1. **Task 1 RED: failing tests for scope registry** — `c30e660` (`test(20-01):` — 14 it() blocks, all failing with "getTerminalScope is not a function")
2. **Task 1 GREEN: scope-parametrize terminal-tabs** — `299b94a` (`feat(20-01):` — refactor + test-harness Rule-3 fixes in vitest.setup.ts)
3. **Task 2: expand tests with persistence round-trip** — `56fb607` (`test(20-01):` — adds 2 more it() blocks for D-15 restore + hasProjectTabs read)

No separate REFACTOR commit — the GREEN implementation was already structured cleanly; no cleanup pass needed.

## Files Created/Modified

- `src/components/terminal-tabs.tsx` (MODIFIED, 877 lines, +455/-321) — Scope registry, scoped lifecycle, D-11 backward-compat exports, new `getTerminalScope` accessor, Pitfall 1 fix, scope-agnostic pty-exited listener.
- `src/components/terminal-tabs.test.ts` (CREATED, 290 lines) — 16 tests across D-10/D-11/D-14/D-15/D-16/Pitfall-1 behavioural groups.
- `vitest.setup.ts` (MODIFIED) — Added `attachCustomKeyEventHandler` to MockTerminal; converted FitAddon/WebglAddon/WebLinksAddon from `vi.fn().mockImplementation(...)` to class-based mocks (vitest 4.x constructor compatibility); added `ResizeObserver` polyfill for jsdom.
- `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` (CREATED) — Documents pre-existing test failures (sidebar.test.tsx, git-control-tab.test.tsx, file-tree.test.tsx worker hang) as out-of-scope per SCOPE BOUNDARY rule.

## Decisions Made

All documented in frontmatter `key-decisions`. Highlights:
- Eager Map initialization with two static entries (main, right) vs lazy `ensureProjectInMaps`.
- Universal `rr<N>` restart suffix (not conditional) — simplest path to prevent collision.
- Single module-level pty-exited listener iterates scopes (preserves Phase 17's HMR-resilient pattern).
- Defensive `.catch` on module-level `listen()` to stop the unhandled-rejection chatter coming from sibling test files that import terminal-tabs transitively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] xterm mock missing `attachCustomKeyEventHandler`**
- **Found during:** Task 1 GREEN verification (first attempt to run `terminal-tabs.test.ts` after refactor)
- **Issue:** `vitest.setup.ts` MockTerminal class lacked `attachCustomKeyEventHandler`, which `createTerminal` in `src/terminal/terminal-manager.ts:47` calls synchronously. 10 of 14 tests failed with `TypeError: terminal.attachCustomKeyEventHandler is not a function`.
- **Fix:** Added `attachCustomKeyEventHandler = vi.fn();` to the MockTerminal class. Purely additive — no behavioural impact on any other test.
- **Files modified:** `vitest.setup.ts`
- **Verification:** Tests proceed past the terminal creation step.
- **Committed in:** `299b94a` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Vitest 4.x FitAddon/WebglAddon/WebLinksAddon mocks not constructable**
- **Found during:** Task 1 GREEN verification (second test run after fix #1)
- **Issue:** The existing mock shape `vi.fn().mockImplementation(() => ({...}))` returned a function that, when called with `new`, yielded the implementation function itself rather than the object literal. In vitest 4.1.4 this pattern is broken — `new FitAddon()` produced a function, not an object with a `fit()` method, so `createTerminal` failed with `TypeError: () => ({...}) is not a constructor`.
- **Fix:** Converted all three addon mocks to class-based (same pattern already used successfully for MockTerminal in the same file).
- **Files modified:** `vitest.setup.ts`
- **Verification:** FitAddon constructor now works; tests advance to the next failure.
- **Committed in:** `299b94a`

**3. [Rule 3 - Blocking] jsdom lacks ResizeObserver**
- **Found during:** Task 1 GREEN verification (third test run after fixes #1 and #2)
- **Issue:** `src/terminal/resize-handler.ts:24` constructs a `new ResizeObserver(...)` during `createNewTabScoped`. jsdom 29.0.2 does not polyfill it, causing `ReferenceError: ResizeObserver is not defined` on 4 remaining tests.
- **Fix:** Added a no-op ResizeObserver polyfill at the top of `vitest.setup.ts` (guarded by `if (!globalThis.ResizeObserver)`). Stub `observe`/`unobserve`/`disconnect` as empty methods — tests do not assert on observer callbacks.
- **Files modified:** `vitest.setup.ts`
- **Verification:** All 14 initial tests now pass.
- **Committed in:** `299b94a`

**4. [Rule 2 - Missing Critical] Defensive `.catch` on module-level `listen()`**
- **Found during:** Task 1 GREEN full-suite regression check
- **Issue:** Sibling test files (e.g., `sidebar.test.tsx`, `git-control-tab.test.tsx`) transitively import `terminal-tabs.tsx` via `unified-tab-bar.tsx`. These tests don't mock `@tauri-apps/api/event`, so the module-level `listen('pty-exited', ...)` call returns a Promise that rejects with `Cannot read properties of undefined (reading 'transformCallback')`. The unhandled rejection polluted the vitest output and risked false-positive test results (vitest 4.x surfaces them loudly).
- **Fix:** Added `.catch((err) => console.warn('[efxmux] pty-exited listener setup failed:', err))` to the module-level `listen()` call. The listener still works correctly in production where the Tauri event plugin is present.
- **Files modified:** `src/components/terminal-tabs.tsx`
- **Verification:** Full `npx vitest run` — no more unhandled rejections from terminal-tabs across any test file.
- **Committed in:** `299b94a`

---

**Total deviations:** 4 auto-fixed (3 Rule 3 blocking, 1 Rule 2 missing critical)
**Impact on plan:** Three were test-harness gaps exposed by being the first tests in the repo to exercise `createTerminal` end-to-end; one was a robustness fix for sibling-test noise. All are additive and have zero impact on production behaviour. No scope creep beyond the test-harness improvements, which are shared infrastructure.

## Issues Encountered

- **Pre-existing test failures in `sidebar.test.tsx` (2/10 failed), `git-control-tab.test.tsx` (9/10 failed), and occasional `file-tree.test.tsx` worker-hang.** Confirmed present both before and after the refactor via `git stash` sanity check. Documented in `.planning/phases/20-right-panel-multi-terminal/deferred-items.md`. Not addressed per the SCOPE BOUNDARY rule (these failures are unrelated to terminal-tabs or Phase 20).
- **`pnpm test -- --run <file>` runs the full suite instead of a single file** — vitest 4.1.4 quirk in pnpm argument forwarding. Used `npx vitest run <file>` directly for targeted runs. Does not affect CI.

## Crash-Restart Suffix Change (Pitfall 1)

| Before | After |
|--------|-------|
| Main restart: `<project>-r1`, `<project>-r2`, ... (bare `r<N>`) | Main restart: `<project>-rr1`, `<project>-rr2`, ... (`rr<N>`) |
| Right scope: N/A (did not exist) | Right tabs: `<project>-r1`, `<project>-r2`, ... (bare `r<N>`) |
| Right restart: N/A | Right restart: `<project>-rr1`, `<project>-rr2`, ... (`rr<N>`) |

The double-`r` prefix is unambiguous: any `-r\d+$` is right-scope, any `-rr\d+$` is a restart, main first tab has no suffix, main Nth tab has bare numeric.

## Test Coverage

| Category | Decision | it() count |
|----------|----------|-----------|
| D-11 backward-compat exports | `terminalTabs` / `activeTabId` reference equality with `getTerminalScope('main')` | 2 |
| D-10 scope isolation | Right mutation does not affect main; counters independent | 2 |
| D-14 session naming | Main bare/-N, right -r1/-r2, ownerScope assignment | 5 |
| Pitfall 1 crash-restart | `rr<N>` suffix on both main and right restart paths | 2 |
| D-15/D-16 persistence | Main writes dual keys, right writes only project key, restore round-trip, hasProjectTabs scope isolation, pty-exited scope-agnostic lookup | 5 |
| **Total** | | **16** |

File: 290 lines, 16 it() blocks, all green. `npx vitest run src/components/terminal-tabs.test.ts` — 16 passed.

## Deviations from 20-PATTERNS.md Guidance

None of substance. The plan and 20-PATTERNS.md suggested `ownerScope` as either an explicit field on `TerminalTab` or a registry lookup — I chose the explicit field (PATTERNS notes both options). The rest follows PATTERNS.md exactly: Map<TerminalScope, ScopeState>, eager init, scoped lifecycle + main-wrapper exports, scope-agnostic listener with `for (const [, state] of scopes)`.

## Next Phase Readiness

Ready for Plan 02 (`unified-tab-bar.tsx` scope prop + sticky tab support). The new `getTerminalScope('right')` accessor is available and provides everything the right-panel bar needs: an independent `tabs` signal, `activeTabId` signal, `createNewTab({ isAgent })`, `closeTab`, `switchToTab`, `renameTerminalTab`, `ActiveTabCrashOverlay`, `saveProjectTabs`, `restoreProjectTabs`, `hasProjectTabs`, `clearAllTabs`.

No blockers. Main-panel code paths (Phase 17) are unchanged at every call site — verified via grep (33 call-sites, identical count pre/post).

## Self-Check: PASSED

- terminal-tabs.tsx: FOUND (877 lines, contains TerminalScope, getTerminalScope, scopes Map, ownerScope, rr restart suffix, right-terminal-tabs persistence key, scope-agnostic pty-exited listener)
- terminal-tabs.test.ts: FOUND (290 lines, 16 it() blocks, all passing)
- vitest.setup.ts: FOUND (MockTerminal with attachCustomKeyEventHandler, class-based addon mocks, ResizeObserver polyfill)
- deferred-items.md: FOUND (pre-existing test failures documented)
- Commit c30e660 (RED): FOUND in git log
- Commit 299b94a (GREEN): FOUND in git log
- Commit 56fb607 (Task 2): FOUND in git log
- TDD gate sequence: test(…) → feat(…) → test(…) — RED before GREEN verified
- `npx tsc --noEmit`: clean
- `npx vitest run src/components/terminal-tabs.test.ts`: 16/16 passing
- Full `npx vitest run`: 262/273 relevant tests passing; 11 failing tests are pre-existing and documented

---
*Phase: 20-right-panel-multi-terminal*
*Plan: 01*
*Completed: 2026-04-17*
