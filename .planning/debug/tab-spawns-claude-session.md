---
status: investigating
trigger: "After the third terminal tab, it becomes a Claude session instead of a plain terminal"
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## Current Focus

hypothesis: createNewTab() calls resolveAgentBinary(projectInfo?.agent) which returns the claude binary for ALL new tabs, not just the first. The first tab is labeled differently but tabs 2+ still get agentBinary passed to connectPty, which passes it as shell_command to spawn_terminal, which wraps it in tmux session.
test: Read createNewTab() logic for agent binary resolution
expecting: If agentBinary is resolved for every tab, all tabs get the agent command
next_action: Confirm by tracing createNewTab -> resolveAgentBinary -> connectPty -> spawn_terminal chain

## Symptoms

expected: New tabs created with Ctrl+T should each get a fresh plain terminal (bash/zsh) session
actual: After the third terminal tab, it becomes a Claude session instead of a plain terminal. Also, new tabs are not stored/restored on quit.
errors: None reported
reproduction: Test 3 in UAT - create 3+ tabs with Ctrl+T
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-04-10T12:00:00Z
  checked: createNewTab() in terminal-tabs.tsx lines 92-164
  found: Line 129 calls resolveAgentBinary(projectInfo?.agent) for EVERY new tab. projectInfo comes from getActiveProjectInfo() which returns the active project's agent setting (e.g., 'claude'). This means every tab gets agentBinary resolved.
  implication: All new tabs spawn the configured agent (e.g., claude), not a plain shell. The label logic on lines 110-115 only affects the LABEL (first tab gets "Claude", others get "Terminal N"), but the actual PTY command is the same for all tabs.

- timestamp: 2026-04-10T12:01:00Z
  checked: initFirstTab() in terminal-tabs.tsx lines 244-314
  found: initFirstTab() receives agentBinary as parameter from main.tsx bootstrap (line 225). main.tsx explicitly resolves agent only for first tab. But createNewTab() independently resolves agent for every subsequent tab.
  implication: The design intent was likely: first tab = agent, new tabs = plain shell. But createNewTab() doesn't distinguish.

- timestamp: 2026-04-10T12:02:00Z
  checked: connectPty -> spawn_terminal chain
  found: connectPty passes shellCommand to spawn_terminal. In pty.rs lines 88-96, if shell_command is Some and non-empty, tmux wraps it as the session command. So passing agentBinary makes the tmux session run that agent.
  implication: The fix is in createNewTab() - it should NOT call resolveAgentBinary for non-first tabs. New tabs should always be plain shell (no agentBinary).

## Resolution

root_cause: createNewTab() in terminal-tabs.tsx (line 129) calls resolveAgentBinary(projectInfo?.agent) for EVERY new tab, not just the first. This passes the agent binary (e.g., claude) as shell_command to the PTY backend, causing every new tab to spawn a Claude Code session instead of a plain shell. The label logic correctly differentiates (first tab = "Claude", others = "Terminal N"), but the actual PTY command does not.
fix:
verification:
files_changed: []
