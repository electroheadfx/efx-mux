---
phase: quick-260419-mty
verified: 2026-04-19T14:54:30Z
status: human_needed
score: 10/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run pnpm tauri dev and verify two-pane + three-pane terminal splits in main panel show no partial-row band at the bottom of any terminal pane."
    expected: "Every visible terminal row drawn edge-to-edge. Both panes (not just one) cell-aligned to tabBarH + R x cellH."
    why_human: "Cell measurement and AppKit NSWindow quantization cannot be observed programmatically — requires live xterm.js renderer in WKWebView."
  - test: "With 2+ stacked terminals, drag an intra-zone handle a few pixels and release. Observe the OTHER pane(s) re-align."
    expected: "All non-dragged panes in the zone snap to cell boundaries after onEnd fires."
    why_human: "Requires visual inspection of rendered terminal rows at drag-end — no headless equivalent."
  - test: "Drag window corner with multi-pane active. Wait ~100ms after settling. Check all panes are cell-aligned."
    expected: "Window snaps (l4c) and within 100ms both zones redistribute cell heights. No partial-row band remains."
    why_human: "Time-sensitive resize convergence and pixel-level alignment requires live hardware."
  - test: "Open DevTools Performance tab, record 5 seconds idle. Confirm no continuous style-recalc spikes."
    expected: "No layout/style activity while the app is idle — no ResizeObserver feedback loop."
    why_human: "Idle loop detection requires Chrome DevTools timeline on real app."
  - test: "Run all 15 checks from the PLAN how-to-verify section (Tasks 3 checklist)."
    expected: "All 15 pass: multi-pane alignment, drag redistribute, mixed-content, tab-switch, spawn/close, project switch, font size change, no inline height pinning, no infinite loop, l4c regressions preserved."
    why_human: "Hardware-only checkpoint covering visual pixel fidelity, l4c regressions, and real AppKit behaviour."
---

# Quick Task 260419-mty: Multi-pane Cell Alignment Verification Report

**Task Goal:** Runtime CSS-var redistribution so every stacked terminal pane height equals `tabBarH + R x cellH` for integer R. All terminal panes in split zones cell-aligned. No ResizeObserver, no pane inline height pinning from new code, no updateLayout from distributeCells.

**Verified:** 2026-04-19T14:54:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pane-distribute.ts` exports `computeTargetRows` (pure) + `distributeCells(zone)` | VERIFIED | Both `export function` declarations present at lines 53 and 143 of `src/window/pane-distribute.ts` |
| 2 | `pane-distribute.test.ts` covers edge cases under `describe('computeTargetRows — pure math')` | VERIFIED | File exists at `src/window/pane-distribute.test.ts`; 13 specs confirmed passing via `pnpm test -- --run` |
| 3 | `distributeCells` uses ONLY `document.documentElement.style.setProperty` (no `updateLayout`) | VERIFIED | Zero `updateLayout` hits in `pane-distribute.ts`; write path at line 138 confirmed `root.style.setProperty` only |
| 4 | NO `new ResizeObserver` in new code | VERIFIED | Zero `new ResizeObserver` occurrences in all 5 touched files; comments referencing ResizeObserver are informational only |
| 5 | NO pane inline `height: Npx + flex: none` from new code | VERIFIED | The four inline mutations at drag-manager.ts lines 193-196 are in the pre-existing Phase 22 gap-closure 22-11 `onDrag` body, not from mty. New `distributeCells` writes CSS vars on `document.documentElement` only |
| 6 | `resize-increments.ts` debounce body calls `distributeCells('main')` + `distributeCells('right')` | VERIFIED | Lines 151-152 of `resize-increments.ts` inside the 100ms `setTimeout` trailing tick, after `void syncWindowIncrements(cellW, cellH)` |
| 7 | `drag-manager.ts` intra-zone `onEnd` calls `distributeCells(zone)` | VERIFIED | Line 219 of `drag-manager.ts` inside `attachIntraZoneHandles` `onEnd`, after `syncIncrementsDebounced()` |
| 8 | `sub-scope-pane.tsx` spawn + close call `requestAnimationFrame(() => distributeCells(zone))` | VERIFIED | Lines 75 and 163 of `sub-scope-pane.tsx`, both using `requestAnimationFrame` guard |
| 9 | `main.tsx` has `window.addEventListener('resize', syncIncrementsDebounced)` + per-scope `activeTabId` effect | VERIFIED | Line 254 of `main.tsx` for window listener; lines 262-275 for `effect()` subscribing all active scope `activeTabId` signals with `requestAnimationFrame` defer |
| 10 | Last pane has flex:1 — distributeCells writes vars only for i=0..N-2 | VERIFIED | `for (let i = 0; i < N - 1; i++)` loop at line 133 of `pane-distribute.ts`; SubScopePane line 298 `flex: isLast ? 1 : 'none'` |
| 11 | Multi-pane cell alignment and all 15 hardware checks pass on real hardware | HUMAN_NEEDED | Requires running `pnpm tauri dev` — cannot verify AppKit pixel quantization, live drag redistribute, or idle-loop absence programmatically |

**Score:** 10/11 truths verified (1 requires human)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/window/pane-distribute.ts` | Exports `distributeCells` + `computeTargetRows`; `measureTabBarH` cache; `classifyPane` helper | VERIFIED | Full DOM-integration body present; all helpers confirmed at file lines 22-47 |
| `src/window/pane-distribute.test.ts` | `describe('computeTargetRows — pure math')` with 13 edge-case specs | VERIFIED | All 13 pass per `pnpm test -- --run src/window/pane-distribute.test.ts` |
| `src/window/resize-increments.ts` | Extended debounce body with `distributeCells('main')` + `distributeCells('right')` | VERIFIED | Contains `distributeCells` (import at line 12, 2 call sites at lines 151-152) |
| `src/drag-manager.ts` | `attachIntraZoneHandles` `onEnd` appends `distributeCells(zone)` | VERIFIED | Import at line 8; call at line 219 inside `onEnd` |
| `src/components/sub-scope-pane.tsx` | `spawnSubScopeForZone` + `closeSubScope` each call `distributeCells(zone)` after rAF | VERIFIED | Import at line 17; `requestAnimationFrame(() => distributeCells(zone))` at lines 75 and 163 |
| `src/main.tsx` | `window.addEventListener('resize', syncIncrementsDebounced)` + per-scope `activeTabId` effect | VERIFIED | Import at line 30; listener at line 254; effect at lines 262-275 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/drag-manager.ts` | `src/window/pane-distribute.ts` | `attachIntraZoneHandles` `onEnd` calls `distributeCells(zone)` | WIRED | Import confirmed at line 8; call at line 219 after `syncIncrementsDebounced()` |
| `src/window/resize-increments.ts` | `src/window/pane-distribute.ts` | Inside 100ms debounce, after `syncWindowIncrements`, calls `distributeCells('main')` | WIRED | Import at line 12; calls at lines 151-152 inside `setTimeout` callback |
| `src/components/sub-scope-pane.tsx` | `src/window/pane-distribute.ts` | `spawnSubScopeForZone` + `closeSubScope` call `distributeCells(zone)` after `dispatchLayoutChanged` | WIRED | Import at line 17; `requestAnimationFrame` guards at lines 75 and 163 |
| `src/main.tsx` | `src/window/pane-distribute.ts` | `effect()` subscribes every active scope's `activeTabId`, calls `distributeCells` both zones on rAF | WIRED | Import at line 30; effect block lines 262-275 calls `distributeCells('main')` and `distributeCells('right')` |

---

### Data-Flow Trace (Level 4)

Not applicable — `pane-distribute.ts` is a pure DOM-mutation module (writes CSS vars) with no data-fetching layer. Data flows from `getActiveTerminalCellGeom()` (xterm private API) and `pane.offsetHeight` (live DOM) into `computeTargetRows` and then out to `document.documentElement.style.setProperty`. This is confirmed flowing correctly by the unit test results and source inspection.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 13 `computeTargetRows` specs pass | `pnpm test -- --run src/window/pane-distribute.test.ts` | PASS (13) FAIL (0) | PASS |
| Full test suite not worse than baseline (49 failing) | `pnpm test` | PASS (424) FAIL (49) — identical to baseline stated in SUMMARY | PASS |
| TypeScript clean in 5 touched production files | `pnpm tsc --noEmit` filtered to production files | Zero errors in `pane-distribute.ts`, `resize-increments.ts`, `drag-manager.ts`, `sub-scope-pane.tsx`, `main.tsx` | PASS |
| `distributeCells` imported in exactly 4 files | grep count | `resize-increments.ts`, `drag-manager.ts`, `sub-scope-pane.tsx`, `main.tsx` — exactly 4 | PASS |
| `distributeCells(` call sites: 7 total across 4 files | grep count | `resize-increments.ts` (2), `drag-manager.ts` (1), `sub-scope-pane.tsx` (2), `main.tsx` (2) = 7 | PASS |
| `new ResizeObserver` — ZERO in 5 touched files | grep | Zero matches | PASS |
| `updateLayout` — ZERO in `pane-distribute.ts` | grep | Zero matches | PASS |
| `window.addEventListener.*resize` — exactly 1 in `main.tsx` | grep | 1 match at line 254 | PASS |
| Multi-pane hardware alignment (15 checks) | `pnpm tauri dev` + visual inspection | SKIP — server not running | HUMAN_NEEDED |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| quick-260419-mty | Runtime CSS-var redistribution for multi-pane cell alignment | SATISFIED (automated) / HUMAN_NEEDED (hardware) | New module + 5 wiring sites confirmed; hardware verification pending |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/drag-manager.ts` | 193-196 | `pane.style.height = Npx; pane.style.flex = 'none'` | INFO | Pre-existing Phase 22 gap-closure 22-11 `onDrag` body — not from mty. Intentional: enables live drag feedback. Not a mty regression. |

No blockers or warnings. The noted inline style mutations are pre-existing Phase 22 behaviour that the plan explicitly preserves ("The 22-11 intra-zone drag pane.style lifecycle stays untouched").

---

### Human Verification Required

#### 1. Multi-pane terminal split cell alignment

**Test:** Run `pnpm tauri dev`, split the main panel into 2 and then 3 stacked terminal sub-scopes. Inspect the bottom edge of each terminal pane.

**Expected:** No partial-row band at the bottom of any terminal pane. Every pane height equals `tabBarH + R x cellH` for integer R (both / all panes, not just the dragged one).

**Why human:** Cell measurement requires live xterm.js renderer in WKWebView and AppKit pixel rounding — no headless equivalent.

#### 2. Intra-zone drag redistributes other panes

**Test:** With 2+ stacked terminals, drag an intra-zone handle a few pixels and release.

**Expected:** During drag, the dragged handle snaps to cell rows (l4c behaviour). On release, the OTHER pane(s) in the zone re-align so their bottom edges land on cell boundaries.

**Why human:** Requires observing rendered terminal row boundaries after drag-end — cannot be unit-tested.

#### 3. Window resize multi-pane convergence

**Test:** With 2+ stacked terminals in main, grab the window bottom-right corner and drag. Wait approximately 100ms after the drag settles.

**Expected:** Window snaps to cell multiples (l4c) AND all terminal panes in both zones re-align within the 100ms debounce window. No persistent partial-row band.

**Why human:** Requires timing observation and pixel-level visual inspection in a live macOS window.

#### 4. Idle loop check

**Test:** Open DevTools Performance tab. Record for 5 seconds while the app is idle (no drag, no resize, no typing).

**Expected:** No continuous style-recalc or layout activity. If spikes appear every frame, `distributeCells` is in a feedback loop.

**Why human:** DevTools timeline recording requires a running browser process — cannot be scripted headlessly.

#### 5. Full 15-check hardware checklist (Task 3)

**Test:** Follow all 15 verification steps in the PLAN `<how-to-verify>` section: two-pane split, three-pane split, intra-zone drag, right panel multi-pane, window resize, mixed-content, all-editor zone, tab-switch kind flip, sub-scope spawn/close, sidebar/server pane collapse, project switch, font size change, no infinite loop, l4c regression sanity, no inline height pinning on mount.

**Expected:** All 15 checks pass.

**Why human:** Covers visual pixel fidelity, macOS AppKit behaviors, and live UI interactions — none of which can be verified programmatically.

---

### Gaps Summary

No automated gaps. All 10 programmatically verifiable must-haves pass:

- `pane-distribute.ts` exists, is substantive, and exports both `distributeCells` and `computeTargetRows`
- Unit tests cover all specified edge cases and pass (13/13)
- All 4 wiring sites are present and use the correct call-site patterns
- No `ResizeObserver` in new code
- No `updateLayout` in `distributeCells`
- No pane inline height pinning from new code
- CSS var writes use `document.documentElement.style.setProperty` exclusively
- Last pane flex:1 pattern confirmed; distributeCells writes i=0..N-2 only
- Test suite not regressed (424 passing / 49 failing, matching pre-task baseline)
- TypeScript clean in all 5 touched production files

The single outstanding item (truth 11) is a hardware-only verification gate (Task 3 in the PLAN). Automated infrastructure is complete. Status is `human_needed`.

---

_Verified: 2026-04-19T14:54:30Z_
_Verifier: Claude (gsd-verifier)_
