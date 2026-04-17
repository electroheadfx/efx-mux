# Deferred Items (Phase 20)

Items discovered during Phase 20 execution that are out of scope for the current plan.
These pre-existing failures exist on the baseline branch and are not caused by Phase 20 changes.

## Pre-existing Test Failures (not caused by Phase 20)

- `src/components/git-control-tab.test.tsx` — 9/10 tests failing on baseline.
  Root cause: `git-service` mock missing `getFileDiffStats` export + other mock gaps.
  Verified pre-existing via `git stash && pnpm test sidebar.test.tsx` on HEAD=51175d4.
- `src/components/sidebar.test.tsx` — 2/10 tests failing on baseline.
  Root cause: `@tauri-apps/api/window` `getCurrentWindow()` returns undefined in jsdom environment (mock gap).
  Verified pre-existing.

Neither failure touches `unified-tab-bar.tsx`, `terminal-tabs.tsx`, or `main-panel.tsx`
(the files modified by Plan 20-02). Leaving for a dedicated code-review-fix pass.
