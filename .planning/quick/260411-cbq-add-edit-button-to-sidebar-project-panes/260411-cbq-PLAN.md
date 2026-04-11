---
phase: quick-260411-cbq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "Each project row in the expanded sidebar shows a pencil/edit icon on hover"
    - "Clicking the edit icon opens the project modal in edit mode with all fields pre-filled"
    - "Saving changes in the modal updates the project and refreshes the sidebar"
  artifacts:
    - path: "src/components/sidebar.tsx"
      provides: "Edit button in ProjectRow component"
      contains: "Settings"
  key_links:
    - from: "src/components/sidebar.tsx"
      to: "src/components/project-modal.tsx"
      via: "openProjectModal({ project })"
      pattern: "openProjectModal.*project"
---

<objective>
Add an edit button (Settings gear icon) to each project row in the sidebar so users can
edit project settings. The project modal already supports edit mode via
`openProjectModal({ project })` -- this plan just wires a visible button to trigger it.

Purpose: Restore the ability to edit project settings that was lost when the preferences panel was removed.
Output: Updated sidebar.tsx with edit icon on each project row.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/sidebar.tsx
@src/components/project-modal.tsx
@src/state-manager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add edit button to ProjectRow in sidebar</name>
  <files>src/components/sidebar.tsx</files>
  <action>
In `src/components/sidebar.tsx`:

1. Add `Settings` to the lucide-preact import (line 9):
   ```
   import { GitBranch, Plus, RotateCw, Settings, X } from 'lucide-preact';
   ```

2. In the `ProjectRow` component, add an edit button BEFORE the existing remove (X) button
   (around line 159, inside the row's flex container). The edit button should:
   - Use `<Settings size={12} />` icon (same size as the X remove button)
   - Same hover-reveal pattern as the X button: `opacity: 0` by default, visible on
     group hover via `class="group-hover:opacity-100"`
   - Color: `colors.textMuted`, with hover class `hover:text-accent`
   - `title="Edit project settings"`
   - `onClick` handler that calls `e.stopPropagation()` then
     `openProjectModal({ project })` where `project` is the `ProjectEntry` from the row props
   - Style matching the X button pattern: `cursor: 'pointer'`, `flexShrink: 0`,
     `transition: 'opacity 0.15s'`

The two buttons (edit + remove) should appear side-by-side with a small gap, both
revealed on hover. Use `marginLeft: 'auto'` on a wrapper div or on the first icon
to push them to the right side of the row. The existing X button already has
`group-hover:opacity-100` so both icons will appear together on row hover.

3. Wrap both the Settings and X icon buttons in a small flex container:
   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
     {/* Settings button */}
     {/* X button (existing) */}
   </div>
   ```

Do NOT change any other behavior -- the modal, updateProject, and switchProject flows
already work correctly.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && grep -c "Settings" src/components/sidebar.tsx && grep -c "openProjectModal" src/components/sidebar.tsx && grep -c "Edit project" src/components/sidebar.tsx</automated>
  </verify>
  <done>
    - Settings icon appears next to X on each project row on hover
    - Clicking Settings opens project modal in edit mode with fields pre-filled
    - Clicking X still triggers remove dialog (no regression)
    - Both icons hidden by default, revealed on row hover
  </done>
</task>

</tasks>

<verification>
- Build compiles: `cd /Users/lmarques/Dev/efx-mux && pnpm build`
- Settings icon imported from lucide-preact
- openProjectModal called with project parameter on edit click
</verification>

<success_criteria>
Each sidebar project row has a visible edit (Settings) icon on hover that opens the
project modal in edit mode with all fields pre-populated.
</success_criteria>

<output>
After completion, create `.planning/quick/260411-cbq-add-edit-button-to-sidebar-project-panes/260411-cbq-SUMMARY.md`
</output>
