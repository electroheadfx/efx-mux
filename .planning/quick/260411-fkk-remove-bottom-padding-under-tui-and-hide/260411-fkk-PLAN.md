---
phase: quick-260411-fkk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/terminal/pty.rs
  - src/styles/app.css
autonomous: true
must_haves:
  truths:
    - "No visible gap/padding below xterm.js terminal content before the bottom edge"
    - "Tmux green status bar is not visible in any terminal session"
  artifacts:
    - path: "src-tauri/src/terminal/pty.rs"
      provides: "tmux status off option on session creation"
    - path: "src/styles/app.css"
      provides: "Terminal area bottom padding removal"
  key_links:
    - from: "src-tauri/src/terminal/pty.rs"
      to: "tmux session"
      via: "set-option status off"
      pattern: "set-option.*status.*off"
---

<objective>
Fix two visual issues in the terminal area: (1) remove the visible bottom padding/gap below the xterm.js TUI content, and (2) hide the tmux green status bar that appears at the bottom of terminal sessions.

Purpose: Clean up terminal visual presentation so the TUI fills the available space edge-to-edge.
Output: Modified CSS for terminal area and Rust PTY code to disable tmux status bar.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/main-panel.tsx
@src/styles/app.css
@src-tauri/src/terminal/pty.rs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hide tmux status bar on session creation</name>
  <files>src-tauri/src/terminal/pty.rs</files>
  <action>
In `spawn_terminal` function, after the existing `set-option` calls (mouse on, remain-on-exit), add a new tmux set-option call to disable the status bar:

```rust
std::process::Command::new("tmux")
    .args(["set-option", "-t", &sanitized, "status", "off"])
    .output()
    .ok();
```

Also find the `reattach_pty` function (around line 392 where `set-option mouse on` is called for reattach) and add the same status-off option there so reattached sessions also hide the bar:

```rust
std::process::Command::new("tmux")
    .args(["set-option", "-t", &target, "status", "off"])
    .output()
    .ok();
```

This tells tmux to not render its green status line at the bottom of the terminal, reclaiming that row for actual terminal content.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && cargo check 2>&1 | tail -5</automated>
  </verify>
  <done>tmux sessions created by spawn_terminal and reattach_pty both set "status off", hiding the green bar.</done>
</task>

<task type="auto">
  <name>Task 2: Remove bottom gap below xterm.js terminal</name>
  <files>src/styles/app.css, src/components/main-panel.tsx</files>
  <action>
The bottom gap below the xterm.js content is caused by xterm.js not being able to fill exact pixel rows (the container height in pixels is not evenly divisible by the character cell height). Fix this by ensuring the terminal background color fills the gap.

In `src/styles/app.css`, update the `.terminal-area` rule to add explicit background and ensure the xterm viewport fills fully:

```css
.terminal-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-terminal);
  position: relative;
}
```

Add a rule to make the xterm.js container element (`.xterm`) fill its parent completely and set background to match:

```css
.terminal-area .xterm {
  height: 100%;
}

.terminal-area .xterm-viewport {
  background-color: var(--color-bg-terminal) !important;
}

.terminal-area .xterm-screen {
  background-color: var(--color-bg-terminal);
}
```

This ensures any pixel gap between the last terminal row and the container bottom is filled with the terminal background color, making it visually seamless.

In `src/components/main-panel.tsx`, the AgentHeader wrapper `<div class="p-3 pb-0">` sits above the terminal-containers but both are inside terminal-area. The AgentHeader has padding that creates visual space. Since the terminal-containers div uses `absolute inset-0`, the AgentHeader is actually rendered behind/over the terminal. Remove the wrapping padding div around AgentHeader -- the AgentHeader already has its own internal padding (8px 12px). Change:

```tsx
<div class="p-3 pb-0">
  <AgentHeader />
</div>
```

to just:

```tsx
<AgentHeader />
```

The AgentHeader is a floating card that sits inside the terminal area overlaid on the terminal. Its own padding/margin is sufficient.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | tail -5</automated>
  </verify>
  <done>No visible gap between xterm.js terminal content and the bottom edge of the terminal area. Terminal background color fills any sub-row pixel gap seamlessly.</done>
</task>

</tasks>

<verification>
1. `cargo check` passes (Rust changes compile)
2. `pnpm exec tsc --noEmit` passes (TypeScript valid)
3. Visual: launch app, no green tmux bar visible, no bottom gap below terminal content
</verification>

<success_criteria>
- Tmux green status bar is hidden in all terminal sessions (new and reattached)
- No visible padding/gap below the terminal TUI content
- Terminal area background is seamless edge-to-edge
</success_criteria>

<output>
After completion, create `.planning/quick/260411-fkk-remove-bottom-padding-under-tui-and-hide/260411-fkk-SUMMARY.md`
</output>
