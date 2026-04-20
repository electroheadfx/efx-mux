use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};
use crate::theme::types::load_or_create_theme;

/// High watermark: pause PTY reads when unacknowledged bytes exceed this threshold.
const FLOW_HIGH_WATERMARK: u64 = 400_000;

/// Low watermark: resume PTY reads when unacknowledged bytes drop below this threshold.
/// Hysteresis prevents rapid pause/resume oscillation (HIGH=400KB pause, LOW=100KB resume).
const FLOW_LOW_WATERMARK: u64 = 100_000;

/// Per-session PTY state holding handles and flow control counters.
pub struct PtyState {
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    /// Tracks cumulative bytes sent to frontend (cloned into read thread before struct creation).
    #[allow(dead_code)]
    pub sent_bytes: Arc<AtomicU64>,
    pub acked_bytes: Arc<AtomicU64>,
    /// Must stay alive until child exits (portable-pty gotcha from CLAUDE.md).
    #[allow(dead_code)]
    pub slave: Arc<Mutex<Option<Box<dyn portable_pty::SlavePty + Send>>>>,
}

/// Tauri-managed wrapper for multiple named PTY sessions (D-09).
/// Replaces single PtyState managed by app.manage().
pub struct PtyManager(pub Mutex<HashMap<String, PtyState>>);

/// Probe for tmux availability. Returns version string or error with install instructions.
pub fn check_tmux() -> Result<String, String> {
    let output = std::process::Command::new("tmux")
        .arg("-V")
        .output()
        .map_err(|_| "tmux not found. Install with: brew install tmux".to_string())?;
    if !output.status.success() {
        return Err("tmux not found. Install with: brew install tmux".to_string());
    }
    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
        .map(|s| s.trim().to_string())
}

/// Spawn a terminal session inside tmux via portable-pty.
/// Streams PTY output to the frontend via a Tauri Channel.
#[tauri::command]
pub async fn spawn_terminal(
    app: tauri::AppHandle,
    on_output: tauri::ipc::Channel<Vec<u8>>,
    session_name: String,
    start_dir: Option<String>,
    shell_command: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    force_new: Option<bool>,
) -> Result<(), String> {
    // Sanitize session_name: allow only alphanumeric, hyphen, underscore (T-02-01 mitigation)
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name: must contain at least one alphanumeric character".to_string());
    }

    // If the tmux session already exists, behaviour is driven by `force_new`:
    //
    // force_new = true  (e.g. createNewTabScoped): kill + fresh new-session so any
    //   shell_command runs from scratch with the inline-export env wrapper.
    //
    // force_new = false (e.g. restore path): re-attach to the living session to
    //   preserve the running agent / shell state. This is what quit+restart needs
    //   so Claude Code keeps its history and in-flight state instead of being torn
    //   down and re-spawned (which produced the "rewind-at-start / [exited]" chaos
    //   described in debug session 22-persistence-chaos). When shell_command is
    //   provided alongside force_new=false, tmux new-session -A silently ignores
    //   the initial-command argument — that's intentional: the agent is already
    //   running inside the session.
    //
    // PLAIN SHELL TABS (shell_command is None): same logic — reattach on restore,
    //   kill on force_new. Scrollback is cleared on reattach to avoid stale dumps.
    let session_exists = std::process::Command::new("tmux")
        .args(["has-session", "-t", &sanitized])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let wants_fresh = force_new.unwrap_or(false);
    if session_exists {
        if wants_fresh {
            // Debug 22-pty-session-collision defense-in-depth: refuse to kill
            // a session that an active PTY client is currently attached to
            // (i.e. already registered in PtyManager). A frontend bug that
            // allocates a colliding session name must surface as a spawn
            // error, NOT silently clobber the victim's live tmux session
            // (which would mark the victim tab [exited] via the pane-death
            // monitor and lose user state).
            //
            // If the PtyManager does not have an entry for this name, the
            // session is an orphan from a previous run / external process —
            // killing it is safe and intended.
            let is_attached = app
                .try_state::<PtyManager>()
                .and_then(|mgr| mgr.0.lock().ok().map(|m| m.contains_key(&sanitized)))
                .unwrap_or(false);
            if is_attached {
                return Err(format!(
                    "[efxmux] refusing to kill live tmux session '{}' — frontend session-name collision (debug:22-pty-session-collision)",
                    sanitized
                ));
            }
            // Orphan session: kill so tmux new-session below creates a FRESH one.
            let _ = std::process::Command::new("tmux")
                .args(["kill-session", "-t", &sanitized])
                .output();
        } else {
            // Restoration / re-attach: clear scrollback history only -- do NOT send Ctrl+L.
            //
            // Sending `send-keys C-l` to an existing session fires a Ctrl+L keystroke
            // into whatever process is currently running (e.g., Claude Code's Ink TUI)
            // BEFORE the new PTY client attaches and establishes its window dimensions.
            // Ink interprets Ctrl+L as a clear-screen + full redraw. At that moment tmux
            // still has the stale dimensions from the previously detached client, so Ink
            // measures the wrong window size, its alternate-screen entry fails, and it
            // falls back to the "tmux detected · scroll with PgUp/PgDn" inline mode.
            //
            // clear-history alone is sufficient to prevent stale scrollback from being
            // dumped to the new client on attach.
            let _ = std::process::Command::new("tmux")
                .args(["clear-history", "-t", &sanitized])
                .output()
                .and_then(|o| {
                    if !o.status.success() {
                        let stderr = String::from_utf8_lossy(&o.stderr);
                        if !stderr.is_empty() {
                            eprintln!("[efxmux] clear-history warning: {}", stderr.trim());
                        }
                    }
                    Ok(o)
                });
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.env("TERM", "xterm-256color");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    // Inject Claude Code env vars directly into the PTY process environment.
    // macOS .app bundles launched by launchd receive a minimal environment —
    // user shell profile scripts (e.g. ~/.zshrc, custom wrapper scripts) are
    // NOT sourced. Any env vars the agent binary needs must be set explicitly here.
    //
    // CLAUDE_CODE_NO_FLICKER=1 suppresses the "tmux detected" fallback mode:
    // without it, Claude Code detects tmux and renders inline (non-fullscreen)
    // instead of using the alternate screen buffer (fullscreen TUI).
    cmd.env("CLAUDE_CODE_NO_FLICKER", "1");
    cmd.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
    cmd.env("ENABLE_LSP_TOOL", "1");
    cmd.args(["new-session", "-A", "-s", &sanitized]);
    // Set tmux session start directory if provided (workspace-aware sessions)
    if let Some(ref dir) = start_dir {
        if std::path::Path::new(dir).is_dir() {
            cmd.args(["-c", dir]);
        }
    }
    // If shell_command is provided (e.g., agent binary), wrap it so the user
    // drops into an interactive shell after the agent exits (AGENT-03/04).
    // Plain `-c` is correct here — no login shell needed.
    // NOTE: cmd.env() calls above set vars on the tmux CLIENT process only.
    // tmux spawns the shell from the SERVER's environment, not the client's,
    // so those vars do NOT reach the shell. Env vars must be exported inline
    // inside the shell wrapper command (see format! below).
    if let Some(ref shell_cmd) = shell_command {
        if !shell_cmd.is_empty() {
            let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            // Inline export is required because tmux spawns shells from the SERVER's
            // environment, not the connecting client's. cmd.env() above sets vars on
            // the tmux CLIENT process only — those do NOT propagate into the shell that
            // tmux creates inside the session. Only inline export in the shell command
            // itself (or tmux -e flag) reliably delivers env vars to the spawned process.
            // This mirrors the approach already used in switch_tmux_session().
            let wrapped = format!(
                "{} -c 'export CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ENABLE_LSP_TOOL=1; {}; exec {}'",
                user_shell, shell_cmd, user_shell
            );
            cmd.arg(&wrapped);
        }
    }

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Enable tmux mouse mode so mouse wheel scrolls the buffer (not sent as arrow keys)
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "mouse", "on"])
        .output()
        .ok();

    // Set remain-on-exit so we can query exit code after process dies (D-08, UX-03)
    let _ = std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "remain-on-exit", "on"])
        .output();

    // Keep tmux status bar visible, painted to match terminal background
    // so the row-remainder gap between xterm's last cell row and the pane
    // bottom is invisible (same color as terminal bg).
    let theme = load_or_create_theme();
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "status", "on"])
        .output()
        .ok();
    std::process::Command::new("tmux")
        .args([
            "set-option", "-t", &sanitized, "status-style",
            &format!("bg={},fg={}", theme.terminal.background, theme.terminal.foreground),
        ])
        .output()
        .ok();

    // take_writer() is one-shot -- store in Arc<Mutex<>> for reuse (CLAUDE.md gotcha)
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let sent_bytes = Arc::new(AtomicU64::new(0));
    let acked_bytes = Arc::new(AtomicU64::new(0));

    let state = PtyState {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
        sent_bytes: sent_bytes.clone(),
        acked_bytes: acked_bytes.clone(),
        slave: Arc::new(Mutex::new(Some(pair.slave))),
    };

    // Insert into PtyManager HashMap (D-09) instead of app.manage(state)
    let manager = app.state::<PtyManager>();
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    map.insert(sanitized.clone(), state);
    drop(map);

    let sent = sent_bytes;
    let acked = acked_bytes;

    // Shared stop flag: monitoring thread sets this when pane dies,
    // read loop checks it to break out (since remain-on-exit keeps PTY alive).
    let stopped = Arc::new(AtomicBool::new(false));
    let stopped_for_reader = stopped.clone();

    // PTY read loop on dedicated OS thread (NOT tokio::spawn -- Research Pitfall 5)
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        let mut paused = false;
        loop {
            // Check if monitoring thread detected pane death
            if stopped_for_reader.load(Ordering::Relaxed) {
                break;
            }

            // Flow control: hysteresis between HIGH (400KB) and LOW (100KB) watermarks
            let unacked = sent.load(Ordering::Relaxed)
                .saturating_sub(acked.load(Ordering::Relaxed));

            if paused {
                // Resume only when unacked drops below LOW watermark
                if unacked <= FLOW_LOW_WATERMARK {
                    paused = false;
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    continue;
                }
            } else if unacked > FLOW_HIGH_WATERMARK {
                // Pause when unacked exceeds HIGH watermark
                paused = true;
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }

            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    sent.fetch_add(n as u64, Ordering::Relaxed);
                    if on_output.send(chunk).is_err() {
                        break; // Channel closed
                    }
                }
                Err(_) => break,
            }
        }
        // Read loop exited (EOF, error, or stopped flag). No exit detection here --
        // the monitoring thread handles that independently.
    });

    // --- Pane-death monitoring thread (08-05, UX-03, D-08) ---
    // remain-on-exit keeps the PTY master alive after shell exit, so the read loop
    // never gets EOF. This separate thread polls tmux pane_dead status to detect
    // process exit and emit pty-exited with the real exit code.
    let app_for_monitor = app.clone();
    let session_for_monitor = sanitized.clone();
    std::thread::spawn(move || {
        // Initial delay: short grace for tmux to register the session. Previously
        // 1s, shortened to 100ms so reattach-to-already-dead panes surface the
        // `pty-exited` event quickly enough to beat UI restore races.
        // (debug:terminal-exited-no-restart)
        std::thread::sleep(std::time::Duration::from_millis(100));

        loop {
            // Check if session still exists at all
            let session_exists = std::process::Command::new("tmux")
                .args(["has-session", "-t", &session_for_monitor])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if !session_exists {
                // Session gone (external kill, tmux server died) -- emit exit code 0
                stopped.store(true, Ordering::Relaxed);
                let payload = serde_json::json!({
                    "session": session_for_monitor,
                    "code": 0
                });
                let _ = app_for_monitor.emit("pty-exited", payload);
                break;
            }

            // Poll pane_dead status
            let pane_dead = std::process::Command::new("tmux")
                .args(["display-message", "-t", &session_for_monitor, "-p", "#{pane_dead}"])
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        String::from_utf8(o.stdout).ok()
                    } else {
                        None
                    }
                })
                .map(|s| s.trim() == "1")
                .unwrap_or(false);

            if pane_dead {
                // Pane is dead -- query real exit code before killing session
                let exit_code = std::process::Command::new("tmux")
                    .args(["display-message", "-t", &session_for_monitor, "-p", "#{pane_dead_status}"])
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
                    .unwrap_or(0); // T-08-05-02: default to 0 if parsing fails

                // Kill the dead session now that we have the exit code
                let _ = std::process::Command::new("tmux")
                    .args(["kill-session", "-t", &session_for_monitor])
                    .output();

                // Signal read loop to stop
                stopped.store(true, Ordering::Relaxed);

                // Emit pty-exited with real exit code
                let payload = serde_json::json!({
                    "session": session_for_monitor,
                    "code": exit_code
                });
                let _ = app_for_monitor.emit("pty-exited", payload);
                break;
            }

            // Poll every 500ms
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    Ok(())
}

/// Write input data to the PTY master (keystrokes from xterm.js).
#[tauri::command]
pub fn write_pty(data: String, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize the PTY. This is a control operation that bypasses flow control (D-14).
#[tauri::command]
pub fn resize_pty(cols: u16, rows: u16, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    let master = state.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Acknowledge processed bytes from the frontend for flow control (D-11).
#[tauri::command]
pub fn ack_bytes(count: u64, session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let state = map.get(&session_name)
        .ok_or_else(|| format!("No PTY session found: {}", session_name))?;
    state.acked_bytes.fetch_add(count, Ordering::Relaxed);
    Ok(())
}

/// Switch a tmux client from one session to another without PTY output.
/// Creates the target session (detached) if it doesn't exist.
/// Runs tmux commands as system processes — completely silent in the terminal.
#[tauri::command]
pub fn switch_tmux_session(
    current_session: String,
    target_session: String,
    start_dir: Option<String>,
    shell_command: Option<String>,
) -> Result<(), String> {
    // Sanitize target session name
    let target: String = target_session
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if target.is_empty() {
        return Err("Invalid target session name".to_string());
    }

    // Create target session if it doesn't exist
    let has = std::process::Command::new("tmux")
        .args(["has-session", "-t", &target])
        .output();
    let needs_create = match has {
        Ok(out) => !out.status.success(),
        Err(_) => true,
    };
    if needs_create {
        let mut args = vec!["new-session", "-d", "-s", &target];
        let dir_str;
        if let Some(ref dir) = start_dir {
            if std::path::Path::new(dir).is_dir() {
                dir_str = dir.clone();
                args.push("-c");
                args.push(&dir_str);
            }
        }
        // If a shell command (agent binary) is specified, wrap it so the user
        // drops into an interactive shell after the agent exits (AGENT-03/04).
        // Env vars (CLAUDE_CODE_NO_FLICKER etc.) are already in the environment
        // inherited from the Tauri process via CommandBuilder in spawn_terminal.
        // switch_tmux_session creates sessions via std::process::Command (system
        // tmux) rather than a PTY CommandBuilder, so the env var must be passed
        // explicitly through the shell wrapper when needed.
        let shell_cmd_str;
        if let Some(ref cmd) = shell_command {
            if !cmd.is_empty() {
                let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                shell_cmd_str = format!(
                    "{} -c 'export CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ENABLE_LSP_TOOL=1; {}; exec {}'",
                    user_shell, cmd, user_shell
                );
                args.push(&shell_cmd_str);
            }
        }
        std::process::Command::new("tmux")
            .args(&args)
            .output()
            .map_err(|e| e.to_string())?;
    }

    // Enable mouse mode on target session
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &target, "mouse", "on"])
        .output()
        .ok();

    // Keep tmux status bar visible, match terminal background
    let theme = load_or_create_theme();
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &target, "status", "on"])
        .output()
        .ok();
    std::process::Command::new("tmux")
        .args([
            "set-option", "-t", &target, "status-style",
            &format!("bg={},fg={}", theme.terminal.background, theme.terminal.foreground),
        ])
        .output()
        .ok();

    // Find the client attached to the current session
    let clients_out = std::process::Command::new("tmux")
        .args(["list-clients", "-t", &current_session, "-F", "#{client_name}"])
        .output();
    let client_name = match clients_out {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.lines().next().unwrap_or("").to_string()
        }
        Err(_) => String::new(),
    };

    if client_name.is_empty() {
        // Fallback: try switching without specifying client (works if only one client)
        std::process::Command::new("tmux")
            .args(["switch-client", "-t", &target])
            .output()
            .map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new("tmux")
            .args(["switch-client", "-c", &client_name, "-t", &target])
            .output()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Destroy a PTY session: remove from PtyManager and drop all handles.
/// The read thread will exit when the master PTY fd is closed.
/// The tmux session is kept alive so tabs can be restored on project switch-back.
/// Stale screen content is handled by clearing history before re-attach in spawn_terminal.
#[tauri::command]
pub fn destroy_pty_session(session_name: String, manager: tauri::State<'_, PtyManager>) -> Result<(), String> {
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    // Remove drops the PtyState which closes the master PTY fd.
    // The read thread will get EOF and exit. The tmux client will detach.
    // The tmux session stays alive for re-attach on project switch-back.
    map.remove(&sanitized);

    Ok(())
}

/// List active PTY session names (debugging utility).
#[tauri::command]
pub fn get_pty_sessions(manager: tauri::State<'_, PtyManager>) -> Result<Vec<String>, String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    Ok(map.keys().cloned().collect())
}

/// Clean up dead tmux sessions left over from prior runs (08-05, UX-03).
/// Queries all tmux sessions for pane_dead=1 and kills them.
/// Called from JS on app startup to prevent reattaching to dead sessions.
#[tauri::command]
pub fn cleanup_dead_sessions() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}:#{pane_dead}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // No tmux server running -- nothing to clean up
        return Ok(vec![]);
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let mut cleaned = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() == 2 && parts[1] == "1" {
            let session_name = parts[0];
            let _ = std::process::Command::new("tmux")
                .args(["kill-session", "-t", session_name])
                .output();
            cleaned.push(session_name.to_string());
        }
    }

    Ok(cleaned)
}

/// Phase 20 D-19: Kill legacy "<project>-right" tmux sessions from the pre-Phase-20
/// right-panel layout. Best-effort; silently ignores missing sessions. Called once
/// at app bootstrap (after `cleanup_dead_sessions`).
///
/// Returns the list of session names actually killed (for logging). Never returns Err —
/// migration is best-effort and must not block startup (T-20-09 mitigation).
///
/// Project names are sanitized identically to `send_literal_sequence` / `spawn_terminal`
/// (alphanumeric + '-' + '_', lowercased) before being joined with the `-right` suffix,
/// so a tampered project name cannot target an arbitrary session (T-20-07 mitigation).
#[tauri::command]
pub fn kill_legacy_right_sessions(project_names: Vec<String>) -> Result<Vec<String>, String> {
    let mut killed = Vec::new();
    for name in project_names {
        // Mirror pty.rs session-name sanitizer: alphanumeric + '-' + '_', lowercased.
        let sanitized: String = name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect::<String>()
            .to_lowercase();
        if sanitized.is_empty() {
            continue;
        }
        let target = format!("{}-right", sanitized);
        // tmux returns non-zero when session doesn't exist — treat as no-op.
        if let Ok(out) = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &target])
            .output()
        {
            if out.status.success() {
                killed.push(target);
            }
        }
    }
    Ok(killed)
}

/// Send a literal byte sequence directly to a tmux pane's stdin.
/// Uses `tmux send-keys -l` which bypasses tmux's key-parsing table entirely,
/// so sequences like \x1b[13;2u (CSI u / kitty keyboard protocol) reach the
/// inner program (e.g. Claude Code) without being eaten by tmux's key parser.
/// This is necessary because extended-keys=off means tmux does not recognise
/// CSI u when it arrives via the PTY master (keyboard-input path).
#[tauri::command]
pub fn send_literal_sequence(session_name: String, sequence: String) -> Result<(), String> {
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name".to_string());
    }
    std::process::Command::new("tmux")
        .args(["send-keys", "-t", &sanitized, "-l", &sequence])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the version string of an AI agent binary (claude, opencode).
/// Validates agent name against a whitelist before executing (T-09-09 mitigation).
#[tauri::command]
pub async fn get_agent_version(agent: String) -> Result<String, String> {
    let valid_agents = ["claude", "opencode"];
    if !valid_agents.contains(&agent.as_str()) {
        return Err(format!("Unknown agent: {}", agent));
    }

    let output = std::process::Command::new(&agent)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run {} --version: {}", agent, e))?;

    if !output.status.success() {
        return Err(format!("{} --version exited with {}", agent, output.status));
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version_str.lines().next().unwrap_or(&version_str).to_string())
}
