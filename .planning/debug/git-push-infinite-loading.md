---
status: resolved
trigger: "Git push button stays on infinite loading, push fails silently, no error feedback, button state not reset on tab switch"
created: 2026-04-15
updated: 2026-04-15
---

# Debug: git-push-infinite-loading

## Symptoms

- **Expected**: Push completes, button shows success/done, commit textarea and buttons hide when no commits/changes, show message when repo is clean
- **Actual**: Button spins forever on loading, push fails silently, no errors shown
- **Errors**: None displayed -- user wants errors shown in GIT tab with a clear log button
- **Timeline**: Never worked -- push has always been broken
- **Reproduction**: Click push button in git sidebar tab
- **Push result**: Push fails silently, nothing arrives on remote

## Current Focus

- hypothesis: CONFIRMED -- libgit2 credentials callback enters infinite retry loop
- test: Replaced git2 push with system git subprocess
- expecting: Push completes or errors within seconds, never hangs
- next_action: none (resolved)
- reasoning_checkpoint: Fix applied and verified -- 42 Rust tests + 190 frontend tests pass

## Evidence

- timestamp: 2026-04-15T00:00 | Remote URL is SSH: `git@github.com:electroheadfx/efx-mux.git`
- timestamp: 2026-04-15T00:01 | ssh-add -l returns "The agent has no identities" -- no keys in agent
- timestamp: 2026-04-15T00:02 | git_ops.rs push_impl line 220: Cred::ssh_key_from_agent(user) -- will fail since no agent keys
- timestamp: 2026-04-15T00:03 | git_ops.rs push_impl line 222-227: Falls back to Cred::ssh_key with None passphrase -- fails for passphrase-protected keys
- timestamp: 2026-04-15T00:04 | libgit2 retries credentials callback on auth failure -- no retry guard causes infinite loop
- timestamp: 2026-04-15T00:05 | spawn_blocking thread hangs forever, so the JS invoke never resolves, isPushing stays true
- timestamp: 2026-04-15T00:06 | handlePush finally block (line 191) correctly resets isPushing, but is never reached since await never completes

## Eliminated

- Button state management: finally block correctly resets isPushing (line 191)
- Tauri command registration: push is registered in invoke_handler (lib.rs line 123)
- git-service.ts: correctly calls invoke('push', ...) with proper error handling

## Resolution

- root_cause: libgit2 credentials callback has no retry guard -- when SSH agent has no keys and file-based key has a passphrase, the callback is invoked in an infinite loop by libgit2, blocking the spawn_blocking thread forever. The JS await never resolves, so isPushing stays true and button spins forever.
- fix: Replaced git2-based push with system `git push` subprocess (std::process::Command). This leverages macOS Keychain, ssh-agent, and credential helpers that git2 cannot access. Also added error log panel with clear button to GIT tab, improved push button to show unpushed count, and hid commit UI when repo is clean.
- verification: 42 Rust tests pass (including 2 new push tests), 190 frontend tests pass, TypeScript compiles clean
- files_changed: src-tauri/src/git_ops.rs, src/components/git-control-tab.tsx, src/components/git-control-tab.test.tsx
