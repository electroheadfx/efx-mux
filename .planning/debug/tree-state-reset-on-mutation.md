---
status: diagnosed
trigger: "Phase 18 UAT Tests 6 and 7: tree expand/collapse state is reset after every create/delete mutation. All open folders collapse back to root."
created: 2026-04-16T21:07:28Z
updated: 2026-04-16T21:07:28Z
---

## Current Focus

hypothesis: "initTree() unconditionally rebuilds treeNodes.value from scratch — every node is recreated with `expanded: false`, so the previous expansion state is wiped. The git-status-changed listener calls initTree() on every mutation, which re-runs that destructive rebuild and collapses all folders."
test: "Read initTree() at file-tree.tsx:195-218 and trace what it does to treeNodes.value when called a second time."
expecting: "If initTree() always sets expanded=false on every node and replaces treeNodes.value wholesale, the bug is confirmed."
next_action: "Diagnosis complete — return ROOT CAUSE FOUND. No code changes per goal: find_root_cause_only."

reasoning_checkpoint:
  hypothesis: "initTree() rebuilds treeNodes.value from scratch with every TreeNode created at expanded=false, so a re-call from the git-status-changed listener wipes all prior expansion state. The bug occurs because the design conflates 'load tree' and 'refresh tree' — they should be separate operations."
  confirming_evidence:
    - "file-tree.tsx:200-205 — initTree maps the directory listing to brand-new TreeNode objects with hardcoded `expanded: false` and `children: null`. There is no merge with the previous treeNodes.value."
    - "file-tree.tsx:206 — initTree also resets selectedIndex.value = 0, confirming it is written as a from-scratch initialization, not a refresh."
    - "file-tree.tsx:737 — git-status-changed listener calls `initTree()` directly with no merge/preserve step."
    - "file-tree.tsx:21 in 18-03-SUMMARY (provides) — confirms the design: 'git-status-changed Tauri event listener that re-renders tree (initTree for tree mode, loadDir for flat mode)'. The plan reused initTree as the refresh path without designing a state-preserving variant."
    - "Mutation flow that triggers it: createFile/createFolder/deleteFile (Rust) → emit git-status-changed (per 18-01 provides) → useEffect listener (file-tree.tsx:734) → initTree() → treeNodes.value replaced → all `expanded: true` flags lost → flattenedTree (computed at line 152) re-derives from the new flat root listing → render shows only root entries."
  falsification_test: "If initTree() preserved expansion state, the user would see folders stay open after creating a file. The user reports they collapse. Additionally, if I add a console.log inside initTree() printing the count of nodes with expanded=true before and after the assignment to treeNodes.value, before will show >0 (whatever folders user opened) and after will show 0 — proving the wipe."
  fix_rationale: "The correct design is to extract a `refreshTree()` operation that walks the existing treeNodes.value, re-fetches the directory listing for each loaded subtree, and reconciles by entry.path/name: keep existing TreeNode objects (with their expanded flag and children) for paths that still exist, drop ones that no longer exist, and append new ones at expanded=false. Or alternatively: snapshot the set of expanded paths before initTree, then re-expand them after. The git-status-changed listener should call refreshTree() (or the snapshot+restore wrapper), not initTree(). loadDir() in flat mode is unaffected (flat mode has no expansion state to lose) — only the tree path needs the fix."
  blind_spots:
    - "Have not verified the bug live (read-only investigation per find_root_cause_only). Confirmed by code analysis only."
    - "The fix must also handle the case where the user-just-created folder/file is inside a previously-collapsed folder that was auto-expanded by the menu action (file-tree.tsx:1018-1022, 1034-1037). After refresh, that auto-expansion should be preserved too — which the snapshot-and-restore approach handles naturally."
    - "Did not trace whether revealFileInTree() or any other code path also calls initTree() in a way that depends on the wipe behavior. revealFileInTree() reads from treeNodes.value, it does not call initTree. The handleProjectChanged handler (line 714) calls initTree() on project switch, where wiping is correct (different project = different tree). The initial-load call (line 835) also wants the wipe. Only the git-status-changed listener (line 737) needs the preserve behavior. So the fix is a new function for that listener, not a behavior change to initTree itself."

## Symptoms

expected: "Tree preserves folder expand/collapse state after create/delete/rename mutations. After a file is created or deleted, only the affected folder's contents update; folders the user had expanded remain expanded."
actual: "All expanded folders collapse back to the root listing after any file create or delete. The tree behaves as if it was just initialized."
errors: "None reported."
reproduction:
  - "Open efxmux on any project with nested folders."
  - "Switch FileTree to tree mode (TreeIcon button)."
  - "Expand several folders by clicking their chevrons."
  - "Right-click a file inside an expanded folder → Delete (or right-click a folder → New File → type name → Enter)."
  - "After the mutation completes, observe: all previously-expanded folders are now collapsed; the tree shows only the root-level entries."
started: "Phase 18 Plan 03 (committed 2026-04-16, commit 2bb2227) — when the git-status-changed listener was added."

## Eliminated

(none — first hypothesis was confirmed by direct code reading)

## Evidence

- timestamp: 2026-04-16T21:07:28Z
  checked: ".planning/debug/knowledge-base.md for prior matching patterns"
  found: "No matching entry. Closest related entries are 'full-app-rerender-on-file-change' and 'git-changes-pane-stale' but they concern different components (not the tree's expansion state)."
  implication: "Novel bug. Proceed with first-principles investigation."

- timestamp: 2026-04-16T21:07:28Z
  checked: "src/components/file-tree.tsx:128-152 — TreeNode interface and treeNodes signal"
  found: "TreeNode shape: { entry: FileEntry; children: TreeNode[] | null; expanded: boolean; depth: number }. expanded is a boolean stored ON the TreeNode object itself. State is held inside the treeNodes signal value, not in a separate signal/ref."
  implication: "There is no separate 'expanded paths set' that survives a treeNodes.value reassignment. If treeNodes.value is replaced with new objects, all expansion state is lost — there is no other place it lives."

- timestamp: 2026-04-16T21:07:28Z
  checked: "src/components/file-tree.tsx:195-218 — initTree() implementation"
  found: |
    async function initTree(): Promise<void> {
      const project = getActiveProject();
      if (!project?.path) return;
      try {
        const result = await invoke<FileEntry[]>('list_directory', { path: project.path, projectRoot: project.path });
        treeNodes.value = result.map(entry => ({
          entry,
          children: null,        // <- always null (forces re-fetch)
          expanded: false,       // <- always false (wipes user's expansions)
          depth: 0,
        }));
        selectedIndex.value = 0; // <- also resets selection
        if (pendingRevealPath.value) { ... }
      } catch ...
    }
  implication: "initTree is a pure from-scratch initializer. It reads only the root listing (no recursion), constructs every TreeNode at expanded=false / children=null, and replaces treeNodes.value wholesale. Calling it again wipes all expansion state and forces lazy re-load of every subtree. selectedIndex is also reset to 0."

- timestamp: 2026-04-16T21:07:28Z
  checked: "src/components/file-tree.tsx:731-740 — git-status-changed listener inside FileTree useEffect"
  found: |
    // Phase 18 Plan 03: listen for git-status-changed to refresh tree after file ops
    let unlistenFs: (() => void) | null = null;
    (async () => {
      unlistenFs = await listen('git-status-changed', () => {
        const project = getActiveProject();
        if (!project?.path) return;
        if (viewMode.value === 'tree') initTree();
        else loadDir(currentPath.value);
      });
    })();
  implication: "On every git-status-changed event (emitted by the Rust createFile/createFolder/deleteFile commands per 18-01 provides), the tree branch unconditionally calls initTree(). No snapshot/preservation of the prior expanded state. The flat branch calls loadDir() which is correct for flat mode (no expansion state to preserve). The asymmetry confirms the design oversight: the author treated 'refresh' the same as 'initial load' for tree mode, when those are semantically different operations."

- timestamp: 2026-04-16T21:07:28Z
  checked: "src/components/file-tree.tsx:152 — flattenedTree computed signal"
  found: "const flattenedTree = computed(() => flattenTree(treeNodes.value)); — flattenTree only descends into nodes where node.expanded && node.children. After initTree, every node has expanded=false, so flattenedTree returns only the root entries."
  implication: "Confirms the rendering consequence. After initTree, the rendered tree contains only root-level entries — exactly matching the user's report 'collapse like an initialization'."

- timestamp: 2026-04-16T21:07:28Z
  checked: "src/components/file-tree.tsx:177-190 — toggleTreeNode and how expansion is tracked between calls"
  found: "toggleTreeNode mutates node.expanded in place and reassigns treeNodes.value = [...treeNodes.value] to trigger reactivity. The mutation persists ONLY because treeNodes still holds references to the same TreeNode objects. After initTree creates new objects, those references are gone and there is no 'expanded paths' index to consult."
  implication: "Confirms there is no auxiliary state for expansion. The TreeNode object identity IS the expansion state's storage. Replacing treeNodes.value with fresh objects necessarily loses everything."

- timestamp: 2026-04-16T21:07:28Z
  checked: "Pattern match against common-bug-patterns.md"
  found: "Closest match is 'State Management → Stale render' inverse: here state is correctly re-rendered, but the underlying state was wiped during the refresh. Also resembles 'State Management → Dual source of truth' inverse: there is only ONE source of truth (the TreeNode objects), and the refresh path destroys it. The most accurate framing: the listener implements a 'reload' when it should implement a 'reconcile'."
  implication: "Bug class is a state-preservation gap in a refresh path, not a state-management bug per se. The fix is either (a) add a snapshot+restore wrapper around initTree for the listener path, or (b) write a separate refreshTree() that reconciles old and new listings without destroying expansion state."

## Resolution

root_cause: |
  initTree() at src/components/file-tree.tsx:195-218 is a from-scratch initializer that builds every TreeNode object with `expanded: false` and replaces treeNodes.value wholesale. It is wired as the tree-mode refresh path inside the git-status-changed listener at src/components/file-tree.tsx:734-739. Because there is no separate 'expanded paths' state — the `expanded` boolean lives on the TreeNode object itself, mutated in place by toggleTreeNode at src/components/file-tree.tsx:179-190 — replacing treeNodes.value with new objects unavoidably wipes every prior expansion. The flat-mode branch correctly calls loadDir() (which has no expansion state to preserve), but the tree-mode branch reuses initTree() which conflates 'initial load' (where wipe is correct: project switch, first mount) with 'post-mutation refresh' (where wipe is wrong: user just created/deleted one item, expects rest of tree to be undisturbed).
fix: ""
verification: ""
files_changed: []
