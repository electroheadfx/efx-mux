# Deferred Items — Phase 18 File Tree Enhancements

## Plan 18-11

Pre-existing test failures observed during the full-suite run at the end of
Plan 18-11 execution. These are NOT caused by Plan 11 changes — confirmed via
`git stash && pnpm exec vitest run` against the same two test files: 11
failures present on the baseline, identical set.

- `src/components/sidebar.test.tsx` — 2 failures (renders EFXMUX header; Tab navigation / switch to Git tab on click)
- `src/components/git-control-tab.test.tsx` — 9 failures (most of the file)

Additionally, an **Unhandled Rejection** surfaces during the `sidebar.test.tsx`
run from `terminal-tabs.tsx:734` calling `listen('pty-exited', ...)` at module
scope, with `@tauri-apps/api/core.js:72` reporting
`Cannot read properties of undefined (reading 'transformCallback')`. This is
module-evaluation-time IPC in the production code firing before the jsdom
Tauri mock is installed for those test files. Plan 18-11 does not touch
`terminal-tabs.tsx`, `sidebar.tsx`, or `git-control-tab.tsx` and the issue
reproduces with Plan 11 reverted.

Recommend a dedicated plan in a later wave to either:
- Add per-file `vi.mock('@tauri-apps/api/event')` + `vi.mock('@tauri-apps/api/core')` stubs to `sidebar.test.tsx` and `git-control-tab.test.tsx`, OR
- Refactor `terminal-tabs.tsx` so the top-level `listen('pty-exited', ...)` runs inside a guarded init function instead of at module-evaluation time.

Both are in-scope for a "test infra hardening" plan, not for 18-11.
