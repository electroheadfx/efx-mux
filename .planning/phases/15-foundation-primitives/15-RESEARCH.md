# Phase 15: Foundation Primitives - Research

**Researched:** 2026-04-14
**Domain:** UI Components (Context Menu, Dropdown) + Rust Git/File Commands + TypeScript Service Layer
**Confidence:** HIGH

## Summary

Phase 15 builds infrastructure primitives that downstream phases (16-21) consume. The phase has four distinct areas: (1) Context Menu component for right-click actions, (2) Dropdown Menu component for click-triggered menus with keyboard navigation, (3) Rust git commands for stage/unstage/commit/push operations, and (4) TypeScript service wrappers for file and git IPC.

The codebase already establishes patterns for all of these: Preact + signals components in `sidebar.tsx`, Rust `spawn_blocking` + git2 operations in `git_status.rs`, and `invoke()` IPC in `state-manager.ts`. The phase extends these patterns without introducing new dependencies.

**Primary recommendation:** Follow established patterns exactly. Use inline styles via `tokens.ts`, signals for local state, `spawn_blocking` for Rust sync operations, and throw-based error handling in TS services.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat array item structure with separator support: `{label, action, icon?, disabled?, separator?}`
- **D-02:** Auto-flip positioning -- flip to opposite side when menu would overflow viewport
- **D-03:** Close triggers: click outside, Escape key, item selection (NOT scroll parent)
- **D-04:** Uncontrolled state -- component manages open/close internally via signal
- **D-05:** Full keyboard navigation: arrow keys, Enter/Space select, type-ahead search, Home/End
- **D-06:** Render prop trigger pattern: `<Dropdown trigger={(props) => <button {...props}>Menu</button>}>`
- **D-07:** Operations: `stage_file(path)`, `unstage_file(path)`, `commit(message)`, `push(remote?, branch?)`
- **D-08:** Typed error enum: `Result<T, GitError>` with variants (NotARepo, FileNotFound, PushRejected, etc.)
- **D-09:** Push auth: discover from repo config -- use SSH if `ssh://`, HTTPS if `https://`
- **D-10:** Separate service files: `git-service.ts` + `file-service.ts`
- **D-11:** Error handling: throw typed errors (`throw new GitError('PushRejected', details)`) -- callers use try/catch
- **D-12:** File service operations: `writeFile(path, content)`, `deleteFile(path)`, `renameFile(from, to)`, `createFile(path)`

### Claude's Discretion
- Exact icon choices for menu items (use Lucide)
- Internal signal naming within components
- Rust module organization (extend existing files vs new `git_ops.rs`)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Context Menu component | Frontend (TS/Preact) | -- | Pure UI, no backend communication |
| Dropdown Menu component | Frontend (TS/Preact) | -- | Pure UI, no backend communication |
| Git stage/unstage/commit | Backend (Rust) | Frontend (IPC) | git2 runs in Rust; TS wraps invoke |
| Git push | Backend (Rust) | Frontend (IPC) | git2 + credentials in Rust; TS wraps invoke |
| File CRUD (write/delete/rename) | Backend (Rust) | Frontend (IPC) | File I/O must be in Rust for security |
| Service layer (git-service.ts, file-service.ts) | Frontend (TS) | -- | Thin IPC wrappers, no business logic |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 | 0.20.4 | Git operations (stage, commit, push) | Already used in `git_status.rs` [VERIFIED: Cargo.toml] |
| @preact/signals | 2.9.0 | Component local state | Already used project-wide [VERIFIED: package.json] |
| lucide-preact | 1.8.0 | Menu item icons | Already used in sidebar.tsx [VERIFIED: package.json] |
| @tauri-apps/api/core | 2.10.1 | IPC invoke | Already used project-wide [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokens.ts | -- | Inline style tokens | All component styling [VERIFIED: existing pattern] |
| serde/serde_json | 1.x | Rust serialization | Command return types [VERIFIED: Cargo.toml] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom context menu | Native OS context menu via Tauri | Native menus lack custom styling; web menus match app aesthetic |
| git2 push | Shell out to `git push` | Shell-out bypasses git2 credential handling; git2 is consistent |
| Inline styles | CSS modules | Project already uses inline + tokens.ts; changing would be inconsistent |

**Installation:**
No new dependencies required. All libraries already installed.

## Architecture Patterns

### System Architecture Diagram

```
User Interaction
      |
      v
+------------------+    +------------------+
| Context Menu     |    | Dropdown Menu    |
| (right-click)    |    | (click trigger)  |
+------------------+    +------------------+
      |                       |
      v                       v
+------------------------------------------+
|             Component Layer              |
|  file-tree.tsx | tab-bar.tsx | sidebar   |
+------------------------------------------+
      |                       |
      v                       v
+------------------+    +------------------+
| git-service.ts   |    | file-service.ts  |
| (IPC wrappers)   |    | (IPC wrappers)   |
+------------------+    +------------------+
      |                       |
      +----------+------------+
                 |
                 v invoke()
+------------------------------------------+
|              Tauri IPC                   |
+------------------------------------------+
                 |
                 v
+------------------------------------------+
|              Rust Backend                |
| git_ops.rs: stage/unstage/commit/push    |
| file_ops.rs: write/delete/rename/create  |
+------------------------------------------+
                 |
                 v
+------------------+    +------------------+
| git2 (libgit2)   |    | std::fs          |
+------------------+    +------------------+
```

### Recommended Project Structure
```
src/
  components/
    context-menu.tsx      # Context menu component
    dropdown-menu.tsx     # Dropdown menu component
  services/
    git-service.ts        # Git IPC wrappers (D-10)
    file-service.ts       # File IPC wrappers (D-10)

src-tauri/src/
  git_ops.rs              # New: git stage/unstage/commit/push
  file_ops.rs             # Extend: add write/delete/rename/create
  lib.rs                  # Register new commands
```

### Pattern 1: Context Menu Component
**What:** Floating menu positioned at cursor on right-click event
**When to use:** File tree context actions (delete, rename, open in editor)
**Example:**
```tsx
// Source: D-01, D-02, D-03 (CONTEXT.md decisions)
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { colors, radii, spacing, fonts } from '../tokens';

interface ContextMenuItem {
  label: string;
  action: () => void;
  icon?: preact.ComponentType;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Auto-flip positioning (D-02)
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const flipX = x + rect.width > window.innerWidth;
    const flipY = y + rect.height > window.innerHeight;
    if (flipX) menuRef.current.style.left = `${x - rect.width}px`;
    if (flipY) menuRef.current.style.top = `${y - rect.height}px`;
  }, [x, y]);
  
  // Close triggers (D-03)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);
  
  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: colors.bgElevated,
        border: `1px solid ${colors.bgBorder}`,
        borderRadius: radii.lg,
        padding: `${spacing.sm}px 0`,
        zIndex: 1000,
        minWidth: 160,
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: 1, backgroundColor: colors.bgBorder, margin: `${spacing.sm}px 0` }} />
        ) : (
          <div
            key={i}
            role="menuitem"
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
            style={{
              padding: `${spacing.lg}px ${spacing['4xl']}px`,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: item.disabled ? colors.textDim : colors.textPrimary,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xl,
            }}
          >
            {item.icon && <item.icon />}
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
```

### Pattern 2: Dropdown Menu Component
**What:** Click-triggered menu with full keyboard navigation (D-04, D-05, D-06)
**When to use:** Tab bar "Add tab" menu, sidebar git actions
**Example:**
```tsx
// Source: D-04, D-05, D-06 (CONTEXT.md decisions), W3C ARIA Menu Pattern
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { colors, radii, spacing, fonts } from '../tokens';

interface DropdownItem {
  label: string;
  action: () => void;
  icon?: preact.ComponentType;
  disabled?: boolean;
  separator?: boolean;
}

interface DropdownProps {
  items: DropdownItem[];
  trigger: (props: { onClick: () => void; 'aria-haspopup': true; 'aria-expanded': boolean }) => preact.VNode;
}

export function Dropdown({ items, trigger }: DropdownProps) {
  const isOpen = signal(false);  // D-04: Uncontrolled state
  const selectedIndex = signal(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadBuffer = useRef('');
  const typeaheadTimeout = useRef<number | null>(null);
  
  // D-05: Keyboard navigation
  function handleKeyDown(e: KeyboardEvent) {
    const selectableItems = items.filter(i => !i.separator && !i.disabled);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, selectableItems.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        selectedIndex.value = 0;
        break;
      case 'End':
        e.preventDefault();
        selectedIndex.value = selectableItems.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectableItems[selectedIndex.value]?.action();
        isOpen.value = false;
        break;
      case 'Escape':
        e.preventDefault();
        isOpen.value = false;
        break;
      default:
        // Type-ahead search (D-05)
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
          if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
          typeaheadBuffer.current += e.key.toLowerCase();
          const match = selectableItems.findIndex(item =>
            item.label.toLowerCase().startsWith(typeaheadBuffer.current)
          );
          if (match >= 0) selectedIndex.value = match;
          typeaheadTimeout.current = window.setTimeout(() => {
            typeaheadBuffer.current = '';
          }, 500);
        }
    }
  }
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {trigger({
        onClick: () => { isOpen.value = !isOpen.value; selectedIndex.value = 0; },
        'aria-haspopup': true,
        'aria-expanded': isOpen.value,
      })}
      {isOpen.value && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            backgroundColor: colors.bgElevated,
            border: `1px solid ${colors.bgBorder}`,
            borderRadius: radii.lg,
            padding: `${spacing.sm}px 0`,
            zIndex: 1000,
            minWidth: 160,
            outline: 'none',
          }}
        >
          {/* Menu items rendered similarly to ContextMenu */}
        </div>
      )}
    </div>
  );
}
```

### Pattern 3: Git Stage/Unstage (Rust)
**What:** Add or remove files from git index via git2
**When to use:** Git control pane checkbox interactions (Phase 16)
**Example:**
```rust
// Source: Context7 /rust-lang/git2-rs [CITED: docs.rs/git2]
use git2::Repository;
use std::path::Path;
use tauri::async_runtime::spawn_blocking;

#[derive(Debug, Clone, serde::Serialize)]
pub enum GitError {
    NotARepo,
    FileNotFound,
    IndexError(String),
    CommitError(String),
    PushRejected(String),
    AuthFailed,
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::NotARepo => write!(f, "Not a git repository"),
            GitError::FileNotFound => write!(f, "File not found"),
            GitError::IndexError(s) => write!(f, "Index error: {}", s),
            GitError::CommitError(s) => write!(f, "Commit error: {}", s),
            GitError::PushRejected(s) => write!(f, "Push rejected: {}", s),
            GitError::AuthFailed => write!(f, "Authentication failed"),
        }
    }
}

pub fn stage_file_impl(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    let mut index = repo.index().map_err(|e| GitError::IndexError(e.to_string()))?;
    
    // file_path should be relative to repo root
    let rel_path = Path::new(file_path);
    index.add_path(rel_path).map_err(|e| GitError::IndexError(e.to_string()))?;
    index.write().map_err(|e| GitError::IndexError(e.to_string()))?;
    
    Ok(())
}

pub fn unstage_file_impl(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    let head = repo.head().map_err(|e| GitError::IndexError(e.to_string()))?;
    let head_commit = head.peel_to_commit().map_err(|e| GitError::IndexError(e.to_string()))?;
    let head_tree = head_commit.tree().map_err(|e| GitError::IndexError(e.to_string()))?;
    
    // Reset this specific path to HEAD state
    repo.reset_default(Some(head_tree.as_object()), [file_path])
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    
    Ok(())
}

#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || stage_file_impl(&repo_path, &file_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || unstage_file_impl(&repo_path, &file_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

### Pattern 4: Git Commit (Rust)
**What:** Create a commit from staged changes
**When to use:** Git control pane commit button (Phase 16)
**Example:**
```rust
// Source: Context7 /rust-lang/git2-rs [CITED: docs.rs/git2]
use git2::{Repository, Signature};

pub fn commit_impl(repo_path: &str, message: &str) -> Result<String, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    
    // Get signature from config or create default
    let sig = repo.signature()
        .or_else(|_| Signature::now("Efxmux User", "user@efxmux.local"))
        .map_err(|e| GitError::CommitError(e.to_string()))?;
    
    // Prepare tree from index
    let mut index = repo.index().map_err(|e| GitError::CommitError(e.to_string()))?;
    let tree_id = index.write_tree().map_err(|e| GitError::CommitError(e.to_string()))?;
    let tree = repo.find_tree(tree_id).map_err(|e| GitError::CommitError(e.to_string()))?;
    
    // Get parent commit (HEAD)
    let parent = repo.head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| GitError::CommitError(e.to_string()))?;
    
    // Create commit
    let commit_id = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        message,
        &tree,
        &[&parent],
    ).map_err(|e| GitError::CommitError(e.to_string()))?;
    
    Ok(commit_id.to_string())
}

#[tauri::command]
pub async fn commit(repo_path: String, message: String) -> Result<String, String> {
    spawn_blocking(move || commit_impl(&repo_path, &message))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

### Pattern 5: Git Push with Auth Discovery (D-09)
**What:** Push to remote, discovering auth method from repo config
**When to use:** Git control pane push button (Phase 16)
**Example:**
```rust
// Source: Context7 /websites/rs_git2 [CITED: docs.rs/git2]
use git2::{Cred, RemoteCallbacks, Repository, PushOptions};
use std::path::Path;
use std::env;

pub fn push_impl(repo_path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    let remote_name = remote.unwrap_or("origin");
    let branch_name = branch.unwrap_or_else(|| {
        repo.head().ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .unwrap_or_else(|| "main".to_string())
    });
    
    let mut remote = repo.find_remote(remote_name)
        .map_err(|e| GitError::PushRejected(e.to_string()))?;
    
    // Discover auth method from remote URL (D-09)
    let url = remote.url().unwrap_or("");
    let mut callbacks = RemoteCallbacks::new();
    
    if url.starts_with("ssh://") || url.starts_with("git@") {
        // SSH authentication
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            let user = username_from_url.unwrap_or("git");
            let home = env::var("HOME").unwrap_or_else(|_| "/".to_string());
            Cred::ssh_key(
                user,
                None,
                Path::new(&format!("{}/.ssh/id_rsa", home)),
                None,
            )
        });
    } else if url.starts_with("https://") {
        // HTTPS: try credential helper
        callbacks.credentials(|url, username, _allowed_types| {
            let config = repo.config().ok();
            if let Some(cfg) = config {
                if let Ok(cred) = Cred::credential_helper(&cfg, url, username) {
                    return Ok(cred);
                }
            }
            Err(git2::Error::from_str("No credentials found"))
        });
    }
    
    callbacks.push_update_reference(|refname, status| {
        if let Some(msg) = status {
            Err(git2::Error::from_str(&format!("Push rejected: {} - {}", refname, msg)))
        } else {
            Ok(())
        }
    });
    
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);
    
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
    remote.push(&[&refspec], Some(&mut push_opts))
        .map_err(|e| {
            if e.message().contains("authentication") || e.message().contains("credential") {
                GitError::AuthFailed
            } else {
                GitError::PushRejected(e.to_string())
            }
        })?;
    
    Ok(())
}

#[tauri::command]
pub async fn push(repo_path: String, remote: Option<String>, branch: Option<String>) -> Result<(), String> {
    spawn_blocking(move || push_impl(&repo_path, remote.as_deref(), branch.as_deref()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

### Pattern 6: TypeScript Service Layer (D-10, D-11)
**What:** Thin IPC wrappers with typed error handling
**When to use:** All frontend-to-backend git/file operations
**Example:**
```typescript
// Source: D-10, D-11 (CONTEXT.md decisions), state-manager.ts pattern
import { invoke } from '@tauri-apps/api/core';

// git-service.ts
export class GitError extends Error {
  constructor(public code: string, public details?: string) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'GitError';
  }
}

export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('stage_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('StageError', String(e));
  }
}

export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('unstage_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('UnstageError', String(e));
  }
}

export async function commit(repoPath: string, message: string): Promise<string> {
  try {
    return await invoke<string>('commit', { repoPath, message });
  } catch (e) {
    throw new GitError('CommitError', String(e));
  }
}

export async function push(repoPath: string, remote?: string, branch?: string): Promise<void> {
  try {
    await invoke('push', { repoPath, remote, branch });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('AuthFailed')) {
      throw new GitError('AuthFailed', msg);
    } else if (msg.includes('PushRejected')) {
      throw new GitError('PushRejected', msg);
    }
    throw new GitError('PushError', msg);
  }
}
```

```typescript
// file-service.ts
export class FileError extends Error {
  constructor(public code: string, public details?: string) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'FileError';
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  try {
    await invoke('write_file_content', { path, content });
  } catch (e) {
    throw new FileError('WriteError', String(e));
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    await invoke('delete_file', { path });
  } catch (e) {
    throw new FileError('DeleteError', String(e));
  }
}

export async function renameFile(from: string, to: string): Promise<void> {
  try {
    await invoke('rename_file', { from, to });
  } catch (e) {
    throw new FileError('RenameError', String(e));
  }
}

export async function createFile(path: string): Promise<void> {
  try {
    await invoke('create_file', { path });
  } catch (e) {
    throw new FileError('CreateError', String(e));
  }
}
```

### Anti-Patterns to Avoid
- **Passing full file paths from frontend without validation:** Always validate paths in Rust using existing `is_safe_path()` pattern [VERIFIED: file_ops.rs:22-25]
- **Blocking the async runtime with git2 calls:** Always wrap git2 operations in `spawn_blocking()` [VERIFIED: git_status.rs:54]
- **Using npm packages for menus:** No external menu library needed; keep bundle small with custom components
- **Multiple signals for related state:** Group related dropdown state (isOpen, selectedIndex) in component scope

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git index operations | Custom git parsing | git2 Index API | Index format is complex; git2 handles edge cases |
| SSH/HTTPS credential discovery | Manual SSH key loading | git2 Cred::ssh_key / credential_helper | OS-specific paths, agent forwarding, helper protocols |
| Type-ahead search | Character-by-character matching | Timeout-based buffer | Standard UX pattern per W3C APG |
| Menu positioning | Fixed coordinates | Viewport bounds checking | Menus clip on screen edges without auto-flip |

**Key insight:** git2 already handles the complexity of index management and credential discovery. The `Cred::credential_helper()` function parses `~/.gitconfig` and invokes system credential managers (macOS Keychain, git-credential-osxkeychain, etc.).

## Common Pitfalls

### Pitfall 1: Forgetting to call index.write()
**What goes wrong:** Files appear staged in git2 but `git status` shows them unstaged
**Why it happens:** git2 Index operations are in-memory until explicitly written
**How to avoid:** Always call `index.write()` after `index.add_path()` or `index.remove_path()`
**Warning signs:** Git UI shows staged files but shell `git status` disagrees

### Pitfall 2: Push auth falling back silently
**What goes wrong:** Push hangs indefinitely waiting for credentials
**Why it happens:** git2 credentials callback returns error but push continues
**How to avoid:** Set explicit timeout on push operation; return clear AuthFailed error
**Warning signs:** Push takes > 10 seconds without progress callback

### Pitfall 3: Menu focus trap on Escape
**What goes wrong:** Escape closes menu but focus moves to body, not trigger
**Why it happens:** No focus restoration logic
**How to avoid:** Store trigger ref, restore focus on close [CITED: W3C APG Menu Pattern]
**Warning signs:** Keyboard user loses position after closing menu

### Pitfall 4: Dropdown items not ARIA-labeled
**What goes wrong:** Screen readers announce "group" instead of menu items
**Why it happens:** Missing role="menuitem" on items
**How to avoid:** Add role="menuitem", aria-disabled for disabled items [CITED: W3C APG Menu Pattern]
**Warning signs:** VoiceOver/NVDA testing fails

### Pitfall 5: Relative vs absolute paths for git operations
**What goes wrong:** stage_file fails with "file not found"
**Why it happens:** git2 expects paths relative to repo root; frontend passes absolute paths
**How to avoid:** Compute relative path in Rust: `file_path.strip_prefix(workdir)`
**Warning signs:** Works for root-level files, fails for nested files

## Code Examples

Verified patterns from official sources:

### ARIA Attributes for Dropdown Menu
```tsx
// Source: W3C ARIA APG Menu Button Pattern [CITED: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/]
// Trigger button
<button
  aria-haspopup="menu"
  aria-expanded={isOpen}
  aria-controls="dropdown-menu-id"
  onClick={toggleMenu}
>
  Menu
</button>

// Menu container
<div
  id="dropdown-menu-id"
  role="menu"
  aria-labelledby="trigger-button-id"
  tabIndex={-1}
>
  <div role="menuitem" tabIndex={-1}>Item 1</div>
  <div role="menuitem" tabIndex={-1} aria-disabled="true">Disabled</div>
  <div role="separator" />
  <div role="menuitem" tabIndex={-1}>Item 2</div>
</div>
```

### Keyboard Navigation Keys
```tsx
// Source: W3C ARIA APG Menu Pattern [CITED: https://www.w3.org/WAI/ARIA/apg/patterns/menu/]
// Required keys per APG:
// - ArrowDown: Move to next item (wrap optional)
// - ArrowUp: Move to previous item (wrap optional)
// - Enter: Activate focused item
// - Space: Activate focused item (for menuitemcheckbox: toggle)
// - Escape: Close menu, return focus to trigger
// - Home: Move to first item
// - End: Move to last item
// - Any printable character: Type-ahead search
```

### Git2 Repository::reset_default for Unstaging
```rust
// Source: Context7 /websites/rs_git2 [CITED: docs.rs/git2/latest/git2/struct.Repository.html#method.reset_default]
// reset_default updates index entries to match target commit tree
// Passing None as target removes entries; passing HEAD restores to HEAD state
let head = repo.head()?.peel_to_tree()?;
repo.reset_default(Some(head.as_object()), [file_path])?;
// This effectively "unstages" the file by resetting its index entry to HEAD
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Native OS context menus | Web-based custom menus | 2020+ | Full styling control, cross-platform consistency |
| git shell-out | git2 library | git2 0.13+ (2021) | Type safety, no process spawn overhead |
| Class components for menus | Functional + signals | Project convention | Simpler state management |

**Deprecated/outdated:**
- `@xterm/addon-canvas` removed in xterm.js 6.0.0 -- do not attempt to use for menu rendering
- aria-haspopup="true" -- prefer aria-haspopup="menu" for menus (more specific)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | git2 Cred::credential_helper works with macOS Keychain | Pattern 5 | Push auth may fail; would need to shell out to `git push` |
| A2 | Type-ahead 500ms timeout is UX standard | Pattern 2 | May feel too fast/slow; easy to tune |

## Open Questions

1. **SSH key path discovery**
   - What we know: Default `~/.ssh/id_rsa` works for most users
   - What's unclear: Users with custom key paths or ssh-agent-only setups
   - Recommendation: Try `Cred::ssh_key_from_agent()` first, fall back to file-based

2. **Push timeout handling**
   - What we know: git2 push can block indefinitely on auth prompts
   - What's unclear: Whether Tauri's async runtime has implicit timeouts
   - Recommendation: Wrap push in tokio::time::timeout (30 seconds)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | Git operations | Yes | 2.50.1 | -- |
| Rust/cargo | Compilation | Yes | 1.93.1 | -- |
| git2 crate | Stage/commit/push | Yes | 0.20.4 | Shell-out to git CLI |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (TS) + Cargo test (Rust) |
| Config file | vitest.config.ts, Cargo.toml [dev-dependencies] |
| Quick run command | `pnpm test` (TS) / `cargo test` (Rust) |
| Full suite command | `pnpm test && cargo test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-01 | Context menu renders on right-click | component | `pnpm test -- context-menu` | Wave 0 |
| SC-02 | Dropdown renders with keyboard nav | component | `pnpm test -- dropdown-menu` | Wave 0 |
| SC-03 | write_file_content writes file | unit | `cargo test write_file` | Wave 0 |
| SC-04 | git-service.ts wraps IPC | unit | `pnpm test -- git-service` | Wave 0 |
| SC-05 | file-service.ts wraps IPC | unit | `pnpm test -- file-service` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test && cargo test`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/context-menu.test.tsx` -- covers SC-01
- [ ] `src/components/dropdown-menu.test.tsx` -- covers SC-02
- [ ] `src-tauri/src/file_ops.rs` tests for write_file_content -- extends existing test module
- [ ] `src/services/git-service.test.ts` -- covers SC-04
- [ ] `src/services/file-service.test.ts` -- covers SC-05

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Git push uses OS credential helpers (SSH keys, macOS Keychain) |
| V3 Session Management | No | -- |
| V4 Access Control | Yes | Path validation via is_safe_path() prevents directory traversal |
| V5 Input Validation | Yes | File paths validated before fs operations |
| V6 Cryptography | No | -- (git handles transport encryption) |

### Known Threat Patterns for Tauri + git2

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via file ops | Tampering | is_safe_path() validation + canonicalize() [VERIFIED: file_ops.rs] |
| Arbitrary file read/write | Information Disclosure | Restrict to project root via projectRoot parameter |
| Git credential leakage | Information Disclosure | Never log credentials; let git2 handle securely |
| Command injection via file paths | Tampering | No shell-out; pure git2 API |

## Sources

### Primary (HIGH confidence)
- Context7 /rust-lang/git2-rs -- stage, commit, unstage, push patterns [VERIFIED]
- Context7 /websites/rs_git2 -- credential helper, SSH auth [VERIFIED]
- Context7 /preactjs/preact-www -- hooks, useRef, useEffect patterns [VERIFIED]
- W3C APG Menu Button Pattern -- ARIA attributes, keyboard requirements [CITED: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/]
- W3C APG Menu Pattern -- keyboard navigation, type-ahead [CITED: https://www.w3.org/WAI/ARIA/apg/patterns/menu/]

### Secondary (MEDIUM confidence)
- Existing codebase patterns: sidebar.tsx, file_ops.rs, git_status.rs [VERIFIED: file reads]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, verified via package.json/Cargo.toml
- Architecture: HIGH -- extends established patterns from existing code
- Pitfalls: MEDIUM -- some based on training knowledge (git2 timeout behavior)

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days -- stable domain)
