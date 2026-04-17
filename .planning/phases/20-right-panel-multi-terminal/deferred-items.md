# Phase 20 Deferred Items

Out-of-scope issues discovered during plan execution. These are NOT fixed by Plan 01
per the SCOPE BOUNDARY rule (only fix issues caused directly by the current plan).

## Pre-existing Test Failures (observed at 20-01 baseline)

Both observed pre-refactor and post-refactor — not introduced by Plan 01.

### `src/components/sidebar.test.tsx` — 2 failed / 8 passed

Pre-existing failure mode triggered when sidebar-dependent imports fan out into
`unified-tab-bar.tsx` → `terminal-tabs.tsx`. The module-level `listen('pty-exited')`
call rejects in environments that don't mock `@tauri-apps/api/event`, throwing
`Cannot read properties of undefined (reading 'transformCallback')`. Plan 01 added
a defensive `.catch()` on the listener — the unhandled-rejection noise is gone
but the two originally-failing test cases remain failing for their own reasons
(not related to terminal-tabs refactor).

### `src/components/git-control-tab.test.tsx` — 9 failed / 1 passed

Pre-existing. Tests time out in `waitFor(...)` calls assuming IPC fixtures that
are not provided by the test harness. Unrelated to Phase 20.

### `src/components/file-tree.test.tsx` — worker hang

Worker occasionally fails to terminate within the pool timeout. Observed
intermittently; affects test runner shutdown, not individual assertions.
Unrelated to Phase 20.

## Phase 17 Code-Review Debt

Carried over from STATE.md:

- **WR-01** `dropdown-menu.tsx:87-94` — typeaheadTimeout not cleared when items change
- **WR-02** `terminal-tabs.tsx:212,246` — Silent error swallowing in PTY cleanup
  (now lives at `terminal-tabs.tsx:291,317` post-refactor, same behaviour)
- **WR-03** `main.tsx` + `terminal-tabs.tsx` — Duplicate `projectSessionName` function
- **IN-01** `package.json:3` — package name "gsd-mux" should be "efxmux"
  (spot-check: package.json already shows "efxmux" — WR may be stale)
- **IN-02** `editor-tab.tsx:75-76` — eslint-disable masks potential stale-closure

Track these for a dedicated code-review fix plan.
