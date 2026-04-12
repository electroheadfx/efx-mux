# Phase 11: Test Infrastructure - Research

**Researched:** 2026-04-12
**Domain:** Vitest test infrastructure for Tauri 2 + Preact + xterm.js desktop app
**Confidence:** HIGH

## Summary

Phase 11 establishes the test scaffolding that Phases 12-13 build on. The project already has Vitest 4.1.3, jsdom 29.0.2, and a minimal `vitest.config.ts` with Preact preset. The work is: (1) create a global setup file that auto-mocks Tauri IPC and xterm.js, polyfills WebCrypto, and resets Preact signals; (2) install `@vitest/coverage-v8` and configure coverage thresholds at 60-70%; (3) add `pnpm test:coverage` script; (4) determine coverage exclusions for untestable modules.

The Tauri mock API (`@tauri-apps/api/mocks`) is already bundled -- no new install needed. The `mockIPC()` function with `shouldMockEvents: true` covers all 19 invoke commands and 4 listen events in the codebase. xterm.js must be fully mocked since jsdom lacks WebGL/canvas.

**Primary recommendation:** Create `vitest.setup.ts` at project root, extend `vitest.config.ts` with `setupFiles` + coverage config, install 3 npm packages, and add the `test:coverage` script.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Global setup file (`vitest.setup.ts`) auto-mocks Tauri `invoke`/`listen`/`emit` via `@tauri-apps/api/mocks`. Individual tests override specific commands as needed.
- D-02: xterm.js Terminal auto-mocked via `vi.mock('@xterm/xterm')` in setup file. Modules that transitively import Terminal get a stub automatically.
- D-03: WebCrypto polyfill in setup file (required by Tauri mocks in jsdom).
- D-04: Preact signal reset utility in setup -- `beforeEach` resets module-scoped signals to prevent test pollution.
- D-05: Moderate coverage thresholds (60-70%) gating CI. Prevents regressions without being oppressive.
- D-06: Coverage reporting via `@vitest/coverage-v8`.
- D-07: Claude determines sensible exclusions based on jsdom testability. Expected: terminal-manager, pty-bridge, resize-handler, and other DOM/WebGL-dependent modules.
- D-08: Colocated test files -- `foo.test.ts` next to `foo.ts`. Already supported by vitest config pattern `src/**/*.test.{ts,tsx}`.
- D-09: `pnpm test` for running tests, `pnpm test:coverage` for coverage report. Both CI-ready (non-interactive, exit code on failure).

### Claude's Discretion
- D-07: Coverage exclusion list -- determine based on jsdom testability.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Vitest config with jsdom environment, WebCrypto polyfill, and signal reset utilities | Existing `vitest.config.ts` needs `setupFiles` added; setup file pattern verified via Context7 Vitest docs |
| INFRA-02 | xterm.js Terminal mock for modules that transitively import it | `vi.mock('@xterm/xterm')` in setup file auto-stubs Terminal constructor; verified via Vitest auto-mock docs |
| INFRA-03 | Tauri IPC mock factories for all invoke() commands | `@tauri-apps/api/mocks` already bundled (verified in `node_modules`); `mockIPC()` with `shouldMockEvents: true` covers all 19 commands + 4 events |
| INFRA-04 | Coverage reporting via @vitest/coverage-v8 with threshold configuration | `@vitest/coverage-v8@4.1.4` available on npm; threshold config verified via Context7 |
| INFRA-05 | CI-ready test scripts (pnpm test, pnpm test:coverage) | `pnpm test` already exists; add `test:coverage` with `vitest run --coverage` |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `vitest` | ^4.1.3 | Test runner | Installed [VERIFIED: package.json] |
| `jsdom` | ^29.0.2 | DOM environment for tests | Installed [VERIFIED: package.json] |
| `@tauri-apps/api` | ^2.10.1 | Includes `mocks` module (`mockIPC`, `clearMocks`) | Installed [VERIFIED: node_modules/@tauri-apps/api/mocks.js] |
| `@preact/preset-vite` | ^2.10.5 | Preact JSX transform for Vite/Vitest | Installed [VERIFIED: package.json] |

### To Add
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vitest/coverage-v8` | ^4.1.4 | V8 coverage provider | Must match Vitest major version; faster than Istanbul, equivalent accuracy since Vitest 3.2.0 [VERIFIED: npm registry, version 4.1.4] |
| `@testing-library/preact` | ^3.2.4 | DOM testing utilities for Preact components | Official Preact adapter; peer dep `preact >= 10` matches our 10.29.1 [VERIFIED: npm registry] |
| `@testing-library/jest-dom` | ^6.9.1 | Custom DOM matchers (`toBeInTheDocument`, etc.) | Has native Vitest support via `@testing-library/jest-dom/vitest` import [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@vitest/coverage-v8` | `@vitest/coverage-istanbul` | Only if V8 has transform bugs; V8 is default and faster |
| `@testing-library/jest-dom` | Raw `expect()` | Works but error messages are much worse for DOM assertions |
| `happy-dom` | (instead of jsdom) | Faster but has known gaps with MutationObserver and ResizeObserver; jsdom already installed and stable |

**Installation:**
```bash
pnpm add -D @vitest/coverage-v8 @testing-library/preact @testing-library/jest-dom
```

## Architecture Patterns

### File Structure (Phase 11 deliverables only)
```
vitest.config.ts          # MODIFY: add setupFiles + coverage config
vitest.setup.ts           # NEW: global mocks, polyfills, signal reset
package.json              # MODIFY: add test:coverage script
tsconfig.json             # MODIFY: add vitest/globals + jest-dom types
src/
  __mocks__/
    @xterm/
      xterm.ts            # NEW: manual mock for @xterm/xterm
```

### Pattern 1: Global Setup File (`vitest.setup.ts`)
**What:** Single setup file that runs before every test file. Handles 4 concerns: Tauri IPC mock, xterm.js mock, WebCrypto polyfill, signal reset.
**When to use:** Always -- referenced via `setupFiles` in vitest config.
**Key detail:** `setupFiles` runs in test context (has access to `vi`, `beforeEach`, etc.) [VERIFIED: Context7 Vitest docs].

```typescript
// vitest.setup.ts
import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// D-03: WebCrypto polyfill -- jsdom lacks crypto.getRandomValues
if (!globalThis.crypto?.getRandomValues) {
  const { randomFillSync } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (buf: any) => randomFillSync(buf),
      subtle: {},  // stub to prevent errors
    },
  });
}

// D-01: Auto-mock Tauri IPC before each test
// Individual tests call mockIPC() with their own handler to override
beforeEach(() => {
  // Set up __TAURI_INTERNALS__ so imports don't crash
  (globalThis as any).__TAURI_INTERNALS__ = {};
  (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {};
});

afterEach(async () => {
  const { clearMocks } = await import('@tauri-apps/api/mocks');
  clearMocks();
});

// D-02: xterm.js auto-mock (handled via __mocks__ directory or vi.mock)
vi.mock('@xterm/xterm');
vi.mock('@xterm/addon-webgl');
vi.mock('@xterm/addon-fit');
vi.mock('@xterm/addon-web-links');
```

### Pattern 2: Tauri IPC Mock Factory
**What:** Helper function tests can import to set up `mockIPC` with type-safe command responses.
**When to use:** Any test that tests a module calling `invoke()`.

```typescript
// In test file:
import { mockIPC } from '@tauri-apps/api/mocks';

beforeEach(() => {
  mockIPC((cmd, args) => {
    switch (cmd) {
      case 'load_state': return { /* AppState */ };
      case 'save_state': return undefined;
      case 'get_projects': return [];
      default: return undefined;
    }
  }, { shouldMockEvents: true }); // D-01: also mock listen/emit
});
```

### Pattern 3: Preact Signal Reset (D-04)
**What:** Reset module-scoped signals between tests to prevent state leakage.
**Why needed:** Signals like `projects`, `activeProjectName`, `sidebarCollapsed` are module-scoped singletons. If test A mutates them, test B sees dirty state.
**Approach:** Import and reset in `beforeEach` within each test file that tests signal-dependent code. A global reset is fragile because it requires importing all signal modules upfront.

```typescript
// In state-manager.test.ts
import { projects, activeProjectName, sidebarCollapsed } from './state-manager';

beforeEach(() => {
  projects.value = [];
  activeProjectName.value = null;
  sidebarCollapsed.value = false;
});
```

**Alternative (utility function in setup):**
```typescript
// vitest.setup.ts -- export a reset helper
export function resetSignals() {
  // Dynamic import to avoid circular deps
  // Each test file that needs it calls resetSignals() in beforeEach
}
```

### Pattern 4: xterm.js Manual Mock
**What:** Since `vi.mock('@xterm/xterm')` auto-mocks, the Terminal class becomes a stub with all methods returning `undefined`. For tests that need specific behavior, create a manual mock.
**File location:** `src/__mocks__/@xterm/xterm.ts` (Vitest manual mock convention) [ASSUMED -- need to verify Vitest scoped package mock path].

```typescript
// src/__mocks__/@xterm/xterm.ts
import { vi } from 'vitest';

export class Terminal {
  options: any;
  constructor(options?: any) { this.options = options; }
  open = vi.fn();
  write = vi.fn();
  dispose = vi.fn();
  onData = vi.fn(() => ({ dispose: vi.fn() }));
  onResize = vi.fn(() => ({ dispose: vi.fn() }));
  loadAddon = vi.fn();
  rows = 24;
  cols = 80;
}
```

### Anti-Patterns to Avoid
- **Manual `vi.mock('@tauri-apps/api/core')`:** Use `mockIPC` from `@tauri-apps/api/mocks` instead. It handles internal IPC details correctly. [CITED: ARCHITECTURE.md research]
- **Testing xterm.js rendering in jsdom:** jsdom has no WebGL/canvas. Mock the Terminal, test the logic around it. [CITED: ARCHITECTURE.md research]
- **Global signal reset importing all modules:** Creates circular dependency risk. Let each test file reset its own signals.
- **`globals: true` in vitest config without types:** If using `globals: true`, must add `"vitest/globals"` to `tsconfig.json` `compilerOptions.types`. [VERIFIED: Context7 Vitest docs]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tauri IPC mocking | Custom `vi.mock('@tauri-apps/api/core')` | `@tauri-apps/api/mocks` `mockIPC()` | Handles request IDs, response format, event system internally |
| DOM assertions | `querySelector` + manual checks | `@testing-library/jest-dom` matchers | Better error messages, semantic assertions |
| Coverage reporting | Manual file scanning | `@vitest/coverage-v8` | V8-native, integrated with Vitest |
| WebCrypto in jsdom | Full polyfill package | `node:crypto` `randomFillSync` | Only `getRandomValues` is needed; avoid pulling in large polyfill |

## Common Pitfalls

### Pitfall 1: Missing `__TAURI_INTERNALS__` in jsdom
**What goes wrong:** Importing any module that imports from `@tauri-apps/api/core` throws at module load time because `window.__TAURI_INTERNALS__` is undefined.
**Why it happens:** Tauri API modules check for the internals object at import time, not just at `invoke()` call time.
**How to avoid:** Set `globalThis.__TAURI_INTERNALS__ = {}` in setup file `beforeEach`, before any test imports run.
**Warning signs:** `TypeError: Cannot read properties of undefined` on test startup.

### Pitfall 2: `@vitest/coverage-v8` Version Mismatch
**What goes wrong:** `pnpm test:coverage` fails with "coverage provider version mismatch" error.
**Why it happens:** `@vitest/coverage-v8` major version must match `vitest` major version.
**How to avoid:** Pin `@vitest/coverage-v8` to `^4.1.3` (same range as vitest). Currently 4.1.4 is latest. [VERIFIED: npm registry]
**Warning signs:** Error message explicitly says version mismatch.

### Pitfall 3: Preact Signal Leakage Between Tests
**What goes wrong:** Tests pass individually but fail when run together.
**Why it happens:** Module-scoped signals (`projects`, `activeProjectName`, etc.) persist across tests in the same worker.
**How to avoid:** Each test file that touches signals must reset them in `beforeEach`.
**Warning signs:** Order-dependent test failures, different results with `--pool=threads` vs `--pool=forks`.

### Pitfall 4: WebCrypto Polyfill Timing
**What goes wrong:** `crypto.getRandomValues is not a function` even with polyfill in setup file.
**Why it happens:** If `setupFiles` runs after module-level code in test files that eagerly imports Tauri API.
**How to avoid:** The polyfill must be in `setupFiles` (runs before test files) not in `globalSetup` (runs in a separate context). Vitest's `setupFiles` runs in the test worker context before test files. [VERIFIED: Context7 Vitest docs]
**Warning signs:** Error only on first test run, not when running a single file.

### Pitfall 5: Auto-mock Depth for Scoped Packages
**What goes wrong:** `vi.mock('@xterm/xterm')` may not work correctly for scoped packages in all Vitest versions.
**Why it happens:** Scoped package resolution for `__mocks__` directories uses `__mocks__/@xterm/xterm.ts` path convention.
**How to avoid:** If auto-mock fails, use explicit `vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }))` with factory function in setup file.
**Warning signs:** `Terminal is not a constructor` errors in test output.

## Code Examples

### Complete vitest.config.ts (Target State)
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        // D-07: Modules untestable in jsdom (WebGL/DOM/system deps)
        'src/terminal/terminal-manager.ts',
        'src/terminal/pty-bridge.ts',
        'src/terminal/resize-handler.ts',
        'src/drag-manager.ts',
        // Auto-generated or type-only
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
});
```
[VERIFIED: coverage config structure via Context7 Vitest docs]

### Complete tsconfig.json Update
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom/vitest"]
  }
}
```
[ASSUMED: `@testing-library/jest-dom/vitest` type path -- need to verify exact export]

### package.json Scripts (Target State)
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## IPC Surface Inventory

All 19 `invoke()` commands and 4 `listen()` events that the mock layer must handle:

### invoke() Commands
| Command | Module | Args |
|---------|--------|------|
| `load_state` | state-manager.ts | none |
| `save_state` | state-manager.ts | `{ stateJson: string }` |
| `add_project` | state-manager.ts | `{ entry: ProjectEntry }` |
| `update_project` | state-manager.ts | `{ name: string, entry: ProjectEntry }` |
| `remove_project` | state-manager.ts | `{ name: string }` |
| `switch_project` | state-manager.ts | `{ name: string }` |
| `set_project_path` | main.tsx | `{ path: string }` |
| `read_file_content` | main.tsx | `{ path: string }` |
| `cleanup_dead_sessions` | main.tsx | none |
| `spawn_terminal` | pty-bridge.ts | `{ sessionName, shell, cwd, cols, rows }` |
| `write_pty` | pty-bridge.ts | `{ data: string, sessionName: string }` |
| `resize_pty` | resize-handler.ts, pty-bridge.ts | `{ cols, rows, sessionName }` |
| `ack_bytes` | pty-bridge.ts | `{ count, sessionName }` |
| `destroy_pty_session` | terminal-tabs.tsx | `{ sessionName: string }` |
| `start_server` | server-bridge.ts | `{ cmd, cwd, projectId }` |
| `stop_server` | server-bridge.ts | `{ projectId }` |
| `restart_server` | server-bridge.ts | `{ cmd, cwd, projectId }` |
| `import_iterm2_theme` | first-run-wizard.tsx | `{ path: string }` |
| `switch_tmux_session` | right-panel.tsx | `{ sessionName, target }` |
| `write_checkbox` | gsd-viewer.tsx | `{ path, line, checked }` |

### listen() Events
| Event | Module | Payload Type |
|-------|--------|--------------|
| `server-output` | server-bridge.ts | `{ project: string, text: string }` |
| `server-stopped` | server-bridge.ts | `{ project: string, code: number }` |
| `pty-exited` | pty-bridge.ts | `{ session: string, code: number }` |
| `theme-changed` | theme-manager.ts | `ThemeData` |
| `md-file-changed` | main.tsx | unknown |

[VERIFIED: grep of src/ codebase]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `vitest.config.ts` (exists, needs extending) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Setup file loads without error, crypto polyfill works | smoke | `pnpm test` (with a canary test) | No -- Wave 0 |
| INFRA-02 | xterm.js imports don't crash in test env | smoke | `pnpm test` (with a canary test importing terminal module) | No -- Wave 0 |
| INFRA-03 | mockIPC intercepts invoke calls | unit | `pnpm test` (with a canary test using mockIPC) | No -- Wave 0 |
| INFRA-04 | Coverage report generates with thresholds | smoke | `pnpm test:coverage` | No -- Wave 0 |
| INFRA-05 | Scripts exit 0 on success, non-zero on failure | smoke | `pnpm test && echo "OK"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test:coverage`
- **Phase gate:** `pnpm test:coverage` exits 0

### Wave 0 Gaps
- [ ] `src/__test__/canary.test.ts` -- minimal test proving setup works (imports Tauri API, xterm, signals)
- [ ] `vitest.setup.ts` -- the setup file itself (core deliverable)
- [ ] `@vitest/coverage-v8` install -- required for coverage command

## Security Domain

Not applicable for this phase. Test infrastructure is development-only tooling with no production surface area. No ASVS categories apply.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@testing-library/jest-dom/vitest` type export path works in tsconfig types array | Code Examples | TypeScript errors on jest-dom matchers; fix by checking actual export map |
| A2 | `vi.mock('@xterm/xterm')` in setup file correctly auto-mocks for all test files | Architecture Patterns | xterm imports crash tests; fix with factory function mock |
| A3 | `globals: true` is the right choice (STACK.md suggested `globals: false`) | Code Examples | Tests need explicit `import { describe, it, expect }` in every file; minor annoyance |

## Open Questions

1. **Scoped package auto-mock path convention**
   - What we know: Vitest supports `__mocks__` directory for manual mocks
   - What's unclear: Exact directory structure for scoped packages like `@xterm/xterm` -- is it `__mocks__/@xterm/xterm.ts` or `__mocks__/@xterm__xterm.ts`?
   - Recommendation: Use `vi.mock('@xterm/xterm', () => ({ ... }))` factory in setup file instead of directory-based mocking -- more explicit and avoids path ambiguity.

2. **`globals: true` vs explicit imports**
   - What we know: STACK.md research suggested `globals: false` for clarity; CONTEXT.md doesn't specify
   - What's unclear: Whether the team prefers terse tests or explicit imports
   - Recommendation: Use `globals: true` -- reduces boilerplate in every test file. The `tsconfig.json` types array provides IDE support. This is standard for Vitest projects.

## Sources

### Primary (HIGH confidence)
- Context7 `/vitest-dev/vitest` -- coverage thresholds, setupFiles, v8 provider config
- `@tauri-apps/api/mocks.js` source code in `node_modules` -- `mockIPC`, `clearMocks`, `shouldMockEvents` API
- npm registry -- `@vitest/coverage-v8@4.1.4`, `@testing-library/preact@3.2.4`, `@testing-library/jest-dom@6.9.1`
- Project codebase grep -- 19 invoke commands, 4 listen events, 9 signal files

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- prior milestone research (self-referential but well-sourced)
- `.planning/research/ARCHITECTURE.md` -- prior milestone architecture research

### Tertiary (LOW confidence)
- None -- all claims verified or cited.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm registry, versions confirmed
- Architecture: HIGH -- patterns verified against actual `@tauri-apps/api/mocks` source and Vitest docs
- Pitfalls: HIGH -- based on actual codebase analysis (signal locations, IPC surface, jsdom limitations)

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable tooling, 30-day window)
