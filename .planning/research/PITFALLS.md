# Pitfalls Research: Testing & Consolidation (v0.2.0)

**Domain:** Adding Vitest unit tests and consolidation refactors to existing Tauri 2 + Preact + xterm.js 6.0 + Tailwind 4 app (9,517 LOC, shipped as MVP in 6 days)
**Researched:** 2026-04-12
**Confidence:** HIGH (verified against Tauri v2 docs, Vitest docs, Preact signals discussions, xterm.js issues)

---

## Critical Pitfalls

---

### Pitfall 1: Tauri Channel Cannot Be Mocked -- PTY Bridge Is Untestable with mockIPC

**What goes wrong:**
The `pty-bridge.ts` module uses `Channel<number[]>` from `@tauri-apps/api/core` for PTY output streaming. Tauri's `mockIPC` utility does NOT support Channel mocking. The open feature request (tauri-apps/tauri#13753) confirms: "Will keep this open since channels are not supported yet." Any test that imports `pty-bridge.ts` and calls `connectPty()` will throw `TypeError: Cannot read properties of undefined (reading 'transformCallback')` because `Channel` constructor requires Tauri runtime internals that jsdom cannot provide.

**Why it happens:**
`Channel` is a Tauri-internal streaming primitive that registers a callback ID with the native runtime via `window.__TAURI_INTERNALS__.transformCallback`. In jsdom, `__TAURI_INTERNALS__` is partially mocked by `mockIPC` but the `transformCallback` method is not included. This is a known gap in Tauri's test infrastructure.

**How to avoid:**
- Do NOT attempt to unit test `pty-bridge.ts` directly. It is a thin integration glue layer (57 LOC) that wires Channel + invoke + xterm.js -- every dependency is external. Unit testing it would require mocking Channel, Terminal, and invoke simultaneously, producing a test that asserts nothing real.
- Instead, test the logic AROUND the bridge: test `terminal-manager.ts` session lifecycle logic with invoke mocked, test `resize-handler.ts` debounce math as pure functions.
- If Channel mocking becomes available later (watch tauri-apps/tauri#13753), revisit.
- For integration testing of the full PTY path, use Tauri's Rust-side `#[cfg(test)]` tests or future WebDriver-based E2E tests -- not Vitest unit tests.

**Warning signs:**
- `TypeError: Cannot read properties of undefined (reading 'transformCallback')` in test output
- Tests importing anything from `@tauri-apps/api/core` that touches `Channel`

**Phase to address:**
Test infrastructure setup (Phase 1 of milestone). Establish the boundary: "Channel-dependent modules are integration-tested, not unit-tested."

---

### Pitfall 2: Signal State Leaks Between Tests -- Global Signals Poison Test Isolation

**What goes wrong:**
The codebase uses 34 `signal()` calls across 9 files, with top-level module-scoped signals in `state-manager.ts` (`projects`, `activeProjectName`, `sidebarCollapsed`, `rightTopTab`, `rightBottomTab`) and in component files (`file-tree.tsx` has 6 signals, `project-modal.tsx` has 7). These are module-level singletons. When Vitest runs multiple tests in the same file, signal values from Test A persist into Test B. Worse, Vitest reuses modules across test files by default (module caching), so signal pollution can cross file boundaries.

**Why it happens:**
Vitest's default behavior caches ESM modules between tests in the same worker thread. `signal()` creates a stateful object at module-evaluation time. Unlike React state which resets on unmount, Preact signals at module scope persist for the lifetime of the module cache. The Preact signals team explicitly calls this out: "Modifying signal values directly affects all tests in a file" (preactjs/signals#522).

**How to avoid:**
- Create a `src/test/setup.ts` that resets all exported signals to their default values in a global `beforeEach`. Import it via `vitest.config.ts` `setupFiles`.
- For `state-manager.ts` specifically: add an exported `resetStateForTesting()` function that sets all signals back to defaults and clears `currentState`. Call it in `beforeEach`.
- Do NOT rely on `vi.resetModules()` as a blanket fix -- it forces re-evaluation of all imports, breaks Preact's internal signal graph, and causes `effect()` / `computed()` to lose their subscriptions.
- For component-level signals (inside `.tsx` files): prefer testing via rendered output (Preact Testing Library) rather than directly reading signal values. The signal is an implementation detail; the DOM output is the contract.

**Warning signs:**
- Tests pass individually but fail when run together (`vitest run` vs `vitest run src/foo.test.ts`)
- Test order affects outcomes (reorder test files, different failures)
- Signal values in test assertions don't match what the test set

**Phase to address:**
Test infrastructure setup (Phase 1). The `setup.ts` with signal reset must exist before any test is written.

---

### Pitfall 3: Consolidation Refactors Break Working Features -- No Safety Net Regression

**What goes wrong:**
The project shipped in 6 days. Code paths were validated manually, not with tests. Consolidation refactors (dead code removal, type tightening, module reorganization) silently break edge cases that were only verified by hand during development. Example: extracting a shared utility from `sidebar.tsx` and `project-modal.tsx` could break the `project-pre-switch` custom event dispatch order in `switchProject()`, which is a race-condition-sensitive code path. There are no tests to catch this.

**Why it happens:**
MVP codebases have implicit contracts -- behaviors that work because of incidental coupling, not explicit design. When consolidating, developers assume they understand the full dependency graph, but rapid development creates hidden dependencies: event listener registration order, signal subscription timing, CSS class names used in JS querySelector calls, Rust command parameter naming that must match `invoke()` calls exactly.

**How to avoid:**
- Write tests BEFORE consolidating. The milestone order must be: (1) set up test infra, (2) write tests for critical paths, (3) THEN consolidate. Never consolidate first.
- Prioritize testing the modules you plan to refactor. If you plan to consolidate `state-manager.ts`, test `loadAppState`, `saveAppState`, and `switchProject` first.
- For each consolidation change, run the app manually and verify the specific feature. Keep a checklist of manual verification steps for features that cannot be unit tested (terminal rendering, drag resize, theme switching).
- Use TypeScript's type system as a safety net: tighten types (replace `Record<string, any>` with specific interfaces) BEFORE moving code. The compiler catches mismatches that tests would miss.

**Warning signs:**
- "I'll just quickly rename this..." followed by a broken feature discovered days later
- Consolidation PR touches > 5 files without corresponding test changes
- Custom events (`project-changed`, `project-pre-switch`) stop firing in the correct order

**Phase to address:**
This is a milestone-level ordering constraint. Tests first (Phases 1-2), consolidation after (Phase 3+).

---

### Pitfall 4: xterm.js Terminal Cannot Be Instantiated in jsdom

**What goes wrong:**
`new Terminal()` from `@xterm/xterm` requires DOM APIs that jsdom does not fully implement: `document.createElement('canvas')` returns a stub without `getContext('2d')` or `getContext('webgl2')`, `window.matchMedia` is undefined, `ResizeObserver` is undefined, and `requestAnimationFrame` behaves differently. Tests that import any module which transitively imports `Terminal` will fail at module evaluation time or at instantiation time with cryptic errors like `Cannot read properties of null (reading 'getContext')`.

**Why it happens:**
xterm.js 6.0 removed the canvas addon and defaults to DOM rendering with WebGL as the GPU path. Even the DOM renderer measures character dimensions using canvas 2d context during initialization. jsdom does not provide a real rendering engine.

**How to avoid:**
- Mock `@xterm/xterm` at the module level in tests that need it: `vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(() => ({ write: vi.fn(), onData: vi.fn(() => ({ dispose: vi.fn() })), onResize: vi.fn(() => ({ dispose: vi.fn() })), dispose: vi.fn(), cols: 80, rows: 24, loadAddon: vi.fn(), open: vi.fn() })) }))`.
- Better: structure code so that business logic modules do NOT import `Terminal` directly. The current architecture already does this well -- `pty-bridge.ts` takes a `Terminal` parameter rather than creating one. Test callers can pass a mock object.
- For `terminal-manager.ts`: if it creates `Terminal` instances, mock the import. If it only manages session metadata, it may not need the mock at all.
- Do NOT attempt to use `@vitest/browser` mode just to get real DOM for xterm.js unit tests. The complexity is not justified for the test value gained.

**Warning signs:**
- `ReferenceError: ResizeObserver is not defined`
- `TypeError: Cannot read properties of null (reading 'getContext')`
- Tests hanging during Terminal instantiation (jsdom canvas polyfill deadlock)

**Phase to address:**
Test infrastructure setup (Phase 1). Establish xterm.js mocking pattern in a shared test utility.

---

## Moderate Pitfalls

---

### Pitfall 5: mockIPC Handler Must Match Exact Rust Command Signatures

**What goes wrong:**
`mockIPC` receives `(cmd, args)` where `cmd` is the Rust `#[tauri::command]` function name and `args` is the deserialized argument object. If the mock handler returns a value with a different shape than the Rust command, the test passes but tests a lie. Example: the Rust `load_state` command returns `AppState` with `version: i32` but the mock returns `version: "1"` (string). The code under test works in the mock but would fail against real Rust.

**Why it happens:**
There is no type-checking bridge between Rust command return types and TypeScript mock return types. The mock handler is `(cmd: string, args: Record<string, unknown>) => any` -- completely untyped. Developers copy-paste mock data from console logs or guess at the shape.

**How to avoid:**
- Create typed mock factories in `src/test/mocks/tauri-commands.ts` that return correctly-typed objects matching the TypeScript interfaces: `function mockLoadState(overrides?: Partial<AppState>): AppState { return { version: 1, layout: {}, theme: { mode: 'dark' }, ... , ...overrides }; }`.
- Use the same TypeScript interfaces (`AppState`, `ProjectEntry`, `GitData`) for mock return values that the production code uses. If the interface changes, mock factories break at compile time.
- List all 25 `invoke()` calls and their expected return types. Create mock factories for the ones being tested.

**Warning signs:**
- Tests pass but the app breaks after a Rust command signature change
- Mock data has `any` type or is cast with `as unknown as AppState`
- Mock handler uses a giant `if/else` chain without type annotations

**Phase to address:**
Test infrastructure setup (Phase 1). Mock factories are reusable across all test files.

---

### Pitfall 6: jsdom Missing WebCrypto -- Silent Test Failures

**What goes wrong:**
Tauri's `mockIPC` internally uses `window.crypto.getRandomValues()` to generate unique callback IDs. jsdom does not implement `WebCrypto`. Without polyfilling it, `mockIPC()` throws `TypeError: window.crypto.getRandomValues is not a function` or silently generates undefined IDs that cause invoke promises to never resolve (tests hang with timeout).

**Why it happens:**
The Tauri mocking docs show the fix but many developers skip the setup code. In Node.js 19+, `globalThis.crypto` exists but jsdom overrides `window.crypto` with `undefined`.

**How to avoid:**
- Add to `src/test/setup.ts`:
  ```typescript
  import { randomFillSync } from 'node:crypto';
  Object.defineProperty(window, 'crypto', {
    value: { getRandomValues: (buf: Buffer) => randomFillSync(buf) },
  });
  ```
- This MUST run before any `mockIPC` call, so it belongs in the Vitest `setupFiles`, not in individual test files.
- Reference the official Tauri testing guide: https://v2.tauri.app/develop/tests/mocking/

**Warning signs:**
- Tests hang indefinitely (invoke promise never resolves)
- `TypeError: window.crypto.getRandomValues is not a function`
- `mockIPC` callback IDs are `undefined`

**Phase to address:**
Test infrastructure setup (Phase 1). One-time setup, never revisited.

---

### Pitfall 7: Dead Code Removal Deletes Code That Is Actually Used via Dynamic Paths

**What goes wrong:**
During consolidation, static analysis (grep, TypeScript unused-export warnings) identifies "dead" functions or exports. But the codebase uses dynamic patterns: `document.dispatchEvent(new CustomEvent('project-changed'))` is consumed by `document.addEventListener('project-changed', ...)` in a different file. Tauri `invoke('command_name')` calls match Rust functions by string, not by import. Removing a Rust command that appears "unused" in Rust (because it's only called from JS via string) breaks the app.

**Why it happens:**
String-based coupling (custom events, invoke command names, CSS class selectors used in JS) is invisible to static analysis. MVP codebases use more string-based coupling because it's faster to write.

**How to avoid:**
- Before removing any code, grep for the function/event/class name as a string literal across BOTH `src/` and `src-tauri/src/`. The invoke command names in Rust (`#[tauri::command]`) must match the JS `invoke('name')` calls.
- Maintain a list of all custom events: `project-changed`, `project-pre-switch`, and any others. These are cross-module contracts.
- Use TypeScript's `noUnusedLocals` and `noUnusedParameters` only for detecting WITHIN-MODULE dead code. Cross-module dead code requires manual verification.
- When in doubt, comment out (don't delete) and run the app. Convert to deletion after manual verification.

**Warning signs:**
- Removing an export that has 0 TypeScript import references but is used via `invoke()` or `CustomEvent`
- Grep for the function name returns 0 hits but the function is a Tauri command handler
- App features break after "safe" dead code removal

**Phase to address:**
Consolidation phase (Phase 3+). Must happen after tests are written for the features being touched.

---

### Pitfall 8: Vitest Config Conflicts with Vite Config -- Duplicate Plugin Issues

**What goes wrong:**
The project has separate `vite.config.ts` and `vitest.config.ts`. Both load the `preact()` plugin. If Vitest picks up `vite.config.ts` (its default behavior when no `vitest.config.ts` exists) AND also loads `vitest.config.ts`, the Preact plugin runs twice, causing JSX transform conflicts: components render twice, hooks fire in wrong order, or Preact's internal component recycling breaks.

**Why it happens:**
Vitest is built on Vite and will merge configs. The current `vitest.config.ts` correctly uses `defineConfig` from `vitest/config` and includes `preact()` plugin -- but if someone adds `test` config to `vite.config.ts` as well (a common refactor during consolidation), both configs load.

**How to avoid:**
- Keep test configuration exclusively in `vitest.config.ts`. Never add a `test` key to `vite.config.ts`.
- The existing separation is correct. Add a comment at the top of each file: `// Test config is in vitest.config.ts -- do not add test{} here` in `vite.config.ts`.
- Verify by running `vitest --reporter=verbose` and checking that only one instance of the Preact plugin loads.

**Warning signs:**
- Components render but with doubled effects
- `preact` module resolved from two different paths
- JSX transform produces `h()` calls instead of `_jsx()` or vice versa

**Phase to address:**
Test infrastructure setup (Phase 1). Verify once, protect with comments.

---

### Pitfall 9: Type Tightening Breaks Rust-JS Contract Silently

**What goes wrong:**
During consolidation, you tighten TypeScript types: replace `Record<string, string | boolean>` in `AppState.layout` with a specific interface like `{ 'sidebar-w': string; 'right-w': string; ... }`. The TypeScript compiles fine. But the Rust `state.rs` serializes with `serde_json` using the original loose structure. If the Rust side includes a field the TypeScript interface doesn't expect (e.g., a new field added during debugging), `invoke<AppState>('load_state')` silently drops the unknown field (Tauri deserializes on the JS side permissively). Conversely, if TypeScript sends a stricter type to Rust, serde may reject it.

**Why it happens:**
The Tauri IPC boundary is untyped at the protocol level. TypeScript types and Rust structs are maintained independently. There is no codegen or schema validation bridging them.

**How to avoid:**
- When tightening TypeScript types, simultaneously review the corresponding Rust struct in `src-tauri/src/state.rs`. They must stay in sync.
- Add a test that round-trips: `mockIPC` returns a value from a mock factory, the code processes it, and the test asserts the expected shape. This catches deserialization mismatches at test time.
- Consider adding a `src/types/tauri-commands.ts` file that is the single source of truth for all invoke return types. Both mock factories and production code import from it.

**Warning signs:**
- Fields silently missing from loaded state after type tightening
- Rust `serde` deserialization errors in Tauri logs after JS-side type changes
- State appears to load correctly but specific fields are `undefined`

**Phase to address:**
Consolidation phase (Phase 3+). Type tightening is a consolidation activity that must be cross-checked against Rust.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `any` casts in invoke calls | Fast shipping | Silent type mismatches at IPC boundary | Never -- replace with typed mock factories during v0.2.0 |
| Module-level signal singletons | Simple global state | Test isolation hell, can't run parallel test suites | Acceptable for app state; problematic for component-local state |
| No test for PTY/Channel code | Avoids mock complexity | PTY regressions only caught manually | Acceptable -- integration-test this via E2E in future milestone |
| Manual DOM event contracts | No extra deps | Invisible coupling, breaks on rename | Acceptable for v0.2.0; consider typed event bus in v0.3.0 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tauri `mockIPC` | Forgetting WebCrypto polyfill | Add `randomFillSync` polyfill in `setupFiles` before any mock usage |
| Tauri `mockIPC` + Channel | Trying to mock Channel-based streaming | Don't. Test logic around the bridge, not the bridge itself |
| Tauri event system | Using `mockIPC({ shouldMockEvents: true })` without understanding scope | Event mocks only work for `plugin:event` prefixed events; custom events via `document.dispatchEvent` are not covered |
| Preact Testing Library | Importing from `@testing-library/react` by habit | Must use `@testing-library/preact` -- different package, subtly different API |
| Preact signals in tests | Reading `.value` directly after state change | Use `waitFor()` or `act()` -- signal updates may batch asynchronously when connected to effects |
| xterm.js in jsdom | Importing Terminal in test file scope | Mock at module level with `vi.mock()` or restructure code to accept Terminal as parameter |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running all tests with jsdom environment | Slow test suite (jsdom startup ~200ms per file) | Use `// @vitest-environment node` comment for pure logic tests that don't need DOM | > 50 test files |
| Not using Vitest's `--pool=threads` | Sequential test execution | Keep default thread pool; avoid `--pool=forks` unless signal isolation requires it | > 20 test files |
| Testing rendered xterm.js output | Tests that wait for WebGL frames never resolve | Mock xterm.js entirely; test business logic not rendering | Any test involving Terminal instantiation |

## "Looks Done But Isn't" Checklist

- [ ] **Test setup:** WebCrypto polyfill in `setupFiles` -- verify `mockIPC` works before writing tests
- [ ] **Signal isolation:** `beforeEach` resets all module-level signals -- verify by running tests in reverse order
- [ ] **Mock type safety:** All mock factories use the same interfaces as production code -- verify by changing an interface field
- [ ] **Consolidation safety:** Every refactored module has at least one test covering its public API BEFORE the refactor
- [ ] **Rust-JS sync:** After type tightening, verify round-trip with actual app launch (not just TypeScript compilation)
- [ ] **Custom event contracts:** All `CustomEvent` names are documented and grep-verified before any dead code removal
- [ ] **vitest.config.ts isolation:** No `test` key in `vite.config.ts` -- verified no duplicate plugin loading

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Channel mock failure | LOW | Move Channel-dependent code to "integration test" category; mock around it |
| Signal state leak | LOW | Add `resetStateForTesting()` and global `beforeEach`; re-run failing tests |
| Consolidation regression | MEDIUM | Git revert the consolidation commit; write tests first; re-apply changes incrementally |
| xterm.js jsdom crash | LOW | Add `vi.mock('@xterm/xterm')` to test file; restructure imports if needed |
| Type tightening mismatch | MEDIUM | Compare TS interfaces against Rust structs field-by-field; add round-trip test |
| Dead code deletion of invoke target | HIGH | Restore from git; add grep-for-strings step to consolidation checklist |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Channel unmockable | Phase 1 (test infra) | Document test boundary; no Channel imports in unit tests |
| Signal state leaks | Phase 1 (test infra) | Tests pass in any order (`vitest run --shuffle`) |
| Consolidation regression | Phase 2-3 ordering | Tests written before consolidation begins |
| xterm.js in jsdom | Phase 1 (test infra) | Mock utility exists; test importing terminal-manager succeeds |
| mockIPC type safety | Phase 1 (test infra) | Mock factories compile against production interfaces |
| WebCrypto polyfill | Phase 1 (test infra) | `vitest run` succeeds on clean checkout |
| Dead code removal | Phase 3+ (consolidation) | Grep checklist executed before every deletion |
| Type tightening | Phase 3+ (consolidation) | Round-trip test exists; app launches after changes |
| Vitest config conflict | Phase 1 (test infra) | Verified single plugin instance in verbose output |

## Sources

- Tauri v2 mocking docs: https://v2.tauri.app/develop/tests/mocking/
- Tauri Channel mock not supported (open issue): https://github.com/tauri-apps/tauri/issues/13753
- Tauri event mock bug (transformCallback): https://github.com/tauri-apps/tauri/issues/14281
- Preact signals testing best practices: https://github.com/preactjs/signals/discussions/522
- Preact Testing Library: https://preactjs.com/guide/v10/preact-testing-library/
- Vitest jsdom compatibility issue: https://github.com/vitest-dev/vitest/issues/9279
- Vitest environment docs: https://vitest.dev/guide/environment
- xterm.js WebGL testing discussion: https://github.com/xtermjs/xterm.js/discussions/5154
- Vitest setup for Tauri projects: https://yonatankra.com/how-to-setup-vitest-in-a-tauri-project/

---
*Pitfalls research for: Efxmux v0.2.0 Testing & Consolidation*
*Researched: 2026-04-12*
