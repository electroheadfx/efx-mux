# Phase 18: File Tree Enhancements - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 10 (5 modify + 3 Rust modify + 1 config + 1 new test)
**Analogs found:** 10 / 10 (100% coverage — all patterns exist in-repo)

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match |
|------|--------------|------|-----------|----------------|-------|
| `src/components/file-tree.tsx` | MODIFY | Preact component | event-driven + request-response | self + `unified-tab-bar.tsx:573-753` (drag) | exact |
| `src/components/context-menu.tsx` | MODIFY | Preact component | event-driven (UI) | self (Phase 15) | exact |
| `src/services/file-service.ts` | MODIFY | IPC service wrapper | request-response | self (Phase 15 `createFile`) | exact |
| `src/main.tsx` | MODIFY | Bootstrap/wiring | event-driven | self — `listen()` / `getCurrentWindow()` usage | exact |
| `src/components/file-tree.test.tsx` | MODIFY | Vitest component test | mock IPC | self (already exists) | exact |
| `src/services/file-service.test.ts` | MODIFY | Vitest service test | mock IPC | self (Phase 15 tests) | exact |
| `src-tauri/src/file_ops.rs` | MODIFY | Rust Tauri command | FS I/O + spawn_blocking | self — `create_file_impl` / `delete_file_impl` | exact |
| `src-tauri/src/lib.rs` | MODIFY | Command registry | config | self — existing `generate_handler!` | exact |
| `src-tauri/src/file_ops.rs` inline `#[cfg(test)]` | MODIFY | Rust unit test | tempfile FS | self — existing tests at lines 393-622 | exact |
| `src-tauri/tauri.conf.json` | MODIFY | Config JSON | static | self (add one field under `app.windows[0]`) | exact |

**Note:** `src-tauri/tests/file_ops_tests.rs` does NOT exist — tests live inline as `#[cfg(test)] mod tests` inside `file_ops.rs` (line 392+). Follow that convention.

---

## Pattern Assignments

### `src/components/context-menu.tsx` (Preact component, event-driven UI) — MODIFY

**Analog:** self (extend existing)

**Current structure** (lines 4-22): Import `ComponentType` from Preact, export a flat `ContextMenuItem` interface with `label / action / icon? / disabled? / separator?`. Add `children?: ContextMenuItem[]` and make `action?` optional when `children` is present.

**Existing auto-flip logic** (lines 28-35) — **mirror this pattern for submenu independently**:
```tsx
useEffect(() => {
  if (!menuRef.current) return;
  const rect = menuRef.current.getBoundingClientRect();
  const flipX = x + rect.width > window.innerWidth;
  const flipY = y + rect.height > window.innerHeight;
  if (flipX) menuRef.current.style.left = `${x - rect.width}px`;
  if (flipY) menuRef.current.style.top = `${y - rect.height}px`;
}, [x, y]);
```
**Apply to submenu:** same computation, but compare against `parentRect.right + submenuWidth > viewportWidth` → flip to `parentRect.left - submenuWidth - 2`.

**Existing close-outside logic** (lines 38-55) — reuse as-is:
```tsx
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
  };
  const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
  };
}, [onClose]);
```
**Extend for submenu:** `handleClickOutside` must check both the parent menuRef AND the submenu ref before closing (submenu items are outside the parent DOM tree).

**Menu row rendering** (lines 91-110) — pattern for adding chevron when `children` present:
```tsx
<div key={i} role="menuitem" aria-disabled={item.disabled}
  onClick={() => handleItemClick(item)}
  style={{
    padding: `${spacing.lg}px ${spacing['4xl']}px`,
    fontFamily: fonts.sans, fontSize: 13,
    color: item.disabled ? colors.textDim : colors.textPrimary,
    cursor: item.disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', gap: spacing.xl,
  }}>
  {item.icon && <item.icon size={14} />}
  {item.label}
  {/* NEW: submenu chevron at right edge */}
  {item.children && <span style={{ marginLeft: 'auto', fontSize: 10, color: colors.textMuted }}>▸</span>}
</div>
```

**New: hover-delay timer** — use `useRef<number | null>(null)` for `hoverTimer`, `useState<number | null>` for `subIndex`. On `onMouseEnter` of a row with `children`, clear prior timer then `setTimeout(() => setSubIndex(i), 150)`. On `onMouseLeave` of parent row, start 150ms close timer cancelled if mouse enters submenu.

---

### `src/components/file-tree.tsx` (Preact component, event-driven + request-response) — MODIFY

**Analog for drag:** `src/components/unified-tab-bar.tsx:573-753`. **Analog for keyboard ops:** self at lines 429-510. **Analog for list rendering:** self at lines 587-681.

**Mouse-drag pattern** (copy from `unified-tab-bar.tsx:573-644`):
```tsx
const DRAG_THRESHOLD = 5; // px before drag starts
interface ReorderState {
  sourceId: string | null; sourceEl: HTMLElement | null;
  ghostEl: HTMLElement | null; startX: number; dragging: boolean;
}
const reorder: ReorderState = { sourceId: null, sourceEl: null, ghostEl: null, startX: 0, dragging: false };

function onRowMouseDown(e: MouseEvent, entryPath: string): void {
  if (e.button !== 0) return;
  const target = e.currentTarget as HTMLElement;
  e.preventDefault(); // prevent text selection
  reorder.sourceId = entryPath;
  reorder.sourceEl = target;
  reorder.startX = e.clientX;
  reorder.dragging = false;
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
}
```

**Ghost element creation** (`unified-tab-bar.tsx:629-643`) — copy verbatim, adjust selector for rows:
```tsx
reorder.sourceEl.style.opacity = '0.4';
const ghost = reorder.sourceEl.cloneNode(true) as HTMLElement;
ghost.style.position = 'fixed';
ghost.style.top = `${reorder.sourceEl.getBoundingClientRect().top}px`;
ghost.style.left = `${e.clientX - 40}px`;
ghost.style.opacity = '0.8';
ghost.style.pointerEvents = 'none';
ghost.style.zIndex = '9999';
ghost.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
ghost.style.borderRadius = '6px';
document.body.appendChild(ghost);
reorder.ghostEl = ghost;
```

**Drop-indicator pattern** (`unified-tab-bar.tsx:654-673`) — adapt to vertical row border-left (not border-left/right):
```tsx
// Find row under cursor via data-file-tree-index attribute
const rowEls = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
rowEls.forEach(el => { el.style.borderLeft = ''; el.style.backgroundColor = ''; });
for (const el of rowEls) {
  const rect = el.getBoundingClientRect();
  if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
    if (el.dataset.fileTreeIndex !== sourceIndex) {
      el.style.borderLeft = `2px solid ${colors.accent}`;
      el.style.backgroundColor = `${colors.accent}20`; // accent at ~12% opacity
    }
    break;
  }
}
```

**Cleanup pattern** (`unified-tab-bar.tsx:736-753`) — copy:
```tsx
function cleanupReorder(): void {
  if (reorder.sourceEl) reorder.sourceEl.style.opacity = '';
  if (reorder.ghostEl) reorder.ghostEl.remove();
  document.querySelectorAll<HTMLElement>('[data-file-tree-index]').forEach(el => {
    el.style.borderLeft = ''; el.style.backgroundColor = '';
  });
  reorder.sourceId = null; reorder.sourceEl = null; reorder.ghostEl = null;
  reorder.startX = 0; reorder.dragging = false;
}
```

**Keyboard handler extension** (self, lines 429-510) — add Delete case:
```tsx
// In handleFlatKeydown / handleTreeKeydown, after existing cases:
case 'Delete':
case 'Backspace': {
  // Only Cmd+Backspace counts on macOS; plain Backspace already used for parent nav in flat mode
  if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) {
    e.preventDefault();
    const entry = viewMode.value === 'flat'
      ? entries.value[selectedIndex.value]
      : flattenedTree.value[selectedIndex.value]?.entry;
    if (entry) triggerDeleteConfirm(entry);
  }
  break;
}
```

**CustomEvent dispatch pattern** (self, line 45):
```tsx
document.dispatchEvent(new CustomEvent('file-opened', { detail: { path, name } }));
```
Reuse for Finder-drop dispatch from `main.tsx` → file-tree: `new CustomEvent('tree-finder-drop', { detail: { paths, position } })`.

**Tree refresh listener** — attach in `useEffect` (self, lines 387-424). Follow existing `project-changed` pattern:
```tsx
// Add inside existing useEffect:
async function handleFsChanged() {
  const project = getActiveProject();
  if (!project?.path) return;
  if (viewMode.value === 'tree') await initTree();
  else await loadDir(currentPath.value);
}
// git-status-changed comes in as Tauri event, not DOM CustomEvent — use listen()
const unlistenFs = await listen('git-status-changed', handleFsChanged);
return () => { unlistenFs(); /* ... existing cleanups */ };
```

**Header button row** (self, lines 538-572) — extend the existing flex row:
```tsx
{/* After the mode toggles, before path suffix: */}
<span onClick={openCreateDropdown} title="New file or folder"
  style={{ cursor: 'pointer', width: 28, height: 28, borderRadius: 4,
           display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = colors.bgElevated; }}
  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
  <Plus size={14} color={colors.textMuted} />
</span>
```
Use `lucide-preact` icons for new header buttons (`Plus`, `ExternalLink`) — existing pattern in `sidebar.tsx:11` and `unified-tab-bar.tsx:11`.

**Inline create row pattern** — see RESEARCH.md §5 for full sketch. Use signal-backed `name` + `error`, `useRef<HTMLInputElement>` + `useEffect(() => inputRef.current?.focus(), [])`.

---

### `src/services/file-service.ts` (IPC service wrapper, request-response) — MODIFY

**Analog:** self (all existing functions lines 44-75).

**Existing pattern for CRUD wrapper** (lines 69-75):
```ts
export async function createFile(path: string): Promise<void> {
  try {
    await invoke('create_file', { path });
  } catch (e) {
    throw new FileError('CreateError', String(e));
  }
}
```

**New additions — follow same shape exactly:**
```ts
export async function createFolder(path: string): Promise<void> {
  try {
    await invoke('create_folder', { path });
    await emit('git-status-changed');  // same as writeFile (line 34)
  } catch (e) {
    throw new FileError('CreateFolderError', String(e));
  }
}

export async function copyPath(from: string, to: string): Promise<void> {
  try {
    await invoke('copy_path', { from, to });
    await emit('git-status-changed');
  } catch (e) {
    throw new FileError('CopyError', String(e));
  }
}
```

**Emit-after-write pattern** (line 34) — add `await emit('git-status-changed')` to `deleteFile`, `renameFile`, `createFile` (currently missing). CONTEXT.md `code_context` explicitly calls for this. The Rust side will emit too, but mirroring on the JS side keeps semantics close to write operations.

**Reference for `emit` import** (self, line 7): `import { emit } from '@tauri-apps/api/event';`

---

### `src/main.tsx` (Bootstrap/wiring, event-driven) — MODIFY

**Analog:** self — existing `listen()` patterns (lines 136, 151, 156) and `getCurrentWindow().onCloseRequested()` (lines 120-133).

**Existing Tauri window-event pattern** (lines 120-133):
```ts
getCurrentWindow().onCloseRequested(async (event) => {
  event.preventDefault();
  showConfirmModal({ /* ... */ });
});
```

**New: drag-drop listener** — use `getCurrentWebviewWindow()` from `@tauri-apps/api/webviewWindow` (per RESEARCH.md §1, NOT `getCurrentWindow`). Add in `bootstrap()` after Step 6 keyboard handler:
```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

// Inside bootstrap(), after keyboard handler wiring:
getCurrentWebviewWindow().onDragDropEvent((event) => {
  if (event.payload.type === 'enter' || event.payload.type === 'over') {
    document.dispatchEvent(new CustomEvent('tree-finder-dragover', {
      detail: { paths: 'paths' in event.payload ? event.payload.paths : [], position: event.payload.position }
    }));
  } else if (event.payload.type === 'drop') {
    document.dispatchEvent(new CustomEvent('tree-finder-drop', {
      detail: { paths: event.payload.paths, position: event.payload.position }
    }));
  } else if (event.payload.type === 'leave') {
    document.dispatchEvent(new CustomEvent('tree-finder-dragleave'));
  }
});
```

**Path filter rule (D-18):** check if **every** path in `event.payload.paths` starts with `activeProject?.path` — if so, ignore (intra-tree drag owns this). Otherwise dispatch to tree.

**DPI-ratio correction** (RESEARCH.md §1 — `position` is physical px): divide by `window.devicePixelRatio` before hit-testing: `const clientY = event.payload.position.y / window.devicePixelRatio`.

---

### `src-tauri/src/file_ops.rs` (Rust Tauri command, FS I/O) — MODIFY

**Analog:** self — `create_file_impl` (lines 336-347), `delete_file_impl` (lines 293-303), `rename_file_impl` (lines 317-322).

**Existing command pattern with `is_safe_path` guard + `spawn_blocking`** (lines 336-358):
```rust
pub fn create_file_impl(path: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || create_file_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}
```

**New `create_folder_impl` — mirror exactly:**
```rust
pub fn create_folder_impl(path: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    if Path::new(path).exists() {
        return Err(format!("Path already exists: {}", path));
    }
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || create_folder_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}
```

**New `copy_path_impl`** — see RESEARCH.md §2 for full sketch. Key structural match: same `is_safe_path` guard, same `spawn_blocking`, same `Result<(), String>` error signature. For recursive dir copy use std only (no new crate).

**New `count_children` command** — see RESEARCH.md §7 for full sketch. Same shape + returns `ChildCount` struct with `#[derive(serde::Serialize)]` — follow existing `FileEntry` struct pattern (lines 13-19):
```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChildCount { pub files: u32, pub folders: u32, pub total: u32, pub capped: bool }
```

**Emit `git-status-changed` after mutation** — existing commands don't emit from Rust (JS emits from `file-service.ts`). Per CONTEXT.md `code_context` this phase should have Rust emit too. Pattern for emitting from a command (requires `AppHandle` param):
```rust
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn create_folder(path: String, app: AppHandle) -> Result<(), String> {
    // ... validation + spawn_blocking as above ...
    let _ = app.emit("git-status-changed", ());
    Ok(())
}
```
`Emitter` trait already imported in `lib.rs:13` — add to `file_ops.rs` imports.

**External editor launch** (NEW command — RESEARCH.md §3):
```rust
#[tauri::command]
pub async fn launch_external_editor(app: String, path: String) -> Result<(), String> {
    if !is_safe_path(&path) { return Err("Invalid path".into()); }
    std::process::Command::new("open")
        .args(["-a", &app, &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
```
Simpler commands `open_default` and `reveal_in_finder` follow identical shape with `"open"` and `"open -R"` args.

**Editor detection command** (RESEARCH.md §4) — run `which <cli>` via `Command::new("which")`, return `bool`.

---

### `src-tauri/src/file_ops.rs` inline tests (`#[cfg(test)] mod tests`) — MODIFY

**Analog:** self lines 392-622 — existing `#[cfg(test)] mod tests { use super::*; use tempfile::TempDir; ... }`.

**Existing test shape for `create_file_impl`** (lines 593-603):
```rust
#[test]
fn create_file_creates_empty_file() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("new.txt");
    let path = file.to_str().unwrap();

    assert!(!file.exists());
    create_file_impl(path).unwrap();
    assert!(file.exists());
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "");
}
```

**New tests — copy this shape for each new impl:**
- `create_folder_creates_directory` — mirror `create_file_creates_empty_file` with `is_dir()` check.
- `create_folder_rejects_existing` — create dir first, expect error.
- `create_folder_rejects_traversal` — mirror `create_file_rejects_traversal` (lines 616-622).
- `copy_path_copies_file` — write source, call `copy_path_impl(from, to)`, assert both exist + content equal.
- `copy_path_copies_directory_recursively` — nested subdirs + files, assert destination tree matches.
- `copy_path_rejects_existing_target` — target exists → Err, filesystem untouched.
- `copy_path_rejects_traversal` — mirror existing rejection tests.
- `count_children_counts_files_and_dirs` — build known tree, assert counts.
- `count_children_caps_at_10k` — skip if slow; mock via cap=10 param for speed.

---

### `src-tauri/src/lib.rs` (Command registry, config) — MODIFY

**Analog:** self — existing `invoke_handler!` block (lines 110-182).

**Existing registration pattern** (lines 156-161):
```rust
// Phase 15: File CRUD (D-12)
file_ops::write_file_content,
file_ops::delete_file,
file_ops::rename_file,
file_ops::create_file,
```

**Add new Phase 18 block below, same shape:**
```rust
// Phase 18: File tree enhancements (D-17, D-25, D-02, D-06)
file_ops::create_folder,
file_ops::copy_path,
file_ops::count_children,
file_ops::launch_external_editor,
file_ops::open_default,
file_ops::reveal_in_finder,
file_ops::detect_editor,   // or similar — single batch probe preferred
```

---

### `src/components/file-tree.test.tsx` (Vitest component test, mock IPC) — MODIFY

**Analog:** self (already exists — lines 1-81).

**Existing mock pattern** (lines 21-27):
```tsx
mockIPC((cmd, _args) => {
  if (cmd === 'list_directory') return MOCK_ENTRIES;
  return null;
});
vi.stubGlobal('listen', vi.fn().mockResolvedValue(vi.fn()));
```

**Add cases for new behaviour**: mock `delete_file`, `create_folder`, `copy_path`, `count_children`, `launch_external_editor` returns; fire `keyDown` with `{ key: 'Delete' }` on the tree scroll container and assert `showConfirmModal` was called (mock the module); fire `contextmenu` event and assert menu renders.

**Existing keyboard-event test shape** (lines 64-74):
```tsx
it('responds to ArrowDown keyboard navigation without throwing', async () => {
  render(<FileTree />);
  await new Promise(r => setTimeout(r, 20));
  const fileList = document.querySelector('[tabindex="0"]') as HTMLElement;
  if (fileList) {
    fireEvent.keyDown(fileList, { key: 'ArrowDown' });
    expect(true).toBe(true);
  }
});
```

---

### `src/services/file-service.test.ts` (Vitest service test) — MODIFY

**Analog:** self — existing tests for `createFile` (lines 79-100).

**Existing shape** (lines 79-100):
```ts
describe('createFile', () => {
  it('calls invoke with path', async () => {
    let captured: Record<string, unknown> | undefined;
    mockIPC((cmd, args) => {
      if (cmd === 'create_file') { captured = args as Record<string, unknown>; return; }
    });
    await createFile('/path/new.txt');
    expect(captured).toEqual({ path: '/path/new.txt' });
  });

  it('throws FileError on failure', async () => {
    mockIPC(() => { throw new Error('create failed'); });
    await expect(createFile('/path')).rejects.toThrow(FileError);
    await expect(createFile('/path')).rejects.toThrow('CreateError');
  });
});
```

**Add `describe('createFolder', ...)` and `describe('copyPath', ...)` blocks — copy this shape exactly.**

---

### `src-tauri/tauri.conf.json` (Config JSON) — MODIFY

**Analog:** self (lines 14-22 — existing single-window config).

**Current state** (lines 14-22):
```json
"windows": [
  {
    "title": "Efxmux",
    "width": 1400,
    "height": 900,
    "resizable": true,
    "decorations": true,
    "titleBarStyle": "Overlay"
  }
]
```

**Add one field (per D-19):**
```json
"windows": [
  {
    "title": "Efxmux",
    "width": 1400,
    "height": 900,
    "resizable": true,
    "decorations": true,
    "titleBarStyle": "Overlay",
    "dragDropEnabled": true
  }
]
```

---

## Shared Patterns

### Design Tokens
**Source:** `src/tokens.ts` (via `import { colors, fonts, radii, spacing } from '../tokens'`).
**Apply to:** every new component/inline style. No new tokens introduced.
Key values used: `colors.accent` (#258AD1), `colors.diffRed` (#F85149), `colors.bgElevated`, `colors.bgBorder`, `colors.textPrimary/Muted/Dim`, `radii.lg` (6px), `radii.sm` (3px), `spacing.sm/lg/xl/4xl`.

### Toast feedback on error
**Source:** `src/components/toast.tsx:23-30` — `showToast({ type: 'error', message, hint? })`.
**Apply to:** every failure path — delete failure, create conflict, copy conflict, editor launch failure, Finder drop outside tree. Existing pattern:
```ts
showToast({ type: 'error', message: `Could not delete ${name}`, hint: 'Check file permissions and try again.' });
```

### Confirm modal for destructive actions
**Source:** `src/components/confirm-modal.tsx:45-47` (`showConfirmModal`), lines 170-188 (red destructive button — label passed via `confirmLabel`).
**Apply to:** ONLY the delete action in this phase. Use:
```ts
showConfirmModal({
  title: `Delete ${name}?`,
  message: `'${name}' will be permanently deleted. This cannot be undone.`,
  confirmLabel: 'Delete',
  onConfirm: async () => { await deleteFile(path); },
  onCancel: () => {},
});
```
Omit `onSave` to render the two-button variant (Cancel + red Delete).

### `is_safe_path` guard (Rust)
**Source:** `src-tauri/src/file_ops.rs:22-25`. Already applied to every existing command.
**Apply to:** `create_folder`, `copy_path` (both from and to), `count_children`, `launch_external_editor`, `open_default`, `reveal_in_finder`.

### `spawn_blocking` wrapper for sync FS ops
**Source:** `src-tauri/src/file_ops.rs:160, 201, 287, 311, 330, 355` — every command wraps its `*_impl` in `spawn_blocking(move || ...)` then `.await.map_err(...)?`.
**Apply to:** all new Rust commands that hit the filesystem. Keeps Tokio runtime non-blocking.

### `git-status-changed` event for tree/sidebar refresh
**Source:** `src/services/file-service.ts:34` — `await emit('git-status-changed')` after successful write.
**Apply to:** every new/modified mutation wrapper in `file-service.ts` AND every new mutation command in `file_ops.rs` (Rust side via `AppHandle.emit()`). Tree listens via `listen('git-status-changed', ...)` — add this listener in `FileTree` useEffect.

### CustomEvent for cross-component frontend signalling
**Source:** `src/components/file-tree.tsx:45, 60, 314, 362` — `document.dispatchEvent(new CustomEvent('file-opened', { detail: { path, name } }))`.
**Apply to:** Finder drop routing from `main.tsx` to `file-tree.tsx` via `tree-finder-drop` / `tree-finder-dragover` / `tree-finder-dragleave` events. Tree subscribes in its `useEffect`.

### Lucide icon import
**Source:** `src/components/sidebar.tsx:11`, `src/components/unified-tab-bar.tsx:11`, `src/components/toast.tsx:8` — `import { Plus, ExternalLink, Trash2, FilePlus, FolderPlus, ... } from 'lucide-preact';`
**Apply to:** new header buttons and context menu items. Keep existing inline-SVG icons in `file-tree.tsx` for folder/file/chevron (body) — only add Lucide icons for the new chrome (header buttons + menu items).

---

## No Analog Found

None. Every new file or addition has a direct in-repo analog. This phase is a pure extension of Phases 10, 15, and 17 patterns.

---

## Metadata

**Analog search scope:**
- `src/components/` (context-menu, file-tree, unified-tab-bar, confirm-modal, toast, sidebar)
- `src/services/` (file-service)
- `src/main.tsx` (Tauri listen/event wiring)
- `src-tauri/src/file_ops.rs` (full read — every existing command)
- `src-tauri/src/lib.rs` (invoke_handler registration)
- `src-tauri/tauri.conf.json` (window config)
- test files: `context-menu.test.tsx`, `file-tree.test.tsx`, `file-service.test.ts`

**Files scanned:** 10 primary + several supporting (tokens.ts, utils).
**Pattern extraction date:** 2026-04-16

---

## PATTERN MAPPING COMPLETE

**Phase:** 18 - file-tree-enhancements
**Files classified:** 10
**Analogs found:** 10 / 10

### Coverage
- Files with exact analog: 10
- Files with role-match analog: 0
- Files with no analog: 0

### Key Patterns Identified
- Mouse-event drag (ghost + threshold + document listeners) already proven in `unified-tab-bar.tsx:573-753`; copy verbatim for tree drag to avoid WKWebView HTML5-drag breakage.
- Rust commands use `is_safe_path()` guard + `spawn_blocking(move || *_impl)` + `Result<(), String>` shape — every new command (`create_folder`, `copy_path`, `count_children`, `launch_external_editor`) follows this exact template.
- `file-service.ts` wrappers use `try { invoke(...); await emit('git-status-changed'); } catch (e) { throw new FileError('Code', String(e)); }` — new wrappers mirror this.
- Context menu extension is additive: add `children?: ContextMenuItem[]` field, mirror existing auto-flip logic for submenu positioning, keep the existing click-outside/escape handlers.
- Tauri Finder drop uses `getCurrentWebviewWindow().onDragDropEvent` (NOT `getCurrentWindow`); payload positions are in physical px (divide by `devicePixelRatio`).
- Rust tests live inline at `#[cfg(test)] mod tests` inside `file_ops.rs` — no separate `tests/` directory.
- Tree-refresh is event-driven via `git-status-changed` (already plumbed for git sidebar) — no new event name needed.

### File Created
`/Users/lmarques/Dev/efx-mux/.planning/phases/18-file-tree-enhancements/18-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files with concrete line numbers and excerpts.
