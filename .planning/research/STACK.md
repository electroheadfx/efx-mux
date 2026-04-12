# Stack Research: Testing & Consolidation

**Domain:** Unit testing infrastructure for Tauri 2 + Preact + Vite desktop app
**Researched:** 2026-04-12
**Confidence:** HIGH

## Current State

The project already has Vitest 4.1.3, jsdom 29.0.2, and a `vitest.config.ts` with Preact preset and jsdom environment configured. No tests exist yet. The `test` script in package.json runs `vitest run`. This research focuses on what to **add** to complete the testing infrastructure.

## Recommended Stack Additions

### Core Testing Libraries (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@testing-library/preact` | ^3.2.4 | DOM testing utilities for Preact components | The Testing Library approach (query by role/text, not implementation) produces durable tests. This is the official Preact adapter -- same API as `@testing-library/react` but wired to Preact's `act()`. Peer dep: `preact >= 10` (we have 10.29.1). |
| `@testing-library/jest-dom` | ^6.6.3 | Custom DOM matchers (`toBeInTheDocument`, `toHaveClass`, etc.) | Extends Vitest assertions with 20+ DOM-specific matchers. Has first-class Vitest support via `@testing-library/jest-dom/vitest` import. Eliminates brittle `querySelector` + manual assertions. |
| `@vitest/coverage-v8` | ^4.1.3 | Code coverage via V8 engine | Must match Vitest major version (both 4.x). V8 provider is faster than Istanbul and since Vitest 3.2.0 uses AST-based remapping for Istanbul-equivalent accuracy. No separate install of `c8` needed. |

### Tauri Mocking (ALREADY AVAILABLE)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@tauri-apps/api/mocks` | (bundled with @tauri-apps/api 2.10.1) | Mock `invoke()`, windows, and events in frontend tests | Built into the existing `@tauri-apps/api` package -- **no new install needed**. Provides `mockIPC()`, `mockWindows()`, `clearMocks()`. Since Tauri 2.7.0, `shouldMockEvents: true` enables event system mocking. |

### Rust Testing (NO NEW CRATES)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `tauri` with `test` feature | 2.10.3 | Mock runtime for Rust-side command testing | Tauri ships a `tauri::test` module behind the `test` feature flag. Provides `mock_builder()`, `mock_context()`, `noop_assets()`, `mock_app()`, `get_ipc_response()`, `assert_ipc_response()`. Add `tauri = { version = "2", features = ["test"] }` under `[dev-dependencies]`. |
| `tokio` with `test` feature | 1.x | Async test runtime | Already a transitive dependency via Tauri. Add `tokio = { version = "1", features = ["macros", "rt-multi-thread"] }` under `[dev-dependencies]` to enable `#[tokio::test]`. |
| `serde_json` | 1.x | Constructing test payloads | Already in dependencies. No change needed. |

### Development Tools (NEW)

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest setup file (`vitest.setup.ts`) | Global test configuration | Import `@testing-library/jest-dom/vitest` and `@tauri-apps/api/mocks` cleanup. Wire `clearMocks()` in `afterEach`. |
| Coverage reporter config | CI-ready coverage output | Use `['text', 'json-summary', 'html']` reporters. Text for terminal, json-summary for CI thresholds, html for local inspection. |

## Installation

```bash
# Frontend test utilities (NEW packages only)
pnpm add -D @testing-library/preact @testing-library/jest-dom @vitest/coverage-v8
```

No Rust crates to install -- just feature flags in `Cargo.toml`:

```toml
[dev-dependencies]
tauri = { version = "2", features = ["test"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Configuration Changes

### vitest.config.ts (update existing)

```typescript
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',        // Entry point, minimal logic
      ],
    },
  },
});
```

### vitest.setup.ts (NEW)

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import { clearMocks } from '@tauri-apps/api/mocks';

// Cleanup DOM after each test (Testing Library best practice)
afterEach(() => {
  cleanup();
  clearMocks();
});

// jsdom lacks crypto.getRandomValues (needed by Tauri mocks)
if (typeof globalThis.crypto === 'undefined') {
  const { randomFillSync } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: (buf: any) => randomFillSync(buf) },
  });
}
```

### tsconfig.json (update)

Add to `compilerOptions.types`:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom/vitest"]
  }
}
```

### package.json scripts (update)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@testing-library/preact` | Enzyme | Never -- Enzyme is unmaintained, doesn't support Preact natively, and tests implementation details. |
| `@testing-library/preact` | `preact-render-to-string` + snapshot tests | Only for SSR output validation. Not applicable here (Tauri webview, no SSR). |
| `@vitest/coverage-v8` | `@vitest/coverage-istanbul` | Only if V8 coverage has bugs with specific transforms. V8 is faster and now equally accurate since Vitest 3.2.0 AST remapping. |
| `@testing-library/jest-dom` | Raw Vitest `expect()` | Only if you want zero extra dependencies. Jest-dom matchers produce much better error messages for DOM assertions. |
| Rust `tauri::test` | Full E2E with WebDriver | Only for integration testing the complete app. Unit testing commands is faster and more targeted. E2E is out of scope for this milestone. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `jest` | Vitest is already configured, faster, and Vite-native. Adding Jest creates duplicate config and slower tests. | Vitest (already installed) |
| `enzyme` | Unmaintained since 2022, no Preact adapter, tests implementation details (setState, instance). | `@testing-library/preact` |
| `@testing-library/react` | Wrong library -- this is a Preact project. React Testing Library expects `react-dom`. | `@testing-library/preact` |
| `happy-dom` | While faster than jsdom, it has known gaps with `MutationObserver` and `ResizeObserver` that xterm.js and Preact signals rely on. jsdom 29.x is stable and already installed. | `jsdom` (already installed) |
| `vitest-dom` | Community fork of jest-dom for Vitest. Unnecessary since `@testing-library/jest-dom` has native Vitest support via the `/vitest` sub-import. | `@testing-library/jest-dom` |
| `@xterm/xterm` in unit tests | xterm.js requires a real DOM with canvas/WebGL. Unit testing xterm interactions is fragile and slow. | Mock the terminal interface; test the state/logic layer around it. |
| Tauri E2E / WebDriver | Heavy setup, requires building the full app, flaky on CI. Not needed for a consolidation milestone. | Rust-side `tauri::test` for command logic; frontend mocks for IPC. |

## Testing Boundaries

### What to Unit Test (Frontend)

| Layer | Testable? | Approach |
|-------|-----------|----------|
| State manager (`state-manager.ts`) | YES | Import directly, test signal mutations and derived state. Mock `invoke()` with `mockIPC()`. |
| Drag manager (`drag-manager.ts`) | YES | Test resize calculations and constraint logic. Mock DOM measurements. |
| Theme tokens (`tokens.ts`) | YES | Pure data -- test token structure and values. |
| UI components (`components/`) | YES | Render with Testing Library, assert DOM output. Mock Tauri IPC. |
| Terminal wrapper (`terminal/`) | PARTIALLY | Test the state/config layer. Do NOT test xterm.js rendering -- mock the Terminal instance. |
| Server detection (`server/`) | PARTIALLY | Test detection logic with mocked IPC responses. |
| `main.tsx` | NO | Entry point with side effects. Test the modules it imports instead. |

### What to Unit Test (Rust)

| Module | Testable? | Approach |
|--------|-----------|----------|
| `state.rs` | YES | Pure Rust state logic. Standard `#[cfg(test)]` module. |
| `project.rs` | YES | File path logic, project detection. Mock filesystem paths. |
| `file_ops.rs` | YES | File operations with temp directories. |
| `theme/types.rs` | YES | Theme parsing, serde deserialization. |
| `theme/iterm2.rs` | YES | iTerm2 color scheme parsing. Provide fixture XML. |
| `git_status.rs` | PARTIALLY | Test with `tauri::test` mock runtime. Complex git2 interactions may need a temp git repo. |
| `terminal/pty.rs` | NO | PTY operations require a real terminal. Test at integration level only. |
| `file_watcher.rs` | NO | Relies on OS-level file events. Test at integration level. |
| `server.rs` | NO | Process spawning. Not suitable for unit tests. |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vitest@4.1.3` | `@vitest/coverage-v8@4.x` | Major versions must match. Pin to `^4.1.3`. |
| `vitest@4.1.3` | `vite@8.0.7` | Vitest 4.x is built for Vite 6+. Compatible with Vite 8. |
| `@testing-library/preact@3.2.4` | `preact@10.29.1` | Peer dep is `preact >= 10`. Compatible. |
| `@testing-library/jest-dom@6.6.3` | `vitest@4.x` | Works via `@testing-library/jest-dom/vitest` import path. |
| `@tauri-apps/api@2.10.1` mocks | `jsdom@29.x` | Requires `crypto.getRandomValues` polyfill in jsdom (see setup file). |
| `tauri` Rust `test` feature | `tauri@2.10.3` | Feature flag available since Tauri 2.0. Well-established. |

## Rust Test Pattern

```rust
// In src-tauri/src/state.rs (or any command module)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pure_logic() {
        // Test pure functions directly -- no Tauri runtime needed
        let result = some_pure_function(input);
        assert_eq!(result, expected);
    }
}
```

For commands that need `AppHandle` or `State`:

```rust
// In src-tauri/tests/commands.rs (integration test)
#[cfg(test)]
mod tests {
    use tauri::test::{mock_builder, mock_context, noop_assets};

    #[test]
    fn test_command_with_state() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("failed to build mock app");

        app.manage(MyState::default());
        // invoke command via app handle or get_ipc_response
    }
}
```

## Sources

- [Vitest documentation](https://vitest.dev/) -- config, coverage, globals (Context7 verified, HIGH confidence)
- [Preact Testing Library](https://preactjs.com/guide/v10/preact-testing-library/) -- component testing patterns (Context7 verified, HIGH confidence)
- [Tauri 2 Mock APIs](https://v2.tauri.app/develop/tests/mocking/) -- mockIPC, mockWindows, clearMocks (official docs, HIGH confidence)
- [Tauri Rust test module](https://docs.rs/tauri/2.10.2/tauri/test/index.html) -- mock_builder, mock_context, get_ipc_response (docs.rs, HIGH confidence)
- [@vitest/coverage-v8 npm](https://www.npmjs.com/package/@vitest/coverage-v8) -- version 4.1.4 available (npm, HIGH confidence)
- [@testing-library/preact npm](https://www.npmjs.com/package/@testing-library/preact) -- version 3.2.4, peer dep preact >= 10 (npm, HIGH confidence)
- [Testing Library jest-dom with Vitest](https://markus.oberlehner.net/blog/using-testing-library-jest-dom-with-vitest/) -- setup pattern (blog, MEDIUM confidence)
- [Tauri GitHub Discussion #11717](https://github.com/tauri-apps/tauri/discussions/11717) -- testing commands with State (community, MEDIUM confidence)

---
*Stack research for: Efxmux v0.2.0 Testing & Consolidation*
*Researched: 2026-04-12*
