# Phase 16: Sidebar Evolution + Git Control - Research

**Researched:** 2026-04-15
**Domain:** Sidebar tab system, git staging/commit/push UI, toast notifications
**Confidence:** HIGH

## Summary

Phase 16 transforms the sidebar from a single-purpose project/git-changes display into a 3-tab system (Projects, Files, Git) and adds full git staging, commit, and push capabilities via the Git Control tab. The Rust backend (git2-rs) already provides the core operations: `stage_file`, `unstage_file`, `commit`, and `push` commands are implemented in `git_ops.rs` with typed errors. The frontend service wrappers exist in `git-service.ts`.

The primary work is UI construction: tab row component, git control pane with staged/changes sections, commit textarea, commit/push buttons, and a toast notification system for feedback. One backend addition is required: a `get_unpushed_count` command to determine Push button visibility via `Repository::graph_ahead_behind()`.

**Primary recommendation:** Build the tab system as a signal-driven component in sidebar.tsx, create a dedicated GitControlTab component for the Git tab content, and add a minimal Toast component for operation feedback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Text tabs row below EFXMUX header: "Projects | Files | Git"
- **D-02:** Active tab indicated by accent color underline or background
- **D-03:** Tab state stored in local signal (not persisted across sessions)
- **D-04:** File Tree tab renders existing FileTree component; Projects tab renders existing project list
- **D-05:** Two collapsible sections: "STAGED" and "CHANGES" with file counts in headers
- **D-06:** Checkbox per file -- checked = staged, unchecked = unstaged
- **D-07:** Clicking checkbox calls git-service.ts stageFile/unstageFile
- **D-08:** File badges show status: [M] modified, [A] added, [D] deleted, [?] untracked
- **D-09:** Always-visible multiline textarea at top of Git Control tab
- **D-10:** Placeholder text: "Commit message..."
- **D-11:** "Commit (N files)" button below textarea, disabled when no staged files or empty message
- **D-12:** On commit success: clear textarea, refresh file lists, show brief success indicator
- **D-13:** "Push to origin" button appears below Commit button when unpushed commits exist
- **D-14:** Spinner on button during push operation
- **D-15:** Toast notification on error with recovery hint (e.g., "Run: ssh-add" for auth failures)
- **D-16:** Toast notification on success: "Pushed to origin/branch"

### Claude's Discretion
- Exact textarea height and resize behavior
- Collapsible section animation timing
- Toast notification positioning and duration
- Internal signal naming within components

### Deferred Ideas (OUT OF SCOPE)
- GIT-05 (undo last commit) -- defer to Phase 16.1 or v0.3.x patch
- Hunk-level staging -- REQUIREMENTS.md lists as v0.3.x future requirement
- Branch switching UI -- explicitly out of scope per REQUIREMENTS.md

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIDE-01 | User can switch between 3 sidebar tabs: Projects, File Tree, Git Control | Tab row component pattern with signal-based active state; FileTree component exists for Files tab |
| GIT-01 | User can stage individual files via checkboxes in git control pane | `stageFile()` in git-service.ts wraps `stage_file` Tauri command; checkbox triggers call |
| GIT-02 | User can unstage individual files via checkboxes | `unstageFile()` in git-service.ts wraps `unstage_file` Tauri command; inverse of GIT-01 |
| GIT-03 | User can commit staged changes with message input | `commit()` in git-service.ts wraps `commit` Tauri command; returns OID on success |
| GIT-04 | User can push commits to remote repository | `push()` in git-service.ts wraps `push` Tauri command; typed error codes for auth/rejection |
| GIT-05 | User can undo last commit (soft reset) | DEFERRED per CONTEXT.md |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab switching | Frontend (Preact) | -- | Pure UI state, no persistence needed |
| File staging/unstaging | Rust backend (git2) | Frontend (IPC wrapper) | git2 index manipulation requires native code |
| Commit creation | Rust backend (git2) | Frontend (IPC wrapper) | git2 signature/tree/commit requires native code |
| Push to remote | Rust backend (git2) | Frontend (IPC wrapper) | git2 credentials/push requires native code |
| Unpushed commit detection | Rust backend (git2) | Frontend (IPC call) | `graph_ahead_behind()` is git2-native |
| Toast notifications | Frontend (Preact) | -- | Pure UI feedback, no backend involvement |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 (Rust) | 0.20.4 | Git operations via libgit2 | [VERIFIED: Cargo.toml] Already in project, industry standard for Rust git bindings |
| @preact/signals | ^2.9.0 | Reactive state for tabs/lists | [VERIFIED: package.json] Already in project, established pattern |
| lucide-preact | ^1.8.0 | Icons (ChevronDown, CheckCircle, etc.) | [VERIFIED: package.json] Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | existing | Testing git-service additions | Already configured, use for new tests |
| @testing-library/preact | existing | Component tests for GitControlTab | Already configured |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom toast | react-hot-toast | Adds dependency for simple feature; custom is ~50 LOC |
| Signal-based tabs | URL-based routing | Over-engineered for sidebar-internal navigation |

**Installation:**
```bash
# No new dependencies required -- all libraries already installed
```

**Version verification:** All versions confirmed from existing package.json and Cargo.toml in the project [VERIFIED: codebase inspection].

## Architecture Patterns

### System Architecture Diagram

```
User Click (Tab/Checkbox/Button)
        |
        v
+-------------------+
| Preact Component  |
| (sidebar.tsx or   |
|  GitControlTab)   |
+-------------------+
        |
        | signal.value = newState (optimistic)
        v
+-------------------+
| git-service.ts    |
| (IPC wrappers)    |
+-------------------+
        |
        | invoke('command', args)
        v
+-------------------+
| Tauri IPC         |
+-------------------+
        |
        | #[tauri::command]
        v
+-------------------+
| git_ops.rs        |
| (stage/unstage/   |
|  commit/push)     |
+-------------------+
        |
        | spawn_blocking + git2
        v
+-------------------+
| libgit2           |
| (.git/index,      |
|  .git/objects)    |
+-------------------+
        |
        | Result<_, GitError>
        v
+-------------------+
| Frontend          |
| - Success: update |
|   signals, toast  |
| - Error: revert,  |
|   toast with hint |
+-------------------+
```

### Recommended Project Structure
```
src/
├── components/
│   ├── sidebar.tsx          # Add tab row, delegate to tab content
│   ├── git-control-tab.tsx  # NEW: Git Control tab content
│   ├── toast.tsx            # NEW: Toast notification component
│   └── file-tree.tsx        # Existing, embed in Files tab
├── services/
│   └── git-service.ts       # Existing, may add getUnpushedCount
└── state-manager.ts         # Existing signals, no changes needed
```

### Pattern 1: Signal-Based Tab State
**What:** Use a local signal to track active tab, no persistence
**When to use:** Sidebar-internal navigation that resets on app restart
**Example:**
```typescript
// Source: Preact signals pattern from existing sidebar.tsx
import { signal } from '@preact/signals';

type SidebarTab = 'projects' | 'files' | 'git';
const activeTab = signal<SidebarTab>('projects');

function TabRow() {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {(['projects', 'files', 'git'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => { activeTab.value = tab; }}
          style={{
            borderBottom: activeTab.value === tab 
              ? `2px solid ${colors.accent}` 
              : '2px solid transparent',
            color: activeTab.value === tab 
              ? colors.textPrimary 
              : colors.textMuted,
          }}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

### Pattern 2: Optimistic UI with Error Rollback
**What:** Update UI immediately, revert on IPC error
**When to use:** Stage/unstage checkbox interactions
**Example:**
```typescript
// Source: Standard optimistic update pattern
async function handleCheckboxChange(file: GitFile, checked: boolean) {
  const previousState = gitFiles.value;
  
  // Optimistic update
  gitFiles.value = gitFiles.value.map(f =>
    f.path === file.path ? { ...f, staged: checked } : f
  );

  try {
    if (checked) {
      await stageFile(repoPath, file.path);
    } else {
      await unstageFile(repoPath, file.path);
    }
  } catch (err) {
    // Revert on error
    gitFiles.value = previousState;
    showToast({ type: 'error', message: `Failed to ${checked ? 'stage' : 'unstage'} ${file.name}` });
  }
}
```

### Pattern 3: Toast Notification with Auto-Dismiss
**What:** Temporary notification that auto-hides after duration
**When to use:** Success/error feedback for git operations
**Example:**
```typescript
// Source: Standard toast pattern
import { signal } from '@preact/signals';

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

### Anti-Patterns to Avoid
- **Storing tab state in localStorage:** Over-engineering for ephemeral UI state
- **Polling for git status:** Use event-driven refresh via `git-status-changed` Tauri event
- **Blocking UI during git operations:** Always use async/await with loading states

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git staging | Shell out to `git add` | git2 `Index::add_path()` | Already implemented in git_ops.rs; shell-out adds PATH issues |
| Git push auth | Manual SSH key reading | git2 `Cred::ssh_key_from_agent()` | Already implemented with fallback chain |
| Commit signing | GPG subprocess | Not supported | Out of scope; git2 doesn't support GPG signing natively |
| Branch tracking | Parse `.git/config` | git2 `Branch::upstream()` | Proper API exists |

**Key insight:** All git operations are already implemented in git_ops.rs. The only new backend work is `get_unpushed_count` using `graph_ahead_behind()`.

## Common Pitfalls

### Pitfall 1: Stale File Lists After Operations
**What goes wrong:** After staging/committing, file lists show old data
**Why it happens:** No refresh after operation completes
**How to avoid:** Call `refreshGitFiles()` after every successful stage/unstage/commit
**Warning signs:** Files appear in both STAGED and CHANGES sections simultaneously

### Pitfall 2: Push Button Visibility Timing
**What goes wrong:** Push button doesn't appear after commit, or stays visible after push
**Why it happens:** Unpushed count not refreshed
**How to avoid:** Refresh unpushed count after commit and push operations
**Warning signs:** Push button stuck in wrong state

### Pitfall 3: Textarea Doesn't Clear on Commit
**What goes wrong:** Message persists after successful commit
**Why it happens:** Signal not reset in success handler
**How to avoid:** Explicitly set `commitMessage.value = ''` in commit success handler
**Warning signs:** User has to manually clear message after each commit

### Pitfall 4: Checkbox State Out of Sync
**What goes wrong:** Checkbox visual state doesn't match actual git index
**Why it happens:** Optimistic update but no revert on error
**How to avoid:** Implement proper rollback in catch block
**Warning signs:** Files appear staged but aren't in next commit

### Pitfall 5: Auth Errors Without Recovery Hint
**What goes wrong:** User sees "Authentication failed" with no guidance
**Why it happens:** Generic error message
**How to avoid:** Map AuthFailed error to specific hint: "Run: ssh-add"
**Warning signs:** Users can't figure out how to fix push failures

## Code Examples

### Backend: Get Unpushed Commit Count

```rust
// Source: git2 docs.rs graph_ahead_behind API [VERIFIED: Context7]
// Add to src-tauri/src/git_ops.rs

/// Check how many commits are ahead of the upstream tracking branch.
pub fn get_unpushed_count_impl(repo_path: &str) -> Result<usize, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    
    let head = repo.head().map_err(|e| GitError::IndexError(e.to_string()))?;
    let local_oid = head.target().ok_or_else(|| GitError::IndexError("No HEAD target".to_string()))?;
    
    // Get upstream branch
    let branch = repo
        .find_branch(head.shorthand().unwrap_or("main"), git2::BranchType::Local)
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

#[tauri::command]
pub async fn get_unpushed_count(repo_path: String) -> Result<usize, String> {
    spawn_blocking(move || get_unpushed_count_impl(&repo_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

### Frontend: Git Service Addition

```typescript
// Source: Existing git-service.ts pattern [VERIFIED: codebase]
// Add to src/services/git-service.ts

/**
 * Get the number of commits ahead of upstream (unpushed).
 * @param repoPath Path to the git repository root
 * @returns Number of unpushed commits (0 if no upstream configured)
 */
export async function getUnpushedCount(repoPath: string): Promise<number> {
  try {
    return await invoke<number>('get_unpushed_count', { repoPath });
  } catch (e) {
    console.warn('[git-service] getUnpushedCount failed:', e);
    return 0; // Fail safe: hide push button rather than crash
  }
}
```

### Frontend: Collapsible Section Component

```typescript
// Source: UI-SPEC.md StagedSection/ChangesSection [VERIFIED: CONTEXT.md D-05]
import { signal } from '@preact/signals';
import { ChevronDown, ChevronRight } from 'lucide-preact';

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: preact.ComponentChildren;
}

export function CollapsibleSection({ title, count, defaultOpen = true, children }: CollapsibleSectionProps) {
  const isOpen = signal(defaultOpen);

  return (
    <div>
      <div
        onClick={() => { isOpen.value = !isOpen.value; }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xl,
          padding: `${spacing.md}px ${spacing.xl}px`,
          cursor: 'pointer',
        }}
      >
        {isOpen.value ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
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
        maxHeight: isOpen.value ? '1000px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 150ms ease-out',
      }}>
        {children}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shell-out to git CLI | Native git2-rs bindings | Phase 15 | Faster, no PATH issues, typed errors |
| Full page refresh | Signal-based reactive updates | Phase 6.1 (Preact migration) | Instant UI updates |
| Manual SSH key paths | ssh-agent with fallback | Phase 15 | Works with standard macOS keychain |

**Deprecated/outdated:**
- None in this phase; building on Phase 15 foundations

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Toast 4000ms auto-dismiss is appropriate | Pattern 3 | Minor UX issue; easily adjustable |
| A2 | Native checkbox `accent-color` CSS works in WKWebView | UI-SPEC | May need custom checkbox styling |

## Open Questions

1. **SSH Key Passphrase Prompts**
   - What we know: git2 `ssh_key_from_agent()` works when ssh-agent has keys loaded
   - What's unclear: Behavior when key requires passphrase and agent is empty
   - Recommendation: Log warning, show toast with "Run: ssh-add" hint

2. **Large Staged File Counts**
   - What we know: UI shows "Commit (N files)" button
   - What's unclear: Performance with 1000+ staged files in list
   - Recommendation: Virtualize list if performance issues emerge (defer to patch)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git2 (Rust) | Git operations | Yes | 0.20.4 | -- |
| libgit2 (system) | git2 compilation | Yes | bundled | -- |
| ssh-agent | Push auth | Yes | macOS native | File-based SSH key |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + @testing-library/preact |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test -- --run` |
| Full suite command | `pnpm test -- --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIDE-01 | Tab switching renders correct content | unit | `pnpm test -- src/components/sidebar.test.tsx -x` | Yes (extend) |
| GIT-01 | stageFile IPC call on checkbox check | unit | `pnpm test -- src/services/git-service.test.ts -x` | Yes (exists) |
| GIT-02 | unstageFile IPC call on checkbox uncheck | unit | `pnpm test -- src/services/git-service.test.ts -x` | Yes (exists) |
| GIT-03 | commit IPC call with message | unit | `pnpm test -- src/services/git-service.test.ts -x` | Yes (exists) |
| GIT-04 | push IPC call, error code handling | unit | `pnpm test -- src/services/git-service.test.ts -x` | Yes (exists) |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run`
- **Per wave merge:** `pnpm test -- --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/git-control-tab.test.tsx` -- covers GitControlTab component rendering
- [ ] `src/components/toast.test.tsx` -- covers Toast component behavior
- [ ] Add `getUnpushedCount` tests to `src/services/git-service.test.ts`
- [ ] Add Rust tests for `get_unpushed_count_impl` in `git_ops.rs`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (push) | git2 ssh-agent + file key fallback (implemented) |
| V3 Session Management | No | -- |
| V4 Access Control | No | -- |
| V5 Input Validation | Yes | Commit message sanitized by git2 (no injection risk) |
| V6 Cryptography | No (defer GPG signing) | -- |

### Known Threat Patterns for git2

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential exposure in logs | Information Disclosure | Never log credentials; git2 handles internally |
| Path traversal in file staging | Tampering | git2 validates paths against repo workdir |
| Commit message injection | Tampering | git2 treats message as opaque string |

## Sources

### Primary (HIGH confidence)
- `/rust-lang/git2-rs` via Context7 -- graph_ahead_behind API verified
- `/websites/rs_git2` via Context7 -- staging/unstaging/commit patterns
- `src-tauri/src/git_ops.rs` -- existing implementation patterns [VERIFIED: codebase]
- `src/services/git-service.ts` -- existing IPC wrappers [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- UI-SPEC.md -- visual specifications from gsd-ui-researcher
- CONTEXT.md -- locked decisions from /gsd-discuss-phase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, versions confirmed
- Architecture: HIGH -- extending established patterns from Phase 15
- Pitfalls: HIGH -- based on direct code inspection and common git UI issues

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (30 days -- stable domain)
