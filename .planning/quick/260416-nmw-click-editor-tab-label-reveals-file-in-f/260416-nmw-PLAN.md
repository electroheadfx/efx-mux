---
phase: quick
plan: 260416-nmw
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/sidebar.tsx
  - src/components/file-tree.tsx
  - src/components/unified-tab-bar.tsx
  - src/state-manager.ts
autonomous: true
requirements: [quick-260416-nmw]
must_haves:
  truths:
    - "Single-clicking an editor tab label reveals the file in the file tree"
    - "If Files tab is active in left sidebar, file is revealed there"
    - "If Files tab is active in right panel, file is revealed there"
    - "If Files tab is active in both, file is revealed in both"
    - "If Files tab is not active anywhere, left sidebar switches to Files tab and reveals"
    - "Double-click on tab label still triggers inline rename (no conflict)"
  artifacts:
    - path: "src/components/file-tree.tsx"
      provides: "revealFileInTree function that expands folders and selects target file"
    - path: "src/components/sidebar.tsx"
      provides: "Exported leftSidebarActiveTab signal for external tab switching"
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Click handler on editor tab label span that dispatches reveal-file-in-tree event"
  key_links:
    - from: "unified-tab-bar.tsx label click"
      to: "file-tree.tsx revealFileInTree"
      via: "CustomEvent 'reveal-file-in-tree'"
      pattern: "dispatchEvent.*reveal-file-in-tree"
    - from: "unified-tab-bar.tsx label click"
      to: "sidebar.tsx leftSidebarActiveTab"
      via: "signal import to switch sidebar to Files tab"
      pattern: "leftSidebarActiveTab.value.*files"
---

<objective>
Click on an editor tab label (single click) reveals/selects the file in the file tree, with smart sidebar routing.

Purpose: When working with many files, clicking a tab label lets you quickly locate the file in the tree without manually navigating. This mirrors VS Code's "Reveal in Explorer" but is triggered implicitly by clicking the tab label.

Output: Updated unified-tab-bar.tsx, file-tree.tsx, sidebar.tsx, and state-manager.ts with reveal-in-tree functionality.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/components/unified-tab-bar.tsx (renderTab function, label span):
The label `<span>` at line ~1013-1029 has `onDblClick` for rename. Single-click on this span
currently does nothing special (the outer div's `onClick` handles tab switching).
The tab types include `EditorTabData` which has `filePath` and `fileName`.

From src/components/sidebar.tsx:
- `const activeTab = signal<SidebarTab>('projects')` (line 41) -- LOCAL signal, NOT exported
- `type SidebarTab = 'projects' | 'files' | 'git'` (line 40)
- The sidebar renders `<FileTree />` when `activeTab.value === 'files'`

From src/state-manager.ts:
- `export const rightTopTab = signal('File Tree')` (line 45) -- already exported
- Right panel shows FileTree when `rightTopTab.value === 'File Tree'`

From src/components/file-tree.tsx:
- Uses tree mode by default: `const viewMode = signal<'tree'>('tree')`
- Tree nodes: `const treeNodes = signal<TreeNode[]>([])`
- `selectedIndex` signal controls which entry is highlighted
- `flattenedTree` computed gives the flattened list of visible nodes
- `toggleTreeNode(node)` expands a folder
- `loadTreeChildren(node)` loads children from disk
- File entries have `{ name, path, is_dir }` shape
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Export left sidebar tab signal and add revealFileInTree to file-tree</name>
  <files>src/components/sidebar.tsx, src/components/file-tree.tsx</files>
  <action>
1. In `sidebar.tsx`, export the `activeTab` signal by renaming it to `leftSidebarActiveTab` and exporting it:
   - Change line 41 from `const activeTab = signal<SidebarTab>('projects')` to `export const leftSidebarActiveTab = signal<SidebarTab>('projects')`
   - Also export the `SidebarTab` type: `export type SidebarTab = 'projects' | 'files' | 'git'`
   - Update ALL references within sidebar.tsx from `activeTab` to `leftSidebarActiveTab` (TabRow, TabContent, etc.)

2. In `file-tree.tsx`, add and export a `revealFileInTree(filePath: string)` function that:
   a. Gets the active project root path via `getActiveProject()?.path`
   b. Computes the relative path segments from project root to the target file
   c. If in tree mode (`viewMode.value === 'tree'`):
      - Walks the tree from root, expanding each folder segment along the path using `toggleTreeNode` / `loadTreeChildren`
      - After all folders are expanded, finds the target file node in `flattenedTree` and sets `selectedIndex` to its index
   d. If in flat mode (`viewMode.value === 'flat'`):
      - Navigates to the file's parent directory using `loadDir`
      - After loading, finds the file in `entries` and sets `selectedIndex`
   e. The function must be async (folder expansion requires invoke calls)
   f. After revealing, scroll the selected entry into view by dispatching a `'file-tree-scroll-to-selected'` custom event
   g. In the FileTree component, add a listener for `'file-tree-scroll-to-selected'` that scrolls the selected row into view using `scrollIntoView({ block: 'nearest' })` on the element with the matching index. Use a `data-file-tree-index` attribute on each row to find it.

3. Add `data-file-tree-index={i}` attribute to each rendered row (both flat mode and tree mode) in the FileTree component's JSX, so `revealFileInTree` can scroll to it.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - `leftSidebarActiveTab` is exported from sidebar.tsx and all internal references updated
    - `SidebarTab` type is exported
    - `revealFileInTree(filePath)` is exported from file-tree.tsx
    - Function expands tree nodes along the path and selects the target file
    - Selected entry scrolls into view
    - Both tree mode and flat mode are handled
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire tab label click to reveal file with smart sidebar routing</name>
  <files>src/components/unified-tab-bar.tsx</files>
  <action>
1. Import `leftSidebarActiveTab` from `'../components/sidebar'` and `rightTopTab` from `'../state-manager'` (rightTopTab is already used elsewhere, verify it is imported).

2. Import `revealFileInTree` from `'../components/file-tree'`.

3. In the `renderTab` function, modify the label `<span>` (the one at ~line 1013-1029 that currently has only `onDblClick` for rename) to add single-click reveal behavior for editor tabs.

   The challenge: single-click must reveal, double-click must rename. Use a timer pattern (similar to file-tree.tsx's `handleFileClick`):

   Add a module-level click timer:
   ```typescript
   let tabLabelClickTimer: ReturnType<typeof setTimeout> | null = null;
   let pendingTabLabelClick: string | null = null;
   ```

   Replace the label `<span>`'s event handlers. The `onDblClick` currently calls `renamingTabId.value = tab.id`. Change to:
   - `onClick` (on the label span, with `e.stopPropagation()` to prevent the outer div's tab-switch click from also firing -- BUT the tab should still switch, so call `onClick(tab)` from within the handler before revealing):
     - If timer is pending for same tab: this is a double-click. Clear timer, set `renamingTabId.value = tab.id`. Return.
     - Otherwise: set timer with 250ms delay. On timeout, determine routing and call `revealFileInTree`.
   - Remove the separate `onDblClick` handler on the span (the double-click is now detected via the timer pattern).

   Routing logic (inside the timer callback, only for `tab.type === 'editor'`):
   ```typescript
   const leftHasFiles = leftSidebarActiveTab.value === 'files';
   const rightHasFiles = rightTopTab.value === 'File Tree';

   if (!leftHasFiles && !rightHasFiles) {
     // Neither has Files tab active -- open Files in left sidebar
     leftSidebarActiveTab.value = 'files';
   }
   // Reveal in tree (the FileTree component listens in both sidebars)
   revealFileInTree(tab.filePath);
   ```

   For non-editor tabs (terminal, git-changes), the click should just do nothing special on the label (no reveal needed). The outer div already handles tab switching.

4. IMPORTANT: Do NOT change the outer `<div>`'s `onClick={() => onClick(tab)}` behavior. The label span click handler should call `e.stopPropagation()` and then manually call the parent's `onClick(tab)` to ensure the tab still switches when the label is clicked. The reveal happens in addition to the tab switch.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - Clicking an editor tab label (single click) switches to that tab AND reveals the file in the tree
    - Double-clicking still triggers inline rename
    - Smart routing: if Files tab not active anywhere, left sidebar switches to Files
    - If Files tab active in left and/or right, reveal happens in the active instance(s)
    - Non-editor tabs (terminal, git-changes) are unaffected
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit`
2. Manual test sequence:
   - Open a file in an editor tab
   - Single-click the tab label -- file should be highlighted in the file tree
   - Double-click the tab label -- inline rename input should appear (no reveal)
   - Switch sidebar to Projects tab, click an editor tab label -- sidebar should switch to Files tab and reveal
   - If right panel has File Tree active, file should also be revealed there
</verification>

<success_criteria>
- Single-click on editor tab label reveals file in file tree with correct sidebar routing
- Double-click on editor tab label still triggers inline rename
- No regression in tab switching, drag reorder, or close behavior
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260416-nmw-click-editor-tab-label-reveals-file-in-f/260416-nmw-SUMMARY.md`
</output>
