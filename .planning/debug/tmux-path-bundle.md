---
status: awaiting_human_verify
trigger: "tmux not found in PATH when running from /Applications. Error: Failed to restore session 'efx-mux': Unable to spawn tmux because: S found in PATH '/usr/bin:/bin:/usr/sbin:/sbin'"
created: 2026-04-13T00:00:00Z
updated: 2026-04-13T00:00:00Z
---

## Current Focus

hypothesis: macOS .app bundles inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that excludes /opt/homebrew/bin. Every std::process::Command::new("tmux") in pty.rs resolves via PATH at runtime. When launched from terminal, shell profile has added /opt/homebrew/bin. When launched as bundle from /Applications, that augmentation never happens.
test: Confirmed by inspecting pty.rs — all tmux invocations use bare "tmux" binary name, no absolute path, no PATH augmentation in lib.rs setup(). tmux lives at /opt/homebrew/bin/tmux which is absent from bundle PATH.
expecting: Fix = prepend /opt/homebrew/bin:/usr/local/bin to process PATH at startup in lib.rs setup(), before check_tmux() is called.
next_action: Await human verification — build bundle and test from /Applications

## Symptoms

expected: tmux found at /opt/homebrew/bin/tmux, app restores session successfully
actual: tmux not found when running from /Applications. PATH is "/usr/bin:/bin:/usr/sbin:/sbin" which is missing /opt/homebrew/bin
errors: "Failed to restore session 'efx-mux': Unable to spawn tmux because: S found in PATH '/usr/bin:/bin:/usr/sbin:/sbin'"
reproduction: Build Tauri app, copy .app to /Applications, run it
started: Broke after moving to bundled location (always broken in bundle — never worked from /Applications)

## Eliminated

(none — root cause identified directly from evidence)

## Evidence

- timestamp: 2026-04-13T00:00:00Z
  checked: which tmux in terminal
  found: /opt/homebrew/bin/tmux — tmux is installed at Homebrew path, not in /usr/bin
  implication: Any process not launched via a Homebrew-aware shell will not find tmux

- timestamp: 2026-04-13T00:00:00Z
  checked: src-tauri/src/terminal/pty.rs — all tmux invocations
  found: Every call uses std::process::Command::new("tmux") with bare binary name. No PATH env set, no absolute path. Functions affected: check_tmux(), spawn_terminal() (7 calls), switch_tmux_session() (4 calls), cleanup_dead_sessions() (1 call), and the monitoring thread (3 calls).
  implication: All tmux operations fail when process PATH lacks /opt/homebrew/bin

- timestamp: 2026-04-13T00:00:00Z
  checked: src-tauri/src/lib.rs setup() function
  found: No PATH augmentation anywhere. check_tmux() is called at line 76 but will fail because PATH is already minimal when the bundle launches.
  implication: The fix must prepend Homebrew paths to std::env PATH at the very start of setup(), before check_tmux() and before any Command is spawned.

- timestamp: 2026-04-13T00:00:00Z
  checked: src-tauri/src/server.rs Command::new usages
  found: Uses Command::new("sh") and Command::new("which") — both PATH-sensitive. Also benefits from the process-level PATH fix.
  implication: Single fix point in lib.rs setup() covers all commands in all modules via inherited process environment.

## Resolution

root_cause: macOS .app bundles launch with a stripped system PATH (/usr/bin:/bin:/usr/sbin:/sbin) that excludes /opt/homebrew/bin where tmux is installed. The app never augments the process PATH, so every std::process::Command::new("tmux") fails with "not found" when run from /Applications.
fix: In lib.rs setup(), before check_tmux(), prepend /opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin to the process PATH with std::env::set_var("PATH", ...). This is applied once and all child processes (tmux, shell, agent CLIs) inherit the augmented PATH automatically.
verification: (pending)
files_changed: [src-tauri/src/lib.rs]
