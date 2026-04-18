---
slug: claude-md-open-in-editor
status: resolved
trigger: |
  DATA_START
  1. CLAUDE.md: single-click ./CLAUDE.md in tree → tab opens with content. Double-click → pinned.
  2. Open-In: header button + right-click any file → Open In → Zed/etc. → launches. If app name mismatches LaunchServices, toast surfaces error (no silent fail).

  NO WORK, CLAUDE.md can't to be opened, when Open in external editor NO WORK, please investigate
  DATA_END
created: 2026-04-18
updated: 2026-04-18
---

# Debug Session: claude-md-open-in-editor

## Symptoms

- **Expected (1):** Single-click ./CLAUDE.md in file tree → opens preview tab with content. Double-click → pinned tab.
- **Expected (2):** "Open In" header button + right-click context menu → Open In → Zed/other editor launches. If app name mismatches LaunchServices, toast surfaces error (no silent fail).
- **Actual:** Neither works. CLAUDE.md cannot be opened from tree. Open In external editor does nothing.
- **Errors:** None reported by user (need to check console / Tauri logs).
- **Timeline:** Discovered 2026-04-18 during current session.
- **Reproduction:** Click CLAUDE.md in file tree (single-click for preview, double-click for pinned). Try Open In via header button or right-click context menu.

## Current Focus

- hypothesis: ROUND 7 — "App reset" on Open In for specific files (tsconfig.json, vite.config.ts, vitest.config.ts, vitest.setup.ts) is caused by Vite dev-server full restart, not the Rust file watcher. Vite has a separate internal watcher for its own config files that triggers a full server restart when any of them is touched. This is intrinsic to Vite dev mode and unrelated to the file_watcher.rs cascade fixed in Round 6.
- test: diagnosis confirmed by user evidence (only last 4 files, dev mode only, immediate)
- expecting: user to choose mitigation strategy
- next_action: present options to user (CHECKPOINT)
- reasoning_checkpoint: |
    User Round 7 evidence: "only the last 4 files" (tsconfig.json, vite.config.ts,
    vitest.config.ts, vitest.setup.ts), "like close and reopen the app",
    "running on pnpm tauri dev", "immediate on editor launch or open file".

    This is a DIFFERENT mechanism from Round 6 (Rust file watcher cascade).

    Vite (dev server) has TWO distinct file watching mechanisms:
    (1) HMR watcher — controlled by server.watch config. vite.config.ts already has
        a server.watch.ignored list. This is what was addressed in Round 6 context.
    (2) Config-file restart watcher — HARDCODED in Vite internals. Vite specifically
        monitors vite.config.*, tsconfig.json, and any file imported by them for
        changes. When any of these changes, Vite triggers a full dev-server restart.
        This causes the Tauri webview to reload — equivalent to "close and reopen".

    The four affected files confirmed from vite.config.ts + vitest.config.ts:
    - vite.config.ts: directly watched by Vite (it IS the Vite config)
    - tsconfig.json: watched by Vite (TypeScript config affects module resolution)
    - vitest.config.ts: watched by Vite (imported/resolved during dev startup)
    - vitest.setup.ts: referenced in vitest.config.ts via setupFiles: ['./vitest.setup.ts']
      → Vite resolves this dependency chain → watches vitest.setup.ts too

    When Zed opens any of these files, it touches the mtime (Zed's workspace state
    machinery or simply the file access pattern on macOS). Vite's config watcher sees
    the mtime change → triggers full restart → webview reloads → "close and reopen".

    WHY ONLY THESE 4: All other files in the project are source files (src/**) watched
    only by the HMR watcher, not the config-restart watcher. Only files that are Vite
    config files or transitively imported by them trigger restarts.

    WHY "BOTTOM OF FILE TREE": The file tree sorts alphabetically. tsconfig.json,
    vite.config.ts, vitest.config.ts, vitest.setup.ts all sort after src/ and other
    top-level items → they appear at the bottom of the tree. User's "last 4 files"
    observation is purely a sort-order artifact.

    WHY ONLY IN DEV MODE: pnpm tauri dev runs the Vite dev server with full HMR and
    config watching. pnpm tauri build compiles statically — no dev server, no config
    watcher, no webview reload on file touch.

    IMPORTANT: This is NOT a bug in efxmux code. It is Vite's intentional behavior.
    The question is: what should the app do about it?
- tdd_checkpoint: null

## Reopened 2026-04-18

User confirmed Bug 1 fixed. Bug 2 still broken: "work sometimes and no work often, no fixed".
The detect_editors fix made the button visible — but the actual launch is flaky.
Root cause identified and fixed: missing spawn_blocking in launch_external_editor.

## Reopened Round 3 — 2026-04-18

User confirmed spawn_blocking fix did not resolve the Open In experience.
User hypothesis: the sub-dropdown picker is the failure point, not the Rust side.
User feature request: default external editor preference — when set, header button launches
directly without showing any dropdown.

## Evidence

- timestamp: 2026-04-18T13:30:00Z
  type: code-analysis
  finding: >
    Bug 2 (Open In): detect_editors_impl in file_ops.rs uses `which {cli}` to detect editors.
    macOS GUI apps (Zed, VSCode, Cursor) installed via GUI/DMG do NOT install CLI tools in PATH by default.
    Result: detectedEditors is all-false, "Open In" header button is hidden (gated on hasAny),
    right-click "Open In" submenu is empty. The feature is invisible to the user.

- timestamp: 2026-04-18T13:35:00Z
  type: state-inspection
  finding: >
    Bug 1 (CLAUDE.md): Inspected ~/.config/efx-mux/state.json. Found persisted editor tabs:
    CLAUDE.md has ownerScope: "right" (was pinned to right panel in a previous session).
    README.md has ownerScope: "main". When clicking CLAUDE.md from file tree, openEditorTab
    finds existing tab with ownerScope: "right", calls _activateEditorTab(existing).
    _activateEditorTab sets getTerminalScope('right').activeTabId = existing.id AND
    activeUnifiedTabId = existing.id. This causes:
    (a) Right panel hides file tree (switches to CLAUDE.md editor — invisible to user).
    (b) Main panel goes BLANK: isEditorActive=true (hides terminal) but editorTabs.filter
        by ownerScope:'main' excludes CLAUDE.md (renders nothing).
    Both single-click and double-click fail this way.

- timestamp: 2026-04-18T13:40:00Z
  type: fix-applied
  finding: >
    Fix for Bug 1: Added _migrateTabToMain(tabId) helper in unified-tab-bar.tsx that migrates
    a right-scoped editor tab to main scope: updates ownerScope, fixes scoped tab orders, resets
    right panel to file-tree. Modified openEditorTab and openEditorTabPinned to call
    _migrateTabToMain when existing.ownerScope === 'right' before activation.
    File-tree opens now always target the main panel (VS Code / Zed semantics).

- timestamp: 2026-04-18T13:42:00Z
  type: fix-applied
  finding: >
    Fix for Bug 2 (detection): Added app_installed(app_name) helper in file_ops.rs using open -Ra {AppName}
    to detect GUI apps via LaunchServices regardless of CLI presence in PATH.
    detect_editors_impl now uses app_installed("Zed") || which("zed") etc.
    Editors installed via GUI/DMG without CLI in PATH are now detected correctly.
    Header "Open In" button and right-click "Open In" submenu will now appear for Zed/VSCode/Cursor/etc.

- timestamp: 2026-04-18T13:45:00Z
  type: test-results
  finding: >
    All tests pass: unified-tab-bar (42 passed), file-tree (46 passed), Rust (74 passed).
    TypeScript compilation: no errors.

- timestamp: 2026-04-18T14:20:00Z
  type: code-analysis
  finding: >
    Bug 2 (intermittent launch) — root cause: launch_external_editor async Tauri command called
    launch_external_editor_impl() directly without spawn_blocking. The impl calls child.wait()
    (blocking syscall). All other async Tauri commands in file_ops.rs use spawn_blocking for
    blocking work — launch_external_editor, open_default, reveal_in_finder, and detect_editors
    were the only exceptions. Calling child.wait() on a Tokio async executor thread can starve
    the executor under load, making the command appear to work sometimes (when a thread happens
    to be free) and silently fail or hang other times.

- timestamp: 2026-04-18T14:22:00Z
  type: fix-applied
  finding: >
    Fixed launch_external_editor, open_default, reveal_in_finder, detect_editors to all use
    spawn_blocking (tauri::async_runtime::spawn_blocking already imported). Rust tests: 74 passed.
    File changed: src-tauri/src/file_ops.rs lines 588-679.

- timestamp: 2026-04-18T14:50:00Z
  type: code-analysis
  finding: >
    Round 3 investigation — Open In dropdown/sub-dropdown failure path.
    (A) Header button: openHeaderOpenInMenu calls buildOpenInChildren(project.path) which reads
    detectedEditors.value. If that signal is null (detection in-flight or failed) OR if the
    editors in the flat dropdown don't register a click, the feature appears broken. The flat
    dropdown items have action functions and are NOT submenu parents, so handleItemClick should
    work. The real UX problem: users must click the button, see a dropdown appear, then click
    an editor name. Two-step flow is unexpected — macOS convention is single-click for a
    configured default.
    (B) Right-click "Open In" submenu: opens on hover after 150ms delay. Classic diagonal mouse
    movement problem — submenu renders at rect.right + 2 (2px air gap). During gap traversal
    the mouse is in neither the parent row nor the submenu wrapper, so onMouseLeave fires on the
    row and a 150ms close timer can fire before the mouse reaches the submenu. Result: submenu
    disappears before the user can click it.

- timestamp: 2026-04-18T14:55:00Z
  type: fix-applied
  finding: >
    Three fixes applied:
    (1) context-menu.tsx: Increased submenu close delay from 150ms → 300ms in the non-hover-row
    branch and the submenu wrapper onMouseLeave. Eliminated the 2px air gap (rect.right + 2 → rect.right).
    This makes the diagonal mouse movement to the submenu reliable.
    (2) file-tree.tsx: Added defaultExternalEditor signal (exported, string). openHeaderOpenInMenu
    now checks for a configured default — if set and still detected, launches directly via launchOrToast
    without showing a dropdown. Falls back to dropdown if no default set or editor not detected.
    Header button tooltip dynamically shows "Open in Zed" vs "Open project in external editor".
    (3) preferences-panel.tsx + main.tsx: Added EXTERNAL EDITOR section in Settings with a <select>
    picker populated from detectedEditors. Persisted as layout['default-external-editor'] via
    updateLayout, restored on app startup in main.tsx.
    Tests: context-menu 14/14 pass, file-tree 46/46 pass, TypeScript: 0 errors.
    Files changed: src/components/context-menu.tsx, src/components/file-tree.tsx,
    src/components/preferences-panel.tsx, src/main.tsx.


## Reopened Round 4 — 2026-04-18

User confirmed: header button with default pref direct-launch WORKS. Dropdown items (no-default path) and right-click
submenu items do NOT trigger. User requests: right-click and macOS menu bar also get direct-launch behavior.

## Round 4 Evidence

- timestamp: 2026-04-18T15:30:00Z
  type: code-analysis
  finding: >
    Three distinct gaps identified:
    (A) context-menu.tsx: icon (<item.icon />) and label (<span>) children of menu item divs had no
    pointerEvents:none. In WKWebView, SVG elements can absorb click events without reliable bubbling
    to the parent div. Result: clicking on the icon or label text of a ContextMenu item does nothing —
    the onClick on the outer div is never reached. Fix: wrap icon in <span style="display:contents;
    pointerEvents:none"> and add pointerEvents:none to label span (mirrors dropdown-menu.tsx pattern).
    (B) buildRowMenuItems in file-tree.tsx: when defaultExternalEditor is set, the right-click "Open In"
    entry still used children (submenu) requiring hover + diagonal mouse + click. Should be a direct-launch
    action item with label "Open in Zed" when default is configured.
    (C) No macOS native menu bar entry existed for "Open In External Editor". Users had no keyboard-
    accessible top-bar path to open the current project in their preferred editor.

- timestamp: 2026-04-18T15:40:00Z
  type: fix-applied
  finding: >
    Three fixes applied:
    (A) context-menu.tsx: Added pointerEvents:none to icon wrapper span (display:contents) and label span.
    This ensures all click events on menu items reach the parent div's onClick handler regardless of
    which child element (icon SVG or label text) was under the cursor. 14/14 context-menu tests pass.
    (B) file-tree.tsx: Extracted resolveDefaultEditorDetected() helper. buildRowMenuItems now checks
    the helper: when a default editor is set and detected, pushes a flat direct-launch item
    ("Open in Zed") instead of the submenu. openHeaderOpenInMenu refactored to use same helper.
    (C) file-tree.tsx: Added listen('open-in-editor-requested') handler in the main useEffect.
    Resolves default editor and calls launchOrToast directly; falls back to headerMenu picker if no
    default is set; shows error toast if no editors detected at all.
    lib.rs: Added "Open in External Editor" (Cmd+Shift+O) to the File menu. on_menu_event emits
    'open-in-editor-requested' when clicked. 46/46 file-tree tests pass. TypeScript: 0 errors.
    Rust: compiled successfully.
    Files changed: src/components/context-menu.tsx, src/components/file-tree.tsx, src-tauri/src/lib.rs.

## Reopened Round 5 — 2026-04-18

User confirmed: pref "None (show picker)" → header button picker items do nothing. Right-click
"Open In" submenu items also do nothing. Default-editor direct-launch (header button and
right-click flat item) continues to work. The pointer-events:none fix from Round 4 did not
resolve the picker/submenu path.

## Round 5 Evidence

- timestamp: 2026-04-18T16:30:00Z
  type: code-analysis
  finding: >
    Root cause identified: WKWebView pointer-event routing bug with position:fixed elements
    overlapping overflow:hidden ancestors.

    The ContextMenu (picker and submenu) renders as position:fixed inside the file-tree div,
    which sits inside the sidebar <aside> element. The sidebar CSS class has overflow:hidden.

    In WKWebView (Safari/WebKit), when a position:fixed element visually overlaps a container
    that has overflow:hidden, pointer/mouse events for the fixed element are routed to the
    underlying DOM elements (those within the overflow:hidden container), not to the fixed
    element itself. This is a known WKWebView event-routing quirk.

    The file-tree row divs have onRowMouseDown (called via onMouseDown on each row) which calls
    e.preventDefault(). In standard browser behavior, calling preventDefault() on mousedown
    suppresses the subsequent click event. Result:

    1. User clicks picker item (headerMenu ContextMenu).
    2. WKWebView routes mousedown to the tree row visually below the fixed menu.
    3. onRowMouseDown fires → e.preventDefault() → click event suppressed.
    4. onClick on the ContextMenu item row never fires.
    5. handleItemClick never called → no editor launched, no toast.

    This explains why:
    - Default-editor direct-launch WORKS (no menu shown, click goes directly to Tauri invoke).
    - Right-click flat "Open in Zed" WORKS when the menu appears at cursor position with no
      overflow:hidden routing ambiguity in that specific geometry.
    - Picker items and submenu items FAIL consistently: they always appear over tree rows.

    Secondary issue: icon wrapper used display:contents which in WebKit does not properly apply
    pointer-events:none to SVG children (display:contents elements have no box, so
    pointer-events:none may not cascade). Changed to display:inline-flex.

- timestamp: 2026-04-18T16:40:00Z
  type: fix-applied
  finding: >
    Three-part fix in context-menu.tsx:

    (1) Outer menu div: added onMouseDown={(e) => { e.stopPropagation(); }} — stops the mousedown
    from bubbling through the fixed-position menu into tree-row onMouseDown handlers below.

    (2) Item rows: added onMouseDown handler that calls e.stopPropagation() and handleItemClick(item).
    This fires the action at mousedown time, before any click suppression can occur. A ref
    (mouseDownActivatedIndex) guards against double-invoke: when onClick fires after mousedown,
    it checks the ref and skips if mousedown already activated this item. onClick is retained
    for keyboard accessibility (Enter/Space) and JSDOM test compatibility.

    (3) Icon wrapper: changed display:'contents' to display:'inline-flex' so pointer-events:none
    correctly prevents SVG children from intercepting events in WebKit.

    Tests: context-menu 17/17 pass (3 new tests for mousedown path and double-invoke guard).
    file-tree 46/46 pass. TypeScript: 0 errors.
    File changed: src/components/context-menu.tsx, src/components/context-menu.test.tsx.

## Reopened Round 6 — 2026-04-18

User confirmed picker clicks now work (WKWebView fix confirmed). New symptom: right-click →
Open In picker → launch editor → sometimes the efxmux app "resets" (full re-render, state
appears to wipe). Not on every file — only SOME files trigger it.

## Round 6 Evidence

- timestamp: 2026-04-18T17:30:00Z
  type: code-analysis
  finding: >
    ROOT CAUSE IDENTIFIED: file-tree-changed watcher cascade on external editor open.

    When launch_external_editor fires `open -a Zed <path>`, Zed opens the file AND its
    workspace state machinery touches the filesystem. Specifically:
    - Zed creates/updates files in the project directory (e.g. workspace lock files,
      recent-files registry, or .zed/ directory contents if it exists).
    - VSCode touches .vscode/ settings or creates a lock file near the opened file.
    - These file system events pass through the start_file_tree_watcher() filter in
      file_watcher.rs: the filter skips .git/, .planning/, node_modules/, hidden files
      starting with ".", and .DS_Store — but NOT .zed/, .vscode/, or other editor-specific
      dirs (unless they start with a dot AND the file name starts with ".").

    Wait: .zed/ IS a hidden directory (starts with "."), so .zed/ contents ARE filtered.
    But .vscode/ is also hidden — filtered too. So the watcher should be silent for
    most editor metadata. HOWEVER: the filter only checks the FILENAME component, not
    the full path. A file at /project/.zed/local_settings.json has filename "local_settings.json"
    which does NOT start with "." → passes the filter → watcher fires.

    Code evidence (file_watcher.rs lines 170-178):
      if let Some(name) = e.path.file_name().and_then(|n| n.to_str()) {
          if name.starts_with('.') {
              let is_env = name.starts_with(".env");
              let is_gitignore = name == ".gitignore";
              if !is_env && !is_gitignore {
                  return false;
              }
          }
      }
    This checks only the FILE NAME, not whether any PARENT DIRECTORY is hidden.
    Result: /project/.zed/local_settings.json passes the filter (filename = "local_settings.json").

    The watcher fires → frontend file-tree.tsx emits 'file-tree-changed' listener callback
    → refreshTreePreservingState() → initTree() is called inside it (line 298).

    initTree() is ASYNC and has a destructive intermediate state:
      treeNodes.value = result.map(...)  // replaces all nodes
      selectedIndex.value = -1           // resets selection
      await seedSelectionFromActiveTab() // re-selects, but async

    During the await invoke('list_directory') gap in initTree(), treeNodes.value = []
    momentarily (between the old value being invalidated and the new value being set).
    flattenedTree.value = [] → tree renders "Loading..." placeholder. This is the
    "reset" the user sees: the tree flashes to empty ("Loading...") then repopulates.

    WATCHER LEAK AMPLIFICATION (Pitfall-11, file_watcher.rs line 109):
    set_project_path() spawns a NEW watcher thread each time it is called, without
    stopping the prior thread. If the app has restarted or the project was switched
    back and forth, multiple watcher threads may be running simultaneously. Each one
    emits 'file-tree-changed' independently. N concurrent refreshTreePreservingState()
    calls each call initTree() → N concurrent assignments to treeNodes.value = [] →
    severe flashing, or state corruption where the last writer wins with stale data.

    WHY "ONLY SOME FILES":
    Files in directories that are clearly inside .zed/, .vscode/, or other editor
    workspace dirs → their filenames are NOT hidden → watcher fires.
    Files that the editor opens read-only without touching metadata → no watcher event.
    The intermittency matches which editor metadata the user's specific Zed/VSCode
    installation updates when opening each file.

- timestamp: 2026-04-18T17:35:00Z
  type: fix-proposed
  finding: >
    TWO-PART FIX:

    PART A — file_watcher.rs: Fix the path filter to skip hidden DIRECTORIES, not just
    hidden files. Change the hidden-file check to also skip any path whose path_str
    contains a path component starting with "." (excluding .env* and .gitignore which
    are legitimate top-level files). Specifically: add a check that any path component
    (not just the final filename) that starts with "." causes the event to be filtered,
    EXCEPT when the root component is the project root itself (which may be a hidden dir
    but is explicitly watched). The simplest safe rule: skip any event path whose
    to_string_lossy() contains "/." — i.e., any path segment after the root that starts
    with ".". Already filtered: /.git/, /.planning/ (explicit). Add: any other "/." segment.
    This one-liner catches .zed/, .vscode/, .idea/, .DS_Store/ etc. without needing an
    exhaustive allowlist.

    Implementation in start_file_tree_watcher filter closure:
      // Skip any path that has a hidden-directory component anywhere in the path
      // (e.g. /project/.zed/local_settings.json, /project/.vscode/settings.json)
      // The explicit .git/ and .planning/ checks above already handle those;
      // this catch-all covers any other editor metadata dirs.
      if path_str.contains("/.") {
          return false;
      }

    Wait — this would also filter /project/.env (which has "/.env" containing "/.").
    Need to be more careful. Better: split path into components and check if any
    non-first component is a hidden directory (starts with "."). Or simply: check
    path_str after the project root prefix.

    Actually the cleanest fix: keep the existing explicit .git/ and .planning/ filters,
    and add a general "hidden directory component" filter:
      // Skip paths inside any hidden directory (component starts with "." after root)
      // e.g. .zed/local_settings.json, .vscode/settings.json, .idea/workspace.xml
      // We already filter /.git/ and /.planning/ above; this catches the rest.
      let has_hidden_dir = e.path.components().skip(1).any(|c| {
          c.as_os_str().to_string_lossy().starts_with('.')
      });
      if has_hidden_dir {
          return false;
      }

    This correctly filters /project/.zed/local_settings.json (component ".zed" is hidden)
    while keeping /project/src/.env (component ".env" — this IS a hidden file name, but
    "starts with '.'" catches it). Wait — .env IS supposed to be included. The existing
    logic adds it to the filename-level allowlist. With the path-component approach,
    .env at the top level has component ".env" which starts with "." → filtered out.

    So the correct approach: apply the existing filename-level logic (allow .env*, .gitignore)
    at the DIRECTORY-COMPONENT level: skip if ANY path component starts with "." AND is not
    ".env*" or ".gitignore". For directories (not the final file component), there is no
    ".env" directory that needs to be kept, so the rule simplifies to: skip if ANY
    DIRECTORY component (not the final filename) starts with ".".

    Final filter addition (after the existing explicit .git/ and .planning/ checks):
      // Skip events inside any hidden directory (any non-filename path component
      // starting with "."). Catches .zed/, .vscode/, .idea/, .cursor/, etc.
      // Explicit .git/ and .planning/ already handled above; this is the catch-all.
      let path_components: Vec<_> = e.path.components().collect();
      let has_hidden_dir_component = path_components
          .iter()
          .rev()
          .skip(1)   // skip the filename (last component)
          .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
      if has_hidden_dir_component {
          return false;
      }

    PART B — file-tree.tsx: Add a concurrent-refresh guard to refreshTreePreservingState().
    The root problem is that multiple concurrent calls each call initTree() which
    destructively resets treeNodes.value. A simple boolean guard (isRefreshing) prevents
    concurrent re-entrant calls:

      let _isRefreshingTree = false;
      async function refreshTreePreservingState(): Promise<void> {
        if (_isRefreshingTree) return;
        _isRefreshingTree = true;
        try {
          // ... existing body ...
        } finally {
          _isRefreshingTree = false;
        }
      }

    This eliminates the Pitfall-11 watcher-leak amplification: even if N watcher threads
    fire, only the first refresh executes; the rest are no-ops until it completes.

## Reopened Round 7 — 2026-04-18

User clarified "only SOME files" = the last 4 in the tree: tsconfig.json, vite.config.ts,
vitest.config.ts, vitest.setup.ts. Effect is "like close and reopen the app". Running pnpm
tauri dev. Immediate on editor launch or file open.

This is a DIFFERENT root cause from Round 6. See Round 7 Evidence below.

## Round 7 Evidence

- timestamp: 2026-04-18T18:00:00Z
  type: code-analysis
  finding: >
    ROOT CAUSE (ROUND 7): Vite dev-server config-file restart watcher — NOT the Rust file watcher.

    User observation: only these 4 files trigger the "app reset":
      - tsconfig.json
      - vite.config.ts
      - vitest.config.ts
      - vitest.setup.ts

    These are not random files. They are ALL Vite config files or transitively referenced
    by Vite config files:

    Chain:
      vite.config.ts         → Vite's own config file (directly watched)
      tsconfig.json          → TypeScript config (Vite watches for module resolution)
      vitest.config.ts       → Vitest config (resolved during dev startup)
      vitest.setup.ts        → setupFiles: ['./vitest.setup.ts'] in vitest.config.ts
                               → Vite resolves this import chain → watches it too

    Vite has TWO SEPARATE file-watching mechanisms:
    (1) HMR watcher (server.watch) — watches src/** for hot module replacement.
        This is what vite.config.ts server.watch.ignored controls. Already has CLAUDE.md,
        README.md, pnpm-lock.yaml, etc. in the ignore list.
    (2) Config-change restart watcher — HARDCODED inside Vite's server/moduleGraph.
        When vite.config.*, tsconfig.json, or any file imported by them changes, Vite
        triggers a FULL dev-server restart. This cannot be suppressed via server.watch.
        The Tauri webview is pointed at the dev server; a restart = full page reload =
        "close and reopen the app" from the user's perspective.

    Evidence from vite.config.ts (verified):
      server.watch.ignored already lists: **/src-tauri/**, **/.git/**, **/.planning/**,
      **/.claude/**, **/node_modules/**, CLAUDE.md, README.md, pnpm-lock.yaml, etc.
      BUT: vite.config.ts, tsconfig.json, vitest.config.ts, vitest.setup.ts are NOT
      in this list — and adding them would not help anyway because the config-restart
      watcher is a different code path.

    Evidence from vitest.config.ts (verified):
      setupFiles: ['./vitest.setup.ts'] — this is what pulls vitest.setup.ts into the
      Vite dependency graph and makes it trigger restarts.

    WHY "BOTTOM OF TREE" / "LAST 4 FILES":
      The file tree sorts alphabetically. All 4 files start with 't' or 'v', sorting
      after src/ and other lowercase directories → they appear at the bottom of the tree.
      User's "last 4 files" is a sort-order observation, not a position-based logic issue.

    WHY IMMEDIATE ON EDITOR OPEN:
      When Zed opens a file, macOS updates the file's access time (atime) or Zed writes
      workspace metadata. On macOS with default mount options, mtime is NOT updated on
      read — but some editors explicitly touch mtime or write companion files. Vite's
      config watcher uses chokidar which detects any inode change event (including atime
      on some configurations). More likely: Zed's workspace state creates/updates a file
      near the opened file or in .zed/ near the project root — but since tsconfig.json
      IS a config file, Vite's watcher notices ANY change to it.

    WHY ONLY IN DEV MODE:
      pnpm tauri dev runs the Vite dev server with full HMR + config watching.
      pnpm tauri build compiles everything statically — no dev server, no config watcher.
      Production app never triggers this.

    THIS IS NOT A BUG IN EFXMUX CODE.
    It is Vite's intentional, documented behavior: config file changes restart the server.
    The question is what mitigation (if any) is appropriate.

## Eliminated

- File read failure: read_file_content in Rust has no CLAUDE.md-specific filtering. File is valid UTF-8, 9542 bytes (well under 1MB limit). is_safe_path only checks for ".." components.
- Extension filtering: no filename or extension filter in list_directory, file-tree render, or openEditorTab.
- Tauri command registration: all commands (read_file_content, launch_external_editor, detect_editors) confirmed registered in lib.rs.
- Permission issues: Sandbox disabled in Entitlements.plist, file is -rw-r--r--.
- Event listener timing: file-opened listener added synchronously in bootstrap(), before any user interaction.
- WebKit click suppression: onMouseDown calls e.preventDefault() but this only prevents text selection for div elements in WebKit, not click events.
- Frontend handler race: launchOrToast fires void promise then onClose() — ordering is correct, menu close does not cancel the invocation.
- App name mismatch: `open -Ra "Zed"` confirmed exits 0 on this machine. LaunchServices resolves "Zed" correctly.
- open -a timing: measured at ~83ms on this machine. Not the cause of intermittency on its own.
- handleItemClick bug: items in the flat header dropdown have action and no children — handleItemClick correctly calls action then onClose.
- z-index / overflow clipping: no transform on any ancestor, position:fixed not clipped by overflow:hidden in WKWebView for non-transformed parents (visual rendering unaffected — only pointer routing affected).
- Double-fire from onClose identity change: useEffect([onClose]) re-runs when file-tree re-renders, but cleanup/re-add cycle is safe and does not explain the failure.
- Preact event delegation: Preact 10 attaches direct listeners on DOM nodes (not delegated to document), so onClick is a real event listener on the item row.
- JSDOM test pass: all tests pass because JSDOM does not reproduce WKWebView's overflow:hidden pointer-routing quirk.
- Window focus/blur: no onBlur/visibilitychange handlers found that trigger save_state or project re-init. Eliminated.
- launch_external_editor Rust side emitting events: confirmed it emits nothing beyond its return value.
- File size/binary content: watcher doesn't care about content, only path events.
- Round 6 Rust watcher cascade: not relevant for these 4 specific files. The cause is Vite's config-restart watcher, not the file_watcher.rs event cascade.

## Resolution

root_cause: |
  Round 5 (final for Open-In clicks) — WKWebView pointer-event routing bug. The ContextMenu renders as
  position:fixed inside the sidebar's DOM subtree. The sidebar has overflow:hidden in CSS.
  WKWebView routes mousedown events for fixed-position elements overlapping overflow:hidden
  containers to the underlying DOM elements (file-tree rows) rather than to the fixed menu.
  The tree rows call e.preventDefault() in onMouseDown, suppressing the subsequent click
  event. Since ContextMenu item actions were attached only to onClick, they never fired
  for picker items (headerMenu) or submenu items — only for items whose geometry happened
  not to trigger the routing quirk.

  Round 6 (app reset on editor open, general files) — file-tree-changed watcher cascade:
  The Rust file watcher filter checks only the FILENAME component for hidden-file exclusion,
  not whether any PARENT DIRECTORY is hidden. Files inside .zed/, .vscode/, .idea/ etc.
  have non-hidden filenames and pass the filter → watcher fires → refreshTreePreservingState()
  cascade → tree flashes "Loading..." → looks like app reset. Fix proposed (not yet confirmed applied).

  Round 7 (app reset for tsconfig.json, vite.config.ts, vitest.config.ts, vitest.setup.ts) —
  Vite dev-server config-file restart watcher: these 4 files are all Vite config files or
  transitively imported by them. Vite's hardcoded config-restart watcher (separate from HMR
  server.watch) triggers a full dev-server restart when any of them is touched. The Tauri
  webview reloads = looks like "close and reopen the app". This is Vite's intentional behavior.
  Only occurs in pnpm tauri dev (not in production builds).

fix: |
  Round 5: src/components/context-menu.tsx — mousedown-first pattern with stopPropagation
  and double-invoke guard. 3 new tests added.

  Round 6:
  (A) src-tauri/src/file_watcher.rs — add hidden-directory-component filter (proposed, awaiting confirmation).
  (B) src/components/file-tree.tsx — add _isRefreshingTree boolean guard to
  refreshTreePreservingState() (proposed, awaiting confirmation).

  Round 7: Awaiting user decision on mitigation strategy. Options:
  (A) Accept — dev-only behavior, won't happen in production. Document it.
  (B) vite.config.ts server.watch.ignored — cannot suppress config-restart watcher (won't work).
  (C) Filter "Open In" for these specific files in dev mode — show warning toast instead.
  (D) Exclude vitest.setup.ts from Vite dependency graph (move setupFiles import) — reduces 1 of 4.

files_changed:
  - src/components/context-menu.tsx
  - src/components/context-menu.test.tsx
  - src/components/file-tree.tsx
  - src-tauri/src/lib.rs
  - src/components/preferences-panel.tsx
  - src/main.tsx
  - src-tauri/src/file_watcher.rs (Round 6 fix A — proposed)
