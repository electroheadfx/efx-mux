# Feature Research

**Domain:** Unit testing and project consolidation for Tauri 2 + Preact terminal mux app
**Researched:** 2026-04-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Must Have for v0.2.0)

Features that make this milestone worth doing. Without these, "testing & consolidation" is just checkbox theater.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Vitest test infrastructure | Tests cannot run without config, mocks, CI scripts | LOW | Already have `vitest.config.ts` + jsdom; need Tauri invoke mocks and test utilities |
| Pure function unit tests (ansi-html, tokens, color256) | These are the highest-ROI tests: pure input/output, no DOM, catch regressions fast | LOW | `ansiToHtml()`, `extractServerUrl()`, `color256()` are perfect test targets |
| State serialization round-trip tests | State persistence is critical path -- broken state.json = app won't restore | MEDIUM | Test `AppState` serde round-trips on Rust side; test state-manager type contracts on TS side |
| Rust unit tests for git_status, state, theme | These modules have pure logic extractable from Tauri command wrappers | MEDIUM | `GitStatus::for_path()` testable with temp git repos; state serde testable without Tauri |
| Dead code removal | 6-day sprint guarantees abandoned code paths; dead code confuses future development | LOW | Run TypeScript strict checks, look for unused exports, check for leftover Arrow.js patterns |
| Type safety tightening | Rapid development often means `any` types, missing interfaces, loose generics | LOW | Enable stricter tsconfig options, add return types to exported functions |
| Dependency audit | Post-sprint deps may include unused packages or version mismatches | LOW | `pnpm why` for each dep; remove unused; verify version matrix from CLAUDE.md |

### Differentiators (High Value, Not Strictly Required)

Features that make the test suite actually useful long-term rather than just "we have tests."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tauri invoke mock layer | Reusable mock for `@tauri-apps/api/core` invoke calls; enables testing any component that talks to Rust | MEDIUM | Create `src/test/tauri-mock.ts` that intercepts invoke with configurable responses |
| Component render tests for key panels | Verify sidebar, right-panel, and GSD viewer render without crashing; catch broken imports | MEDIUM | Use Preact render + jsdom; test that components mount, not pixel output |
| Rust integration test for PTY spawn/destroy lifecycle | PTY is the most critical path; a test that spawns `echo hello` and reads output catches portability issues | HIGH | Requires real PTY (not mockable); run in `#[cfg(test)]` with short timeout |
| Module boundary documentation | After consolidation, document which modules are public API vs internal; prevents future coupling | LOW | Add barrel exports, internal-only markers, or module-level doc comments |
| CI-ready test scripts | `pnpm test` and `cargo test` in package.json scripts; ready for GitHub Actions | LOW | Already have `"test": "vitest run"`; add `"test:rust"` and `"test:all"` |
| Code organization refactor | Extract shared types to `src/types/`, consolidate Tauri invoke calls to `src/api/` | MEDIUM | Reduces import spaghetti; makes mock layer cleaner |

### Anti-Features (Do NOT Build These)

Features that seem like good testing practice but are wrong for this project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| E2E tests with WebDriver/Playwright | "Full coverage" instinct | Tauri E2E is fragile, slow, requires app build. Terminal rendering is non-deterministic. ROI is near zero for a solo-dev desktop app | Manual smoke test checklist; component render tests for UI |
| Snapshot testing for components | "Catch UI regressions" | UI changed twice in 10 phases. Snapshots would be constant noise, not signal. Terminal output is non-deterministic | Test behavior (does it mount? does callback fire?) not rendered HTML |
| 100% code coverage target | "Professional standards" | Most code is Tauri IPC glue or DOM manipulation. Forcing coverage on drag-manager or terminal-tabs means writing DOM simulation tests that test nothing real | Cover pure functions thoroughly; accept 0% on DOM-heavy glue code |
| Mock tmux/PTY for frontend tests | "Unit test everything" | Mocking terminal I/O is harder than the real thing. Tests would validate the mock, not the integration | Rust-side integration test with real PTY; skip terminal pipeline in TS tests |
| Visual regression testing | "Pixel-perfect UI" | Requires screenshot infrastructure, baseline management, CI with display. Overkill for single-developer project | Design review via Pencil mockup comparison (already in workflow) |
| Testing xterm.js rendering | "Terminal is core feature" | xterm.js is a third-party library. Testing that it renders text is testing their code. WebGL context cannot be created in jsdom | Trust xterm.js; test your integration points (theme application, resize handler) |

## Feature Dependencies

```
[Vitest infrastructure]
    |-- requires --> [Tauri invoke mock layer]
    |                    |-- enables --> [Component render tests]
    |                    |-- enables --> [State manager tests]
    |
    |-- enables --> [Pure function tests] (no deps, can start immediately)

[Dead code removal]
    |-- should precede --> [Code organization refactor]
    |                          |-- enables --> [Module boundary docs]

[Type safety tightening]
    |-- independent, parallel with everything]

[Dependency audit]
    |-- should precede --> [CI-ready scripts] (clean deps before locking CI)

[Rust unit tests]
    |-- independent of TS tests, parallel track]
```

### Dependency Notes

- **Component render tests require Tauri mock layer:** Every component calls `invoke()`. Without mocks, components throw on import.
- **Dead code removal before refactoring:** Remove the junk first, then reorganize what remains. Refactoring dead code is wasted effort.
- **Pure function tests have zero dependencies:** `ansi-html.ts` and `tokens.ts` import nothing from Tauri or DOM. Test immediately.
- **Rust tests are independent:** `cargo test` runs separately from Vitest. No shared infrastructure needed.

## What To Test vs What Not To Test

### HIGH ROI -- Test These

| Module | Why Test | What To Assert |
|--------|----------|----------------|
| `src/server/ansi-html.ts` | Pure function, complex logic, XSS prevention | HTML output for ANSI codes; XSS vectors escaped; 256-color and truecolor conversion; edge cases (empty input, malformed sequences) |
| `src/server/ansi-html.ts::extractServerUrl()` | Pure regex, critical for server pane | Extracts localhost URLs; returns null for non-URLs; handles port numbers and paths |
| `src/tokens.ts` | Pure data, design system contract | Token values match expected hex codes; all expected keys exist |
| `src-tauri/src/state.rs` | Serde round-trip, default values | Serialize then deserialize produces same struct; defaults are sensible; migration from older versions |
| `src-tauri/src/git_status.rs` | Pure git2 logic | Correct counts for modified/staged/untracked; handles bare repos; handles empty repos |
| `src-tauri/src/theme/types.rs` | Theme parsing logic | Valid theme.json parses; missing fields get defaults; invalid JSON errors gracefully |
| `src-tauri/src/theme/iterm2.rs` | iTerm2 plist conversion | Converts iTerm2 color profile to internal theme format |
| `src/state-manager.ts` | State shape contracts | Type exports match Rust-side AppState; default state is valid; state update functions produce expected shapes |

### LOW ROI -- Skip These

| Module | Why Skip |
|--------|----------|
| `src/drag-manager.ts` | 100% DOM event manipulation. Testing requires simulating mousedown/mousemove/mouseup with getBoundingClientRect. Tests would be longer than the code. |
| `src/terminal/terminal-manager.ts` | Creates xterm.js Terminal instances. Cannot construct Terminal in jsdom (needs canvas/WebGL). |
| `src/terminal/pty-bridge.ts` | Thin wrapper around `invoke('spawn_terminal')` and `invoke('write_pty')`. Testing the wrapper tests nothing. |
| `src/terminal/resize-handler.ts` | ResizeObserver + DOM measurement + invoke. All browser APIs. |
| `src/components/terminal-tabs.tsx` | 700+ lines of complex UI with xterm.js refs, PTY lifecycle, tmux integration. Integration test territory, not unit test. |
| `src/components/sidebar.tsx` | Heavy DOM, drag handles, project switching via invoke. Would need full Tauri mock + DOM simulation. |
| `src/main.tsx` | App bootstrap. Tests would just verify "it doesn't crash" which `pnpm build` already does. |

## Consolidation Categories

### Dead Code Removal (Priority: P1)

| Target | What to Look For | Detection Method |
|--------|-----------------|------------------|
| Unused exports | Functions/types exported but never imported | TypeScript `--noUnusedLocals` + manual grep for export usage |
| Arrow.js remnants | Any leftover references to `reactive`, `html` template literals, Arrow.js patterns | Grep for `arrow`, `reactive`, `html\`` |
| Abandoned feature flags | Conditional code for features that were cut or redesigned | Grep for `TODO`, `FIXME`, `HACK`, commented-out blocks |
| Unused Rust commands | Tauri commands registered but never invoked from frontend | Cross-reference `generate_handler![]` with `invoke()` calls in TS |
| Unused CSS classes | Tailwind classes defined in `@layer` but never used | Tailwind purge handles this at build time, but check custom CSS in `@layer` |

### Type Safety Tightening (Priority: P1)

| Action | Impact | Effort |
|--------|--------|--------|
| Add explicit return types to all exported functions | Catches drift between intent and implementation | LOW |
| Replace `any` types with proper interfaces | Prevents silent type errors | LOW-MEDIUM |
| Enable `strict: true` in tsconfig if not already | Catches null/undefined issues | MEDIUM (may surface many errors) |
| Add `@ts-expect-error` annotations where `any` is intentional | Documents deliberate type escapes | LOW |

### Code Organization (Priority: P2)

| Refactor | Rationale | Effort |
|----------|-----------|--------|
| Extract shared TypeScript types to `src/types/` | Types duplicated between state-manager, components, and bridges | LOW |
| Consolidate Tauri invoke calls to `src/api/` barrel | Makes mock layer trivial; single point of change if API evolves | MEDIUM |
| Group test files co-located with source | `ansi-html.test.ts` next to `ansi-html.ts` (already configured in vitest.config.ts) | LOW |

### Dependency Audit (Priority: P2)

| Check | Why | How |
|-------|-----|-----|
| Unused npm packages | Sprint installs leave orphaned deps | `pnpm why <pkg>` for each dep; check if actually imported |
| Version matrix alignment | CLAUDE.md specifies exact versions; drift causes subtle bugs | Compare `package.json` and `Cargo.toml` against CLAUDE.md version matrix |
| Dev vs prod classification | Some deps may be in wrong section | Verify test/build tools are in `devDependencies` |

## MVP Definition

### Phase 1: Test Infrastructure + Pure Function Tests

Minimum to claim "we have tests that catch real bugs."

- [ ] Tauri invoke mock layer (`src/test/tauri-mock.ts`) -- enables all component tests
- [ ] `ansi-html.test.ts` -- XSS prevention, color conversion, edge cases (~15-20 test cases)
- [ ] `extractServerUrl.test.ts` -- URL extraction regex (~8-10 test cases)
- [ ] Rust `state.rs` serde round-trip tests (~5-8 test cases)
- [ ] Rust `git_status.rs` tests with temp repo (~5-8 test cases)
- [ ] Rust `theme/types.rs` parse tests (~5 test cases)
- [ ] CI-ready scripts: `pnpm test` + `cargo test` both green

### Phase 2: Consolidation

Clean up after the sprint before adding more features.

- [ ] Dead code scan and removal
- [ ] Type safety audit (explicit return types, remove `any`)
- [ ] Dependency audit (remove unused, verify versions)
- [ ] Arrow.js remnant cleanup (if any remain)

### Phase 3: Extended Tests + Organization (if time permits)

- [ ] Component render tests for 2-3 key panels (sidebar, right-panel, GSD viewer)
- [ ] Code organization refactor (types/, api/ barrels)
- [ ] Module boundary documentation

### Future Consideration (v0.3+)

- [ ] Rust integration test for PTY spawn lifecycle -- defer because it requires real PTY and is slow
- [ ] GitHub Actions CI pipeline -- defer until test suite is stable
- [ ] Pre-commit hook running `vitest run` -- defer until test suite is fast enough (<5s)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pure function tests (ansi-html, tokens) | HIGH | LOW | P1 |
| Tauri invoke mock layer | HIGH | MEDIUM | P1 |
| State serde round-trip (Rust) | HIGH | LOW | P1 |
| Dead code removal | HIGH | LOW | P1 |
| Type safety tightening | MEDIUM | LOW | P1 |
| CI-ready test scripts | MEDIUM | LOW | P1 |
| Git status tests (Rust) | MEDIUM | MEDIUM | P1 |
| Dependency audit | MEDIUM | LOW | P2 |
| Component render tests | MEDIUM | MEDIUM | P2 |
| Code organization refactor | MEDIUM | MEDIUM | P2 |
| Theme parse tests (Rust) | LOW | LOW | P2 |
| iTerm2 import tests (Rust) | LOW | LOW | P2 |
| PTY integration test (Rust) | MEDIUM | HIGH | P3 |
| Module boundary docs | LOW | LOW | P3 |

**Priority key:**
- P1: Must have -- this is why the milestone exists
- P2: Should have -- improves quality but milestone succeeds without it
- P3: Nice to have -- defer if time pressure

## Testability Assessment by Module

### TypeScript Side

| Module | Lines | Testability | Reason |
|--------|-------|-------------|--------|
| `server/ansi-html.ts` | 148 | EXCELLENT | Pure functions, zero deps |
| `tokens.ts` | 60 | EXCELLENT | Pure data export |
| `state-manager.ts` | 230 | GOOD | Needs invoke mock, but logic is extractable |
| `theme/theme-manager.ts` | 250 | POOR | Heavy Tauri + DOM coupling |
| `drag-manager.ts` | 180 | POOR | Pure DOM events |
| `terminal/terminal-manager.ts` | 100 | UNTESTABLE | Requires xterm.js + WebGL |
| `terminal/pty-bridge.ts` | 55 | TRIVIAL | Thin invoke wrapper, nothing to test |
| `terminal/resize-handler.ts` | 40 | POOR | ResizeObserver + DOM |
| `server/server-bridge.ts` | 70 | TRIVIAL | Thin invoke wrapper |
| `components/*.tsx` | ~3500 | MIXED | Some mountable with mocks, most too DOM-heavy |

### Rust Side

| Module | Lines | Testability | Reason |
|--------|-------|-------------|--------|
| `state.rs` | 280 | GOOD | Serde logic testable without Tauri runtime |
| `git_status.rs` | 90 | GOOD | Testable with temp git repos via `git2` |
| `theme/types.rs` | 287 | GOOD | Parsing logic is pure |
| `theme/iterm2.rs` | 131 | GOOD | Plist conversion is pure |
| `file_ops.rs` | 220 | MEDIUM | File I/O testable with temp dirs |
| `project.rs` | 90 | MEDIUM | State mutation, needs managed state mock |
| `server.rs` | 260 | POOR | Process spawning, Tauri app handle deps |
| `terminal/pty.rs` | ~400 | POOR | PTY + Tauri managed state + threads |
| `lib.rs` | 178 | UNTESTABLE | App bootstrap, not unit-testable |

## Sources

- Vitest documentation: https://vitest.dev/guide/
- Preact testing patterns: https://preactjs.com/guide/v10/unit-testing-with-enzyme
- Tauri v2 testing: community convention is to mock `invoke()` at module level via `vi.mock('@tauri-apps/api/core')`
- Rust testing: https://doc.rust-lang.org/book/ch11-00-testing.html
- xterm.js jsdom limitation: canvas/WebGL context not available (known constraint)
- Existing codebase analysis: 14 Rust files, 22 TypeScript files, ~9,500 LOC total

---
*Feature research for: Testing and consolidation of Efxmux v0.2.0*
*Researched: 2026-04-12*
