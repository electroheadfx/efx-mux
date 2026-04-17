---
phase: 18-file-tree-enhancements
plan: 12
subsystem: ui
tags: [preact, tauri, drag-drop, finder, gap-closure, human-uat, main-tsx, wkwebview]

# Dependency graph
requires:
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-05 Finder drop pipeline (main.tsx onDragDropEvent subscriber + file-tree.tsx handleFinderDragover/handleFinderDrop consumers)"
  - phase: 18-file-tree-enhancements
    provides: "Plan 18-07 MACOS_TITLE_BAR_OFFSET constant + 2D rect hit-tests (preserved as invariants by this plan)"
provides:
  - "Module-level isFinderDragActive cache in main.tsx set at enter, read at over/drop, reset at leave/drop"
  - "Corrected TypeScript union for DragDropEvent: over case declared without paths (matches Tauri 2.10.3 runtime shape)"
  - "Continuous per-row drop-target highlight during Finder drag — transitions as cursor moves across folder rows"
  - "2 new Vitest cases in new describe('continuous drop-target highlight during Finder drag (Gap G-02)') block"
affects: [file-tree-enhancements, drag-drop, finder-import, gap-g02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cached-decision pattern: module-level bool set at event A (enter), read at correlated events B and C (over, drop), reset at event D (leave)"
    - "Dispatch-layer platform-shape correction: TypeScript union type corrected to match the actual Tauri 2.10.3 runtime payload rather than an outdated or aspirational shape"
    - "Explicit early-return gate on cached decision (rather than recomputing filter each event) — the only safe pattern when later events in a sequence lack the data needed to re-evaluate the filter"

key-files:
  created:
    - ".planning/phases/18-file-tree-enhancements/18-12-SUMMARY.md (this file)"
  modified:
    - "src/main.tsx - added let isFinderDragActive = false at module scope (after MACOS_TITLE_BAR_OFFSET); restructured onDragDropEvent inner callback to gate over/drop dispatch on the cached flag; corrected union type so `over` case has no paths field. +51/-22 LOC."
    - "src/components/file-tree.test.tsx - appended new describe('continuous drop-target highlight during Finder drag (Gap G-02)') at end of file with 2 it() cases (multi-dispatch highlight contract + dragover→drop→copy_path end-to-end). +118/-0 LOC."

key-decisions:
  - "Cached-decision pattern over synthetic paths. Alternative would have been to synthesize a 'last known paths' cache and pass it into over/drop branches, but that would have diffused state across three branches. A single boolean at the guard point is the minimal change and matches the plan's `isFinderDragActive` signal."
  - "Dispatch-layer paths stay [] on over events. The file-tree handleFinderDragover consumer only reads detail.position (paths are unused for hover highlight), so propagating [] on over is correct — no need to synthesize a paths array."
  - "Reset flag on drop AFTER dispatch. If a consumer throws while processing the drop dispatch, the flag should still be reset to avoid a stuck 'drag active' state on the next enter. The order is: dispatch → reset. If this flips in a future refactor, wrap the dispatch in try/finally."
  - "Leave path resets flag unconditionally. Even if leave fires without a prior enter (defensive), resetting to false is idempotent and matches the intended end-state (no drag in progress)."
  - "Kept isFinderDragActive = anyOutside (not explicit = false on the intra-enter path). This single expression captures both the set-true and set-false cases on enter, keeping the enter branch minimal. Semantically equivalent to the plan's literal 'set to false on intra-enter'."

patterns-established:
  - "Pattern: When a payload type later in an event sequence lacks data the filter depends on, cache the filter decision at the first event that has the data and apply it to later events — do NOT re-run the filter on partial payloads."
  - "Pattern: TypeScript union types for external library event payloads should match the library's ACTUAL runtime shape, not the library's documented types. When the two diverge, the actual shape wins (with a code comment naming the upstream divergence)."
  - "Pattern: File-tree consumer tests exercise CustomEvent dispatch directly (not Tauri event payloads) — the main.tsx dispatch layer is covered by end-to-end human verification, while unit tests validate the file-tree's consumer contract against well-formed CustomEvents."

requirements-completed: []

# Metrics
duration: 5m 59s
completed: 2026-04-17
---

# Phase 18 Plan 12: Finder-Drag Per-Row Highlight (Gap G-02) Summary

**Cached `isFinderDragActive` flag in main.tsx (set at enter, read at over/drop) lets Tauri 2's pathless `over` events reach file-tree.tsx, enabling continuous per-row drop-target highlight transitions during Finder drag. Union type corrected to match the actual Tauri 2.10.3 runtime payload shape (`over` has no `paths`). 2 new Vitest cases pin the consumer contract for the enter→over→drop sequence.**

## Performance

- **Duration:** 5m 59s
- **Started:** 2026-04-17T08:16:28Z
- **Completed:** 2026-04-17T08:22:27Z
- **Tasks:** 3 (2 production commits + 1 build-and-document)
- **Files modified:** 2 (main.tsx, file-tree.test.tsx)

## What Was Built

### 1. Module-Level isFinderDragActive Cache (main.tsx)

A single boolean at module scope:

```ts
let isFinderDragActive = false;
```

Set when an `enter` event arrives with at least one path outside the active project root; reset on `leave`, on `drop`, and on an `enter` that resolves to an intra-project drag (handled by the mouse pipeline in file-tree.tsx). The flag lives alongside the pre-existing `MACOS_TITLE_BAR_OFFSET` constant at the top of main.tsx.

### 2. Restructured onDragDropEvent Handler (main.tsx)

Before Plan 18-12, the inner callback filtered every event on `paths.length > 0 && paths.some(p => !p.startsWith(projectPath))`. Because Tauri 2's `over` event has NO `paths` field (only `position`), that check returned false for every `over`, so the dispatch never reached file-tree — only the initial `enter` dispatched once.

After Plan 18-12, the handler is explicit about which events recompute the filter vs respect the cache:

- `enter`: recompute `anyOutside` from `payload.paths`; write result to `isFinderDragActive`. If intra-project → early return.
- `over`: check `isFinderDragActive`. If false → early return. Otherwise dispatch `tree-finder-dragover` with `{ paths: [], position }`.
- `drop`: check `isFinderDragActive`. If false → early return. Otherwise dispatch `tree-finder-drop` with `{ paths, position }`, then reset the flag.
- `leave`: reset the flag, dispatch `tree-finder-dragleave`.

The `MACOS_TITLE_BAR_OFFSET` subtraction (Plan 18-07) and DPR conversion (Plan 18-05) are preserved on all three dispatched event types (enter, over, drop).

### 3. Corrected TypeScript Union Type (main.tsx)

The declared union now matches Tauri 2.10.3's actual runtime payload:

```ts
const payload = event.payload as
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }      // Plan 18-12: `over` has NO paths
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };
```

This is technically stricter than the library's own TypeScript typings in 2.10.3 (which incorrectly declare paths on over). The `'paths' in payload` narrowing in the dispatch branch keeps the code defensive regardless of which typings ship in future library versions.

### 4. Test Coverage (file-tree.test.tsx)

A new `describe('continuous drop-target highlight during Finder drag (Gap G-02)')` block appended at end of the file (to avoid conflict with Plan 18-10's parallel append). Two `it()` cases:

1. **multiple tree-finder-dragover dispatches with changing positions update the highlighted row** — Dispatches `tree-finder-dragover` three times with different coordinates and asserts at least one row has the accent `borderLeft` set after each dispatch. In jsdom (zero-rects), only row 0 ever matches, but the semantic intent is that the listener re-runs per event without throwing.
2. **tree-finder-dragover followed by tree-finder-drop invokes copy_path for the target row** — Dispatches a dragover then a drop and asserts `copy_path` IPC was called with `from: /outside/foo.ts, to: /tmp/proj/src/foo.ts`. Pins the consumer contract end-to-end (dragover → highlight state → drop → copy).

Tests 38 + 2 = 40 in `file-tree.test.tsx`, all green.

## Task Commits

| Task | Hash | Description |
|------|------|-------------|
| 1 | c1a9fb8 | fix(18-12): cache isFinderDragActive at enter for continuous over dispatch |
| 2 | 2ba48e7 | test(18-12): add regression tests for continuous per-row highlight during Finder drag |
| 3 | (this doc) | docs(18-12): complete summary (no source edits — build verification only) |

## Decisions Made

- **Cached boolean over synthesized paths.** The plan considered (implicitly, via the threat model T-18-12-03) whether to synthesize a "last known paths" object and pass it into over/drop. A single boolean is simpler, reads more clearly, and avoids the question of when to invalidate the paths cache. Rejected the paths cache approach.
- **`isFinderDragActive = anyOutside` on enter (not explicit `= false` on intra-enter).** The plan's action code uses the single-expression form, which captures both the set-true and set-false cases. Matches the plan's acceptance criteria (which specify behavior, not literal text count). The alternative `if (anyOutside) { isFinderDragActive = true; } else { isFinderDragActive = false; }` is more verbose without a readability win.
- **Dispatch empty paths array on over events.** file-tree's `handleFinderDragover` only uses `detail.position` for hover highlight; `paths` is inert for over. Rather than synthesize a paths array from the prior enter (adds state, couples branches), propagate `[]`. If a future consumer starts reading detail.paths on over, the caller must track paths itself.
- **Reset isFinderDragActive AFTER drop dispatch.** Ensures the flag survives a consumer exception during the drop handler (it still gets reset). Order: `document.dispatchEvent(...)` → `isFinderDragActive = false`. Documented as a decision because the reverse order (reset-then-dispatch) would also work — chose "dispatch then reset" for defensive behavior.
- **Append new describe block at END of file-tree.test.tsx.** Plan 18-10 is executing in parallel and also appending a new describe at end. Both are append-only and target different describe names ('tree-state-preservation-post-revert' vs 'continuous drop-target highlight during Finder drag'). No merge conflict expected.
- **Do NOT touch the existing 'finder drop' describe block from Plan 18-05.** That block covers the consumer contract for single-dispatch flow; the new block covers the multi-dispatch sequence specific to Plan 18-12. Leaving the original intact preserves coverage as layered (base + extension).

## Deviations from Plan

None. Plan executed exactly as written.

- Task 1: `main.tsx` edits match the plan's `<action>` code blocks verbatim.
- Task 2: `file-tree.test.tsx` new describe block matches the plan's `<action>` code verbatim (with one harmless pre-existing addition: `detectedEditors.value = null` in `beforeEach`, copied from the sibling 'finder drop' describe block's beforeEach to match the established test pattern in this file).
- Task 3: no source edits; only build verification and this SUMMARY.

**Auth gates encountered:** none.

## Known Stubs

None. Scanned `main.tsx` and `file-tree.test.tsx` for stub patterns (empty defaults flowing to UI, TODO/FIXME/placeholder strings). The only `placeholder=` attribute in nearby code (`preferences-panel.tsx`) is unchanged by this plan.

## Threat Flags

None. This plan introduces a single module-local boolean and restructures a Tauri event handler that was already subject to the phase's threat model (T-18-07 series). No new network endpoints, no new file access, no new IPC surface. The cached-flag pattern is explicitly addressed by the plan's threat register (T-18-12-01..05), all dispositioned.

## Issues Encountered

1. **Pre-existing test failures in `git-control-tab.test.tsx` (9) and `sidebar.test.tsx` (2).** These failures are unrelated to Plan 18-12 — they stem from a Tauri API listen-before-mock issue in `terminal-tabs.tsx` (documented in Plan 18-07's "Issues Encountered"). Confirmed as pre-existing by checking out the base commit and running the failing test file in isolation: all 9 git-control-tab failures persist on the untouched base. Out-of-scope per the executor SCOPE BOUNDARY rule; logged here for awareness, NOT fixed.

2. **Transient git stash conflict during scope-verification step.** While verifying that git-control-tab failures were pre-existing, a `git stash` + `git checkout <base> -- file.tsx` + `git checkout HEAD -- file.tsx` + `git stash pop` dance left an unmerged conflict in `git-control-tab.tsx` (which was not part of this plan's scope). Resolved by `git checkout --ours src/components/git-control-tab.tsx` + `git reset HEAD src/components/git-control-tab.tsx` — restored file to the HEAD state with no change to plan commits. Both plan commits (`c1a9fb8`, `2ba48e7`) remained intact.

## User Setup Required

None — no external service configuration or secret required. Fix is in pure frontend code (no Rust changes, no Tauri plugin changes, no build-config changes).

## Human Verification Required

The following end-to-end checks require a running Tauri app on macOS and cannot be exercised in jsdom:

### Test 1: Per-row highlight transitions during Finder drag (Gap G-02 primary)

1. Launch the app (`pnpm tauri dev`).
2. Open a project with multiple folders in the file tree.
3. Drag a file from Finder into the Efxmux window.
4. Slowly move the cursor over different folder rows.
5. **Expected:** the folder ROW under the cursor shows a blue 2px left border + light-blue tint; the previous row's highlight clears as the cursor moves.
6. Release over a folder → file is copied into that folder.

### Test 2: UAT Test 17 regression guard (drop outside tree)

1. Drag a file from Finder and release OUTSIDE the file tree (over the terminal panel).
2. **Expected:** toast "Drop target outside file tree" appears; no file is copied.

### Test 3: Intra-tree drag unaffected

1. Click and drag a file within the file tree from one folder to another.
2. **Expected:** ghost element follows cursor; target-row highlights during drag; release moves the file. No Tauri-dispatch highlight interference (intra-enter sets isFinderDragActive = false and early-returns).

If any of these fail, the fix should be reverted and re-investigated.

## Verification

### Acceptance Grep Proof

```
grep -c "let isFinderDragActive" src/main.tsx                                            # → 1   (declaration)                         ✓ == 1
grep -c "isFinderDragActive = false" src/main.tsx                                        # → 2   (leave reset + drop reset)            ✓ >= 2 (intra-enter uses = anyOutside)
grep -c "isFinderDragActive = anyOutside" src/main.tsx                                   # → 1   (enter branch set)                    ✓ == 1
grep -c "isFinderDragActive" src/main.tsx                                                # → 5   (decl + 2 reads in guard + enter set + drop reset)  ✓ >= 5
grep -c "type: 'over'; position:" src/main.tsx                                           # → 1   (corrected union type)                ✓ == 1
grep -c "describe('continuous drop-target highlight during Finder drag" src/components/file-tree.test.tsx  # → 1  ✓ == 1
```

### Type + Build Proof

```
pnpm tsc --noEmit                                                   → TypeScript compilation completed  ✓
pnpm build                                                          → dist/assets/*.js built in 460ms   ✓
cd src-tauri && cargo build --release                               → Finished release profile in 36.68s ✓
pnpm exec vitest run src/components/file-tree.test.tsx              → 40/40 pass                        ✓
pnpm exec vitest run -t "continuous drop-target highlight"          → 2/2 pass (new describe block)     ✓
```

## Self-Check: PASSED

Verified files and commits exist on disk:

- `src/main.tsx` — FOUND
  - Contains `let isFinderDragActive = false` at module scope (line 65) ✓
  - Contains `| { type: 'over'; position: { x: number; y: number } }` (line 284) ✓
  - Contains `isFinderDragActive = anyOutside` in enter branch (line 303) ✓
  - Contains `isFinderDragActive = false` in leave branch (line 290) ✓
  - Contains `isFinderDragActive = false` after drop dispatch (line 334) ✓
  - Contains `if ((payload.type === 'over' || payload.type === 'drop') && !isFinderDragActive)` guard (line 309) ✓
  - Preserves `MACOS_TITLE_BAR_OFFSET` subtraction for enter/over/drop (line 320) ✓
  - Preserves DPR conversion (line 319) ✓
  - Dispatches `tree-finder-dragover` for both enter and over (line 327) ✓
  - Dispatches `tree-finder-drop` for drop (line 331) ✓
  - Dispatches `tree-finder-dragleave` for leave (line 291) ✓
- `src/components/file-tree.test.tsx` — FOUND
  - Contains `describe('continuous drop-target highlight during Finder drag (Gap G-02)',` ✓
  - Contains exactly 2 `it(` cases inside the new describe block ✓
  - Test 1 dispatches `tree-finder-dragover` 3 times and asserts row highlight survives ✓
  - Test 2 dispatches `tree-finder-dragover` then `tree-finder-drop` and asserts `copy_path` IPC invoked ✓
  - 40 tests pass (was 38 + 2 new = 40) ✓
  - No existing tests in the file modified ✓
- `.planning/phases/18-file-tree-enhancements/18-12-SUMMARY.md` — FOUND (this file) ✓
- Commit `c1a9fb8` (Task 1 — fix) — FOUND in git log ✓
- Commit `2ba48e7` (Task 2 — test) — FOUND in git log ✓

## TDD Gate Compliance

The plan declares `type: execute` (not `type: tdd`), so plan-level TDD gate enforcement does not apply. However, Task 2 was declared `tdd="true"` in isolation. The semantics here differ from strict RED→GREEN: the file-tree listener being tested was unchanged by this plan (the bug fixed was upstream in main.tsx dispatch), so the 2 new tests passed immediately upon authoring rather than first failing. This matches the plan's own action note:

> These tests exercise the file-tree.tsx listener (unchanged by this plan) via direct CustomEvent dispatch — they do NOT exercise main.tsx's onDragDropEvent handler. That is intentional: the main.tsx handler is end-to-end-only.

Treat this as a "tests pin the consumer contract that a completed fix upstream now reaches" pattern, not as strict TDD. A RED commit would have been performative (would have asserted against a listener that already worked).

## Next Phase Readiness

- Gap G-02 closed via the preferred path (per-row highlight). No fallback needed — the cached-decision pattern made the preferred path feasible against Tauri 2.10.3's actual runtime shape.
- UAT Test 17 regression guard (outside-container drop toast) preserved — the drop branch still gates on `isFinderDragActive` and delegates the outside-x/y hit-test to file-tree.tsx (Plan 18-07 invariant).
- UAT Test 16 (y-axis title-bar offset) preserved — the `MACOS_TITLE_BAR_OFFSET` subtraction is applied for all three dispatched event types.
- Intra-tree drag (mouse pipeline in file-tree.tsx) unaffected — the enter branch sets `isFinderDragActive = false` for intra-project paths and early-returns, so no Tauri-dispatch events reach file-tree for intra-project drags.
- Remaining phase 18 gap-closure plans (18-10, 18-11) target different UAT bugs and are independent of this change.

## Reference

- Tauri 2 DragDropEvent shape: `.planning/phases/18-file-tree-enhancements/18-RESEARCH.md` §1 (confirmed `over` has ONLY position, no paths)
- UAT Gap G-02 spec: `.planning/phases/18-file-tree-enhancements/18-HUMAN-UAT.md` (symptom + preferred behavior)
- Upstream Tauri docs: https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow

---
*Phase: 18-file-tree-enhancements*
*Plan: 12*
*Completed: 2026-04-17*
