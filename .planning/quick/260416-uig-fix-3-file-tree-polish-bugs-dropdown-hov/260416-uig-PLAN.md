---
phase: quick-260416-uig
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/context-menu.tsx
  - src/components/context-menu.test.tsx
  - src/components/file-tree.tsx
  - src/components/file-tree.test.tsx
autonomous: true
requirements:
  - BUG-01-dropdown-hover
  - BUG-02-no-text-select-on-right-click
  - BUG-03-decouple-hover-from-selected

must_haves:
  truths:
    - "Hovering a ContextMenu item visually highlights it via a bgSurface/bgElevated tint"
    - "Hover highlight applies to both the main menu and any rendered submenu"
    - "Right-clicking a file-tree row does NOT cause the filename text to become selected"
    - "Clicking a file-tree row marks it as the selected row (white text) and that white text persists while the mouse hovers other rows"
    - "Mousing away from the tree does not lose the click-selected row's background tint"
    - "Keyboard ArrowUp/Down/Enter still operate on the click-selected row (selectedIndex)"
  artifacts:
    - path: src/components/context-menu.tsx
      provides: "per-item hover state (hoveredIndex) applied to both main menu and submenu"
      contains: "hoveredIndex"
    - path: src/components/file-tree.tsx
      provides: "hoveredIndex signal + userSelect:'none' on both render-path rows"
      contains: "hoveredIndex"
    - path: src/components/context-menu.test.tsx
      provides: "hover-background assertion for main + submenu items"
    - path: src/components/file-tree.test.tsx
      provides: "4 new tests covering bugs 2 and 3 across flat + tree modes"
  key_links:
    - from: src/components/context-menu.tsx
      to: src/tokens.ts
      via: "colors.bgSurface (hover tint, darker than bgElevated menu bg)"
      pattern: "colors\\.bgSurface"
    - from: src/components/file-tree.tsx
      to: src/components/file-tree.tsx (module-scope signal)
      via: "hoveredIndex signal, set on onMouseEnter / cleared on onMouseLeave"
      pattern: "hoveredIndex"
    - from: src/components/file-tree.tsx (row style)
      to: hoveredIndex + selectedIndex
      via: "row background = hovered||selected ? bgElevated : transparent; filename color = selected ? textPrimary : textMuted (NOT hover-dependent)"
      pattern: "hoveredIndex\\.value === i"
---

<objective>
Fix three polish bugs in the Phase 18 file tree UI:

1. ContextMenu items lack hover feedback — add a per-item `hoveredIndex` state so main-menu AND submenu items visibly highlight on mouse-over.
2. Right-clicking a row in the file tree currently lets the browser select the filename text. Add `user-select: none` on both render-path rows.
3. The current file-tree render aliases `selectedIndex` for both click-selection and hover, so mousing over a different row overwrites the click-selected row's white text. Introduce a separate `hoveredIndex` signal: click sets `selectedIndex` (white filename), hover sets `hoveredIndex` (background tint only). Apply to BOTH flat and tree render paths.

Purpose: The file tree is a high-frequency interaction surface. These three bugs combine to make the tree feel broken: dropdowns look non-interactive, right-click muddies the selection with a text highlight, and the visually-selected row forgets itself as soon as you move the mouse.

Output:
- `src/components/context-menu.tsx` with a `hoveredIndex` state wired to each menuitem div (applies via recursion to the submenu too).
- `src/components/file-tree.tsx` with a module-scope `hoveredIndex` signal, `userSelect: 'none'` on both row divs, and updated style computations.
- Tests exercising all four regression scenarios.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/components/context-menu.tsx
@src/components/context-menu.test.tsx
@src/components/file-tree.tsx
@src/components/file-tree.test.tsx
@src/tokens.ts

<interfaces>
<!-- Key types + token values the executor needs. Extracted from codebase. -->
<!-- Executor should use these directly — no codebase exploration required. -->

From src/tokens.ts:
```typescript
export const colors = {
  bgDeep: '#0B1120',
  bgBase: '#111927',
  bgElevated: '#19243A',    // current menu container background
  bgBorder: '#243352',       // current "selected parent" tint for submenu rows
  bgSurface: '#324568',      // USE THIS as the hover tint (one step brighter than bgElevated)
  accent: '#258AD1',
  textPrimary: '#E6EDF3',
  textMuted: '#8B949E',
  // ...
} as const;
```

From src/components/context-menu.tsx:
```typescript
export interface ContextMenuItem {
  label: string;
  action?: () => void;
  icon?: ComponentType<{ size?: number | string }>;
  disabled?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}
export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}
export function ContextMenu({ items, x, y, onClose }: ContextMenuProps);
```

From src/components/file-tree.tsx (relevant module-scope signals):
```typescript
const entries = signal<FileEntry[]>([]);
const selectedIndex = signal(0);           // KEEP: drives white filename on click-selected row
// NEW (to add): const hoveredIndex = signal(-1);   // drives bg tint on hover only
```

Current row-style snippet (flat mode, file-tree.tsx ~line 1300-1315):
```tsx
<div
  data-file-tree-index={i}
  style={{ padding: `${fileTreeLineHeight.value}px 12px`, gap: 8, display: 'flex',
           alignItems: 'center', cursor: 'pointer',
           backgroundColor: isSelected ? colors.bgElevated : 'transparent' }}
  onClick={() => { selectedIndex.value = i; /* ... */ }}
  onMouseEnter={() => { selectedIndex.value = i; }}          // <-- BUG 3 is here
  onContextMenu={(e) => handleRowContextMenu(...)}
  onMouseDown={(e) => onRowMouseDown(...)}
>
```

Current submenu bg-tint line (context-menu.tsx:174) for parent rows that host a submenu:
```tsx
backgroundColor: submenuIndex === i ? colors.bgBorder : 'transparent',
```
Hover should override this only when no submenu is active for that row.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add hover state to ContextMenu (main menu + submenu)</name>
  <files>src/components/context-menu.tsx, src/components/context-menu.test.tsx</files>
  <read_first>
    - Full read of src/components/context-menu.tsx (213 lines) to understand current onMouseEnter/onMouseLeave wiring (already used for submenu open-delay) — must NOT break the 150ms submenu-open behaviour.
    - Full read of src/components/context-menu.test.tsx to match existing test patterns (render, fireEvent.mouseEnter, style-style assertions via getComputedStyle / element.style).
    - src/tokens.ts to confirm `colors.bgSurface` exists (it does — line 16).
  </read_first>
  <behavior>
    - Test 1 (main menu): Render ContextMenu with ≥2 non-disabled, non-separator items. Fire `mouseEnter` on item 0. Its rendered div (`role="menuitem"`) has `style.backgroundColor` equal to `colors.bgSurface` (#324568). Then fire `mouseLeave`; the background reverts to `transparent`.
    - Test 2 (submenu): Render ContextMenu with a parent item that has `children: [{ label: 'Child A' }, { label: 'Child B' }]`. mouseEnter the parent row, wait >150ms for the submenu to open, then mouseEnter `Child B`. Its div has `style.backgroundColor === colors.bgSurface`.
    - Test 3 (disabled items still get styled but pointer-events are not tested): hovering a `disabled: true` item DOES still apply the hover bg (the visual is still wanted). Keep existing `cursor: 'not-allowed'` and dim color behaviour untouched.
    - Test 4 (submenu-parent conflict): When `submenuIndex === i` (i.e. this row's submenu is open), the row's existing `colors.bgBorder` tint takes precedence over the hover tint — do NOT regress the "submenu is open" visual cue.
  </behavior>
  <action>
    1. In context-menu.tsx, add local state: `const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);` alongside the existing `submenuIndex` state.
    2. In the item render block (the non-separator `<div role="menuitem">` at lines ~135-190), extend the existing `onMouseEnter` handler to ALSO call `setHoveredIndex(i)`. Do not touch the existing submenu-open timer logic — just add the setHoveredIndex call unconditionally at the top of the handler.
    3. Add `onMouseLeave` behaviour: current handler only clears `hoverTimerRef`. Extend it to also call `setHoveredIndex(null)`. Preserve the existing `hoverTimerRef.current = clearTimeout(...)` line.
    4. Update the inline `style={{ ... }}` object's `backgroundColor` line from:
       `backgroundColor: submenuIndex === i ? colors.bgBorder : 'transparent',`
       to:
       `backgroundColor: submenuIndex === i ? colors.bgBorder : (hoveredIndex === i ? colors.bgSurface : 'transparent'),`
       — keeping `submenuIndex === i` FIRST so an open-submenu row retains its distinct `bgBorder` cue.
    5. The submenu is rendered via recursive `<ContextMenu items={items[submenuIndex].children!} ... />`. Because hover state is LOCAL to each ContextMenu instance, the submenu automatically inherits identical hover behaviour — no extra wiring needed. Verify by tracing the render path.
    6. Add 2 new tests in context-menu.test.tsx:
       - `it('applies hover background on mouseEnter and clears it on mouseLeave')` — use `getByText('Copy').closest('[role="menuitem"]')`, fireEvent.mouseEnter, assert `(el as HTMLElement).style.backgroundColor` contains the RGB form of `#324568` (which is `rgb(50, 69, 104)`). Then fireEvent.mouseLeave and assert the bg is empty/transparent.
       - `it('applies hover background on submenu items')` — build parent+children items, mouseEnter the parent row, `await new Promise(r => setTimeout(r, 200))` to open the submenu, then mouseEnter a child row. Assert the child's `style.backgroundColor` matches `rgb(50, 69, 104)`.
    7. Keep existing 13 tests passing.

    Note: browsers normalize `#324568` to `rgb(50, 69, 104)` when set inline and read back via `element.style.backgroundColor`. Use either form in the assertion — match via `.toMatch(/rgb\(50, ?69, ?104\)|#324568/)` to be robust.
  </action>
  <acceptance_criteria>
    - grep -n "hoveredIndex" src/components/context-menu.tsx | wc -l  →  ≥ 3 (declaration + setter call + style read)
    - grep -n "colors.bgSurface" src/components/context-menu.tsx  →  1 match inside the item style object
    - grep -n "setHoveredIndex(null)" src/components/context-menu.tsx  →  ≥ 1 match inside onMouseLeave
    - pnpm test src/components/context-menu.test.tsx  →  all tests pass, including 2 new hover tests
    - The existing `submenuIndex === i ? colors.bgBorder` branch appears BEFORE the hover branch in the ternary (open-submenu takes precedence).
  </acceptance_criteria>
  <verify>
    <automated>pnpm test src/components/context-menu.test.tsx --run</automated>
  </verify>
  <done>
    ContextMenu items (main + submenu) show a visible `bgSurface` hover tint on mouseEnter, clear on mouseLeave, and do not override the existing open-submenu `bgBorder` cue. Two new tests pass. All 13 existing tests still pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Split hoveredIndex from selectedIndex + userSelect:'none' in FileTree (flat + tree)</name>
  <files>src/components/file-tree.tsx, src/components/file-tree.test.tsx</files>
  <read_first>
    - src/components/file-tree.tsx lines 1-90 (imports + module-scope signals: `selectedIndex = signal(0)` at line 40) — you will add a new signal `hoveredIndex = signal(-1)` next to it.
    - src/components/file-tree.tsx lines 1290-1345 (flat-mode render: row `<div>` with onMouseEnter mutating selectedIndex at line 1312).
    - src/components/file-tree.tsx lines 1345-1415 (tree-mode render: row `<div>` with onMouseEnter mutating selectedIndex at line 1375).
    - src/components/file-tree.tsx search for all other uses of `selectedIndex.value = i` in onMouseEnter handlers — there are exactly 2 (flat at 1312, tree at 1375). Do NOT touch the other `selectedIndex.value =` assignments (onClick, keyboard handlers, revealFileInTree) — those are legitimate click/keyboard selections.
    - src/components/file-tree.test.tsx (full file, 119+ lines) to match existing patterns: `render(<FileTree />)`, `await new Promise(r => setTimeout(r, 20))`, `document.querySelectorAll('[data-file-tree-index]')`, `fireEvent.*`.
  </read_first>
  <behavior>
    - Test 1 "selected row stays white while hovering over a different row" (flat mode): click row 0, then fire mouseEnter on row 1. Row 0's span (the filename span) still has `color: colors.textPrimary` (#E6EDF3 / rgb(230,237,243)). Row 1 has bg `colors.bgElevated` but its span color is still `colors.textMuted`.
    - Test 2 "selected row's background remains even when hover moves away from tree" (flat mode): click row 0, mouseEnter row 1, mouseLeave row 1. Row 0's div still has `backgroundColor === colors.bgElevated` (the click-selection background).
    - Test 3 "right-click on a row does not cause filename text selection" (flat mode): query row 0's div, assert `getComputedStyle(div).userSelect === 'none'` OR inline `style.userSelect === 'none'`.
    - Test 4 "tree-mode: selected row stays white while hovering different row" — mirrors Test 1 but in tree mode. Switch to tree mode first by clicking the TreeIcon mode toggle, wait for `flattenedTree.value.length > 0`, then do the same click/hover assertion on rows with `data-file-tree-index`.

    NOTE: tests 1, 2, 3 run in flat mode (the default — viewMode signal starts as 'tree' though, see line 29 — re-check and adjust: the default viewMode is 'tree'). Adjust each test to explicitly switch to the mode under test: for flat tests, fire click on the ListIcon element (`<span title="Flat mode">`) once; for tree-mode test, no switch needed. Or directly set `viewMode.value = 'flat'` via the exported signal if it's exported — if not exported, use the UI toggle. Inspect exports; `viewMode` is NOT exported, so USE THE UI TOGGLE by querying `span[title="Flat mode"]` and `fireEvent.click`.
  </behavior>
  <action>
    1. At line ~40 of file-tree.tsx (right after `const selectedIndex = signal(0);`), add:
       ```typescript
       const hoveredIndex = signal(-1);
       ```
       (module-scope signal, initial value -1 meaning "nothing hovered").

    2. Flat-mode render (line ~1295-1315), change the row `<div>`:
       - Replace `onMouseEnter={() => { selectedIndex.value = i; }}` with:
         `onMouseEnter={() => { hoveredIndex.value = i; }}`
       - Add a new handler: `onMouseLeave={() => { if (hoveredIndex.value === i) hoveredIndex.value = -1; }}`
       - In the `style={{ ... }}` object, change `backgroundColor: isSelected ? colors.bgElevated : 'transparent'` to:
         `backgroundColor: (hoveredIndex.value === i || isSelected) ? colors.bgElevated : 'transparent'`
       - ALSO in the same style object, add `userSelect: 'none' as const,` (TypeScript inline-style requires the `as const` OR `WebkitUserSelect: 'none'` — use the form used elsewhere in the file: search for existing `userSelect` — there is one at line 1197 spelled `userSelect: 'none'` without `as const`, so just use `userSelect: 'none'` to match).
       - The filename span's `color` line (~line 1323) stays EXACTLY as is: `color: isSelected ? colors.textPrimary : colors.textMuted`. Do NOT make it depend on hover. This is the core of bug 3's fix.

    3. Tree-mode render (line ~1355-1395), mirror the same 4 edits on the tree-mode row div:
       - Replace `onMouseEnter={() => { selectedIndex.value = i; }}` (line ~1375) with `onMouseEnter={() => { hoveredIndex.value = i; }}`.
       - Add `onMouseLeave={() => { if (hoveredIndex.value === i) hoveredIndex.value = -1; }}`.
       - Change `backgroundColor: isSelected ? colors.bgElevated : 'transparent'` (line ~1365) to `backgroundColor: (hoveredIndex.value === i || isSelected) ? colors.bgElevated : 'transparent'`.
       - Add `userSelect: 'none'` to the style object.
       - Leave the filename span color at line ~1394 untouched.

    4. DO NOT change any other `selectedIndex.value = i` call site. In particular:
       - The onClick handlers on rows (lines 1304-1311 flat, 1367-1374 tree) MUST still set `selectedIndex.value = i`. That is the click-selection path.
       - Keyboard handlers (`handleFlatKeydown`, `handleTreeKeydown`) MUST still move `selectedIndex`. Keyboard navigation drives the white-text row — this is a FEATURE, not a bug.
       - `revealFileInTree` (lines 556, 570) MUST still set `selectedIndex`.

    5. Add 4 new tests to src/components/file-tree.test.tsx, in a new `describe('hover vs. click selection', () => { ... })` block at the end of the file. Use the existing `beforeEach` pattern from the top describe. For each test:
       - Render `<FileTree />`, await 20ms, query rows via `document.querySelectorAll('[data-file-tree-index]')`.
       - For flat-mode tests: fire click on the flat mode toggle first (`document.querySelector('span[title="Flat mode"]')`), await 20ms.
       - Use `fireEvent.click`, `fireEvent.mouseEnter`, `fireEvent.mouseLeave` on rows.
       - Read `(row as HTMLElement).style.backgroundColor` and `(span as HTMLElement).style.color` — these return the rgb() form for inline styles set to hex tokens.

       Test 1: `it('flat mode: click-selected row keeps textPrimary color while hovering another row')`
         - Click row 0 → Assert row 0 span.style.color matches `rgb(230, 237, 243)` (E6EDF3).
         - mouseEnter row 1 → Assert row 0 span.style.color STILL matches `rgb(230, 237, 243)`.
         - Assert row 1 span.style.color matches `rgb(139, 148, 158)` (8B949E, textMuted).

       Test 2: `it('flat mode: click-selected row retains bgElevated background after mouse leaves')`
         - Click row 0 → background = `rgb(25, 36, 58)` (bgElevated #19243A).
         - mouseEnter row 1 → mouseLeave row 1. Assert row 0's `style.backgroundColor` still === `rgb(25, 36, 58)`.

       Test 3: `it('flat mode: row has userSelect:none to prevent text selection on right-click')`
         - Query row 0, assert `(row as HTMLElement).style.userSelect === 'none'` (Preact's inline style kebab/camel handling keeps the camelCase property).

       Test 4: `it('tree mode: click-selected row keeps textPrimary color while hovering another row')`
         - Tree mode is the default. Skip the flat-toggle click. Await slightly longer (50ms) to let `initTree` finish.
         - Query rows via `data-file-tree-index`. If < 2 rows exist in tree mode for the MOCK_ENTRIES shape, extend the mockIPC to also handle recursive `list_directory` calls for `/tmp/proj/src` returning `[]` (empty children) — that way tree mode has 3 flattened rows.
         - Click row 0, mouseEnter row 1, assert row 0 span.style.color still matches `rgb(230, 237, 243)`.

  </action>
  <acceptance_criteria>
    - grep -n "const hoveredIndex" src/components/file-tree.tsx  →  1 match (module scope, near line 40)
    - grep -n "hoveredIndex.value = i" src/components/file-tree.tsx  →  exactly 2 matches (flat + tree onMouseEnter)
    - grep -n "hoveredIndex.value = -1" src/components/file-tree.tsx  →  ≥ 2 matches (flat + tree onMouseLeave)
    - grep -n "hoveredIndex.value === i || isSelected" src/components/file-tree.tsx  →  exactly 2 matches (flat + tree row bg)
    - grep -n "userSelect: 'none'" src/components/file-tree.tsx  →  at least 3 matches (existing line 1197 + 2 new row divs); the 2 new ones are inside the row `<div style={{...}}>` in flat and tree renders
    - grep -c "selectedIndex.value = i" src/components/file-tree.tsx  →  SAME count as BEFORE the change in onMouseEnter contexts, minus 2 (the 2 onMouseEnters converted). The onClick and keyboard-handler writes are UNCHANGED.
    - grep -n "color: isSelected ? colors.textPrimary : colors.textMuted" src/components/file-tree.tsx  →  exactly 2 matches (flat span + tree span) — confirming filename color is still NOT hover-dependent
    - pnpm test src/components/file-tree.test.tsx  →  all existing tests pass + 4 new tests pass
  </acceptance_criteria>
  <verify>
    <automated>pnpm test src/components/file-tree.test.tsx --run</automated>
  </verify>
  <done>
    - FileTree has a dedicated `hoveredIndex` signal. Click still sets `selectedIndex` (white filename + persistent bg). Hover sets `hoveredIndex` (bg tint only; filename stays its pre-hover color). Works in both flat and tree render paths.
    - Right-clicking a row does not produce browser text selection (userSelect:'none' applied).
    - 4 new tests pass; no existing tests regressed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full test suite + typecheck smoke</name>
  <files>(no files modified)</files>
  <read_first>
    - Nothing to read — this is a verification step after tasks 1 and 2.
  </read_first>
  <action>
    1. Run the full frontend test suite to ensure nothing unrelated regressed: `pnpm test --run`.
    2. Run the TypeScript check: `pnpm tsc --noEmit` (or whatever script the project uses — check package.json for `"typecheck"`; if present, use `pnpm typecheck`).
    3. If any failure is unrelated to these fixes AND was already broken on main (verified via git stash + rerun), note it in the summary but do not fix. If a failure is caused by this change, fix it in the relevant task file.
  </action>
  <acceptance_criteria>
    - pnpm test --run  →  exit code 0 (or only pre-existing unrelated failures clearly called out)
    - Typecheck  →  exit code 0
    - No new console.error output in test runs from context-menu.test.tsx or file-tree.test.tsx
  </acceptance_criteria>
  <verify>
    <automated>pnpm test --run && pnpm tsc --noEmit</automated>
  </verify>
  <done>
    All tests green, typecheck clean. The 3 bugs are fixed and regression-tested.
  </done>
</task>

</tasks>

<verification>
Manual verification after Claude finishes (user runs the app):

1. Right-click a file in the tree (flat mode). Open "Open In" submenu (if detected editors exist) or any submenu. Mouse over each item — each item should visibly highlight (darker blue-grey `#324568`). The child menu items should ALSO highlight on hover.
2. Right-click a file. The filename in the row should NOT become highlighted/selected as text (no blue text-selection rectangle over the filename).
3. Single-click a file row (e.g. README.md) — the filename turns white (`#E6EDF3`) and the row gets a subtle background. Move the mouse over a different row WITHOUT clicking — the original row's filename STAYS WHITE. The hovered row shows only the background tint, but its filename stays muted grey. Move the mouse out of the tree entirely — the clicked row's background is still visible.
4. Arrow-down / Arrow-up on the keyboard — the white-text row moves with the keyboard. This is the intended behaviour (keyboard nav drives selectedIndex).
5. Repeat (3) and (4) after clicking the tree-mode toggle to confirm behaviour is identical in tree mode.

Automated:
- pnpm test --run  →  all pass, including 2 new context-menu tests + 4 new file-tree tests.
- pnpm tsc --noEmit  →  clean.
</verification>

<success_criteria>
- [ ] `colors.bgSurface` hover tint visible on every ContextMenu item (main + submenu)
- [ ] No browser text selection on right-click of any file-tree row (both flat and tree modes)
- [ ] Click-selected row's white filename color + background persist while hovering other rows
- [ ] Keyboard navigation still drives the white-text row (unchanged)
- [ ] `pnpm test --run` all green
- [ ] `pnpm tsc --noEmit` exit 0
- [ ] All 3 changes applied to BOTH render paths where applicable (flat + tree)
</success_criteria>

<output>
After completion, create `.planning/quick/260416-uig-fix-3-file-tree-polish-bugs-dropdown-hov/260416-uig-SUMMARY.md` noting: files touched, grep-verifiable diffs, test counts before/after, any follow-ups discovered.
</output>
