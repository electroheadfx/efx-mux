# Phase 15: Foundation Primitives - Pattern Map

**Mapped:** 2026-04-14
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/context-menu.tsx` | component | event-driven | `src/components/project-modal.tsx` | exact |
| `src/components/dropdown-menu.tsx` | component | event-driven | `src/components/project-modal.tsx` | exact |
| `src-tauri/src/git_ops.rs` | service | CRUD | `src-tauri/src/git_status.rs` | exact |
| `src/services/git-service.ts` | service | request-response | `src/state-manager.ts` | exact |
| `src/services/file-service.ts` | service | request-response | `src/state-manager.ts` | exact |
| `src-tauri/src/file_ops.rs` (extend) | service | CRUD | `src-tauri/src/file_ops.rs` | self |
| `src/services/git-service.test.ts` | test | N/A | `src/state-manager.test.ts` | exact |
| `src/services/file-service.test.ts` | test | N/A | `src/state-manager.test.ts` | exact |

## Pattern Assignments

### `src/components/context-menu.tsx` (component, event-driven)

**Analog:** `src/components/project-modal.tsx`

**Imports pattern** (lines 1-12):
```typescript
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
```

**Modal/overlay pattern** (lines 188-212):
```typescript
// Fixed overlay with centered/positioned content
<div
  style={{
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
  onClick={() => { closeProjectModal(); }}
>
  <div
    style={{
      backgroundColor: colors.bgElevated,
      border: `1px solid ${colors.bgSurface}`,
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      zIndex: 101,
    }}
    onClick={(e) => { e.stopPropagation(); }}
  >
```

**Escape key handler pattern** (lines 172-184):
```typescript
useEffect(() => {
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && visible.value) {
      e.preventDefault();
      closeProjectModal();
    }
  }
  document.addEventListener('keydown', handleKeydown);
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}, []);
```

**Inline style tokens pattern** (lines 126-145):
```typescript
// Use tokens.ts values for all styling
style={{
  fontFamily: fonts.mono,
  fontSize: fontSizes.sm,
  color: colors.textDim,
  letterSpacing: '1.2px',
  display: 'block',
  marginBottom: 6,
}}
```

---

### `src/components/dropdown-menu.tsx` (component, event-driven)

**Analog:** `src/components/project-modal.tsx` + `src/components/sidebar.tsx`

**Module-level signals pattern** (project-modal.tsx lines 17-25):
```typescript
// Module-level signals for component state
const visible = signal(false);
const selectedIndex = signal(0);
```

**Click handler with stopPropagation** (sidebar.tsx lines 174-177):
```typescript
onClick={(e) => {
  e.stopPropagation();
  // action
}}
```

**Public API export pattern** (project-modal.tsx lines 36-55):
```typescript
/**
 * Open the modal. Pass `project` to enter edit mode with pre-filled fields.
 */
export function openProjectModal(opts: { firstRun?: boolean; project?: ProjectEntry } = {}) {
  visible.value = true;
  // ... setup state
}

export function closeProjectModal() {
  visible.value = false;
}
```

**Menu item styling pattern** (sidebar.tsx lines 249-307):
```typescript
// Menu item row with hover states, status badges
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px',
    cursor: 'pointer',
  }}
  class="hover:bg-bg-raised"
  onClick={() => { /* action */ }}
>
  <span style={{
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
  }}>
    {item.label}
  </span>
</div>
```

---

### `src-tauri/src/git_ops.rs` (service, CRUD)

**Analog:** `src-tauri/src/git_status.rs`

**Imports pattern** (lines 1-4):
```rust
use git2::Repository;
use tauri::async_runtime::spawn_blocking;
```

**Struct with Serialize/Deserialize** (lines 6-12):
```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub modified: usize,
    pub staged: usize,
    pub untracked: usize,
}
```

**Sync impl function pattern** (lines 14-49):
```rust
impl GitStatus {
    pub fn for_path(path: &str) -> Result<Self, String> {
        let repo = Repository::open(path).map_err(|e| e.to_string())?;
        // ... synchronous git2 operations
        Ok(GitStatus { /* ... */ })
    }
}
```

**Tauri command with spawn_blocking** (lines 52-57):
```rust
#[tauri::command]
pub async fn get_git_status(path: String) -> Result<GitStatus, String> {
    spawn_blocking(move || GitStatus::for_path(&path))
        .await
        .map_err(|e| e.to_string())?
}
```

**Test module pattern** (lines 114-212):
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn run_git(dir: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command failed");
        // ...
    }

    fn setup_git_repo() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        run_git(&dir.path(), &["init"]);
        // ...
        (dir, path)
    }

    #[test]
    fn test_name() {
        let (_dir, path) = setup_git_repo();
        // ... assertions
    }
}
```

---

### `src/services/git-service.ts` (service, request-response)

**Analog:** `src/state-manager.ts`

**Imports pattern** (lines 1-7):
```typescript
import { invoke } from '@tauri-apps/api/core';
```

**Async function with invoke** (lines 178-182):
```typescript
export async function getProjects(): Promise<ProjectEntry[]> {
  return await invoke<ProjectEntry[]>('get_projects');
}
```

**Error handling with try/catch** (lines 193-198):
```typescript
export async function addProject(entry: ProjectEntry): Promise<void> {
  await invoke('add_project', { entry });
  // Reload state from Rust to pick up the persisted mutation
  currentState = await invoke<AppState>('load_state');
  projects.value = await invoke<ProjectEntry[]>('get_projects');
}
```

**Type export pattern** (lines 13-27):
```typescript
export interface ProjectEntry {
  path: string;
  name: string;
  agent: string;
  gsd_file?: string;
  server_cmd?: string;
  server_url?: string;
}
```

---

### `src/services/file-service.ts` (service, request-response)

**Analog:** `src/state-manager.ts`

Same patterns as git-service.ts. Key invoke pattern from state-manager.ts lines 62-80:

```typescript
export async function loadAppState(): Promise<AppState> {
  try {
    currentState = await invoke<AppState>('load_state');
    // ... process response
  } catch (err) {
    console.warn('[efxmux] Failed to load state, using defaults:', err);
    // Return a minimal default state
    currentState = { /* defaults */ };
  }
  return currentState!;
}
```

---

### `src-tauri/src/file_ops.rs` (extend existing)

**Analog:** Self (existing file)

**Path validation pattern** (lines 22-25):
```rust
/// Validate that a path does not contain traversal components.
fn is_safe_path(path: &str) -> bool {
    let p = Path::new(path);
    !p.components().any(|c| c.as_os_str() == "..")
}
```

**Atomic write pattern** (lines 219-229):
```rust
// Atomic write: tmp + rename
let tmp_path = format!("{}.tmp", path);
let output = lines.join("\n");
// Preserve trailing newline if original had one
let output = if content.ends_with('\n') {
    format!("{}\n", output)
} else {
    output
};
std::fs::write(&tmp_path, &output).map_err(|e| e.to_string())?;
std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
```

**Command with ManagedAppState** (lines 237-264):
```rust
#[tauri::command]
pub async fn write_checkbox(
    path: String,
    line: u32,
    checked: bool,
    managed: tauri::State<'_, ManagedAppState>,
) -> Result<(), String> {
    // Derive project root from active project for path validation
    let project_root = {
        let guard = managed.0.lock().map_err(|e| e.to_string())?;
        guard.project.active.clone()
    };

    if let Some(ref root) = project_root {
        let full = Path::new(&path);
        if !full.starts_with(root) {
            return Err("Path is outside the active project directory".to_string());
        }
    }

    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    spawn_blocking(move || write_checkbox_impl(&path, line, checked))
        .await
        .map_err(|e| e.to_string())?
}
```

---

### `src/services/git-service.test.ts` (test)

**Analog:** `src/state-manager.test.ts`

**Vitest imports pattern** (lines 1-4):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
```

**Mock IPC pattern** (lines 29-33, 60-66):
```typescript
beforeEach(async () => {
  // Reset module-level currentState by forcing a load_state error
  mockIPC(() => { throw new Error('reset'); });
});

// In test:
mockIPC((cmd, args) => {
  if (cmd === 'load_state') return MOCK_STATE;
});
```

**Describe/it structure** (lines 36-80):
```typescript
describe('state-manager', () => {
  beforeEach(async () => {
    // Reset signals
    projects.value = [];
    activeProjectName.value = null;
    // ...
  });

  describe('loadAppState', () => {
    it('loads state successfully via invoke', async () => {
      mockIPC((cmd, args) => {
        if (cmd === 'load_state') return MOCK_STATE;
      });

      const state = await loadAppState();
      expect(state.version).toBe(1);
    });

    it('sets default state when invoke throws', async () => {
      vi.spyOn(console, 'warn').mockReturnValue();
      mockIPC((cmd, args) => {
        throw new Error('IPC error');
      });

      const state = await loadAppState();
      expect(state.theme.mode).toBe('dark');
    });
  });
});
```

---

## Shared Patterns

### Tokens Usage
**Source:** `src/tokens.ts`
**Apply to:** All component files (context-menu.tsx, dropdown-menu.tsx)
```typescript
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';

// Usage in inline styles:
style={{
  backgroundColor: colors.bgElevated,
  border: `1px solid ${colors.bgBorder}`,
  borderRadius: radii.lg,
  padding: `${spacing.sm}px 0`,
  fontFamily: fonts.sans,
  fontSize: fontSizes.base,
  color: colors.textPrimary,
}}
```

### Lucide Icons
**Source:** `src/components/sidebar.tsx` lines 10
**Apply to:** context-menu.tsx, dropdown-menu.tsx
```typescript
import { GitBranch, Plus, RotateCw, Settings, X } from 'lucide-preact';

// Usage:
<Settings size={12} />
```

### spawn_blocking for sync operations
**Source:** `src-tauri/src/git_status.rs` lines 52-57
**Apply to:** All Rust git_ops.rs commands
```rust
use tauri::async_runtime::spawn_blocking;

#[tauri::command]
pub async fn command_name(path: String) -> Result<T, String> {
    spawn_blocking(move || sync_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}
```

### Tauri Command Registration
**Source:** `src-tauri/src/lib.rs` lines 97-152
**Apply to:** New commands in git_ops.rs, file_ops.rs
```rust
// In lib.rs invoke_handler:
.invoke_handler(tauri::generate_handler![
    // Git operations
    git_ops::stage_file,
    git_ops::unstage_file,
    git_ops::commit,
    git_ops::push,
    
    // File operations (extended)
    file_ops::write_file_content,
    file_ops::delete_file,
    file_ops::rename_file,
    file_ops::create_file,
])
```

### TypeScript Error Class
**Source:** RESEARCH.md Pattern 6 (new pattern, no existing analog)
**Apply to:** git-service.ts, file-service.ts
```typescript
export class GitError extends Error {
  constructor(public code: string, public details?: string) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'GitError';
  }
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All files have close analogs in the existing codebase |

## Notes for Planner

1. **Directory creation required:** `src/services/` directory does not exist and must be created for git-service.ts and file-service.ts

2. **Module registration:** New Rust module `git_ops.rs` must be added to `lib.rs` with `pub mod git_ops;` and commands registered in `invoke_handler`

3. **File extension vs new file:** Per CONTEXT.md "Claude's Discretion", Rust git operations can either extend existing files or create new `git_ops.rs`. Pattern mapping recommends NEW file `git_ops.rs` to keep concerns separated (read operations in git_status.rs, write operations in git_ops.rs)

4. **Test file location:** Service tests should go in `src/services/` alongside the service files, following the pattern of `state-manager.test.ts` being co-located with `state-manager.ts`

## Metadata

**Analog search scope:** src/, src-tauri/src/
**Files scanned:** 25 source files
**Pattern extraction date:** 2026-04-14
