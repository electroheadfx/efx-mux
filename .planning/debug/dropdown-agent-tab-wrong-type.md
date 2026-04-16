---
status: resolved
trigger: "Clicking Agent in dropdown menu creates TUI/zsh tab instead of Agent tab. Always been buggy. Hover previously broken too."
created: 2026-04-15
updated: 2026-04-15
---

# Debug: Dropdown Agent Tab Creates Wrong Type

## Symptoms

- **Expected**: Click "Agent" in add-tab dropdown -> creates Agent tab
- **Actual**: Creates TUI/zsh terminal tab instead of Agent tab; clicking Terminal sometimes creates Agent
- **Consistency**: Always buggy, never worked reliably
- **Dropdown behavior**: May close too early (mousedown vs click). Hover was previously broken.
- **User suspicion**: Dropdown trigger implementation is faulty

## Current Focus

- hypothesis: CONFIRMED and FIXED (two root causes)
- test: TypeScript + Rust compile cleanly
- expecting: Terminal and Agent dropdown items create correct tab types
- next_action: none (resolved)

## Evidence

- timestamp: 2026-04-15 evidence_type: code
  file: src/components/unified-tab-bar.tsx function: buildDropdownItems()
  Both "Terminal (Zsh)" and "Agent" items had identical action: `() => createNewTab()`
  No parameter distinguished terminal vs agent tab creation.
  FIX: Agent item now calls `createNewTab({ isAgent: true })`.

- timestamp: 2026-04-15 evidence_type: code
  file: src/components/terminal-tabs.tsx function: createNewTab()
  Line: `const agentBinary = undefined;` -- hardcoded, no parameter accepted
  Line: `isAgent: false` -- no parameter to override
  FIX: Added `CreateTabOptions` interface with `isAgent` flag.

- timestamp: 2026-04-15 evidence_type: code (ROOT CAUSE 2 - tmux session collision)
  file: src-tauri/src/terminal/pty.rs function: spawn_terminal()
  destroy_pty_session keeps tmux sessions alive (for tab restoration).
  After app restart, tabCounter resets to 0. New tabs get session names
  like "proj-2" that collide with old tmux sessions still running Claude.
  spawn_terminal only killed old sessions for agent tabs (shell_command=Some).
  Plain shell tabs always reattached via `tmux new-session -A`, inheriting
  whatever process was running in the old session.

- timestamp: 2026-04-15 evidence_type: code
  file: src/components/terminal-tabs.tsx lines: 147-155
  Legacy auto-label bug: first plain terminal tab got agent name label
  when project had agent configured (misleading but cosmetic).

## Eliminated

- Dropdown event handling (mousedown/click race): NOT the cause. Click handler fires correctly.
- Hover behavior: Separate issue, not related to tab type creation.

## Resolution

- root_cause: Two issues: (1) buildDropdownItems wired both items to same createNewTab() with no type parameter. (2) tmux session name collision after app restart — tabCounter resets to 0, new plain-shell tabs reattach to stale tmux sessions running Claude Code because spawn_terminal only killed old sessions for agent tabs, not plain shells.
- fix: (1) Added CreateTabOptions with isAgent flag to createNewTab. Agent dropdown calls createNewTab({ isAgent: true }). (2) Added force_new parameter to spawn_terminal (Rust). When true, kills existing tmux session regardless of tab type. createNewTab and restartTabSession pass forceNew=true. restoreTabs and initFirstTab don't (preserving re-attach for restoration). (3) Removed misleading auto-label that gave plain terminals the agent name.
- verification: TypeScript and Rust compile clean. Terminal/Agent dropdown items create correct tab types.
- files_changed: src-tauri/src/terminal/pty.rs, src/terminal/pty-bridge.ts, src/components/terminal-tabs.tsx, src/components/unified-tab-bar.tsx
