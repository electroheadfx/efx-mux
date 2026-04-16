---
phase: quick-260416-imb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/unified-tab-bar.tsx
autonomous: true
requirements: [quick-fix]
must_haves:
  truths:
    - "After closing a main window tab, the next tab is visually selected (blue underline) in the tab bar"
    - "After closing a main window tab, the content shown matches the selected tab"
    - "Works for terminal tabs, editor tabs, and git changes tabs"
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Fixed closeUnifiedTab that updates activeUnifiedTabId on close"
  key_links:
    - from: "closeUnifiedTab"
      to: "switchToAdjacentTab"
      via: "always called when closed tab is active, not only when terminal list is empty"
---

<objective>
Fix: closing a main window tab navigates to the next tab's content but does not visually select it in the tab bar.

Root cause: In `closeUnifiedTab()`, when closing a terminal tab, `switchToAdjacentTab(tabId)` is only called when `terminalTabs.value.length === 0` (i.e., the last terminal tab). When other terminal tabs remain, the code relies on the `activeTabId.subscribe` subscriber to sync `activeUnifiedTabId`. But that subscriber's guard condition (`currentTab?.type === 'terminal'`) fails because by the time the subscriber fires, the closed tab has already been removed from `allTabs`, so `currentTab` is `undefined` and the guard rejects the update. Result: `activeUnifiedTabId` still points to the removed tab's ID, so no tab shows the blue underline.

Fix: Call `switchToAdjacentTab` BEFORE `closeTab` whenever the closed tab is the currently active unified tab, for all terminal closures (not just when the last terminal is removed). This ensures `activeUnifiedTabId` is updated before `closeTab` modifies `terminalTabs`.

Purpose: Tab bar selection must always reflect which tab's content is shown.
Output: Fixed `unified-tab-bar.tsx`
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/unified-tab-bar.tsx
@src/components/terminal-tabs.tsx (for closeTab / closeActiveTab / switchToTab behavior)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix activeUnifiedTabId not updating on terminal tab close</name>
  <files>src/components/unified-tab-bar.tsx</files>
  <action>
In `closeUnifiedTab()`, fix the terminal tab closure branches (both agent and non-agent) so
that `activeUnifiedTabId` is always updated when the closed tab is the active unified tab.

The fix has two parts:

**Part A -- Fix the terminal close branches in closeUnifiedTab:**

For both the agent `onConfirm` callback and the non-agent close path, change from:

```
closeTab(tabId);
setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
if (terminalTabs.value.length === 0) {
  switchToAdjacentTab(tabId);
}
```

To:

```
// Update unified selection BEFORE closeTab removes the tab from allTabs.
// switchToAdjacentTab reads getOrderedTabs() which needs the tab still present.
if (tabId === activeUnifiedTabId.value) {
  switchToAdjacentTab(tabId);
}
setProjectTabOrder(tabOrder.value.filter(id => id !== tabId));
closeTab(tabId);
```

Key ordering: `switchToAdjacentTab` must run BEFORE `closeTab` and BEFORE `setProjectTabOrder` removes the tab from the order list, because `switchToAdjacentTab` calls `getOrderedTabs()` which needs the closing tab's position to determine the adjacent tab. Then `setProjectTabOrder` removes it from the order. Then `closeTab` handles the PTY cleanup and terminal-level signals.

**Part B -- Fix the activeTabId subscriber guard:**

The subscriber at line ~135 also needs a fix for robustness. When `current` (the old `activeUnifiedTabId`) is no longer in `allTabs` (because the tab was removed), the subscriber should allow the sync. Change:

```typescript
if (!current || currentTab?.type === 'terminal') {
  activeUnifiedTabId.value = id;
}
```

To:

```typescript
if (!current || !currentTab || currentTab.type === 'terminal') {
  activeUnifiedTabId.value = id;
}
```

Adding `!currentTab` means: if the current unified tab ID no longer exists in allTabs (was removed), allow the sync. This is the belt-and-suspenders fix -- Part A is the primary fix, Part B ensures the subscriber doesn't block updates for removed tabs.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Closing any main window tab (terminal, editor, git changes) always updates both the visible content AND the tab bar selection
    - The blue underline moves to the adjacent tab after close
    - TypeScript compiles without errors
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Fixed tab close so the tab bar selection (blue underline) always follows the content switch</what-built>
  <how-to-verify>
    1. Open the app with at least 2 terminal tabs
    2. Close the active (selected) terminal tab using the X button or Cmd+W
    3. Verify: the adjacent tab now shows the blue underline AND its terminal content is visible
    4. Open a file editor tab, then close it -- verify the previous tab gets selected
    5. Open multiple tabs (mix of terminal + editor), close tabs from different positions -- verify selection always updates correctly
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries introduced -- this is a UI signal synchronization fix.

## STRIDE Threat Register

No threats applicable -- change is confined to in-memory signal updates for tab selection state.
</threat_model>

<verification>
- TypeScript compiles without errors
- Closing any tab type updates the blue underline to the adjacent tab
- Tab content matches the selected tab after close
</verification>

<success_criteria>
After closing any main window tab, the tab bar always visually selects the next/previous tab with the blue underline, matching the content shown.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-imb-when-i-close-a-main-window-tab-it-goes-o/260416-imb-SUMMARY.md`
</output>
