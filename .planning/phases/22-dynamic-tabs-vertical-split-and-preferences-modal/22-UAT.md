---
status: complete
round: 3
phase: 22-dynamic-tabs-vertical-split-and-preferences-modal
source: [22-01-SUMMARY.md, 22-02-SUMMARY.md, 22-03-SUMMARY.md, 22-04-SUMMARY.md, 22-06-SUMMARY.md, 22-07-SUMMARY.md, 22-08-SUMMARY.md, 22-09-SUMMARY.md, 22-10-SUMMARY.md, 22-11-SUMMARY.md, 22-12-SUMMARY.md, 22-13-SUMMARY.md]
started: 2026-04-18T19:08:47Z
round_1_completed: 2026-04-18T20:00:00Z
round_2_completed: 2026-04-19T07:01:34Z
round_3_completed: 2026-04-20
updated: 2026-04-20
---

## Current Test

Round 3 UAT completed. All regressions and issues resolved. Phase 22 is **COMPLETE**.
(I-4 deferred to Phase 23 — tmux cell-gap.)

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Efxmux dev instance. Launch app from scratch (pnpm tauri dev). App boots without errors, window renders, no console errors during bootstrap.
round_1: issue (`unknown terminal scope: right` unhandled rejection)
round_2: pass
closed_by: 22-06
re_tested: 2026-04-19 – PASS

### 2. First-Launch Defaults (New Project)
expected: Open a project that has never been opened before in Efxmux. Main panel shows a single terminal tab named "{project}" (Terminal-1 equivalent). Right panel shows two tabs: GSD and File Tree.
round_1: issue (blocker — right sidebar empty, split persisted globally)
round_2: pass
closed_by: 22-07
re_tested: 2026-04-19 – PASS

### 3. Titlebar Preferences Button Visible
expected: Look at titlebar right side. Settings (gear) icon button visible next to the add-tab (+) button. 18x18px size, matches titlebar aesthetic.
round_1: pass
round_2: pass

### 4. Click Preferences Button
expected: Click the Settings gear button in titlebar. Preferences panel opens (modal or overlay).
round_1: pass
round_2: pass

### 5. Cmd+, Opens Preferences
expected: With any focus, press Cmd+, keybind. Same preferences panel opens as clicking the button.
round_1: pass
round_2: pass

### 6. Titlebar Drag Still Works
expected: Click and drag an empty area of the titlebar (not on a button). Window moves as expected — prefs button click does not hijack drag. Also covers the 4 sub-issues user surfaced in Round 1.
round_1: issue (major — 4 sub-issues a/b/c/d on tab drag behavior)
round_2: regression
reported_round_2: |
  R-5: After moving a tab to another pane/split, the moved tab is NOT activated — user must click it again to see content. Contradicts plan 22-13's cross-scope-move success claim. The move lands the tab in the target scope but activation is not fired on the receiver side. Only partial coverage of R1 sub-issue (a).
  I-2: Split creation from main-last routes to right sidebar if right has <3 splits. Splits should be created ONLY in the focused pane. This is separate from test 6 but surfaced during the same exercise.
severity: blocker
closed_by: (partial) 22-13
residual: true

### 7. GSD Tab is Dynamic (Closeable)
expected: Hover over the GSD tab in the right panel. Close (×) button appears. GSD is no longer "sticky" — it renders as a regular dynamic tab. Plus menu works. Label is "GSD".
round_1: issue (major — 4 sub-issues: plus-menu, label wrong, can't drop on empty pane, can't move between panes)
round_2: regression
reported_round_2: |
  R-7: GSD tab still shows label "Git Changes" instead of "GSD". Directly contradicts plan 22-09's "three-way label swap in renderTab" success claim. The fix did not land or a second renderer path is taking precedence.
  R-6: Cannot close GSD tab. Close button is inactive / routes to nothing. Directly contradicts plan 22-09's "wire missing close handlers" claim.
  I-9: Cannot reorder GSD pane within the tab bar.
severity: blocker
closed_by: (claimed) 22-09 — CONTRADICTED
residual: true

### 8. File Tree Tab is Dynamic
expected: File Tree tab in right panel also shows close button on hover. Behaves like any other tab (draggable, closeable). Label is "File Tree".
round_1: issue (major — close inactive, label wrong, not reorderable)
round_2: regression
reported_round_2: |
  R-8: File Tree tab still shows label "Git Changes" instead of "File Tree". Contradicts plan 22-09's label fix.
  R-6 (shared with test 7): Cannot close File Tree tab. Contradicts plan 22-09's wire-missing-close-handlers claim.
  I-9 (shared with test 7): Cannot reorder File Tree pane within the tab bar.
severity: blocker
closed_by: (claimed) 22-09 — CONTRADICTED
residual: true

### 9. Split Icon in Tab Bar
expected: Each tab bar (main panel and right panel) shows a split icon (Rows2, horizontal bars icon). Resize handle drags actually move panes. Tab bar has visible top border. Split icon has visible right margin.
round_1: issue (major — resize broken, no top border, icon flush to right)
round_2: issue (partial pass with fresh regression)
reported_round_2: |
  I-3: Intra-zone resize resets visually during drag — offset jumps instead of tracking from the drag origin. Plan 22-11 claims the drag handler mutates pane inline heights; user reports the offset is computed from the wrong origin so the panes snap back/jump mid-drag rather than tracking smoothly.
  (Top border + icon margin from 22-11 appear to have landed.)
severity: major
closed_by: (partial) 22-11
residual: true

### 10. Split Creates Second Sub-Scope
round_1: pass
round_2: pass

### 11. Split Cap at 3 Panes
round_1: pass
round_2: pass

### 12. Intra-Zone Resize Handle
expected: Between the stacked split panes, a horizontal drag handle exists. Drag it up/down → panes resize proportionally.
round_1: issue (major — resize broken)
round_2: issue (same class of bug as I-3 above)
reported_round_2: |
  I-3 (shared with test 9): Drag tracks from the wrong origin; visual offset resets during the drag. Re-testing reveals the fix from 22-11 did not fully close this; the CSS var is written but the user-facing drag feel is still broken.
  I-4: With 2 splits where top is a terminal, the second split shows a 9px rectangle at its top border (looks like an x-scrollbar artifact). When both splits contain files, this does not happen. Terminal-on-top state has a layout glitch.
  I-4 closed: tmux cell-gap issue — deferred to Phase 23 (cell-perfect terminal resize). Accepted as known limitation.
severity: major
closed_by: (partial) 22-11
residual: true

### 13. Split Ratio Persists on Restart
expected: Resize split panes to a specific ratio (e.g. 70/30). Close app. Relaunch. Split ratio restored to 70/30.
round_1: blocked (by broken resize)
round_2: blocked
reason: "Cannot meaningfully verify persistence while I-3 (drag offset bug) is present — user cannot establish a reliable starting ratio to measure restoration. Re-test after I-3 is fixed."
round_3: pass (confirmed fixed 2026-04-20)
closed_by: verified fixed — restoreActiveSubScopes validates ratio count matches scope count, spawnSubScopeForZone persists even ratios

### 14. Cross-Scope Drag of GSD Tab
expected: Drag GSD tab from right panel to main panel tab bar. GSD moves to main panel. Right panel no longer shows GSD.
round_1: issue (major — not draggable; user-select hijacked)
round_2: regression
reported_round_2: |
  R-11: When a file tab is open in main and the user activates a terminal in a sidebar split, the file content DISAPPEARS from the main window. Cross-scope activation has an unintended side-effect on main-panel rendering. This is a fresh regression surfaced during cross-scope exercising (adjacent to test 14's scope).
severity: blocker
round_3: pass (confirmed fixed by user 2026-04-19)
closed_by: verified fixed
residual: false

### 15. Shared Tab Counter (Sequential Names)
expected: Click + on main panel tab bar to spawn new terminals repeatedly. Session names increment sequentially per project: {project}, {project}-2, {project}-3, {project}-4 — not restarting per scope. Plus routing goes to the clicked scope.
round_1: issue (major — 15a monotonic OK/decision; 15b routing broken)
round_2: issue
reported_round_2: |
  I-1: Agent + Terminal tabs are not independent in ordering. Cannot reorder them separately; other tab kinds can't move between Terminal tabs. This is a tab-kind-isolation bug not fully addressed by the gap-closure batch.
  I-2: Split creation from main-last routes to right sidebar if right has <3 splits. Splits should be created ONLY in the focused pane. Regression from 22-12 scope-routing: the `+` vs split-icon paths disagree about originating scope.
severity: major
closed_by: (partial) 22-12
residual: true

### 16. Tab Counter Persists Across Restart
expected: Spawn tabs until counter hits e.g. {project}-4. Close app. Reopen. Spawn a new tab → it becomes {project}-5 (counter continues, does not restart). Tabs themselves persist.
round_1: issue (blocker — tabs lost on restart; deletes not persisted; last-deleted auto-recreates)
round_2: regression
reported_round_2: |
  R-10: Tabs are NOT preserved across quit/run; active tab focus is lost on main window after restart. Directly contradicts plan 22-08's "per-mutation persistence" claim. The write path may be in place but either the restore path is not reading it correctly, or the per-scope writes are being overwritten by a subsequent bulk save.
round_3: pass (confirmed fixed 2026-04-20)
severity: blocker
closed_by: verified fixed — suppressEditorPersist moved before loadAppState, restoreNonTerminalActiveTabId added
residual: false

### 17. Legacy State Migration (Silent)
round_1: skipped (no legacy state)
round_2: skipped (still no legacy state)

### 18. Split-Pane Bodies Preserve State
expected: In main panel, open an editor tab and scroll it. Split main panel. Original pane (top) preserves editor content + scroll position (xterm/CodeMirror always-mounted — no reload).
round_1: issue (major — first-open blank; no unsplit)
round_2: issue
reported_round_2: |
  Unsplit (close-split) control now exists — 22-10 shipped closeSubScope and that appears present.
  R-11 (cross-scope activation erasing main content) is now FIXED (verified 2026-04-19).
  Remaining: unsplit control exists (22-10), state preservation testable now that R-11 is resolved.
severity: major
closed_by: (partial) 22-10
residual: true

## Summary (Round 2)

total: 18
passed: 5
issues: 4
regressions: 5
pending: 0
skipped: 1 (test 17, no legacy state available)
blocked: 1 (test 13, resize-bug-dependent)

Net delta vs Round 1 (passed: 5, issues: 11, blocked: 1, skipped: 1):
- Tests 1, 2 moved from issue → pass (gap-closures actually landed: cold-start, first-launch).
- Tests 6, 7, 8, 14, 16 moved to **regression** — the gap-closure plans claimed closure, but user re-test shows the claimed fixes did not hold or introduced different bugs.
- Tests 9, 12, 15, 18 remain as issues (reduced scope vs Round 1 but not cleared).

## Gaps (Round 2 Status)

- truth: "User can close/merge a split pane; editor body state is preserved across split operations"
  round_1: failed
  round_2: partial
  closed_by: 22-10 (closeSubScope + close-split button)
  residual_round_2: "R-11 blocks state-preservation claim — cross-scope activation erases main-panel content"

- truth: "Tab add/delete persists across restart (tabs stay added, deletes stay deleted)"
  round_1: failed
  round_2: failed
  claimed_closed_by: 22-08
  contradiction: "R-10 — tabs are not preserved across quit/run; active tab focus is lost on restart"

- truth: "+ click routes new terminal to the originating scope, not always main-0"
  round_1: failed
  round_2: partial
  closed_by: 22-12 (scope routing for +-menu)
  residual_round_2: "I-2 — split creation (NOT +-menu) still routes to wrong zone when main-last triggers split with right <3 splits"

- truth: "Split icon usable: split/unsplit works, panes resizable via intra-zone handle, tab bar visually distinct from background, split icon has right breathing room"
  round_1: failed
  round_2: partial
  closed_by: 22-11 (top border + icon margin landed)
  residual_round_2: "I-3 — drag offset origin bug; I-4 — 9px rectangle artifact above terminal-over-file splits"

- truth: "File Tree tab: closeable, renders with 'File Tree' title, reorderable among terminal/TUI tabs"
  round_1: failed
  round_2: failed
  claimed_closed_by: 22-09
  contradiction: "R-6 (cannot close File Tree tab), R-8 (label still 'Git Changes'), I-9 (cannot reorder)"

- truth: "GSD tab: opens via plus-menu, renders with 'GSD' title (not 'Git Changes'), and moves freely across panes"
  round_1: failed
  round_2: failed
  claimed_closed_by: 22-09
  contradiction: "R-7 (label still 'Git Changes'), R-6 (cannot close GSD tab), I-9 (cannot reorder)"

- truth: "File-tree click opens file, tabs are reorderable, cross-pane drop works, and failed drops default to appending"
  round_1: failed
  round_2: partial
  closed_by: 22-10 (file-tree click activation), 22-13 (append-last fallback, editor reorder)
  residual_round_2: "R-5 — after moving a tab to another pane, the moved tab is NOT activated (user must click again)"

- truth: "App boots without errors or unhandled promise rejections during cold start"
  round_1: failed
  round_2: closed
  closed_by: 22-06

- truth: "First-launch defaults: main-0 has Terminal-1; right-0 shows GSD + File Tree"
  round_1: failed
  round_2: closed
  closed_by: 22-07

## Residuals (carried forward)

Phase 22 is NOT complete. 4 open regressions contradict prior SUMMARY claims from the gap-closure batch (R-11 verified fixed):

| # | Code | Contradicts plan | Description |
|---|------|------------------|-------------|
| ~~R-5~~ | test 6 | 22-13 | ~~Moved tab not activated on receiver scope~~ — **FIXED** (verified 2026-04-19) |
| ~~R-6~~ | tests 7, 8 | 22-09 | ~~Cannot close GSD or File Tree tabs~~ — **FIXED** (verified 2026-04-20) |
| ~~R-7~~ | test 7 | 22-09 | ~~GSD tab label still "Git Changes"~~ — **FIXED** (verified 2026-04-20) |
| ~~R-8~~ | test 8 | 22-09 | ~~File Tree tab label still "Git Changes"~~ — **FIXED** (verified 2026-04-20) |
| ~~R-10~~ | test 16 | 22-08 | ~~Tabs + active tab not preserved across quit/restart~~ — **FIXED** (verified 2026-04-20) |
| ~~R-11~~ | tests 14, 18 | (new) | ~~Activating a sidebar-split terminal erases file content in main panel~~ — **FIXED** (verified 2026-04-19) |

And 4 fresh/residual issues:

| # | Code | Description |
|---|------|-------------|
| ~~I-1~~ | test 15 | ~~Agent + Terminal tabs cannot be reordered independently~~ — **FIXED** (verified 2026-04-20) |
| ~~I-2~~ | tests 6, 15 | ~~Split creation from main-last routes to right sidebar~~ — **FIXED** (verified 2026-04-20) |
| ~~I-3~~ | tests 9, 12 | ~~Intra-zone resize drag offset resets during drag~~ — **FIXED** (verified 2026-04-20) |
| ~~I-4~~ | test 12 | ~~9px rectangle artifact above terminal-over-file splits~~ — **DEFERRED** to Phase 23 (tmux cell-gap) |
| ~~I-9~~ | tests 7, 8 | ~~GSD and File Tree tabs cannot be reordered~~ — **FIXED** (verified 2026-04-20) |

**Recommendation:** Do NOT close Phase 22. User decides between:
1. Plan a new round of targeted gap-closure (22-15..22-19) to close R-5 through R-10 and I-1..I-3, I-9.
2. Investigate whether the gap-closure batch was applied against a stale build — several R-codes directly contradict SUMMARY self-checks that claimed commits were present. Confirm the commits are on the running branch and the dev server is running the latest code.
3. Accept partial completion of Phase 22 (status: partial-with-regressions) and defer remaining work to a follow-on phase (e.g., Phase 23 — workspace-shell-hardening).
