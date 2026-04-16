---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.tsx
autonomous: true
requirements: [EDIT-04]
must_haves:
  truths:
    - "Cmd+W closes the active editor tab when an editor tab is focused"
    - "Cmd+W closes the git-changes tab when it is focused"
    - "Cmd+W still closes the active terminal tab when a terminal tab is focused"
  artifacts:
    - path: "src/main.tsx"
      provides: "Unified Cmd+W handler"
      contains: "closeUnifiedTab"
  key_links:
    - from: "src/main.tsx"
      to: "src/components/unified-tab-bar.tsx"
      via: "closeUnifiedTab import"
      pattern: "closeUnifiedTab"
---

<objective>
Fix EDIT-04: wire Cmd+W to close editor and git-changes tabs, not just terminal tabs.

Purpose: Currently Cmd+W calls closeActiveTab() which only operates on terminal tabs. When an editor or git-changes tab is the active unified tab, the shortcut either does nothing or closes the wrong tab.

Output: Updated keyboard handler in main.tsx that routes Cmd+W through closeUnifiedTab for all tab types.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/main.tsx
@src/components/unified-tab-bar.tsx
@src/components/terminal-tabs.tsx

<interfaces>
From src/components/unified-tab-bar.tsx:
```typescript
export const activeUnifiedTabId = signal<string>('');
export function closeUnifiedTab(tabId: string): void;
```

From src/components/terminal-tabs.tsx:
```typescript
export async function closeActiveTab(): Promise<void>;
```

closeUnifiedTab already handles all three tab types:
- terminal: delegates to closeTab(tabId) + switches to adjacent tab
- editor: handles dirty-state confirmation dialog, then removes
- git-changes: removes tab + switches to adjacent tab
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Route Cmd+W through closeUnifiedTab</name>
  <files>src/main.tsx</files>
  <action>
Two changes in src/main.tsx:

1. **Update the import on line 33** to also import `closeUnifiedTab`:
   Change:
   ```typescript
   import { openEditorTab, restoreEditorTabs, activeUnifiedTabId } from './components/unified-tab-bar';
   ```
   To:
   ```typescript
   import { openEditorTab, restoreEditorTabs, activeUnifiedTabId, closeUnifiedTab } from './components/unified-tab-bar';
   ```

2. **Update the Cmd+W handler (lines 175-178)** to call closeUnifiedTab instead of closeActiveTab:
   Change:
   ```typescript
   case key === 'w' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey):
     e.preventDefault(); e.stopPropagation();
     closeActiveTab();
     break;
   ```
   To:
   ```typescript
   case key === 'w' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey):
     e.preventDefault(); e.stopPropagation();
     if (activeUnifiedTabId.value) {
       closeUnifiedTab(activeUnifiedTabId.value);
     }
     break;
   ```

   This works because closeUnifiedTab already handles all three tab types (terminal, editor, git-changes). The activeUnifiedTabId guard prevents a no-op call when no tabs are open.

3. **Remove closeActiveTab from the terminal-tabs import (line 27)** since it is no longer called from main.tsx. Change:
   ```typescript
   import { createNewTab, closeActiveTab, cycleToNextTab, initFirstTab, clearAllTabs, restoreTabs, saveProjectTabs, hasProjectTabs, restoreProjectTabs } from './components/terminal-tabs';
   ```
   To:
   ```typescript
   import { createNewTab, cycleToNextTab, initFirstTab, clearAllTabs, restoreTabs, saveProjectTabs, hasProjectTabs, restoreProjectTabs } from './components/terminal-tabs';
   ```

   Note: closeActiveTab is still used internally by terminal-tabs.tsx (closeTab delegates to it). Do NOT remove the export from terminal-tabs.tsx itself.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Cmd+W calls closeUnifiedTab(activeUnifiedTabId.value) instead of closeActiveTab()
    - closeUnifiedTab is imported from unified-tab-bar
    - closeActiveTab is removed from the main.tsx import (unused import cleaned up)
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Manual: open an editor tab via file tree click, press Cmd+W -- tab closes
3. Manual: open git-changes tab, press Cmd+W -- tab closes
4. Manual: focus a terminal tab, press Cmd+W -- terminal tab closes as before
</verification>

<success_criteria>
Cmd+W closes whichever tab type is currently active in the unified tab bar (terminal, editor, or git-changes).
</success_criteria>

<output>
After completion, create `.planning/quick/260416-dgx-fix-edit-04-wire-cmd-w-for-editor-tabs/260416-dgx-SUMMARY.md`
</output>
