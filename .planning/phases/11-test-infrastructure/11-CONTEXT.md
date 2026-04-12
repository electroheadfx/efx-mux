# Phase 11: Test Infrastructure - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up Vitest test infrastructure so `pnpm test` and `pnpm test:coverage` work with all necessary mocks (Tauri IPC, xterm.js, WebCrypto). No test cases in this phase -- only the scaffolding that Phases 12-13 build on.

</domain>

<decisions>
## Implementation Decisions

### Mock Strategy
- **D-01:** Global setup file (`vitest.setup.ts`) auto-mocks Tauri `invoke`/`listen`/`emit` via `@tauri-apps/api/mocks`. Individual tests override specific commands as needed.
- **D-02:** xterm.js Terminal auto-mocked via `vi.mock('@xterm/xterm')` in setup file. Modules that transitively import Terminal get a stub automatically.
- **D-03:** WebCrypto polyfill in setup file (required by Tauri mocks in jsdom).
- **D-04:** Preact signal reset utility in setup -- `beforeEach` resets module-scoped signals to prevent test pollution.

### Coverage Policy
- **D-05:** Moderate coverage thresholds (60-70%) gating CI. Prevents regressions without being oppressive.
- **D-06:** Coverage reporting via `@vitest/coverage-v8`.

### Coverage Exclusions (Claude's Discretion)
- **D-07:** Claude determines sensible exclusions based on jsdom testability. Expected: terminal-manager, pty-bridge, resize-handler, and other DOM/WebGL-dependent modules.

### Test File Organization
- **D-08:** Colocated test files -- `foo.test.ts` next to `foo.ts`. Already supported by vitest config pattern `src/**/*.test.{ts,tsx}`.

### CI Scripts
- **D-09:** `pnpm test` for running tests, `pnpm test:coverage` for coverage report. Both CI-ready (non-interactive, exit code on failure).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Config
- `vitest.config.ts` -- Current Vitest config with jsdom + preact preset (needs extending, not replacing)
- `package.json` -- Vitest 4.1.3 already installed, `test` script exists
- `tsconfig.json` -- TypeScript config for test compatibility

### Research
- `.planning/research/STACK.md` -- Test stack recommendations (3 npm packages, Rust dev-deps)
- `.planning/research/ARCHITECTURE.md` -- Test architecture patterns, mock strategies, file placement
- `.planning/research/PITFALLS.md` -- Signal leaks, WebCrypto polyfill, xterm.js jsdom incompatibility

### Tauri Mocking
- Tauri v2 test mocking docs: `@tauri-apps/api/mocks` provides `mockIPC()`, `mockWindows()`, `clearMocks()`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vitest.config.ts` -- Already configured with jsdom environment and preact preset. Extend, don't replace.
- `package.json` -- Already has `vitest: ^4.1.3` and `test: vitest run` script. Add coverage deps.

### Established Patterns
- 103 `invoke`/`listen`/`emit` calls across 18 TS files -- mock layer must cover all of these
- 34 `signal()` calls across 9 files -- many at module scope, need reset between tests
- Preact + @preact/signals for reactivity -- use `@testing-library/preact` for component tests (Phase 12)

### Integration Points
- `vitest.setup.ts` -- New file, referenced by `vitest.config.ts` `setupFiles`
- `@tauri-apps/api/mocks` -- Already bundled with installed `@tauri-apps/api` package
- `@vitest/coverage-v8` -- New devDependency, version must match Vitest 4.x

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches for test infrastructure setup.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 11-test-infrastructure*
*Context gathered: 2026-04-12*
