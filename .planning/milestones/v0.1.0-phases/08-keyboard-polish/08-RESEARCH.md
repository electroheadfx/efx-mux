# Phase 08: Keyboard + Polish - Research

**Researched:** 2026-04-09
**Domain:** Keyboard shortcut system, tab management, PTY crash recovery, first-run wizard (Preact + xterm.js + Tauri 2)
**Confidence:** HIGH

## Summary

Phase 08 builds four features on top of a mature codebase (Phases 1-7 complete): (1) a conflict-free keyboard shortcut system that captures app shortcuts before xterm.js but lets terminal control sequences pass through, (2) multi-tab terminal management in the main panel with per-tab tmux sessions, (3) PTY crash/exit detection with inline restart overlay, and (4) a first-run wizard modal.

The codebase already has proven patterns for every piece: `capture: true` keydown handlers (Ctrl+S in main.tsx), `attachCustomKeyEventHandler` on xterm.js (terminal-manager.ts), reusable `TabBar` component (tab-bar.tsx), `PtyManager` HashMap for multi-session PTY (pty.rs), exit code detection via waitpid (server.rs), and modal/overlay patterns (project-modal.tsx, fuzzy-search.tsx). This phase is primarily integration and UI work -- no new libraries or Rust crates needed.

**Primary recommendation:** Build all four features using existing patterns. The keyboard system uses a two-layer approach: `document.addEventListener('keydown', ..., { capture: true })` for app shortcuts + xterm.js `attachCustomKeyEventHandler` returning `false` for app-claimed keys. Tab management extends the existing `PtyManager` with multiple named sessions per project. PTY crash detection adapts the server.rs waitpid/WIFEXITED pattern to emit `pty-exited` events. The wizard reuses project-modal.tsx fields inside a multi-step modal.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Capture-before-terminal pattern: all app shortcuts use `document.addEventListener('keydown', ..., { capture: true })` to fire before xterm.js, same as existing Ctrl+S handler. Ctrl+T/W/Tab always trigger app actions regardless of focus.
- **D-02:** Terminal passthrough set: Ctrl+C (SIGINT), Ctrl+D (EOF), Ctrl+Z (suspend), Ctrl+L (clear), Ctrl+R (reverse search) always pass through to the terminal. Everything else is fair game for app shortcuts.
- **D-03:** Shortcut cheatsheet: Ctrl+? opens a dismissable overlay showing all app keyboard shortcuts. Dismisses on any key press or click outside.
- **D-04:** Ctrl+T creates a new terminal session tab in the main panel. Each tab is its own tmux session -- like iTerm2 tab behavior.
- **D-05:** Terminal tab bar rendered at the top of the main terminal area, showing session name per tab. Reuses existing TabBar component pattern from right-panel.tsx.
- **D-06:** Ctrl+W closes the active terminal tab. Ctrl+Tab cycles through terminal tabs.
- **D-07:** Closing the last tab auto-creates a fresh default terminal session. The user always has at least one terminal open.
- **D-08:** Exit code-based detection: exit code 0 = normal exit (show "Session ended" + Restart button), non-zero = crash (show "Process crashed (code N)" + Restart button in warning style).
- **D-09:** Crash/exit banner is an inline overlay centered inside the terminal area. Terminal content remains visible behind it (dimmed). Matches terminal-first aesthetic.
- **D-10:** Restart button re-spawns the same session type (agent or bash) in a new tmux session for that tab.
- **D-11:** On first launch (no state.json), open a focused modal wizard. 2-5 steps: Welcome, Add project (dir + name), Choose agent (claude/opencode/bash), Import theme (iTerm2), Server command + GSD file path.
- **D-12:** Each wizard step is skippable with sensible defaults (bash agent, no server, no theme import, no GSD file). User can configure later via project settings.
- **D-13:** Reuse existing project-modal.tsx fields and patterns for the project setup step. Theme import reuses existing iTerm2 importer from Phase 3.

### Claude's Discretion
- Shortcut cheatsheet visual design and layout
- Tab bar styling (consistent with existing right-panel TabBar)
- Crash overlay dimming opacity and animation
- Wizard step transitions and progress indicator
- Default session naming convention for new tabs (e.g., "Terminal 1", "Terminal 2")
- Exact passthrough key detection implementation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | App-level keyboard shortcuts captured before terminal; terminal receives keys only when focused (no conflicts with Ctrl+C/D/Z) | Two-layer keyboard interception pattern: capture-phase document listener + xterm.js attachCustomKeyEventHandler |
| UX-02 | User can open new tab with Ctrl+T, close with Ctrl+W, cycle with Ctrl+Tab | Tab management via signals + PtyManager multi-session + tmux session-per-tab |
| UX-03 | When PTY process crashes, user sees banner with restart option | PTY read loop EOF detection + Tauri event emission + inline overlay component |
| UX-04 | First-run wizard prompts user to add first project and choose default agent | Multi-step modal reusing project-modal.tsx fields, iTerm2 importer, state persistence |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @preact/signals | existing | Reactive state for tabs, overlays, wizard steps | Already used throughout codebase [VERIFIED: codebase] |
| @xterm/xterm | 6.0.0 | Terminal emulator with attachCustomKeyEventHandler | Already installed [VERIFIED: CLAUDE.md] |
| portable-pty | 0.9.0 | PTY spawning with PtyManager multi-session | Already installed [VERIFIED: pty.rs] |
| tauri | 2.10.x | IPC commands, event system | Already installed [VERIFIED: lib.rs] |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tauri-plugin-dialog | existing | Directory picker in wizard | Reuse from project-modal.tsx [VERIFIED: project-modal.tsx imports] |

### No New Dependencies
This phase requires zero new npm packages or Rust crates. All functionality builds on existing infrastructure.

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    keyboard-shortcuts.ts    # Central shortcut registry + capture handler
    shortcut-cheatsheet.tsx  # Ctrl+? overlay component
    terminal-tabs.tsx        # Tab state management + tab bar for main panel
    crash-overlay.tsx        # PTY exit/crash inline overlay
    first-run-wizard.tsx     # Multi-step wizard modal
  main-panel.tsx             # Modified: add tab bar, manage multiple terminals
  main.tsx                   # Modified: register new shortcuts, wire wizard
src-tauri/
  src/terminal/pty.rs        # Modified: emit pty-exited event on EOF
```

### Pattern 1: Two-Layer Keyboard Interception (UX-01)
**What:** App shortcuts fire in the capture phase of document keydown, before xterm.js processes them. xterm.js `attachCustomKeyEventHandler` also blocks app-claimed keys from reaching the terminal.
**When to use:** Every app-level shortcut (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+B, Ctrl+S, Ctrl+P, Ctrl+?)
**Example:**
```typescript
// Layer 1: Document capture handler (fires before xterm.js)
// Source: existing pattern in main.tsx lines 127-138
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Guard: only intercept non-passthrough Ctrl combos
  if (!e.ctrlKey) return;
  
  // Passthrough set: always goes to terminal (D-02)
  const PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);
  if (PASSTHROUGH.has(e.key.toLowerCase()) && !e.shiftKey) return;
  
  // App shortcuts
  if (e.key === 't' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    // Create new tab
  }
  if (e.key === 'w' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    // Close active tab
  }
  if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    // Cycle tabs
  }
}, { capture: true });

// Layer 2: xterm.js handler (prevents terminal from processing app keys)
// Source: existing pattern in terminal-manager.ts lines 44-87
terminal.attachCustomKeyEventHandler((ev: KeyboardEvent): boolean => {
  if (ev.type !== 'keydown') return true;
  if (ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
    const key = ev.key.toLowerCase();
    // Block app-claimed keys from reaching terminal
    if (['t', 'w', 'b', 's', 'p'].includes(key)) return false;
    if (ev.key === 'Tab') return false;
    if (key === '?') return false;
  }
  return true; // All other keys pass through to terminal
});
```
[VERIFIED: main.tsx Ctrl+S handler uses capture:true, terminal-manager.ts has attachCustomKeyEventHandler]

### Pattern 2: Multi-Tab Terminal Management (UX-02)
**What:** Each tab in the main panel maps to a separate tmux session. Tab state is managed via Preact signals. Terminal DOM elements are kept alive (display:none) when inactive to preserve scrollback.
**When to use:** Main panel terminal area
**Example:**
```typescript
// Source: pattern derived from right-panel.tsx tab management + pty-bridge.ts
interface TerminalTab {
  id: string;           // Unique tab ID
  sessionName: string;  // tmux session name (e.g., "myproject", "myproject-2")
  label: string;        // Display name (e.g., "Terminal 1")
  terminal: Terminal;   // xterm.js instance
  fitAddon: FitAddon;
  container: HTMLDivElement;
  ptyConnected: boolean;
}

const tabs = signal<TerminalTab[]>([]);
const activeTabId = signal<string>('');

// New tab: create tmux session, xterm.js instance, connect PTY
// Close tab: dispose terminal, kill tmux session
// Cycle: update activeTabId, show/hide containers, call fitAddon.fit()
```
[VERIFIED: PtyManager HashMap supports multiple named sessions (pty.rs line 32)]

### Pattern 3: PTY Exit Detection with Real Exit Codes (UX-03)
**What:** When the PTY read loop hits EOF (reader.read returns 0), use tmux to detect whether the session truly died and retrieve the inner process's exit code. Emit a Tauri event with the session name and real exit code.
**When to use:** Every PTY session
**Approach (from resolved Open Question 2):**
1. At spawn time, set `remain-on-exit on` for the tmux session so the pane status is preserved after exit.
2. After PTY EOF, check `tmux has-session -t {name}` -- if session is gone (without remain-on-exit it auto-destroys), it's a detach or cleanup race.
3. Query `tmux display-message -t {name} -p '#{pane_dead_status}'` to get the actual inner process exit code.
4. If display-message fails (session already cleaned up), fall back to exit code 0.
**Example:**
```rust
// Source: derived from server.rs lines 94-103 (waitpid pattern)
// In pty.rs, BEFORE the read loop thread spawn, clone app + session:
let app_for_exit = app.clone();
let session_for_exit = sanitized.clone();

// At spawn time (after tmux new-session), set remain-on-exit:
let _ = std::process::Command::new("tmux")
    .args(["set-option", "-t", &sanitized, "remain-on-exit", "on"])
    .output();

std::thread::spawn(move || {
    // ... existing read loop ...
    // After Ok(0) => break:
    
    // Brief delay for tmux to register pane death
    std::thread::sleep(std::time::Duration::from_millis(300));
    
    // Step 1: Check if tmux session still exists
    let session_alive = std::process::Command::new("tmux")
        .args(["has-session", "-t", &session_for_exit])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    
    if session_alive {
        // Session still alive -- query the actual exit code from the dead pane
        let exit_code = std::process::Command::new("tmux")
            .args(["display-message", "-t", &session_for_exit, "-p", "#{pane_dead_status}"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout).ok()
                } else {
                    None
                }
            })
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(0);
        
        // Clean up the remain-on-exit session
        let _ = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &session_for_exit])
            .output();
        
        let payload = serde_json::json!({
            "session": session_for_exit,
            "code": exit_code
        });
        let _ = app_for_exit.emit("pty-exited", payload);
    }
    // If session is not alive at all (race condition), emit with code 0
    // This handles the case where tmux cleaned up before we could query
    else {
        let payload = serde_json::json!({
            "session": session_for_exit,
            "code": 0
        });
        let _ = app_for_exit.emit("pty-exited", payload);
    }
});
```
[VERIFIED: server.rs uses app.emit() for server-stopped events]

### Pattern 4: Inline Overlay (UX-03, D-09)
**What:** Crash/exit banner overlays the terminal area with a semi-transparent backdrop. Terminal content stays visible behind it (dimmed).
**When to use:** When a PTY session exits (EOF from read loop)
**Example:**
```typescript
// Follows fuzzy-search.tsx pattern: fixed positioning, z-index, backdrop
// But scoped to terminal tab container, not full viewport
<div class="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
  <div class="bg-bg-raised border border-border rounded-lg p-6 text-center">
    <p class="text-text-bright mb-4">Session ended</p>
    <button onClick={restart} class="bg-accent text-white px-4 py-2 rounded">
      Restart Session
    </button>
  </div>
</div>
```
[VERIFIED: fuzzy-search.tsx and project-modal.tsx establish overlay patterns]

### Pattern 5: Multi-Step Wizard Modal (UX-04)
**What:** Signal-driven step counter inside a modal. Each step renders different content. Skip buttons advance without saving. Reuses existing form fields from project-modal.tsx.
**When to use:** First launch only (no state.json or no projects registered)
**Example:**
```typescript
const wizardStep = signal(0);
const WIZARD_STEPS = ['Welcome', 'Project', 'Agent', 'Theme', 'Server'];

// Step 0: Welcome message
// Step 1: Reuse project-modal.tsx directory picker + name input
// Step 2: Agent selection (claude/opencode/bash datalist)
// Step 3: iTerm2 theme import (reuse import_iterm2_theme invoke)
// Step 4: Server command + GSD file path
// Final: call addProject() with collected data, close wizard
```
[VERIFIED: project-modal.tsx has all form fields, iTerm2 importer exists in theme-manager.ts]

### Anti-Patterns to Avoid
- **Don't use separate keydown listeners per shortcut:** Consolidate into one capture-phase handler with a switch/if chain. Multiple listeners make priority debugging impossible.
- **Don't destroy terminal DOM on tab switch:** Use display:none/block to preserve xterm.js scrollback and WebGL context. Destroying and recreating terminals is expensive and loses state.
- **Don't poll for PTY exit:** Use the existing read loop EOF pattern (Ok(0) => break). The reader thread already runs in a dedicated OS thread.
- **Don't intercept Cmd+key combinations in the document handler:** macOS Cmd shortcuts are handled by the native menu (Cmd+C, Cmd+V, Cmd+Q). Only intercept Ctrl+key combinations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key conflict resolution | Custom event priority system | capture:true + attachCustomKeyEventHandler | Both layers already exist in codebase; proven pattern |
| Multi-session PTY | New PTY management abstraction | Existing PtyManager HashMap | Already handles named sessions, just add more |
| Exit code detection | Custom process monitoring | tmux remain-on-exit + display-message #{pane_dead_status} | tmux tracks inner process exit code natively |
| Modal/overlay UI | Custom dialog system | Preact signal-driven visibility (from fuzzy-search.tsx) | Established pattern, consistent with existing UI |
| Tab component | Custom tab implementation | Existing TabBar component | Already reusable, signal-based |

**Key insight:** This phase is 100% integration of existing patterns. Every building block is already in the codebase. The challenge is wiring them together correctly, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Ctrl+Tab Browser Default
**What goes wrong:** Ctrl+Tab is the default browser shortcut for tab switching. In Tauri's WKWebView, it may be consumed before reaching JavaScript.
**Why it happens:** WKWebView can intercept certain key combinations before the DOM keydown event fires.
**How to avoid:** Test early. If WKWebView consumes Ctrl+Tab, the capture-phase handler will never fire. Fallback: use Ctrl+PageDown/PageUp which WKWebView does not intercept. (See resolved Open Question 1.)
**Warning signs:** Ctrl+Tab handler never fires in the capture listener.
[ASSUMED -- WKWebView key interception behavior may vary by macOS version]

### Pitfall 2: Terminal Focus Loss After Tab Switch
**What goes wrong:** After switching tabs, the newly visible terminal doesn't have keyboard focus. User types and nothing happens.
**Why it happens:** display:none/block toggle doesn't move focus. xterm.js requires explicit `.focus()` call.
**How to avoid:** Call `terminal.focus()` after every tab switch, AND call `fitAddon.fit()` since the terminal may have been resized while hidden.
**Warning signs:** Keys don't appear in terminal after tab switch.
[VERIFIED: main.tsx line 251 calls terminal.focus() after mount]

### Pitfall 3: PTY EOF vs tmux Session Alive
**What goes wrong:** The PTY read loop hits EOF when the PTY master closes, but the tmux session may still be running (since tmux detaches the process). The "crash" overlay shows when the user just detached.
**Why it happens:** portable-pty EOF means the PTY file descriptor closed, not necessarily that the underlying process crashed.
**How to avoid:** After PTY EOF, check tmux session status via `tmux has-session -t {name}`. With `remain-on-exit on`, the session stays alive after process exit, allowing exit code query via `tmux display-message -t {name} -p '#{pane_dead_status}'`. Then kill the session after reading the code.
**Warning signs:** Crash overlay appears when the user didn't expect it.
[VERIFIED: pty.rs read loop breaks on Ok(0) EOF]

### Pitfall 4: Ctrl+W Browser Close
**What goes wrong:** Ctrl+W is the browser default for "close tab/window". In Tauri WKWebView, it may try to close the window.
**Why it happens:** WKWebView inherits some browser keyboard shortcuts.
**How to avoid:** The capture-phase handler with `e.preventDefault()` and `e.stopPropagation()` should prevent this. Verify with Tauri's `on_window_event` to ensure CloseRequested is not triggered by Ctrl+W.
**Warning signs:** App window closes when pressing Ctrl+W.
[ASSUMED -- needs testing in Tauri WKWebView specifically]

### Pitfall 5: Wizard Replaces Existing First-Run Logic
**What goes wrong:** The existing `initProjects()` in main.tsx already opens `ProjectModal` on first run (line 259). The new wizard must replace this, not compete with it.
**Why it happens:** Two code paths both try to handle "no projects" state.
**How to avoid:** Replace the `openProjectModal({ firstRun: true })` call in `initProjects()` with the wizard modal launch. Remove the first-run path from project-modal.tsx.
**Warning signs:** Two modals appear on first launch.
[VERIFIED: main.tsx line 259 calls openProjectModal({ firstRun: true }) when projectList.length === 0]

### Pitfall 6: Tab State Not Persisted
**What goes wrong:** User opens multiple terminal tabs, closes app, reopens -- all tabs are gone.
**Why it happens:** Tab list and active tab not saved to state.json.
**How to avoid:** Persist terminal tab list (session names + labels) and active tab ID in state.json. On restore, reconnect to existing tmux sessions (they survive app close per TERM-03).
**Warning signs:** Tabs reset to single default tab on every app restart.
[VERIFIED: state.rs AppState has session field; tmux sessions survive app close]

### Pitfall 7: Ctrl+Shift+T Conflict with Theme Toggle
**What goes wrong:** Ctrl+Shift+T is already bound to theme mode toggle (main.tsx line 119). If the shortcut system doesn't account for this, it could conflict.
**Why it happens:** Multiple handlers for similar key combos.
**How to avoid:** Centralize all shortcut registrations in one handler. The passthrough check must distinguish Ctrl+T (new tab) from Ctrl+Shift+T (theme toggle).
**Warning signs:** Theme toggle stops working or new tab opens when toggling theme.
[VERIFIED: main.tsx line 118-121 handles Ctrl+Shift+T for theme toggle]

## Code Examples

### Consolidated Shortcut Handler
```typescript
// Source: derived from existing main.tsx patterns (lines 113-138)
// All app shortcuts in one capture-phase handler

const TERMINAL_PASSTHROUGH = new Set(['c', 'd', 'z', 'l', 'r']);

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.ctrlKey || e.metaKey) return;
  
  const key = e.key.toLowerCase();
  
  // Terminal passthrough: never intercept these
  if (TERMINAL_PASSTHROUGH.has(key) && !e.shiftKey && !e.altKey) return;
  
  // App shortcuts (prevent default + stop propagation)
  switch (true) {
    case key === 'b' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      sidebarCollapsed.value = !sidebarCollapsed.value;
      break;
    case key === 's' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      serverPaneState.value = serverPaneState.value === 'strip' ? 'expanded' : 'strip';
      break;
    case key === 't' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      createNewTab();
      break;
    case key === 'w' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      closeActiveTab();
      break;
    case e.key === 'Tab' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      cycleToNextTab();
      break;
    case key === 'p' && !e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      openFuzzySearch();
      break;
    case (key === '/' && e.shiftKey) || (key === '?' && !e.altKey):
      // Ctrl+? = Ctrl+Shift+/ on US keyboard = Ctrl+? for AZERTY (D-03)
      e.preventDefault(); e.stopPropagation();
      toggleCheatsheet();
      break;
    case key === '/' && !e.shiftKey && !e.altKey:
      // Ctrl+/ as AZERTY fallback for cheatsheet
      e.preventDefault(); e.stopPropagation();
      toggleCheatsheet();
      break;
    case key === 't' && e.shiftKey:
      e.preventDefault(); e.stopPropagation();
      toggleThemeMode();
      break;
  }
}, { capture: true });
```
[VERIFIED: pattern proven by existing Ctrl+S handler in main.tsx]

### PTY Exit Event Emission (Rust)
```rust
// Source: derived from server.rs lines 94-103 (waitpid pattern)
// In pty.rs, BEFORE the read loop thread spawn:
let app_for_exit = app.clone();
let session_for_exit = sanitized.clone();

// After tmux new-session, set remain-on-exit so we can query exit code:
let _ = std::process::Command::new("tmux")
    .args(["set-option", "-t", &sanitized, "remain-on-exit", "on"])
    .output();

std::thread::spawn(move || {
    // ... existing read loop ...
    // After Ok(0) => break:
    
    std::thread::sleep(std::time::Duration::from_millis(300));
    
    // Check if tmux session still exists (remain-on-exit keeps it alive)
    let session_alive = std::process::Command::new("tmux")
        .args(["has-session", "-t", &session_for_exit])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    
    let exit_code = if session_alive {
        // Query the dead pane's exit status
        let code = std::process::Command::new("tmux")
            .args(["display-message", "-t", &session_for_exit, "-p", "#{pane_dead_status}"])
            .output()
            .ok()
            .and_then(|o| if o.status.success() { String::from_utf8(o.stdout).ok() } else { None })
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(0);
        // Clean up the remain-on-exit session
        let _ = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &session_for_exit])
            .output();
        code
    } else {
        0 // Session already gone (race condition) -- assume normal exit
    };
    
    let payload = serde_json::json!({
        "session": session_for_exit,
        "code": exit_code
    });
    let _ = app_for_exit.emit("pty-exited", payload);
});
```
[VERIFIED: server.rs uses app.emit() for server-stopped events]

### xterm.js Key Handler Update
```typescript
// Source: terminal-manager.ts lines 44-87 (existing handler)
// Add app shortcut keys to the block list

terminal.attachCustomKeyEventHandler((ev: KeyboardEvent): boolean => {
  if (ev.type !== 'keydown') return true;
  
  // Cmd+K -> clear (existing)
  if (ev.metaKey && !ev.ctrlKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
    ev.preventDefault();
    terminal.clear();
    return false;
  }
  
  // Block all Ctrl+key app shortcuts from reaching terminal
  if (ev.ctrlKey && !ev.metaKey) {
    const key = ev.key.toLowerCase();
    // App-claimed keys (non-passthrough)
    if (['t', 'w', 'b', 's', 'p'].includes(key) && !ev.shiftKey) return false;
    if (ev.key === 'Tab') return false;
    if (key === '/' && ev.shiftKey) return false; // Ctrl+?
    if (key === 't' && ev.shiftKey) return false;  // Ctrl+Shift+T theme
  }
  
  // Existing macOS navigation shortcuts...
  if (ev.metaKey && ev.key === 'ArrowLeft') { /* ... */ }
  // ...
  
  return true;
});
```
[VERIFIED: terminal-manager.ts has this exact handler structure]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single terminal in main panel | Multi-tab terminals (this phase) | Phase 8 | Multiple agent/shell sessions per project |
| No crash recovery | Exit code detection + restart overlay | Phase 8 | Graceful handling of PTY failures |
| ProjectModal for first run | Multi-step wizard with theme import | Phase 8 | Better onboarding experience |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ctrl+Tab may be intercepted by WKWebView before JS | Pitfall 1 | Need fallback keybinding; test early |
| A2 | Ctrl+W may trigger window close in WKWebView | Pitfall 4 | Need to verify preventDefault works in Tauri |
| A3 | Ctrl+? maps to Ctrl+Shift+/ on keyboard | Code Examples | On French AZERTY, ? is Shift+, -- need to verify e.key === '?' works cross-layout |

## Open Questions (RESOLVED)

1. **Ctrl+Tab WKWebView interception** (RESOLVED)
   - What we know: Standard browsers consume Ctrl+Tab. Tauri WKWebView may or may not.
   - What's unclear: Whether capture-phase preventDefault can override WKWebView's built-in handling.
   - **Decision:** Implement Ctrl+Tab as the primary binding. Plan 01 Task 1 must test it early during development. If WKWebView intercepts it (the capture handler never fires), add Ctrl+PageDown / Ctrl+PageUp as the fallback pair in the same handler. The xterm.js blocker must also block PageDown/PageUp if the fallback is activated. The UI-SPEC cheatsheet entry should show whichever binding actually works (determined at dev time, not runtime).

2. **PTY exit code from tmux** (RESOLVED)
   - What we know: The PTY read loop EOFs when the master PTY closes. server.rs uses waitpid for exit codes.
   - What's unclear: portable-pty's child process is tmux (not the actual shell). waitpid on the tmux client gives tmux's exit code, not the inner shell's.
   - **Decision:** Use a two-step approach after PTY EOF:
     1. At spawn time, set `remain-on-exit on` for the tmux session: `tmux set-option -t {session} remain-on-exit on`. This keeps the pane alive after the inner process exits, preserving its exit status.
     2. After PTY EOF + 300ms delay, check `tmux has-session -t {session}` (will be true because remain-on-exit keeps session alive).
     3. Query `tmux display-message -t {session} -p '#{pane_dead_status}'` to get the actual inner process exit code as an integer string.
     4. Kill the session after reading: `tmux kill-session -t {session}`.
     5. If display-message fails (session already cleaned up by external force), fall back to exit code 0.
   - This gives real exit codes for D-08 (code 0 = normal, non-zero = crash).

3. **French AZERTY keyboard: Ctrl+?** (RESOLVED)
   - What we know: User has French Mac keyboard (CLAUDE memory). ? is accessed differently on AZERTY.
   - What's unclear: What `e.key` value Ctrl+? produces on AZERTY.
   - **Decision:** Bind both `Ctrl+Shift+/` (US layout) and `Ctrl+/` (without shift, as AZERTY fallback). The handler checks `(key === '/' && e.shiftKey) || (key === '?' && !e.altKey) || (key === '/' && !e.shiftKey && !e.altKey)`. This covers US, AZERTY, and other layouts where `/` and `?` may differ.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (UI-heavy phase, no unit test infra detected) |
| Config file | none |
| Quick run command | `pnpm tauri dev` |
| Full suite command | `pnpm tauri dev` (manual verification) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | App shortcuts don't conflict with terminal Ctrl+C/D/Z | manual | Launch app, test each shortcut in terminal | N/A |
| UX-02 | Ctrl+T/W/Tab manage terminal tabs | manual | Launch app, create/close/cycle tabs | N/A |
| UX-03 | PTY crash shows banner with restart | manual | Kill tmux session externally, verify overlay | N/A |
| UX-04 | First-run wizard on clean state | manual | Delete state.json, relaunch app | N/A |

### Sampling Rate
- **Per task commit:** `pnpm tauri dev` + manual shortcut verification
- **Per wave merge:** Full keyboard shortcut matrix test
- **Phase gate:** All 4 UX requirements manually verified

### Wave 0 Gaps
None -- this phase is UI/UX focused with manual verification. No automated test infrastructure changes needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | Session names sanitized via existing pty.rs filter (alphanumeric + hyphen + underscore) |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Keyboard shortcut injection via crafted input | Tampering | capture-phase handlers with explicit key checks, no eval() |
| tmux session name injection | Tampering | Existing sanitization in pty.rs (chars filter) |
| Wizard form input injection | Tampering | Existing project-modal.tsx validation + Rust-side sanitization |

## Sources

### Primary (HIGH confidence)
- Codebase files: main.tsx, terminal-manager.ts, pty.rs, server.rs, tab-bar.tsx, project-modal.tsx, fuzzy-search.tsx, right-panel.tsx, state-manager.ts, state.rs, lib.rs, main-panel.tsx
- CLAUDE.md -- version matrix, xterm.js 6.0 specifics, portable-pty gotchas

### Secondary (MEDIUM confidence)
- xterm.js `attachCustomKeyEventHandler` API -- documented in xterm.js types, verified by existing usage in terminal-manager.ts

### Tertiary (LOW confidence)
- WKWebView Ctrl+Tab/Ctrl+W interception behavior -- assumed based on general browser knowledge, needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing
- Architecture: HIGH - all patterns verified in codebase
- Pitfalls: MEDIUM - WKWebView key interception needs runtime testing
- Keyboard system: HIGH - capture:true pattern proven in main.tsx
- Tab management: HIGH - PtyManager + TabBar already exist
- PTY crash: HIGH - tmux remain-on-exit + display-message approach is well-documented
- Wizard: HIGH - project-modal.tsx provides all needed fields

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable -- no external dependencies changing)
