---
phase: 14
plan: 02
subsystem: consolidation
tags: [dependency-audit, consolidation]
dependency_graph:
  requires: []
  provides: []
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/phases/14-consolidation/dep-audit-report.md
  modified: []
decisions: []
metrics:
  duration: "~7 minutes"
  completed: "2026-04-12"
---

# Phase 14 Plan 02: Dependency Audit Summary

## Objective

Audit dependencies in package.json and Cargo.toml: verify all packages/crates are actually imported in source code, check version alignment against CLAUDE.md version matrix, and remove unused dependencies.

## What Was Done

**Tasks completed (4/4):**

1. **package.json Audit** — Extracted 10 production dependencies, grepped for imports across `src/`, verified each is actively used
2. **Cargo.toml Audit** — Extracted 11 crates, grepped `src-tauri/src/` for usage patterns, verified each is actively used
3. **Version Comparison** — Compared all versions against CLAUDE.md §"Version Matrix", flagged discrepancies
4. **Rust Tests** — Ran `cargo test` to confirm baseline intact before any changes

## Verification

| Criterion | Result |
|-----------|--------|
| dep-audit-report.md exists | PASS |
| No package removed | PASS (all active, none removed) |
| No crate removed | PASS (all active, none removed) |
| cargo test passes | PASS (19/19 tests) |
| Version discrepancies documented | PASS (1 flagged for review) |

## Findings

### package.json

All 10 production dependencies are actively imported in `src/`:
- `@preact/signals`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener`
- `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `lucide-preact`, `marked`, `preact`

`@xterm/addon-web-links` is a devDependency only (correctly placed).

### Cargo.toml

All 11 crates are actively used:
- `tauri`, `tauri-plugin-opener`, `tauri-plugin-dialog` (core + plugins)
- `serde`, `serde_json` (serialization via derive macros + serde_json::json!)
- `portable-pty` (PTY spawning)
- `notify`, `notify-debouncer-mini` (file watching)
- `git2` (git status/diff)
- `regex` (checkbox parsing in write_checkbox_impl)
- `libc` (process management in server.rs)
- `tempfile` (dev-dependency, appropriate for test TempDir)

### Version Discrepancies

| Item | CLAUDE.md | Actual | Status |
|------|-----------|--------|--------|
| tauri (Rust) | 2.10.3 | version = "2" | Flagged — Cargo resolves to latest 2.x; matrix is stale |

No auto-fixes applied per plan mandate.

## Deviations from Plan

None — plan executed exactly as written.

## Result

**COMPLETE** — All tasks executed, no removals needed, baseline intact. Report committed to `.planning/phases/14-consolidation/dep-audit-report.md`.
