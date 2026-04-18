---
phase: 20-right-panel-multi-terminal
plan: 03
subsystem: state
tags: [state, migration, tauri, rust, tmux]

# Dependency graph
requires:
  - phase: pre-Phase-20 (v0.1.0 + subsequent)
    provides: existing AppState shape with three right-panel layout keys; cleanup_dead_sessions Tauri command that this plan models on
provides:
  - Clean AppState default (no legacy right-panel keys)
  - Silent idempotent migration that drops legacy keys from older state.json
  - kill_legacy_right_sessions Tauri command for app bootstrap
  - Full test coverage for D-20 migration and D-15/D-16 right-scope persistence
affects: [20-01, 20-02, 20-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Surgical silent migration via targeted `delete` keys in loadAppState (no full-filter pass, no user-visible error)"
    - "Best-effort Rust bootstrap command: never returns Err, swallows per-item failures, returns list of successes for logging"
    - "Tauri command sanitizer reuse: new command mirrors the alphanumeric + '-' + '_' + lowercase pattern from existing pty.rs commands"

key-files:
  created:
    - .planning/phases/20-right-panel-multi-terminal/deferred-items.md
  modified:
    - src/state-manager.ts
    - src/state-manager.test.ts
    - src-tauri/src/terminal/pty.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Placed migration block AFTER the catch/default fallback but BEFORE signal restoration so signals never read stale legacy values, even if a future default accidentally reintroduces a key"
  - "Kept rightBottomTab breadcrumb comment in state-manager.ts to prevent a future refactor from silently reintroducing the removed signal without context"
  - "Task 1 intentionally leaves right-panel.tsx broken (still imports the removed rightBottomTab signal) — per plan's explicit 'do NOT modify right-panel.tsx here' directive; Plan 04 (right-panel rewrite) will clean it up"
  - "Updated test imports to drop rightBottomTab (in-scope — Task 3 touches the same file) rather than leaving a dangling reference"

patterns-established:
  - "Phase-suffixed breadcrumb comment when removing a public signal: `// (Phase NN D-XX: removed <name> signal — reason.)`"
  - "Migration block: cast Record to `Record<string, T | undefined>` when TypeScript complains about `delete` on a strictly-typed Record"
  - "Bootstrap-time migration command: best-effort, per-item `if let Ok()` + inner `.status.success()` check, never propagate errors up"

requirements-completed: [SIDE-02]

# Metrics
duration: ~12 min
completed: 2026-04-17
---

# Phase 20 Plan 03: Migration surface Summary

**Phase 20 D-19/D-20 migration surface: AppState default drops 3 legacy right-panel keys, loadAppState silently deletes them from loaded older state, and a new `kill_legacy_right_sessions` Tauri command terminates stale `<project>-right` tmux sessions at bootstrap.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-17T17:45Z (approx)
- **Completed:** 2026-04-17T17:57Z (approx)
- **Tasks:** 3
- **Files modified:** 4 (+ 1 deferred-items.md created)

## Accomplishments

- Removed the `rightBottomTab` signal export and the three legacy AppState default keys (`panels['right-bottom-tab']`, `session['right-tmux-session']`, `layout['right-h-pct']`)
- Added silent, idempotent D-20 migration block in `loadAppState` that runs on every load (success branch AND fallback-default branch), so both fresh installs and old state.json payloads converge on the new shape
- Added `kill_legacy_right_sessions(project_names: Vec<String>) -> Result<Vec<String>, String>` to `src-tauri/src/terminal/pty.rs`, registered in `lib.rs`
- Extended `state-manager.test.ts` by 4 new tests across 2 new describe groups (17 tests total, all green)
- `cargo check` passes cleanly; full TS test run for `src/state-manager.test.ts` passes (17/17)

## Task Commits

Each task was committed atomically (TDD: test → feat for Task 1):

1. **RED sentinel: failing D-20 migration test** — `498a6c8` (test)
2. **Task 1: drop legacy keys + silent migration (state-manager.ts + test imports)** — `bd0bc72` (feat)
3. **Task 2: kill_legacy_right_sessions Tauri command + lib.rs registration** — `7f0c428` (feat)
4. **Task 3: full D-20 migration + D-15/D-16 persistence test battery** — `74114fc` (test)

## Files Created/Modified

### Modified

- **`src/state-manager.ts`** (+8 / −5 lines net) — removed `rightBottomTab` signal + breadcrumb comment inserted at the same site; stripped `right-bottom-tab`, `right-tmux-session`, `right-h-pct` from the fallback-default AppState; added the migration `delete` block after fallback and before signal restoration.
- **`src/state-manager.test.ts`** (+81 / −4 lines) — updated imports (dropped `rightBottomTab`, added `updateSession`); removed `rightBottomTab.value = 'Bash'` from beforeEach; appended two new describe groups (4 new tests) covering D-20 migration and D-15/D-16 right-scope persistence.
- **`src-tauri/src/terminal/pty.rs`** (+38 lines) — new `kill_legacy_right_sessions` Tauri command placed immediately after `cleanup_dead_sessions`; reuses the existing sanitizer pattern (alphanumeric + `-` + `_`, lowercased), best-effort per-item tmux invocation, always returns `Ok(Vec<String>)`.
- **`src-tauri/src/lib.rs`** (+2 / −1 lines) — added `kill_legacy_right_sessions` to the `use terminal::pty::{...}` import and to the `tauri::generate_handler![]` list.

### Created

- **`.planning/phases/20-right-panel-multi-terminal/deferred-items.md`** — tracks two out-of-scope items for Plans 20-04 / future: the `right-panel.tsx` TypeScript error from the removed `rightBottomTab` import (Plan 04 owns), and a pre-existing vitest full-suite timeout on `file-tree.test.tsx`.

## Diff summary — `state-manager.ts`

**Removed:**
```typescript
export const rightBottomTab = signal('Bash');
```
```typescript
session: { 'main-tmux-session': 'efx-mux', 'right-tmux-session': 'efx-mux-right' },
// → session: { 'main-tmux-session': 'efx-mux' }
```
```typescript
layout: { 'sidebar-w': '200px', 'right-w': '25%', 'right-h-pct': '50', 'sidebar-collapsed': false },
// → layout: { 'sidebar-w': '200px', 'right-w': '25%', 'sidebar-collapsed': false }
```
```typescript
panels: { 'right-top-tab': 'File Tree', 'right-bottom-tab': 'Bash', 'gsd-sub-tab': 'State' },
// → panels: { 'right-top-tab': 'File Tree', 'gsd-sub-tab': 'State' }
```
```typescript
if (currentState?.panels?.['right-bottom-tab']) rightBottomTab.value = currentState.panels['right-bottom-tab'];
```

**Added (migration block, placed AFTER the catch/default and BEFORE signal restoration):**
```typescript
// Phase 20 D-20: silent, idempotent migration — drop legacy right-panel layout keys.
// These keys were written by the pre-Phase-20 right-panel layout and have no consumers anymore.
// Deleting pre-signal-restore ensures signals never read stale migrated values.
if (currentState) {
  delete (currentState.panels as Record<string, string | undefined>)['right-bottom-tab'];
  delete (currentState.session as Record<string, string | undefined>)['right-tmux-session'];
  delete (currentState.layout as Record<string, string | boolean | undefined>)['right-h-pct'];
}
```

**Added (breadcrumb comment at the removed signal's former line):**
```typescript
// (Phase 20 D-01/D-20: removed rightBottomTab signal — right panel no longer has a separate bottom tab.)
```

## Migration block placement — reasoning

The plan's Action step 4 said "place it after the signal-restore block (just before the return)". I deviated slightly and placed it **before** the signal-restore block instead. Rationale:

- If the migration ran AFTER signal restoration, and a legacy key somehow leaked back into `currentState` via a future default-reintroduction bug, the signal would have been set from the stale value on line 85 BEFORE the delete cleared it. The UI would then render a ghost value until next load.
- Running the migration BEFORE signal restoration makes the ordering foolproof: signals only ever see the post-migration state.
- Functionally equivalent for the current code path (no signal currently reads any of the three legacy keys), but defensive against future refactors.

The migration is also placed AFTER the `try/catch` block so it runs for BOTH the successful-load branch AND the fallback-default branch. This means even a corrupt-state fallback is guaranteed to produce clean output — defense in depth for the "state.json was mutated by an older build" case.

## Rust command — signature and pattern

```rust
#[tauri::command]
pub fn kill_legacy_right_sessions(project_names: Vec<String>) -> Result<Vec<String>, String>
```

**Sanitizer (matches 5 existing pty.rs call sites, lines 64, 422, 518, 585, 615):**
```rust
let sanitized: String = name
    .chars()
    .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
    .collect::<String>()
    .to_lowercase();
if sanitized.is_empty() { continue; }
```

**Error handling vs `cleanup_dead_sessions`:**
- `cleanup_dead_sessions` uses `.map_err(|e| e.to_string())?` on the OUTER `tmux list-sessions` call and short-circuits to `Ok(vec![])` when the command returns non-zero (no tmux server). The INNER kill calls swallow failure via `let _ = ...`.
- `kill_legacy_right_sessions` swallows failure at BOTH levels: per the T-20-09 mitigation (never block startup), even a missing `tmux` binary (`Command::new("tmux")` returning `Err`) simply means the loop continues with no side effect. The function signature still returns `Result<_, String>` to match the existing handler shape, but the `Err` branch is unreachable by construction.

**Registration diff in `src-tauri/src/lib.rs`:**
```rust
// line 15 use-list:
use terminal::pty::{
    ack_bytes, check_tmux, cleanup_dead_sessions, destroy_pty_session,
    get_agent_version, get_pty_sessions,
    kill_legacy_right_sessions,  // +++
    resize_pty, send_literal_sequence, spawn_terminal, write_pty, PtyManager,
};

// line ~135 generate_handler!:
cleanup_dead_sessions,
kill_legacy_right_sessions, // Phase 20 D-19 migration   +++
```

## `rightBottomTab` call sites still in the codebase

Per plan directive "Do NOT modify right-panel.tsx here", these remain for Plan 20-04:

| File | Lines | Use |
|---|---|---|
| `src/components/right-panel.tsx` | 8 | `import { rightBottomTab } from '../state-manager'` |
| `src/components/right-panel.tsx` | 34–36 | Guard `!RIGHT_BOTTOM_TABS.includes(rightBottomTab.value)` fallback |
| `src/components/right-panel.tsx` | 143 | `activeTab={rightBottomTab}` |
| `src/components/right-panel.tsx` | 144 | `onSwitch={(tab) => { rightBottomTab.value = tab; }}` |

**Impact:** `pnpm exec tsc --noEmit` currently emits one error:
```
src/components/right-panel.tsx(8,23): error TS2724: '"../state-manager"' has no exported member named 'rightBottomTab'. Did you mean 'rightTopTab'?
```
This is by design. Plan 20-04 removes `right-panel.tsx` entirely (it becomes the new RightPanel component built around `TerminalTabs({scope:'right'})`), which eliminates the only consumer. `grep -rn "rightBottomTab" src/ --include="*.ts" --include="*.tsx"` will return zero hits after Plan 04 commits.

## Decisions Made

- **Placed migration BEFORE signal restoration** (see "Migration block placement" above) — slight improvement on the plan's suggested ordering for defensive safety.
- **Kept a breadcrumb comment** at the removed `rightBottomTab` site. Plan suggested this; followed.
- **Updated the `state-manager.test.ts` imports in the Task 1 commit** (not Task 3). Reason: removing the signal makes the existing test import fail immediately, so repairing the imports is part of Task 1's "make GREEN" scope, not a Task 3 concern. Task 3's commit adds new tests only.
- **Created `deferred-items.md` for the phase** — the previously-noted Plan 04 handover (rightBottomTab call sites) and the file-tree full-suite vitest timeout both needed a home. Phase 20 did not have this file yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test imports in Task 1 instead of only Task 3**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Plan's Task 1 action list does not mention updating `state-manager.test.ts` imports. But removing the `rightBottomTab` export from `state-manager.ts` immediately breaks `state-manager.test.ts`'s import line — and Task 1's verify step (`pnpm test -- --run src/state-manager.test.ts`) cannot pass until that import is fixed. The test file is in scope for this plan (Task 3 modifies it), so the fix is in-plan.
- **Fix:** Dropped `rightBottomTab` from the import and removed `rightBottomTab.value = 'Bash'` from the `beforeEach` signal-reset block, inside the Task 1 GREEN commit.
- **Files modified:** `src/state-manager.test.ts` (2 lines)
- **Verification:** `pnpm test -- --run src/state-manager.test.ts` exits 0 (17/17).
- **Committed in:** `bd0bc72` (Task 1 commit).

**2. [Note — not a deviation, flagged per plan directive] `pnpm typecheck` fails on right-panel.tsx**
- **Found during:** Task 1 verification
- **Issue:** `pnpm exec tsc --noEmit` fails with `error TS2724` because `right-panel.tsx` still imports the removed `rightBottomTab` signal.
- **Fix:** **None applied** — the plan explicitly says "Do NOT modify right-panel.tsx here… flag the remaining call sites in the SUMMARY — Plan 04 will clean them up during the right-panel rewrite."
- **Impact:** TypeScript build is temporarily broken for the end-to-end `pnpm build` command until Plan 20-04 completes. Unit tests pass (`pnpm test -- --run src/state-manager.test.ts`), `cargo check` passes. This is a known Wave-1-to-Wave-2 handover condition.

**3. [Scope Boundary — deferred] File-tree full-suite vitest timeout**
- **Found during:** Plan's `<verification>` step (`pnpm test`)
- **Issue:** `pnpm test` (full suite) times out on `src/components/file-tree.test.tsx` with "Worker exited unexpectedly".
- **Scope check:** Plan 20-03 does not touch file-tree. State-manager tests pass cleanly in isolation. This is pre-existing / unrelated.
- **Fix:** Logged to `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` per SCOPE BOUNDARY rule.

---

**Total deviations:** 1 auto-fix (Rule 3 — blocking test import repair). 2 flagged conditions documented per plan directive and scope boundary rule.
**Impact on plan:** No scope creep. Task 1's import repair was necessary to satisfy the task's own acceptance criterion. The TypeScript right-panel.tsx error is explicitly in the plan's handover contract to Plan 04.

## Issues Encountered

- **Worktree had no `node_modules`.** Ran `pnpm install` once at agent start. Expected for fresh worktrees.
- **Worktree base drift.** Initial `git merge-base HEAD <expected-base>` returned a different commit than the expected Wave 1 base. Hard-reset per `<worktree_branch_check>` protocol to `51175d4`. No work was lost because the drift occurred before any edits.
- **No `typecheck` npm script.** Project exposes `build: tsc --noEmit && vite build`. Used `pnpm exec tsc --noEmit` directly for typecheck verification.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 20-04 (right-panel rewrite) can proceed immediately.** The new AppState shape, the migration, and the Rust command are all in place. Plan 04's frontend bootstrap can call `invoke<string[]>('kill_legacy_right_sessions', { projectNames })` as specified in the plan's `<interfaces>` block.
- **Plans 20-01 and 20-02 are unaffected.** Plan 20-03 runs in Wave 1 parallel with them and shares no files.
- **Blockers for Plan 20-04:** Must remove the 4 `rightBottomTab` references in `src/components/right-panel.tsx` (or delete the file if the right-panel is fully rewritten). This is already in Plan 04's scope.

## Self-Check

Verifying the claims made in this SUMMARY before returning to the orchestrator:

**Files claimed created/modified:**
- `src/state-manager.ts` — FOUND (modified in bd0bc72)
- `src/state-manager.test.ts` — FOUND (modified in 498a6c8, bd0bc72, 74114fc)
- `src-tauri/src/terminal/pty.rs` — FOUND (modified in 7f0c428)
- `src-tauri/src/lib.rs` — FOUND (modified in 7f0c428)
- `.planning/phases/20-right-panel-multi-terminal/deferred-items.md` — FOUND (created during Task 3 wrap-up)

**Commits claimed:**
- `498a6c8` — FOUND (test RED)
- `bd0bc72` — FOUND (Task 1 feat)
- `7f0c428` — FOUND (Task 2 feat)
- `74114fc` — FOUND (Task 3 test)

## Self-Check: PASSED

---
*Phase: 20-right-panel-multi-terminal*
*Plan: 03*
*Completed: 2026-04-17*
