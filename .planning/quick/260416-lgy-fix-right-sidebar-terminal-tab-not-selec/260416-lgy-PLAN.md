---
phase: quick
plan: 260416-lgy
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/right-panel.tsx
autonomous: true
must_haves:
  truths:
    - "Right sidebar bottom panel Bash tab appears visually selected on startup"
    - "Stale persisted rightBottomTab values that no longer match any tab fall back to the first available tab"
    - "A visible horizontal separator line appears at the top of the right-bottom panel tab bar"
  artifacts:
    - path: "src/components/right-panel.tsx"
      provides: "Validated rightBottomTab fallback + top border on right-bottom tab bar"
---

<objective>
Fix two issues in the right sidebar panel:
1. The Bash terminal tab in the right-bottom panel can appear unselected on startup when persisted state contains a stale value that no longer matches any tab in RIGHT_BOTTOM_TABS.
2. Add a visible horizontal separator line at the top of the right-bottom panel's tab bar (the TUI pane bar) to visually delineate it from the split handle above.

Purpose: Ensure consistent visual state on startup and improve visual hierarchy between the split handle and the bottom panel's tab bar.
Output: Updated right-panel.tsx with both fixes.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/right-panel.tsx
@src/components/tab-bar.tsx
@src/state-manager.ts (lines 45-46, 83-84 — rightBottomTab signal + load logic)
@src/styles/app.css (lines 147-165 — .right-bottom, .split-handle-h)

The right panel has two sub-panels (right-top, right-bottom) separated by a horizontal split handle.
The right-bottom panel contains a TabBar with tabs=['Bash'] and activeTab=rightBottomTab signal.

rightBottomTab defaults to 'Bash' in state-manager.ts:46, but loadAppState at line 84 overwrites it
with whatever value is persisted in state.json panels['right-bottom-tab'] — without checking if that
value actually exists in RIGHT_BOTTOM_TABS. There is already a precedent guard for rightTopTab at
right-panel.tsx:30-32 where stale 'Diff' values are caught.

The same pattern must be applied to rightBottomTab: if the persisted value is not in RIGHT_BOTTOM_TABS,
fall back to RIGHT_BOTTOM_TABS[0].
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix rightBottomTab stale value fallback + add top border to TUI pane bar</name>
  <files>src/components/right-panel.tsx</files>
  <action>
In right-panel.tsx, add a guard for rightBottomTab identical to the existing rightTopTab guard (lines 29-32).
After the existing rightTopTab guard block (line 32), add:

```typescript
// Guard: if persisted rightBottomTab is not in RIGHT_BOTTOM_TABS, fall back to default
if (!RIGHT_BOTTOM_TABS.includes(rightBottomTab.value)) {
  rightBottomTab.value = RIGHT_BOTTOM_TABS[0];
}
```

This ensures that if the persisted state has a value like 'Terminal' (old label) or any other stale
string, it resets to 'Bash' (the first entry in RIGHT_BOTTOM_TABS).

Then, on the right-bottom container div (line 124), add a top border to create a visible horizontal
separator at the top of the TUI pane bar. Add to the existing style or class:

```
borderTop: `1px solid ${colors.bgBorder}`
```

Apply this to the `.right-bottom` div that wraps the TabBar and terminal content. This creates a
subtle separator line between the drag handle and the bottom panel tab bar.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - rightBottomTab gets validated against RIGHT_BOTTOM_TABS on component render; stale values fall back to first tab
    - The right-bottom panel has a visible 1px top border in bgBorder color separating it from the split handle
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no type errors
2. Visual: launch app, right sidebar bottom panel shows "Bash" tab with active styling (blue underline, bold text)
3. Visual: a subtle horizontal line separates the split handle from the bottom panel tab bar
</verification>

<success_criteria>
- Bash tab in right-bottom panel is visually selected on startup regardless of persisted state
- Horizontal separator visible at top of TUI pane bar
- No regressions in right panel layout or tab switching
</success_criteria>

<output>
After completion, create `.planning/quick/260416-lgy-fix-right-sidebar-terminal-tab-not-selec/260416-lgy-SUMMARY.md`
</output>
