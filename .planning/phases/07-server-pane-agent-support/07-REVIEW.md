---
phase: 07-server-pane-agent-support
reviewed: 2026-04-08T22:56:48Z
depth: standard
files_reviewed: 13
files_reviewed_list:
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
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-08T22:56:48Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed all 13 source files for Phase 7 (Server Pane + Agent Support). The Rust backend (`server.rs`) has a critical race condition where the `Child` handle is dropped and the PID can be recycled before the 3-second SIGKILL fallback thread fires, potentially killing an unrelated process. The frontend has several logic bugs: render-time signal mutations in `server-pane.tsx`, stale auto-scroll measurements, and duplicate drag listeners from repeated `initDragManager` calls. XSS mitigations in `ansi-html.ts` are correctly implemented (HTML-escape before ANSI processing). The ANSI parser has a minor gap with bare reset sequences. Overall architecture is solid -- the process group approach, flow control, and 3-state collapse design are well-executed.

---

## Critical Issues

### CR-01: PID recycling race in stop_server_inner SIGKILL fallback

**File:** `src-tauri/src/server.rs:143-162`
**Issue:** `stop_server_inner` sends SIGTERM, spawns a thread to send SIGKILL after 3 seconds, then immediately sets `*guard = None` which drops the `Child` handle. After the `Child` is dropped, the PID can be recycled by the OS. The SIGKILL fallback thread (lines 153-158) sleeps 3 seconds then calls `killpg(pid, SIGKILL)` -- if the PID has been recycled in that window, this kills an unrelated process group. This is especially dangerous on restart, where `start_server` is called immediately after `stop_server_inner`, and the new child process could receive the same or nearby PID.

Additionally, the waiter thread from `start_server` (lines 88-102) calls `libc::waitpid(pid)` concurrently. Since the `Child` was dropped (not waited on), the waiter thread and the OS reaper can race, though on Unix Rust's `Child::drop` does not call `waitpid`, so the zombie persists until the waiter thread reaps it.
**Fix:** Do not drop the `Child` immediately. Keep it alive until confirmed dead, or at minimum check PID liveness before sending SIGKILL:
```rust
fn stop_server_inner(app: &AppHandle) -> Result<(), String> {
    let sp = app.state::<ServerProcess>();
    let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        let pid = child.id() as i32;
        unsafe { libc::killpg(pid, libc::SIGTERM); }
        // Take ownership so Child stays alive (PID not recycled)
        let mut owned_child = guard.take().unwrap();
        drop(guard); // release mutex
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            match owned_child.try_wait() {
                Ok(Some(_)) => {} // already exited, PID safe
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

**File:** `src/components/server-pane.tsx:53-57`
**Issue:** The `ServerPane` component mutates the `serverStatus` signal directly in the render function body (not inside `useEffect`). When the signal value changes, Preact re-renders the component, which re-evaluates the same condition. The guard conditions (`!== 'running'`, `=== 'unconfigured'`) prevent infinite loops in most cases, but this is a fragile pattern -- if a future change alters the guard logic, an infinite loop results.
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

**File:** `src/components/server-pane.tsx:76-84`
**Issue:** The auto-scroll `useEffect` fires when `serverLogs.value` changes but reads `scrollHeight` before the DOM has been updated with the new `dangerouslySetInnerHTML` content (the DOM update from the render cycle hasn't flushed yet when `useEffect` runs). This makes the `isNearBottom` check measure stale dimensions, causing auto-scroll to fail intermittently -- especially when the user is exactly at the bottom and a new line is added.
**Fix:** Defer the measurement to the next frame:
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

**File:** `src/drag-manager.ts:27-62` and `src/main.tsx:136-138`
**Issue:** Each `Ctrl+\`` server pane expansion calls `requestAnimationFrame(() => initDragManager())`. The `main-h` handle has a `dataset.dragInit` guard (line 66), but the `sidebar-main`, `main-right`, and `right-h` handles do not. Each call adds additional `mousedown` listeners. After N expand/collapse cycles, dragging the sidebar handle fires N callbacks simultaneously, causing erratic panel resizing.
**Fix:** Add the same guard to all handles:
```ts
if (sidebarHandle && !sidebarHandle.dataset.dragInit) {
  sidebarHandle.dataset.dragInit = 'true';
  makeDragV(sidebarHandle, { ... });
}
// Same pattern for mainRightHandle and rightHHandle
```

### WR-04: ANSI reset `\x1b[m` (no digit) not matched, causes unclosed spans

**File:** `src/server/ansi-html.ts:25`
**Issue:** The regex `\x1b\[(\d+(?:;\d+)*)m` requires at least one digit. The common ANSI reset `\x1b[m` (equivalent to `\x1b[0m`) has no digits and won't match. It falls through to the strip-remaining regex on line 54 and is silently removed, but any open `<span>` tags from prior color codes are not closed. This causes style bleed across log lines -- a colored message followed by a bare reset will color all subsequent text until a `\x1b[0m` (with explicit 0) appears.
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

### WR-05: Intentional stop triggers crash banner due to waitpid/stop race

**File:** `src-tauri/src/server.rs:88-102` and `src/components/server-pane.tsx:104-109`
**Issue:** When `stop_server_inner` kills the server, the waiter thread's `waitpid` eventually returns with SIGTERM's exit status (typically 143 or signal-based code). The frontend filter `if (exitCode >= 0 && serverStatus.value === 'running')` will match because `handleStop` sets status to `'stopped'` before the async `stopServer()` completes, but the `listenServerStopped` callback was registered before -- so timing-dependent: if the waiter thread fires before JS processes the status change, the crash banner appears for an intentional stop.
**Fix:** Emit a sentinel `-1` from `stop_server_inner` before killing the process, or set an `AtomicBool` flag so the waiter thread suppresses its event after an intentional stop:
```rust
// In stop_server_inner, before SIGTERM:
let _ = app.emit("server-stopped", -1i32);
```

---

## Info

### IN-01: `dangerouslySetInnerHTML` unnecessary for escaped text in main-panel.tsx

**File:** `src/components/main-panel.tsx:79-81`
**Issue:** `fileContent.value` is HTML-escaped via `escapeHtml()` then rendered via `dangerouslySetInnerHTML`. Since the content is fully escaped, it renders as literal text. A simpler and safer pattern is to use Preact text children directly: `<pre ...>{fileContent.value}</pre>`. This eliminates the risk of a future developer removing the `escapeHtml` call while `dangerouslySetInnerHTML` remains.
**Fix:** Replace with `<pre class="...">{fileContent.value}</pre>`.

### IN-02: stdout and stderr share same event channel

**File:** `src-tauri/src/server.rs:57-83`
**Issue:** Both stdout and stderr reader threads emit `"server-output"`. The frontend cannot distinguish error output from normal output. This is fine for the current log viewer but limits future features like coloring stderr lines red. Document as a known limitation.

### IN-03: `config_dir()` panics if HOME is unset

**File:** `src-tauri/src/state.rs:206-211`
**Issue:** The `.expect(...)` on line 209 panics the entire Tauri process if `HOME` is unset or empty. While extremely rare on macOS, this can occur in sandboxed or CI environments. Consider using `dirs::home_dir()` or returning a `Result` instead of panicking.

### IN-04: Magic string array for server pane state validation

**File:** `src/main.tsx:143-147`
**Issue:** The inline array `['strip', 'expanded', 'collapsed']` duplicates the type definition from `server-pane.tsx`. If a new state is added, both locations must be updated independently.
**Fix:** Export a const array and derive the type from it:
```ts
// server-pane.tsx
export const SERVER_PANE_STATES = ['strip', 'expanded', 'collapsed'] as const;
export type ServerPaneState = typeof SERVER_PANE_STATES[number];
```

---

_Reviewed: 2026-04-08T22:56:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
