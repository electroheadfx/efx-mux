# Phase 5: Project System + Sidebar - Research

**Researched:** 2026-04-07
**Domain:** Project registry, sidebar UI, git status integration, fuzzy search
**Confidence:** HIGH

## Summary

Phase 5 transforms the placeholder sidebar into a functional project registry with git status integration. The core work involves: (1) extending the Rust `AppState` with a `projects` vector and new Tauri commands, (2) replacing the static sidebar with a dynamic Arrow.js component showing projects and git changes, (3) adding the `git2` crate for native git status queries, (4) wiring a `notify` file watcher on `.git` directories for live refresh, and (5) implementing a Ctrl+P fuzzy search overlay.

The codebase already has strong patterns to follow: `state.rs` for state persistence with atomic writes, `theme/watcher.rs` for the `notify` debouncer pattern, `state-manager.js` for Rust-JS bridge helpers, and `sidebar.js` as the Arrow.js component scaffold. The `tauri-plugin-dialog` package is needed for the native directory picker in the add-project modal.

**Primary recommendation:** Extend existing state.rs/state-manager.js patterns for project data. Add `git2` crate and `tauri-plugin-dialog` as the only new dependencies. Reuse the `notify` watcher pattern from theme/watcher.rs for git directory monitoring.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Project registry stored in state.json as a `projects` array alongside existing layout/theme/session fields. Each entry: `{ path, name, agent, gsd_file, server_cmd }`. Active project tracked by `project.active`.
- **D-02:** Rust `ProjectState` struct extended with `projects: Vec<ProjectEntry>` where `ProjectEntry` has all PROJ-01 fields.
- **D-03:** Add-project triggered from sidebar via a "+" button. Opens a modal dialog with fields: path (directory picker via Tauri dialog API), name (auto-filled from directory basename, editable), agent (dropdown: claude/opencode/bash), gsd_file (optional path), server_cmd (optional string).
- **D-04:** First-run detection: if `projects` array is empty on startup, show the add-project modal automatically.
- **D-05:** Expanded sidebar has two sections: project list (top, scrollable) and git changes (bottom, collapsible). Active project highlighted with #258ad1. Each project shows name + git branch badge.
- **D-06:** Collapsed sidebar (40px icon strip) shows project initials/icons only.
- **D-07:** Use `git2` crate via `spawn_blocking`. Expose `get_git_status` Tauri command returning `{ branch, modified, staged, untracked }` counts.
- **D-08:** Git status refreshes on: (a) project switch, (b) file system `notify` events on `.git` directory, (c) manual refresh button. No polling.
- **D-09:** Sidebar git section shows file counts as colored badges. Clicking a file opens diff in right panel (event wired, actual viewer deferred to Phase 6).
- **D-10:** Atomic switch: (1) update state.json active project, (2) `tmux send-keys` to cd into new project dir, (3) refresh git status, (4) emit `project-changed` event.
- **D-11:** Missing directory shows warning toast, keeps current project active.
- **D-12:** Fuzzy search overlay via plain JS, no external library. Arrow keys + Enter, Escape to dismiss.
- **D-13:** Ctrl+P captured at app level before terminal focus.

### Claude's Discretion
- Modal styling and animation details
- Exact sidebar section heights and spacing
- Git badge icon choices
- Fuzzy search scoring algorithm
- Error toast styling and duration

### Deferred Ideas (OUT OF SCOPE)
- Diff viewer rendering (Phase 6 PANEL-04)
- Project-specific agent launching (Phase 7 AGENT-06)
- Full first-run wizard (Phase 8 UX-04, Phase 5 handles project registration part only)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | Register project directory (path, name, agent, gsd_file, server_cmd) and switch between them | D-01/D-02 state model, D-03 add-project modal, tauri-plugin-dialog for directory picker |
| PROJ-02 | Sidebar shows registered projects with active highlighted and git branch | D-05/D-06 sidebar layout, git2 for branch detection |
| PROJ-03 | Switching project updates tmux session, git, GSD viewer, file tree | D-10 atomic switch sequence, tmux send-keys pattern |
| PROJ-04 | Ctrl+P fuzzy search project switcher | D-12/D-13 overlay modal, simple substring/fuzzy scoring |
| SIDE-01 | Sidebar shows git changes: modified/staged/untracked counts via git2 | D-07/D-08/D-09 git2 status API, notify watcher on .git |
| SIDE-02 | Click changed file to open diff in right panel | D-09 click handler emits event, actual diff viewer deferred to Phase 6 |
</phase_requirements>

## Standard Stack

### Core (New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| git2 (Rust) | 0.20.4 | Git status, branch detection, file change lists | Listed in CLAUDE.md. Native libgit2 bindings -- no shell-out to git CLI |
| tauri-plugin-dialog (Rust) | 2.7.0 | Native macOS directory picker for add-project modal | Official Tauri plugin for file/folder dialogs |
| @tauri-apps/plugin-dialog (JS) | 2.7.0 | JS API for `open({ directory: true })` | Frontend counterpart to Rust dialog plugin |

[VERIFIED: crates.io `git2 0.20.4`, `tauri-plugin-dialog 2.7.0`]
[VERIFIED: npm registry `@tauri-apps/plugin-dialog 2.7.0`]

### Existing (Already in Project)
| Library | Version | Purpose | Used For |
|---------|---------|---------|----------|
| notify + notify-debouncer-mini | 8.2 / 0.7 | File system watching | Git directory change detection (reuse theme watcher pattern) |
| serde / serde_json | 1.x | Serialization | ProjectEntry struct serialization |
| portable-pty | 0.9.0 | PTY management | Already used for terminal; tmux send-keys goes through it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git2 (native) | shell-out to `git status` | CLAUDE.md mandates git2; SIDE-01 says "no shell-out" |
| tauri-plugin-dialog | Custom HTML file picker | Native picker is OS-consistent, handles edge cases |
| Plain JS fuzzy search | fuse.js / fzf-for-js | Overkill for <50 projects; D-12 says no external library |

**Installation:**
```bash
# Rust dependencies
cd src-tauri && cargo add git2@0.20.4 && cargo add tauri-plugin-dialog@2.7.0
# JS dependency
npm install @tauri-apps/plugin-dialog@2.7.0
```

## Architecture Patterns

### New File Structure
```
src-tauri/src/
├── git/
│   ├── mod.rs          # Module declaration
│   └── status.rs       # get_git_status, get_git_file_changes Tauri commands
├── project/
│   ├── mod.rs          # Module declaration
│   └── commands.rs     # add_project, remove_project, switch_project commands
├── state.rs            # Extended with ProjectEntry, projects vec
├── terminal/pty.rs     # (existing, unchanged)
└── lib.rs              # Register new commands + dialog plugin

src/
├── components/
│   ├── sidebar.js      # Rewritten: project list + git changes sections
│   ├── project-modal.js  # Add/edit project modal dialog
│   └── fuzzy-search.js   # Ctrl+P overlay
├── state-manager.js    # Extended with project helpers
└── main.js             # Ctrl+P handler, project state wiring
```

### Pattern 1: Extending AppState (Rust)
**What:** Add `ProjectEntry` struct and `projects` vec to existing `ProjectState`
**When to use:** Project data model
**Example:**
```rust
// Source: existing state.rs pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    pub agent: String,           // "claude" | "opencode" | "bash"
    #[serde(default)]
    pub gsd_file: Option<String>,
    #[serde(default)]
    pub server_cmd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectState {
    #[serde(default)]
    pub active: Option<String>,    // project name
    #[serde(default)]
    pub projects: Vec<ProjectEntry>,
}
```
[VERIFIED: follows existing state.rs serde pattern in codebase]

### Pattern 2: Git Status via git2
**What:** Query repository status using git2 crate with spawn_blocking
**When to use:** SIDE-01 git change counts, PROJ-02 branch display
**Example:**
```rust
// Source: git2 docs.rs + existing spawn_blocking pattern
use git2::{Repository, StatusOptions};

#[tauri::command]
pub async fn get_git_status(project_path: String) -> Result<GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;

        // Get current branch name
        let head = repo.head().ok();
        let branch = head
            .as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("detached")
            .to_string();

        // Get file status counts
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(false); // Performance: don't recurse deep untracked dirs
        let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

        let mut modified = 0u32;
        let mut staged = 0u32;
        let mut untracked = 0u32;

        for entry in statuses.iter() {
            let s = entry.status();
            if s.intersects(git2::Status::INDEX_NEW | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED | git2::Status::INDEX_RENAMED) {
                staged += 1;
            }
            if s.intersects(git2::Status::WT_MODIFIED | git2::Status::WT_DELETED
                | git2::Status::WT_RENAMED) {
                modified += 1;
            }
            if s.intersects(git2::Status::WT_NEW) {
                untracked += 1;
            }
        }

        Ok(GitStatus { branch, modified, staged, untracked })
    })
    .await
    .map_err(|e| e.to_string())?
}
```
[ASSUMED: git2 Status flag names from docs.rs training data -- verify at implementation time]

### Pattern 3: Tauri Dialog for Directory Picker (JS Side)
**What:** Open native macOS folder picker from add-project modal
**When to use:** D-03 add-project flow
**Example:**
```javascript
// Source: https://v2.tauri.app/plugin/dialog/
import { open } from '@tauri-apps/plugin-dialog';

async function pickProjectDirectory() {
  const folder = await open({
    multiple: false,
    directory: true,
    title: 'Select project directory',
  });
  // folder is string path or null if cancelled
  return folder;
}
```
[CITED: https://v2.tauri.app/plugin/dialog/]

### Pattern 4: tmux send-keys for Project Switch (D-10)
**What:** Use `std::process::Command` to send `cd` command to existing tmux session
**When to use:** Atomic project switch step 2
**Example:**
```rust
// Source: tmux man page + existing check_tmux pattern in pty.rs
fn tmux_cd_to_project(session: &str, path: &str) -> Result<(), String> {
    let status = std::process::Command::new("tmux")
        .args(["send-keys", "-t", session, &format!("cd {}", shell_escape(path)), "Enter"])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("tmux send-keys failed with status {}", status));
    }
    Ok(())
}
```
[ASSUMED: tmux send-keys syntax -- well-established but verify quoting edge cases with spaces in paths]

### Pattern 5: Git Directory Watcher (Reuse Theme Watcher)
**What:** Watch `.git` directory for changes to trigger sidebar git status refresh
**When to use:** D-08 event-driven git refresh
**Example:**
```rust
// Source: existing theme/watcher.rs pattern
// Watch project_path/.git/ with NonRecursive mode
// On change, emit "git-status-changed" event to frontend
// Frontend calls get_git_status to refresh counts
```
[VERIFIED: notify + notify-debouncer-mini pattern already working in theme/watcher.rs]

### Pattern 6: Arrow.js Reactive Sidebar
**What:** Replace static NAV_ICONS with reactive project list
**When to use:** Sidebar component rewrite
**Example:**
```javascript
// Source: existing sidebar.js + Arrow.js reactive pattern
import { reactive, html } from '@arrow-js/core';

const sidebarState = reactive({
  projects: [],
  activeProject: null,
  gitStatus: { branch: '', modified: 0, staged: 0, untracked: 0 },
  gitFiles: [],
  gitSectionCollapsed: false,
});

// Arrow.js expression-level reactivity updates only the changed badge
html`<span class="badge">${() => sidebarState.gitStatus.modified}</span>`;
```
[VERIFIED: matches existing Arrow.js reactive pattern in codebase]

### Anti-Patterns to Avoid
- **Polling git status on interval:** D-08 explicitly says no polling. Use `notify` watcher on `.git` directory.
- **Shell-out to `git` CLI:** SIDE-01 requirement says "via git2 crate (no shell-out)".
- **Killing tmux session on project switch:** D-10 says `tmux send-keys` to cd, not kill+recreate.
- **Complex fuzzy search library:** D-12 says plain JS. For <50 projects, a simple substring match with scoring is sufficient.
- **HTML comments in Arrow.js templates:** Per memory note, HTML comments crash Arrow.js templates. Use JS comments only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory picker | Custom HTML file browser | `tauri-plugin-dialog` `open({ directory: true })` | OS-native, handles permissions, symlinks, hidden dirs |
| Git status parsing | Shell-out + parse `git status --porcelain` | `git2` crate `Repository::statuses()` | Type-safe, no subprocess overhead, no PATH issues |
| File system watching | setTimeout/setInterval polling | `notify` crate (already in deps) | Kernel-level events (FSEvents on macOS), zero CPU when idle |
| Path escaping for tmux | Manual string concatenation | Proper shell escaping for `tmux send-keys` | Paths with spaces, quotes, special chars will break naive concatenation |

**Key insight:** Every external dependency this phase needs is either already in the project (notify, serde) or is an official Tauri plugin (dialog). The only genuinely new Rust crate is git2, which is already listed in CLAUDE.md's version matrix.

## Common Pitfalls

### Pitfall 1: git2 Status Double-Counting
**What goes wrong:** A file can appear in both INDEX (staged) and WT (working tree) status simultaneously -- e.g., partially staged files.
**Why it happens:** git2 returns a single `Status` bitflag per file that can have both INDEX_MODIFIED and WT_MODIFIED set.
**How to avoid:** Use `intersects()` checks separately for staged vs working tree flags. Accept that a file may appear in both counts (this matches `git status` behavior).
**Warning signs:** Total badge count exceeds actual number of changed files.

### Pitfall 2: notify Watcher on .git Directory
**What goes wrong:** `.git` directory has many internal files (index, refs, objects). Watching recursively generates excessive events.
**Why it happens:** Every git operation (commit, fetch, rebase) touches multiple internal files.
**How to avoid:** Watch `.git` with `NonRecursive` mode. Debounce aggressively (500ms+). Only refresh git status -- don't try to detect what changed.
**Warning signs:** Sidebar flickering, excessive Tauri command invocations, high CPU.

### Pitfall 3: tmux send-keys Path Escaping
**What goes wrong:** `tmux send-keys "cd /path/with spaces"` fails or injects unintended commands.
**Why it happens:** tmux send-keys interprets the string literally but the shell receiving it still needs proper quoting.
**How to avoid:** Single-quote the path in the cd command: `send-keys "cd '/path/with spaces'" Enter`. Or use shell escaping crate.
**Warning signs:** Project switch fails silently for paths with spaces or special characters.

### Pitfall 4: Dialog Plugin Permissions
**What goes wrong:** `open()` call throws "Permission denied" or "Plugin not found" error.
**Why it happens:** Tauri 2 requires both plugin registration in Rust AND permission declaration in capabilities JSON.
**How to avoid:** Add `"dialog:default"` to `src-tauri/capabilities/default.json` permissions array. Register `.plugin(tauri_plugin_dialog::init())` in lib.rs.
**Warning signs:** Dialog works in dev but fails in production build.

### Pitfall 5: Arrow.js Reactivity with Arrays
**What goes wrong:** Pushing to `sidebarState.projects` doesn't trigger re-render.
**Why it happens:** Arrow.js tracks property access, not deep array mutations. `push()` mutates in-place without triggering the reactive setter.
**How to avoid:** Reassign the array: `sidebarState.projects = [...sidebarState.projects, newProject]`. Or use the reactive array pattern from Arrow.js docs.
**Warning signs:** Project added successfully (state.json updated) but sidebar doesn't show it.

### Pitfall 6: git2 First Build Time
**What goes wrong:** First `cargo build` after adding git2 takes 2-5 minutes.
**Why it happens:** git2 compiles libgit2 from C source (requires cmake + C toolchain).
**How to avoid:** Mentioned in CLAUDE.md -- Xcode CLI tools cover this on macOS. Just expect the first build to be slow.
**Warning signs:** Build appears hung during `Compiling libgit2-sys`.

## Code Examples

### Tauri Capability for Dialog Plugin
```json
// Source: https://v2.tauri.app/plugin/dialog/
// File: src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
}
```
[CITED: https://v2.tauri.app/plugin/dialog/]

### state-manager.js Extension Pattern
```javascript
// Source: existing state-manager.js pattern
export async function getProjects() {
  const state = getCurrentState();
  return state?.project?.projects ?? [];
}

export async function addProject(entry) {
  if (!currentState) return;
  if (!currentState.project) currentState.project = { active: null, projects: [] };
  if (!currentState.project.projects) currentState.project.projects = [];
  currentState.project.projects = [...currentState.project.projects, entry];
  await saveAppState(currentState);
}

export async function switchProject(name) {
  if (!currentState) return;
  currentState.project.active = name;
  await saveAppState(currentState);
}
```
[VERIFIED: follows existing updateLayout/updateSession pattern in state-manager.js]

### Simple Fuzzy Search (D-12)
```javascript
// Plain JS fuzzy match -- no external library
function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact substring match scores highest
  if (t.includes(q)) return { match: true, score: 100 - t.indexOf(q) };
  // Character-by-character fuzzy match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return { match: qi === q.length, score: qi === q.length ? 50 : 0 };
}
```
[ASSUMED: Simple scoring algorithm -- Claude's discretion per CONTEXT.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git2 0.19.x | git2 0.20.4 | 2024 | Minor API improvements, libgit2 1.8.x |
| tauri-plugin-dialog 2.0.0 | tauri-plugin-dialog 2.7.0 | 2025 | Stability fixes, better macOS integration |
| Manual file dialog HTML | tauri-plugin-dialog | Tauri 2 launch | Native OS dialog, no custom UI needed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | git2 Status flag names (INDEX_NEW, WT_MODIFIED, etc.) | Architecture Patterns / Pattern 2 | Compilation error -- easy to fix from docs.rs |
| A2 | tmux send-keys syntax for cd with path escaping | Architecture Patterns / Pattern 4 | Project switch fails for paths with spaces |
| A3 | Arrow.js array reassignment triggers reactivity | Common Pitfalls / Pitfall 5 | Sidebar won't update on project add |

## Open Questions

1. **Git watcher lifecycle management**
   - What we know: Theme watcher runs for app lifetime on config dir
   - What's unclear: When user switches project, the git watcher must switch to the new project's `.git` directory. The current theme watcher pattern uses an infinite loop with no teardown.
   - Recommendation: Use a `Mutex<Option<RecommendedWatcher>>` in managed state. On project switch, drop the old watcher and create a new one for the new project path.

2. **Multiple PTY sessions and tmux send-keys**
   - What we know: D-10 says "tmux send-keys to cd into new project directory in existing tmux session"
   - What's unclear: The app has both a main and right tmux session. Does project switch affect both?
   - Recommendation: Switch only the main session (agent terminal). Right panel bash session stays independent per its purpose.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git2 / libgit2 | SIDE-01 git status | Needs `cargo add` | 0.20.4 | -- (required) |
| cmake | git2 build | Xcode CLI tools | -- | -- |
| tauri-plugin-dialog | PROJ-01 directory picker | Needs `cargo add` + `npm install` | 2.7.0 | -- |
| tmux | PROJ-03 project switch | Checked at startup (pty.rs) | 3.x | Warning banner |
| notify | D-08 git watcher | Already in Cargo.toml | 8.2 | -- |

**Missing dependencies with no fallback:** None (all installable via cargo/npm)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual UAT (no automated test framework established yet) |
| Config file | None |
| Quick run command | `cargo build` (compilation = type safety check) |
| Full suite command | Manual UAT checklist |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | Register project with all fields | manual | `cargo build` (compiles ProjectEntry struct) | N/A |
| PROJ-02 | Sidebar shows projects with git branch | manual | N/A | N/A |
| PROJ-03 | Project switch updates tmux + panels | manual | N/A | N/A |
| PROJ-04 | Ctrl+P fuzzy search opens and selects | manual | N/A | N/A |
| SIDE-01 | Git status counts via git2 | manual | `cargo build` (compiles git status command) | N/A |
| SIDE-02 | Click file emits diff event | manual | N/A | N/A |

### Sampling Rate
- **Per task commit:** `cargo build` -- ensures Rust code compiles
- **Per wave merge:** Full manual UAT against all 5 success criteria
- **Phase gate:** All 5 success criteria verified manually

### Wave 0 Gaps
- None -- no automated test framework to gap-fill. Validation is compilation + manual UAT.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A (local desktop app) |
| V5 Input Validation | yes | Sanitize project path, name, session name |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via project path | Tampering | Validate path exists and is a directory before storing |
| tmux command injection via session name | Tampering | Existing sanitization in pty.rs (alphanumeric + hyphen + underscore only) |
| tmux send-keys injection via path | Tampering | Shell-escape the path before passing to `tmux send-keys` |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `state.rs`, `state-manager.js`, `sidebar.js`, `main.js`, `pty.rs`, `theme/watcher.rs`
- CLAUDE.md version matrix: git2 0.20.4, notify 8.2
- [Tauri Dialog Plugin docs](https://v2.tauri.app/plugin/dialog/) -- directory picker API
- crates.io: git2 0.20.4, tauri-plugin-dialog 2.7.0
- npm registry: @tauri-apps/plugin-dialog 2.7.0

### Secondary (MEDIUM confidence)
- [docs.rs git2](https://docs.rs/git2/latest/git2/) -- Status flag API (verified crate exists, specific flag names from training data)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified on registries, git2 already in CLAUDE.md
- Architecture: HIGH -- follows established codebase patterns (state.rs, watcher.rs, state-manager.js)
- Pitfalls: MEDIUM -- git2 status flags and Arrow.js array reactivity are from training data

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable dependencies, no fast-moving targets)
