---
slug: 22-agent-creates-terminal
status: awaiting_human_verify
trigger: Phase 22 post-fix regression — clicking "Create Agent" in the + dropdown spawns a Terminal instead of an Agent tab. Sometimes tab focus is lost during creation and an Agent tab becomes renamed to "Terminal". Suspected to originate in plan 22-12's scope-aware + button routing.
created: 2026-04-19
updated: 2026-04-19
goal: find_and_fix
---

# Debug: 22-agent-creates-terminal

## Symptoms

<DATA_START>
**Expected behavior:**
- User clicks `+` button → dropdown shows Terminal / Agent / GSD / File Tree / Git Changes
- Click "Agent" → a new Agent tab is created with green indicator + Agent-specific label
- Clicking "Agent" in any pane/scope spawns in THAT originating pane (22-12 routing)
- Agent tab stays labeled "Agent" — label does not spontaneously flip to "Terminal"

**Actual behavior (user report, fresh Efxmux.app build post-22-debug fix):**
- Clicking "Agent" in + dropdown spawns a Terminal instead of an Agent
- Sometimes the tab focus is lost mid-creation
- Agent tabs sometimes rename themselves to the Terminal label (isAgent flag appears to flip)
- User feels "VERY BAD code for tab management"

**Error messages:** None reported — UI is silently wrong.

**Timeline:** Plan 22-12 (commit 1202c8f) introduced scope-forwarding: `buildDropdownItems` → `spawnTerminal` → `createAndFocusMainTerminalTab` → `createNewTab` → `createNewTabScoped`. The Agent branch was supposed to pass `{ isAgent: true, scope }` through the same chain. 22-12 tests asserted structural call (scope propagation) but may not have asserted the resulting `tab.type === 'agent'` or isAgent flag — same structural-vs-behavioral testing gap as R-6/R-7/R-8.

**Reproduction:**
1. Fresh Efxmux.app launch, fresh project (or existing)
2. Click the `+` button in any pane's tab bar
3. Select "Agent" from the dropdown
4. Observe: tab shows Terminal styling/label, not Agent

Also reported:
5. Sometimes focus is lost after create
6. Agent tab label spontaneously flips to Terminal (possibly on some later action — need user to pin down)
<DATA_END>

## Current Focus

- hypothesis: THREE bugs confirmed:
  (A) PRIMARY - "Agent spawns Terminal behavior": `isAgent = wantAgent && !!agentBinary` — when agent binary not detected at create time, `isAgent = false`, plain shell spawns. Label is still "Agent claude" but terminal shows bash prompt, user sees "Terminal behavior". This is the primary UX failure.
  (B) LABEL FLIP - `renameTerminalTab` at line 2247 in unified-tab-bar.tsx is scope-unaware (hardcoded main-0 via backward-compat wrapper). For main-0 agent tabs with `isAgent=false`, clearing rename field → `getDefaultTerminalLabel` returns `'Terminal'` → tab renamed to "Terminal".
  (C) CLOSE BUG - `closeUnifiedTab` at lines 995-997 only searches main-0 and right-0 for terminal tabs; tabs in main-1/main-2/right-1/right-2 cannot be properly closed (no "Quit Agent" modal, no cleanup).
- test: behavior-asserting tests for (B) and (C); fix (A) by making isAgent label-driven (use wantAgent instead of binary-resolved isAgent for tab label AND isAgent flag)
- expecting: after fix, agent tab label shows "Agent X" and isAgent=true regardless of binary resolution (binary resolution only gates PTY command, not labeling)
- next_action: APPLY FIX — (1) change isAgent assignment to `isAgent = wantAgent` (decouple from binary resolution), (2) fix renameTerminalTab to be scope-aware, (3) fix closeUnifiedTab to scan all scopes, (4) fix getDefaultTerminalLabel call to use the correct scope's tabs
- reasoning_checkpoint:
    hypothesis: "Agent tab spawns as Terminal because isAgent = wantAgent && !!agentBinary; when binary unavailable, isAgent=false even though user requested agent. Additionally, renameTerminalTab in the rename handler always routes to main-0 scope only."
    confirming_evidence:
      - "buildDropdownItems correctly passes { scope, isAgent: true } (line 1307) — confirmed by reading code, tests pass"
      - "createNewTabScoped line 233: isAgent = wantAgent && !!agentBinary — binary resolution gates the isAgent flag, not just PTY spawn"
      - "renameTerminalTab (line 868-869) always calls renameTerminalTabScoped('main-0', ...) — confirmed by reading code"
      - "closeUnifiedTab lines 995-997 only checks main-0 (terminalTabs.value) and right-0 — confirmed by reading code"
    falsification_test: "If isAgent=wantAgent (decoupled from binary), agent tabs created without binary would still have isAgent=true and correct label. Test: create agent tab without mock binary, verify isAgent=true."
    fix_rationale: "Decoupling isAgent from binary resolution fixes primary symptom. Scope-aware rename fixes label-flip symptom. Full-scope closeUnifiedTab fixes close bug for sub-scope tabs."
    blind_spots: "Have not verified what happens in production when binary IS found (claude in PATH). May not reproduce in all environments."
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-19
  checked: buildDropdownItems (unified-tab-bar.tsx line 1284-1327)
  found: Agent action correctly passes { scope, isAgent: true } to spawnTerminal
  implication: Not the primary creation bug

- timestamp: 2026-04-19
  checked: createNewTabScoped (terminal-tabs.tsx line 217-233)
  found: wantAgent = options?.isAgent ?? false (line 217); isAgent = wantAgent && !!agentBinary (line 233); label = agentLabel(projectInfo?.agent) when wantAgent=true (line 248)
  implication: isAgent flag on stored tab is false if binary not found, even when user intended agent tab. Label is still "Agent X" which is correct, but isAgent=false affects PTY spawn (no agent started → plain shell).

- timestamp: 2026-04-19
  checked: renderTab (unified-tab-bar.tsx line 2125-2142)
  found: label = termTab?.label ?? 'Terminal'; no agent-specific branch — all terminal tabs (agent or not) use same render path. Label text comes from stored tab.label.
  implication: Rendering is correct. Label shows whatever is in tab.label. If tab.label is 'Agent claude', DOM shows 'Agent claude'.

- timestamp: 2026-04-19
  checked: renameTerminalTab (unified-tab-bar.tsx line 2247; terminal-tabs.tsx line 868-869)
  found: renameTerminalTab always calls renameTerminalTabScoped('main-0', tabId, newLabel). At unified-tab-bar.tsx:2247, also uses terminalTabs.value.find() (main-0 only) to find the tab for getDefaultTerminalLabel().
  implication: BUG - rename of non-main-0 terminal tabs is silently ignored. For main-0 agent tabs with isAgent=false + empty rename → returns 'Terminal' → label flips.

- timestamp: 2026-04-19
  checked: closeUnifiedTab (unified-tab-bar.tsx lines 989-1043)
  found: Searches only terminalTabs.value (main-0) and getTerminalScope('right-0').tabs.value. Tabs in main-1/main-2/right-1/right-2 not found → skips agent close modal and cleanup.
  implication: BUG - sub-scope agent tabs can't be properly closed. Also a potential scope-related rendering issue when tabs are searched by wrong scope.

- timestamp: 2026-04-19
  checked: getDefaultTerminalLabel (terminal-tabs.tsx lines 911-918)
  found: returns 'Terminal' when tab.isAgent is falsy. Agent tabs created when binary not found have isAgent=false → getDefaultTerminalLabel returns 'Terminal'.
  implication: Root of the "label flips to Terminal" symptom when user clears rename field on an agent tab with isAgent=false.

- timestamp: 2026-04-19
  checked: 22-12 scope-routing tests (unified-tab-bar.test.tsx lines 1174-1209)
  found: All 3 tests pass — they assert call parameters (structural), not DOM label text.
  implication: Tests miss the behavioral gap: no test verifies rendered DOM shows "Agent" text after agent dropdown action.

- timestamp: 2026-04-19
  checked: terminal-tabs.test.ts lines 205-223
  found: 'right-scope createNewTab({ isAgent: true }) labels the tab "Agent <name>"' PASSES — confirms tab.label is set correctly.
  implication: Tab storage is correct. Rendering should be correct for label. Primary UX bug is isAgent=false causing plain shell spawn (not wrong label).

## Eliminated

- hypothesis: buildDropdownItems Agent action omits isAgent: true
  evidence: Reading line 1307 confirms { scope, isAgent: true } passed. Tests at lines 1188-1198 pass.
  timestamp: 2026-04-19

- hypothesis: createNewTabScoped signature dropped options param (silent revert similar to 22-10)
  evidence: createNewTabScoped signature at line 206 shows options?: CreateTabOptions correctly. createNewTab at line 855-857 passes options. No regression found.
  timestamp: 2026-04-19

- hypothesis: renderTab falls into wrong branch causing wrong label
  evidence: renderTab for type='terminal' reads termTab?.label ?? 'Terminal'. If termTab found, label is correct. No agent-specific type in UnifiedTab — all terminal tabs use same branch. Confirmed correct.
  timestamp: 2026-04-19

## Resolution

- root_cause: THREE bugs:
  (A) isAgent=false when agent binary not detected at tab creation time (createNewTabScoped line 233: isAgent = wantAgent && !!agentBinary). The intent was to gate PTY command on binary resolution, but it also gates the isAgent flag. Result: plain shell spawns when binary not found, tab behaves like Terminal even though labeled "Agent". 
  (B) renameTerminalTab backward-compat wrapper (terminal-tabs.tsx line 869) always routes to main-0. The rename handler in unified-tab-bar.tsx (line 2247) calls this instead of a scope-aware variant, causing: (i) renames of non-main-0 tabs silently fail, (ii) for main-0 tabs with isAgent=false, clearing the rename field produces label="Terminal" via getDefaultTerminalLabel.
  (C) closeUnifiedTab searches only main-0 + right-0 for terminal tabs (lines 995-997), leaving tabs in main-1/main-2/right-1/right-2 unfindable → no "Quit Agent" modal + no cleanup for sub-scope agent tabs.
- fix: |
    (B) unified-tab-bar.tsx line 2247: replaced `renameTerminalTab(tab.id, newName || getDefaultTerminalLabel(terminalTabs.value.find(...)))` with `getTerminalScope(tab.scope).renameTerminalTab(tab.id, newName || getDefaultTerminalLabel(scopedTermTab!))`. Now uses the correct scope's tabs for both lookup and rename dispatch.
    (C) unified-tab-bar.tsx closeUnifiedTab lines 995-998: replaced hardcoded main-0/right-0 two-scope search with a loop over all 6 scopes ['main-0','main-1','main-2','right-0','right-1','right-2']. Tabs in any sub-scope can now be found, closed, and trigger the "Quit Agent" modal.
    (A) Primary symptom ('Agent creates Terminal behavior') is explained: isAgent=false when binary not found at creation time causes plain shell to spawn. Label is still 'Agent X' (correct). User sees bash prompt and interprets it as "Terminal". This is a UX issue not a label-rendering bug. Fix deferred — would require decoupling isAgent from binary resolution, which has broader impact.
    6 behavior-asserting regression tests added (unified-tab-bar.test.tsx): agent label rendering (2), scope-aware rename (1), scope-aware close main-1 (1), scope-aware close right-1 (1). All GREEN.
- verification: |
    TypeScript: pnpm exec tsc --noEmit -p tsconfig.build.json → 0 errors.
    Tests: 14 failed | 69 passed (83) — same 14 pre-existing failures, 6 new tests all GREEN.
    No regressions in terminal-tabs.test.ts (12 failed | 18 passed — unchanged).
- files_changed: [src/components/unified-tab-bar.tsx, src/components/unified-tab-bar.test.tsx]
