# Phase 18: File Tree Enhancements - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can delete files/folders, open files and folders in external editors (Zed, VSCode, etc.), move files and folders inside the tree via drag, import files from Finder via drag, and create new files/folders from folder context. All enhancements live in the existing `file-tree.tsx` component plus supporting infrastructure (context menu submenu, Rust copy/create-folder commands, Tauri window drag-drop listener). Rename, multi-select, and file-watcher refresh are outside this phase.

</domain>

<decisions>
## Implementation Decisions

### Delete UX (TREE-01, TREE-02)
- **D-01:** Delete key listens only when the file tree has focus. Attach the keydown handler to the tree's scroll container (it is already `tabIndex=0`). No global document listener — prevents accidental deletes from terminal/editor.
- **D-02:** Folder deletion uses the same `ConfirmModal` as files. Message shows child count: `Delete 'src/components' (12 items)? This cannot be undone.` Recursive delete (no extra prompt per descendant).
- **D-03:** `ConfirmModal` called with `confirmLabel: 'Delete'` and the existing red destructive button style (`colors.diffRed`). Consistent with Phase 17 unsaved-changes "Discard" pattern.
- **D-04:** Single-item deletion only. Multi-select (Shift/Cmd-click range) is deferred — tree currently has a single `selectedIndex`; extending selection model is a separate phase.
- **D-05:** Hard delete via existing `rename_file` → no, via existing `delete_file` Rust command (not Trash). Move-to-Trash is deferred.

### External Editor Integration (TREE-03)
- **D-06:** Editor detection at app start: probe `which zed`, `which code`, `which subl`, `which cursor`, `which idea`. Menu shows only detected editors. Always-available fallback items: "Reveal in Finder", "Open with default app" (macOS `open <path>`).
- **D-07:** Menu structure uses a submenu: `Open In ▸ Zed / VSCode / …`. This requires extending the `ContextMenu` component (Phase 15 D-01) to support a `children: ContextMenuItem[]` field that renders a nested panel on hover.
- **D-08:** Launch mechanism: `std::process::Command::new("open").args(["-a", app_name, path]).spawn()`. Uses macOS app-bundle resolution — works for `Zed.app`, `Visual Studio Code.app`, `Sublime Text.app`, `Cursor.app`, `IntelliJ IDEA.app`. No new Tauri shell plugin dependency needed.
- **D-09:** Same context-menu entry works for both files and folders — Zed and VSCode accept directory paths and open them as a workspace.
- **D-10:** **Open-root-project entry point:** icon button in the File Tree header bar (next to flat/tree mode toggle). Always visible when a project is active. Clicking opens the "Open In" picker for the active project root. Allows the user to open the whole project in an external editor without first selecting an item in the tree.

### Drag & Drop Mechanics (TREE-04, TREE-05)
- **D-11:** Intra-tree drag is **mouse-event based** (mousedown → mousemove → mouseup + ghost element), matching the `unified-tab-bar.tsx:575-680` pattern. HTML5 drag API is confirmed broken in WKWebView (Phase 17 finding: WKWebView fires `dragend` immediately without `dragover`/`drop`).
- **D-12:** Intra-tree drag semantics = **move only**, no reorder. Drop on a folder → move into that folder. Drop on a file → move into the file's parent folder. Drop on empty tree area → move to project root. OS owns the sort order (alphabetized by tree rendering).
- **D-13:** Intra-tree move uses existing `rename_file(from, to)` Rust command. No cross-device fallback (EXDEV handling) in this phase — project files live on a single volume in practice.
- **D-14:** Drop-target visual = accent border on the target row (`borderLeft: 2px solid colors.accent`) + subtle background tint. Matches the `unified-tab-bar` drop indicator. Ghost element follows the cursor with the row clone (opacity 0.8, pointer-events: none).
- **D-15:** Finder import semantics = **copy** (non-destructive on the Finder source). Dragging a file from Finder into the tree copies it. No Cmd-to-move modifier in this phase.
- **D-16:** Finder import target rule mirrors intra-drag: drop on folder → copy into it; drop on file → copy into parent folder; drop on empty tree area → copy to project root.
- **D-17:** Copy uses a new Rust command `copy_path(from, to)` with recursive directory handling (`std::fs::copy` for files, manual recursive walk for folders). Added to `file_ops.rs` alongside the existing CRUD commands.
- **D-18:** Drag dispatch: Tauri `getCurrentWindow().onDragDropEvent()` fires for OS-level drops. Payload paths that are inside the active project root are **ignored** (intra-tree drag is handled by the mouse-event pipeline). Paths outside the project root are treated as Finder imports and routed to `copy_path`.
- **D-19:** Enable `dragDropEnabled: true` on the main window in `tauri.conf.json` (`app.windows[0]`). Currently not set — default suppresses native drop events.
- **D-20:** Conflict handling (both intra-move and Finder-copy): if the target path already exists → show toast `File exists: <name>` and abort. No overwrite, no auto-rename, no replace prompt.

### Create File / Create Folder (MAIN-03)
- **D-21:** Inline input row (VSCode-style) in the tree. The create action inserts a new row under the target folder with a pre-focused `<input>`. Enter commits, Esc cancels, blur commits (only if name is valid — otherwise stays open with error).
- **D-22:** Entry points = (a) right-click on a folder → context-menu items "New File", "New Folder"; (b) `[+]` icon button in the File Tree header bar.
- **D-23:** Target folder resolution:
  - Context-menu invocation → the clicked folder is the target.
  - Header `[+]` invocation → if the current `selectedIndex` is a folder, that folder is the target; if it's a file, the file's parent folder is the target; otherwise the project root.
- **D-24:** Validation rules: empty name → block; name contains `/` or `\0` → block; target path already exists → block. Each failure shows inline red error text below the input; the input stays open so the user can fix and retry.
- **D-25:** Create File uses existing `create_file(path)` Rust command. Create Folder needs a new Rust command `create_folder(path)` (mkdir-style, creates parents as needed, errors on collision).
- **D-26:** After successful create, the new node appears in the tree and gets `selectedIndex`. Files do NOT auto-open in an editor tab — user clicks to open (standard tree behavior).

### Claude's Discretion
- Exact Lucide icon choices for context-menu items (Trash, FolderPlus, FilePlus, ExternalLink, etc.).
- Submenu positioning heuristics (flip-side logic when near viewport edge).
- File Tree header icon design for `[+]` create and `Open In` trigger — tokens + spacing.
- Inline input visual styling (border, padding, font, validation text color).
- Drag ghost styling (shadow, opacity, width).
- Tree refresh mechanism after file ops (event-driven via `file-service` emits vs explicit reload call). Existing pattern: `writeFile` already emits `git-status-changed`; `deleteFile`/`renameFile`/`createFile`/`copy_path` should do the same, and the tree listens.
- Folder children count for D-02 confirm message: compute via Rust `list_directory` recursive walk, or a lightweight count-only command.

### Folded Todos
None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components (target for modification)
- `src/components/file-tree.tsx` — Primary target. Flat + tree modes, keyboard nav, click handlers, `revealFileInTree`. Add: context menu, delete handler, drag handlers, create input, header buttons.
- `src/components/context-menu.tsx` — Phase 15 component. Needs extension: add `children?: ContextMenuItem[]` field and submenu rendering for "Open In ▸" hover expansion.
- `src/components/confirm-modal.tsx` — Reused as-is for delete confirmation (`showConfirmModal({ confirmLabel: 'Delete' })`).
- `src/components/unified-tab-bar.tsx` §mouse-drag (lines ~573-720) — Reference pattern for mouse-based drag in WKWebView. Copy approach for file-tree intra-drag.
- `src/components/toast.tsx` — Existing toast system for conflict errors and external-editor launch failures.

### Services
- `src/services/file-service.ts` — `deleteFile`, `renameFile`, `createFile` wrappers already exist. Add: `createFolder(path)`, `copyPath(from, to)`. `writeFile` already emits `git-status-changed` — the other ops should follow that pattern.

### Rust Backend
- `src-tauri/src/file_ops.rs` — `delete_file`, `rename_file`, `create_file`, `list_directory` commands exist. Add: `create_folder(path)`, `copy_path(from, to)` with recursive dir support. Also consider a `count_children(path)` helper for the delete-confirm message.
- `src-tauri/src/lib.rs` — Register new Tauri commands in the `generate_handler!` macro.
- `src-tauri/tauri.conf.json` — Set `app.windows[0].dragDropEnabled = true` to unblock Tauri's `onDragDropEvent` for Finder imports.

### Design Tokens
- `src/tokens.ts` — `colors.accent`, `colors.diffRed`, `colors.bgElevated`, `colors.bgBorder`, fonts, spacing.

### Requirements (from REQUIREMENTS.md)
- TREE-01: Delete files/folders via context menu with confirmation
- TREE-02: Delete files/folders via Delete key with confirmation
- TREE-03: Open file in external editor (Zed, VSCode) via context menu
- TREE-04: Drag/drop files and folders to reorder within tree *(reinterpreted as move-to-folder — see D-12)*
- TREE-05: Drag files from Finder into tree to import
- MAIN-03: Create new file from folder context in file tree

### Prior Phase Context (read for continuity)
- `.planning/phases/15-foundation-primitives/15-CONTEXT.md` — ContextMenu D-01/D-02/D-03 contract, file-service D-10/D-11/D-12 contract.
- `.planning/phases/17-main-panel-file-tabs/17-CONTEXT.md` — WKWebView drag-drop constraint noted in discussion; mouse-event drag pattern established for tab reorder.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContextMenu` component — flat item array, auto-flip, click-outside close. Needs a `children` field for "Open In" submenu.
- `ConfirmModal` — `showConfirmModal({ title, message, confirmLabel, onConfirm, onCancel })`. Red destructive button already styled.
- `file-service.ts` — `deleteFile`, `renameFile`, `createFile`, `readFile`, `writeFile`. Typed `FileError` class. Add `createFolder` and `copyPath` here.
- `unified-tab-bar.tsx` mouse-drag pattern (lines ~573-720) — ghost element, threshold, document-level mousemove/mouseup listeners, drop-target highlight. Direct template for tree drag.
- `toast.tsx` / `showToast` — error feedback.
- `invoke` + `listen` / `emit` from `@tauri-apps/api/core` + `@tauri-apps/api/event`.
- Lucide icon import pattern (via inline SVG currently in `file-tree.tsx`, or `lucide-preact` in other components).

### Established Patterns
- Preact + `@preact/signals` for local component state (`selectedIndex`, `entries`, `treeNodes`, etc. in `file-tree.tsx`).
- Rust Tauri commands use `spawn_blocking` for sync FS work on a blocking thread.
- `is_safe_path()` helper in `file_ops.rs` prevents directory traversal — reuse for `create_folder` and `copy_path`.
- Atomic writes (`writeFile` uses tmp file + rename); destructive ops (`delete_file`) use direct `std::fs`.
- `CustomEvent` on `document` for cross-component signalling: `file-opened`, `file-opened-pinned`, `project-changed`, `file-tree-scroll-to-selected`. Add `file-tree-refresh` (or reuse `git-status-changed`) for post-op tree reload.
- `git-status-changed` Tauri event is already emitted on write operations — have delete/rename/create/copy emit it too so sidebar + tree both refresh.

### Integration Points
- **Context menu wiring:** add `onContextMenu={handleContextMenu}` on each tree row in `file-tree.tsx`. Menu built per-entry (delete, Open In submenu, New File, New Folder, Rename?).
- **Delete key:** add Delete/Cmd+Backspace case to existing `handleFlatKeydown` and `handleTreeKeydown` functions in `file-tree.tsx` — already handle ArrowUp/Down/Enter/Backspace.
- **Tree mouse-drag:** add `onMouseDown` on tree rows. Global `mousemove`/`mouseup` listeners. Reuse ghost+indicator approach from `unified-tab-bar.tsx`.
- **Tauri drag-drop event:** `getCurrentWindow().onDragDropEvent(event => { ... })` once in `main.tsx` or a dedicated module. Dispatch to the file tree via `CustomEvent`.
- **Header buttons:** add `[+]` (new file/folder dropdown) and "Open In" icon to the File Tree header row (currently hosts flat/tree toggle and path label).
- **Tree refresh after ops:** listen for `git-status-changed` (already used for sidebar) to trigger `loadDir` / `initTree` reload. Or emit a new `file-tree-refresh` event scoped to FS changes.
- **Context menu submenu rendering:** extend `ContextMenu` to track `hoveredSubmenuIndex`, render a second positioned panel beside the parent menu on hover. Handles viewport-flip for submenu independently.

</code_context>

<specifics>
## Specific Ideas

- "Open In" should work on the current **root project** (what's active in the app), not only on selected tree items. Hence D-10: a dedicated File Tree header icon button for the root-project trigger.
- Follow Phase 17's mouse-based drag pattern verbatim for intra-tree drag — WKWebView's broken HTML5 drag behavior is already known.
- Keep the create-new-file inline input VSCode-style — feels native to users coming from that editor.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-select deletion** — Shift/Cmd-click range selection is a broader refactor of the tree selection model.
- **Move-to-Trash** — macOS `NSFileManager trashItemAtURL:` via Rust trash crate. Safer delete but adds dependency and FFI.
- **Copy-on-Alt / Cmd-drag-to-move modifiers** — convention refinements for drag; defer until core drag flow is stable.
- **Persistent custom per-folder sort order** — conflicts with filesystem ordering and file-watcher-driven refresh. Not requested.
- **Auto-rename on conflict (`foo-1.ts`)** — aborting with toast is the simpler default; auto-rename can be added if conflict errors turn out to be frequent.
- **Cross-device move fallback (EXDEV → copy + delete)** — single-volume assumption holds for normal project use.
- **Replace / Keep Both / Cancel dialog on conflict** — Finder-style prompt; more friction than value for this phase.
- **Rename action** — `renameFile` exists in the service, but the inline-rename UX is not designed here. Could reuse the create inline-input pattern in a follow-up.
- **File-watcher-driven live tree refresh** — listed in v0.3.0 bug fixes (FIX-01) and explicitly owned by Phase 21.
- **Empty-space context menu on tree background** — could host "New File" / "New Folder" / "Open project in ..." but the header-button entry point covers the same ground with better discoverability.

### Reviewed Todos (not folded)
None — no todos surfaced for this phase.

</deferred>

---

*Phase: 18-file-tree-enhancements*
*Context gathered: 2026-04-16*
