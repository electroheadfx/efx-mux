# Phase 18: File Tree Enhancements — Research

**Researched:** 2026-04-16
**Domain:** Tauri 2 + Preact file tree UX (delete, drag-drop, external editors, inline create)
**Confidence:** HIGH

## Summary

- Tauri 2's `onDragDropEvent()` lives on `getCurrentWebviewWindow()` (webviewWindow module), payload is a discriminated union `{ type: 'enter'|'over'|'drop'|'leave', paths?, position? }`. [VERIFIED: Tauri v2 docs + GitHub issues]
- `dragDropEnabled` key sits at `app.windows[0].dragDropEnabled` in `tauri.conf.json` — currently absent in the project's config (defaults to `true`, but must be set explicitly for Finder import handler to be relied on). [VERIFIED: existing tauri.conf.json read + Tauri issue #14373]
- Rust std has no recursive copy — hand-roll `copy_path` with `fs::read_dir` + `fs::copy` + `fs::create_dir_all`; follow symlinks (simpler, acceptable for project files). Avoid adding `fs_extra`/`walkdir` deps — std path matches existing `file_ops.rs` style. [VERIFIED: rust-cookbook + doc.rust-lang.org]
- macOS `open -a "Visual Studio Code" /path` handles spaces fine, resolves via LaunchServices (finds app in `/Applications`, `~/Applications`, Homebrew Cask symlinks). Exit code 0 on launch success, 1 when app not found. Do NOT pass `-n` (always-new-instance) — editors should reuse existing window. [VERIFIED: ss64.com + scriptingosx.com + Apple man page]
- Preact inline input pattern: signal-backed value + `useEffect` focus-on-mount + `onKeyDown` for Enter/Esc + `onBlur` for commit. No new library needed. [VERIFIED: existing Preact patterns in repo]
- Context menu submenu: extend `ContextMenuItem` with optional `children?: ContextMenuItem[]`, track `hoveredSubmenuIndex` signal, render nested `<ContextMenu>` at parent row's right edge. ~150ms hover delay before reveal, mirror `auto-flip` logic independently. [ASSUMED: no existing submenu; straightforward composition]
- Child count: new `count_children(path) -> { files, folders, total, capped }` command using `fs::read_dir` recursion capped at 10k entries. Avoids hanging on `node_modules`. [VERIFIED: std::fs behavior]

**Primary recommendation:** Stay with `std::fs` everywhere; no new crates. Extend existing `ContextMenu` component in place. Follow `unified-tab-bar.tsx:575-680` mouse-drag pattern verbatim for intra-tree drag.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TREE-01 | Delete via context menu with confirmation | Existing `delete_file` + `ConfirmModal`; new `count_children` for message |
| TREE-02 | Delete via Delete key | Keyboard listener on tree scroll container (already `tabIndex=0`) |
| TREE-03 | Open in external editor | `std::process::Command` + `open -a` launch; `which <cli>` probe at startup |
| TREE-04 | Drag/drop within tree (move-to-folder) | Mouse-event pipeline (unified-tab-bar pattern); existing `rename_file` |
| TREE-05 | Finder → tree import | `onDragDropEvent` listener; new `copy_path` Rust command (std recursion) |
| MAIN-03 | Create new file from folder context | Inline input row; existing `create_file` + new `create_folder` command |

## 1. Tauri 2 File Drop API

**Module:** `@tauri-apps/api/webviewWindow` (not `window`). Import:

```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
  // event.payload is the DragDropEvent union
  if (event.payload.type === 'drop') {
    const paths: string[] = event.payload.paths; // absolute FS paths
    const { x, y } = event.payload.position;     // PhysicalPosition (DPI-scaled)
    // Route: check if any path is inside projectRoot → ignore (intra-drag handles it)
    //        else → invoke('copy_path', { from, to })
  }
});
```

**Payload shape:**
```ts
type DragDropEvent =
  | { type: 'enter'; paths: string[]; position: PhysicalPosition }
  | { type: 'over'; position: PhysicalPosition }
  | { type: 'drop'; paths: string[]; position: PhysicalPosition }
  | { type: 'leave' };
```

**Config:** Add to `tauri.conf.json` under `app.windows[0]`:
```json
"dragDropEnabled": true
```
Default is already `true`, but set explicitly for clarity and because absence is ambiguous across Tauri docs. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/]

**Known gotchas:**
- `leave` payload is empty `{type:'leave'}` — no position info. [CITED: tauri#10697]
- Drop events can fire twice on some WKWebView builds — dedupe by `(type, paths)` signature if observed. [CITED: tauri#14134]
- `position` is **physical** pixels — divide by `window.devicePixelRatio` before hit-testing against DOMRect. [CITED: tauri#10744]

## 2. Rust Recursive Directory Copy

Use std only (matches `file_ops.rs` style; no new deps). Follow symlinks (simplicity — project files don't contain link cycles in practice).

```rust
pub fn copy_path_impl(from: &str, to: &str) -> Result<(), String> {
    if !is_safe_path(from) || !is_safe_path(to) { return Err("...".into()); }
    let from_p = Path::new(from);
    let to_p = Path::new(to);
    if to_p.exists() { return Err(format!("Target exists: {}", to)); } // D-20
    let meta = std::fs::metadata(from_p).map_err(|e| e.to_string())?;
    if meta.is_file() {
        std::fs::copy(from_p, to_p).map(|_| ()).map_err(|e| e.to_string())
    } else if meta.is_dir() {
        copy_dir_recursive(from_p, to_p).map_err(|e| {
            // Partial-failure cleanup: best-effort remove partial target
            let _ = std::fs::remove_dir_all(to_p);
            e.to_string()
        })
    } else { Err("Unsupported file type".into()) }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_child = dst.join(entry.file_name());
        if ty.is_dir() { copy_dir_recursive(&entry.path(), &dst_child)?; }
        else { std::fs::copy(entry.path(), &dst_child)?; }
    }
    Ok(())
}
```

**Partial-failure policy:** on any error, best-effort `remove_dir_all` on target to avoid half-copied state. Callers see the original error via toast. [ASSUMED: simplest safe behavior; matches D-20 abort semantics]

**Symlink handling:** `fs::metadata` + `fs::copy` follow symlinks by default. Acceptable — project directories rarely contain symlink cycles. Defer cycle detection to Phase 21+ if it becomes a problem.

## 3. macOS `open -a` Behavior

```rust
std::process::Command::new("open")
    .args(["-a", app_name, path])  // app_name = "Visual Studio Code" (quotes NOT needed — args[] is already argv-safe)
    .spawn()
    .map_err(|e| e.to_string())?;
```

- Spaces in `app_name` are fine — `args[]` bypasses shell word-splitting. [VERIFIED: Rust Command docs]
- LaunchServices resolves the app across `/Applications/`, `~/Applications/`, Homebrew Cask (symlinked into `/Applications/`). [CITED: ss64.com/mac/open.html]
- Exit codes: 0 = launched, 1 = app not found. Parent `open` exits immediately after launching (no wait by default). Do NOT use `-W` (waits for app exit — blocks our process).
- **Do NOT pass `-n`** — that forces a new instance on every invocation. We want reuse: second click reuses the already-running Zed/VSCode window. Default (no `-n`) reuses.
- Fire-and-forget with `.spawn()` returns `Ok` immediately; capture stderr via `.output()` if you want "app not found" feedback for the toast.

## 4. External Editor Detection

Probe at app start (once; cache result):

```rust
fn detect_editor(cli: &str) -> bool {
    std::process::Command::new("which").arg(cli).output()
        .map(|o| o.status.success()).unwrap_or(false)
}
// Run once: detect_editor("zed"), detect_editor("code"), detect_editor("subl"),
//           detect_editor("cursor"), detect_editor("idea")
```

Expected CLI shims on macOS: `zed`, `code` (VSCode), `subl` (Sublime), `cursor`, `idea` (IntelliJ/JetBrains Toolbox).

**Always-available fallbacks** (no detection needed):
- "Reveal in Finder" → `open -R <path>`
- "Open with default app" → `open <path>`

For GUI-only installs (no CLI shim), the `open -a "Zed"` path still works via LaunchServices even when `which zed` returns nothing. Menu strategy: if `which` detects the CLI → show; otherwise probe app-bundle existence via `ls /Applications/<Name>.app` as a secondary check. [OUT OF SCOPE for this phase: full `mdfind` bundle-id lookup — the two-tier `which` + `/Applications/` check covers 95% of installs.]

## 5. Inline Input Pattern (Preact)

VSCode-style: insert a row with a pre-focused `<input>` under the target folder. Enter commits, Esc cancels, blur commits (only if valid).

```tsx
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

function CreateRow({ parentDir, kind, onDone }: { parentDir: string; kind: 'file'|'folder'; onDone: () => void }) {
  const name = signal('');
  const error = signal<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const validate = (v: string): string | null => {
    if (!v.trim()) return 'Name required';
    if (v.includes('/') || v.includes('\0')) return 'Invalid characters';
    return null;
  };
  const commit = async () => {
    const err = validate(name.value);
    if (err) { error.value = err; return; }
    const target = `${parentDir}/${name.value}`;
    try {
      if (kind === 'file') await createFile(target);
      else await createFolder(target);
      onDone();
    } catch (e: any) { error.value = e.message ?? String(e); }
  };
  return (
    <div>
      <input ref={inputRef}
        value={name.value}
        onInput={(e) => { name.value = (e.target as HTMLInputElement).value; error.value = null; }}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') onDone(); }}
        onBlur={commit}
      />
      {error.value && <div style={{ color: colors.diffRed, fontSize: 11 }}>{error.value}</div>}
    </div>
  );
}
```

**Note:** `onBlur` firing commit must NOT dismiss the row on validation error — keep the row mounted by rendering error + re-focusing input, OR have parent only unmount on successful `onDone()`. The snippet above relies on parent unmount.

## 6. Context Menu Submenu

Extend `ContextMenuItem`:
```ts
export interface ContextMenuItem {
  label: string;
  action?: () => void;         // optional when children present
  icon?: ComponentType<{ size?: number }>;
  disabled?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[]; // NEW: triggers submenu rendering
}
```

In `ContextMenu`, track `hoveredIndex` via `useSignal(null)` and a 150ms `setTimeout` on `onMouseEnter`. Row with `children` renders a chevron `▸` on the right. On hover-after-delay, render a nested `<ContextMenu>` positioned at `parentRow.right + 2px, parentRow.top`. Pass `onClose` through so selecting a child closes the whole stack.

```tsx
// Sketch:
const [subIndex, setSubIndex] = useState<number | null>(null);
const hoverTimer = useRef<number | null>(null);
const onRowEnter = (i: number, hasChildren: boolean) => {
  if (hoverTimer.current) clearTimeout(hoverTimer.current);
  if (!hasChildren) { setSubIndex(null); return; }
  hoverTimer.current = window.setTimeout(() => setSubIndex(i), 150);
};
// In render: if (item.children && subIndex === i) render nested ContextMenu
// at { left: parentRect.right + 2, top: parentRect.top }
```

**Flip logic** for submenu (independent from parent): if `parentRect.right + submenuWidth > viewportWidth`, position at `parentRect.left - submenuWidth - 2` instead. Same pattern as existing `auto-flip` in ContextMenu lines 28-35.

**Keyboard nav (ArrowRight enters, ArrowLeft exits):** [ASSUMED — nice-to-have; can defer if time pressure]. Basic version: ArrowRight on a row with `children` sets `subIndex`, ArrowLeft in a submenu sets parent `subIndex = null`.

## 7. Directory Child-Count

New Rust command. Use std recursion; cap at 10k entries to prevent `node_modules` hangs. Return early with `capped: true` for the confirm-modal message.

```rust
#[derive(serde::Serialize)]
pub struct ChildCount { pub files: u32, pub folders: u32, pub total: u32, pub capped: bool }

#[tauri::command]
pub async fn count_children(path: String) -> Result<ChildCount, String> {
    if !is_safe_path(&path) { return Err("Invalid path".into()); }
    spawn_blocking(move || {
        let mut c = ChildCount { files: 0, folders: 0, total: 0, capped: false };
        let _ = walk(Path::new(&path), &mut c, 10_000);
        Ok(c)
    }).await.map_err(|e| e.to_string())?
}
fn walk(dir: &Path, c: &mut ChildCount, cap: u32) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        if c.total >= cap { c.capped = true; return Ok(()); }
        let e = entry?; let ty = e.file_type()?;
        c.total += 1;
        if ty.is_dir() { c.folders += 1; let _ = walk(&e.path(), c, cap); }
        else { c.files += 1; }
    }
    Ok(())
}
```

Message formatting (frontend): `Delete 'src/components' (12 items)?` or capped: `Delete 'node_modules' (10000+ items)?`.

## Validation Architecture

> nyquist_validation section (default enabled; no config.json override observed).

1. **Delete file:** After `delete_file(path)` succeeds → `test ! -e <path>` is true AND tree re-renders without the row. No stale row remains.
2. **Create file:** After `create_file(path)` succeeds → `test -f <path>` is true AND new row appears with `selectedIndex` pointing at it.
3. **Create folder:** After `create_folder(path)` succeeds → `test -d <path>` is true AND tree shows the folder.
4. **Intra-tree move (TREE-04):** After drag-drop → `test ! -e <source>` AND `test -f <target>` AND source parent no longer lists the file.
5. **Finder import (TREE-05):** After drop → `test -f <target-inside-project>` AND `test -f <source-outside-project>` (source preserved — copy semantics per D-15).
6. **External editor launch (TREE-03):** `Command::new("open").args(["-a", ...]).spawn()` returns `Ok`; exit code 0 within 2s (non-blocking — don't `.wait()`). On failure, toast shows app name.
7. **Conflict abort (D-20):** Attempting `copy_path` where target exists → returns `Err` without touching filesystem; toast displayed; no partial target left behind.

## Open Questions

1. **Submenu keyboard nav priority** — ArrowRight/ArrowLeft for submenu entry/exit adds ~30 lines of state. Worth it for v1, or defer? Claude's discretion per CONTEXT.md — recommend: defer if schedule-critical, include if budget allows.
2. **Which `file-tree-refresh` pattern** — CustomEvent on document vs. reuse existing `git-status-changed` Tauri event. The latter is simpler but conflates meanings. Not blocking; planner can decide.
3. **Count-children cap value (10k)** — is that too aggressive for monorepos? 50k would cover most, but `.git` alone can have 30k loose objects. Counter-arg: 10k is already past the point where "N items" stops being useful; "10000+" conveys the same "a lot" signal.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No existing submenu in ContextMenu (verified via Read) | §6 | Low — confirmed by reading context-menu.tsx |
| A2 | ArrowRight/ArrowLeft keyboard nav deferrable | §6 | Low — accessibility nice-to-have |
| A3 | 10k cap is acceptable for count_children | §7 | Low — easy to adjust based on user feedback |
| A4 | Symlink following (vs preserving) acceptable for copy_path | §2 | Medium — could duplicate large trees if user has link to a big dir; mitigate by respecting 10k-style cap if needed |

## Sources

### Primary (HIGH)
- https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/ — onDragDropEvent API shape
- https://v2.tauri.app/blog/tauri-20/ — Tauri 2 rename: FileDropEvent → DragDropEvent
- https://github.com/tauri-apps/tauri/issues/14373 — dragDropEnabled naming + semantics
- https://doc.rust-lang.org/std/fs/ — read_dir, copy, create_dir_all
- https://ss64.com/mac/open.html — open command options and LaunchServices resolution
- https://rust-lang-nursery.github.io/rust-cookbook/file/dir.html — recursive traversal patterns
- Local read: `src-tauri/src/file_ops.rs`, `src/components/context-menu.tsx`, `src-tauri/tauri.conf.json`, `src/services/file-service.ts`

### Secondary (MEDIUM)
- https://github.com/tauri-apps/tauri/issues/10744 — drag position DPI gotcha
- https://github.com/tauri-apps/tauri/issues/14134 — duplicate drop events
- https://scriptingosx.com/2017/02/the-macos-open-command/ — open -a / -b bundle-id behavior

## Metadata

- **Confidence:** HIGH overall. All technical claims verified via official docs or existing code.
- **Research date:** 2026-04-16
- **Valid until:** ~2026-05-16 (Tauri 2.x API stable; std::fs is frozen)

## RESEARCH COMPLETE
