use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::Manager;

/// High watermark: pause PTY reads when unacknowledged bytes exceed this threshold.
const FLOW_HIGH_WATERMARK: u64 = 400_000;

/// Low watermark: resume PTY reads when unacknowledged bytes drop below this threshold.
/// Hysteresis prevents rapid pause/resume oscillation (HIGH=400KB pause, LOW=100KB resume).
const FLOW_LOW_WATERMARK: u64 = 100_000;

/// Managed Tauri state holding PTY handles and flow control counters.
pub struct PtyState {
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    pub sent_bytes: Arc<AtomicU64>,
    pub acked_bytes: Arc<AtomicU64>,
    // Keep slave alive until child exits (portable-pty gotcha from CLAUDE.md)
    pub slave: Arc<Mutex<Option<Box<dyn portable_pty::SlavePty + Send>>>>,
}

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
) -> Result<(), String> {
    // Sanitize session_name: allow only alphanumeric, hyphen, underscore (T-02-01 mitigation)
    let sanitized: String = session_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        return Err("Invalid session name: must contain at least one alphanumeric character".to_string());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["new-session", "-A", "-s", &sanitized]);

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

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
    app.manage(state);

    let sent = sent_bytes;
    let acked = acked_bytes;

    // PTY read loop on dedicated OS thread (NOT tokio::spawn -- Research Pitfall 5)
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        let mut paused = false;
        loop {
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
    });

    Ok(())
}

/// Write input data to the PTY master (keystrokes from xterm.js).
#[tauri::command]
pub fn write_pty(data: String, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize the PTY. This is a control operation that bypasses flow control (D-14).
#[tauri::command]
pub fn resize_pty(cols: u16, rows: u16, state: tauri::State<'_, PtyState>) -> Result<(), String> {
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
pub fn ack_bytes(count: u64, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    state.acked_bytes.fetch_add(count, Ordering::Relaxed);
    Ok(())
}
