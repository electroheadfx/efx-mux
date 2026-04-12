# Phase 13: Rust Tests - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Write unit tests for critical Rust modules (state serde round-trips, git2 operations, file safety checks). Uses Rust's native `#[test]` + `#[cfg(test)]` infrastructure. Phase 11 established test infra; this phase adds Rust test coverage.

</domain>

<decisions>
## Implementation Decisions

### Test Location & Method (RSTEST-01, RSTEST-04)
- **D-01:** Test AppState via Tauri command interface directly — no method extraction needed. Tauri commands remain as wrappers; tests call through the `#[tauri::command]` async interface.
- **D-02:** Colocate `#[cfg(test)] mod tests` inside each `.rs` source file (Rust convention). Consistent with Phase 12 colocation pattern for test files.

### Git Status Test Approach (RSTEST-02)
- **D-03:** Temp git repos per test — each test creates a fresh temp directory, runs `git init`, stages/modifies/untracks files, calls git2 operations, verifies results, then cleans up. Most realistic; git2 doesn't mock well.

### is_safe_path Test Strategy (RSTEST-03)
- **D-04:** Mock filesystem. Requires creating a trait abstraction over `std::fs` operations so file operations can be mocked in tests. Planner must determine refactoring scope needed to support this.

### File Size Guards & Checkbox Write-back
- **D-05:** File size guard tests (> 1MB rejection) — test with temp files of known sizes.
- **D-06:** Checkbox write-back tests — use temp `.md` files with task list syntax, toggle checkboxes, verify file content changes.

### Coverage Approach
- **D-07:** cargo-llvm-cov for coverage reporting.
- **D-08:** 60% threshold on statements, branches, functions, and lines.
- **D-09:** CI: `cargo test && cargo llvm-cov report` — consistent with Phase 12's 60-70% threshold approach.

### Happy Path + Key Edge cases
- **D-10:** No exhaustive boundary or error path testing — 60% coverage threshold handles the rest.
- **D-11:** Test through Tauri commands via `#[tauri::command]` async interface (not raw git2/std::fs calls in tests).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test Infrastructure (Phase 11)
- `.planning/phases/11-test-infrastructure/11-CONTEXT.md` -- Phase 11 decisions on coverage thresholds, mock strategy

### Requirements
- `.planning/REQUIREMENTS.md` -- RSTEST-01 through RSTEST-04 acceptance criteria

### Source Files Under Test
- `src-tauri/src/state.rs` -- AppState serde, ManagedAppState, load/save operations
- `src-tauri/src/git_status.rs` -- GitStatus struct, get_git_status, get_git_files
- `src-tauri/src/file_ops.rs` -- is_safe_path, get_file_diff, list_directory, read_file, write_checkbox

### Rust Tooling
- `src-tauri/Cargo.toml` -- git2 = "0.20.4", regex, serde dependencies available
- `cargo-llvm-cov` -- coverage tool (install via: `cargo install cargo-llvm-cov`)

</canonical_refs>

 benefi
## Existing Code Insights

### Reusable Assets
- Rust `#[test]` + `#[cfg(test)]` — standard Rust test infrastructure, no extra crates needed
- git2 Repository::open/discover — used directly in tests with temp dirs
- tempfile crate (if added) — useful for temp git repos and temp files

### Established Patterns
- No existing Rust tests in the project — this phase starts from scratch
- Tauri commands use `tauri::async_runtime::spawn_blocking` for file I/O (state.rs, git_status.rs, file_ops.rs)
- AppState wrapped in `ManagedAppState(pub Mutex<AppState>)` for interior mutability

### Integration Points
- Tests must use `#[tokio::test]` for async Tauri commands (requires tokio dependency or use `#[test]` + `block_on`)
- Cargo.toml needs `dev-dependencies` section for test crates (tempfile, cargo-llvm-cov)

</code_context>

<specifics>
## Specific Ideas

- Mock filesystem requires trait abstraction over std::fs — scope TBD in planning
- git2 StatusFlags: WT_MODIFIED, INDEX_MODIFIED, INDEX_NEW, INDEX_RENAMED, WT_NEW

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-rust-tests*
*Context gathered: 2026-04-12*
