---
phase: quick-260418-bpm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/unified-tab-bar.tsx
  - src/main.tsx
autonomous: false
requirements:
  - QUICK-260418-bpm
must_haves:
  truths:
    - "Creating a new terminal from the main-panel dropdown while a non-terminal tab (editor, git-changes, sticky) is active focuses the new terminal tab."
    - "Creating a new agent from the main-panel dropdown while a non-terminal tab is active focuses the new agent tab."
    - "Pressing Ctrl+T while a non-terminal tab is active in the main panel focuses the newly created terminal tab."
    - "Right-panel new-terminal / new-agent creation continues to focus the new tab (no regression)."
    - "Switching between existing tabs (terminal -> editor -> git-changes) via signal cascades still does NOT hijack focus back to terminal tabs (existing guard behavior preserved for non-creation paths)."
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Dropdown action handlers for main-scope 'Terminal (Zsh)' and 'Agent' items that explicitly focus the newly-created tab"
      contains: "activeUnifiedTabId.value ="
    - path: "src/main.tsx"
      provides: "Ctrl+T keyboard shortcut handler that explicitly focuses the newly-created terminal tab"
      contains: "activeUnifiedTabId"
  key_links:
    - from: "src/components/unified-tab-bar.tsx:883"
      to: "activeUnifiedTabId signal"
      via: "await createNewTab() then set activeUnifiedTabId.value = tab.id"
      pattern: "createNewTab\\(\\).*then.*activeUnifiedTabId"
    - from: "src/components/unified-tab-bar.tsx:888"
      to: "activeUnifiedTabId signal"
      via: "await createNewTab({ isAgent: true }) then set activeUnifiedTabId.value = tab.id"
      pattern: "createNewTab\\(\\{ isAgent: true \\}\\).*then.*activeUnifiedTabId"
    - from: "src/main.tsx:239"
      to: "activeUnifiedTabId signal"
      via: "await createNewTab() then set activeUnifiedTabId.value = tab.id in Ctrl+T handler"
      pattern: "createNewTab\\(\\).*activeUnifiedTabId"
---

<objective>
Fix: when the main panel has a non-terminal tab active (editor, git-changes, file-tree sticky, gsd sticky), clicking "Terminal (Zsh)" or "Agent" in the new-tab dropdown, or pressing Ctrl+T, creates the new tab but does NOT focus it — the previously active non-terminal tab stays selected and visible.

Purpose: Creating a new terminal/agent is an explicit user intent to switch to that tab. The current behavior leaves users on the wrong tab with no visible feedback that anything happened.

Output: Main-scope new-tab actions (dropdown + Ctrl+T shortcut) explicitly set `activeUnifiedTabId` to the newly-created tab's id, matching the pattern already used by `openGitChangesTab`, `openEditorTab`, and the right-panel path.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/unified-tab-bar.tsx
@src/components/terminal-tabs.tsx
@src/main.tsx

<interfaces>
<!-- Extracted from the codebase so the executor has the contracts inline. -->
<!-- No scavenger hunt required. -->

From src/components/terminal-tabs.tsx (exports):
```typescript
// Top-level main-scope backward-compat exports:
export const activeTabId: Signal<string>;  // same Signal ref as getTerminalScope('main').activeTabId
export function createNewTab(options?: CreateTabOptions): Promise<TerminalTab | null>;

// TerminalTab shape (relevant fields):
interface TerminalTab {
  id: string;
  sessionName: string;
  label: string;
  isAgent: boolean;
  ownerScope: TerminalScope;  // 'main' | 'right'
  // ...other runtime fields
}

interface CreateTabOptions {
  isAgent?: boolean;
  scope?: TerminalScope;  // defaults to 'main'
}
```

From src/components/unified-tab-bar.tsx (exports + current state):
```typescript
export const activeUnifiedTabId = signal<string>('');

// Existing subscribe guard at lines 230-240 (DO NOT remove — it prevents
// unrelated signal cascades from hijacking editor/git-changes focus):
activeTabId.subscribe(id => {
  if (!id) return;
  const current = activeUnifiedTabId.value;
  if (current === id) return;
  const currentTab = allTabs.value.find(t => t.id === current);
  // Only sync if no unified tab is active, or the active tab is already a terminal.
  // NEVER hijack focus from editor or git-changes tabs.
  if (!current || !currentTab || currentTab.type === 'terminal') {
    activeUnifiedTabId.value = id;
  }
});

// Current BUGGY main-scope dropdown actions (lines 881-889):
{
  label: 'Terminal (Zsh)',
  icon: Terminal,
  action: () => { void createNewTab(); },         // <-- fire-and-forget, no focus sync
},
{
  label: 'Agent',
  icon: Bot,
  action: () => { void createNewTab({ isAgent: true }); },  // <-- same bug
},

// Reference pattern (from openGitChangesTab, line 588) — this is how the fix should look:
activeUnifiedTabId.value = newTab.id;
```

From src/main.tsx (current Ctrl+T handler, line 237-240):
```typescript
case key === 't' && e.ctrlKey && !e.shiftKey && !e.altKey:
  e.preventDefault(); e.stopPropagation();
  createNewTab();   // <-- same bug as dropdown; fire-and-forget, no focus sync
  break;
```
</interfaces>

<root_cause>
`createNewTabScoped` in `terminal-tabs.tsx:248` sets `s.activeTabId.value = id` for the newly-created tab. That fires the `activeTabId.subscribe(...)` listener in `unified-tab-bar.tsx:230-240`.

The listener's guard intentionally blocks the sync when the current `activeUnifiedTabId` points to an editor or git-changes tab (this prevents unrelated terminal signal cascades from stealing focus — important for correctness during editor operations, terminal restarts, etc.).

For the **right panel**, this isn't a problem because `right-panel.tsx:31-32` reads `rightScope.activeTabId.value` directly — it doesn't depend on `activeUnifiedTabId` for visibility decisions.

For the **main panel**, visibility is driven by `activeUnifiedTabId`, so when the guard blocks the sync after a user-explicit create, the new tab is created offscreen and the user sees nothing change.

The fix is to make the main-scope creation actions (dropdown items + Ctrl+T) explicitly set `activeUnifiedTabId.value = tab.id` after awaiting `createNewTab`, bypassing the subscribe guard for the one case where focus stealing IS the desired behavior (the user asked for a new tab — they want to see it).

The guard stays untouched so unrelated signal emissions (e.g., terminal restart, tab list reactivity) still cannot hijack editor focus.
</root_cause>

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Explicitly focus newly-created main-scope terminal/agent tabs</name>
  <files>
    src/components/unified-tab-bar.tsx
    src/main.tsx
    src/components/unified-tab-bar.test.tsx
  </files>
  <behavior>
    - Test 1 (regression/behavior): from a non-terminal active state (activeUnifiedTabId set to an editor id or a sticky id) in main scope, calling the dropdown "Terminal (Zsh)" action updates activeUnifiedTabId to the new terminal tab's id.
    - Test 2 (regression/behavior): same precondition, dropdown "Agent" action updates activeUnifiedTabId to the new agent tab's id.
    - Test 3 (guard preserved): a bare `activeTabId.value = someExistingTerminalId` emission while an editor tab is active in main scope MUST NOT change activeUnifiedTabId (the existing subscribe guard at unified-tab-bar.tsx:230-240 stays intact and still protects against signal-cascade hijacks).
    - Test 4 (right-scope no regression): calling right-scope createNewTab from the right dropdown continues to set getTerminalScope('right').activeTabId correctly and does not touch activeUnifiedTabId behavior for main scope.
  </behavior>
  <action>
    **Step 1 — src/components/unified-tab-bar.tsx**, `buildDropdownItems` function (starts line 876):

    In the main-scope branch (lines 879-895), replace the fire-and-forget arrows at lines 883 and 888 with awaited variants that explicitly focus the returned tab:

    ```typescript
    // BEFORE (buggy):
    {
      label: 'Terminal (Zsh)',
      icon: Terminal,
      action: () => { void createNewTab(); },
    },
    {
      label: 'Agent',
      icon: Bot,
      action: () => { void createNewTab({ isAgent: true }); },
    },

    // AFTER (fixed):
    {
      label: 'Terminal (Zsh)',
      icon: Terminal,
      action: () => {
        void (async () => {
          const tab = await createNewTab();
          if (tab) activeUnifiedTabId.value = tab.id;
        })();
      },
    },
    {
      label: 'Agent',
      icon: Bot,
      action: () => {
        void (async () => {
          const tab = await createNewTab({ isAgent: true });
          if (tab) activeUnifiedTabId.value = tab.id;
        })();
      },
    },
    ```

    **Do NOT touch the right-scope branch** (lines ~900-917). Right-panel visibility is driven by `getTerminalScope('right').activeTabId`, which `createNewTabScoped` already sets at terminal-tabs.tsx:248, so the right scope works without an `activeUnifiedTabId` write. Adding one there would be harmless but out of scope for this fix — leave it alone to keep the diff minimal.

    **Do NOT touch the `activeTabId.subscribe` guard at lines 230-240.** That guard exists to prevent signal-cascade hijacks of editor/git-changes focus (see the comment above it). The fix works *with* the guard — we bypass it only for the explicit user-initiated creation paths where focus stealing IS the desired behavior.

    **Step 2 — src/main.tsx**, Ctrl+T handler (lines 237-240):

    ```typescript
    // BEFORE (buggy):
    case key === 't' && e.ctrlKey && !e.shiftKey && !e.altKey:
      e.preventDefault(); e.stopPropagation();
      createNewTab();
      break;

    // AFTER (fixed):
    case key === 't' && e.ctrlKey && !e.shiftKey && !e.altKey:
      e.preventDefault(); e.stopPropagation();
      void (async () => {
        const tab = await createNewTab();
        if (tab) activeUnifiedTabId.value = tab.id;
      })();
      break;
    ```

    The import list at the top of main.tsx already includes `activeUnifiedTabId` (it's used on line 243 by the Cmd+W case), so no new import is required. Verify this before editing — if somehow missing, add it to the existing `import { ... } from './components/unified-tab-bar'` line.

    **Step 3 — tests** in `src/components/unified-tab-bar.test.tsx`:

    Add a new `describe` block (or extend an existing dropdown/creation block) that covers Test 1 + Test 2 + Test 3 from the `<behavior>` list above. Follow the existing test setup pattern in the file (search for tests that already mutate `activeUnifiedTabId.value` and call `createNewTab` — e.g., around lines 480-530). Key assertions:

    ```typescript
    // Seed: editor tab active in main scope
    activeUnifiedTabId.value = someEditorTabId;
    // Invoke the main-scope "Terminal (Zsh)" dropdown action (either by
    // calling buildDropdownItems('main')[0].action() or by exporting a helper
    // if buildDropdownItems is not exported — prefer the simpler path).
    await ...createNewTab(); // or simulate the action
    // Assert new terminal tab is focused:
    expect(activeUnifiedTabId.value).toBe(createdTab.id);
    ```

    If `buildDropdownItems` is not exported, either (a) export it for testing, or (b) export a small helper function `createAndFocusMainTerminalTab(isAgent: boolean): Promise<void>` used by both dropdown actions and (optionally) by main.tsx's Ctrl+T handler, and test that helper. Option (b) also DRY's the three call sites (dropdown Terminal, dropdown Agent, Ctrl+T) into one. Prefer (b) for maintainability — it collapses the three identical await+focus blocks into one function.

    If you pick (b), the helper lives in `unified-tab-bar.tsx` alongside `openGitChangesTab` / `openEditorTab` and has signature:

    ```typescript
    export async function createAndFocusMainTerminalTab(options?: { isAgent?: boolean }): Promise<void> {
      const tab = await createNewTab(options);
      if (tab) activeUnifiedTabId.value = tab.id;
    }
    ```

    Dropdown actions become `action: () => { void createAndFocusMainTerminalTab(); }` and `action: () => { void createAndFocusMainTerminalTab({ isAgent: true }); }`. main.tsx's Ctrl+T calls `void createAndFocusMainTerminalTab();`. Tests target this helper directly.

    For Test 3 (guard preserved), seed an editor id into `activeUnifiedTabId`, then fire `activeTabId.value = existingTerminalId` directly (simulating a signal cascade, not a user action) and assert `activeUnifiedTabId.value` is unchanged.

    For Test 4 (right-scope no regression), verify the existing right-scope test (unified-tab-bar.test.tsx around lines 504-533) still passes without changes.
  </action>
  <verify>
    <automated>pnpm test -- --run unified-tab-bar</automated>
  </verify>
  <done>
    - Opening "Terminal (Zsh)" from the main-panel dropdown while a file editor tab is active switches the visible main-panel content to the new terminal.
    - Opening "Agent" from the main-panel dropdown while a git-changes tab is active switches the visible main-panel content to the new agent.
    - Pressing Ctrl+T while a file editor tab is active in the main panel switches the visible main-panel content to the new terminal.
    - All existing `unified-tab-bar.test.tsx` tests pass (no regression to the editor-focus-preservation guard).
    - New tests (1-3) pass.
    - Right-panel new-terminal / new-agent behavior unchanged (right-panel.test.tsx passes).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human-verify the fix in the running app</name>
  <what-built>
    Main-scope new-terminal / new-agent creation (dropdown + Ctrl+T) now explicitly focuses the newly-created tab when the previously active tab is a non-terminal (editor, git-changes, file-tree sticky, gsd sticky).
  </what-built>
  <how-to-verify>
    1. Build/run the app (user handles this; don't start the server).
    2. Open any project with at least one editor tab visible. Click the editor tab so it's active in the main panel — the editor content is visible.
    3. Click the `+` dropdown in the main-panel tab bar and select "Terminal (Zsh)". Expected: a new terminal tab appears AND becomes the active visible tab. Actual-before-fix: new tab created but the editor stays visible.
    4. Repeat step 3 with "Agent" instead of "Terminal (Zsh)". Same expectation.
    5. With the editor tab active again, press `Ctrl+T`. Expected: new terminal tab focuses.
    6. In the right panel, open the dropdown and create a new Terminal and a new Agent from the right side. Expected: new right-scope tabs focus (no regression).
    7. Regression check for the focus-hijack guard: open an editor tab in the main panel (active), then cause an unrelated terminal signal emission — e.g., close a right-panel terminal or trigger a tab list re-render. The main-panel editor MUST stay focused (the guard must still protect against non-user-initiated cascades). If the editor focus is hijacked, report the regression.
  </how-to-verify>
  <resume-signal>Type "approved" after steps 1-7 pass, or describe any issues you see.</resume-signal>
</task>

</tasks>

<verification>
- Automated: `pnpm test -- --run unified-tab-bar` and `pnpm test -- --run right-panel` both pass.
- Typecheck: `pnpm tsc --noEmit` (or the project's standard type-check command) passes.
- Human verification steps in Task 2 all pass.
</verification>

<success_criteria>
- User can create a new terminal or agent from the main-panel dropdown or Ctrl+T shortcut while on any non-terminal tab, and the new tab becomes active/visible.
- The `activeTabId.subscribe` guard in `unified-tab-bar.tsx:230-240` is untouched — unrelated signal cascades still cannot hijack editor/git-changes focus.
- Right panel behavior unchanged.
- Code uses a shared helper (`createAndFocusMainTerminalTab`) across dropdown actions and Ctrl+T shortcut — no duplicated `await createNewTab(...); activeUnifiedTabId.value = ...` blocks across the three call sites.
</success_criteria>

<output>
After completion, create `.planning/quick/260418-bpm-when-not-on-terminal-agent-tab-active-cr/260418-bpm-SUMMARY.md`.
</output>
