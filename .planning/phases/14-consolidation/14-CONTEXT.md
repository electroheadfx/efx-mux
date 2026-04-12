# Phase 14: Consolidation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up the codebase: remove dead code (unused exports, Arrow.js remnants, orphaned commands), tighten type safety (zero `any` types, explicit return types), and audit dependencies (version matrix alignment, unused packages). Test suite from Phases 12-13 guards against regressions.

</domain>

<decisions>
## Implementation Decisions

### Dead Code Detection (CONS-01)
- **D-01:** Automated-first approach: use `tsc --noEmit` unused export warnings + grep patterns to identify candidates, then manual review to confirm safe removal
- **D-02:** Target categories: unused exports (functions/interfaces/constants never imported), historical Arrow.js comment markers (Phase 6.1 migration labels in file headers), orphaned Tauri commands (never invoked from frontend)
- **D-03:** Do NOT delete files that are imported anywhere — only remove symbols that are genuinely dead (zero imports across all TS files)

### Arrow.js Remnants
- **D-04:** Historical migration comments (// Migrated from Arrow.js to Preact TSX (Phase 6.1)) in file headers are cosmetic — remove only if they cause noise in searches
- **D-05:** No live Arrow.js code remains — Phase 6.1 migration was complete per feedback from Phase 6.1 retrospective

### Type Safety Tightening (CONS-02)
- **D-06:** Current state: no `any` types found in direct grep of TS source files — baseline is already clean
- **D-07:** Focus on explicit return types for public functions — scan for `function foo()` → `function foo(): ReturnType`
- **D-08:** Prioritize: exported functions in src/ first, then internal utility functions used across modules
- **D-09:** Do NOT refactor internal types to add types — only add types where they are missing on existing exported API surfaces

### Dependency Audit (CONS-03)
- **D-10:** Package.json: verify all dependencies are actually imported somewhere in src/ — remove any package with zero imports
- **D-11:** Cargo.toml: verify all Rust crates are used in src-tauri/src/ — remove unused crates
- **D-12:** Version matrix alignment: compare package.json and Cargo.toml versions against PROJECT.md version matrix; flag discrepancies for manual review (versions may have been updated since matrix was written)

### Test Guard
- **D-13:** All consolidation changes must pass `pnpm test` and `cargo test` — test suite is the safety net for this phase
- **D-14:** Run tests after each category of changes (dead code removal, type changes, dependency removal) to isolate regressions

### Claude's Discretion
- Exact order of file processing within each category
- Threshold for "unused" (zero imports vs one non-test import)
- Specific refactoring approach for functions missing return types

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Version Matrix (source of truth)
- `CLAUDE.md` §"Version Matrix" -- pinned package/crate versions for this project
- `.planning/REQUIREMENTS.md` -- CONS-01, CONS-02, CONS-03 acceptance criteria

### Prior Phase Context
- `.planning/phases/11-test-infrastructure/11-CONTEXT.md` -- Phase 11 decisions (mock strategy, coverage threshold 60-70%)
- `.planning/phases/12-typescript-tests/12-CONTEXT.md` -- Phase 12 decisions (colocation, no snapshot testing)
- `.planning/phases/13-rust-tests/13-CONTEXT.md` -- Phase 13 decisions (test approach, coverage threshold)

### Project-Level
- `PROJECT.md` -- technology stack, version constraints
- `.planning/STATE.md` -- current phase position

</canonical_refs>

 benefi
## Existing Code Insights

### Reusable Assets
- `tsc --noEmit` — TypeScript compiler for unused export detection
- `pnpm test` / `cargo test` — existing CI-ready test commands
- Phase 12-13 test suite coverage report baseline — reference for post-consolidation comparison

### Established Patterns
- 98 exported symbols across TypeScript modules
- Colocated test files (foo.test.ts next to foo.ts)
- Rust modules in src-tauri/src/ with no subdirectory structure

### Integration Points
- Consolidation changes flow through: src/ (TS) and src-tauri/src/ (Rust)
- Test suite is the regression guard — must pass after each change category

</code_context>

<specifics>
## Specific Ideas

- "Consolidation should feel like a cleanup pass, not a rewrite" — preserve architecture, remove noise
- Historical migration comments (Phase 6.1) are cosmetic — decide per-file whether to keep or remove

</specifics>

<deferred>
## Deferred Ideas

None — consolidation phase has clear scope, no scope creep detected.

</deferred>

---

*Phase: 14-consolidation*
*Context gathered: 2026-04-12*