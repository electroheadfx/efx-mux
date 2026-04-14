# Stack Research: v0.3.0 Workspace Evolution

**Domain:** File editing, git control, drag/drop, and UI enhancements for Tauri 2 desktop app
**Researched:** 2026-04-14
**Confidence:** HIGH

## Current State

The project has a validated stack:
- **Tauri 2.10.x** (Rust) for desktop shell, IPC, PTY
- **Preact + @preact/signals** for UI
- **xterm.js 6.0 + WebGL** for terminal
- **git2 0.20.4** (Rust) for status/diff (read-only)
- **notify 8.2** (Rust) for file watching
- **Tailwind 4** for styling

This research focuses on **additions** needed for v0.3.0 features:
1. File editing in tabs (code editor)
2. Git control pane (stage, commit, push)
3. Drag/drop file operations
4. Custom scrollbar for terminals
5. File watcher improvements

## Recommended Stack Additions

### Code Editor (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `codemirror` | ^6.0.2 | Code editor core + basicSetup bundle | Lightweight (vs Monaco's 3MB+), modular architecture, no framework lock-in. Direct DOM integration works with Preact. Built-in language support, syntax highlighting, undo/redo. Used by VS Code web and many Tauri apps. |
| `@codemirror/lang-javascript` | ^6.2.x | JS/TS syntax highlighting | Official language pack. Includes JSX/TSX support. |
| `@codemirror/lang-html` | ^6.4.x | HTML syntax highlighting | Required for .html files in the project. |
| `@codemirror/lang-css` | ^6.3.x | CSS syntax highlighting | Required for .css files and Tailwind classes. |
| `@codemirror/lang-json` | ^6.0.x | JSON syntax highlighting | Required for config files (package.json, tsconfig, etc.). |
| `@codemirror/lang-rust` | ^6.0.x | Rust syntax highlighting | Required for src-tauri/*.rs files. |
| `@codemirror/lang-markdown` | ^6.3.x | Markdown syntax highlighting | Required for .md files (GSD docs, README). |

**Why NOT Monaco Editor:**
- Monaco is 3MB+ minified vs CodeMirror 6's ~400KB for a full setup
- Monaco requires webpack or specific bundler config; CodeMirror works with Vite out of the box
- Monaco is React-centric; CodeMirror is framework-agnostic
- Monaco's VS Code heritage brings complexity we don't need

### File System Plugin (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@tauri-apps/plugin-fs` | ^2.2.0 | File system operations (delete, copy, move) | Official Tauri 2 plugin. Provides `remove()`, `copyFile()`, `rename()` APIs. Handles permission scopes via tauri.conf.json. Already have `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-opener` so this follows the same pattern. |
| `tauri-plugin-fs` (Rust) | ^2 | Rust-side fs plugin | Companion crate. Add to Cargo.toml and register in main.rs. |

**Why NOT use existing Rust file_ops:**
- Current `file_ops.rs` handles read/list but not delete/move
- Plugin provides consistent API between frontend and backend
- Handles macOS permission dialogs automatically

### Git Operations (EXTEND EXISTING)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `git2` | 0.20.4 (existing) | Stage, commit operations | Already installed. Add stage (`Index::add_path`) and commit (`Repository::commit`) commands. No new crate needed. |
| `git2` with `ssh` feature | 0.20.4 | Push to remote | **Optional** for push support. Requires `cargo add git2 --features ssh` to enable SSH authentication. HTTPS push works without extra features. |

**Important: Push complexity**
- SSH push requires system SSH keys and agent
- HTTPS push requires credential storage (git-credential-helper)
- Recommendation: Shell out to `git push` via PTY for v0.3.0 (simpler auth handling), consider native push in future milestone

### Drag and Drop (NO NEW PACKAGES)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| HTML5 Drag and Drop API | Native | Internal tree reordering | Browser-native, zero bundle size. Already have DOM event patterns in `drag-manager.ts`. |
| Tauri DragDrop events | Built-in (2.x) | External file drops from Finder | Built into Tauri 2. Events: `tauri://drag-enter`, `tauri://drag-over`, `tauri://drag-drop`, `tauri://drag-leave`. Config: `app.window.dragDropEnabled: true`. |

**Why NOT SortableJS/dnd-kit:**
- File tree is simple linear/hierarchical list, not complex grid
- Native API is sufficient and adds 0KB
- Existing `drag-manager.ts` patterns can be extended

### Custom Scrollbar (NO NEW PACKAGES)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| xterm.js 6.0 scrollbar API | 6.0.0 (existing) | Terminal scrollbar styling | xterm.js 6.0 adopted VS Code's scrollbar infrastructure. CSS targets: `.xterm .xterm-scrollable-element > .scrollbar`, `.scrollbar > .slider`. Theme colors via `scrollbarSliderBackground`. |
| CSS custom scrollbar | Native | Non-terminal scrollbars | Use `scrollbar-width`, `scrollbar-color` (Firefox) and `::-webkit-scrollbar` (WebKit/Chrome). Tauri uses WKWebView on macOS which supports webkit prefixed scrollbar CSS. |

## Installation

```bash
# Code editor (NEW)
pnpm add codemirror @codemirror/lang-javascript @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json @codemirror/lang-rust @codemirror/lang-markdown

# File system plugin (NEW)
pnpm add @tauri-apps/plugin-fs
```

Rust additions in `Cargo.toml`:

```toml
[dependencies]
# Existing
git2 = "0.20.4"  # No change needed for stage/commit

# NEW plugin
tauri-plugin-fs = "2"

# OPTIONAL: For native git push (if not shelling out)
# git2 = { version = "0.20.4", features = ["ssh", "https"] }
```

Register plugin in `src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())  // ADD
        // ... existing plugins
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Update `tauri.conf.json` capabilities:

```json
{
  "app": {
    "windows": [{
      "dragDropEnabled": true
    }]
  },
  "plugins": {
    "fs": {
      "scope": {
        "allow": ["$HOME/**", "$RESOURCE/**"],
        "deny": ["$HOME/.ssh/**"]
      }
    }
  }
}
```

## Configuration Changes

### CodeMirror Integration Pattern

```typescript
// src/components/editor-tab.tsx
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

function createEditor(parent: HTMLElement, content: string, filename: string) {
  const lang = getLanguageExtension(filename);
  return new EditorView({
    doc: content,
    extensions: [
      basicSetup,
      lang,
      oneDark,  // Or custom theme matching Solarized Dark
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Track dirty state
        }
      }),
    ],
    parent,
  });
}

function getLanguageExtension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': return javascript({ typescript: true, jsx: true });
    case 'rs': return rust();
    case 'md': return markdown();
    case 'json': return json();
    case 'html': return html();
    case 'css': return css();
    default: return [];
  }
}
```

### Git Stage/Commit Commands

```rust
// src-tauri/src/git_status.rs (extend existing)

#[tauri::command]
pub async fn git_stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
        let mut index = repo.index().map_err(|e| e.to_string())?;
        
        // file_path is relative to repo root
        index.add_path(std::path::Path::new(&file_path)).map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    spawn_blocking(move || {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
        let mut index = repo.index().map_err(|e| e.to_string())?;
        
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    spawn_blocking(move || {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
        
        let sig = repo.signature()
            .or_else(|_| git2::Signature::now("Unknown", "unknown@example.com"))
            .map_err(|e| e.to_string())?;
        
        let mut index = repo.index().map_err(|e| e.to_string())?;
        let tree_id = index.write_tree().map_err(|e| e.to_string())?;
        let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
        
        let parent = repo.head()
            .and_then(|h| h.peel_to_commit())
            .ok();  // Initial commit has no parent
        
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        
        let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
            .map_err(|e| e.to_string())?;
        
        Ok(oid.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
```

### Drag/Drop Event Handling

```typescript
// src/components/file-tree.tsx (extend existing)
import { listen } from '@tauri-apps/api/event';

// External drops from Finder
listen('tauri://drag-drop', (event) => {
  const paths = event.payload as { paths: string[] };
  // Copy files to selected directory
  handleExternalFileDrop(paths.paths);
});

// Internal tree reordering (native HTML5)
function handleDragStart(e: DragEvent, entry: FileEntry) {
  e.dataTransfer?.setData('application/x-efxmux-file', JSON.stringify(entry));
  e.dataTransfer!.effectAllowed = 'move';
}

function handleDrop(e: DragEvent, targetFolder: FileEntry) {
  e.preventDefault();
  const data = e.dataTransfer?.getData('application/x-efxmux-file');
  if (data) {
    const sourceEntry = JSON.parse(data) as FileEntry;
    // Move file via Rust command
    invoke('move_file', { from: sourceEntry.path, to: `${targetFolder.path}/${sourceEntry.name}` });
  }
}
```

### Custom Scrollbar CSS

```css
/* src/styles/scrollbar.css */

/* xterm.js 6.0 scrollbar (VS Code infrastructure) */
.xterm .xterm-scrollable-element > .scrollbar {
  width: 8px !important;
  background: transparent;
}

.xterm .xterm-scrollable-element > .scrollbar > .slider {
  background: var(--color-scroll-thumb, rgba(255, 255, 255, 0.2));
  border-radius: 4px;
  min-height: 20px;
}

.xterm .xterm-scrollable-element > .scrollbar > .slider:hover {
  background: var(--color-scroll-thumb-hover, rgba(255, 255, 255, 0.35));
}

/* Non-terminal panels (file tree, editor, etc.) */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--color-scroll-thumb) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-scroll-thumb);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--color-scroll-thumb-hover);
}
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| CodeMirror 6 | Monaco Editor | Only if you need full VS Code feature parity (IntelliSense, debugging). Overkill for basic editing. |
| CodeMirror 6 | Ace Editor | Only for legacy browser support (IE11). Ace is older, less modular. |
| @tauri-apps/plugin-fs | Custom Rust commands | Only if you need operations not covered by the plugin. Plugin handles permissions better. |
| Native git2 stage/commit | Shell out to git CLI | Only for push operations (credential handling). Native is faster for stage/commit. |
| Shell git push | Native git2 push | Use shell for v0.3.0 (simpler auth). Consider native for v0.4.0+. |
| HTML5 Drag and Drop | SortableJS | Only if you need complex multi-container sorting. File tree is simple. |
| CSS scrollbar styling | Custom scrollbar library | Only if CSS doesn't provide enough control. Native CSS works in WKWebView. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Monaco Editor | 3MB+ bundle, complex setup, React-centric, overkill for basic editing | CodeMirror 6 |
| Ace Editor | Legacy architecture, less modular, larger bundle than CM6 | CodeMirror 6 |
| `@tauri-apps/plugin-shell` for git | Already have PTY infrastructure via portable-pty. Plugin adds redundant code. | Existing PTY system |
| Native git2 push | SSH/HTTPS credential handling is complex. System git handles this better. | Shell out via PTY |
| react-dnd / dnd-kit | React-specific, adds dependency. Native API sufficient for file tree. | HTML5 Drag and Drop |
| perfect-scrollbar / simplebar | JavaScript scrollbar libraries add weight. CSS-only works in WebKit. | CSS scrollbar styling |
| `codemirror` v5.x | Legacy version. v6 is a complete rewrite with better architecture. | `codemirror` v6.0.2 |

## Feature-to-Stack Mapping

| Feature | Stack Addition | Integration Point |
|---------|---------------|-------------------|
| File editing in tabs | CodeMirror 6 | New `EditorTab` component, existing tab system |
| Git staging | git2 (extend) | New `git_stage_file`, `git_stage_all` commands |
| Git commit | git2 (extend) | New `git_commit` command |
| Git push | PTY shell-out | Existing PTY infrastructure, `git push` command |
| File delete | @tauri-apps/plugin-fs | `remove()` API in file tree context menu |
| File copy/move | @tauri-apps/plugin-fs | `copyFile()`, `rename()` APIs |
| Internal drag/drop | HTML5 native | Extend file-tree.tsx with drag events |
| External drag/drop | Tauri DragDrop | `tauri://drag-drop` event listener |
| Custom scrollbar | CSS only | New scrollbar.css, xterm.js theme colors |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `codemirror@6.0.2` | `vite@8.x` | ESM-native, works out of the box |
| `codemirror@6.0.2` | `preact@10.x` | Framework-agnostic, direct DOM |
| `@tauri-apps/plugin-fs@2.2.0` | `tauri@2.10.x` | Major version 2 matches |
| `git2@0.20.4` | Existing Cargo.toml | No version change needed |
| xterm.js 6.0 scrollbar CSS | WKWebView (macOS) | WebKit supports all CSS scrollbar selectors |

## Sources

- [CodeMirror 6 npm](https://www.npmjs.com/package/codemirror) -- version 6.0.2 confirmed (HIGH confidence)
- [CodeMirror 6 docs](https://codemirror.net/docs/) -- basicSetup, language packs (Context7 verified, HIGH confidence)
- [git2-rs docs](https://docs.rs/git2/0.20.4/git2/) -- Index::add_path, Repository::commit, push (Context7 verified, HIGH confidence)
- [git2-rs GitHub](https://github.com/rust-lang/git2-rs) -- features: ssh, https (HIGH confidence)
- [Tauri 2 plugin-fs](https://v2.tauri.app/plugin/file-system/) -- remove, copyFile, rename (Context7 verified, HIGH confidence)
- [Tauri 2 drag-drop events](https://github.com/tauri-apps/tauri/discussions/9696) -- tauri://drag-drop (community verified, MEDIUM confidence)
- [xterm.js 6.0 scrollbar](https://github.com/xtermjs/xterm.js/pull/5096) -- VS Code scrollbar integration (GitHub, HIGH confidence)
- [HTML5 Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) -- native browser API (MDN, HIGH confidence)
- [CSS Scrollbar Styling](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scrollbars_styling) -- scrollbar-width, ::-webkit-scrollbar (MDN, HIGH confidence)

---
*Stack research for: Efxmux v0.3.0 Workspace Evolution*
*Researched: 2026-04-14*
