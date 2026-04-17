---
phase: quick-260417-iat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/file-tree.tsx
  - src/components/file-tree.test.tsx
autonomous: false
requirements:
  - QUICK-260417-IAT-01
must_haves:
  truths:
    - "User can click a folder row, then press Delete (or Backspace on flat mode is reserved for parent-nav, or Cmd+Backspace) and see the delete ConfirmModal for that folder"
    - "User can click a folder row in tree mode, then press Delete, and see the ConfirmModal titled 'Delete folder {name}?'"
    - "User can click a folder row in flat mode and the folder remains the selected row (no immediate auto-navigation into the folder on single-click); Enter or double-click still navigates into the folder"
    - "Clicking any row (file or folder) moves keyboard focus to the scroll container so the next keydown fires handleKeydown"
    - "Existing behaviors preserved: context-menu Delete on folders still works, flat-mode plain Backspace still navigates to parent when focus is on the container and no meta key, Cmd+Backspace via the native menu still routes through 'delete-selected-tree-row'"
  artifacts:
    - path: "src/components/file-tree.tsx"
      provides: "Updated row onClick handlers + container focus + flat-mode double-click-to-navigate"
      contains: "scrollContainerRef.current?.focus()"
    - path: "src/components/file-tree.test.tsx"
      provides: "Regression test: click folder row in tree mode → press Delete → ConfirmModal with 'Delete folder' title appears"
      contains: "Delete folder"
  key_links:
    - from: "src/components/file-tree.tsx row onClick (flat + tree)"
      to: "scrollContainerRef.current.focus()"
      via: "explicit .focus() after selectedIndex assignment"
      pattern: "scrollContainerRef\\.current\\?\\.focus"
    - from: "src/components/file-tree.tsx flat-mode row onClick"
      to: "loadDir (no longer called on single-click for folders)"
      via: "single-click sets selection only; double-click (or Enter) navigates"
      pattern: "onDblClick|detail\\s*===?\\s*2"
---

<objective>
Fix bug: pressing Delete / Backspace / Cmd+Backspace on a folder in the file tree does not open the delete ConfirmModal, even though the dropdown (context-menu) Delete works. Extend the existing keyboard shortcut path so that folder selection via click leaves the folder selected AND gives keyboard focus to the container, enabling the already-wired delete flow to fire for folders.

Purpose: The keyboard delete path already supports folders at the handler level (`handleFlatKeydown` case 'Delete'/'Backspace' and `handleTreeKeydown` case 'Delete'/'Backspace', plus the 'delete-selected-tree-row' listener — none filter by `is_dir`). Two real gaps cause the observed failure:
  1. **Focus gap (applies to both flat and tree mode):** The scroll container has `tabIndex={0}` and `onKeyDown={handleKeydown}` (file-tree.tsx:1487-1488), but clicking a row (a nested div without tabindex) does NOT move focus to the container. Subsequent keydowns never reach `handleKeydown`. The dropdown works because the context-menu "Delete" action calls `triggerDeleteConfirm(entry)` directly, bypassing the keyboard path.
  2. **Flat-mode navigation race:** Clicking a folder in flat mode calls `loadDir(entry.path)` (file-tree.tsx:1522), which sets `selectedIndex.value = -1` (file-tree.tsx:436). Even if focus reached the container, the now-selected index is -1 and `entries.value[-1]` is undefined, so Delete is a no-op.

Output: file-tree.tsx patched so (a) row onClick moves keyboard focus to the scroll container and (b) flat-mode folder single-click keeps the folder as the selected row, with double-click (or Enter, already wired) used to navigate into the folder. Tree mode folder click remains a toggle-expand — its selectedIndex is already preserved. A new test exercises click-folder → press Delete → ConfirmModal path.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/18-file-tree-enhancements/18-UI-SPEC.md

<interfaces>
<!-- Key code locations the executor must modify. Extracted from src/components/file-tree.tsx. -->
<!-- Line numbers are as of the commit at the top of the branch; re-read before editing. -->

### Shared state (module-level signals, file-tree.tsx:34)

```ts
const viewMode = signal<'flat' | 'tree'>('tree');  // default is tree
const selectedIndex = signal<number>(-1);          // -1 = no selection
const entries = signal<FileEntry[]>([]);           // flat-mode list
const flattenedTree = computed(() => flattenTree(treeNodes.value));  // tree-mode list
```

### Scroll container with tabIndex + onKeyDown (file-tree.tsx:1478-1489)

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
// ...
<div
  ref={scrollContainerRef}
  style={{ /* ... */ }}
  tabIndex={0}
  onKeyDown={handleKeydown}
>
```

`scrollContainerRef` already exists (declared at line 832 for Finder-drop hit-testing). Reuse it to call `.focus()`.

### Flat-mode row onClick (file-tree.tsx:1519-1526)

```tsx
onClick={() => {
  selectedIndex.value = i;
  if (entry.is_dir) {
    loadDir(entry.path);  // <-- this resets selectedIndex to -1 inside loadDir (line 436)
  } else {
    handleFileClick(entry.path, entry.name);
  }
}}
```

### Tree-mode row onClick (file-tree.tsx:1603-1610)

```tsx
onClick={() => {
  selectedIndex.value = i;
  if (node.entry.is_dir) {
    toggleTreeNode(node);  // preserves selectedIndex; flat-pre-order keeps folder at index i
  } else {
    handleFileClick(node.entry.path, node.entry.name);
  }
}}
```

### Keyboard delete handlers (already support folders — DO NOT duplicate)

`handleFlatKeydown` — file-tree.tsx:1275-1291:
```ts
case 'Delete': {
  e.preventDefault();
  const entry = entries.value[selectedIndex.value];
  if (entry) void triggerDeleteConfirm(entry);
  break;
}
case 'Backspace': {
  if (e.metaKey) {
    e.preventDefault();
    const entry = entries.value[selectedIndex.value];
    if (entry) void triggerDeleteConfirm(entry);
    break;
  }
  e.preventDefault();
  navigateToParent();  // plain Backspace = flat-mode parent nav (unchanged)
  break;
}
```

`handleTreeKeydown` — file-tree.tsx:1349-1363:
```ts
case 'Backspace': {
  if (e.metaKey) {
    e.preventDefault();
    const entry = flattenedTree.value[selectedIndex.value]?.entry;
    if (entry) void triggerDeleteConfirm(entry);
  }
  break;
}
case 'Delete': {
  e.preventDefault();
  const entry = flattenedTree.value[selectedIndex.value]?.entry;
  if (entry) void triggerDeleteConfirm(entry);
  break;
}
```

### Native-menu Cmd+Backspace path (file-tree.tsx:883-897, src-tauri/src/lib.rs:54-60, 217)

Menu item "Delete Selection" emits `delete-selected-tree-row`; listener calls `triggerDeleteConfirm` with the currently-selected entry. No `is_dir` filter — already supports folders. Requires `selectedIndex >= 0` pointing at a real entry.

### Reused delete dispatcher (file-tree.tsx:1033-1069)

```ts
async function triggerDeleteConfirm(entry: FileEntry): Promise<void> {
  // Branches on entry.is_dir for title + child count. Already supports folders.
}
```

This is the single entry point for both dropdown and keyboard paths. **Do not duplicate.** Reuse.
</interfaces>

<decision-record>
### Fix approach (Claude's discretion, constrained by task_context and quick-task rules)

**Scope decision:** Change flat-mode folder single-click from "select + navigate" to "select only". Double-click (or Enter on selected row) navigates into the folder. Rationale:
  - Matches Finder/VS Code/Zed conventions: single-click selects, double-click (or Enter) opens.
  - Preserves tree-mode behavior exactly (single-click still toggles expand there).
  - Keeps `loadDir`'s `selectedIndex = -1` reset untouched (called only on explicit navigation, not on selection).
  - No duplication of delete logic — reuses the existing `triggerDeleteConfirm` + existing keyboard handlers.

**Focus decision:** Call `scrollContainerRef.current?.focus({ preventScroll: true })` at the start of every row onClick (flat file, flat folder, tree file, tree folder). `preventScroll: true` avoids the container jumping during a click. This makes the already-wired `onKeyDown={handleKeydown}` fire after a click without requiring the user to tab into the container first.

**Confirm-before-delete:** Unchanged. The folder path already uses `count_children` + "Delete folder {name}?" title + "permanently deleted" copy inside `triggerDeleteConfirm` (file-tree.tsx:1033-1069) — all reached by the same keyboard path. No new confirmation logic needed.

**Plain Backspace in flat mode:** Must continue to navigate to parent (not delete) per existing behavior documented at file-tree.tsx:1288-1290 and covered by the regression test at file-tree.test.tsx:205-214. Do not touch that branch.
</decision-record>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wire folder-delete keyboard path (focus on click + flat-mode single-click selects folder without navigating)</name>
  <files>src/components/file-tree.tsx, src/components/file-tree.test.tsx</files>
  <behavior>
    After this task, the following must be true. Add/update tests in `file-tree.test.tsx` to codify these as assertions BEFORE editing `file-tree.tsx` (TDD red → green):

    - Test A (tree mode, folder delete via keyboard):
      * Set `viewMode.value = 'tree'` (default, but be explicit), render `<><FileTree /><ConfirmModal /></>`.
      * Mock `list_directory` to return `MOCK_ENTRIES` (includes `src` folder at index 0).
      * Wait for tree to hydrate (rows rendered).
      * `fireEvent.click(rows[0])` — clicks the `src` folder row.
      * `fireEvent.keyDown(document.querySelector('[tabindex="0"]'), { key: 'Delete' })`.
      * Wait for `count_children` (mocked to return `{ files: 0, folders: 0, total: 0, capped: false }`) + modal render.
      * Assert: `document.body.textContent` matches `/Delete folder src\?/` (the folder title template from file-tree.tsx:1051).
      * Assert: `document.body.textContent` matches `/permanently deleted/`.

    - Test B (focus on click, flat mode):
      * Render `<FileTree />`, then switch to flat mode: `viewMode.value = 'flat'` (or click the flat-mode icon button).
      * Wait for rows.
      * Click any row. Assert: `document.activeElement === document.querySelector('[tabindex="0"]')`. (Confirms the focus fix.)

    - Test C (flat-mode folder single-click keeps selection, does NOT auto-navigate):
      * Set flat mode, render `<FileTree />`.
      * Wait for rows. Note `currentPath.value` before click.
      * Click `rows[0]` (the `src` folder).
      * Assert: `selectedIndex.value === 0` (folder is selected).
      * Assert: `currentPath.value` is UNCHANGED (no `loadDir` was called on single-click). OR: assert that `invoke('list_directory', ...)` was called only for the initial mount, not after the click. Use whichever the existing mock gives easy access to; if tricky, assert `currentPath.value` equals the project root value set in `beforeEach`.
      * Then `fireEvent.keyDown(document.querySelector('[tabindex="0"]'), { key: 'Delete' })`, wait for modal, assert `/Delete folder src\?/` appears. (Proves flat-mode folder-delete also works now.)

    - Test D (flat-mode folder double-click still navigates):
      * Set flat mode, render `<FileTree />`, wait for rows.
      * `fireEvent.dblClick(rows[0])` (the `src` folder) — or simulate via two clicks if `dblClick` is not wired; prefer the onDblClick prop approach.
      * Assert: `currentPath.value === '/tmp/proj/src'` (navigation happened). Given the mock `list_directory` returns `MOCK_ENTRIES` regardless of path, this still works.

    - Existing tests must still pass, including:
      * `'pressing Delete on focused scroll container surfaces ConfirmModal with "permanently deleted" copy'` (file-tree.test.tsx:170) — still green because clicking rows[0] now keeps the folder selected AND focuses the container; then Delete fires and modal appears.
      * `'pressing plain Backspace still navigates to parent in flat mode'` (file-tree.test.tsx:205) — still green: plain Backspace branch is untouched.
      * `'delete-selected-tree-row event path routes to triggerDeleteConfirm'` (file-tree.test.tsx:216) — still green: native-menu listener untouched.
      * All drag-to-move, mouseup-rename, and context-menu tests — untouched code paths.
  </behavior>
  <action>
    Execute in RED → GREEN order.

    **RED phase:** Add the four new assertions above to `src/components/file-tree.test.tsx`. Keep the existing `describe('delete key (UAT Test 5 fix)', ...)` structure; add:
      - `it('clicking a folder in tree mode and pressing Delete opens the Delete folder ConfirmModal', ...)` (Test A).
      - `it('clicking a row moves keyboard focus to the scroll container', ...)` (Test B) — mode-agnostic; assert after a click in default (tree) mode.
      - `it('flat-mode folder single-click selects without auto-navigating, then Delete deletes the folder', ...)` (Test C).
      - `it('flat-mode folder double-click still navigates into the folder', ...)` (Test D).
    Run `pnpm test -- file-tree` and confirm the new tests fail for the expected reasons (folder title not shown, `activeElement` is body, `currentPath` changed after single-click).

    **GREEN phase:** Edit `src/components/file-tree.tsx`:

    1. **Focus fix — flat-mode row onClick (around file-tree.tsx:1519-1526):** At the very top of the onClick (before any branching), add:
       ```ts
       scrollContainerRef.current?.focus({ preventScroll: true });
       ```
       Then keep `selectedIndex.value = i;` and the file-vs-folder branch below. **Change** the `if (entry.is_dir) { loadDir(entry.path); }` to only set selection (remove the `loadDir` call from the single-click branch — it moves to `onDblClick`). Files still dispatch via `handleFileClick`.

       Also add `onDblClick={() => { if (entry.is_dir) void loadDir(entry.path); }}` on the same row div. (Files: keep the existing single-click `handleFileClick` behavior; no onDblClick handler needed for files — adding one would be a breaking UX change. Folders get the dblclick-to-navigate behavior only.)

    2. **Focus fix — tree-mode row onClick (around file-tree.tsx:1603-1610):** At the top of the onClick, add the same `scrollContainerRef.current?.focus({ preventScroll: true });`. Leave the rest of the handler unchanged (`selectedIndex.value = i;` + `toggleTreeNode(node)` for folders, `handleFileClick(...)` for files). Tree mode already works correctly for folders once focus is on the container.

    3. **Do NOT modify:** `handleFlatKeydown`, `handleTreeKeydown`, `triggerDeleteConfirm`, the `delete-selected-tree-row` listener, the Cmd+Backspace native-menu path in `src-tauri/src/lib.rs`, the plain-Backspace-navigates-to-parent branch, drag-move handlers, or context-menu wiring. They already support folders.

    4. **Verify `scrollContainerRef` is accessible** from the row-render JSX scope (it is — it's declared at file-tree.tsx:832 inside `FileTree()` and both row JSX blocks are inside the same component function).

    Run `pnpm test -- file-tree` and confirm all tests pass (old + new). Run `pnpm tsc --noEmit` (or project equivalent) to confirm no type errors from the new `onDblClick` prop.

    **Checkpoint with user** after automated verification passes, to manually confirm the UX feels right on the French Mac keyboard (per user preferences: Delete key placement is different on AZERTY — but the `Delete` key name here refers to fn+Backspace / forward-delete; Cmd+Backspace is the primary shortcut on macOS and must work via the native menu path, which is untouched).
  </action>
  <verify>
    <automated>pnpm test -- src/components/file-tree.test.tsx</automated>
  </verify>
  <done>
    - New tests A, B, C, D added to `file-tree.test.tsx` and passing.
    - All pre-existing `file-tree.test.tsx` tests still passing (no regressions in delete-key, plain-Backspace-navigate, native-menu-listener, drag-move, rename, or context-menu tests).
    - `pnpm tsc --noEmit` has no new errors.
    - `scrollContainerRef.current?.focus({ preventScroll: true })` added to both flat-mode and tree-mode row onClick handlers.
    - Flat-mode folder single-click sets `selectedIndex` without calling `loadDir`.
    - Flat-mode folder onDblClick calls `loadDir(entry.path)`.
    - No changes to `handleFlatKeydown`, `handleTreeKeydown`, `triggerDeleteConfirm`, the native-menu listener, or `src-tauri/src/lib.rs`.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual verification — folder-delete keyboard shortcut works end-to-end</name>
  <what-built>
    Focus-on-click fix for the file-tree scroll container, and flat-mode single-click now keeps folders selectable (double-click to navigate). The keyboard delete path (Delete, Backspace-on-meta, and the native-menu Cmd+Backspace) now reaches folders via the already-wired `triggerDeleteConfirm` dispatcher, because a row click now places focus on the container AND the folder stays selected.
  </what-built>
  <how-to-verify>
    User runs the locally-running dev server (do not start it — user runs the server per CLAUDE.md) and in the file tree panel:

    1. **Tree mode, folder delete via Delete key (fn+Backspace on most Macs):**
       - Ensure the tree-mode icon is active (default).
       - Click any folder row (e.g., `src/`). The row should visually highlight (selection) and the triangle should toggle expand/collapse.
       - Press the `Delete` key (fn+Backspace on MacBooks, or the dedicated Delete key).
       - Expected: ConfirmModal appears titled `Delete folder {name}?` with copy matching `'{name}' … will be permanently deleted. This cannot be undone.`
       - Click Cancel to dismiss (do not actually delete).

    2. **Tree mode, folder delete via Cmd+Backspace (native menu path):**
       - Click a folder row.
       - Press Cmd+Backspace.
       - Expected: same ConfirmModal as step 1. Cancel to dismiss.

    3. **Flat mode, folder selection does NOT auto-navigate on single-click:**
       - Click the flat-mode icon (list icon) to switch to flat mode.
       - Single-click a folder row (e.g., `src/`).
       - Expected: folder is visually selected, but the tree does NOT navigate into the folder — you still see the project root.
       - Press Delete (or Cmd+Backspace). Expected: ConfirmModal for the folder. Cancel to dismiss.

    4. **Flat mode, folder double-click still navigates:**
       - Still in flat mode, double-click the `src/` folder row.
       - Expected: tree navigates into `src/` (breadcrumb/path indicator updates).

    5. **Regression: file delete still works in both modes:**
       - Click any file row. Press Delete. Expected: ConfirmModal titled `Delete {name}?` (not `Delete folder {name}?`). Cancel.

    6. **Regression: plain Backspace in flat mode navigates to parent (not delete):**
       - Still in flat mode, inside a subfolder (navigate via double-click first).
       - Press plain Backspace (no meta key). Expected: navigates to parent folder. No delete modal appears.

    7. **Regression: right-click → Delete still works on folders and files in both modes.**
  </how-to-verify>
  <resume-signal>Type "approved" to finish, or describe any issue (e.g., "focus not landing on container in flat mode" or "double-click not navigating").</resume-signal>
</task>

</tasks>

<verification>
- Automated test suite `pnpm test -- src/components/file-tree.test.tsx` passes green, including the four new assertions A-D and all pre-existing regression tests.
- `pnpm tsc --noEmit` shows no new type errors.
- Manual verification steps 1-7 in Task 2 all pass.
- No changes to `src-tauri/src/lib.rs` (native menu path untouched).
- No changes to `triggerDeleteConfirm`, `handleFlatKeydown`, `handleTreeKeydown`, or the `delete-selected-tree-row` listener.
</verification>

<success_criteria>
Delete key, Cmd+Backspace (via native menu), and metaKey+Backspace (via JS handler) all open the delete ConfirmModal for a selected folder in both tree mode and flat mode. The context-menu Delete path continues to work as before. The confirm-before-delete behavior (title "Delete folder {name}?", message "'{name}' and {N} items will be permanently deleted") is unchanged — it is already produced by the reused `triggerDeleteConfirm` dispatcher. Focus management is the only behavioral addition; flat-mode folder single-click-to-navigate is replaced with single-click-to-select + double-click-to-navigate (convention-aligned with Finder/VS Code/Zed).
</success_criteria>

<output>
After completion, create `.planning/quick/260417-iat-add-keyboard-shortcut-to-delete-folder-i/260417-iat-SUMMARY.md` summarizing the fix, the two file edits, the four new tests, and any UX note from the manual verification checkpoint.
</output>
