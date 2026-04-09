---
phase: 08-keyboard-polish
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src-tauri/src/terminal/pty.rs
  - src/components/crash-overlay.tsx
  - src/components/first-run-wizard.tsx
  - src/components/main-panel.tsx
  - src/components/terminal-tabs.tsx
  - src/main.tsx
  - src/components/shortcut-cheatsheet.tsx
  - src/terminal/terminal-manager.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The Phase 08 changes cover keyboard polish, multi-tab terminal management, PTY session lifecycle, a first-run wizard, crash overlay, and the shortcut cheatsheet. The overall architecture is sound. The PTY command injection mitigation is present and correct. The tab management logic is coherent and the flow control system is well structured.

One critical issue was found: a shell injection vulnerability in `pty.rs` where a user-controlled `shell_command` argument is interpolated into a shell string without escaping single quotes. Five warnings cover logic bugs (duplicate `projectSessionName` function, tab state mutation without signal update, missing `await` on async calls, and a `useEffect` dependency tracking gap). Four info items flag dead code and naming consistency.

## Critical Issues

### CR-01: Shell command injection via unescaped single quotes in shell wrapper

**File:** `src-tauri/src/terminal/pty.rs:93`
**Issue:** `shell_command` is user-supplied and is interpolated directly into a single-quoted shell string:
```rust
let wrapped = format!("{} -c '{}; exec {}'", user_shell, shell_cmd, user_shell);
```
A `shell_command` value containing a single quote (e.g., `claude'; rm -rf ~; echo '`) breaks out of the single-quote context and allows arbitrary command execution in the spawned shell. The same pattern is repeated at line 318 in `switch_tmux_session`. While `session_name` is sanitized (lines 61-67), `shell_command` receives no sanitization before this format call.

**Fix:**
Escape single quotes in `shell_cmd` before interpolation, or use `CommandBuilder` args to avoid shell interpolation entirely:
```rust
// Option A: escape single quotes
let escaped_cmd = shell_cmd.replace('\'', "'\\''");
let wrapped = format!("{} -c '{}; exec {}'", user_shell, escaped_cmd, user_shell);

// Option B (preferred): avoid shell wrapping — pass as separate args to CommandBuilder
// cmd.args(["new-session", "-A", "-s", &sanitized, user_shell, "-c",
//           &format!("{}; exec {}", shell_cmd, user_shell)]);
// This delegates quoting to execvp rather than a shell parser.
```
Apply the same fix at line 318 in `switch_tmux_session`.

---

## Warnings

### WR-01: Duplicate `projectSessionName` function — logic divergence risk

**File:** `src/main.tsx:36` and `src/components/terminal-tabs.tsx:50`
**Issue:** `projectSessionName` is defined identically in both modules. The two definitions are currently identical, but a future change to one will silently diverge from the other, producing session names that do not match between the bootstrap path (main.tsx) and the tab-creation path (terminal-tabs.tsx). This is already a latent bug: `main.tsx` uses `projectSessionName(activeName)` at line 199, then stores the result in `mainPtyKey`, while `terminal-tabs.tsx` independently derives session names for subsequent tabs. If one copy is changed, PTY writes (`write_pty`) will target a session name that no longer matches the one the read loop registered.

**Fix:** Export `projectSessionName` from `terminal-tabs.tsx` (or a shared `session-utils.ts` module) and remove the copy in `main.tsx`. Import it where needed.

---

### WR-02: `restartTabSession` mutates tab object fields without triggering a proper signal update

**File:** `src/components/terminal-tabs.tsx:357-406`
**Issue:** `restartTabSession` modifies properties on the `tab` object directly (lines 368, 371, 398-401) before re-assigning the array via `terminalTabs.value = [...tabs]` at line 403. Because `tabs` is captured from `terminalTabs.value` at line 358 and the tab is found by reference at line 360, the mutations at lines 398-401 (`tab.terminal`, `tab.fitAddon`, `tab.sessionName`) happen before the signal array is replaced. This works today because the tab object is a reference shared between the old and new arrays, but `tab.exitCode = undefined` at line 368 — the mutation that clears the crash overlay — is performed on the live object before `terminalTabs.value` is reassigned. If Preact's signal equality check short-circuits on the array reference, the crash overlay may not re-render until the next unrelated signal update.

**Fix:** Build a new tab object rather than mutating the existing one, then replace it atomically:
```typescript
const updatedTab: TerminalTab = {
  ...tab,
  terminal,
  fitAddon,
  sessionName: newSessionName,
  ptyConnected,
  disconnectPty: conn?.disconnect,
  detachResize: resizeHandle.detach,
  exitCode: undefined,
};
terminalTabs.value = tabs.map(t => t.id === tabId ? updatedTab : t);
```

---

### WR-03: `createNewTab()` called without `await` on new-tab button click

**File:** `src/components/terminal-tabs.tsx:479`
**Issue:** The new tab button's `onClick` calls `createNewTab()` without `await`:
```tsx
onClick={() => createNewTab()}
```
`createNewTab` is `async` and performs PTY connection and DOM mutation. Unhandled promise rejections from this call are silently swallowed. Any error (e.g. PTY spawn failure) will not be surfaced. The same pattern exists in the keyboard handler in `main.tsx` at line 130 (`createNewTab()`) and `closeActiveTab()` at line 133 — both `async` functions called without `await` inside a synchronous event listener.

**Fix:** For the onClick handler, wrap in an explicit handler that logs errors:
```tsx
onClick={() => { createNewTab().catch(err => console.error('[efxmux] createNewTab failed:', err)); }}
```
For the keyboard handler in main.tsx (lines 130, 133), same pattern or add a top-level `.catch` on the returned promise.

---

### WR-04: `useEffect` in `FirstRunWizard` has an empty dependency array but reads signal values indirectly via `handlePrimary`

**File:** `src/components/first-run-wizard.tsx:286-299`
**Issue:** The `useEffect` registers a `keydown` handler that calls `handlePrimary()` on Enter. `handlePrimary` reads `step.value` (line 122) to decide whether to advance or call `finishWizard`. Because `step` is a Preact signal and `handlePrimary` closes over it by reference, the handler always reads the current signal value — so this is actually safe for signals. However, the `useEffect` dependency array is `[]` (line 300), meaning it only registers once on mount. If the component is unmounted and remounted (e.g., by the parent toggling visibility), the old listener is removed and a new one is added, which is correct. But `visible.value` is the gate (line 283: `if (!visible.value) return null`), meaning the component only mounts when visible — the effect fires every mount. This is fine as written, but the empty dep array combined with a signal-reading closure is a pattern that can confuse future maintainers into thinking the handler captures a stale value. This is a borderline warning — document the signal-read-by-reference behaviour with a comment.

**Fix:** Add a comment clarifying the pattern:
```typescript
useEffect(() => {
  // handlePrimary reads step.value via signal reference — always current, no stale closure risk
  function handleKeydown(e: KeyboardEvent) { ... }
  ...
}, []); // [] is correct: signal values are accessed by .value at call time, not captured
```

---

### WR-05: `switch_tmux_session` ignores `new-session` command failure

**File:** `src-tauri/src/terminal/pty.rs:322-326`
**Issue:** When creating a new tmux session in `switch_tmux_session` (the `needs_create` branch), the `new-session` command's output is fetched but success is not checked:
```rust
std::process::Command::new("tmux")
    .args(&args)
    .output()
    .map_err(|e| e.to_string())?;
```
`map_err(|e| e.to_string())?` only propagates OS-level errors (e.g. tmux binary not found). If tmux runs but returns a non-zero exit code (e.g. session name conflict, invalid `-c` directory), the error is silently ignored and the subsequent `switch-client` call will attempt to switch to a session that may not have been created.

**Fix:**
```rust
let out = std::process::Command::new("tmux")
    .args(&args)
    .output()
    .map_err(|e| e.to_string())?;
if !out.status.success() {
    let stderr = String::from_utf8_lossy(&out.stderr);
    return Err(format!("tmux new-session failed: {}", stderr.trim()));
}
```

---

## Info

### IN-01: `TERMINAL_PASSTHROUGH` set is duplicated in two files

**File:** `src/main.tsx:103` and `src/components/shortcut-cheatsheet.tsx:25`
**Issue:** The same `TERMINAL_PASSTHROUGH` set (`c`, `d`, `z`, `l`, `r`) is defined as a `const` in both files. They are currently identical. Divergence here would cause the cheatsheet to close on keys it shouldn't (or vice versa).

**Fix:** Export from a shared constants module (e.g. `src/terminal/keyboard-constants.ts`) and import in both files.

---

### IN-02: Commented-out code in `main.tsx`

**File:** `src/main.tsx:44-46`
**Issue:** Module-level variables `mainPtyKey`, `mainCurrentSession`, and `rightCurrentSession` are declared but `mainPtyKey` is only written (line 201, 309) and never read after assignment. The comment `*PtyKey = original PTY spawn session (for write_pty)` suggests it was used in a prior architecture. If it is no longer read anywhere, it is dead code.

**Fix:** Verify whether `mainPtyKey` is consumed elsewhere (e.g. by write_pty calls). If not, remove it. If it is intentionally kept for future use, add a `// TODO:` comment explaining why it is retained.

---

### IN-03: Magic number `300ms` sleep in PTY exit detection lacks documentation link

**File:** `src-tauri/src/terminal/pty.rs:185`
**Issue:** `std::thread::sleep(std::time::Duration::from_millis(300))` is annotated with "Brief delay for tmux to register pane death (Pitfall 3)" but does not document what happens if 300ms is insufficient (e.g. under load). The constant is not named.

**Fix:** Extract to a named constant:
```rust
/// Delay after PTY EOF before querying tmux pane status.
/// 300ms chosen empirically; tmux pane_dead_status may not be set immediately.
const PTY_EXIT_PROBE_DELAY_MS: u64 = 300;
// ...
std::thread::sleep(std::time::Duration::from_millis(PTY_EXIT_PROBE_DELAY_MS));
```

---

### IN-04: `Cmd+K` listed in cheatsheet but implemented in `terminal-manager.ts`, not in the app keyboard handler

**File:** `src/components/shortcut-cheatsheet.tsx:42` and `src/terminal/terminal-manager.ts:48`
**Issue:** The cheatsheet lists `Cmd+K` as "Clear terminal" under the App section, which is accurate — it is handled by `attachCustomKeyEventHandler` in `terminal-manager.ts`. However, `Cmd+K` is not blocked in the app-level keyboard handler in `main.tsx`, meaning if focus is outside the terminal the shortcut may have no effect. This is a documentation accuracy issue rather than a bug, but it could confuse users who try `Cmd+K` when the terminal is not focused.

**Fix:** Document in the cheatsheet entry that `Cmd+K` requires terminal focus, or extend the keyboard handler in `main.tsx` to focus the active terminal and then fire the clear command when `Cmd+K` is pressed at app level.

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
