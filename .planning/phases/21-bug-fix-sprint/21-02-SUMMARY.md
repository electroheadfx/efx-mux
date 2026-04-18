---
phase: 21-bug-fix-sprint
plan: 02
subsystem: file-tree / external-editor integration
tags:
  - fix
  - bug
  - ipc
  - launchservices
  - silent-failure
dependency_graph:
  requires:
    - phase-18 external-editor commands (launch_external_editor, detect_editors)
  provides:
    - reliable external-editor launch from both header dropdown and row context-menu
    - user-visible toast on launch failure (no more silent failures)
  affects:
    - src/components/file-tree.tsx (launchOrToast, openHeaderOpenInMenu)
    - src-tauri/src/file_ops.rs (launch_external_editor_impl)
tech_stack:
  added: []
  patterns:
    - "spawn + child.wait() + status check for side-effecting processes (never .spawn().map(|_| ()))"
    - "backend Err(String) → Tauri invoke rejection → frontend FileError → catch-block toast"
key_files:
  created:
    - .planning/debug/resolved/open-project-external-editor-regression.md
    - .planning/phases/21-bug-fix-sprint/21-02-SUMMARY.md
  modified:
    - src-tauri/src/file_ops.rs
    - src/components/file-tree.tsx
decisions:
  - "spawn + wait is the permanent shape for launch_external_editor_impl — .spawn().map(|_| ()) is explicitly banned for side-effecting LaunchServices calls"
  - "UAT deferred to joint verification across 21-01 / 21-02 / 21-03 at end of phase 21 (user running all three together)"
metrics:
  duration: "~45 min (continuation task — Task 1 investigation already done in prior session)"
  completed: 2026-04-18
requirements:
  - FIX-05
---

# Phase 21 Plan 02: Open-In External Editor Regression — Summary

Fix FIX-05: both "Open Project in external editor" header-button and file-tree row "Open In" context-menu paths failed silently even with project active and editors detected. Root cause: `.spawn().map(|_| ())` in `launch_external_editor_impl` swallowed non-zero exits from `open -a` (LaunchServices CFBundleName mismatches). Fix: spawn + `child.wait()` + status check → `Err(String)` → frontend toast.

## What Was Built

- **Backend fix (`src-tauri/src/file_ops.rs`):** `launch_external_editor_impl` now spawns `open -a <App> <path>`, waits on the child, and returns `Err(String)` on non-zero exit or wait failure. A permanent structured `eprintln!` logs the non-zero case to the dev-server terminal.
- **Frontend error propagation confirmed:** `launchExternalEditor` in `src/services/file-service.ts` already throws `FileError('LaunchError', …)` on backend rejection (no change needed). `launchOrToast` catch branch fires `showToast` — now with a permanent structured `console.warn` as the defensive log.
- **Both invocation paths verified:** header dropdown (`openHeaderOpenInMenu`) and row context-menu (`buildRowMenuItems` → `buildOpenInChildren`) share the same `launchOrToast` → `launchExternalEditor` chain, so the single backend change fixes both simultaneously.
- **Debug doc finalized:** `.planning/debug/resolved/open-project-external-editor-regression.md` marked `status: resolved` with root cause, fix, verification, files_changed, commits, and prevention rules.

## Key Files Touched

| File | Change |
| ---- | ------ |
| `src-tauri/src/file_ops.rs` | `launch_external_editor_impl`: spawn + wait + status check; permanent `eprintln!` on non-zero |
| `src/components/file-tree.tsx` | Stripped `[FIX-05]` debug noise; kept permanent `console.warn` in `launchOrToast` catch |
| `.planning/debug/resolved/open-project-external-editor-regression.md` | Marked `resolved`; Resolution/Prevention filled |

## Root Cause + Fix

**Root cause:** The prior backend shape was:
```rust
std::process::Command::new("open")
    .args(["-a", app, path])
    .spawn()
    .map(|_| ())            // ← treats spawn as success; never checks exit code
    .map_err(|e| e.to_string())
```
`open -a` forks immediately (LaunchServices hand-off) even for a non-existent app name. The parent returned `Ok(())`; LaunchServices later rejected the request; `open` exited non-zero; the parent never saw it. Frontend got success → no toast → silent failure.

**Fix:** Replace with spawn + `child.wait()` + status check; return `Err(format!(…))` on non-zero exit. This flows through Tauri's IPC rejection path to the frontend's `try`/`catch` in `launchOrToast`, which already shows a toast.

**Permanent improvement:** The spawn-and-forget pattern is the generic bug that allowed this regression to land without test coverage. Prevention rules are documented in the debug doc: never `.spawn().map(|_| ())` for side-effecting LaunchServices/shell tools; IPC commands fronting user actions must propagate backend `Err` to a frontend toast.

## Deviations from Plan

### Auto-approved Deviations

1. **[Rule 3 — Continuation] UAT (Task 2) skipped per operator instruction.** User cannot run UAT against the dev server in this session; operator directed continuation based on Task 1's high-confidence code-level diagnosis.
2. **[Rule 3 — Continuation] UAT verification (Task 4) deferred.** Joint UAT will run across 21-01 / 21-02 / 21-03 at end of phase 21. Not blocking for plan completion per operator instruction.

## Deferred Items

- **Joint UAT (Tests A / B / C from Task 4 of PLAN):** operator will verify header button + row context-menu + negative-path-toast test alongside 21-01 and 21-03.
- **Audit `open_default_impl` and `reveal_in_finder_impl`** for the same `.spawn().map(|_| ())` shape. Silent failure risk is lower for those (Finder appears visibly if the call succeeds), but the pattern should be cleaned up. Tracked in the Prevention section of the debug doc. Out of scope for 21-02.
- **Automated regression test** for `launch_external_editor_impl("NonexistentApp_XYZ", <tempdir>) → Err` — blocked on phase-20 test-infra cleanup.

## Verification

- `cargo check --manifest-path src-tauri/Cargo.toml` → clean (0 errors)
- `pnpm exec tsc --noEmit` → clean (0 errors)
- `grep -c '\[FIX-05\]' src/components/file-tree.tsx src-tauri/src/file_ops.rs` → 0 / 0 (instrumentation fully removed)
- `grep -n 'child.wait' src-tauri/src/file_ops.rs` → match at line 570 (spawn-and-check pattern preserved)
- `grep -n 'status: resolved' .planning/debug/resolved/open-project-external-editor-regression.md` → match at line 3

## Commits

- `f2e639c` — `feat(21-02): instrument FIX-05 — wait on open exit, log launch flow` (Task 1, prior session)
- `a0faf92` — `fix(21-02): apply FIX-05 — return Err on non-zero exit, wire toast on both paths` (Task 3)
- `9c43571` — `docs(21-02): finalize FIX-05 debug doc as resolved` (Task 4)
- (this commit) — `docs(21-02): summary and tracking update` (Task 5)

## Cross-links

- Debug doc: `.planning/debug/resolved/open-project-external-editor-regression.md`
- Prior related fix: `.planning/debug/resolved/open-project-external-editor.md` (commit `02abef6`, header-visibility-only — orthogonal to this regression)
- Phase context: `.planning/phases/21-bug-fix-sprint/21-CONTEXT.md`

## Self-Check: PASSED

- `src-tauri/src/file_ops.rs` exists and contains `child.wait()` at line 570 — FOUND
- `src/components/file-tree.tsx` exists and contains the permanent `console.warn` in `launchOrToast` — FOUND
- `.planning/debug/resolved/open-project-external-editor-regression.md` exists with `status: resolved` — FOUND
- Commit `f2e639c` (Task 1) — FOUND in `git log`
- Commit `a0faf92` (Task 3) — FOUND in `git log`
- Commit `9c43571` (Task 4) — FOUND in `git log`
- `cargo check` green — VERIFIED
- `pnpm exec tsc --noEmit` green — VERIFIED
