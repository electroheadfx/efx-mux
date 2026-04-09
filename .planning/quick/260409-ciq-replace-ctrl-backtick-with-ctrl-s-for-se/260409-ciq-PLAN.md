---
type: quick
description: "Replace Ctrl+` with Ctrl+S for server pane toggle, fix terminal exit to stay in bash, add agent_cmd text input"
autonomous: true
files_modified:
  - src/main.tsx
  - src/components/server-pane.tsx
  - src/components/project-modal.tsx
  - src-tauri/src/terminal/pty.rs
  - src-tauri/src/state.rs
  - src/state-manager.ts
---

<objective>
Three small improvements to Efxmux UX:
1. Replace Ctrl+` shortcut with Ctrl+S for server pane toggle (French AZERTY compatibility)
2. Fix terminal exit behavior so bash survives after agent exits
3. Replace agent dropdown with free-text input for custom agent commands

Purpose: Ctrl+` is broken on French AZERTY keyboards. Agent exit kills the tmux session leaving a dead pane. The agent field is limited to 3 hardcoded options.
Output: All three fixes applied, app builds cleanly.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/main.tsx
@src/components/server-pane.tsx
@src/components/project-modal.tsx
@src-tauri/src/terminal/pty.rs
@src-tauri/src/state.rs
@src/state-manager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace Ctrl+` with Ctrl+S and fix terminal exit behavior</name>
  <files>src/main.tsx, src/components/server-pane.tsx, src-tauri/src/terminal/pty.rs</files>
  <action>
**Keyboard shortcut (src/main.tsx lines 124-140):**
- Change the keydown handler condition from `e.key === '`' || e.code === 'Backquote'` to `e.key === 's' || e.key === 'S'`
- Update the comment from "Ctrl+`" to "Ctrl+S"
- The handler already uses `e.preventDefault()` and `e.stopPropagation()` with `capture: true`, which will properly intercept Ctrl+S before xterm.js or browser default save dialog

**Tooltip/label in server-pane.tsx:**
- Search for any tooltip or aria-label text referencing "Ctrl+`" and update to "Ctrl+S"
- Check the toggle button added in Phase 7 for any shortcut hint text

**Terminal exit fix (src-tauri/src/terminal/pty.rs):**
In `spawn_terminal` (line 89-92), instead of passing `shell_cmd` directly as the tmux session command, wrap it so bash survives after the agent exits:
```rust
if let Some(ref shell_cmd) = shell_command {
    if !shell_cmd.is_empty() {
        let wrapped = format!("bash -c '{}; exec bash'", shell_cmd);
        cmd.arg(&wrapped);
    }
}
```

Apply the same wrapping in `switch_tmux_session` (lines 256-260):
```rust
if let Some(ref cmd_str) = shell_command {
    if !cmd_str.is_empty() {
        shell_cmd_str = format!("bash -c '{}; exec bash'", cmd_str);
        args.push(&shell_cmd_str);
    }
}
```

This ensures when claude/opencode exits (Ctrl+C, /exit, etc.), the user lands in a bash shell inside the same tmux session instead of the session dying.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm tauri build --debug 2>&1 | tail -5</automated>
  </verify>
  <done>Ctrl+S toggles server pane 3-state cycle. Ctrl+` no longer does anything. Agent exit in tmux drops to bash shell instead of killing the session. App compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Replace agent dropdown with free-text input</name>
  <files>src/components/project-modal.tsx, src-tauri/src/state.rs, src/state-manager.ts</files>
  <action>
**No backend changes needed** — `ProjectEntry.agent` is already a `String` in Rust and `string` in TS. The `detectAgent` function already calls `which` on whatever string is passed. No schema migration needed.

**project-modal.tsx (lines 192-204):**
Replace the `<select>` with an `<input>` + `<datalist>` combo:
```tsx
<div class="mb-4">
  <label class="block text-[11px] uppercase tracking-widest text-text mb-1">Agent</label>
  <input
    type="text"
    list="agent-suggestions"
    placeholder="claude"
    class="w-full h-8 px-2 text-sm bg-bg border border-border rounded-sm text-text-bright outline-none focus:border-accent box-border transition-colors"
    value={agent.value}
    onInput={(e) => { agent.value = (e.target as HTMLInputElement).value; }}
  />
  <datalist id="agent-suggestions">
    <option value="claude" />
    <option value="opencode" />
    <option value="bash" />
  </datalist>
</div>
```

This lets the user type any command (e.g., 'c', 'cc', 'claude-code', a custom wrapper) while still offering the common options as autocomplete suggestions. The `detectAgent` flow in main.tsx already handles arbitrary strings via `which`.

**Validation:** If the input is empty when saving, default to "bash" (same as current behavior when no agent is selected). Check the save handler and ensure it falls back: `agent.value.trim() || 'bash'`.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm tauri build --debug 2>&1 | tail -5</automated>
  </verify>
  <done>Agent field in project modal is a text input with datalist suggestions. User can type any command. Empty input defaults to "bash". Existing projects with "claude"/"opencode"/"bash" continue to work unchanged.</done>
</task>

</tasks>

<verification>
- App compiles: `pnpm tauri build --debug` succeeds
- Ctrl+S toggles server pane through collapsed -> strip -> expanded cycle
- Ctrl+` does nothing (no longer bound)
- Agent modal field accepts free text, shows suggestions dropdown
- Existing saved projects load correctly (no state.json schema break)
</verification>

<success_criteria>
All three improvements working: Ctrl+S shortcut, bash survival after agent exit, free-text agent input.
</success_criteria>

<output>
After completion, create `.planning/quick/260409-ciq-replace-ctrl-backtick-with-ctrl-s-for-se/260409-ciq-SUMMARY.md`
</output>
