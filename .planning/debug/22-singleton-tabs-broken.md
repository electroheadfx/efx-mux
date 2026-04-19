---
slug: 22-singleton-tabs-broken
status: resolved
trigger: Phase 22 UAT Round 2 regressions R-6, R-7, R-8 — plan 22-09 claimed to fix three-way label swap and close handlers for singleton tabs (GSD + File Tree + Git Changes), but real app exercise shows labels still wrong and close buttons missing. Tests in unified-tab-bar.test.tsx reported green.
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-singleton-tabs-broken

## Symptoms

<DATA_START>
**Expected behavior:**
- GSD tab renders with label "GSD"
- File Tree tab renders with label "File Tree"
- Git Changes tab renders with label "Git Changes"
- All three singleton kinds have a working close (X) button that removes the tab

**Actual behavior (Phase 22 UAT Round 2, real app, fresh project):**
- R-7: GSD tab shows label "Git Changes"
- R-8: File Tree tab shows label "Git Changes"
- R-6: Close button for GSD tab does nothing (or is absent)
- R-6: Close button for File Tree tab does nothing (or is absent)

**Error messages:** None — UI is silently wrong.

**Timeline:** Plan 22-09 (commit 02c6111) shipped fixes in Wave 2, merged to feature branch at 3ac9545. Tests in src/components/unified-tab-bar.test.tsx passed (4 new GREEN). UAT Round 2 (today) on fresh build + fresh project reveals labels + close broken.

**Reproduction:**
1. `pnpm tauri dev` (or equivalent clean launch) with fresh project
2. Open right panel → GSD + File Tree appear as dynamic tabs (Phase 22 first-launch default)
3. Observe GSD tab label → shows "Git Changes"
4. Observe File Tree tab label → shows "Git Changes"
5. Click close (X) on GSD or File Tree → tab does not close

**Key contradiction:**
- 22-09 SUMMARY.md line "Singleton labels + close + drag + empty-pane drop" + "Fix the three-way label swap in renderTab, wire missing close handlers for gsd + file-tree"
- 22-09 commits: 80ceb11 (tests), 02c6111 (fix), e0f59af (docs)
- Tests asserted: 7/7 GREEN including close + label tests
- User UAT: all three singleton kinds mislabeled + un-closeable

This means either:
  a) the fix was applied to a wrong code path (test mock ≠ runtime render)
  b) a later commit (22-10, 22-12, 22-13 — all touched unified-tab-bar.tsx) regressed it
  c) the render path the user sees is not the one the tests exercise
<DATA_END>

## Current Focus

- hypothesis: CONFIRMED — option (b). A later commit silently removed the 22-09 fix in `renderTab` and `closeUnifiedTab`. The test-green / UI-broken gap (option c-adjacent) also holds: the 22-09 tests assert structural presence (data-tab-id, close-span count) rather than label text or close side-effects, so they still pass even after the fix was reverted.
- test: (complete) compared `git show 02c6111:src/components/unified-tab-bar.tsx` vs `HEAD:src/components/unified-tab-bar.tsx` for the renderTab and closeUnifiedTab functions. Ran `git diff 02c6111 9d49122 -- src/components/unified-tab-bar.tsx` to prove which commit reverted the fix.
- expecting: (confirmed) a later commit removed the gsd + file-tree branches in renderTab and the gsd + file-tree close handlers in closeUnifiedTab.
- next_action: (none — root cause found, fix applied, verified)
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19T00:00:00Z
  finding: `renderTab` in `src/components/unified-tab-bar.tsx` at HEAD (lines 2089-2141 pre-fix) had branches only for `tab.type === 'terminal'`, `tab.type === 'editor'`, and an unconditional else branch that set `label = 'Git Changes'`. Tabs with `type === 'gsd'` or `type === 'file-tree'` fell into the else branch and were labeled "Git Changes".
  source: Read src/components/unified-tab-bar.tsx lines 2076-2141 (pre-fix).

- timestamp: 2026-04-19T00:00:01Z
  finding: `closeUnifiedTab` in `src/components/unified-tab-bar.tsx` at HEAD (lines 989-1112 pre-fix) had handlers only for terminal tabs (lines 1000-1041), right-owned git-changes (lines 1046-1057), editor tabs (lines 1061-1102), and main-owned git-changes (lines 1104-1111). There was no handler for `tab.type === 'gsd'` or `tab.type === 'file-tree'`. Since `allTabs` (lines 223-235) does NOT include gsd or file-tree tabs, the lookup on line 990 returned undefined, the terminal and right-owned-git-changes short-circuits didn't match, and control reached `if (!tab) return;` on line 1059 → silent no-op.
  source: Read src/components/unified-tab-bar.tsx lines 223-235, 989-1112 (pre-fix).

- timestamp: 2026-04-19T00:00:02Z
  finding: Commit 02c6111 (the 22-09 fix) DID add the correct branches: `renderTab` got explicit `tab.type === 'gsd'` and `tab.type === 'file-tree'` branches with labels "GSD" and "File Tree" respectively; `closeUnifiedTab` got explicit gsd + file-tree handlers routing through the scope registry.
  source: `git show 02c6111:src/components/unified-tab-bar.tsx` lines 1702-1707 (closeUnifiedTab gsd branch), 1974-1985 (renderTab gsd + file-tree branches). Verified by `git show 02c6111 -- src/components/unified-tab-bar.tsx`.

- timestamp: 2026-04-19T00:00:03Z
  finding: Those branches were GONE at HEAD prior to this fix.
  source: `grep -c "Phase 22 gap-closure (22-09)" src/components/unified-tab-bar.tsx` returns 3 at commit 02c6111, and 0 at 9d49122, 1202c8f, a339b75, HEAD (pre-fix).

- timestamp: 2026-04-19T00:00:04Z
  finding: The commit that silently reverted the fix is **9d49122 (feat(22-10))**. Its commit message advertises only additions (closeSubScope helper, close-split button, first-open file-tree activation), but `git diff 02c6111 9d49122 -- src/components/unified-tab-bar.tsx` reveals DELETION hunks at ~line 1041-1077 (closeUnifiedTab gsd/file-tree branches) and ~line 1971 (renderTab gsd/file-tree branches). The 22-10 commit was almost certainly authored against a pre-22-09 parent and then applied without rebasing on top of 22-09, clobbering the 22-09 diff when merged/replayed.
  source: `git diff 02c6111 9d49122 -- src/components/unified-tab-bar.tsx`.

- timestamp: 2026-04-19T00:00:05Z
  finding: Why tests still passed (the systemic "test-green / UI-broken" gap): the 22-09 RED tests only assert structural presence, not observable behavior:
    1. `queryTabIds(container)` merely checks that a DOM node with `data-tab-id="gsd"` or `data-tab-id="file-tree-..."` exists (lines 766-782 of unified-tab-bar.test.tsx). The label text is never asserted.
    2. The close test (line 784) asserts `container.querySelectorAll('span[title="Close tab"]').length > 0` — the × span IS still rendered on every tab (including when handler is broken). No test clicks it and asserts the tab disappears.
    3. There is no test that asserts `screen.getByText('GSD')` or `screen.getByText('File Tree')` when a dynamic GSD/File Tree tab is rendered in a pane (the only GSD/File-Tree label test at line 96 dates from Plan 20-02 when those labels were produced by a separate sticky-tab render path that no longer exists).
  This structural-only testing pattern is the broader cause of the "test-green / UI-broken gap" noted for plans 22-08 persistence, 22-13 drop-activation, and 22-11 resize: each asserts rendering of data attributes / DOM nodes without asserting user-observable effects (label text, tab disappearance, persisted state round-trip).
  source: Read src/components/unified-tab-bar.test.tsx lines 96-115, 730-795.

## Eliminated

- Hypothesis (a) — "fix applied to wrong code path": REJECTED. The fix at 02c6111 patches the exact `renderTab` and `closeUnifiedTab` functions used in the UnifiedTabBar render tree. The test file imports these same functions. The fix was correct; it simply isn't in HEAD.
- Hypothesis (c) — "render path user sees ≠ render path tests exercise": PARTIALLY REJECTED. Both the UI and tests render through the same `renderTab` function (verified by line 1897: `const rendered = renderTab(tab, isActive, handleTabClick, handleClose, scope);`). However, a weaker form of (c) is TRUE as a secondary cause: the tests do not exercise the code path in a way that would detect a label regression or a broken close handler, which is why the 22-10 silent revert went unnoticed.

## Resolution

- root_cause: Commit 9d49122 ("feat(22-10)") silently reverted plan 22-09's fix to `renderTab` (which added explicit `tab.type === 'gsd'` and `tab.type === 'file-tree'` branches with correct labels + icons) and to `closeUnifiedTab` (which added scope-registry-routed close handlers for gsd + file-tree tabs). The 22-10 diff documents only additions in its commit message, but the actual diff deletes the 22-09 hunks — consistent with 22-10 being authored against a pre-22-09 base and then applied without rebasing. The systemic pattern: plan 22-09's tests assert only structural presence (data-tab-id attributes, close-span count), not the observable label text or close behavior, so the regression passed CI silently.
- fix: Re-applied the 22-09 hunks on top of HEAD and added behavior-asserting regression tests. In `src/components/unified-tab-bar.tsx`: (1) re-added explicit `else if (tab.type === 'gsd')` and `else if (tab.type === 'file-tree')` branches inside `renderTab` before the git-changes catch-all, using `ListChecks` and `FolderOpen` icons respectively (both already imported); (2) re-added gsd and file-tree close handlers in `closeUnifiedTab` before the `if (!tab) return;` short-circuit, routing through the scope registry (clear `owningScope`.activeTabId + `activeUnifiedTabId` if pointing at the closed tab, null out `gsdTab.value` / filter `fileTreeTabs.value`, scrub scoped tab order). Both patches are lifted verbatim from commit 02c6111 with an updated comment marker "22-09, re-applied 22-14 after 22-10 silent revert" to make future reverts visible in grep. In `src/components/unified-tab-bar.test.tsx`: added 4 behavior-asserting regression tests under `describe('dynamic sticky-removed tabs')` to close the systemic test-green/UI-broken gap — they assert `textContent.toContain('GSD')` / `.toContain('File Tree')` and that clicking × actually mutates `gsdTab.value` / `fileTreeTabs.value`.
- verification:
  - `pnpm exec tsc --noEmit` reports zero errors in `src/components/unified-tab-bar.tsx` (unrelated pre-existing scope-literal errors in `right-panel.test.tsx` and `terminal-tabs.test.ts` are untouched).
  - `pnpm exec vitest run src/components/unified-tab-bar.test.tsx` baseline was 14 failed / 60 passed (74 total). After fix: 14 failed / 64 passed (78 total) — the 4 added regression tests all pass; zero new failures. The 14 pre-existing failures reference the removed sticky-tab system from Plan 20-02 (all contain the keyword "sticky") and are orthogonal to this fix.
  - Targeted runs confirm all new behavior assertions pass: "GSD tab renders with the label text GSD" ✓, "File Tree tab renders with the label text File Tree" ✓, "clicking close (×) on GSD tab actually removes it" ✓, "clicking close (×) on File Tree tab actually removes it" ✓.
  - Runtime behavior for the three UAT regressions: (R-7) GSD tab renders with "GSD" label + ListChecks icon; (R-8) File Tree tab renders with "File Tree" label + FolderOpen icon; (R-6) clicking × on a GSD or File Tree tab routes through `closeUnifiedTab`'s re-added handlers and removes the tab + clears the owning scope's activeTabId. Not exercised via `pnpm tauri dev` per project instruction ("Please do not run the server, I do on my side").
- files_changed:
  - `src/components/unified-tab-bar.tsx` — `renderTab` at ~line 2136 (gsd + file-tree label branches re-added before git-changes catch-all), `closeUnifiedTab` at ~line 1058 (gsd + file-tree close handlers re-added before `if (!tab) return;`).
  - `src/components/unified-tab-bar.test.tsx` — 4 behavior-asserting regression tests added under `describe('dynamic sticky-removed tabs')` at ~line 795.
