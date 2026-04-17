---
phase: quick-260417-hgw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/file-tree.tsx
  - src/components/file-tree.test.tsx
autonomous: false
requirements:
  - QUICK-260417-HGW
must_haves:
  truths:
    - "Creating a new file via any entry point (header [+], context menu on folder, context menu on file) opens the file in a tab"
    - "The newly-created file's tab is set as the active unified tab"
    - "The FileTree row for the newly-created file is selected (selectedIndex points at it)"
    - "Creating a new file or folder inside a collapsed parent folder expands that folder so the new item is visible"
    - "Creating a new file or folder inside an already-expanded parent folder does NOT collapse it"
    - "Creating via the header [+] with a collapsed folder selected also expands that folder (parity with row context menu)"
  artifacts:
    - path: "src/components/file-tree.tsx"
      provides: "Post-create hook that opens file in tab + selects row, and pre-create expand-if-collapsed for parent folder across all three creation entry points"
      contains: "file-opened CustomEvent dispatch after createFile success"
    - path: "src/components/file-tree.test.tsx"
      provides: "Regression tests for the two new behaviors"
  key_links:
    - from: "InlineCreateRow.commit (file-tree.tsx)"
      to: "document dispatch of 'file-opened' CustomEvent"
      via: "after createFile() resolves, dispatch {path, name} so main.tsx's file-opened handler runs openEditorTab (which sets activeUnifiedTabId)"
      pattern: "document.dispatchEvent\\(new CustomEvent\\('file-opened'"
    - from: "InlineCreateRow.commit (file-tree.tsx)"
      to: "revealFileInTree after tree refresh"
      via: "after git-status-changed refresh completes, selectedIndex anchors to the new file path"
      pattern: "revealFileInTree\\("
    - from: "openHeaderCreateMenu (file-tree.tsx)"
      to: "toggleTreeNode on collapsed target folder"
      via: "mirror the expand-if-collapsed logic that buildRowMenuItems already has for folder-rows"
      pattern: "if \\(.*is_dir && !node\\.expanded\\) .*toggleTreeNode"
---

<objective>
Fix two FileTree UX behaviors for file/folder creation.

**Behavior 1 (new file auto-open):** When the user creates a new file via any
entry point (header `[+]`, row context menu on a folder, row context menu on a
file), the newly-created file is opened in an editor tab, that tab becomes the
active unified tab, and the FileTree row for the new file is selected.

**Behavior 2 (auto-expand parent on create):** When the user creates a new
file OR folder inside a selected folder in tree mode, that folder is expanded
if collapsed so the new item is visible. If the folder is already expanded,
nothing changes (no collapse toggle). This already works for row-context-menu
creations but NOT for header `[+]` creations — parity must be achieved.

Purpose: The user reported that after creating a file there is no feedback
loop — the file appears in the tree but nothing opens, and when creating
inside a collapsed folder the new item is hidden. This makes the create flow
feel broken.

Output: Updated `file-tree.tsx` with post-create hooks in `InlineCreateRow`
and parity fix in `openHeaderCreateMenu`, plus regression tests.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/file-tree.tsx
@src/components/file-tree.test.tsx

<interfaces>
<!-- Key types and contracts extracted from the codebase. Executor should use -->
<!-- these directly rather than re-reading the whole file. -->

From src/components/unified-tab-bar.tsx:
```typescript
// Opens a file as a PREVIEW tab (single-click behavior). If a preview tab exists,
// it is replaced. If the file is already open, the existing tab is focused.
// IMPORTANT: this function always sets activeUnifiedTabId to the opened tab.
export function openEditorTab(filePath: string, fileName: string, content: string): void;

// Opens a file as a PINNED tab (double-click behavior). Same focus semantics.
export function openEditorTabPinned(filePath: string, fileName: string, content: string): void;

export const activeUnifiedTabId: Signal<string | null>;
export const editorTabs: Signal<EditorTabData[]>;
```

From src/services/file-service.ts:
```typescript
// Creates an empty file. On success, emits 'git-status-changed' which the
// FileTree already listens for — that triggers refreshTreePreservingState().
export async function createFile(path: string): Promise<void>;

// Creates a directory. Also emits 'git-status-changed' on success.
export async function createFolder(path: string): Promise<void>;
```

From src/main.tsx (existing handler, already wired — do NOT add another):
```typescript
// Step 7: file-opened handler -- opens editor tab as preview (EDIT-01)
document.addEventListener('file-opened', async (e: Event) => {
  const { path, name } = (e as CustomEvent).detail;
  const content = await invoke<string>('read_file_content', { path });
  openEditorTab(path, name, content);  // <-- sets activeUnifiedTabId
});
```

From src/components/file-tree.tsx (relevant exports & signals already in scope):
```typescript
const selectedIndex = signal(-1);
const treeNodes = signal<TreeNode[]>([]);
const flattenedTree = computed(() => flattenTree(treeNodes.value));
const viewMode = signal<'flat' | 'tree'>('tree');
const activeCreateRow = signal<CreateRowState | null>(null);

async function toggleTreeNode(node: TreeNode): Promise<void>;
async function loadTreeChildren(node: TreeNode): Promise<void>;
export async function revealFileInTree(filePath: string): Promise<void>;

// InlineCreateRow component already calls createFile/createFolder then onDone().
// onDone() sets activeCreateRow.value = null; that's the only post-create hook
// today — we must add an onCreated(path, kind) callback or inline the new logic.
```

**Critical note on event flow:** `createFile(path)` emits `git-status-changed`.
The FileTree's existing listener calls `refreshTreePreservingState()`, which
re-anchors `selectedIndex` to the PREVIOUSLY-selected path. So if we naively
dispatch `file-opened` before or after `createFile`, the tree-refresh will
overwrite our selection. We must either:
  (a) Call `revealFileInTree(newPath)` AFTER the refresh settles (await a
      microtask or chain on the same promise), OR
  (b) Have `refreshTreePreservingState` accept an optional "reveal-after" path.

Option (a) is simpler and matches the existing `pendingRevealPath` deferral
pattern. Use `requestAnimationFrame` after `createFile` resolves to let the
git-status-changed → refreshTreePreservingState cycle finish, then call
`revealFileInTree(target)`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add post-create hook in InlineCreateRow to open file in tab + select + expand parent</name>
  <files>src/components/file-tree.tsx</files>
  <behavior>
    - When `createFile()` resolves successfully, a `file-opened` CustomEvent is dispatched with `{path, name}` matching the newly-created file. main.tsx's existing handler will pick this up, read content, and call `openEditorTab` (which sets `activeUnifiedTabId` — tab auto-selected).
    - After the tree refresh settles (one `requestAnimationFrame` tick is sufficient since `git-status-changed` refresh is synchronous within microtasks), `revealFileInTree(target)` is called so `selectedIndex` anchors to the new file's row.
    - When `createFolder()` resolves, do NOT dispatch `file-opened` (folders are not openable) but DO call `revealFileInTree(target)` so the new folder row becomes selected.
    - Pre-create expand: if `parentDir` matches a collapsed folder node in `flattenedTree`, expand it BEFORE calling `createFile/createFolder`. This ensures the InlineCreateRow renders in the correct location. If the parent is already expanded, do nothing (no collapse). The existing row-context-menu path at lines 1180-1184 / 1196-1199 already does this for its own flow; we need the equivalent inside `commit()` as a defensive measure AND inside `openHeaderCreateMenu` (see Task 2).
    - Edge case: flat mode. In flat mode there is no tree expansion concept — just call `revealFileInTree(target)` which handles flat-mode reveal via `loadDir(parentPath)` then selecting.
    - File tab open behavior mirrors single-click (preview tab, not pinned) — use `file-opened` not `file-opened-pinned`.
  </behavior>
  <action>
    Modify `InlineCreateRow` in `src/components/file-tree.tsx` (around lines 702-806).

    Step A — extend the component's `onDone` callback API. Change the prop from:
      `onDone: () => void`
    to:
      `onDone: (created?: { path: string; name: string; kind: 'file' | 'folder' }) => void`
    (Backwards-compatible: Escape/cancel calls `onDone()` with no argument; successful commit calls `onDone({ path: target, name: name.trim(), kind })`.)

    Step B — in `commit()`, after the successful `createFile(target)` / `createFolder(target)` call (before the existing `onDone()` call), compute:
      ```ts
      const createdName = name.trim();
      const createdPath = target;
      onDone({ path: createdPath, name: createdName, kind });
      ```
    Leave error paths and the Escape/cancel path calling `onDone()` with no argument.

    Step C — update BOTH `onDone` call-sites where `<InlineCreateRow>` is rendered (search for `onDone={() => { activeCreateRow.value = null; }}` — there are two occurrences, flat mode around line 1518 and tree mode around line 1595). Replace each with:
      ```tsx
      onDone={(created) => {
        activeCreateRow.value = null;
        if (!created) return;  // cancel / Escape path
        // Fire-and-forget: open file in tab (for files only) and reveal in tree.
        // Tree refresh from git-status-changed is synchronous-within-microtasks, so
        // rAF is sufficient to let refreshTreePreservingState finish before we
        // re-anchor selectedIndex via revealFileInTree.
        if (created.kind === 'file') {
          document.dispatchEvent(new CustomEvent('file-opened', {
            detail: { path: created.path, name: created.name }
          }));
        }
        requestAnimationFrame(() => {
          void revealFileInTree(created.path);
        });
      }}
      ```

    Step D — defensive pre-create expand inside `commit()`. Just before the
    `await createFile(target)` / `await createFolder(target)` line, if we are
    in tree mode, ensure `parentDir` is expanded:
      ```ts
      if (viewMode.value === 'tree') {
        const parentNode = flattenedTree.value.find(n => n.entry.is_dir && n.entry.path === parentDir);
        if (parentNode && !parentNode.expanded) {
          await toggleTreeNode(parentNode);
        }
      }
      ```
    This is a defensive guard — the row-context-menu flow already pre-expands
    via `buildRowMenuItems`, but the header `[+]` flow does not (Task 2 adds
    it at the menu level, but this defensive check in `commit()` means the
    InlineCreateRow will render correctly even if a new creation entry point
    is added later without its own expand logic).

    Do NOT modify the existing `git-status-changed` listener. Do NOT modify
    `refreshTreePreservingState`. Do NOT add a new Tauri command. The existing
    `file-opened` CustomEvent → main.tsx → `openEditorTab` chain already sets
    `activeUnifiedTabId`; we piggyback on it.

    Why `revealFileInTree` after the tree refresh: `refreshTreePreservingState`
    re-anchors `selectedIndex` to the PREVIOUSLY-selected path. Our new file did
    not exist before, so it won't match. We must explicitly reveal it after the
    refresh completes. `requestAnimationFrame` is a safe "next tick" since
    Preact signal updates flush in microtasks and DOM updates flush before rAF.
  </action>
  <verify>
    <automated>pnpm vitest run src/components/file-tree.test.tsx --reporter=verbose</automated>
  </verify>
  <done>
    - `InlineCreateRow` commits successfully and dispatches `file-opened` for files.
    - `revealFileInTree` is called on the new path after commit.
    - Collapsed parent folder auto-expands before the create commits.
    - Tests pass (new tests added in Task 2; existing tests still green).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add expand-if-collapsed parity to openHeaderCreateMenu + regression tests</name>
  <files>src/components/file-tree.tsx, src/components/file-tree.test.tsx</files>
  <behavior>
    - When the user opens the header `[+]` dropdown and picks "New File" or "New Folder" while a collapsed folder is selected, that folder expands so the InlineCreateRow renders beneath it.
    - If the folder is already expanded, nothing changes (no collapse toggle).
    - If no folder is selected (e.g. a file is selected, or no selection), existing behavior is preserved — `resolveHeaderCreateTarget()` returns the file's parent or project root and no expand is needed.
    - Regression tests cover:
      (a) Header [+] → New File with collapsed selected folder → folder expanded before InlineCreateRow renders.
      (b) Header [+] → New File with already-expanded selected folder → no toggle (still expanded).
      (c) InlineCreateRow commit of a new file → `file-opened` CustomEvent dispatched with correct `{path, name}`.
      (d) InlineCreateRow commit of a new folder → no `file-opened` dispatched; reveal happens.
  </behavior>
  <action>
    **Part A — production fix in `src/components/file-tree.tsx`:**

    Modify `openHeaderCreateMenu` (around lines 1106-1130). Before setting
    `activeCreateRow.value`, add the expand-if-collapsed guard. Refactor the
    two menu-item `action` closures to share a helper:

    ```ts
    function openHeaderCreateMenu(e: MouseEvent): void {
      e.preventDefault();
      e.stopPropagation();
      const target = resolveHeaderCreateTarget();

      // Parity with buildRowMenuItems: if the target directory is a collapsed
      // folder currently visible in the tree, expand it before the create row
      // renders. No-op in flat mode and for already-expanded folders.
      async function ensureTargetExpanded(): Promise<void> {
        if (viewMode.value !== 'tree') return;
        const node = flattenedTree.value.find(
          n => n.entry.is_dir && n.entry.path === target
        );
        if (node && !node.expanded) {
          await toggleTreeNode(node);
        }
      }

      const startCreate = (kind: 'file' | 'folder') => {
        void ensureTargetExpanded().then(() => {
          // afterIndex is re-computed post-expand so the InlineCreateRow lands
          // directly under the target folder (its children are now flattened in).
          const afterIdx = flattenedTree.value.findIndex(
            n => n.entry.path === target
          );
          activeCreateRow.value = {
            parentDir: target,
            kind,
            // Fall back to the pre-expand selectedIndex if the target isn't in
            // the flattened tree (flat mode, or target is project root).
            afterIndex: afterIdx >= 0 ? afterIdx : selectedIndex.value,
          };
        });
      };

      const items: ContextMenuItem[] = [
        { label: 'New File',   icon: FilePlus,   action: () => startCreate('file') },
        { label: 'New Folder', icon: FolderPlus, action: () => startCreate('folder') },
      ];
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      headerMenu.value = { x: rect.left, y: rect.bottom + 2, items };
    }
    ```

    Note: `startCreate` returns void (fire-and-forget). The ContextMenu's
    `action` field expects `() => void`, so we wrap the async helper in a
    `void ensureTargetExpanded().then(...)` chain instead of making the action
    itself async.

    **Part B — regression tests in `src/components/file-tree.test.tsx`:**

    Add a new describe block `describe('create-then-open behaviors (quick-260417-hgw)', () => { ... })` with the following tests. Follow the existing file's patterns for imports, `beforeEach`, and mocking (use the same `mockIPC` / `mockInvoke` utilities already in use — check lines 1-60 of the test file for the existing setup).

    Required tests (use test names exactly as specified so they are greppable):
    1. `it('dispatches file-opened CustomEvent after createFile commit', async () => { ... })`
       - Set up tree mode with a project + one folder entry.
       - Mock `createFile` to resolve.
       - Spy on `document.dispatchEvent` (or add a one-shot `file-opened` listener).
       - Open the header `[+]` menu → click "New File" → type "hello.ts" → press Enter.
       - Assert a `file-opened` event fires with `detail.path` ending in `/hello.ts` and `detail.name === 'hello.ts'`.

    2. `it('does NOT dispatch file-opened after createFolder commit', async () => { ... })`
       - Same setup, click "New Folder" instead.
       - After Enter, assert NO `file-opened` event was dispatched.

    3. `it('expands collapsed target folder when header [+] New File is clicked', async () => { ... })`
       - Set up tree mode with a collapsed folder selected (selectedIndex points at it).
       - Mock `list_directory` for the folder's children so `toggleTreeNode` resolves with a child list.
       - Open the header `[+]` menu → click "New File".
       - Wait for the expand promise to resolve (a `flushPromises()` or `await` a `findBy...` query).
       - Assert the folder node is now expanded (its chevron rotation class / `expanded: true` in flattenedTree).
       - Assert the InlineCreateRow input is rendered inside the folder (check its depth / parentDir attribute).

    4. `it('does NOT collapse already-expanded target folder when header [+] New File is clicked', async () => { ... })`
       - Same as #3 but pre-expand the folder.
       - After clicking "New File", assert the folder is STILL expanded (no toggle fired).

    For tests that need to wait for the async `ensureTargetExpanded` to settle,
    use `await waitFor(() => expect(...))` or `await act(async () => { ... })`
    (match the test file's existing async-assertion style — search the test
    file for `waitFor` and `act` occurrences around lines 150-300 for the
    pattern).

    If any existing test breaks due to the prop-signature change to
    `InlineCreateRow` (`onDone` now takes an optional arg), update those tests
    — they should still pass an arg-less arrow function since the args are
    optional.
  </action>
  <verify>
    <automated>pnpm vitest run src/components/file-tree.test.tsx --reporter=verbose</automated>
  </verify>
  <done>
    - Header `[+]` New File / New Folder expand collapsed selected folder before rendering the create row.
    - Already-expanded folders are not toggled.
    - All 4 new tests pass.
    - All previously-passing tests still pass.
    - TypeScript compiles: `pnpm tsc --noEmit` succeeds.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual smoke test in running app</name>
  <files>(no code changes — manual verification only)</files>
  <action>This is a human-verification checkpoint. See &lt;how-to-verify&gt; for the 6-step smoke test.</action>
  <what-built>
    - Post-create hook in InlineCreateRow that dispatches `file-opened` + reveals new file in tree.
    - Expand-if-collapsed parity in header `[+]` menu.
    - Regression tests.
  </what-built>
  <how-to-verify>
    The user runs the app (they have the dev server open). Perform these
    manual checks in the running Efxmux window:

    1. **Header `[+]` → New File, no selection.**
       - With nothing selected in the FileTree, click the header `[+]` icon.
       - Click "New File". Type `smoketest-a.md`. Press Enter.
       - Expected: a new `smoketest-a.md` row appears in the tree root. An
         editor tab labeled `smoketest-a.md` opens and becomes the active tab.
         The tree row for `smoketest-a.md` is highlighted (selected background).

    2. **Header `[+]` → New File, collapsed folder selected.**
       - Click a folder row in the tree (keep it collapsed). Click header `[+]`.
       - Click "New File". Type `smoketest-b.md`. Press Enter.
       - Expected: the selected folder auto-expands (chevron rotates). The new
         file appears INSIDE that folder. A tab opens. The new row is selected.

    3. **Header `[+]` → New File, already-expanded folder selected.**
       - Expand a folder first (click chevron). Keep it selected. Click `[+]`.
       - Click "New File". Type `smoketest-c.md`. Press Enter.
       - Expected: folder stays expanded (no collapse). New file appears inside.
         Tab opens. Row selected.

    4. **Row context menu → New File on a collapsed folder.**
       - Right-click a collapsed folder. Click "New File" in the menu.
       - Type `smoketest-d.md`. Press Enter.
       - Expected: folder auto-expands. File appears. Tab opens. Row selected.

    5. **Row context menu → New Folder on a collapsed folder.**
       - Right-click a collapsed folder. Click "New Folder". Type `smoketest-e`.
         Press Enter.
       - Expected: parent folder auto-expands. New `smoketest-e` folder appears.
         NO tab opens (folders are not openable). New folder row selected.

    6. **Cleanup.** Delete all `smoketest-*` artifacts via the tree's delete
       action so the repo is clean.

    Report: "approved" if all 6 steps match expectations, OR describe any
    deviation so the executor can debug.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues observed</resume-signal>
  <verify>Human types "approved" in chat after running all 6 smoke-test steps.</verify>
  <done>User reports "approved" or executor addresses any deviations reported.</done>
</task>

</tasks>

<verification>
1. `pnpm vitest run src/components/file-tree.test.tsx` — all tests pass.
2. `pnpm tsc --noEmit` — no type errors.
3. `pnpm lint` (if configured) — no new lint warnings on modified lines.
4. Manual smoke test (Task 3) — all 6 steps behave as expected.
</verification>

<success_criteria>
- Creating a file via ANY of the three entry points results in: a new editor
  tab, that tab being the active tab, and the FileTree row for the new file
  being selected.
- Creating a file or folder inside a collapsed selected folder expands that
  folder. Creating inside an already-expanded folder does not collapse it.
- No regressions in the existing 30+ FileTree tests.
- No new runtime errors in the browser devtools console during the smoke test.
</success_criteria>

<output>
After completion, create `.planning/quick/260417-hgw-when-i-create-a-file-it-should-set-to-se/260417-hgw-SUMMARY.md`
following the standard quick-task SUMMARY template:
- What was built (2-3 sentences)
- Files modified (with line-level rationale for non-obvious changes)
- Tests added (names + what they cover)
- Commit hash(es) produced
- Any follow-ups surfaced during execution
</output>
