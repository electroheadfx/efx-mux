---
phase: 07-server-pane-agent-support
reviewed: 2026-04-09T14:32:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - package.json
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/server.rs
  - src-tauri/src/state.rs
  - src-tauri/src/terminal/pty.rs
  - src/components/main-panel.tsx
  - src/components/server-pane.tsx
  - src/drag-manager.ts
  - src/main.tsx
  - src/server/ansi-html.ts
  - src/server/server-bridge.ts
  - src/state-manager.ts
  - src/styles/app.css
  - src/terminal/pty-bridge.ts
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-09T14:32:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed all 15 source files for Phase 7 (Server Pane + Agent Support). Two critical issues found: (1) shell command injection via unescaped single quotes in `pty.rs` shell wrapping, and (2) PID recycling race in `server.rs` where the SIGKILL fallback thread fires after the Child handle is dropped. Six warnings cover render-time signal mutation, stale auto-scroll DOM measurements, duplicate drag listeners, unmatched ANSI bare reset sequences, stop/crash race condition, and the same shell injection pattern in `switch_tmux_session`. XSS mitigations in `ansi-html.ts` are correctly implemented (HTML-escape before ANSI processing). The process group approach, flow control, and 3-state collapse design are well-executed.

---

## Critical Issues

### CR-01: Shell command injection via unescaped single quotes in PTY shell wrapping

**File:** `src-tauri/src/terminal/pty.rs:93`
**Issue:** The `shell_command` parameter is interpolated into a single-quoted shell string without escaping:
```rust
let wrapped = format!("{} -c '{}; exec {}'", user_shell, shell_cmd, user_shell);
```
If `shell_cmd` contains a single quote (e.g., a project configured with `echo 'hello'` or a maliciously crafted command), it breaks out of the single-quoted context. The same pattern exists in `switch_tmux_session` at line 261. While the command comes from persisted project config (not direct user input from a text field), a tampered `state.json` or a project name containing shell metacharacters could exploit this.
**Fix:** Escape single quotes in shell_cmd before interpolation using the standard shell escaping pattern (`'` becomes `'\''`):
```rust
fn shell_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}
// Then:
let wrapped = format!("{} -c '{}; exec {}'", user_shell, shell_escape(shell_cmd), user_shell);
```
Apply the same fix at line 261 in `switch_tmux_session`.

### CR-02: PID recycling race in stop_server_inner SIGKILL fallback

**File:** `src-tauri/src/server.rs:173-192`
**Issue:** `stop_server_inner` sends SIGTERM, spawns a thread to send SIGKILL after 3 seconds, then immediately sets `*guard = None` which drops the `Child` handle. After the `Child` is dropped, the PID can be recycled by the OS. The SIGKILL fallback thread (lines 183-188) sleeps 3 seconds then calls `killpg(pid, SIGKILL)` -- if the PID has been recycled in that window, this kills an unrelated process group. This is especially dangerous on restart, where `start_server` is called immediately after `stop_server_inner`, and the new child process could receive a nearby PID.
**Fix:** Keep the `Child` handle alive until confirmed dead, then reap it:
```rust
fn stop_server_inner(app: &AppHandle) -> Result<(), String> {
    let sp = app.state::<ServerProcess>();
    let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        let pid = child.id() as i32;
        unsafe { libc::killpg(pid, libc::SIGTERM); }
        let mut owned_child = guard.take().unwrap();
        drop(guard); // release mutex
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            match owned_child.try_wait() {
                Ok(Some(_)) => {} // already exited
                _ => {
                    unsafe { libc::killpg(pid, libc::SIGKILL); }
                    let _ = owned_child.wait(); // reap zombie
                }
            }
        });
        return Ok(());
    }
    *guard = None;
    Ok(())
}
```

---

## Warnings

### WR-01: Signal mutation during render body can cause re-render loop

**File:** `src/components/server-pane.tsx:70-75`
**Issue:** The `ServerPane` component mutates the `serverStatus` signal directly in the render function body (not inside `useEffect`). When the signal value changes, Preact re-renders the component, which re-evaluates the same condition. The guard conditions prevent infinite loops currently, but this is a fragile pattern -- if a future change alters the guard logic, an infinite loop results.
**Fix:** Move status synchronization into a `useEffect`:
```tsx
useEffect(() => {
  const isUnconfigured = !project?.server_cmd;
  if (isUnconfigured && serverStatus.value !== 'unconfigured' && serverStatus.value !== 'running') {
    serverStatus.value = 'unconfigured';
  } else if (!isUnconfigured && serverStatus.value === 'unconfigured') {
    serverStatus.value = 'stopped';
  }
}, [project?.server_cmd]);
```

### WR-02: Auto-scroll reads scroll position before DOM update

**File:** `src/components/server-pane.tsx:94-101`
**Issue:** The auto-scroll `useEffect` fires when `serverLogs.value` changes but reads `scrollHeight` before the browser has painted the new `dangerouslySetInnerHTML` content. The `isNearBottom` check measures stale dimensions, causing auto-scroll to fail intermittently when the user is exactly at the bottom.
**Fix:** Defer the measurement to the next animation frame:
```tsx
useEffect(() => {
  const el = logRef.current;
  if (!el) return;
  requestAnimationFrame(() => {
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  });
}, [serverLogs.value]);
```

### WR-03: Duplicate drag listeners from repeated initDragManager calls

**File:** `src/drag-manager.ts:27-62`
**Issue:** Each server pane expansion triggers `requestAnimationFrame(() => initDragManager())` (in `main.tsx:134` and `server-pane.tsx:209`). The `main-h` handle has a `dataset.dragInit` guard (line 66), but the `sidebar-main`, `main-right`, and `right-h` handles do not. Each call adds additional `mousedown` listeners. After N expand/collapse cycles, dragging the sidebar handle fires N callbacks simultaneously, causing erratic panel resizing.
**Fix:** Add the same guard to all handles:
```ts
if (sidebarHandle && !sidebarHandle.dataset.dragInit) {
  sidebarHandle.dataset.dragInit = 'true';
  makeDragV(sidebarHandle, { ... });
}
// Same pattern for mainRightHandle and rightHHandle
```

### WR-04: ANSI bare reset `\x1b[m` not matched, causes unclosed spans

**File:** `src/server/ansi-html.ts:59`
**Issue:** The regex `\x1b\[(\d+(?:;\d+)*)m` requires at least one digit. The common ANSI reset `\x1b[m` (no digits, equivalent to `\x1b[0m`) won't match. It falls through to the strip-remaining regex on line 129 and is silently removed, but any open `<span>` tags from prior color codes remain unclosed. This causes style bleed across log lines.
**Fix:** Make the digit group optional:
```ts
escaped = escaped.replace(/\x1b\[(\d+(?:;\d+)*)?m/g, (_match, codes: string | undefined) => {
  if (!codes) {
    // Bare \x1b[m = reset
    const result = '</span>'.repeat(openSpans);
    openSpans = 0;
    return result;
  }
  // ... existing logic unchanged
});
```

### WR-05: Shell injection in switch_tmux_session (same as CR-01)

**File:** `src-tauri/src/terminal/pty.rs:261`
**Issue:** Same unescaped single-quote interpolation as CR-01:
```rust
shell_cmd_str = format!("{} -c '{}; exec {}'", user_shell, cmd, user_shell);
```
**Fix:** Apply the same `shell_escape()` function from CR-01 fix.

### WR-06: Intentional stop can trigger crash banner due to event race

**File:** `src-tauri/src/server.rs:82-95` and `src/components/server-pane.tsx:125-147`
**Issue:** When `stop_server_inner` kills the server, the reader threads' `waitpid` returns with SIGTERM's exit status. The frontend checks `if (exitCode >= 0 && serverStatus.value === 'running')` but `handleStop` sets status to `'stopped'` asynchronously. If the `server-stopped` event arrives before the JS status update processes, the crash banner appears for an intentional stop. The SIGTERM (143) and SIGKILL (137) guards on lines 130-135 mitigate most cases but rely on the exit code being signal-based, which is not guaranteed for all process group scenarios.
**Fix:** Have `stop_server_inner` emit a sentinel value before killing, or set an `AtomicBool` flag to suppress the stopped event after intentional stops.

---

## Info

### IN-01: `dangerouslySetInnerHTML` unnecessary for escaped text in main-panel.tsx

**File:** `src/components/main-panel.tsx:79-81`
**Issue:** `fileContent.value` is HTML-escaped via `escapeHtml()` then rendered via `dangerouslySetInnerHTML`. Since the content is fully escaped, it renders as literal text. A simpler and safer pattern is `<pre class="...">{fileContent.value}</pre>`, eliminating the risk of a future developer removing the `escapeHtml` call.
**Fix:** Replace with `<pre class="...">{fileContent.value}</pre>`.

### IN-02: stdout and stderr share same event channel

**File:** `src-tauri/src/server.rs:65-132`
**Issue:** Both stdout and stderr reader threads emit `"server-output"` with no way to distinguish the source. This is fine for the current log viewer but limits future features like coloring stderr lines red. Consider adding a structured payload `{ source: "stdout"|"stderr", text: "..." }` if differentiation is needed later.

### IN-03: `config_dir()` panics if HOME is unset

**File:** `src-tauri/src/state.rs:206-209`
**Issue:** The `.expect(...)` on line 209 panics the entire Tauri process if `HOME` is unset or empty. While extremely rare on macOS desktop, this can occur in sandboxed or CI environments. Consider using `dirs::home_dir()` or returning a `Result` instead.

### IN-04: Magic string array for server pane state validation

**File:** `src/main.tsx:143`
**Issue:** The inline array `['strip', 'expanded', 'collapsed']` duplicates the type definition from `server-pane.tsx`. If a new state is added, both locations must be updated independently.
**Fix:** Export a const array and derive the type:
```ts
export const SERVER_PANE_STATES = ['strip', 'expanded', 'collapsed'] as const;
export type ServerPaneState = typeof SERVER_PANE_STATES[number];
```

---

_Reviewed: 2026-04-09T14:32:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
