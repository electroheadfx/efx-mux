# Roadmap: Efxmux

## Milestones

- ✅ **v0.1.0 MVP** -- Phases 1-10 + 6.1 (shipped 2026-04-11)
- 🚧 **v0.2.0 Testing & Consolidation** -- Phases 11-14 (in progress)

## Phases

<details>
<summary>✅ v0.1.0 MVP (Phases 1-10 + 6.1) -- SHIPPED 2026-04-11</summary>

- [x] Phase 1: Scaffold + Entitlements (4/4 plans) -- completed 2026-04-06
- [x] Phase 2: Terminal Integration (3/3 plans) -- completed 2026-04-07
- [x] Phase 3: Terminal Theming (4/4 plans) -- completed 2026-04-07
- [x] Phase 4: Session Persistence (4/4 plans) -- completed 2026-04-07
- [x] Phase 5: Project System + Sidebar (2/2 plans) -- completed 2026-04-07
- [x] Phase 6: Right Panel Views (7/7 plans) -- completed 2026-04-08
- [x] Phase 6.1: Migrate Arrow.js -> Preact (6/6 plans) -- completed 2026-04-08 (INSERTED)
- [x] Phase 7: Server Pane + Agent Support (9/9 plans) -- completed 2026-04-09
- [x] Phase 8: Keyboard + Polish (8/8 plans) -- completed 2026-04-10
- [x] Phase 9: Professional UI Overhaul (6/6 plans) -- completed 2026-04-10
- [x] Phase 10: Pixel-Perfect UI Rewrite (10/10 plans) -- completed 2026-04-11

</details>

- [x] **Phase 11: Test Infrastructure** - Vitest config, mocks, coverage tooling, and CI-ready scripts (completed 2026-04-12)
- [ ] **Phase 12: TypeScript Tests** - Unit tests for critical TS modules and Preact components
- [ ] **Phase 13: Rust Tests** - Unit tests for Tauri command logic, serde, git2, and file ops
- [ ] **Phase 14: Consolidation** - Dead code removal, type tightening, dependency audit

## Phase Details

### Phase 11: Test Infrastructure
**Goal**: Developers can run `pnpm test` and `pnpm test:coverage` against a properly configured Vitest environment with all necessary mocks
**Depends on**: Nothing (first phase of v0.2.0)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. `pnpm test` executes Vitest with jsdom environment and exits cleanly (even with zero test files)
  2. `pnpm test:coverage` produces a coverage report with configured thresholds
  3. Test files can import modules that depend on xterm.js Terminal without crashing (mock active)
  4. Test files can call any Tauri `invoke()` command and receive mock responses (IPC mock factory works)
**Plans:** 2/2 plans complete
Plans:
- [x] 11-01-PLAN.md -- Install deps, configure Vitest with coverage, create vitest.setup.ts with all mocks
- [x] 11-02-PLAN.md -- Create canary test validating infrastructure end-to-end

### Phase 12: TypeScript Tests
**Goal**: Critical TypeScript modules have unit test coverage that catches regressions in ANSI parsing, theming, state management, and component rendering
**Depends on**: Phase 11
**Requirements**: TSTEST-01, TSTEST-02, TSTEST-03, TSTEST-04, TSTEST-05, TSTEST-06
**Success Criteria** (what must be TRUE):
  1. ANSI-to-HTML conversion handles color256, nested sequences, and XSS vectors correctly (ansi-html tests pass)
  2. Theme token resolution produces correct CSS values for both dark and light modes (tokens/theme tests pass)
  3. State manager and theme manager correctly serialize, load, and react to Tauri IPC responses (mock-driven tests pass)
  4. Key Preact components render expected DOM structure given props (component render tests pass)
  5. All TypeScript tests pass in CI-ready `pnpm test` with no manual intervention
**Plans**: TBD

### Phase 13: Rust Tests
**Goal**: Critical Rust modules have unit test coverage that catches regressions in state serialization, git operations, file safety, and command logic
**Depends on**: Phase 11
**Requirements**: RSTEST-01, RSTEST-02, RSTEST-03, RSTEST-04
**Success Criteria** (what must be TRUE):
  1. AppState serializes to JSON and deserializes back to identical struct (serde round-trip tests pass)
  2. git_status operations return correct status for staged, modified, and untracked files (using temp git repos)
  3. `is_safe_path()` rejects path traversal attacks and accepts valid project-relative paths
  4. Extracted AppState methods produce correct results independent of Tauri command wrappers
**Plans**: TBD

### Phase 14: Consolidation
**Goal**: Codebase is clean, type-safe, and dependency-minimal -- with the test suite from Phases 12-13 confirming nothing breaks
**Depends on**: Phase 12, Phase 13
**Requirements**: CONS-01, CONS-02, CONS-03
**Success Criteria** (what must be TRUE):
  1. No dead exports, unused functions, or Arrow.js remnants remain in the codebase
  2. Zero `any` types in TypeScript source files; all public functions have explicit return types
  3. `pnpm test` and `cargo test` both pass after all consolidation changes (test suite guards against regressions)
  4. No unused dependencies in package.json or Cargo.toml; version matrix matches PROJECT.md
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in order: 11 -> 12 -> 13 -> 14
(Phases 12 and 13 both depend on 11; 12 runs first per research guidance; 14 runs last, protected by test suite)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold + Entitlements | v0.1.0 | 4/4 | Complete | 2026-04-06 |
| 2. Terminal Integration | v0.1.0 | 3/3 | Complete | 2026-04-07 |
| 3. Terminal Theming | v0.1.0 | 4/4 | Complete | 2026-04-07 |
| 4. Session Persistence | v0.1.0 | 4/4 | Complete | 2026-04-07 |
| 5. Project System + Sidebar | v0.1.0 | 2/2 | Complete | 2026-04-07 |
| 6. Right Panel Views | v0.1.0 | 7/7 | Complete | 2026-04-08 |
| 6.1 Migrate Arrow.js -> Preact | v0.1.0 | 6/6 | Complete | 2026-04-08 |
| 7. Server Pane + Agent Support | v0.1.0 | 9/9 | Complete | 2026-04-09 |
| 8. Keyboard + Polish | v0.1.0 | 8/8 | Complete | 2026-04-10 |
| 9. Professional UI Overhaul | v0.1.0 | 6/6 | Complete | 2026-04-10 |
| 10. Pixel-Perfect UI Rewrite | v0.1.0 | 10/10 | Complete | 2026-04-11 |
| 11. Test Infrastructure | v0.2.0 | 2/2 | Complete   | 2026-04-12 |
| 12. TypeScript Tests | v0.2.0 | 0/TBD | Not started | - |
| 13. Rust Tests | v0.2.0 | 0/TBD | Not started | - |
| 14. Consolidation | v0.2.0 | 0/TBD | Not started | - |
