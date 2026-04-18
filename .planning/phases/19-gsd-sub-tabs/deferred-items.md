# Phase 19 Deferred Items

Issues discovered during execution that are out of scope for this phase.
Per executor SCOPE BOUNDARY: pre-existing failures in unrelated files are logged here and left untouched.

## Pre-existing test failures (Plan 19-01 Task 1)

**Discovered:** 2026-04-17 during `pnpm test -- --run` after installing parser deps.

11 tests fail in `src/components/git-control-tab.test.tsx` — all pre-existing on main branch before the parser dep install. Verified by stashing changes and re-running: same failures appear.

Failing tests:
- should render STAGED section with file count
- should render CHANGES section with file count
- should call stageFile when checkbox is checked
- should call unstageFile when checkbox is unchecked
- should enable Commit button when staged > 0 and message non-empty
- (+6 more)

Root cause (quick scan): tests expect text like `/STAGED.*\(1\)/` but the rendered component shows `"No Changes"` — likely a stale fixture or a component contract change that wasn't reflected in tests.

**Disposition:** Out of scope for Phase 19. Report to user; fix in a separate `/gsd-debug` workflow or via `/gsd-code-review-fix 17` since these may relate to the Phase 17 code-review fixes already pending.
