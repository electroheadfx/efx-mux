# Phase 12: TypeScript Tests - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Write unit tests for critical TypeScript modules (ansi-html, tokens, state-manager, theme-manager, server-bridge) and key Preact components. Phase 11 established the test infrastructure; this phase adds test coverage that catches regressions.

</domain>

<decisions>
## Implementation Decisions

### Test Coverage Depth (TSTEST-01 to TSTEST-05)
- **D-01:** Happy path + key edge cases per module. No exhaustive boundary testing — 60-70% coverage threshold handles the rest.
- **D-02:** ansi-html: test color256 boundaries (0, 7, 8, 15, 16, 231, 232, 255), truecolor, XSS vectors (script injection, malformed sequences), reset sequences, nested codes.
- **D-03:** tokens: test all exported constants (colors, fonts, fontSizes, spacing, radii) are defined and non-null.
- **D-04:** state-manager: test loadAppState (mock invoke success/failure), saveAppState, signal updates, project CRUD operations with mocks.
- **D-05:** theme-manager: test applyTheme (CSS vars), setThemeMode (dark/light toggle), getTheme/getTerminalTheme getters, hot-reload listener registration.
- **D-06:** server-bridge: test startServer/stopServer/restartServer invoke calls, listenServerOutput/listenServerStopped event listeners, detectAgent, openInBrowser.

### Component Testing Approach (TSTEST-06)
- **D-07:** Use @testing-library/preact for component render tests — aligns with Phase 11 context noting it as the established pattern.
- **D-08:** Test render + basic interactivity only. No snapshot testing (brittle per project conventions).
- **D-09:** Test key workspace components: sidebar.tsx, server-pane.tsx, gsd-viewer.tsx, file-tree.tsx. Core panels that users interact with most.

### Error Path Coverage
- **D-10:** Core error cases covered: Tauri invoke failures (rejected promises), missing/corrupt state data, event listener cleanup.
- **D-11:** No exhaustive error path testing — CI threshold (60-70%) covers the rest.

### Mock Strategy (from Phase 11)
- **D-12:** Phase 11 vitest.setup.ts provides global mocks for Tauri invoke/listen/emit and xterm.js Terminal. Individual tests override specific commands as needed.

### Test File Organization
- **D-13:** Colocated: `foo.test.ts` next to `foo.ts`. Already established in Phase 11.

### CI Scripts
- **D-14:** Use existing `pnpm test` and `pnpm test:coverage`. Already CI-ready from Phase 11.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test Infrastructure (Phase 11)
- `vitest.config.ts` -- Vitest config with jsdom environment (Phase 11 setup)
- `vitest.setup.ts` -- Global mocks for Tauri IPC and xterm.js (Phase 11 setup)
- `src/__test__/canary.test.ts` -- Phase 11 infrastructure validation tests
- `.planning/phases/11-test-infrastructure/11-CONTEXT.md` -- Phase 11 decisions

### Source Files Under Test
- `src/server/ansi-html.ts` -- ANSI-to-HTML conversion, color256, truecolor, XSS prevention
- `src/tokens.ts` -- Design tokens (colors, fonts, spacing, radii)
- `src/state-manager.ts` -- State persistence, signals, project registry
- `src/theme/theme-manager.ts` -- Theme lifecycle, hot-reload, dark/light toggle
- `src/server/server-bridge.ts` -- Server process management, event listeners

### Components Under Test (TSTEST-06)
- `src/components/sidebar.tsx` -- Project switcher, collapsible sidebar
- `src/components/server-pane.tsx` -- Server output viewer
- `src/components/gsd-viewer.tsx` -- Markdown GSD viewer with write-back
- `src/components/file-tree.tsx` -- File browser with keyboard navigation

### Requirements
- `.planning/REQUIREMENTS.md` -- TSTEST-01 through TSTEST-06 acceptance criteria

</canonical_refs>

 benefi
## Existing Code Insights

### Reusable Assets
- `vitest.setup.ts` (Phase 11) -- Global Tauri IPC mocks, xterm.js mock, WebCrypto polyfill, signal reset utility
- `@testing-library/preact` -- Component testing (already aligned with Phase 11 context)
- Phase 11 canary.test.ts shows exact mockIPC and module import patterns to follow

### Established Patterns
- 103 invoke/listen/emit calls across TS files -- all use same `@tauri-apps/api/core` imports, mockIPC in setup handles them
- 34 signal() calls at module scope -- signal reset utility in vitest.setup.ts prevents test pollution
- Preact + @preact/signals -- component tests use @testing-library/preact with signal-aware rendering

### Integration Points
- Test files import source modules directly: `import { ansiToHtml } from '../server/ansi-html'`
- Component tests import from `@testing-library/preact`
- Tauri IPC mocked per-test via `mockIPC(handler)` pattern from canary.test.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard unit testing approaches.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 12-typescript-tests*
*Context gathered: 2026-04-12*
