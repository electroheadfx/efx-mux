---
status: root_cause_found
trigger: "On app open, restored agent/terminal tab shows `[exited]` message, cannot rerun — dead terminal with no restart option"
created: 2026-04-18T00:00:00Z
updated: 2026-04-18T14:00:00Z
---

## Current Focus

hypothesis: TWO concurrent bugs produce the same `[exited]` symptom.
  BUG A (right panel): RightPanel never mounts `ActiveTabCrashOverlay` for scope='right'. Even when the backend correctly emits `pty-exited` and the JS listener correctly sets `tab.exitCode` on the right-scope tab, no component in the right-panel subtree subscribes to that state — the user sees frozen tmux `[exited]` text with no Restart affordance.
  BUG B (main panel, newly reported): startup TOCTOU race between the restore loop and the pane-death monitor thread. `restoreTabsScoped` appends each restored tab to a local `restoredTabs` array but does NOT commit `s.tabs.value = restoredTabs` until AFTER the entire await loop completes (terminal-tabs.tsx:704). Meanwhile, `invoke('spawn_terminal')` returns as soon as the Rust monitor thread is spawned (pty.rs:290). The monitor thread's first pane_dead poll happens at t≈1s. If the reattached tmux pane is already dead (or dies during restore) BEFORE line 704 executes, the `pty-exited` event fires while `state.tabs.value` is still the empty initial array — the module-level listener at terminal-tabs.tsx:956-965 iterates `scopes`, finds no tab with matching sessionName, and silently drops the event. `tab.exitCode` remains undefined forever; main-scope overlay never renders.
test: Verified statically — see Evidence timestamps 2026-04-18T13:30:00Z through 13:50:00Z.
expecting: Both bugs must be fixed together: (1) mount `ActiveTabCrashOverlay` in right-panel.tsx, (2) make the startup exit-event path reliable — either commit `s.tabs.value` incrementally (after each tab append) so the listener can match, or replay any missed `pty-exited` events after restoration completes.
next_action: Apply fix A (one-line JSX in right-panel.tsx) + fix B (commit restoredTabs incrementally AND/OR query pane_dead on spawn_terminal success to synthesize missing exitCode).

## Symptoms

expected: When app is reopened and a previously-running agent/terminal tab has died (shell exited), user sees a crash overlay with Restart button — or session is cleanly restarted. Dead terminals should never become permanent.
actual: Reopened tab shows `[exited]` text inside the terminal area. No restart affordance. Cannot type or interact. Tab is permanently dead. Reproduces in BOTH main and right panels (user report 2026-04-18T13:30Z).
errors: Terminal body text: `[exited]` (screenshot attached - Agent c tab). No app-level error visible.
reproduction: Main panel path: 1) In a project, have an agent tab running claude; close the app so tmux session persists; 2) Some time later, reopen the app; 3) If the claude process (or shell after claude exit) was already dead by the time the main-panel tab restoration completes, the tab mounts with `exitCode === undefined` even though the monitor thread detected pane_dead. Right panel path: same as before — right-scope agent tab gets exitCode set but no overlay mount renders it.
started: Right-panel variant: Phase 20 regression when the right panel started hosting dynamic terminal/agent tabs. Main-panel variant: latent since Plan 08-05 (pane-death monitor thread introduction) — the race was always present but needed a restored-dead-pane scenario to surface.

## Related Prior Work

- `.planning/debug/tmux-pane-dead-restart-blocked.md` (diagnosed 2026-04-10). Diagnosed why `pty-exited` never fired (PTY master tied to tmux client, remain-on-exit keeps client alive). Fix landed as pane-death monitor thread in pty.rs:284-364 + `cleanup_dead_sessions` in pty.rs:540-566. Backend is emitting correctly. The newly identified BUG B is a front-end race against this monitor — the events ARE emitted, they just arrive before the restore loop has committed its tabs array.

## Eliminated

- Rust monitor thread failing to emit `pty-exited` on reattach: pty.rs:290+ spawns a monitor on every `spawn_terminal` call (including reattach), with a 1s initial delay and 500ms poll. It emits `pty-exited` with the correct session name. No code path skips this for restored sessions.
- `cleanup_dead_sessions` missing dead sessions at startup: `tmux list-sessions -F "#{session_name}:#{pane_dead}"` works correctly under tmux 3.6a. Cleanup at main.tsx:399 runs BEFORE restore. Sessions that died before app start are killed → spawn_terminal then creates fresh (not `[exited]`).
- Session name mismatch between JS and Rust: `sanitized` in Rust (filter to alphanumeric + `-` + `_`) is idempotent on the JS-provided sessionName (which was already sanitized when created). Confirmed by walking projectSessionName → rightTabSessionName path.
- Listener registration timing: `listen('pty-exited', ...)` at terminal-tabs.tsx:956 is at MODULE-LEVEL (not inside a component effect). It fires as soon as main.tsx:29 imports terminal-tabs, which happens synchronously before bootstrap() runs. By t=1s (when monitor's first poll fires), the listener has had hundreds of milliseconds to complete its IPC registration with Rust. This is NOT the race.
- Right-panel-only diagnosis (original): incomplete. User confirmed symptom also in main. A second root cause must exist for main scope — see BUG B.

## Evidence

- timestamp: 2026-04-18T12:00:00Z
  checked: src/components/main-panel.tsx full file (75 lines)
  found: Line 8 imports `ActiveTabCrashOverlay` from './terminal-tabs'. Line 36 renders `<ActiveTabCrashOverlay />` inside the terminal area. That resolves to `ActiveTabCrashOverlayScoped('main')` per terminal-tabs.tsx:869 — so main scope is covered for live (non-restore-race) exits.
  implication: Main-panel agent tabs get the overlay + Restart button WHEN `tab.exitCode` is set correctly. If exitCode stays undefined (BUG B race), overlay cannot render.

- timestamp: 2026-04-18T12:01:00Z
  checked: src/components/right-panel.tsx full file (113 lines)
  found: RightPanel imports `getTerminalScope` (line 19) but ONLY uses it for `activeTabId` (line 29). The JSX mounts FileTree, GSDPane, GitChangesTab, right-scope EditorTab list, and the `.terminal-containers[data-scope="right"]` wrapper (lines 101-109). There is NO `<ActiveTabCrashOverlay />` and NO `<AgentHeader />` anywhere in the right panel. Nothing reads `tab.exitCode` from the right scope's tabs.
  implication: BUG A. When a right-scope agent tab exits, `tab.exitCode` is correctly set by the `pty-exited` listener (terminal-tabs.tsx:961), but no Preact component subscribes to that state in the right-panel DOM subtree.

- timestamp: 2026-04-18T12:02:00Z
  checked: src/components/terminal-tabs.tsx — scope plumbing for ActiveTabCrashOverlay
  found: `ActiveTabCrashOverlayScoped(scope)` exists (line 732-743) and is fully generic. `getTerminalScope(scope)` exposes it at line 936 as `ActiveTabCrashOverlay: () => ActiveTabCrashOverlayScoped(scope)`. The helper is ready; it just isn't being called from right-panel.tsx.
  implication: Fix A is a one-line JSX addition in RightPanel.

- timestamp: 2026-04-18T12:04:00Z
  checked: src-tauri/src/terminal/pty.rs monitor thread (lines 284-364)
  found: Monitor thread is spawned unconditionally inside `spawn_terminal` (line 290), with a 1s initial delay and 500ms poll. Emits `pty-exited` with `session: sanitized` and `code: exit_code`. The session name passed to `emit()` is the SAME sanitized name used by JS.
  implication: Back end emits events correctly. No Rust-side EMIT fix needed; the race is purely on the JS RECEIVING side.

- timestamp: 2026-04-18T13:30:00Z
  checked: src/main.tsx bootstrap ordering (lines 398-437)
  found: Line 399 `await invoke('cleanup_dead_sessions')`. Line 437 `await restoreTabs(parsedData, ...)`. Cleanup always runs before restore. Any session with pane_dead=1 at cleanup time is killed, so spawn_terminal would create a fresh session (not `[exited]`).
  implication: For `[exited]` to appear in main scope, the pane must have become dead AFTER cleanup but BEFORE the monitor thread detects it. OR the monitor detects it correctly but the listener cannot route it.

- timestamp: 2026-04-18T13:40:00Z
  checked: src/components/terminal-tabs.tsx `restoreTabsScoped` lines 631-725
  found: The function iterates `savedData.tabs` with `for (let i = 0; i < savedData.tabs.length; i++)`. Inside the loop (line 676) it `await`s `connectPty(terminal, saved.sessionName, ...)`. It pushes the new TerminalTab object into a LOCAL `restoredTabs` array at line 686. Critically, `s.tabs.value` is NOT mutated inside the loop. Only AFTER the loop completes does line 704 execute `s.tabs.value = restoredTabs;`.
  implication: During the restore loop, `s.tabs.value` (whatever it was before — typically `[]`) is the array visible to the `pty-exited` listener. Every pty-exited event that fires between spawn_terminal returning and line 704 committing will be dropped.

- timestamp: 2026-04-18T13:45:00Z
  checked: src-tauri/src/terminal/pty.rs `spawn_terminal` return path + monitor thread (lines 60-364)
  found: `spawn_terminal` returns `Ok(())` at line 366 immediately after `std::thread::spawn` for the monitor. The monitor thread sleeps 1s (line 292) then polls `has-session` + `pane_dead`. If the reattached pane is already dead at t=1s, it IMMEDIATELY queries exit code, kills the session, and emits `pty-exited`. That whole sequence can complete in <10ms after the 1s initial delay.
  implication: A reattach to an already-dead pane triggers pty-exited at t≈1.0s after spawn_terminal is invoked. If the JS side is still iterating `restoreTabsScoped` at that moment (multi-tab restore with several `await connectPty` calls each doing IPC round-trips), BUG B's race fires.

- timestamp: 2026-04-18T13:50:00Z
  checked: src/components/terminal-tabs.tsx module-level `listen('pty-exited', ...)` lines 956-972
  found: Listener at line 958 iterates `for (const [, state] of scopes)` and matches by `sessionName`. It relies on `state.tabs.value` containing the tab at the moment the event arrives. The tabs map is only populated when restoreTabsScoped finally commits line 704 (batch assign). No replay, no buffering.
  implication: The listener has no mechanism to recover from a miss. Once pty-exited is dropped because the array was empty, the tab is permanently orphaned at exitCode=undefined.

- timestamp: 2026-04-18T13:55:00Z
  checked: src/components/right-panel.tsx — confirm right-scope overlay still missing
  found: File at lines 101-109 still has no `ActiveTabCrashOverlay` mount. Fix A still applies and is orthogonal to BUG B.
  implication: Both fixes needed. Even if BUG B is fixed, right panel tabs whose exitCode IS set (e.g., live exits, not restore races) still have nowhere to render.

## Resolution

root_cause:
  **BUG A (right panel, missing mount):** `src/components/right-panel.tsx` never renders `ActiveTabCrashOverlay` for the `'right'` terminal scope. When a right-scope agent tab exits and `tab.exitCode` is set, no component in the right-panel subtree subscribes to or displays that state. This is a Phase-20 regression.

  **BUG B (main + right, startup race):** `restoreTabsScoped` in `src/components/terminal-tabs.tsx` commits restored tabs to `s.tabs.value` in a single batch assignment at line 704, AFTER iterating all `savedData.tabs` and awaiting `connectPty` (which transitively awaits `invoke('spawn_terminal')`). Meanwhile, the pane-death monitor thread in `src-tauri/src/terminal/pty.rs:290` is spawned inside `spawn_terminal` and emits `pty-exited` at t≈1s if the reattached pane is dead. If that event fires while the restore loop is still in-flight (highly likely for multi-tab projects where total loop time > 1s), the module-level `listen('pty-exited', ...)` handler at terminal-tabs.tsx:956-965 iterates the scopes map, finds `state.tabs.value` still empty (or stale), and silently drops the event. The tab eventually mounts with `exitCode === undefined` forever; `ActiveTabCrashOverlayScoped` returns null; user sees only tmux's raw `[exited]` buffer text. Affects both scopes equally — the right-panel symptom would be masked by BUG A anyway, but fixing A without B still leaves main-scope broken for restored-dead-pane cases.

fix:
  **Fix A (right panel overlay mount):** In `src/components/right-panel.tsx`, destructure `ActiveTabCrashOverlay: RightCrashOverlay` from `getTerminalScope('right')` at the top of the component. Render `{isDynamic && <RightCrashOverlay />}` inside the `right-panel-content` div as a sibling of the terminal-containers div (mirror main-panel's layering).

  **Fix B (restore race — pick one or both):**
  - **B1 (preferred, frontend-only):** Modify `restoreTabsScoped` in `src/components/terminal-tabs.tsx` to commit tabs incrementally. After each `restoredTabs.push(...)` inside the loop, also assign `s.tabs.value = [...restoredTabs];`. This ensures the `pty-exited` listener can find the tab the moment spawn_terminal's monitor emits. Keep the final batch commit at line 704 for the active-tab-selection side effects (harmless idempotent reassignment).
  - **B2 (defense in depth, backend-assisted):** In `src-tauri/src/terminal/pty.rs` `spawn_terminal`, after creating the monitor thread, synchronously query `pane_dead` once on the current thread (before returning). If already dead, include the exit code in the `Ok` return (change return type to `Result<Option<i32>, String>` or emit `pty-exited` synchronously before returning). The JS side (`connectPty` in pty-bridge.ts:31) can then set `tab.exitCode` directly from the return value, eliminating the race entirely for the "already dead on reattach" case. Still relies on Fix B1 or equivalent for the "dies DURING restore" case.
  - Recommendation: apply B1 alone for this session (minimal surface area, fixes all variants of the race). B2 can be a follow-up hardening.

verification:
  (1) **Right-panel overlay**: Open a project, create a right-scope Agent tab; run `exit` to terminate the agent; confirm Restart overlay appears over the right-panel terminal area; click Restart — confirm a fresh PTY connects (session suffix `-rr<N>`).
  (2) **Main-panel restore race (regression test)**: With an agent tab running in main scope, quit the app. Manually kill the tmux pane's process (so pane becomes dead) without killing the session: `tmux send-keys -t <session> "exit" Enter; sleep 1`. Reopen the app. Before fix: tab mounts at `[exited]` with no overlay. After fix: overlay appears within ~1.5s of app boot.
  (3) **Right-panel restore race**: same as (2) but for a right-scope tab. Confirms both fixes compose correctly.
  (4) **Multi-tab race**: create 5 main-scope tabs, quit, kill all 5 panes' inner processes, reopen. All 5 should show overlays.
  (5) **Automated (unit)**: add a Vitest case for `restoreTabsScoped` that mocks `connectPty` to simulate spawn_terminal returning successfully and then fires a synthetic `pty-exited` event DURING the loop (before the final batch commit). Assert `tab.exitCode` is set on the matching restored tab after the loop completes.
  (6) **Automated (component)**: assert RightPanel mounts the right-scope `ActiveTabCrashOverlay` when the active right-scope tab has `exitCode === 0` and `exitCode === 130`.
  Follow-up (out of scope): scope AgentHeader so right-scope agent tabs also get a "Ready/Stopped" pill.

files_changed: []
