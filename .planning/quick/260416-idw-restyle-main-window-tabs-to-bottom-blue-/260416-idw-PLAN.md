---
phase: quick-260416-idw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/unified-tab-bar.tsx
  - src/components/tab-bar.tsx
autonomous: true
requirements: [QUICK]
must_haves:
  truths:
    - "Main window tabs (UnifiedTabBar) show a 2px blue underline on the active tab instead of a pill/elevated background"
    - "Right panel tabs (TabBar) show a 2px blue underline on the active tab instead of a pill/elevated background"
    - "Both tab bars visually match the sidebar TabRow underline pattern"
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Underline-styled main tab bar"
      contains: "borderBottom.*colors.accent"
    - path: "src/components/tab-bar.tsx"
      provides: "Underline-styled right panel tab bar"
      contains: "borderBottom.*colors.accent"
  key_links:
    - from: "src/components/unified-tab-bar.tsx"
      to: "src/tokens.ts"
      via: "colors.accent for underline color"
      pattern: "colors\\.accent"
---

<objective>
Restyle both UnifiedTabBar (main window tabs) and TabBar (right panel tabs) from
the current pill/button visual style to a bottom blue underline style that matches
the sidebar TabRow pattern established in Phase 16.

Purpose: Visual consistency -- all tab bars in the app should use the same underline
idiom instead of mixing pill-style and underline-style tabs.

Output: Two updated component files with underline tab styling.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/sidebar.tsx (TabRow at lines 89-129 is the reference pattern)
@src/tokens.ts (colors.accent, colors.bgBorder, fonts, spacing)

<interfaces>
<!-- Reference pattern from sidebar.tsx TabRow (lines 96-128) -->
<!-- This is the EXACT style to replicate in both components -->

Container style:
```typescript
{
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${colors.bgBorder}`,
}
```

Active tab button style:
```typescript
{
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: `2px solid ${colors.accent}`,
  cursor: 'pointer',
  marginBottom: -1,
}
```

Inactive tab button style:
```typescript
{
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  marginBottom: -1,
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restyle UnifiedTabBar and TabBar to bottom blue underline</name>
  <files>src/components/unified-tab-bar.tsx, src/components/tab-bar.tsx</files>
  <action>
  Apply the sidebar TabRow underline pattern to both tab bar components.

  **In unified-tab-bar.tsx -- UnifiedTabBar component (line 628-677):**

  1. Container div (line 629): Change `class="flex gap-1 px-2 py-2 shrink-0 items-center border-b"` to `class="flex px-2 py-2 shrink-0 items-center border-b"` (remove `gap-1`, tabs should have zero gap like TabRow).

  2. renderTab function (lines 730-784) -- Replace the pill styles in the style object (lines 738-751):
     - Remove: `backgroundColor: isActive ? colors.bgElevated : 'transparent'`
     - Remove: `border: isActive ? '1px solid ${colors.bgSurface}' : '1px solid transparent'`
     - Remove: `borderRadius: 6`
     - Change `padding` from `'9px 16px'` to `'${spacing.xl}px ${spacing["3xl"]}px'` (8px 12px, matching TabRow)
     - Change `fontSize` from `13` to `11` (matching TabRow)
     - Change `fontWeight` from `isActive ? 500 : 400` to `isActive ? 600 : 400` (matching TabRow)
     - Change `color` from `isActive ? colors.textPrimary : colors.textDim` to `isActive ? colors.textPrimary : colors.textMuted` (matching TabRow)
     - Add: `backgroundColor: 'transparent'`
     - Add: `border: 'none'`
     - Add: `borderBottom: isActive ? '2px solid ${colors.accent}' : '2px solid transparent'`
     - Add: `marginBottom: -1`

  **In tab-bar.tsx -- TabBar component (lines 13-37):**

  1. Container div (line 15): Change `class="flex gap-1 px-2 py-2 border-b shrink-0 items-center"` to `class="flex px-2 py-2 border-b shrink-0 items-center"` (remove `gap-1`).

  2. Button styles (lines 22-29): Replace the pill styles:
     - Remove: `backgroundColor: active ? colors.bgElevated : 'transparent'`
     - Remove: `border: active ? '1px solid ${colors.bgSurface}' : '1px solid transparent'`
     - Remove: `borderRadius: 6`
     - Change `padding` from `'9px 16px'` to `'${spacing.xl}px ${spacing["3xl"]}px'` (8px 12px). Import `spacing` from tokens.
     - Change `fontSize` from `13` to `11`
     - Change `fontWeight` from `active ? 500 : 400` to `active ? 600 : 400`
     - Change `color` from `active ? colors.textPrimary : colors.textDim` to `active ? colors.textPrimary : colors.textMuted`
     - Add: `backgroundColor: 'transparent'`
     - Add: `border: 'none'`
     - Add: `borderBottom: active ? '2px solid ${colors.accent}' : '2px solid transparent'`
     - Add: `marginBottom: -1`

  Also update the tab-bar.tsx import line to include `spacing`:
  `import { colors, fonts, spacing } from '../tokens';`

  Do NOT change any tab behavior, event handlers, drag-and-drop logic, close buttons, or indicator dots. Only change visual styling properties.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
  - UnifiedTabBar tabs display with transparent background + 2px blue underline when active
  - TabBar tabs display with transparent background + 2px blue underline when active
  - Both match the sidebar TabRow visual pattern (fontSize 11, fontWeight 600, accent underline)
  - No pill backgrounds, no border-radius, no elevated backgrounds on tabs
  - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `pnpm exec tsc --noEmit` passes with zero errors
2. Visual: Main window tab bar shows blue underline on active tab, no pills
3. Visual: Right panel tab bar shows blue underline on active tab, no pills
4. Visual: Both tab bars look consistent with sidebar TabRow
</verification>

<success_criteria>
All three tab bar components in the app (sidebar TabRow, main UnifiedTabBar, right panel TabBar) use the same bottom blue underline visual pattern for active tab indication.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-idw-restyle-main-window-tabs-to-bottom-blue-/260416-idw-SUMMARY.md`
</output>
