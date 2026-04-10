---
status: awaiting_human_verify
trigger: "Rust compilation error in src-tauri/src/terminal/pty.rs:452 — tokio::task::spawn_blocking used but tokio crate not in scope"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: tokio is not declared as a direct dependency in Cargo.toml, causing E0433
test: Add tokio to Cargo.toml with rt feature, run cargo check
expecting: Compilation succeeds
next_action: Apply fix and verify with cargo check

## Symptoms

expected: App compiles and runs successfully
actual: Compilation fails with 2 errors at pty.rs:452
errors: error[E0433]: failed to resolve: use of unresolved module or unlinked crate `tokio` at src/terminal/pty.rs:452:18; error[E0282]: type annotations needed at same location
reproduction: Run `cargo build` in src-tauri/
started: Current state — likely introduced in recent Phase 9 changes

## Eliminated

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: Cargo.toml dependencies
  found: tokio is NOT listed as a direct dependency — only tauri, serde, portable-pty, etc.
  implication: tokio::task::spawn_blocking cannot resolve because tokio is only a transitive dep via tauri

- timestamp: 2026-04-10T00:00:00Z
  checked: pty.rs imports (lines 0-8)
  found: No `use tokio` statement present
  implication: Even if tokio were in Cargo.toml, the module path `tokio::task::spawn_blocking` is used inline (fully qualified), so a use statement isn't strictly needed — but the crate must be declared as a dependency

## Resolution

root_cause: tokio crate is not declared as a direct dependency in src-tauri/Cargo.toml. The code at pty.rs:452 uses tokio::task::spawn_blocking but tokio is only available as a transitive dependency through tauri, which doesn't re-export it.
fix: Add tokio = { version = "1", features = ["rt"] } to Cargo.toml [dependencies]
verification: cargo check passes with zero errors
files_changed: [src-tauri/Cargo.toml, src-tauri/src/terminal/pty.rs]
