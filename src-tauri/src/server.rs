use std::io::Read;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Tauri-managed wrapper for the server child process.
pub struct ServerProcess(pub Mutex<Option<std::process::Child>>);

/// Start a server process, streaming stdout/stderr to the frontend via events.
/// Kills any existing server process first.
#[tauri::command]
pub async fn start_server(
    cmd: String,
    cwd: String,
    app: AppHandle,
) -> Result<(), String> {
    // Validate cwd exists and is a directory (T-07-02 mitigation)
    let cwd_path = std::path::Path::new(&cwd);
    if !cwd_path.exists() || !cwd_path.is_dir() {
        return Err(format!("Working directory '{}' does not exist or is not a directory", cwd));
    }

    // Kill existing server process first
    stop_server_inner(&app)?;

    // Spawn the server process in its own process group
    let mut child = Command::new("sh")
        .args(["-c", &cmd])
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    // Take stdout and stderr before storing child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();

    // Store child in managed state
    {
        let sp = app.state::<ServerProcess>();
        let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    // Spawn stdout reader thread
    if let Some(mut stdout) = stdout {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match stdout.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit("server-output", &text);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Spawn stderr reader thread
    if let Some(mut stderr) = stderr {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match stderr.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit("server-output", &text);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Spawn waiter thread for crash detection (D-14)
    // Uses libc::waitpid to detect natural process exit and emit exit code
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut status: libc::c_int = 0;
        let result = unsafe { libc::waitpid(pid as i32, &mut status, 0) };
        let exit_code = if result > 0 && libc::WIFEXITED(status) {
            libc::WEXITSTATUS(status)
        } else {
            -1
        };
        let _ = app_clone.emit("server-stopped", exit_code);

        // Clear the stored child since process is gone
        if let Ok(mut guard) = app_clone.state::<ServerProcess>().0.lock() {
            *guard = None;
        }
    });

    Ok(())
}

/// Stop the running server process.
#[tauri::command]
pub async fn stop_server(app: AppHandle) -> Result<(), String> {
    stop_server_inner(&app)
}

/// Restart the server: stop existing, emit restart marker, start new.
#[tauri::command]
pub async fn restart_server(
    cmd: String,
    cwd: String,
    app: AppHandle,
) -> Result<(), String> {
    stop_server_inner(&app)?;
    let _ = app.emit("server-output", "[server] --- Restarting ---\n");
    start_server(cmd, cwd, app).await
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

/// Internal helper to kill the running server process (SIGTERM + SIGKILL fallback).
fn stop_server_inner(app: &AppHandle) -> Result<(), String> {
    let sp = app.state::<ServerProcess>();
    let mut guard = sp.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        let pid = child.id() as i32;
        // Send SIGTERM to the entire process group
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }
        // Spawn a thread for SIGKILL fallback after 3 seconds
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            // SIGKILL if still alive
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
            }
        });
    }
    *guard = None;
    Ok(())
}
