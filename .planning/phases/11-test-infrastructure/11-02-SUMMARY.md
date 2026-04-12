---
phase: 11-test-infrastructure
plan: 02
subsystem: testing
tags: [vitest, canary-test, jsdom, xterm-mock, tauri-mock, webcrypto, jest-dom, coverage-v8]

# Dependency graph
requires:
  - phase: 11-test-infrastructure/01
    provides: "Vitest config, setup file with global mocks, test scripts"
provides:
  - "Canary test validating all 5 INFRA requirements end-to-end"
  - "Proof that pnpm test and pnpm test:coverage both exit 0"
affects: [12-typescript-tests, 13-rust-tests]

# Tech tracking
tech-stack:
  added: ["@xterm/addon-web-links"]
  patterns: ["class-based Terminal mock for constructor compatibility in Vitest 4.x"]

key-files:
  created: ["src/__test__/canary.test.ts"]
  modified: ["vitest.setup.ts", "package.json", "pnpm-lock.yaml", ".gitignore"]

key-decisions:
  - "Class-based Terminal mock instead of vi.fn().mockImplementation() for new-ability in Vitest 4.x"
  - "Added @xterm/addon-web-links as devDependency for Vite import resolution (vi.mock needs package on disk)"
  - "Added coverage/ to .gitignore to prevent committing generated reports"

patterns-established:
  - "Pattern: Use class-based mocks for modules instantiated with new (vi.fn not new-able via dynamic import in Vitest 4.x)"
  - "Pattern: Import path from src/__test__/ to src/ is ../module (one level up)"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 11 Plan 02: Canary Test Summary

**Canary test with 8 assertions across 5 INFRA requirements proving jsdom, WebCrypto, xterm mocks, Tauri IPC mocks, jest-dom matchers, and v8 coverage all work end-to-end**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T08:15:52Z
- **Completed:** 2026-04-12T08:19:18Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Created canary test file with 8 tests across 5 describe blocks (INFRA-01 through INFRA-05)
- Validated: jsdom globals, WebCrypto polyfill, xterm.js Terminal/addon mocks, Tauri IPC mockIPC, jest-dom matchers, coverage instrumentation on src/tokens.ts
- Both `pnpm test` (exit 0, 8/8 pass) and `pnpm test:coverage` (exit 0, coverage report generated) confirmed working

## Task Commits

Each task was committed atomically:

1. **Task 1: Create canary test validating all infrastructure mocks** - `6902465` (feat)

## Files Created/Modified
- `src/__test__/canary.test.ts` - Canary smoke test with 8 tests across 5 INFRA requirement blocks
- `vitest.setup.ts` - Fixed Terminal mock to use class-based constructor (Vitest 4.x compatibility)
- `package.json` - Added @xterm/addon-web-links devDependency
- `pnpm-lock.yaml` - Lock file updated for new dependency
- `.gitignore` - Added coverage/ directory

## Decisions Made
- Switched Terminal mock from `vi.fn().mockImplementation()` to a class-based `MockTerminal` because `vi.fn()` is not new-able when accessed via dynamic import in Vitest 4.x
- Installed `@xterm/addon-web-links` as devDependency because Vite resolves module paths before vi.mock intercepts, requiring the package to exist on disk
- Fixed import path for tokens.ts: `../tokens` (one level up) not `../../tokens` (two levels up as plan incorrectly specified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Terminal mock to be constructor-compatible**
- **Found during:** Task 1 (canary test run)
- **Issue:** `vi.fn().mockImplementation()` in vitest.setup.ts is not usable with `new` when accessed via dynamic import in Vitest 4.x -- `TypeError: is not a constructor`
- **Fix:** Replaced with class-based `MockTerminal` that supports `new MockTerminal(opts)`
- **Files modified:** vitest.setup.ts
- **Verification:** `new Terminal()` works in canary test, all 8 tests pass
- **Committed in:** 6902465

**2. [Rule 3 - Blocking] Installed missing @xterm/addon-web-links**
- **Found during:** Task 1 (canary test run)
- **Issue:** Package not in node_modules; Vite fails to resolve import before vi.mock can intercept
- **Fix:** `pnpm add -D @xterm/addon-web-links`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** Dynamic import resolves, addon mock test passes
- **Committed in:** 6902465

**3. [Rule 2 - Missing Critical] Added coverage/ to .gitignore**
- **Found during:** Task 1 (post-coverage-run)
- **Issue:** `pnpm test:coverage` generates coverage/ directory that would be committed
- **Fix:** Added `coverage/` to .gitignore
- **Files modified:** .gitignore
- **Committed in:** 6902465

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All fixes necessary for test infrastructure to work. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Test infrastructure fully validated -- all mocks, polyfills, and coverage reporting confirmed working
- Phase 12 (TypeScript tests) can immediately write .test.ts files using the configured setup
- Developers can run `pnpm test` and `pnpm test:coverage` with confidence

## Self-Check: PASSED

- [x] src/__test__/canary.test.ts exists
- [x] 11-02-SUMMARY.md exists
- [x] Commit 6902465 exists

---
*Phase: 11-test-infrastructure*
*Completed: 2026-04-12*
