---
phase: 09-professional-ui-overhaul
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src-tauri/src/file_ops.rs
  - src/components/diff-viewer.tsx
  - src/components/file-tree.tsx
  - src/components/preferences-panel.tsx
  - src/components/project-modal.tsx
  - src/components/sidebar.tsx
  - src/components/tab-bar.tsx
  - src/styles/app.css
  - src/theme/theme-manager.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase implements a professional UI overhaul across the diff viewer, file tree, sidebar, preferences panel, project modal, tab bar, CSS theme system, and theme manager. The code is generally well-structured with good separation of concerns. However, two critical issues were found: a path traversal bypass in `write_checkbox` and an `innerHTML` XSS sink in `diff-viewer.tsx` that injects Tauri error strings without full escaping. Five warnings cover edge cases in state management, a missing event listener cleanup, an unreliable light-mode detection, and a regex compiled on every invocation. Four informational items cover minor quality issues.

## Critical Issues

### CR-01: Path Traversal Check Applied After Project Root Check in `write_checkbox`

**File:** `src-tauri/src/file_ops.rs:196-205`
**Issue:** The `is_safe_path()` check (which rejects `..` components) runs *after* the project root check at line 196. The project root check at line 197-200 uses `Path::starts_with` on the *raw* string value — not a canonicalized path. An attacker-supplied path like `/home/user/projects/myapp/../../../etc/passwd` would pass `Path::starts_with("/home/user/projects/myapp")` on raw string comparison, then the `is_safe_path` check would catch it. However, because the project root is derived from `guard.project.active` (trusted state), the more dangerous scenario is a race: if `active` is `None`, the entire project root guard is skipped (line 196 `if let Some`), leaving `is_safe_path` as the only guard. The `is_safe_path` function rejects `..` component-by-component, which is correct — but the ordering and the None branch mean that a file with no active project loaded can be written to *any* path (as long as it contains no `..`). This allows writing to arbitrary absolute paths (e.g., `/tmp/malicious`, `/Users/foo/.ssh/authorized_keys`) when no project is active.

**Fix:** Reject the call outright when no active project is set, rather than silently skipping the containment check:
```rust
let project_root = {
    let guard = managed.0.lock().map_err(|e| e.to_string())?;
    guard.project.active.clone()
};

// Require an active project — do not allow writes without containment context
let root = project_root.ok_or_else(|| "No active project; cannot validate write path".to_string())?;

let full = Path::new(&path);
if !full.starts_with(&root) {
    return Err("Path is outside the active project directory".to_string());
}

if !is_safe_path(&path) {
    return Err("Invalid path: directory traversal not allowed".to_string());
}
```

---

### CR-02: Tauri Error String Injected via `innerHTML` Without Escaping

**File:** `src/components/diff-viewer.tsx:123`
**Issue:** When the `get_file_diff` invoke call fails, the error message is written directly into `innerHTML`:
```ts
el.innerHTML = `<div class="text-danger p-4">Error loading diff: ${escapeHtml(String(err))}</div>`;
```
The call to `escapeHtml(String(err))` *is* present — so the immediate risk is mitigated. However, the `escapeHtml` function only escapes `& < > "` and does not escape single-quote (`'`) or backtick characters. If a Tauri error string ever contains a `'` inside an event handler attribute (e.g., `onclick='...'`) the escaping is incomplete. More importantly, the broader pattern of writing Tauri-backend strings via `innerHTML` is fragile: any future code that uses this pattern without the escaping wrapper will be immediately exploitable. The `renderDiffHtml` function also sets `innerHTML` from diff content (line 121), which is correct because all content goes through `escapeHtml`, but the pattern should be audited.

**Fix:** Add `'` escaping to `escapeHtml`, or — preferably — use `textContent` for the error message:
```ts
// Option A: safe single-quote escape in escapeHtml
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Option B: avoid innerHTML for the error case entirely
const wrapper = document.createElement('div');
wrapper.className = 'text-danger p-4';
wrapper.textContent = `Error loading diff: ${String(err)}`;
el.replaceChildren(wrapper);
```

---

## Warnings

### WR-01: Module-Level Signals in `file-tree.tsx` Are Shared Across All Instances

**File:** `src/components/file-tree.tsx:22-26`
**Issue:** `entries`, `selectedIndex`, `currentPath`, and `loaded` are declared as module-level signals (outside the component function). This means all instances of `<FileTree />` share the same state. If the component is ever mounted more than once simultaneously (e.g., in a split-panel layout or during hot-reload), they would clobber each other's state. The same pattern exists in `preferences-panel.tsx` (line 15) and `sidebar.tsx` (lines 27-30), but those are singletons by design and documented as such. For `file-tree.tsx` this is a latent bug.

**Fix:** Move signals inside the component using `useSignal` (from `@preact/signals`) so each instance has isolated state:
```ts
import { useSignal } from '@preact/signals';

export function FileTree() {
  const entries = useSignal<FileEntry[]>([]);
  const selectedIndex = useSignal(0);
  const currentPath = useSignal('');
  const loaded = useSignal(false);
  // ...
}
```

---

### WR-02: `setTimeout` Used in `project-changed` Handler in `file-tree.tsx`

**File:** `src/components/file-tree.tsx:83-87`
**Issue:** The `project-changed` event handler uses `setTimeout(..., 50)` to delay the `loadDir` call. This is a timing hack that is inherently unreliable — on a slow machine or under load, 50ms may not be enough for state to settle, and on a fast machine it adds an unnecessary visual flash. The comment provides no rationale for the specific delay.

**Fix:** Remove the timeout. The `project-changed` CustomEvent is synchronous and the signal `activeProjectName` should already be updated before the event fires. If there is a specific race condition being papered over, document it and use a proper reactive approach:
```ts
function handleProjectChanged() {
  const project = getActiveProject();
  if (project && project.path) loadDir(project.path);
}
```

---

### WR-03: `initOsThemeListener` Reads State Synchronously Before `initTheme` Awaits

**File:** `src/theme/theme-manager.ts:189`
**Issue:** `initOsThemeListener()` (line 184) is called at the end of `initTheme()` (line 225). Inside it, `getCurrentState()?.theme?.mode` is checked to decide whether to apply OS preference on first launch. However, `initTheme` is an async function, and `getCurrentState()` returns cached in-memory state — if the state has not been loaded from Rust before `initTheme` is called, `currentMode` will be `undefined` and the OS preference will be applied unconditionally, potentially overriding a user-saved preference. There is no `await` before `initOsThemeListener` to ensure state is ready.

**Fix:** Ensure `getCurrentState()` is populated before `initOsThemeListener` is called, or pass the already-resolved `savedMode` into the function so it does not re-read state:
```ts
function initOsThemeListener(savedMode: 'dark' | 'light' | null): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (!savedMode) {
    setThemeMode(mq.matches ? 'dark' : 'light');
  }
  mq.addEventListener('change', (e: MediaQueryListEvent) => {
    if (!manualToggle) {
      setThemeMode(e.matches ? 'dark' : 'light');
    }
  });
}
```

---

### WR-04: Light-Mode Detection in `preferences-panel.tsx` Reads `classList` Not `data-theme`

**File:** `src/components/preferences-panel.tsx:49`
**Issue:** The theme toggle button's label is determined by:
```ts
const isDark = document.documentElement.classList.contains('dark');
```
However, `theme-manager.ts` uses `data-theme` attribute (`document.documentElement.setAttribute('data-theme', mode)`), not the `dark` CSS class, to manage light/dark mode. The `classList.contains('dark')` check will always return `false`, causing the button to always display "Light -- click to toggle" regardless of actual mode.

**Fix:** Read the `data-theme` attribute to match what `theme-manager.ts` actually sets:
```ts
const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
```

---

### WR-05: Regex Compiled on Every `write_checkbox` Call

**File:** `src-tauri/src/file_ops.rs:222`
**Issue:** `regex::Regex::new(...)` is called inside the `spawn_blocking` closure, meaning a new regex is compiled on every invocation of `write_checkbox`. While correctness is not affected, regex compilation is non-trivial work. More importantly, if `regex::Regex::new` returns an `Err` (only possible due to an invalid pattern — which won't happen here since the pattern is a literal), the error is swallowed into a user-visible string. The `regex` crate provides `lazy_static!` or `std::sync::OnceLock` for this purpose.

**Fix:** Use `OnceLock` or `once_cell::sync::Lazy` to compile once:
```rust
use std::sync::OnceLock;
static CHECKBOX_RE: OnceLock<regex::Regex> = OnceLock::new();

fn checkbox_regex() -> &'static regex::Regex {
    CHECKBOX_RE.get_or_init(|| {
        regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$").expect("valid checkbox regex")
    })
}

// Inside the closure:
if let Some(caps) = checkbox_regex().captures(target) { ... }
```

---

## Info

### IN-01: Missing `key` Props on Iterated Elements in `sidebar.tsx`

**File:** `src/components/sidebar.tsx:346-349, 389-391`
**Issue:** The `.map()` calls rendering `<ProjectRow>` and `<GitFileRow>` do not provide `key` props. In Preact/React, missing keys on lists cause unnecessary DOM re-renders and can cause subtle state bugs when the list order changes.

**Fix:** Add a stable unique key to each rendered element:
```tsx
projects.value.map((p, i) => (
  <ProjectRow key={p.name} project={p} index={i} />
))

gitFiles.value.map(f => (
  <GitFileRow key={f.path} file={f} />
))
```
The same applies to `CollapsedIcon` (line 309) and the `TabBar` button map in `tab-bar.tsx` (line 15).

---

### IN-02: `handleProjectAdded` in `sidebar.tsx` Does Not Refresh Git Status

**File:** `src/components/sidebar.tsx:274-281`
**Issue:** When a project is added, `handleProjectAdded` refreshes the project list but does not call `refreshAllGitStatus()`. The new project will appear in the sidebar with no git branch/status information until the next manual refresh or project switch.

**Fix:**
```ts
async function handleProjectAdded() {
  try {
    const updatedProjects = await getProjects();
    projects.value = updatedProjects;
    await refreshAllGitStatus(); // show git status for newly added project
  } catch (err) {
    console.warn('[efxmux] Failed to refresh projects after add:', err);
  }
}
```

---

### IN-03: `list_directory` Call in `project-modal.tsx` Omits `projectRoot` Parameter

**File:** `src/components/project-modal.tsx:106, 109`
**Issue:** The auto-detect GSD planning directory logic calls `list_directory` without the `projectRoot` parameter:
```ts
const entries = await invoke<...>('list_directory', { path: selected });
```
The Rust backend accepts `project_root: Option<String>` and skips containment validation when `None` is passed. Since `selected` comes from the OS directory picker (trusted), this is low risk. However, for consistency with the rest of the codebase and defense-in-depth, the call should pass `projectRoot: selected` to enable the same validation as all other invocations.

**Fix:**
```ts
const entries = await invoke<Array<{ name: string; is_dir: boolean }>>('list_directory', {
  path: selected,
  projectRoot: selected,
});
```

---

### IN-04: Commented-Out / Unused CSS Classes in `app.css`

**File:** `src/styles/app.css:285-286`
**Issue:** The `.diff-add` and `.diff-del` CSS classes (lines 285-286) define `border-left` styles, but `diff-viewer.tsx` now uses Tailwind utility classes (`border-l-3 border-success`, `border-l-3 border-danger`) instead of these class names. These rules are dead code.

**Fix:** Remove the unused rules to avoid confusion about which mechanism applies diff colors:
```css
/* Remove: */
.diff-add { border-left: 3px solid var(--color-success); }
.diff-del { border-left: 3px solid var(--color-danger); }
```

---

_Reviewed: 2026-04-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
