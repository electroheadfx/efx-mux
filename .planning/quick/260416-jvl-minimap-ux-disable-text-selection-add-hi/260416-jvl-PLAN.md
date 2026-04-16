---
phase: quick
plan: 260416-jvl
type: execute
wave: 1
depends_on: []
files_modified:
  - src/editor/theme.ts
  - src/editor/setup.ts
  - src/components/unified-tab-bar.tsx
autonomous: true
must_haves:
  truths:
    - "Text in the minimap is not selectable by mouse"
    - "A toggle icon in the tab bar hides/shows the minimap on all open editors"
    - "Minimap visibility persists across new editor tabs opened in the same session"
  artifacts:
    - path: "src/editor/theme.ts"
      provides: "CSS rules preventing text selection in minimap"
      contains: "userSelect"
    - path: "src/editor/setup.ts"
      provides: "Compartment-based minimap toggle and minimapVisible signal"
      exports: ["minimapVisible", "toggleMinimap"]
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Minimap toggle button in tab bar"
      contains: "PanelRightClose"
---

<objective>
Fix minimap UX: prevent text selection inside the minimap overlay, and add a
hide/show toggle button to the main tab bar so the user can collapse the minimap
when they want more editor space.

Purpose: The minimap currently allows accidental text selection which is confusing,
and there is no way to hide it without editing code.

Output: Updated theme.ts, setup.ts, unified-tab-bar.tsx
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/editor/theme.ts
@src/editor/setup.ts
@src/components/unified-tab-bar.tsx
@src/components/editor-tab.tsx
@src/tokens.ts

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/editor/setup.ts:
```typescript
export function createEditorState(content: string, options: EditorSetupOptions): EditorSetupResult;
export function registerEditorView(tabId: string, view: EditorView): void;
const editorViewMap = new Map<string, EditorView>(); // module-private
```

From src/components/unified-tab-bar.tsx:
```typescript
export const editorTabs = computed<EditorTabData[]>(...);
export const activeUnifiedTabId = signal<string>('');
// Dropdown trigger button pattern at line 752-778
// lucide-preact imports: { Terminal, Bot, FileDiff, Pin }
```

From src/tokens.ts:
```typescript
export const colors = { textDim: '#556A85', textPrimary: '#E6EDF3', accent: '#258AD1', bgElevated: '#19243A', ... };
export const fonts = { sans: '...', mono: '...' };
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Disable text selection in minimap and add Compartment-based toggle</name>
  <files>src/editor/theme.ts, src/editor/setup.ts</files>
  <action>
**theme.ts** -- Add CSS rules to the `.cm-minimap` block (lines 52-58) to disable
text selection. Add these properties to the existing `.cm-minimap` rule:

```
userSelect: 'none',
WebkitUserSelect: 'none',
```

Add a new rule for `.cm-minimap .cm-minimap-inner` (currently at line 56-58) to also
include:

```
userSelect: 'none',
WebkitUserSelect: 'none',
pointerEvents: 'none',
```

The `pointerEvents: 'none'` goes only on `.cm-minimap-inner` (the text content layer),
NOT on `.cm-minimap` itself, because the minimap overlay needs pointer events for
scroll-to-position interaction.

**setup.ts** -- Convert the minimap extension from a static extension to a
Compartment-based reconfigurable extension so it can be toggled on/off:

1. Import `Compartment` from `@codemirror/state` (add to the existing import on line 4).
2. Import `signal` from `@preact/signals`.
3. Create a module-level `minimapCompartment = new Compartment()`.
4. Create and export `minimapVisible = signal(true)`.
5. Create and export a function `toggleMinimap()` that:
   - Flips `minimapVisible.value`
   - Iterates `editorViewMap` (already module-private on line 34)
   - For each EditorView, dispatches `view.dispatch({ effects: minimapCompartment.reconfigure(minimapVisible.value ? minimapExtension() : []) })`
6. Extract the current minimap config (lines 104-108) into a helper function
   `minimapExtension()` that returns the `showMinimap.compute(...)` call.
7. In `createEditorState`, replace the raw `showMinimap.compute(...)` in the
   extensions array with `minimapCompartment.of(minimapExtension())`.

This way every new EditorView gets the minimap wrapped in the compartment, and
`toggleMinimap()` can reconfigure all existing views at once.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - `.cm-minimap` has `userSelect: 'none'` and `WebkitUserSelect: 'none'`
    - `.cm-minimap .cm-minimap-inner` has `pointerEvents: 'none'`
    - `minimapVisible` signal and `toggleMinimap` function are exported from setup.ts
    - Minimap extension uses a Compartment for runtime reconfiguration
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add minimap toggle button to unified tab bar</name>
  <files>src/components/unified-tab-bar.tsx</files>
  <action>
Add a minimap show/hide toggle icon button to the tab bar, positioned to the LEFT
of the existing "+" dropdown button.

1. Add import at the top of the file:
   - Add `PanelRightClose, PanelRight` to the lucide-preact import (line 11). Use
     `PanelRightClose` when minimap is visible (semantically "collapse the right panel")
     and `PanelRight` when hidden (semantically "expand the right panel").
   - Add `import { minimapVisible, toggleMinimap } from '../editor/setup';`

2. In the `UnifiedTabBar` component (line 705), check whether any editor tab is
   currently active: `const hasEditorTab = editorTabs.value.length > 0;`

3. Insert a button element BEFORE the `<Dropdown ... />` block (before line 752).
   Only render when `hasEditorTab` is true. The button:

   ```tsx
   {hasEditorTab && (
     <button
       class="w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
       style={{
         color: minimapVisible.value ? colors.textDim : colors.textMuted,
         backgroundColor: 'transparent',
         border: 'none',
       }}
       aria-label={minimapVisible.value ? 'Hide minimap' : 'Show minimap'}
       title={minimapVisible.value ? 'Hide minimap' : 'Show minimap'}
       onClick={() => toggleMinimap()}
       onMouseEnter={(e: MouseEvent) => {
         const t = e.currentTarget as HTMLElement;
         t.style.color = colors.textPrimary;
         t.style.backgroundColor = colors.bgElevated;
       }}
       onMouseLeave={(e: MouseEvent) => {
         const t = e.currentTarget as HTMLElement;
         t.style.color = minimapVisible.value ? colors.textDim : colors.textMuted;
         t.style.backgroundColor = 'transparent';
       }}
     >
       {minimapVisible.value
         ? <PanelRightClose size={14} />
         : <PanelRight size={14} />}
     </button>
   )}
   ```

   This follows the exact same styling pattern as the "+" button (w-7, h-7, rounded,
   colors.textDim default, hover to textPrimary+bgElevated).
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - A minimap toggle icon appears in the tab bar to the left of the "+" button
    - Icon only visible when at least one editor tab is open
    - Clicking the icon toggles minimap visibility on all open editors
    - Icon switches between PanelRightClose (visible) and PanelRight (hidden)
    - Hover styling matches the "+" button pattern
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `pnpm exec tsc --noEmit` passes with zero errors
2. Open a file in the editor -- minimap text should NOT be selectable by mouse
3. Click the minimap toggle icon in the tab bar -- minimap hides on all open editors
4. Click again -- minimap reappears
5. Open a new file tab while minimap is hidden -- new tab should also have no minimap
6. The minimap overlay scroll-to-position interaction still works (pointer events preserved on outer element)
</verification>

<success_criteria>
- Text selection is impossible inside the minimap overlay
- Minimap toggle button appears when editor tabs are open
- Toggle hides/shows minimap across all open editor views simultaneously
- New editor tabs respect the current minimap visibility state
</success_criteria>

<output>
After completion, create `.planning/quick/260416-jvl-minimap-ux-disable-text-selection-add-hi/260416-jvl-SUMMARY.md`
</output>
