---
phase: quick
plan: 260416-hsi
type: execute
wave: 1
depends_on: []
files_modified: [src/editor/theme.ts]
autonomous: true
requirements: [quick-task]
must_haves:
  truths:
    - "The minimap in file editor tabs is visually narrower than the default ~100px"
  artifacts:
    - path: "src/editor/theme.ts"
      provides: "CSS rules for .cm-minimap width reduction"
      contains: "cm-minimap"
  key_links:
    - from: "src/editor/theme.ts"
      to: "@replit/codemirror-minimap"
      via: "CSS class .cm-minimap rendered by the plugin"
      pattern: "cm-minimap"
---

<objective>
Reduce the width of the CodeMirror minimap in file editor tabs to make it less visually dominant.

Purpose: The default ~100px minimap takes too much horizontal space in the editor panel. Shrinking it to ~60px keeps the navigational utility while reclaiming space for code.
Output: Updated theme with minimap width CSS rules.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/editor/theme.ts
@src/editor/setup.ts (lines 104-108 — minimap config)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add minimap width CSS to editor theme</name>
  <files>src/editor/theme.ts</files>
  <action>
In the `efxmuxTheme` EditorView.theme() call in `src/editor/theme.ts`, add CSS rules targeting the minimap container to reduce its width. Add these entries to the theme object (after the existing `.cm-searchMatch.cm-searchMatch-selected` entry):

```ts
'.cm-minimap': {
  width: '60px !important',
  minWidth: '60px !important',
},
'.cm-minimap .cm-minimap-inner': {
  width: '60px !important',
},
```

This overrides the default ~100px width to 60px. The `!important` is needed because the plugin sets inline styles. Target both the outer container and the inner canvas wrapper so the rendered blocks scale correctly.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>The `.cm-minimap` CSS rules exist in the theme. TypeScript compiles without errors. The minimap renders at ~60px width instead of the default ~100px.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors from theme changes)
- Visual: open a file tab in the app, minimap is noticeably narrower than before
</verification>

<success_criteria>
The minimap in file editor tabs renders at approximately 60px wide instead of the default ~100px, confirmed visually and by the presence of CSS rules in the theme.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-hsi-make-file-minimap-viewer-in-file-tab-a-b/260416-hsi-SUMMARY.md`
</output>
