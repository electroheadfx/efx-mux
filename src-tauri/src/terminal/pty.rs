use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

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
) -> Result<(), String> {
    // Sanitize session_name: allow only alphanumeric, hyphen, underscore (T-02-01 mitigation)
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name: must contain at least one alphanumeric character".to_string());
    }

    // If the tmux session already exists (e.g., switching back to a project),
    // clear its screen and scrollback history BEFORE re-attaching a new PTY client.
    // This prevents tmux from dumping stale screen content to the new client,
    // which xterm.js would render as extra blank lines (the original newlines bug).
    let session_exists = std::process::Command::new("tmux")
        .args(["has-session", "-t", &sanitized])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if session_exists {
        // Clear the visible pane content (like Ctrl+L) -- ignore errors if terminal
        // is in a state that doesn't support it (e.g., no scrollback or tmux version mismatch)
        let _ = std::process::Command::new("tmux")
            .args(["send-keys", "-t", &sanitized, "C-l"])
            .output();
        // Clear the scrollback history buffer -- capture stderr to prevent tmux error
        // "terminal does not support clear" from leaking into PTY output stream
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
    cmd.args(["new-session", "-A", "-s", &sanitized]);
    // Set tmux session start directory if provided (workspace-aware sessions)
    if let Some(ref dir) = start_dir {
        if std::path::Path::new(dir).is_dir() {
            cmd.args(["-c", dir]);
        }
    }
    // If shell_command is provided (e.g., agent binary), wrap it so the user's shell
    // survives after the agent exits (Ctrl+C, /exit, etc.) — user lands in their
    // default shell instead of the tmux session dying (AGENT-03/04)
    if let Some(ref shell_cmd) = shell_command {
        if !shell_cmd.is_empty() {
            let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let wrapped = format!("{} -c '{}; exec {}'", user_shell, shell_cmd, user_shell);
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

    // Hide tmux green status bar -- reclaim the row for terminal content
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &sanitized, "status", "off"])
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
        // Initial delay: let tmux stabilize after session creation
        std::thread::sleep(std::time::Duration::from_secs(1));

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
        // If a shell command (agent binary) is specified, wrap it so the user's shell
        // survives after the agent exits — same wrapping as spawn_terminal (AGENT-03, AGENT-04).
        let shell_cmd_str;
        if let Some(ref cmd) = shell_command {
            if !cmd.is_empty() {
                let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                shell_cmd_str = format!("{} -c '{}; exec {}'", user_shell, cmd, user_shell);
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

    // Hide tmux green status bar on switched-to session
    std::process::Command::new("tmux")
        .args(["set-option", "-t", &target, "status", "off"])
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
