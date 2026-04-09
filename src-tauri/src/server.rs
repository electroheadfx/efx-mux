use std::collections::HashMap;
use std::io::BufRead;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// Per-project server entry storing the child process and its PID.
pub struct ServerEntry {
    pub child: std::process::Child,
    pub pid: u32,
}

/// Tauri-managed wrapper for per-project server processes.
/// Key = project name (String), Value = ServerEntry.
pub struct ServerProcesses(pub Mutex<HashMap<String, ServerEntry>>);

/// Start a server process for a specific project, streaming stdout/stderr to the frontend via events.
/// Kills any existing server process for that project first.
#[tauri::command]
pub async fn start_server(
    cmd: String,
    cwd: String,
    project_id: String,
    app: AppHandle,
) -> Result<(), String> {
    // Validate cwd exists and is a directory (T-07-02 mitigation)
    let cwd_path = std::path::Path::new(&cwd);
    if !cwd_path.exists() || !cwd_path.is_dir() {
        return Err(format!("Working directory '{}' does not exist or is not a directory", cwd));
    }

    // Kill existing server process for this project first
    stop_server_for_project(&app, &project_id)?;

    // Spawn the server process in its own process group
    // FORCE_COLOR=1: piped stdout is not a TTY, so most tools (Node/chalk/npm)
    // disable ANSI colors. This env var re-enables them.
    let mut child = Command::new("sh")
        .args(["-c", &cmd])
        .current_dir(&cwd)
        .env("FORCE_COLOR", "1")
        .env("CLICOLOR_FORCE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    // Take stdout and stderr before storing child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();

    // Store child in managed state under project_id
    {
        let sp = app.state::<ServerProcesses>();
        let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
        guard.insert(project_id.clone(), ServerEntry { child, pid });
    }

    // 07-05: EOF-based process exit detection instead of premature waitpid.
    let reader_count = Arc::new(AtomicU8::new(
        (stdout.is_some() as u8) + (stderr.is_some() as u8),
    ));

    // Guard: if no readers at all, emit stopped immediately
    if reader_count.load(Ordering::SeqCst) == 0 {
        let payload = serde_json::json!({ "project": project_id, "code": 0 });
        let _ = app.emit("server-stopped", payload);
        return Ok(());
    }

    // Spawn stdout reader thread (line-buffered to preserve ANSI sequences)
    if let Some(stdout) = stdout {
        let app_clone = app.clone();
        let count = reader_count.clone();
        let pid_for_wait = pid;
        let project_id_clone = project_id.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let text = text + "\n"; // Restore newline stripped by lines()
                        let payload = serde_json::json!({ "project": project_id_clone, "text": text });
                        let _ = app_clone.emit("server-output", payload);
                    }
                    Err(_) => break,
                }
            }
            // Last reader to finish emits server-stopped
            if count.fetch_sub(1, Ordering::SeqCst) == 1 {
                let mut status: libc::c_int = 0;
                let result =
                    unsafe { libc::waitpid(pid_for_wait as i32, &mut status, libc::WNOHANG) };
                let exit_code = if result > 0 && libc::WIFEXITED(status) {
                    libc::WEXITSTATUS(status)
                } else {
                    0 // Pipes closed, process exited normally
                };
                let payload = serde_json::json!({ "project": project_id_clone, "code": exit_code });
                let _ = app_clone.emit("server-stopped", payload);
                // Only remove entry if PID matches — prevents restart from orphaning the new process
                if let Ok(mut guard) = app_clone.state::<ServerProcesses>().0.lock() {
                    if let Some(entry) = guard.get(&project_id_clone) {
                        if entry.pid == pid_for_wait as u32 {
                            guard.remove(&project_id_clone);
                        }
                    }
                }
            }
        });
    }

    // Spawn stderr reader thread (line-buffered, same EOF pattern)
    if let Some(stderr) = stderr {
        let app_clone = app.clone();
        let count = reader_count.clone();
        let pid_for_wait = pid;
        let project_id_clone = project_id.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let text = text + "\n"; // Restore newline stripped by lines()
                        let payload = serde_json::json!({ "project": project_id_clone, "text": text });
                        let _ = app_clone.emit("server-output", payload);
                    }
                    Err(_) => break,
                }
            }
            if count.fetch_sub(1, Ordering::SeqCst) == 1 {
                let mut status: libc::c_int = 0;
                let result =
                    unsafe { libc::waitpid(pid_for_wait as i32, &mut status, libc::WNOHANG) };
                let exit_code = if result > 0 && libc::WIFEXITED(status) {
                    libc::WEXITSTATUS(status)
                } else {
                    0
                };
                let payload = serde_json::json!({ "project": project_id_clone, "code": exit_code });
                let _ = app_clone.emit("server-stopped", payload);
                // Only remove entry if PID matches — prevents restart from orphaning the new process
                if let Ok(mut guard) = app_clone.state::<ServerProcesses>().0.lock() {
                    if let Some(entry) = guard.get(&project_id_clone) {
                        if entry.pid == pid_for_wait as u32 {
                            guard.remove(&project_id_clone);
                        }
                    }
                }
            }
        });
    }

    Ok(())
}

/// Stop the running server process for a specific project.
#[tauri::command]
pub async fn stop_server(project_id: String, app: AppHandle) -> Result<(), String> {
    stop_server_for_project(&app, &project_id)
}

/// Restart the server for a specific project: stop existing, emit restart marker, start new.
#[tauri::command]
pub async fn restart_server(
    cmd: String,
    cwd: String,
    project_id: String,
    app: AppHandle,
) -> Result<(), String> {
    stop_server_for_project(&app, &project_id)?;
    let payload = serde_json::json!({ "project": project_id, "text": "[server] --- Restarting ---\n" });
    let _ = app.emit("server-output", payload);
    start_server(cmd, cwd, project_id, app).await
}

/// Detect whether an agent binary exists in PATH.
#[tauri::command]
pub fn detect_agent(agent: String) -> Result<String, String> {
    if agent.is_empty() || agent == "bash" {
        return Ok("bash".to_string());
    }
    let output = Command::new("which")
        .arg(&agent)
        .output()
        .map_err(|e| format!("Failed to run which: {}", e))?;
    if output.status.success() {
        Ok(agent)
    } else {
        Err(format!("Binary '{}' not found in PATH", agent))
    }
}

/// Kill the server process for a specific project (SIGTERM + SIGKILL fallback).
fn stop_server_for_project(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let sp = app.state::<ServerProcesses>();
    let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
    if let Some(entry) = guard.remove(project_id) {
        let pid = entry.pid as i32;
        // Send SIGTERM to the entire process group
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
        // Reap the process in a background thread to prevent zombies
        std::thread::spawn(move || {
            let mut status: libc::c_int = 0;
            // Wait up to 3 seconds for graceful shutdown
            for _ in 0..30 {
                let result = unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) };
                if result != 0 {
                    return; // Process reaped (either exited or error)
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            // SIGKILL if still alive after 3 seconds
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
            }
            // Final waitpid to reap after SIGKILL
            unsafe {
                libc::waitpid(pid, &mut status, 0);
            }
        });
    }
    Ok(())
}

/// Kill ALL running server processes across all projects.
/// Used by close handler — must be synchronous since the app exits immediately after.
/// Sends SIGTERM then SIGKILL to each process group without spawning background threads.
pub fn kill_all_servers(app: &AppHandle) {
    let pids: Vec<u32> = {
        let sp = app.state::<ServerProcesses>();
        let Ok(mut guard) = sp.0.lock() else { return };
        guard.drain().map(|(_, entry)| entry.pid).collect()
    };
    for &pid in &pids {
        let pid = pid as i32;
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
    }
    // Brief pause to let processes handle SIGTERM
    std::thread::sleep(std::time::Duration::from_millis(200));
    // SIGKILL anything still alive — synchronous, no background threads
    for &pid in &pids {
        let pid = pid as i32;
        let mut status: libc::c_int = 0;
        let result = unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) };
        if result == 0 {
            // Still alive — force kill
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
                libc::waitpid(pid, &mut status, 0);
            }
        }
    }
}
