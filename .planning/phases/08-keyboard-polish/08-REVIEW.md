---
phase: 08-keyboard-polish
reviewed: 2026-04-10T09:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src-tauri/src/terminal/pty.rs
  - src-tauri/src/lib.rs
  - src/main.tsx
  - src/state-manager.ts
  - src/components/sidebar.tsx
  - src/components/terminal-tabs.tsx
  - src/components/preferences-panel.tsx
  - src/components/shortcut-cheatsheet.tsx
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 08 Gap Closure Plans (05-08): Code Review Report

**Reviewed:** 2026-04-10T09:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Plans 05-08 implement: pane-death monitoring thread for PTY exit detection, tab creation/switching/persistence, Cmd+W tab close, wizard/sidebar race fix, AppState project persistence, and a new Preferences panel overlay. The architectural choices are sound — the parallel monitoring thread approach for `remain-on-exit` PTY sessions is correct, `requestAnimationFrame` deferral for fit/focus is correct, and the single-authority first-run wizard pattern cleanly removes the sidebar race.

One critical bug was found: the TypeScript `AppState` interface declares `projects` as a top-level field, but the Rust backend serializes and reads projects nested inside the `project` sub-object. Every save path writes to the wrong JSON path and Rust silently ignores it — project data is lost on every restart despite the Plan 07 fix. Five warnings cover: orphaned monitoring threads on reconnect, a wrong tmux format variable in `cleanup_dead_sessions`, the active tab not being restored on restart, a session name collision risk on project switch, and a stale theme read in the Preferences panel. Four info items are minor quality improvements.

---

## Critical Issues

### CR-01: `projects` persisted at wrong JSON path — data silently lost on restart

**File:** `src/state-manager.ts:36,101,159`

**Issue:** The TypeScript `AppState` interface declares `projects` as a top-level field:

```typescript
// state-manager.ts lines 33-37
export interface AppState {
  session: Record<string, string>;
  project: { active: string | null };   // <-- no projects here
  panels: Record<string, string>;
  projects: ProjectEntry[];              // <-- top-level field added by Plan 07
}
```

Every save path writes to this top-level key:

```typescript
// saveAppState (line 101)
state.projects = projects.value;
// beforeunload (line 159)
currentState.projects = projects.value;
```

However, the Rust `AppState` struct has NO top-level `projects` field. Projects are nested inside `ProjectState` under the `project` key:

```rust
// state.rs
pub struct AppState {
    pub project: ProjectState,   // serializes as "project": { "active": "...", "projects": [...] }
}
pub struct ProjectState {
    pub active: Option<String>,
    pub projects: Vec<ProjectEntry>,
}
```

Serde ignores unknown fields by default, so the top-level `"projects"` key written by JS is silently discarded when Rust deserializes state.json. On the next load, `guard.project.projects` (used by `get_projects`) is empty — all projects are gone.

The Plan 07 guard `if (!currentState.projects) currentState.projects = []` (line 67) and the restore block (lines 88-90) also operate on the wrong path: `currentState.projects` is always undefined after a Rust load (because Rust serializes it as `project.projects`), so `projects.value` is never populated from state.json via the new code path.

This means the Plan 07 fix (T-08-07-02) does not actually work — projects still do not persist across restarts. The `get_projects` command reads from `guard.project.projects` (project.rs line 69), which is correctly populated by `add_project`/`remove_project` during the session, but state.json is written with the wrong shape so it is not restored on next launch.

**Fix:** Align the TypeScript interface with the actual Rust JSON shape. Remove the top-level `projects` field and nest it under `project`:

```typescript
// state-manager.ts -- AppState interface
export interface AppState {
  version: number;
  layout: Record<string, string | boolean>;
  theme: { mode: string };
  session: Record<string, string>;
  project: { active: string | null; projects: ProjectEntry[] };  // add projects here
  panels: Record<string, string>;
  // remove top-level projects field
}

// Default state in catch block:
project: { active: null, projects: [] },

// saveAppState and beforeunload -- write to project.projects:
state.project = { active: activeProjectName.value, projects: projects.value };

// loadAppState -- read from project.projects:
if (!currentState.project) currentState.project = { active: null, projects: [] };
if (!currentState.project.projects) currentState.project.projects = [];
if (currentState.project.projects.length) {
  projects.value = currentState.project.projects;
}
```

---

## Warnings

### WR-01: Monitoring thread not stored — orphaned on reconnect, no external stop path

**File:** `src-tauri/src/terminal/pty.rs:144-272`

**Issue:** The `stopped` `Arc<AtomicBool>` is created at line 144 and cloned into two threads (read loop and monitoring thread). After `spawn_terminal` returns at line 274, no owner retains a handle to `stopped`. The `PtyState` struct stores `writer`, `master`, `sent_bytes`, `acked_bytes`, and `slave` — but not `stopped`.

Two consequences:

1. **Orphaned thread on reconnect:** If `spawn_terminal` is called a second time with the same `session_name` (the frontend reconnects a tab after a crash overlay), a new monitoring thread is spawned. The old monitoring thread is still running (the old session name may still have a tmux entry briefly). Both threads will eventually emit `pty-exited` for overlapping sessions, causing duplicate events and double-kill attempts.

2. **No clean shutdown path:** There is no way to stop the monitoring thread from outside (e.g., a future `close_session` command) because `stopped` is not accessible after the function returns.

**Fix:** Store `stopped` in `PtyState`:

```rust
pub struct PtyState {
    // existing fields...
    pub stopped: Arc<AtomicBool>,
}
```

In `spawn_terminal`, before inserting the new state, check for an existing entry and signal its `stopped` flag to stop the old monitoring thread:

```rust
{
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = map.get(&sanitized) {
        old.stopped.store(true, Ordering::Relaxed);
    }
    map.insert(sanitized.clone(), state);
}
```

---

### WR-02: `cleanup_dead_sessions` uses `#{pane_dead}` in `list-sessions` — wrong scope

**File:** `src-tauri/src/terminal/pty.rs:417`

**Issue:**

```rust
.args(["list-sessions", "-F", "#{session_name}:#{pane_dead}"])
```

`#{pane_dead}` is a **pane-level** format variable. In `list-sessions` context, tmux expands pane format variables for the **current pane** of the **current window** of each session. A session that has the dead pane in any window other than the first window, or any pane other than the first pane, will report `pane_dead=0` from this command even though a dead pane exists in the session. Such sessions will not be cleaned up.

The monitoring thread correctly uses `display-message -t <session>` (line 222) which targets the specific pane — but `cleanup_dead_sessions` uses the wrong query.

**Fix:** Use `list-panes -a` which enumerates all panes across all sessions:

```rust
.args(["list-panes", "-a", "-F", "#{session_name}:#{pane_dead}"])
```

Since a session may appear multiple times (once per pane), deduplicate killed session names before pushing to `cleaned`.

---

### WR-03: `restoreTabs` always activates first tab — active tab index never restored

**File:** `src/components/terminal-tabs.tsx:498-502`

**Issue:** After restoring tabs, the code always activates the first tab:

```typescript
// Activate the saved active tab (or first if saved ID no longer maps)
// Since we generate new IDs, activate by index -- savedData.activeTabId won't match
// Default to first tab
activeTabId.value = restoredTabs[0].id;
switchToTab(restoredTabs[0].id);
```

The comment acknowledges that `savedData.activeTabId` (the old ephemeral ID) will not match the new IDs, but there is no attempt to derive the index from the saved ID. The old ID format is `tab-<timestamp>-<tabCounter>` — while timestamp matching is impossible, the array index can be derived by matching the saved ID against the **original saved tab array order**, since `persistTabState` writes the tabs in order and `activeTabId` uniquely identifies which one was active.

**Fix:** Persist and restore by index rather than ID:

```typescript
// In persistTabState():
const activeIndex = terminalTabs.value.findIndex(t => t.id === activeTabId.value);
updateSession({ 'terminal-tabs': JSON.stringify({ tabs, activeIndex }) });

// In restoreTabs() signature:
savedData: { tabs: Array<{ sessionName: string; label: string }>; activeIndex?: number }

// Activation:
const targetIdx = Math.min(savedData.activeIndex ?? 0, restoredTabs.length - 1);
activeTabId.value = restoredTabs[targetIdx].id;
switchToTab(restoredTabs[targetIdx].id);
```

---

### WR-04: Session name collision risk on project switch when `tabCounter` resets

**File:** `src/components/terminal-tabs.tsx:103-105` and `src/main.tsx:331`

**Issue:** `clearAllTabs()` resets `tabCounter = 0` on project switch (terminal-tabs.tsx line 424). When the new project's first tab is created via `initFirstTab`, it uses `sessionName` passed from `main.tsx` — which derives the session name as `projectSessionName(newProjectName)` (no suffix, since it's the first tab). This is correct.

However, if the user then creates additional tabs (Ctrl+T) and later switches projects again, the counter resets to 0 again. The first Ctrl+T tab in the new project gets suffix `undefined` (counter=1, isFirstTab=false: line 104 `tabCounter > 1 ? String(tabCounter) : undefined`). The second Ctrl+T gets suffix `"2"`. These match existing tmux session names if the same project was used before.

More critically: `tabCounter` is module-global and is incremented by both `initFirstTab` and `createNewTab`. After `clearAllTabs` resets it to 0, `initFirstTab` increments it to 1 (line 257). A subsequent `createNewTab` call increments to 2 and generates suffix `"2"` (line 104: `tabCounter > 1` is true). But if a prior session `projectname-2` still exists in tmux (not dead, just detached), `spawn_terminal` will call `tmux new-session -A -s projectname-2` which **attaches to the existing session** (`-A` flag). The user gets the old session's state, not a fresh shell — silent reattachment to stale state.

**Fix:** Either use unique timestamp-based suffixes (immune to counter reset), or explicitly kill the target session before creating a new one in `createNewTab`.

---

### WR-05: `isDark` theme check in `PreferencesPanel` reads DOM at render time — stale during theme transitions

**File:** `src/components/preferences-panel.tsx:49`

**Issue:**

```typescript
const isDark = document.documentElement.classList.contains('dark');
```

This is evaluated synchronously inside the component function body (not inside a signal subscription or `useEffect`). If the user presses the theme toggle button inside the panel, `toggleThemeMode()` updates the DOM class and the signal — but because `isDark` is not reactive, the button label (`"Dark -- click to toggle"` vs `"Light -- click to toggle"`) does not update. The user sees the old label until they close and reopen the panel.

**Fix:** Read the theme mode from a reactive source. If `theme-manager.ts` exports a signal for the current mode (e.g., `themeMode: Signal<'dark' | 'light'>`), use it:

```typescript
import { themeMode } from '../theme/theme-manager';
// ...
const isDark = themeMode.value === 'dark';
```

If no signal is exported from theme-manager, add one and update `toggleThemeMode` to write it. This ensures the preferences panel re-renders immediately when theme changes.

---

## Info

### IN-01: Monitoring thread initial 1-second delay could be reduced

**File:** `src-tauri/src/terminal/pty.rs:200`

**Issue:** `std::thread::sleep(std::time::Duration::from_secs(1))` unconditionally delays the first pane-death poll by 1 second after every session start. For sessions where the initial command exits immediately (bad shell path, permission error), this adds a minimum 1-second delay before the crash overlay appears.

**Fix:** Reduce to 200-300ms. The monitoring loop polls every 500ms anyway, so the initial delay only needs to be long enough for `tmux new-session` to complete and register the pane.

---

### IN-02: `Ctrl+W` cheatsheet entry missing `Cmd+W` for macOS

**File:** `src/components/shortcut-cheatsheet.tsx:32`

**Issue:** The cheatsheet shows `Ctrl+W` for "Close active tab", but Plan 07 added `Cmd+W` support (the macOS convention). The keyboard handler accepts either modifier (line 135 of main.tsx: `e.ctrlKey || e.metaKey`), but the cheatsheet only documents `Ctrl+W`. macOS users who read the cheatsheet may not discover `Cmd+W`.

**Fix:** Update to `'Ctrl+W / Cmd+W'` to match the documented cross-platform support.

---

### IN-03: Orphaned `stopped` flag reference is not surfaced to `PtyManager` — related to WR-01

**File:** `src-tauri/src/terminal/pty.rs:144`

**Issue:** The `stopped` `Arc<AtomicBool>` is declared but its absence from `PtyState` means that when `manager.0.lock()` is used in other commands (`write_pty`, `resize_pty`, `ack_bytes`), there is no way for those commands to check whether the session has been stopped. A caller could still successfully call `write_pty` on a session whose monitoring thread has set `stopped=true` (and whose read loop has exited), writing data into a PTY master that no longer has a read consumer — data is silently discarded. This is a minor operational issue (no crash, just lost keystrokes after death) but would be fixed naturally by WR-01.

No standalone fix needed — addressed by WR-01.

---

### IN-04: `lib.rs` comments at lines 135 and 156 appear to use single-slash (`/`) instead of double-slash (`//`)

**File:** `src-tauri/src/lib.rs:135,156`

**Issue:** The file as read shows:

```
                / Kill ALL server processes on close (07-06: per-project HashMap, T-07-10)
```

and

```
                    / Both ExitRequested and Exit are handled to cover all exit paths:
```

A bare `/` token in Rust expression context would be a division operator and would fail to compile. These are most likely `//` comments that were truncated in the read output. If the source file genuinely has single-slash lines, the code will not compile.

**Fix:** Verify the source file. If single-slash, add the missing `/` to both lines.

---

_Reviewed: 2026-04-10T09:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
