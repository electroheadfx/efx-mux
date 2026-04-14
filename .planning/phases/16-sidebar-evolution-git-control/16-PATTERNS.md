# Phase 16: Sidebar Evolution + Git Control - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/sidebar.tsx` | component | request-response | self (refactor) | exact |
| `src/components/git-control-tab.tsx` | component | request-response | `src/components/file-tree.tsx` | exact |
| `src/components/toast.tsx` | component | event-driven | `src/components/project-modal.tsx` | role-match |
| `src/services/git-service.ts` | service | request-response | self (extend) | exact |
| `src-tauri/src/git_ops.rs` | backend-command | request-response | self (extend) | exact |

## Pattern Assignments

### `src/components/sidebar.tsx` (component, request-response) -- MODIFY

**Analog:** `src/components/sidebar.tsx` (self-refactor) + `src/components/tab-bar.tsx` (tab pattern)

**Imports pattern** (lines 1-24):
```typescript
import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { GitBranch, Plus, RotateCw, Settings, X } from 'lucide-preact';
import {
  projects,
  activeProjectName,
  sidebarCollapsed,
  getGitStatus,
  switchProject,
  getProjects,
  getActiveProject,
  removeProject,
} from '../state-manager';
import type { ProjectEntry, GitData } from '../state-manager';
import { openProjectModal } from './project-modal';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
```

**Local signals pattern** (lines 28-34):
```typescript
const gitData = signal<Record<string, GitData>>({});
const gitFiles = signal<Array<{ name: string; path: string; status: string }>>([]);
const gitSectionOpen = signal(true);
const removeTarget = signal<string | null>(null);
const appVersion = signal<string>('');
```

**Tab row pattern** (from `src/components/tab-bar.tsx` lines 13-37):
```typescript
// Sidebar-specific tab pattern (text tabs, accent underline per D-02)
type SidebarTab = 'projects' | 'files' | 'git';
const activeTab = signal<SidebarTab>('projects');

function TabRow() {
  return (
    <div style={{ display: 'flex', gap: 0, padding: '0 12px', borderBottom: `1px solid ${colors.bgBorder}` }}>
      {(['projects', 'files', 'git'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => { activeTab.value = tab; }}
          style={{
            padding: '8px 12px',
            fontFamily: fonts.sans,
            fontSize: 12,
            fontWeight: activeTab.value === tab ? 500 : 400,
            color: activeTab.value === tab ? colors.textPrimary : colors.textDim,
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab.value === tab 
              ? `2px solid ${colors.accent}` 
              : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

**Event listener pattern** (lines 464-481):
```typescript
// Re-sync when project changes
function handleProjectChanged(e: Event) {
  const detail = (e as CustomEvent).detail;
  activeProjectName.value = detail.name;
  refreshAllGitStatus();
}

document.addEventListener('project-changed', handleProjectChanged);

// Listen for git-status-changed Tauri event (auto-refresh when git operations occur)
let unlistenGit: (() => void) | undefined;
listen('git-status-changed', () => {
  refreshAllGitStatus();
}).then((unlisten) => {
  unlistenGit = unlisten;
});

return () => {
  document.removeEventListener('project-changed', handleProjectChanged);
  if (unlistenGit) unlistenGit();
};
```

---

### `src/components/git-control-tab.tsx` (component, request-response) -- NEW

**Analog:** `src/components/file-tree.tsx` (list component with signals + IPC)

**Imports pattern** (lines 1-12):
```typescript
import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
```

**Git-specific imports to add:**
```typescript
import { stageFile, unstageFile, commit, push, getUnpushedCount, GitError } from '../services/git-service';
import { showToast } from './toast';
import { ChevronDown, ChevronRight, Loader } from 'lucide-preact';
```

**Signal pattern for component state** (from file-tree.tsx lines 19-34):
```typescript
// Local signals for GitControlTab state
const commitMessage = signal('');
const stagedFiles = signal<GitFile[]>([]);
const changedFiles = signal<GitFile[]>([]);
const unpushedCount = signal(0);
const stagedSectionOpen = signal(true);
const changesSectionOpen = signal(true);
const isCommitting = signal(false);
const isPushing = signal(false);
```

**Helper function pattern** (from file-tree.tsx lines 222-225):
```typescript
function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}
```

**Collapsible section pattern** (from sidebar.tsx lines 249-308 GitFileRow, adapted):
```typescript
function CollapsibleSection({ 
  title, 
  count, 
  isOpen, 
  onToggle, 
  children 
}: { 
  title: string; 
  count: number; 
  isOpen: boolean; 
  onToggle: () => void; 
  children: preact.ComponentChildren;
}) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xl,
          padding: `${spacing.md}px ${spacing.xl}px`,
          cursor: 'pointer',
        }}
      >
        {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span style={{
          fontFamily: fonts.mono,
          fontSize: fontSizes.sm,
          fontWeight: 600,
          color: colors.textDim,
        }}>
          {title} ({count})
        </span>
      </div>
      <div style={{
        maxHeight: isOpen ? '1000px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 150ms ease-out',
      }}>
        {children}
      </div>
    </div>
  );
}
```

**File row with checkbox pattern** (adapted from sidebar.tsx GitFileRow lines 249-308):
```typescript
function GitFileRow({ 
  file, 
  isStaged, 
  onToggle 
}: { 
  file: GitFile; 
  isStaged: boolean; 
  onToggle: (file: GitFile, checked: boolean) => void;
}) {
  const badgeBg = file.status === 'M' ? colors.statusYellowBg :
    file.status === 'A' ? colors.statusGreenBg :
    file.status === 'D' ? colors.diffRedBg :
    colors.statusMutedBg;
  const badgeColor = file.status === 'M' ? colors.statusYellow :
    file.status === 'A' ? colors.statusGreen :
    file.status === 'D' ? colors.diffRed :
    colors.textMuted;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
      }}
    >
      <input
        type="checkbox"
        checked={isStaged}
        onChange={(e) => onToggle(file, (e.target as HTMLInputElement).checked)}
        style={{ accentColor: colors.accent }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 3,
          backgroundColor: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 600,
            color: badgeColor,
          }}
        >
          {file.status}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {file.name}
      </span>
    </div>
  );
}
```

**Button pattern** (from project-modal.tsx lines 479-495):
```typescript
<button
  disabled={!isValid.value || isCommitting.value}
  onClick={handleCommit}
  style={{
    borderRadius: 8,
    backgroundColor: isValid.value && !isCommitting.value 
      ? colors.accent 
      : `${colors.accent}40`,
    border: 'none',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: 'white',
    cursor: isValid.value && !isCommitting.value ? 'pointer' : 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }}
>
  {isCommitting.value && <Loader size={14} className="animate-spin" />}
  Commit ({stagedFiles.value.length} files)
</button>
```

---

### `src/components/toast.tsx` (component, event-driven) -- NEW

**Analog:** `src/components/project-modal.tsx` (modal pattern with signals)

**Imports pattern:**
```typescript
import { signal } from '@preact/signals';
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';
import { CheckCircle, XCircle, X } from 'lucide-preact';
```

**Signal-based state pattern** (from project-modal.tsx lines 17-26):
```typescript
interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
  hint?: string;
}

const toasts = signal<Toast[]>([]);

export function showToast(toast: Omit<Toast, 'id'>) {
  const id = Date.now().toString();
  toasts.value = [...toasts.value, { ...toast, id }];
  
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}

export function dismissToast(id: string) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}
```

**Fixed position overlay pattern** (from project-modal.tsx lines 187-198, adapted):
```typescript
export function ToastContainer() {
  if (toasts.value.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.value.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
```

**Card styling pattern** (from project-modal.tsx lines 202-211):
```typescript
function ToastItem({ toast }: { toast: Toast }) {
  const isError = toast.type === 'error';
  return (
    <div
      style={{
        backgroundColor: colors.bgElevated,
        border: `1px solid ${isError ? colors.diffRed : colors.statusGreen}`,
        borderRadius: radii.lg,
        padding: `${spacing['3xl']}px ${spacing['4xl']}px`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.xl,
        minWidth: 280,
        maxWidth: 400,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {isError ? (
        <XCircle size={16} style={{ color: colors.diffRed, flexShrink: 0 }} />
      ) : (
        <CheckCircle size={16} style={{ color: colors.statusGreen, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textPrimary }}>
          {toast.message}
        </div>
        {toast.hint && (
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
            {toast.hint}
          </div>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: colors.textDim,
          padding: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

---

### `src/services/git-service.ts` (service, request-response) -- EXTEND

**Analog:** `src/services/git-service.ts` (self-extend)

**Existing imports pattern** (lines 1-6):
```typescript
import { invoke } from '@tauri-apps/api/core';
```

**Error class pattern** (lines 12-20):
```typescript
export class GitError extends Error {
  constructor(
    public code: string,
    public details?: string
  ) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'GitError';
  }
}
```

**IPC wrapper pattern** (lines 27-33, 54-59):
```typescript
export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('stage_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('StageError', String(e));
  }
}

// New function to add:
export async function getUnpushedCount(repoPath: string): Promise<number> {
  try {
    return await invoke<number>('get_unpushed_count', { repoPath });
  } catch (e) {
    console.warn('[git-service] getUnpushedCount failed:', e);
    return 0; // Fail safe: hide push button rather than crash
  }
}
```

---

### `src-tauri/src/git_ops.rs` (backend-command, request-response) -- EXTEND

**Analog:** `src-tauri/src/git_ops.rs` (self-extend)

**Imports pattern** (lines 1-9):
```rust
use git2::{Cred, PushOptions, RemoteCallbacks, Repository, Signature};
use std::env;
use std::path::Path;
use tauri::async_runtime::spawn_blocking;
```

**GitError enum pattern** (lines 12-20):
```rust
#[derive(Debug, Clone, serde::Serialize)]
pub enum GitError {
    NotARepo,
    FileNotFound,
    IndexError(String),
    CommitError(String),
    PushRejected(String),
    AuthFailed,
}
```

**Synchronous impl function pattern** (lines 39-70):
```rust
/// Synchronous inner implementation for testing.
pub fn get_unpushed_count_impl(repo_path: &str) -> Result<usize, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    
    let head = repo.head().map_err(|e| GitError::IndexError(e.to_string()))?;
    let local_oid = head.target().ok_or_else(|| GitError::IndexError("No HEAD target".to_string()))?;
    
    // Get current branch name
    let branch_name = head.shorthand().unwrap_or("main");
    let branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    
    let upstream = match branch.upstream() {
        Ok(upstream) => upstream,
        Err(_) => return Ok(0), // No upstream configured
    };
    
    let upstream_oid = upstream
        .get()
        .target()
        .ok_or_else(|| GitError::IndexError("No upstream target".to_string()))?;
    
    let (ahead, _behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    
    Ok(ahead)
}
```

**Tauri command wrapper pattern** (lines 261-267):
```rust
#[tauri::command]
pub async fn get_unpushed_count(repo_path: String) -> Result<usize, String> {
    spawn_blocking(move || get_unpushed_count_impl(&repo_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

**Command registration pattern** (lib.rs lines 98-162):
```rust
// In tauri::generate_handler! array, add:
git_ops::get_unpushed_count,
```

---

## Shared Patterns

### Token Usage
**Source:** `src/tokens.ts`
**Apply to:** All component files

```typescript
import { colors, fonts, fontSizes, spacing, radii } from '../tokens';

// Background colors
backgroundColor: colors.bgBase      // primary background
backgroundColor: colors.bgElevated  // raised surfaces
backgroundColor: colors.bgDeep      // sunken areas

// Text colors
color: colors.textPrimary  // main text
color: colors.textMuted    // secondary text
color: colors.textDim      // tertiary text
color: colors.accent       // interactive elements

// Status colors
color: colors.statusGreen     // success
backgroundColor: colors.statusGreenBg
color: colors.statusYellow    // warning/modified
backgroundColor: colors.statusYellowBg
color: colors.diffRed         // error/deleted
backgroundColor: colors.diffRedBg
```

### Signal Pattern for Component State
**Source:** `src/components/sidebar.tsx` lines 28-34
**Apply to:** `git-control-tab.tsx`, `toast.tsx`

```typescript
// Module-level signals for component-local state
const someState = signal<SomeType>(initialValue);

// Computed signals for derived state
const derivedState = computed(() => someState.value.filter(x => x.active));
```

### Event-Driven Refresh Pattern
**Source:** `src/components/sidebar.tsx` lines 464-481
**Apply to:** `git-control-tab.tsx`

```typescript
// In useEffect:
document.addEventListener('git-status-changed', refreshHandler);

let unlisten: (() => void) | undefined;
listen('git-status-changed', () => {
  refreshGitFiles();
}).then((fn) => { unlisten = fn; });

return () => {
  document.removeEventListener('git-status-changed', refreshHandler);
  if (unlisten) unlisten();
};
```

### Tauri Command Error Handling
**Source:** `src/services/git-service.ts` lines 68-80
**Apply to:** `getUnpushedCount` addition

```typescript
// Parse Tauri error strings to typed errors
} catch (e) {
  const msg = String(e);
  if (msg.includes('AuthFailed') || msg.includes('Authentication failed')) {
    throw new GitError('AuthFailed', msg);
  } else if (msg.includes('PushRejected')) {
    throw new GitError('PushRejected', msg);
  }
  throw new GitError('PushError', msg);
}
```

### Rust async spawn_blocking Pattern
**Source:** `src-tauri/src/git_ops.rs` lines 261-267
**Apply to:** `get_unpushed_count` command

```rust
#[tauri::command]
pub async fn command_name(param: String) -> Result<ReturnType, String> {
    spawn_blocking(move || impl_function(&param))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

---

## No Analog Found

No files without close analogs. All files have direct patterns in the codebase.

---

## Metadata

**Analog search scope:** `src/components/`, `src/services/`, `src-tauri/src/`
**Files scanned:** 25 component files, 1 service file, 6 Rust modules
**Pattern extraction date:** 2026-04-15
