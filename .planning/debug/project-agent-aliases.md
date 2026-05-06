---
status: investigating
trigger: "Project agent setup only works with c/opencode; other aliases/scripts do not launch and missing commands show raw os error"
created: 2026-05-06
updated: 2026-05-06
---

# Debug Session: project-agent-aliases

## Symptoms

### Expected behavior
- Project agent setup accepts any available command, alias, or script, not only `c` or `opencode`.
- Commands such as `ccscodex`, `gemini`, `qwencode`, or `pi` should work when available.
- Missing commands should show a friendly “agent not available” message and allow the user to fix/update the setting.

### Actual behavior
- `c` works.
- `opencode` works.
- `ccscodex` opens only the terminal; the agent does not open.
- Nonexistent `ccscode` shows `No such file or directory (os error 2)` in the modal.
- Logs report `[efxmux] Failed to save state:"No such file or directory (os error 2)"`, which is misleading.

### Error messages
- Modal: `No such file or directory (os error 2)`.
- Log: `[efxmux] Failed to save state:"No such file or directory (os error 2)"`.

### Timeline
- Observed while editing project agent setup on 2026-05-06.

### Reproduction
1. Open project agent setup.
2. Set agent command to `ccscodex`.
3. Open project/agent.
4. Observe only the terminal opens.
5. Set agent command to nonexistent `ccscode`.
6. Observe raw OS error in the modal and misleading save-state log.

## Current Focus

- hypothesis: "Unknown; gather initial evidence before fixing."
- test: ""
- expecting: ""
- next_action: "gather initial evidence"
- reasoning_checkpoint: ""
- tdd_checkpoint: "pending failing regression test"

## Evidence

- timestamp: 2026-05-06T17:18: `ccscodex` exists only in interactive zsh: `zsh -ic 'command -v ccscodex'` returns alias, while `zsh -lc 'command -v ccscodex'` cannot find it.
- timestamp: 2026-05-06T17:18: frontend `detectAgent()` called Rust `detect_agent`, which used `Command::new("which")`; this cannot see shell aliases/functions.
- timestamp: 2026-05-06T17:18: PTY launch wrapper used non-interactive shell `-c`, so even a command detected via interactive shell would not expand aliases.
- timestamp: 2026-05-06T17:25: failing regression observed: `detectAgent('ccscode')` propagated raw `No such file or directory (os error 2)` instead of friendly unavailable-agent copy.
- timestamp: 2026-05-06T17:32: failing regression observed: project modal saved/switched project when agent validation failed instead of keeping the modal editable with a friendly message.

## Eliminated

- hypothesis: Custom commands fail because terminal tab code drops the configured agent before PTY spawn.
  evidence: Focused terminal-tab regression shows `ccscodex` is passed to `spawn_terminal` when `detect_agent` returns it.
- hypothesis: Missing command error originates in `save_state` itself.
  evidence: State save log is a secondary effect; raw OS error originates from agent command detection/launch path.

## Resolution

- root_cause: "Agent validation and launch treated agent as a PATH binary. Rust used `which`, which cannot see zsh aliases/functions like `ccscodex`, and PTY wrappers used non-interactive shell `-c`, which does not expand aliases. Frontend also propagated raw backend errors and modal did not validate agent before saving/switching."
- fix: "Validate agent commands through the user's interactive shell, launch agent wrappers with interactive shell mode, add safe command-name validation, convert detectAgent errors to friendly copy, and validate the Project Modal agent before saving."
- verification: "Focused Vitest regressions pass; Rust cargo test passes. Full terminal-tabs suite still has pre-existing legacy main/right expectation failures unrelated to this change. Typecheck still has pre-existing test typing failures."
- files_changed: ["src-tauri/src/server.rs", "src-tauri/src/terminal/pty.rs", "src/server/server-bridge.ts", "src/server/server-bridge.test.ts", "src/components/project-modal.tsx", "src/components/project-modal.test.tsx", "src/components/terminal-tabs.test.ts"]
