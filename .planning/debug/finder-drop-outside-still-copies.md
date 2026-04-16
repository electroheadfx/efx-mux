---
status: diagnosed
trigger: "When dropping a file from Finder OUTSIDE the file-tree container, a 'Drop target outside file tree' toast should appear and NO copy should happen. Instead, the file is copied to some unintended folder."
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:10:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The row hit-test in handleFinderDrop (file-tree.tsx:778-791) and the dragover handler (file-tree.tsx:748-757) check only y-axis bounds (position.y vs rect.top/rect.bottom) without checking x-axis bounds. When the user drops a file outside the file-tree panel (e.g., on the terminal in the right panel) at a y-coordinate that falls within ANY row's vertical band, the hit-test wrongly classifies the drop as being on that row, sets targetDir to that row's path, and copies the file there. The 'Drop target outside file tree' toast guard only fires when no row matches AND the cursor is outside the scroll-container bounds — but the row-match almost always wins for any cursor y that aligns with a row, so the toast guard is effectively dead code for the common outside-drop case."
  confirming_evidence:
    - "main.tsx (line 279) dispatches tree-finder-drop CustomEvent unconditionally for any drop with at least one path outside the project root, regardless of cursor x-position relative to the file-tree container."
    - "file-tree.tsx handleFinderDrop (lines 778-791) iterates rows with the y-only condition 'position.y >= rect.top && position.y <= rect.bottom' — no rect.left/right check."
    - "file-tree.tsx scrollContainerRef bounds check (lines 794-803) checks both x AND y, but only runs as a fallback when no row matched, which never happens when the cursor y aligns with a row (and rows tile the entire vertical range of the visible tree)."
    - "Same y-only hit-test pattern appears in onTreeDocMouseMove (line 436), onTreeDocMouseUp (line 463), and handleFinderDragover (line 752) — confirms shared root cause with Test 16 (intra-tree drag wrong target)."
    - "Plan 18-05 SUMMARY explicitly documents that the test suite uses jsdom zero-rects and clientY=0; no test exercises the 'cursor x outside container, y inside a row' negative case."
  falsification_test: "If the row hit-test included an x-axis check (e.g., 'position.x >= rect.left && position.x <= rect.right'), then a drop with cursor.x outside the file-tree panel could not match any row, would fall through to the scroll-container bounds check, see that the cursor is outside the container, and toast 'Drop target outside file tree'. Adding a console.log before line 781 to print position.x and each row's rect.left/right would directly demonstrate that position.x is outside every row's x-range when dropping in the terminal panel."
  fix_rationale: "Add an x-axis guard to the row hit-test in handleFinderDrop (and the same guard to handleFinderDragover and the intra-tree onTreeDocMouseMove/onTreeDocMouseUp handlers). Specifically, change 'position.y >= rect.top && position.y <= rect.bottom' to 'position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom'. This makes the hit-test a proper 2D rectangle test and ensures that drops outside the row's horizontal extent fall through to the scroll-container bounds check, which already correctly distinguishes inside-vs-outside via 2D bounds and toasts when outside."
  blind_spots: "Did not run the app live (find_root_cause_only mode) — diagnosis is based purely on code reading. Did not directly read the Tauri Rust event payload to confirm payload.position.x is in physical pixels (DPR correction is applied in main.tsx — Plan 18-05 SUMMARY documents this — but if the actual DPR or input units differ in production, the calculation could be off by a factor). Did not verify whether the row's getBoundingClientRect actually spans the full container width (it should, as rows are 'display: flex' with no max-width, but a CSS regression could narrow them). Did not investigate how Test 16 was reported — assuming it shares this root cause based on the symptom description in <context>."

hypothesis: [resolved — see reasoning_checkpoint above]
test: [resolved — code-trace produced direct evidence]
expecting: [resolved — root cause confirmed]
next_action: Return ROOT CAUSE FOUND to caller; gap-closure plan should add x-axis guards to all four hit-tests in file-tree.tsx

## Symptoms

expected: "When a file is dropped from Finder OUTSIDE the file-tree container, the UI should show a 'Drop target outside file tree' toast and NO copy operation should occur."
actual: "When a file is dropped outside the file-tree container, the file is copied to some unintended folder (likely the scroll container's project root or a random row based on miscalibrated coordinates). Subsequent per-file `git revert` on the unintended file fails with an error."
errors: "git revert" error (specific message not captured during UAT)
reproduction: "Phase 18 UAT Test 17. Drag file from Finder, release outside the file tree container. Observe the file is copied into an unintended folder. Attempt per-file revert from git tab -> error."
started: "Phase 18 UAT (2026-04-16) - DATA INTEGRITY ISSUE"

## Eliminated

<!-- populated during investigation -->

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: src/main.tsx onDragDropEvent subscriber (lines 260-296)
  found: Bootstrap dispatches `tree-finder-drop` CustomEvent unconditionally for any drop where `anyOutside === true` (i.e., at least one path is outside the project root). NO check whether the drop position is inside or outside the file-tree scroll container. Position is sent to file-tree via `detail.position` after DPR correction (`payload.position.x / dpr, payload.position.y / dpr`).
  implication: main.tsx delegates ALL outside-container detection to file-tree.tsx handleFinderDrop. There is no guard at the dispatch level.

- timestamp: 2026-04-16T00:02:00Z
  checked: src/components/file-tree.tsx handleFinderDrop (lines 768-824)
  found: The function does this in order:
    1. Iterates `[data-file-tree-index]` rows, hit-tests `position.y >= rect.top && position.y <= rect.bottom` (NOTE: y-axis only, no x-axis check).
    2. If a row matches → `targetDir = entry.is_dir ? entry.path : entry.path.replace(...)`.
    3. If NO row matches → checks scroll-container bounds (x AND y).
       - Inside container → fallback to project root.
       - Outside container → toast 'Drop target outside file tree' and return.
    4. Calls copyPath for each path with the resolved targetDir.
  implication: The "outside" toast guard only triggers when (a) no row passes the y-axis hit-test AND (b) the cursor is outside the scroll container. The hit-test against rows uses ONLY y-axis — any drop with the cursor's vertical y inside ANY row's vertical range will be classified as that row, even if the cursor's x is far outside the file-tree panel.

- timestamp: 2026-04-16T00:03:00Z
  checked: file-tree.tsx getBoundingClientRect for rows (line 781)
  found: `rect.top` and `rect.bottom` are the row's CSS-pixel y-coordinates. Rows span the full WIDTH of the scroll container (no horizontal trimming). When the user drops the file in the right panel (terminal area) or in the title bar at a vertical y that ALSO happens to be inside one of the file-tree row bands, the hit-test wrongly reports a match.
  implication: This is the SAME ROOT CAUSE family as Test 16 (Finder drop hit-test wrong target). The hit-test is half-blind: it checks y-bounds but not x-bounds. Any drop whose y falls within a row's vertical span — regardless of how far left/right of the file-tree panel — is treated as a drop on that row.

- timestamp: 2026-04-16T00:04:00Z
  checked: src/main.tsx anyOutside computation (line 279)
  found: `const anyOutside = paths.length > 0 && paths.some(p => !projectPath || !p.startsWith(projectPath));`. For a Finder drag of a file from `/Users/lmarques/Documents/foo.txt` while the active project is `/Users/lmarques/Dev/efx-mux`, the path does NOT start with the project root, so anyOutside is true → the Finder pipeline is invoked.
  implication: The inside-project filter is correct for its purpose (prevents intra-tree mouse drags from being double-handled). It does NOT prevent the outside-container drop from being processed — that is downstream's responsibility, and downstream is broken.

- timestamp: 2026-04-16T00:05:00Z
  checked: src/components/file-tree.tsx scrollContainerRef bounds check (lines 794-803)
  found: The container bounds check INCLUDES x-axis. But it only runs as a FALLBACK when no row matched. Because rows are wider than the visible "useful" file-tree band (well — rows are AT MOST the container width, but rows match on y-only), the row-hit-test almost always wins for drops along any horizontal in the window where the y aligns to a row.
  implication: The fallback block is structurally unreachable for most outside-container drops. The intended toast logic exists but is dead code in the common case.

- timestamp: 2026-04-16T00:06:00Z
  checked: src/components/file-tree.tsx onTreeDocMouseMove (line 432-447) and intra-tree onTreeDocMouseUp (line 460-473)
  found: Same hit-test pattern (`e.clientY >= rect.top && e.clientY <= rect.bottom`) — y-only. This is consistent with the intra-tree drag handlers and the Finder dragover handler.
  implication: The bug is systemic across all drop handlers in file-tree.tsx. Every cursor-vs-row hit-test in this file lacks an x-axis check. Test 16 (intra-tree drag wrong target) and Test 17 (Finder drop outside still copies) share root cause: missing x-axis guard in `[data-file-tree-index]` hit-tests.

- timestamp: 2026-04-16T00:07:00Z
  checked: 18-05-SUMMARY.md test coverage notes (line 169-176)
  found: The SUMMARY itself documents a jsdom-specific test fix where rect.bottom = 0 because jsdom returns zero-rects. The plan's tests use `clientY: 0` so the y-only hit-test on a zero-rect row passes. There is NO test that exercises the case where the cursor is at an x outside the scroll container but at a y inside a row band.
  implication: The bug was not exercised by tests. Test coverage assumes drops occur inside the container; no negative test covers "cursor is at row's y-band but x is outside container".

- timestamp: 2026-04-16T00:08:00Z
  checked: Reproduction simulation (mental trace, no live execution per find_root_cause_only mode)
  found: User drops a file in the right-panel terminal area at e.g. (cursor x=1100, y=120). The file-tree scroll container occupies x=[0..280], y=[34..900]. Row "src/" occupies y=[80..104] (24px tall). The hit-test loop iterates rows: for "src/", `120 >= 80 && 120 <= 104` is FALSE so this row is skipped. But the cursor is at y=120 — let's say row "src/components/" occupies y=[120..144]. Then `120 >= 120 && 120 <= 144` is TRUE → targetDir = '/Users/lmarques/Dev/efx-mux/src/components'. copyPath is called → file is silently copied into src/components, even though the user dropped on the terminal panel.
  implication: The "random folder" the user reports is actually whichever row's y-band happens to coincide with the cursor y at drop time. This explains the user's "random folder" wording.

- timestamp: 2026-04-16T00:09:00Z
  checked: Secondary issue — git revert error on the unintended copy
  found: When copyPath creates a NEW untracked file, `git revert <commit>` fails because: (1) the file is untracked (not a tracked change to revert), (2) `git revert` operates on commits, not files. The user likely tried per-file revert from the git tab. The right tool would be `git clean -f <file>` for an untracked file, or removing the file directly. Without seeing the git tab implementation, I cannot fully confirm this is the same root cause as Test 18 (revert button broken on untracked files), but the pattern matches: per-file revert in the UI does not handle untracked files correctly.
  implication: Secondary issue is consistent with Test 18 hypothesis (handled by other agent). Not a separate root cause; flag and move on.

## Resolution

root_cause: |
  The row-vs-cursor hit-test in handleFinderDrop (file-tree.tsx:778-791) checks ONLY y-axis bounds (`position.y >= rect.top && position.y <= rect.bottom`) without checking x-axis bounds. When the user drops a file from Finder anywhere in the application window — including the terminal panel, title bar, right panel, or any region OUTSIDE the file-tree scroll container — at a y-coordinate that happens to fall within ANY row's vertical band, the hit-test wrongly classifies the drop as being on that row. `targetDir` is set to that row's path (or its parent if it's a file), and `copyPath` is invoked, silently copying the file into a "random" folder (whichever row's y-band coincided with the cursor's y).

  The intended `'Drop target outside file tree'` toast guard exists at file-tree.tsx:794-803 and DOES check both x AND y bounds against the scroll-container rect — but it only runs as a fallback when no row matched. Because rows tile the entire vertical span of the visible tree, a cursor y aligned with any row will always match a row first, and the fallback toast is structurally unreachable for the common outside-drop case.

  Same root cause as Test 16 (Finder drop hit-test wrong target). The bug is systemic: identical y-only hit-tests appear in onTreeDocMouseMove (line 436), onTreeDocMouseUp (line 463), handleFinderDragover (line 752), and handleFinderDrop (line 781). All four need an x-axis guard.

  Plan 18-05 SUMMARY documents that Vitest tests use jsdom zero-rects with `clientY: 0`, so the y-only hit-test trivially matched the first row in tests. No negative test exercised "cursor x outside the container, y aligned with a row" — which is the exact failing case in production.

  Secondary symptom (`git revert` error on the unintended file) is a downstream consequence: the unintended copy creates an untracked file, and per-file `git revert` does not handle untracked files. Likely the same root cause as Test 18 (revert button broken on untracked files) — flagged for the other agent.

fix: |
  [Not applied — find_root_cause_only mode. Recommended direction:]

  Add x-axis guard to all four hit-tests in src/components/file-tree.tsx:

  - Line 436 (onTreeDocMouseMove, intra-tree drag highlight)
  - Line 463 (onTreeDocMouseUp, intra-tree drag drop)
  - Line 752 (handleFinderDragover, Finder drop highlight)
  - Line 781 (handleFinderDrop, Finder drop target resolution)

  Change `position.y >= rect.top && position.y <= rect.bottom` to `position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom` (and same change for the intra-tree handlers using `e.clientX/Y`).

  Add at least 2 negative tests:
  1. tree-finder-drop with `position.x` outside the scroll-container's right edge (mock `getBoundingClientRect` to return realistic non-zero rects) → expect 'Drop target outside file tree' toast and NO copyPath invocation.
  2. tree-finder-dragover with the same outside-x position → expect no row highlight applied.

verification: [Not yet verified — fix pending in gap-closure plan]
files_changed: [Not yet changed — diagnose-only mode]
