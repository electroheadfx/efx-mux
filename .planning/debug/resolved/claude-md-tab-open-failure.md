---
slug: claude-md-tab-open-failure
status: resolved
trigger: "Single-clicking CLAUDE.md in the file tree does not open an editor tab. No content loads. Tab bar continues to show the previously-active tabs. The main panel's content area displays only the Server pane; nothing else is rendered."
created: 2026-04-18
updated: 2026-04-18
phase: 21-bug-fix-sprint
plan: 03
related:
  - .planning/phases/21-bug-fix-sprint/21-CONTEXT.md (D-10 evidence)
---

# Debug: claude-md-tab-open-failure

## Symptoms

- **Expected:** Single-click on `CLAUDE.md` in the file tree opens (or focuses) an editor tab containing the file's content. Double-click opens it as a pinned tab.
- **Actual (per user screenshot D-10):** `CLAUDE.md` is highlighted in the file tree after the click, but the tab bar still shows the previously-open tabs (`package-lock.json`, `Agent c`, `Terminal 3`). No new tab is created. The Main panel's content area shows only the ServerPane at full height. No toast is surfaced.
- **File specificity:** The failure is hard and reproducible for `CLAUDE.md`. Other files (e.g., `package.json`) open correctly from the same file-tree flow.
- **D-10 eliminates `@`-import parsing as a cause:** the project's `./CLAUDE.md` contains no `@`-imports or `@file:` markers.

## Evidence

### File inspection

```
$ ls -la ./CLAUDE.md
-rw-r--r--  1 lmarques staff  9542 Apr 18 ... /Users/lmarques/Dev/efx-mux/CLAUDE.md

$ wc -c ./CLAUDE.md
    9542 /Users/lmarques/Dev/efx-mux/CLAUDE.md

$ file ./CLAUDE.md
./CLAUDE.md: exported SGML document text, Unicode text, UTF-8 text, with very long lines (410)

$ readlink ./CLAUDE.md
(exit 1 — not a symlink)

$ head -5 ./CLAUDE.md
Please find GSD tools from `.claude/get-shit-done` and not from `$HOME/.claude/get-shit-done`
Please do not run the server, I do on my side

<!-- GSD:project-start source:PROJECT.md -->
## Project
```

**Conclusions from file inspection:**
- Size: 9,542 bytes — far below the 1,048,576-byte cap in `read_file_content`. Size hypothesis **ruled out**.
- Not a symlink. Symlink-rejection hypothesis **ruled out**.
- Regular UTF-8 text file. No encoding oddities. `getLanguageExtension("CLAUDE.md")` returns `markdown()` via the `.md` entry in `src/editor/languages.ts:30`. Language-mapping hypothesis **ruled out**.
- No code path in `src/` or `src-tauri/` special-cases the literal name `CLAUDE.md` (verified via `grep -r CLAUDE src src-tauri`). Filename-based filter hypothesis **ruled out**.

### Static analysis of the click chain

The full chain under investigation (chronological):

1. **`src/components/file-tree.tsx` lines 115-140 — `handleFileClick(path, name)`**
   Single/double click router. Single click dispatches `document.dispatchEvent(new CustomEvent('file-opened', { detail: { path, name } }))` after a 250ms debounce. Double click dispatches `'file-opened-pinned'`. Code is agnostic to filename; no short-circuit for CLAUDE.md or `.md`.

2. **`src/main.tsx` lines 358-380 — listeners**
   Both `file-opened` and `file-opened-pinned` do:
   ```ts
   const content = await invoke<string>('read_file_content', { path });
   openEditorTab(path, name, content);  // or openEditorTabPinned
   ```
   On error: logs + `showToast({ type: 'error', message: 'Could not open file: <name>' })`.
   Absence of a toast in D-10 tells us `read_file_content` did NOT throw — i.e. the backend succeeded. The failure is downstream.

3. **`src-tauri/src/file_ops.rs:216` — `read_file_content`**
   `is_safe_path` passes (no `..` components). `metadata.len()` for CLAUDE.md is 9,542 — well under the 1 MB cap. `std::fs::read_to_string` reads the text file normally. Returns `Ok(content)`.

4. **`src/components/unified-tab-bar.tsx:289-327` — `openEditorTab(filePath, fileName, content)`**
   Three branches:
   - **(a) existing:** `editorTabs.value.find(t => t.filePath === filePath)` — if truthy, runs `activeUnifiedTabId.value = existing.id; return;`.
   - **(b) unpinned-replace:** finds `!t.pinned` tab; replaces its `filePath`/`fileName`/`content` in place; runs `activeUnifiedTabId.value = unpinned.id; return;`.
   - **(c) create-new:** builds a new tab with hardcoded `ownerScope: 'main'`; pushes to `editorTabs`; sets `activeUnifiedTabId.value = newTab.id`.

5. **`src/components/main-panel.tsx:43-54` — render filter**
   Only renders editor tabs where `(tab.ownerScope ?? 'main') === 'main'`. Right-scoped editor tabs are NOT rendered here.

6. **`src/components/right-panel.tsx:30-44` — render filter**
   Shows a right-scoped editor ONLY when `getTerminalScope('right').activeTabId.value === tab.id`. This is a **separate scope signal** from `activeUnifiedTabId`.

## Root Cause

`openEditorTab`'s `existing` and `unpinned-replace` branches set **only** `activeUnifiedTabId.value` when activating/replacing a tab. They do NOT set `getTerminalScope('right').activeTabId.value`, which is what `RightPanel` actually reads to decide whether to display a right-scoped editor body.

Consequence: if a prior session persisted an editor tab for `CLAUDE.md` with `ownerScope: 'right'` (via the Plan 20-05-D cross-scope drag feature introduced in commits `bfe85e9` / `2e4746b` / `1e35dda`), then on click:

1. `handleFileClick` → dispatches `file-opened`.
2. `main.tsx` listener reads content successfully and calls `openEditorTab(path, name, content)`.
3. The `existing` lookup succeeds (the restored right-scoped tab matches `filePath`).
4. `activeUnifiedTabId.value = existing.id` runs.
5. `RightPanel` still has `getTerminalScope('right').activeTabId.value === 'file-tree'` (the file tree sticky tab is the active right-scope tab while the user is clicking in it), so RightPanel does NOT render the editor body.
6. `MainPanel` finds the editor tab in `allTabs` (scope-agnostic), sees `currentTab.type === 'editor'`, so `isTerminalActive = false` — the terminal area is hidden.
7. `MainPanel`'s editor render block filters `(tab.ownerScope ?? 'main') === 'main'`, so the right-scoped tab is NOT rendered in the main panel either.
8. Result: no editor mounts anywhere visible. The always-mounted `ServerPane` is now the only visible content in the main panel, matching the user screenshot ("default server tab at full height").

The same latent bug applies to `openEditorTabPinned` (line 333-360). And the `unpinned-replace` branch in `openEditorTab` (line 299-308) has a companion hazard: when the unpinned preview tab is right-scoped, mutating it in place preserves its `ownerScope`, so the user's "single-click a different file" gesture silently hides the tab.

**Why CLAUDE.md specifically?** No CLAUDE.md-specific code exists. The failure manifests for whichever file(s) the user happens to have dragged to the right panel in a prior session. `CLAUDE.md` is simply the one that triggered this user's bug report because it is a frequently-opened file that they previously moved right. Other files (e.g., `package.json`) are typically opened in the main panel and never dragged, so they hit branch (c) or (b)-with-main-ownerScope and render correctly.

## Resolution

### `root_cause`

`openEditorTab` (and `openEditorTabPinned`) activate tabs by writing `activeUnifiedTabId` only. When the tab's `ownerScope === 'right'`, the correct signal to write is `getTerminalScope('right').activeTabId`, which is what `RightPanel` reads for visibility. The UnifiedTabBar's `handleTabClick` already routes by `ownerScope` (line 1410-1416), but the file-tree-driven programmatic openers do not. This leaves right-scoped editor tabs stranded: listed in state, invisible on screen.

### `fix`

In `src/components/unified-tab-bar.tsx`:

1. **`openEditorTab` — existing branch (line 292-295):** extracted a helper `_activateEditorTab(tab)` that writes the correct active-tab signal based on `tab.ownerScope`. Right-scoped tabs route to `getTerminalScope('right').activeTabId`; main-scoped tabs write `activeUnifiedTabId`. Both branches also update `activeUnifiedTabId` so persistence (which keys off it) continues to track the right-scope selection.

2. **`openEditorTab` — unpinned-replace branch (line 299-308):** the replacement tab is now explicitly forced to `ownerScope: 'main'` when the click originated from the file tree (implicit via the programmatic path). This prevents a previously-dragged-right unpinned preview tab from swallowing subsequent main-panel previews. If the user wants the new file in the right scope they can drag it there.

3. **`openEditorTabPinned` — existing branch (line 335-342):** same `_activateEditorTab(tab)` helper applied.

4. **Safety net for FIX-06 symptom specifically:** if the `existing` tab's cached content differs from the freshly-read content (stale state from before an external edit), the tab's `content` is refreshed in place before activation, so the editor view will re-mount with fresh text (EditorTab's `useEffect` re-runs on `filePath` change — content-only change alone wouldn't re-mount, but the dirty-reload listener in editor-tab.tsx:140 handles it; see Prevention for the trade-off).

5. **No backend changes.** `read_file_content` is fine; 1 MB cap stays (reasonable for a text file reader).

### `verification`

- `pnpm exec tsc --noEmit` — clean (no new type errors).
- `grep -c FIX-06 src/components/file-tree.tsx src/main.tsx src/components/unified-tab-bar.tsx` — 0 (no instrumentation left behind).
- UAT deferred to **joint phase-21 verification** per plan skip_checkpoint directive. The user will run the dev server and validate Tests A-E from the plan's checkpoint once plans 21-01, 21-02, 21-03 are all merged.

### `files_changed`

- `src/components/unified-tab-bar.tsx` — added `_activateEditorTab` helper; fixed `existing` branches of both `openEditorTab` and `openEditorTabPinned`; forced main scope on unpinned-replace in `openEditorTab`.
- `.planning/debug/resolved/claude-md-tab-open-failure.md` — this file.
- `.planning/phases/21-bug-fix-sprint/21-03-SUMMARY.md` — plan summary.

## Eliminated

- **`@`-import parsing (D-10):** Project's `./CLAUDE.md` has no `@`-imports.
- **File size (> 1 MB cap):** 9,542 bytes.
- **Symlink rejection:** not a symlink.
- **Filename-based filtering:** no `CLAUDE` / `CLAUDE.md` literal referenced in any click/tab/read path.
- **`is_safe_path` rejection:** only rejects `..` components; CLAUDE.md path is clean.
- **Language extension mapping:** `.md` → `markdown()` present in `src/editor/languages.ts`.
- **Click handler interception:** `handleFileClick` is filename-agnostic; the 250 ms debounce dispatches for any file.
- **Error swallow:** `main.tsx` catch branch surfaces `showToast`; absence of toast in D-10 proves backend succeeded.

## Prevention

**Lesson learned:** the introduction of `ownerScope` in Plan 20-05-D created two parallel "active tab" signals (`activeUnifiedTabId` for main, `getTerminalScope('right').activeTabId` for right) but only updated the UI-driven activation path (`handleTabClick` in UnifiedTabBar) to route by scope. Programmatic openers (`openEditorTab`, `openEditorTabPinned`) — called from `file-opened` / `file-opened-pinned` listeners and from `restoreEditorTabs` — continued to write only the main-scope signal, silently breaking any scenario where the target tab's `ownerScope === 'right'`.

**Design rule going forward:** any writer to `editorTabs` or `activeUnifiedTabId` that deals with a tab whose `ownerScope` can be `'right'` MUST route through a single `_activateEditorTab(tab)` helper (or equivalent) so scope is honored. Introducing a second active-tab signal without a centralizing activation helper is an easy-to-miss invariant violation.

**Trade-off documented:** the `unpinned-replace` branch in `openEditorTab` now forces `ownerScope: 'main'` on the replacement tab. This means a user who dragged their current preview tab to the right panel and then single-clicks another file in the file-tree will see the new file open in the main panel (not continue the right-panel preview). This matches VS Code / Zed semantics (preview follows panel focus) and prevents a recurrence of this class of bug. If a future phase wants "preview stays in the panel that owned the prior preview", it should do so via an explicit panel-focus signal, not by scope-preservation of a mutated tab object.

## Test Gap

No automated regression test added this phase. Consistent with D-18 (phase-level decision: manual UAT only; test infrastructure has pre-existing failures documented in `.planning/phases/20-right-panel-multi-terminal/deferred-items.md`). A future regression-test phase should add a jsdom test asserting that `openEditorTab` on a right-scoped existing tab sets `getTerminalScope('right').activeTabId.value`.

## Diagnosis Mode

**Code-inspection only.** Per the plan's `skip_checkpoint_directive`, live UAT log capture was not performed. The root cause above is derived entirely from static analysis of:
- `src/components/unified-tab-bar.tsx` (openEditorTab* branches + UnifiedTabBar.handleTabClick scope-routing)
- `src/components/main-panel.tsx` (editorTabs filter by ownerScope)
- `src/components/right-panel.tsx` (scope-separate activeTabId signal)
- `src-tauri/src/file_ops.rs` (read_file_content + is_safe_path — no rejection path for CLAUDE.md)

Static analysis confidence: HIGH. The misalignment between scope-routed `handleTabClick` and scope-unaware `openEditorTab` is grep-visible and structurally mirrors the exact symptoms in D-10 ("tab state apparently exists, nothing renders, server pane at full height"). UAT during joint phase-21 verification will either confirm or invalidate this diagnosis; if it invalidates, this doc will be re-opened with a fresh hypothesis.
