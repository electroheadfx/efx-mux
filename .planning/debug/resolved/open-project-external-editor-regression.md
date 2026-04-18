---
slug: open-project-external-editor-regression
status: investigating
trigger: "Open Project in external editor" header button AND file-tree row "Open In" context-menu items both fail silently — even when a project is active and editors are detected
created: 2026-04-18
updated: 2026-04-18
phase: 21-bug-fix-sprint
plan: 02
related:
  - .planning/debug/resolved/open-project-external-editor.md (prior 02abef6 fix — header-button-only visibility gate)
---

# Debug: open-project-external-editor-regression

## Symptoms

- **Expected:** With an active project AND at least one external editor detected,
  - Header "Open Project in external editor" button opens a dropdown of editors, clicking one launches that editor with the project folder.
  - Right-clicking any file/folder in the file tree shows an "Open In" submenu; clicking an editor launches it with that path.
- **Actual:** Both invocation paths fail silently. No editor launches. No toast. Clicking produces no observable change.
- **Error messages:** None visible. Any error is being swallowed somewhere in the chain.
- **Timeline:**
  - Fix shipped 2026-04-18 in commit 02abef6 (`.planning/debug/resolved/open-project-external-editor.md`) — addressed button visibility when no project was active.
  - Current regression: distinct from the 02abef6 symptom. Project IS active, editors ARE detected, button IS visible, but the click has no effect.
- **Reproduction:** Click header button with project active, or right-click a file → Open In → click any editor entry.

## Current Focus

- hypothesis: backend `.spawn().map(|_| ())` swallows non-zero exit from `open -a`, so a LaunchServices resolution failure (e.g., app label mismatch between `detect_editors` result and the CFBundleName macOS expects) looks identical to success.
- test: instrument both invocation paths (frontend `console.log` + backend `eprintln!`), wait on `open`'s child exit status, UAT to capture logs.
- expecting: logs reveal either (a) `open -a` exits non-zero with a resolution error, OR (b) spawn itself fails, OR (c) frontend never reaches `launchOrToast` (different failure layer than suspected).
- next_action: UAT-driven diagnosis at Task 2 of plan 21-02; capture logs; finalize root cause.
- reasoning_checkpoint: prior fix (02abef6) ONLY addressed the "no project active" edge case in button visibility; it did not touch the backend or the launch path at all, so the backend's spawn-and-forget shape is still in place and is the most plausible blind spot for a silent regression.
- tdd_checkpoint: no automated test coverage for the full launch path (test infra has known pre-existing failures — see 20-right-panel-multi-terminal/deferred-items.md). Manual UAT per D-18.

## Evidence

### Git History (captured 2026-04-18)

**src/components/file-tree.tsx** (most recent 20):
```
63e3d94 feat(21-01): wire file-tree listener for file-tree-changed
28ccf0c fix(260418-oep): hide Open-In header button when no active project
029ee53 feat(quick-260417-iat): keyboard delete shortcut for folders in file tree
34201e5 feat(quick-260417-hgw): open new file in tab + expand parent on create
38f6732 fix(quick-260417-f6e): subscribe to activeUnifiedTabId to reveal file when editor tabs hydrate after FileTree
05ae153 feat(quick-260417-f6e): seed FileTree selection from active tab on initial load
a966019 feat(18-09): listen for delete-selected-tree-row from native menu (UAT Test 5 fix)
0b3d4ce fix(18-08): preserve tree expand/collapse state across git-status-changed
a90f7f8 fix(18-07): add x-axis bounds to 4 [data-file-tree-index] hit-tests
9d88884 fix(quick-260416-uig): add WebkitUserSelect for WKWebView to prevent right-click filename selection
db0e845 feat(quick-260416-uig): decouple hover from click-selection in FileTree
809eb7e feat(18-05): wire Finder drop handlers + drop-zone outline in file-tree
2fecb61 feat(18-05): implement intra-tree mouse-drag to move files via renameFile
02bdb05 feat(18-04): wire Open In submenu + header [+] / Open In buttons in file-tree
2bb2227 feat(18-03): wire context menu + Delete key flow in file-tree.tsx
53d6917 fix(quick-260416-o1k): defer revealFileInTree when tree data not yet loaded
44cf193 feat(quick-260416-nmw): export leftSidebarActiveTab and add revealFileInTree
aeef99e feat(quick-260416-j71): wire file-tree single-click and double-click events
f9116b2 refactor(14-01): remove Arrow.js migration header comments
6cb3eb1 feat: Phase 10 pixel-perfect UI rewrite + bug fixes + milestone v0.1.0
```

**src/services/file-service.ts** (most recent 20 — short list):
```
5f2edcb feat(18-01): register Phase 18 commands, add TS wrappers + tests
711ffc1 fix(17-05): git tree refresh after save and editor content refresh after revert
52de9d2 fix(editor): restore opened editor tabs on app restart
9ba9440 feat(15-02): add git-service.ts and file-service.ts with tests
```

**src-tauri/src/file_ops.rs** (most recent 20 — short list, truncated):
```
df6741f fix(18-06): create_file rejects existing path instead of truncating
159dbf4 test(18-06): add failing test for create_file_rejects_existing
1b89f69 feat(18-01): add external editor Rust commands (launch, open, reveal, detect)
9131199 feat(18-01): add create_folder, copy_path, count_children Rust commands
585281b fix: handle staged file diffs in get_file_diff (HEAD→index + index→workdir)
eee681a feat(15-02): extend file_ops.rs with write/delete/rename/create commands
a257bc4 feat(13-02): add unit tests for file_ops.rs
64b7e2a feat(09-03): rebuild diff viewer with GitHub-style rendering
74861f1 fix(08): five user-reported bugs from UAT testing
2f872d2 feat(06-05): add file tree root guard and bash terminal resize handler
5f90755 feat(06-01): add file operations commands (D-04, D-06, D-01)
```

**src-tauri/tauri.conf.json** (most recent 10):
```
c461e2a feat(18-02): enable Tauri Finder drop events via dragDropEnabled config (D-19)
67ab207 fix(quick-260415-i4n): overlay title bar with add-project button
a997437 chore: release v0.2.2
2d24724 fix: Git Changes pane showing stale/phantom files (v0.2.1)
98211fb feat(06.1-05): create main.tsx Preact entry point and update tauri.conf.json
03b3379 fix(03): remove HTML comments from Arrow.js templates + Efxmux branding
8b77f47 feat(01-04): add macOS Edit menu, entitlements, and finalize tauri.conf.json
3eb2b58 feat(01-01): scaffold Tauri 2 project with vanilla template
```

**Observations:**
- `src-tauri/src/file_ops.rs` has NOT been touched since Phase 18 (commit 1b89f69 added the launch command itself, df6741f is unrelated). The backend launch shape has been static.
- `src/services/file-service.ts::launchExternalEditor` has NOT been touched since Phase 18 (5f2edcb).
- `src/components/file-tree.tsx` was touched in commit 28ccf0c (the prior 02abef6 fix) and more recently 63e3d94 (plan 21-01, file-tree-changed listener — unrelated to Open-In).
- `tauri.conf.json` not touched recently; no entitlement / sandbox commits that would plausibly explain a launch failure. The project already has sandbox disabled per PROJECT.md constraint.

Conclusion: no post-02abef6 commit touched the launch code path. The "regression" is therefore likely a latent bug — same backend shape was always silently swallowing failures, but an earlier install had matching app names and it worked by luck. This is consistent with the "spawn and forget" suspect pattern.

### Suspect Code — Frontend

Relevant code shape (pre-Task-1):

```typescript
// src/components/file-tree.tsx (around line 1108)
function buildOpenInChildren(path: string): ContextMenuItem[] {
  const ed = detectedEditors.value;
  if (!ed) return [];
  const children: ContextMenuItem[] = [];
  if (ed.zed)    children.push({ label: 'Zed', ... });
  if (ed.code)   children.push({ label: 'Visual Studio Code', ... });
  if (ed.cursor) children.push({ label: 'Cursor', ... });
  if (ed.subl)   children.push({ label: 'Sublime Text', ... });
  if (ed.idea)   children.push({ label: 'IntelliJ IDEA', ... });
  return children;
}

async function launchOrToast(app: string, path: string): Promise<void> {
  try { await launchExternalEditor(app, path); }
  catch { showToast({ type: 'error', message: `Could not launch ${app}`, ... }); }
}
```

`detect_editors` probes CLI binary presence (`which zed`, `which code`, ...) — but the LABEL passed to `open -a` is `"Zed"`, `"Visual Studio Code"`, etc., which must match the installed app's CFBundleName. If the user has the CLI on PATH but the `.app` bundle has a non-standard name (e.g., `Zed Preview.app`, `Code - Insiders.app`, `IntelliJ IDEA CE.app`), `open -a Zed` would exit non-zero with "Unable to find application named 'Zed'".

### Suspect Code — Backend

Relevant code shape (pre-Task-1):

```rust
// src-tauri/src/file_ops.rs:554
pub fn launch_external_editor_impl(app: &str, path: &str) -> Result<(), String> {
    if !is_safe_path(path) { return Err("Invalid path: directory traversal not allowed".into()); }
    std::process::Command::new("open")
        .args(["-a", app, path])
        .spawn()
        .map(|_| ())                    // ← swallows non-zero exit
        .map_err(|e| e.to_string())
}
```

`.spawn().map(|_| ())` returns `Ok(())` as long as the child process could be forked — it does NOT wait for the child and does NOT inspect its exit code. `open -a Foo` forks cleanly even if Foo does not exist, then LaunchServices rejects the request asynchronously and `open` exits 1. The parent never sees this.

### `is_safe_path` — Not the Issue

```rust
fn is_safe_path(path: &str) -> bool {
    let p = Path::new(path);
    !p.components().any(|c| c.as_os_str() == "..")
}
```

Only rejects paths containing `..`. Project roots like `/Users/.../Dev/efx-mux` pass. Not the failure point.

### Command Registration — Not the Issue

`src-tauri/src/lib.rs:183` still lists `file_ops::launch_external_editor`. IPC arg names `app` + `path` match the invoke call in `file-service.ts`.

## Current Hypothesis (to be confirmed by UAT logs)

1. User clicks Open-In (header or row context menu).
2. Frontend `launchOrToast` fires → `launchExternalEditor('Zed', '/path/to/project')` → IPC resolves.
3. Rust `launch_external_editor_impl` spawns `open -a Zed /path/to/project`.
4. `open` forks successfully → Rust returns `Ok(())` → frontend sees success.
5. Meanwhile, `open` exits 1 with "Unable to find application named 'Zed'" (or similar) — the user sees nothing happen.
6. Frontend catch block never triggers → no toast → silent failure.

The Task-1 instrumentation (child.wait() + structured error) should turn (4) into an `Err(...)`, which propagates through `invoke` → `launchExternalEditor` throws → `launchOrToast` shows the toast.

## Eliminated (so far)

- Command not registered: lib.rs:183 confirms registration.
- Command signature mismatch: `launch_external_editor(app, path)` matches `invoke('launch_external_editor', { app, path })` (Tauri auto-maps).
- `is_safe_path` over-strict: only rejects `..`; project roots pass.
- Tauri 2 shell permissions: we use `std::process::Command`, not the shell plugin.
- Recent entitlements / sandbox regression: tauri.conf.json untouched since Phase 18; sandbox already disabled.

## Resolution

*(To be filled at end of Task 2 after UAT confirms which layer fails.)*

## Prevention

*(To be filled at end of Task 2.)*

## Test Gap

Test infra has known pre-existing failures (`.planning/phases/20-right-panel-multi-terminal/deferred-items.md`). Regression-test cleanup is a future phase. Manual UAT per D-18 for this plan.

**Minimum added assertion (once test infra is healthy):** a backend test that spawns `launch_external_editor_impl("NonexistentApp_XYZ", <tempdir>)` and asserts it returns `Err(...)` — proves the spawn-and-forget swallow is closed.
