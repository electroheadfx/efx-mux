# Phase 20 Deferred Items

Out-of-scope issues discovered during plan execution. These are NOT fixed by Phase 20 plans
per the SCOPE BOUNDARY rule (only fix issues caused directly by the current plan).

## Pre-existing Test Failures (observed at 20-01 baseline)

Both observed pre-refactor and post-refactor — not introduced by Phase 20. Verified
pre-existing via `git stash && pnpm test` on HEAD=51175d4.

### `src/components/sidebar.test.tsx` — 2 failed / 8 passed

Pre-existing failure mode triggered when sidebar-dependent imports fan out into
`unified-tab-bar.tsx` → `terminal-tabs.tsx`. Root cause: `@tauri-apps/api/window`
`getCurrentWindow()` returns undefined in jsdom environment (mock gap). Module-level
`listen('pty-exited')` call rejects in environments that don't mock
`@tauri-apps/api/event`, throwing `Cannot read properties of undefined (reading
'transformCallback')`. Plan 01 added a defensive `.catch()` on the listener — the
unhandled-rejection noise is gone but the two originally-failing test cases remain
failing for their own reasons (not related to terminal-tabs refactor).

### `src/components/git-control-tab.test.tsx` — 9 failed / 1 passed

Pre-existing. Tests time out in `waitFor(...)` calls. Root cause: `git-service` mock
missing `getFileDiffStats` export + other mock gaps assuming IPC fixtures that are
not provided by the test harness. Unrelated to Phase 20.

### `src/components/file-tree.test.tsx` — worker hang / vitest timeout

- **Discovered during:** Plan 20-03 final verification step
- **Symptom:** `pnpm test` (full suite) fails with
  `[vitest-pool]: Timeout terminating forks worker for test files .../file-tree.test.tsx`
  + `Error: Worker exited unexpectedly`.
- **Scope check:** Plan 20-03 did not touch `file-tree.test.tsx` nor any file-tree
  component. The failure is not caused by this plan's edits.
- **Evidence it's pre-existing:** `pnpm test -- --run src/state-manager.test.ts`
  passes cleanly after every Plan 20-03 commit. Timeout is specific to the file-tree
  test file's own worker lifecycle.
- **Deferred to:** whichever phase next touches file-tree.test.tsx, or a dedicated
  test infra cleanup task.

Neither failure touches `unified-tab-bar.tsx`, `terminal-tabs.tsx`, or `main-panel.tsx`.
Leaving for a dedicated code-review-fix pass.

## From Plan 20-03

### `right-panel.tsx` still imports the removed `rightBottomTab` signal

- **Discovered during:** Plan 20-03 Task 1 typecheck
- **Symptom:** `pnpm exec tsc --noEmit` emits:
  `src/components/right-panel.tsx(8,23): error TS2724: '"../state-manager"' has no exported member named 'rightBottomTab'.`
- **Scope check:** Plan explicitly says "Do NOT modify right-panel.tsx here. … flag
  the remaining call sites in the SUMMARY — Plan 04 will clean them up during the
  right-panel rewrite."
- **Deferred to:** **Plan 20-04** (right-panel rewrite), which will remove the import
  and replace the entire bottom-tab UI.
- **Remaining call sites (6 uses in right-panel.tsx):**
  - line 8: `import { rightBottomTab } from '../state-manager'`
  - line 34–36: guard `!RIGHT_BOTTOM_TABS.includes(rightBottomTab.value)` fallback
  - line 143: `activeTab={rightBottomTab}`
  - line 144: `onSwitch={(tab) => { rightBottomTab.value = tab; }}`

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
