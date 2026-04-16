---
phase: quick
plan: 260416-fiw
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/terminal-tabs.tsx
autonomous: true
must_haves:
  truths:
    - "Agent tabs display 'Agent {name}' format (e.g. 'Agent claude', 'Agent opencode')"
    - "initFirstTab uses agentLabel() instead of duplicated inline logic"
  artifacts:
    - path: src/components/terminal-tabs.tsx
      provides: "Updated agentLabel() and initFirstTab()"
      contains: "Agent ${agent}"
  key_links:
    - from: initFirstTab
      to: agentLabel
      via: "function call replaces duplicated ternary"
---

<objective>
Change agent tab labels from capitalized names ('Claude', 'OpenCode') to the
'Agent {name}' format (e.g. 'Agent claude', 'Agent opencode'). Also remove the
duplicated label logic in initFirstTab() by reusing agentLabel().

Purpose: Consistent, informative tab labels that show the agent config name.
Output: Updated terminal-tabs.tsx with unified label logic.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/terminal-tabs.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update agentLabel() and unify initFirstTab() label logic</name>
  <files>src/components/terminal-tabs.tsx</files>
  <action>
Two changes in src/components/terminal-tabs.tsx:

1. **Update `agentLabel()` (lines 105-109):** Replace the current body with a
   single expression that returns `Agent ${agent}` when an agent string is
   provided, and `Agent` as fallback when agent is undefined/empty.

   New implementation:
   ```typescript
   function agentLabel(agent?: string): string {
     return agent ? `Agent ${agent}` : 'Agent';
   }
   ```

   No special-casing for 'claude' or 'opencode' -- all agents get the same
   `Agent {name}` format using the raw config name (lowercase).

2. **Update `initFirstTab()` (lines 327-335):** Remove the duplicated inline
   ternary chain (`activeProject.agent === 'claude' ? 'Claude' : ...`) and
   replace it with a call to `agentLabel()`.

   Replace lines 330-335 (the `let label` block) with:
   ```typescript
   let label: string;
   if (activeProject?.agent && activeProject.agent !== 'bash') {
     label = agentLabel(activeProject.agent);
   } else {
     label = 'Terminal 1';
   }
   ```

   This keeps the same guard logic (only label as agent when agent is configured
   and not 'bash') but delegates the formatting to the shared function.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - agentLabel('claude') returns 'Agent claude'
    - agentLabel('opencode') returns 'Agent opencode'
    - agentLabel('c') returns 'Agent c'
    - agentLabel() returns 'Agent'
    - initFirstTab() calls agentLabel() instead of duplicating ternary logic
    - createNewTab() continues to work via existing agentLabel() call (no change needed)
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors)
- Grep confirms no remaining 'Claude' or 'OpenCode' string literals in agentLabel or initFirstTab label logic
</verification>

<success_criteria>
All agent tabs show "Agent {name}" format. The duplicated label logic in
initFirstTab is eliminated in favor of the shared agentLabel() function.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-fiw-add-agent-name-to-agent-tabs-show-agent-/260416-fiw-SUMMARY.md`
</output>
