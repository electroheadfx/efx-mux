# Architecture Research: Testing & Consolidation

**Domain:** Unit testing integration for Tauri 2 + Preact + xterm.js desktop app
**Researched:** 2026-04-12
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TEST INFRASTRUCTURE                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Vitest     │  │  jsdom env   │  │  @tauri-apps/api/mocks │ │
│  │  (runner)   │  │  (DOM shim)  │  │  (IPC mock layer)      │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────┘ │
│         │               │                       │              │
├─────────┴───────────────┴───────────────────────┴──────────────┤
│                    FRONTEND (TypeScript)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Pure logic │  │ Tauri bridge│  │  Components  │             │
│  │ (testable) │  │ (mock IPC)  │  │  (optional)  │             │
│  └────────────┘  └─────────────┘  └─────────────┘             │
│   ansi-html.ts    state-manager    sidebar.tsx                  │
│   tokens.ts       server-bridge    file-tree.tsx                │
│   color256()      theme-manager    gsd-viewer.tsx               │
├─────────────────────────────────────────────────────────────────┤
│                    BACKEND (Rust)                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Pure fns   │  │ State mgmt  │  │ System I/O   │             │
│  │ (unit test)│  │ (#[cfg(test)]│  │ (skip)       │             │
│  └────────────┘  └─────────────┘  └─────────────┘             │
│   is_safe_path    state serde      pty, tmux                   │
│   color256        project CRUD     git2 ops                    │
│   GitStatus       AppState         file watcher                │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Test Strategy |
|-----------|----------------|---------------|
| `ansi-html.ts` | ANSI escape -> HTML conversion | Pure function, direct unit tests |
| `tokens.ts` | Design token constants | Contract/property tests |
| `state-manager.ts` | App state bridge to Rust | Mock `invoke`, test signal updates |
| `server-bridge.ts` | Server command wrappers | Mock `invoke` + `listen`, verify args |
| `theme-manager.ts` | Theme application + hot-reload | Mock `invoke`/`listen`, test CSS var logic |
| `terminal-manager.ts` | xterm.js lifecycle | Skip -- WebGL/DOM heavy, untestable in jsdom |
| `drag-manager.ts` | Split handle drag | Skip -- DOM manipulation, low test value |
| `state.rs` | State serialization/persistence | `#[cfg(test)]` with tempdir |
| `project.rs` | Project CRUD operations | Extract pure methods, test directly |
| `git_status.rs` | Git status via git2 | Integration tests with temp git repos |
| `file_ops.rs` | File operations + path validation | `is_safe_path` pure tests; tempdir for I/O |

## Recommended Test File Structure

```
src/
├── server/
│   ├── ansi-html.ts
│   ├── ansi-html.test.ts          # NEW: Pure function tests
│   ├── server-bridge.ts
│   └── server-bridge.test.ts      # NEW: Mock invoke/listen
├── terminal/
│   ├── terminal-manager.ts        # SKIP: WebGL/DOM heavy
│   ├── pty-bridge.ts              # SKIP: Heavy Tauri IPC + binary streams
│   └── resize-handler.ts          # SKIP: DOM measurement
├── theme/
│   ├── theme-manager.ts
│   └── theme-manager.test.ts      # NEW: Mock invoke, test CSS var logic
├── components/                    # DEFER: component tests are low priority
├── state-manager.ts
├── state-manager.test.ts          # NEW: Mock invoke, test signal logic
├── tokens.ts
├── tokens.test.ts                 # NEW: Token contract assertions
├── drag-manager.ts                # SKIP: Pure DOM manipulation
├── __test__/
│   └── setup.ts                   # NEW: Global test setup (mocks, crypto)
└── ...

src-tauri/src/
├── state.rs                       # MODIFY: add #[cfg(test)] mod tests
├── project.rs                     # MODIFY: extract pure fns + add tests
├── git_status.rs                  # MODIFY: add #[cfg(test)] mod tests
├── file_ops.rs                    # MODIFY: add #[cfg(test)] mod tests
├── server.rs                      # SKIP: process spawning, system calls
├── terminal/
│   ├── pty.rs                     # SKIP: PTY + tmux system calls
│   └── mod.rs
└── theme/
    ├── iterm2.rs                  # SKIP: plist parsing, low priority
    ├── types.rs                   # MODIFY: add serde tests
    └── watcher.rs                 # SKIP: notify/filesystem
```

### Structure Rationale

- **Co-located test files** (`*.test.ts` next to source): Vitest config already uses `src/**/*.test.{ts,tsx}`. Co-location keeps tests discoverable and imports simple.
- **Shared setup in `__test__/setup.ts`**: Tauri mock initialization (`mockIPC`, `clearMocks`, crypto polyfill) goes here, referenced from vitest.config.ts `setupFiles`.
- **Rust tests inline** (`#[cfg(test)] mod tests`): Standard Rust convention. No separate test directory needed for unit tests.
- **Explicit skip list**: terminal-manager, drag-manager, pty-bridge, resize-handler all depend heavily on DOM/WebGL/system calls. Testing them provides minimal value vs. effort.

## Architectural Patterns

### Pattern 1: Tauri IPC Mocking with `@tauri-apps/api/mocks`

**What:** Use Tauri's built-in `mockIPC` to intercept `invoke()` calls in tests. This replaces the Rust backend with a JS handler that returns canned responses.
**When to use:** Any test that imports a module calling `invoke()` from `@tauri-apps/api/core`.
**Trade-offs:** Realistic IPC simulation (+), but mock handlers must be kept in sync with Rust command signatures manually (-). No type checking between mock and real backend.

**Example:**
```typescript
// state-manager.test.ts
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

beforeEach(() => {
  mockIPC((cmd, args) => {
    if (cmd === 'load_state') {
      return {
        version: 1,
        layout: { 'sidebar-w': '200px', 'right-w': '25%',
                  'right-h-pct': '50', 'sidebar-collapsed': false },
        theme: { mode: 'dark' },
        session: { 'main-tmux-session': 'efx-mux',
                   'right-tmux-session': 'efx-mux-right' },
        project: { active: null, projects: [] },
        panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'git' },
      };
    }
    if (cmd === 'save_state') return undefined;
    if (cmd === 'get_projects') return [];
    if (cmd === 'get_active_project') return null;
  });
});

afterEach(() => {
  clearMocks();
});
```

### Pattern 2: Tauri Event Mocking for `listen()`

**What:** When `mockIPC` is called with `{ shouldMockEvents: true }`, the `listen()` and `emit()` functions from `@tauri-apps/api/event` are also intercepted. This lets tests simulate Tauri backend events like `theme-changed` or `server-output`.
**When to use:** Testing `server-bridge.ts` (listens for `server-output`, `server-stopped`) and `theme-manager.ts` (listens for `theme-changed`).
**Trade-offs:** Enables event-driven test scenarios (+), but the event mock API has had reported bugs (GitHub issue #14281) (-). Keep event tests simple.

**Example:**
```typescript
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';

beforeEach(() => {
  mockIPC(() => {}, { shouldMockEvents: true });
});

it('receives server output events', async () => {
  const outputs: string[] = [];
  const unlisten = await listenServerOutput((_proj, text) => {
    outputs.push(text);
  });
  await emit('server-output', { project: 'test', text: 'Started on :3000' });
  expect(outputs).toContain('Started on :3000');
  unlisten();
});
```

### Pattern 3: Pure Function Extraction for Testability

**What:** Extract logic that doesn't depend on Tauri IPC, DOM, or system calls into pure functions. Test those directly without mocks.
**When to use:** Whenever a module mixes pure logic with side effects. `ansi-html.ts` is the ideal example -- `ansiToHtml()` and `extractServerUrl()` are pure functions.
**Trade-offs:** Best test value per effort (+). May require refactoring coupled code (-).

**Example (already testable, no changes needed):**
```typescript
// ansi-html.test.ts
import { ansiToHtml, extractServerUrl } from './ansi-html';

it('converts basic ANSI red to HTML span', () => {
  const result = ansiToHtml('\x1b[31mError\x1b[0m');
  expect(result).toContain('color:#dc322f');
  expect(result).toContain('Error');
});

it('HTML-escapes before ANSI processing (XSS prevention)', () => {
  const result = ansiToHtml('<script>alert("xss")</script>');
  expect(result).toContain('&lt;script&gt;');
  expect(result).not.toContain('<script>');
});

it('extracts localhost URL from server output', () => {
  expect(extractServerUrl('Listening on http://localhost:3000'))
    .toBe('http://localhost:3000');
  expect(extractServerUrl('No URL here')).toBeNull();
});
```

### Pattern 4: Rust Unit Tests with `#[cfg(test)]`

**What:** Standard Rust inline test modules. For state/project logic, create an `AppState` in-memory and test mutations. For file operations, use `tempfile` crate for isolated filesystem tests.
**When to use:** Any Rust function that has testable logic separable from Tauri's runtime.
**Trade-offs:** Fast, reliable, no external deps (+). Cannot test `#[tauri::command]` wrappers directly since they need Tauri's State extractor (-). Test the inner functions instead.

**Example:**
```rust
// In state.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_has_version_1() {
        let state = AppState::default();
        assert_eq!(state.version, 1);
    }

    #[test]
    fn state_roundtrip_serde() {
        let state = AppState::default();
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: AppState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.version, state.version);
        assert_eq!(deserialized.layout.sidebar_w, "200px");
    }

    #[test]
    fn corrupt_json_falls_back_to_default() {
        let result: Result<AppState, _> = serde_json::from_str("not json");
        assert!(result.is_err());
        // load_state_sync handles this by returning AppState::default()
    }
}
```

### Pattern 5: Extract Methods from Tauri Command Wrappers

**What:** The `project.rs` CRUD functions use `tauri::State<ManagedAppState>` which requires the Tauri runtime. To test the business logic, extract pure methods onto `AppState`.
**When to use:** `project.rs` add/remove/switch/update logic.
**Trade-offs:** Tests actual business logic (+). Requires minor refactoring (-).

**Recommended refactor:**
```rust
// project.rs - extract testable inner functions
impl AppState {
    pub fn add_project(&mut self, entry: ProjectEntry) -> Result<(), String> {
        if self.project.projects.iter().any(|p| p.name == entry.name) {
            return Err(format!("Project '{}' already exists", entry.name));
        }
        self.project.projects.push(entry);
        Ok(())
    }

    pub fn remove_project(&mut self, name: &str) {
        self.project.projects.retain(|p| p.name != name);
        if self.project.active.as_deref() == Some(name) {
            self.project.active = None;
        }
    }

    pub fn switch_project(&mut self, name: &str) -> Result<(), String> {
        if !self.project.projects.iter().any(|p| p.name == name) {
            return Err(format!("Project '{}' not found", name));
        }
        self.project.active = Some(name.to_string());
        Ok(())
    }
}

// #[tauri::command] wrappers become thin delegation:
// lock mutex -> call method -> save
```

## Data Flow

### Test Execution Flow (Frontend)

```
pnpm test (vitest run)
    ↓
vitest.config.ts (jsdom env, preact plugin, setupFiles)
    ↓
__test__/setup.ts (crypto polyfill, optional global mockIPC)
    ↓
*.test.ts files discovered (src/**/*.test.{ts,tsx})
    ↓
beforeEach: mockIPC() intercepts invoke/listen
    ↓
Test body: import module -> call function -> assert
    ↓
afterEach: clearMocks()
```

### Test Execution Flow (Backend)

```
cargo test (from src-tauri/)
    ↓
#[cfg(test)] mod tests in each .rs file
    ↓
#[test] fn test_name() runs in isolation
    ↓
Pure function tests: no setup needed
    ↓
I/O tests: tempfile crate for isolated dirs
```

### Key Data Flows to Test

1. **State load/save cycle:** `loadAppState()` calls `invoke('load_state')` -> returns `AppState` -> signals updated. Test: mock invoke returns valid state, verify signals have correct values.
2. **ANSI rendering pipeline:** Raw ANSI string -> `ansiToHtml()` -> styled HTML string. Test: known ANSI inputs produce expected HTML output (XSS safety, color accuracy, 256-color, truecolor, edge cases).
3. **Project CRUD:** `addProject()` -> `invoke('add_project')` -> reload state -> update `projects` signal. Test: mock invoke sequence, verify signal state after operation.
4. **Server event flow:** `listenServerOutput()` -> Tauri event `server-output` -> callback with (project, text). Test: mock events, verify callback receives correct payload.
5. **Rust state serde:** `AppState` serialize -> deserialize roundtrip. Test: default values preserved, unknown fields ignored, corrupt input falls back to defaults.
6. **Path safety:** `is_safe_path()` rejects traversal. Test: `..` components rejected, valid paths accepted.

## Integration Points

### New Components (to create)

| Component | Type | Purpose |
|-----------|------|---------|
| `src/__test__/setup.ts` | New file | Global test setup: crypto polyfill, Tauri mock init |
| `src/server/ansi-html.test.ts` | New file | Pure function tests for ANSI->HTML |
| `src/state-manager.test.ts` | New file | State lifecycle with mocked IPC |
| `src/server/server-bridge.test.ts` | New file | Server bridge with mocked IPC + events |
| `src/theme/theme-manager.test.ts` | New file | Theme logic with mocked IPC |
| `src/tokens.test.ts` | New file | Design token contract assertions |

### Modified Components

| Component | Change |
|-----------|--------|
| `vitest.config.ts` | Add `setupFiles: ['src/__test__/setup.ts']` |
| `src-tauri/src/state.rs` | Add `#[cfg(test)] mod tests` (serde roundtrip, defaults) |
| `src-tauri/src/project.rs` | Extract `impl AppState` methods + add `#[cfg(test)] mod tests` |
| `src-tauri/src/git_status.rs` | Add `#[cfg(test)] mod tests` (temp git repo) |
| `src-tauri/src/file_ops.rs` | Add `#[cfg(test)] mod tests` (`is_safe_path`, checkbox) |
| `src-tauri/src/theme/types.rs` | Add `#[cfg(test)] mod tests` (theme serde) |
| `src-tauri/Cargo.toml` | Add `[dev-dependencies] tempfile = "3"` |
| `package.json` | Add `"test:rust": "cd src-tauri && cargo test"`, `"test:all": "vitest run && cd src-tauri && cargo test"` |

### External Dependencies for Testing

| Dependency | Type | Purpose | Already Installed? |
|------------|------|---------|-------------------|
| `vitest` | devDependency | Test runner | YES (4.1.3) |
| `jsdom` | devDependency | DOM environment | YES (29.0.2) |
| `@tauri-apps/api` | dependency | `mocks` submodule for IPC mocking | YES (2.10.1) |
| `tempfile` | Rust dev-dependency | Temp directories for Rust I/O tests | NO -- add to Cargo.toml |

### Internal Boundaries

| Boundary | Communication | Test Approach |
|----------|---------------|---------------|
| TS modules <-> Tauri IPC | `invoke()` from `@tauri-apps/api/core` | `mockIPC()` intercepts all commands |
| TS modules <-> Tauri events | `listen()` from `@tauri-apps/api/event` | `mockIPC({ shouldMockEvents: true })` |
| Rust commands <-> Rust pure fns | Direct function calls | Test pure fns directly, skip command wrappers |
| Components <-> Signals | `@preact/signals` reactivity | Test signal values after operations |
| Components <-> DOM | Preact render + CSS | Defer -- component tests are Phase 2 territory |

## Anti-Patterns

### Anti-Pattern 1: Testing Tauri Command Wrappers Directly in Rust

**What people do:** Try to instantiate `tauri::State<ManagedAppState>` in test code to call `#[tauri::command]` functions.
**Why it's wrong:** `tauri::State` requires the full Tauri runtime. Booting an entire Tauri app in tests is slow, fragile, and defeats the purpose of unit tests.
**Do this instead:** Test the inner logic (pure functions, struct methods). The `#[tauri::command]` wrapper is thin delegation -- if the inner logic is correct and the wrapper is trivial, the wrapper needs no test.

### Anti-Pattern 2: Manual Module Mocking Instead of mockIPC

**What people do:** Use `vi.mock('@tauri-apps/api/core')` to stub `invoke` with `vi.fn()`.
**Why it's wrong:** `vi.mock` replaces the entire module. Tauri's `mockIPC` is specifically designed to simulate IPC and handles internal details (request ID, response format). Manual mocking misses edge cases and breaks when Tauri updates internals.
**Do this instead:** Always use `import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'`.

### Anti-Pattern 3: Testing xterm.js/WebGL in jsdom

**What people do:** Try to create `Terminal` instances and test rendering in jsdom.
**Why it's wrong:** jsdom has no rendering engine, no WebGL context, no canvas. xterm.js will fail to initialize or produce meaningless results.
**Do this instead:** Skip terminal-manager tests entirely. Terminal integration is validated by manual testing. If automated terminal testing is needed, that's E2E territory, not unit tests.

### Anti-Pattern 4: Tautological Constant Tests

**What people do:** Write `expect(colors.accent).toBe('#258AD1')` -- just repeating the source code.
**Why it's wrong:** These tests break when you intentionally change the value, not when something goes wrong. Pure maintenance cost.
**Do this instead:** Test token *properties* -- all color values are valid 7-char hex strings, all font sizes are positive numbers, no duplicate color keys. This validates the contract, not the values.

### Anti-Pattern 5: Over-Mocking State Manager

**What people do:** Mock every function in state-manager.ts when testing components that use it.
**Why it's wrong:** The state manager is the backbone of the app. Over-mocking hides real integration bugs.
**Do this instead:** Mock only the Tauri IPC layer (`mockIPC`). Let state-manager.ts run its real logic against the mock IPC. This tests the actual signal update flow.

## Consolidation Opportunities

### Refactor 1: Extract Pure Functions from `project.rs`

Move project CRUD logic from `#[tauri::command]` closures into `impl AppState` methods. The command wrappers become 3-line functions: lock mutex, call method, save. The methods are trivially testable.

### Refactor 2: Centralize Tauri Mock Setup

Create `src/__test__/setup.ts` with:
- `globalThis.crypto` polyfill (jsdom lacks WebCrypto, required by Tauri mocks)
- Shared `mockIPC` handler with all known command responses (optional -- per-test setup may be cleaner)
- `clearMocks()` in global `afterEach`

Reference in `vitest.config.ts` via `setupFiles: ['src/__test__/setup.ts']`.

### Refactor 3: Dead Code Audit

After rapid MVP development (9,517 LOC in 6 days), dead code is expected. Candidates:
- Unused exports in `state-manager.ts` (e.g., `updateSession` -- check for callers)
- Vestigial event listeners from pre-Preact architecture
- Unused Rust functions or types from iterative development
- Arrow.js references in comments (already replaced by Preact in Phase 6.1)

### Refactor 4: Type Tightening

- `AppState.layout` is `Record<string, string | boolean>` on the TS side but a strongly-typed struct in Rust. Align TS types to match Rust struct fields.
- `ProjectEntry.agent` is `string` but should be a union type: `'claude-code' | 'opencode' | string`.
- `ThemeData.terminal` is `Record<string, string>` but xterm.js has a specific `ITheme` interface.

## Build Order for Testing Phases

Based on dependencies and value-per-effort:

### Phase 1: Infrastructure + Pure Functions (no mocking needed)
1. Update `vitest.config.ts` with `setupFiles`
2. Create `src/__test__/setup.ts` with crypto polyfill
3. Write `ansi-html.test.ts` -- highest value, pure functions, zero mocks
4. Write `tokens.test.ts` -- contract tests for token API surface
5. Add `tempfile = "3"` to Rust `[dev-dependencies]`
6. Add `#[cfg(test)]` to `state.rs` -- serde roundtrip, defaults
7. Add `#[cfg(test)]` to `file_ops.rs` -- `is_safe_path` pure tests

**Rationale:** Establishes infrastructure and proves the test pipeline works. Pure function tests build confidence without mock complexity.

### Phase 2: Tauri IPC Mocking Layer
1. Write `state-manager.test.ts` -- load/save cycle, signal updates
2. Write `server-bridge.test.ts` -- invoke arg verification, event listening
3. Write `theme-manager.test.ts` -- theme application, mode toggle

**Rationale:** Adds the IPC mock layer. These tests validate the bridge between frontend and backend.

### Phase 3: Rust Logic Tests + Refactoring
1. Extract `impl AppState` methods in `project.rs`
2. Add `#[cfg(test)]` to `project.rs` -- CRUD operations
3. Add `#[cfg(test)]` to `git_status.rs` -- temp repo integration tests
4. Add `#[cfg(test)]` to `file_ops.rs` -- directory listing, checkbox write-back
5. Add `#[cfg(test)]` to `theme/types.rs` -- theme serde

**Rationale:** Rust tests run independently (`cargo test`). Extracting methods from command wrappers improves testability and code quality simultaneously.

### Phase 4: Consolidation
1. Dead code audit + removal
2. Type tightening (TS types match Rust structs)
3. CI script: `pnpm test && cd src-tauri && cargo test`
4. Verify `pnpm run build` still works after all changes

**Rationale:** Consolidation after testing ensures tests catch regressions in the cleanup.

## Vitest Configuration (Final)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/__test__/setup.ts'],
    globals: false, // explicit imports preferred for clarity
  },
});
```

## Test Setup File

```typescript
// src/__test__/setup.ts
import { afterEach } from 'vitest';
import { randomFillSync } from 'crypto';

// jsdom lacks WebCrypto, required by @tauri-apps/api/mocks
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (buffer: Buffer) => randomFillSync(buffer),
  },
});

// Auto-cleanup mocks after each test
afterEach(async () => {
  const { clearMocks } = await import('@tauri-apps/api/mocks');
  clearMocks();
});
```

## Sources

- [Tauri v2 Mock APIs documentation](https://v2.tauri.app/develop/tests/mocking/) -- HIGH confidence
- [Tauri mocks namespace API reference](https://v2.tauri.app/reference/javascript/api/namespacemocks/) -- HIGH confidence
- [Tauri event mock bug report #14281](https://github.com/tauri-apps/tauri/issues/14281) -- event mocking has known edge cases
- Vitest 4.x config: existing `vitest.config.ts` in project, already configured for jsdom + Preact
- Rust `#[cfg(test)]` pattern: standard Rust convention

---
*Architecture research for: Efxmux testing & consolidation*
*Researched: 2026-04-12*
