---
phase: quick-260415-gkz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/git_status.rs
  - src-tauri/src/lib.rs
  - src/components/git-control-tab.tsx
  - src/services/git-service.ts
autonomous: true
requirements: [quick-gkz]
must_haves:
  truths:
    - "Each file row shows a gray checkbox for stage/unstage toggling"
    - "Clicking the checkbox stages or unstages the file"
    - "Clicking the filename (not checkbox) dispatches open-diff and switches right panel to Diff tab"
    - "Each file row shows +N -N diff stats in green/red"
    - "Diff stats are computed from actual git diff data in the Rust backend"
  artifacts:
    - path: "src-tauri/src/git_status.rs"
      provides: "get_file_diff_stats command returning {additions, deletions} per file"
      contains: "get_file_diff_stats"
    - path: "src/components/git-control-tab.tsx"
      provides: "Redesigned GitFileRow with checkbox, diff stats, click-to-diff"
      contains: "open-diff"
    - path: "src/services/git-service.ts"
      provides: "getFileDiffStats frontend wrapper"
      contains: "getFileDiffStats"
  key_links:
    - from: "src/components/git-control-tab.tsx"
      to: "src/services/git-service.ts"
      via: "getFileDiffStats call in refreshGitFiles"
      pattern: "getFileDiffStats"
    - from: "src/services/git-service.ts"
      to: "src-tauri/src/git_status.rs"
      via: "invoke('get_file_diff_stats')"
      pattern: "get_file_diff_stats"
    - from: "src/components/git-control-tab.tsx"
      to: "document event"
      via: "CustomEvent('open-diff', { detail: { path } })"
      pattern: "open-diff"
---

<objective>
Redesign the git-control-tab GitFileRow to match Zed editor panel layout:
1. Gray checkbox on the left for stage/unstage (replaces click-entire-row-to-toggle)
2. Diff stats (+N -N) per file in green/red on the right
3. Click on filename dispatches `open-diff` event to show diff in the Diff tab

This requires a new Rust backend command to compute per-file diff stats (additions/deletions)
and frontend changes to GitFileRow layout and interaction model.

Purpose: Better UX -- staging is explicit via checkbox, file click shows diff, stats provide at-a-glance change info.
Output: Updated git-control-tab.tsx, git-service.ts, git_status.rs, lib.rs
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/git-control-tab.tsx
@src-tauri/src/git_status.rs
@src-tauri/src/git_ops.rs
@src-tauri/src/lib.rs
@src/services/git-service.ts
@src/tokens.ts
@src/components/diff-viewer.tsx

<interfaces>
<!-- Key types and contracts the executor needs -->

From src-tauri/src/git_status.rs:
```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct GitFileEntry {
    pub name: String,
    pub path: String,
    pub status: String, // "M", "S", "U"
}

pub fn get_git_files_impl(path: &str) -> Result<Vec<GitFileEntry>, String>
```

From src/components/git-control-tab.tsx:
```typescript
interface GitFile {
  name: string;
  path: string;
  status: string;
  staged: boolean;
}
```

From src/tokens.ts:
```typescript
export const colors = {
  statusGreen: '#3FB950',
  diffRed: '#F85149',
  textDim: '#556A85',
  textMuted: '#8B949E',
  textPrimary: '#E6EDF3',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  // ...
}
```

From src/components/diff-viewer.tsx (event contract):
```typescript
// Listens for: document.addEventListener('open-diff', handler)
// Event shape: CustomEvent({ detail: { path: string } })
```

From src/components/right-panel.tsx:
```typescript
// Also listens for 'open-diff' to switch tab:
// document.addEventListener('open-diff', () => { rightTopTab.value = 'Diff'; });
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add get_file_diff_stats Rust command and wire to frontend</name>
  <files>src-tauri/src/git_status.rs, src-tauri/src/lib.rs, src/services/git-service.ts</files>
  <action>
**Rust backend (src-tauri/src/git_status.rs):**

Add a new struct and command that returns per-file diff stats:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileDiffStats {
    pub path: String,
    pub additions: usize,
    pub deletions: usize,
}
```

Add `get_file_diff_stats_impl(repo_path: &str) -> Result<Vec<FileDiffStats>, String>`:
- Open the repo with `Repository::open(repo_path)`
- Get HEAD commit tree: `repo.head()?.peel_to_tree()?`
- Create a diff between HEAD tree and workdir: `repo.diff_tree_to_workdir_with_index(Some(&head_tree), None)?`
- Call `diff.stats()?.to_buf(git2::DiffStatsFormat::FULL, 0)` -- BUT this gives aggregate stats. Instead, iterate over `diff.deltas()` and for each delta, use `diff.foreach()` with callbacks to count per-file additions/deletions.
- Actually, the cleanest approach: use `diff.foreach()` with `file_cb`, `hunk_cb=None`, `line_cb` that increments per-path counters. In the line callback, match on `DiffLine::origin()`: '+' increments additions, '-' increments deletions for the current file path.
- Collect into `Vec<FileDiffStats>` keyed by the full path (`format!("{}/{}", repo_path, delta.new_file().path())`)
- Also compute stats for staged changes: `repo.diff_tree_to_index(Some(&head_tree), Some(&index), None)?` and merge those stats in.

Add the async Tauri command wrapper:
```rust
#[tauri::command]
pub async fn get_file_diff_stats(repo_path: String) -> Result<Vec<FileDiffStats>, String> {
    spawn_blocking(move || get_file_diff_stats_impl(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}
```

**Important implementation detail for diff.foreach():** git2's `foreach` takes closures. Use a `HashMap<String, (usize, usize)>` to accumulate per-file stats. In the `file_cb`, record the current file path. In the `line_cb`, check `line.origin()` -- if `'+'` increment additions, if `'-'` increment deletions. The `file_cb` fires once per delta, so track "current file" in a `RefCell<String>` or just use the path from each line's parent delta.

Actually, the simplest correct approach: iterate `diff.deltas()` by index, then for each delta call `diff.find_similar(None)` first (optional), then use `Patch::from_diff(&diff, idx)` to get per-file patch with `patch.line_stats()` returning `(context, additions, deletions)`. This is cleaner:

```rust
use git2::Patch;

let mut stats = HashMap::new();
for idx in 0..diff.deltas().len() {
    if let Ok(Some(patch)) = Patch::from_diff(&diff, idx) {
        let (_, adds, dels) = patch.line_stats().unwrap_or((0, 0, 0));
        let delta = diff.get_delta(idx).unwrap();
        let rel = delta.new_file().path().unwrap_or(Path::new(""));
        let full = format!("{}/{}", repo_path, rel.display());
        let entry = stats.entry(full.clone()).or_insert((0usize, 0usize));
        entry.0 += adds;
        entry.1 += dels;
    }
}
```

Do this for BOTH `diff_tree_to_workdir_with_index` (unstaged + staged combined) and separately if needed. Actually, `diff_tree_to_workdir_with_index` already includes both staged and unstaged changes vs HEAD, which is exactly what we want for showing total per-file stats regardless of staging state.

**Wire in lib.rs:**
Add `git_status::get_file_diff_stats` to the `invoke_handler` macro in `lib.rs`, in the Git section alongside existing git commands.

**Frontend wrapper (src/services/git-service.ts):**
Add:
```typescript
export interface FileDiffStats {
  path: string;
  additions: number;
  deletions: number;
}

export async function getFileDiffStats(repoPath: string): Promise<FileDiffStats[]> {
  try {
    return await invoke<FileDiffStats[]>('get_file_diff_stats', { repoPath });
  } catch (e) {
    console.warn('[git-service] getFileDiffStats failed:', e);
    return [];
  }
}
```
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && cargo test --manifest-path src-tauri/Cargo.toml -- git_status 2>&1 | tail -20</automated>
    Rust compiles without errors. Existing git_status tests still pass.
    Check that `get_file_diff_stats` is registered in lib.rs invoke_handler.
  </verify>
  <done>
    - `FileDiffStats` struct exists in git_status.rs with path/additions/deletions fields
    - `get_file_diff_stats_impl` computes per-file +/- counts using git2 Patch API
    - `get_file_diff_stats` async command registered in lib.rs invoke_handler
    - `getFileDiffStats` wrapper exported from git-service.ts with `FileDiffStats` interface
    - Existing tests pass, Rust compiles clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Redesign GitFileRow with checkbox, diff stats, and click-to-diff</name>
  <files>src/components/git-control-tab.tsx</files>
  <action>
**Update GitFile interface** to include diff stats:
```typescript
interface GitFile {
  name: string;
  path: string;
  status: string;
  staged: boolean;
  additions: number;
  deletions: number;
}
```

**Update refreshGitFiles** to fetch and merge diff stats:
- Import `getFileDiffStats` and `FileDiffStats` from `../services/git-service`
- After fetching files and mapping them, also call `getFileDiffStats(project.path)` 
- Create a Map from the stats array keyed by path for O(1) lookup
- When mapping files, merge in additions/deletions (default to 0 if no stats found for that path)

```typescript
// After existing file fetch
const statsArr = await getFileDiffStats(project.path);
const statsMap = new Map(statsArr.map(s => [s.path, s]));

gitFiles.value = files.map(f => {
  const fullPath = /* existing path logic */;
  const stat = statsMap.get(fullPath);
  return {
    name: f.name,
    path: f.path,  // keep existing path
    status: f.status.replace('S', ''),
    staged: f.status.startsWith('S') || f.status === 'A',
    additions: stat?.additions ?? 0,
    deletions: stat?.deletions ?? 0,
  };
});
```

Note: The path matching between get_git_files (which returns `format!("{}/{}", path, rel_path)`) and get_file_diff_stats (which also uses `format!("{}/{}", repo_path, rel.display())`) should match since both use the full absolute path. But verify by comparing the path format from both commands.

**Redesign GitFileRow component** to have three interaction zones:

```
[checkbox] [filename ........] [+N -N] [M]
^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^  ^^^^^^  ^^^
click=     click=open-diff      visual  visual
stage/                          stats   badge
unstage
```

Replace the current `GitFileRow` function:

1. **Gray checkbox** (leftmost): A custom checkbox styled as a small square.
   - Unstaged (in CHANGES section): empty gray bordered box
   - Staged (in STAGED section): filled gray box with a checkmark
   - onClick of the checkbox area: call `onToggle()` (stage or unstage)
   - Use `colors.textDim` for border, `colors.textMuted` for fill when checked
   - Size: 14x14px, border-radius: `radii.sm` (3px), border: 1.5px solid
   - Checkmark: use a simple SVG path or the unicode checkmark character in `colors.textPrimary`
   - IMPORTANT: Add `e.stopPropagation()` on checkbox click to prevent row click from also firing

2. **Filename** (middle, flex: 1): Same as current -- mono font, ellipsis overflow, `colors.textPrimary`
   - The entire row (outside checkbox) dispatches `open-diff`:
     ```typescript
     document.dispatchEvent(new CustomEvent('open-diff', { detail: { path: file.path } }));
     ```
   - This already-existing event will be caught by both `diff-viewer.tsx` and `right-panel.tsx` (which switches to Diff tab)

3. **Diff stats** (right of filename): Show `+N` in `colors.statusGreen` and `-N` in `colors.diffRed`
   - Font: `fonts.mono`, size: `fontSizes.xs` (9px), fontWeight: 600
   - Only show if additions > 0 or deletions > 0 (skip for untracked files with no HEAD to diff against -- though they will naturally show additions only)
   - Format: `+{additions}` green, space, `-{deletions}` red
   - If additions is 0, still show `+0` but in `colors.textDim` (dimmed). Same for deletions.

4. **Status badge** (far right): Keep existing pill badge (M/A/D/U) with current color logic -- no changes needed.

**Row click handler logic:**
- The row's `onClick` dispatches `open-diff` event (click anywhere on the row)
- The checkbox has its own `onClick` with `stopPropagation` that calls `onToggle()`
- This means: click checkbox = stage/unstage, click anywhere else = show diff

**Update GitFileRow props:**
```typescript
function GitFileRow({
  file,
  onToggle,
}: {
  file: GitFile;
  onToggle: () => void;
}) {
```
Props stay the same -- `onToggle` is called by checkbox, row click dispatches open-diff.

**Checkbox implementation** (inline SVG for the check, no new dependency):
```tsx
<div
  onClick={(e) => {
    e.stopPropagation();
    onToggle();
  }}
  style={{
    width: 14,
    height: 14,
    borderRadius: radii.sm,
    border: `1.5px solid ${file.staged ? colors.textMuted : colors.textDim}`,
    backgroundColor: file.staged ? colors.textMuted : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  }}
>
  {file.staged && (
    <svg width="8" height="8" viewBox="0 0 8 8">
      <path d="M1 4l2 2 4-4" stroke={colors.bgDeep} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )}
</div>
```

**Remove the status dot** -- the checkbox replaces it as the leftmost element.

**Row onClick for open-diff:**
```tsx
<div
  onClick={() => {
    document.dispatchEvent(new CustomEvent('open-diff', { detail: { path: file.path } }));
  }}
  onMouseEnter={...}  // existing hover
  onMouseLeave={...}  // existing hover
  style={{...}}       // existing row styles
>
  {/* checkbox with stopPropagation */}
  {/* filename */}
  {/* diff stats */}
  {/* status badge */}
</div>
```

**Diff stats display:**
```tsx
{(file.additions > 0 || file.deletions > 0) && (
  <span style={{
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontWeight: 600,
    flexShrink: 0,
    display: 'flex',
    gap: spacing.md,
  }}>
    <span style={{ color: file.additions > 0 ? colors.statusGreen : colors.textDim }}>
      +{file.additions}
    </span>
    <span style={{ color: file.deletions > 0 ? colors.diffRed : colors.textDim }}>
      -{file.deletions}
    </span>
  </span>
)}
```
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | tail -20</automated>
    TypeScript compiles clean. No type errors in git-control-tab.tsx.
    Verify the open-diff event dispatch is present in GitFileRow.
    Verify checkbox has stopPropagation.
  </verify>
  <done>
    - GitFile interface has additions/deletions fields
    - refreshGitFiles calls getFileDiffStats and merges stats into GitFile objects
    - GitFileRow shows: checkbox | filename | +N -N stats | status badge
    - Checkbox click stages/unstages (with stopPropagation)
    - Row click (outside checkbox) dispatches open-diff CustomEvent to show diff in Diff tab
    - Diff stats shown in green (+) and red (-) using design tokens
    - Status dot removed, replaced by checkbox
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `cargo test --manifest-path src-tauri/Cargo.toml -- git_status` -- existing tests pass
2. `cargo build --manifest-path src-tauri/Cargo.toml` -- Rust compiles (includes new command)
3. `pnpm exec tsc --noEmit` -- TypeScript compiles clean
4. Manual: Open the app, git tab shows files with checkboxes, diff stats, click file to see diff
</verification>

<success_criteria>
- Gray checkboxes appear on each file row (filled when staged, empty when unstaged)
- Clicking checkbox stages/unstages the file (same behavior as before, different trigger)
- Clicking filename/row opens the diff in the Diff tab (right panel switches automatically)
- Per-file diff stats (+N -N) shown in green/red on each row
- No regressions: commit, push, stage all, uncommit all still work
</success_criteria>

<output>
After completion, create `.planning/quick/260415-gkz-redesign-git-control-tab-to-zed-panel-la/260415-gkz-SUMMARY.md`
</output>
