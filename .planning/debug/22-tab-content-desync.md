---
slug: 22-tab-content-desync
status: verifying
trigger: After persistence-chaos fixes (e6a0bf5), tabs restore but their content rendering is decoupled from activation. Clicking a tab in a sub-scope flips the tab-bar highlight but content stays stuck. Also: activating a sidebar tab erases main panel file content (R-11 from UAT).
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-tab-content-desync

## Symptoms

<DATA_START>
**Setup:**
- Right sidebar split 1 (top): Agent c + Terminal 4
- Right sidebar split 2 (bottom): Terminal 3 + Agent c
- Main: CLAUDE.md + README.md + Agent c + Terminal 3
- Last active pre-quit: right-top > Terminal 4
- Also pre-quit observation: activating right-top > Terminal 4 erased the active file in main (R-11 live)

**After restart, observed:**
- Main panel shows CLAUDE.md content correctly, CLAUDE.md tab highlighted — OK
- Right-top pane shows Terminal 4 content, but the tab BAR shows no active highlight
- Right-bottom pane shows Agent c content, but the tab BAR shows no active highlight
- User clicks right-top's "Agent c" tab — tab-bar highlight moves to "Agent c" BUT content stays on Terminal 4
- User clicks right-bottom's "Terminal 3" tab — tab-bar highlight moves to "Terminal 3" BUT content stays on Agent c
- At every sidebar tab click, main panel's CLAUDE.md content disappears (R-11 cross-scope activation bleed)

**Observations:**
1. Post-restore: scope.activeTabId signal value does NOT match what's rendered in the pane body
2. Clicking a tab updates activeTabId (tab highlight moves) but the pane body is reading from a different source OR is rendering a single static tab chosen at mount time
3. Main panel's activeTabId gets cleared/changed when a sub-scope is activated — cross-scope state bleed

**Error messages:** None in UI.

**Timeline:** Persistence bugs fixed in e6a0bf5. Previous session (22-singleton-tabs-broken) fixed label render. This symptom is new / only visible now that persistence works.

**Reproduction:**
1. Build fresh Efxmux.app with e6a0bf5+
2. Open project, create setup as above (split both sidebars, multi tabs, agent + terminal mix)
3. Quit + relaunch
4. Observe: tab-bar highlight absent in sub-scopes until clicked, pane body "frozen" on one tab, clicking tabs flips highlight only
5. Observe: main panel file content wipes when a sidebar tab is clicked
<DATA_END>

## Current Focus

- hypothesis: confirmed. UnifiedTabBar reads tab-bar highlight from the GLOBAL `activeUnifiedTabId` signal, while SubScopePane reads pane-body render from the PER-SCOPE `getTerminalScope(scope).activeTabId` signal. Post-restore, only `main-0.activeTabId` + per-scope ids are set, but `activeUnifiedTabId` is stale/unset for non-main scopes — so sub-scope tab bars show no highlight. Additionally, handleTabClick for terminal tabs (line 1878) writes the `activeTabId` top-level export (= `main-0.activeTabId` alias) AND calls `switchToTab` (= main-0 scoped), corrupting main scope's active-tab state whenever a sub-scope terminal tab is clicked — this is R-11.
- test: type-check + add failing test, then fix.
- expecting: test passes after fix.
- next_action: write reasoning_checkpoint, then apply minimal fix.
- reasoning_checkpoint:
    hypothesis: "Two bugs from a single architectural drift. (A) UnifiedTabBar.tsx line 1933 uses `currentId = activeUnifiedTabId.value` (global) to compute `isActive`, but line 1846 already correctly derived `scopeActiveId = getTerminalScope(scope).activeTabId.value` per-scope — the per-scope value is unused. The SubScopePane body reads the per-scope signal. So highlight bar and body render diverge. (B) handleTabClick for terminal tabs at unified-tab-bar.tsx:1874-1880 unconditionally writes `activeTabId.value = tab.id` and calls `switchToTab(tab.id)`. Both of those top-level exports are main-0-only aliases (terminal-tabs.tsx:853 + 863). When the clicked terminal tab lives in right-0 or any sub-scope, this scribbles main-0's activeTabId with a terminal id that doesn't belong to main-0 — so main-0's pane body hides all its editor/file-tree/gsd/git bodies (display:none because activeId !== et.id) producing the CLAUDE.md blank observed as R-11."
    confirming_evidence:
      - "unified-tab-bar.tsx:1846 computes scopeActiveId per-scope but never uses it."
      - "unified-tab-bar.tsx:1847 sets currentId = activeUnifiedTabId.value (global)."
      - "unified-tab-bar.tsx:1933 uses currentId for isActive — tab bar highlights off the global."
      - "sub-scope-pane.tsx:233-234 destructures scopeState.activeTabId, reads .value. Body render uses that per-scope id at 290, 301, 314, 327, 341."
      - "terminal-tabs.tsx:853 exports `activeTabId` = scopes.get('main-0')!.activeTabId (main-0 alias)."
      - "terminal-tabs.tsx:863 exports `switchToTab` which calls `switchToTabScoped('main-0', ...)`."
      - "unified-tab-bar.tsx:1878 sets `activeTabId.value = tab.id` inside the terminal branch — this is the main-0 alias, so clicking ANY sub-scope terminal tab corrupts main-0.activeTabId."
      - "unified-tab-bar.tsx:1879 calls `switchToTab(tab.id)` — this is main-0's switchToTab; applied to a non-main tab, it iterates main-0's tabs and hides all of them (display:none) because none match tab.id."
    falsification_test: "If the hypothesis is wrong, tab-bar highlight after restore would already be correct using currentId=activeUnifiedTabId (meaning some other code path syncs activeUnifiedTabId per-scope on restore). Verify: inspect restore path in main.tsx — only `persistEditorTabs()` + `restoreEditorTabs` write activeUnifiedTabId, and only when an editor tab matches activePath. Right-scope/sub-scope active terminal tabs do NOT propagate to activeUnifiedTabId on restore. Therefore hypothesis holds."
    fix_rationale: "Two targeted edits. (1) UnifiedTabBar.tsx: use `scopeActiveId` instead of `currentId` for `isActive`. This makes highlight track the per-scope signal, matching SubScopePane. Keep `currentId` for minimap-active check (which gates a global affordance). (2) handleTabClick terminal branch: drop the writes to `activeTabId` (main-0 alias) and `switchToTab` (main-0 alias). Use `getTerminalScope(tab.scope).switchToTab(tab.id)` which routes to the correct scope. The per-scope call already sets the per-scope activeTabId and calls switchToTabScoped(tab.scope, id). Keep `activeUnifiedTabId.value = tab.id` so save-shortcut and cross-scope persistence can find the focused tab id."
    blind_spots:
      - "There may be implicit callers relying on `activeTabId` global being sync'd (e.g. agent-header.tsx reads it to show the active label). We're not changing that signal's role — we're stopping UnifiedTabBar from writing it for non-main tabs. agent-header continues to read main-0 active, which is the correct intent."
      - "activeUnifiedTabId.subscribe on line 678 triggers persistEditorTabs. Writing activeUnifiedTabId on sub-scope terminal clicks may write a non-editor id into editor-tabs persistence — but persistEditorTabs line 570 falls through to priorActivePath when activeTab is not an editor, so this is already defensive. Will verify test."
      - "The `activeTabId.subscribe` at unified-tab-bar.tsx:250 syncs activeUnifiedTabId when it changes. After our fix, clicking a sub-scope terminal tab no longer writes `activeTabId` (main-0 alias), so this subscribe won't fire — which is correct. activeUnifiedTabId is still written directly in handleTabClick."
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19T00:00:00Z
  checked: src/components/sub-scope-pane.tsx full body
  found: |
    Line 232-234: `const scopeState = getTerminalScope(scope); const { activeTabId } = scopeState; const activeId = activeTabId.value;`
    Pane body render uses `activeId` (per-scope signal) at lines 290 (terminal-containers display),
    301 (file-tree display), 314 (gsd display), 327 (git-changes display), 341 (editor display), 350 (isActive prop).
  implication: Pane body render is driven by PER-SCOPE activeTabId.

- timestamp: 2026-04-19T00:00:01Z
  checked: src/components/unified-tab-bar.tsx UnifiedTabBar component (lines 1842-1934)
  found: |
    Line 1846: `const scopeActiveId = getTerminalScope(scope).activeTabId.value;` — computed but UNUSED.
    Line 1847: `const currentId = activeUnifiedTabId.value;` — global.
    Line 1933: `const isActive = tab.id === currentId;` — highlight uses the GLOBAL.
  implication: Tab bar highlight diverges from pane body render. Explains Bug 1 directly.

- timestamp: 2026-04-19T00:00:02Z
  checked: src/components/unified-tab-bar.tsx handleTabClick terminal branch (lines 1874-1880)
  found: |
    Line 1875: `const scopeHandle = getTerminalScope(tab.scope);`
    Line 1876: `scopeHandle.activeTabId.value = tab.id;` — correctly scoped.
    Line 1877: `activeUnifiedTabId.value = tab.id;` — global, fine.
    Line 1878: `activeTabId.value = tab.id;` — IMPORT FROM terminal-tabs, which is the main-0 ALIAS.
    Line 1879: `switchToTab(tab.id);` — IMPORT FROM terminal-tabs, main-0-only wrapper.
  implication: Clicking ANY sub-scope terminal tab unconditionally corrupts main-0.activeTabId and runs switchToTabScoped('main-0', tab.id) which iterates main-0 terminal containers and hides every one of them (because tab.id isn't a main-0 tab). This matches R-11: main panel's file/agent content vanishes.

- timestamp: 2026-04-19T00:00:03Z
  checked: src/components/terminal-tabs.tsx aliases
  found: |
    Line 853: `export const activeTabId = scopes.get('main-0')!.activeTabId;`
    Line 863-867: `export function switchToTab(tabId: string) { scopes.get('main-0')!.activeTabId.value = tabId; switchToTabScoped('main-0', tabId); persistTabStateScoped('main-0'); }`
  implication: Confirms the `activeTabId` and `switchToTab` symbols imported by unified-tab-bar are main-0-only.

- timestamp: 2026-04-19T00:00:04Z
  checked: restore path for activeUnifiedTabId (main.tsx:410-556 + unified-tab-bar.tsx restoreEditorTabs)
  found: |
    The only post-restore writer to `activeUnifiedTabId` is restoreEditorTabs (line 658: if activeFilePath match). There is NO code that sets activeUnifiedTabId per-subscope on restart based on which terminal/agent/file-tree tab was last focused in sub-scope-0..2.
  implication: After restart, non-main sub-scopes' tab-bar highlight is blank (currentId = activeUnifiedTabId.value is stale/main-only), while their bodies correctly render because per-scope activeTabId was restored by restoreProjectTabsScoped (line 740). This precisely matches the user's observation.

## Eliminated

(populated by debugger)

## Resolution

- root_cause: |
    Two independent defects in src/components/unified-tab-bar.tsx that both
    stemmed from the tab-bar using global (main-only) symbols instead of
    scope-aware ones after Phase 22's N-sub-scope refactor.

    Bug 1 (post-restore tab-bar highlight missing / clicks flip highlight
    without switching body): UnifiedTabBar computed `scopeActiveId` per-scope
    at line 1846 but then computed `isActive` on line 1933 from
    `currentId = activeUnifiedTabId.value` (a GLOBAL signal). SubScopePane's
    body render, by contrast, keyed off `getTerminalScope(scope).activeTabId`
    (per-scope). The two signals are only coincidentally in sync for the main
    scope — not for non-main sub-scopes, and not at all after restore (the
    global is written only by editor restoration and explicit writes).

    Bug 2 (R-11, main panel content wipe on sub-scope tab click): the
    terminal branch of handleTabClick wrote the top-level `activeTabId`
    export and called `switchToTab(...)` — both of those symbols are main-0
    aliases (terminal-tabs.tsx:853, 863-867). Clicking a terminal tab that
    lived in right-0/main-1/right-1 etc. overwrote main-0's activeTabId with
    a foreign id and ran switchToTabScoped('main-0', <foreign-id>), causing
    every main-0 terminal container to be hidden and the main SubScopePane's
    editor/file-tree/gsd/git-changes bodies to fail their `activeId === x.id`
    filters — so the open file (CLAUDE.md) vanished.
- fix: |
    src/components/unified-tab-bar.tsx, two targeted edits:

    1. In UnifiedTabBar's render loop, compute `isActive = tab.id === scopeActiveId`
       (per-scope) instead of `tab.id === currentId` (global). Also switch the
       minimap-affordance gate from `currentId` to `scopeActiveId` to match the
       per-scope intent documented in its own comment. `currentId` was then
       unused, so it was removed.

    2. In handleTabClick's terminal branch, stop writing the `activeTabId`
       global alias and stop calling the `switchToTab` global alias. Route via
       `getTerminalScope(tab.scope).switchToTab(tab.id)` which already sets the
       per-scope activeTabId, calls switchToTabScoped(scope, id), and persists
       the correct scope's tab state. Keep `activeUnifiedTabId.value = tab.id`
       so save shortcuts and cross-scope persistence can still find the focused
       tab id by a single signal.

    Also updated one pre-existing test that used `null` for TerminalTab.container
    (test-artifact; the tab was never actually "active" pre-fix because the
    click only corrupted main-0 which had no tabs, so container access never
    happened). Provided minimal DOM stubs so the now-scope-correct activation
    path can run.
- verification: |
    - `pnpm exec tsc --noEmit -p tsconfig.build.json` — clean.
    - Added 3 behavioral regression tests in unified-tab-bar.test.tsx
      (describe "Debug 22-tab-content-desync: per-scope highlight + cross-scope
      isolation"):
       1. "tab-bar highlight reads getTerminalScope(scope).activeTabId, NOT the
          global activeUnifiedTabId" — simulates restored state and asserts the
          per-scope active tab renders with aria-selected="true" even when
          activeUnifiedTabId is empty.
       2. "clicking a terminal tab in right-0 does NOT corrupt main-0.activeTabId
          (R-11 regression)" — sets up CLAUDE.md editor active in main-0, clicks
          a right-0 terminal tab, asserts main-0.activeTabId is unchanged.
       3. "clicking tabs across two sub-scopes keeps each scope body independent"
          — two right sub-scopes, each with 2 tabs; click in scope-1 doesn't
          leak to scope-2.
      All 3 pass post-fix.
    - Full unified-tab-bar.test.tsx: 72 passed / 14 failed. Baseline (pre-fix):
      69 passed / 14 failed. Net: +3 new passing tests, 0 regressions. The 14
      failures are pre-existing (Phase 22 sticky-tab removal, split-cap icon
      tests — all noted as known baseline failures).
    - Related test files (sub-scope-pane, right-panel, main-panel, terminal-tabs):
      identical pass/fail count vs baseline (23 failed / 38 passed — the
      baseline noted in project_notes was ~49, so figures line up).
- files_changed:
    - src/components/unified-tab-bar.tsx (handleTabClick terminal branch; UnifiedTabBar isActive + minimap gate; removed unused currentId)
    - src/components/unified-tab-bar.test.tsx (3 new regression tests + 1 test-artifact fix in pre-existing rename test)
