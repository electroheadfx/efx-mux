use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Tauri-managed wrapper for in-memory AppState.
/// Updated on every save_state call; written to disk on window close.
pub struct ManagedAppState(pub Mutex<AppState>);

/// Application state persisted to ~/.config/efx-mux/state.json (per D-07)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    #[serde(default = "default_version")]
    pub version: u32,

    #[serde(default)]
    pub layout: LayoutState,

    #[serde(default)]
    pub theme: ThemeState,

    #[serde(default)]
    pub session: SessionState,

    #[serde(default)]
    pub project: ProjectState,

    #[serde(default)]
    pub panels: PanelsState,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            version: default_version(),
            layout: LayoutState::default(),
            theme: ThemeState::default(),
            session: SessionState::default(),
            project: ProjectState::default(),
            panels: PanelsState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutState {
    #[serde(default = "default_sidebar_w", rename = "sidebar-w")]
    pub sidebar_w: String,

    #[serde(default = "default_right_w", rename = "right-w")]
    pub right_w: String,

    #[serde(default = "default_right_h_pct", rename = "right-h-pct")]
    pub right_h_pct: String,

    #[serde(default, rename = "sidebar-collapsed")]
    pub sidebar_collapsed: bool,

    #[serde(default = "default_server_pane_height", rename = "server-pane-height")]
    pub server_pane_height: String,

    #[serde(default = "default_server_pane_state", rename = "server-pane-state")]
    pub server_pane_state: String,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            sidebar_w: default_sidebar_w(),
            right_w: default_right_w(),
            right_h_pct: default_right_h_pct(),
            sidebar_collapsed: false,
            server_pane_height: default_server_pane_height(),
            server_pane_state: default_server_pane_state(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeState {
    #[serde(default = "default_theme_mode")]
    pub mode: String,
}

impl Default for ThemeState {
    fn default() -> Self {
        Self {
            mode: default_theme_mode(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    #[serde(default = "default_main_session", rename = "main-tmux-session")]
    pub main_tmux_session: String,

    #[serde(default = "default_right_session", rename = "right-tmux-session")]
    pub right_tmux_session: String,

    /// Extra session fields from JS (e.g. terminal-tabs). Preserves round-trip
    /// so the frontend can store arbitrary session data without Rust schema changes.
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            main_tmux_session: default_main_session(),
            right_tmux_session: default_right_session(),
            extra: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectState {
    #[serde(default, rename = "active")]
    pub active: Option<String>,

    #[serde(default, rename = "projects")]
    pub projects: Vec<ProjectEntry>,
}

/// Project entry stored in the project registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    pub agent: String,
    #[serde(default)]
    pub gsd_file: Option<String>,
    #[serde(default)]
    pub server_cmd: Option<String>,
    #[serde(default)]
    pub server_url: Option<String>,
}

impl Default for ProjectEntry {
    fn default() -> Self {
        Self {
            path: String::new(),
            name: String::new(),
            agent: String::new(),
            gsd_file: None,
            server_cmd: None,
            server_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelsState {
    #[serde(default = "default_right_top_tab", rename = "right-top-tab")]
    pub right_top_tab: String,

    #[serde(default = "default_right_bottom_tab", rename = "right-bottom-tab")]
    pub right_bottom_tab: String,
}

impl Default for PanelsState {
    fn default() -> Self {
        Self {
            right_top_tab: default_right_top_tab(),
            right_bottom_tab: default_right_bottom_tab(),
        }
    }
}

// Default value functions (matching D-10)
fn default_sidebar_w() -> String {
    "200px".into()
}
fn default_right_w() -> String {
    "25%".into()
}
fn default_right_h_pct() -> String {
    "50".into()
}
fn default_theme_mode() -> String {
    "dark".into()
}
fn default_main_session() -> String {
    "efx-mux".into()
}
fn default_right_session() -> String {
    "efx-mux-right".into()
}
fn default_right_top_tab() -> String {
    "GSD".into()
}
fn default_right_bottom_tab() -> String {
    "git".into()
}
fn default_server_pane_height() -> String {
    "200px".into()
}
fn default_server_pane_state() -> String {
    "strip".into()
}
fn default_version() -> u32 {
    1
}

/// Path to state.json
pub fn state_path() -> PathBuf {
    config_dir().join("state.json")
}

/// Returns ~/.config/efx-mux/
fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .expect("[efxmux] FATAL: HOME environment variable is not set");
    PathBuf::from(home).join(".config/efx-mux")
}

/// Ensure ~/.config/efx-mux/ exists
pub fn ensure_config_dir() {
    let dir = config_dir();
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[efxmux] Failed to create config dir {:?}: {}", dir, e);
        }
    }
}

/// Load state.json. Returns defaults if missing or corrupt (per D-09)
pub fn load_state_sync() -> AppState {
    ensure_config_dir();
    let path = state_path();

    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                // Check version first (D-08)
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(v) = json.get("version").and_then(|v| v.as_u64()) {
                        if v != 1 {
                            eprintln!(
                                "[efxmux] WARNING: state.json version {} not supported. Using defaults.",
                                v
                            );
                            return AppState::default();
                        }
                    }
                }
                match serde_json::from_str::<AppState>(&content) {
                    Ok(state) => return state,
                    Err(err) => {
                        eprintln!(
                            "[efxmux] WARNING: Corrupt state.json ({}). Using defaults.",
                            err
                        );
                    }
                }
            }
            Err(err) => {
                eprintln!(
                    "[efxmux] WARNING: Could not read state.json ({}). Using defaults.",
                    err
                );
            }
        }
    } else {
        eprintln!("[efxmux] WARNING: state.json not found. Using defaults.");
    }

    AppState::default()
}

/// Save state to state.json. Called from spawn_blocking thread (per D-11, D-12)
pub fn save_state_sync(state: &AppState) -> Result<(), String> {
    ensure_config_dir();
    let path = state_path();
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&tmp_path, &json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Get the config directory path as a string (for JS integration)
pub fn get_config_dir_path() -> String {
    config_dir().to_string_lossy().to_string()
}

// -- Tauri commands (async wrappers around sync functions) ---------------------

/// Load app state from state.json. Returns defaults if missing or corrupt.
#[tauri::command]
pub async fn load_state() -> AppState {
    // Use spawn_blocking for file I/O (per D-11)
    tauri::async_runtime::spawn_blocking(load_state_sync)
        .await
        .unwrap_or_else(|_| AppState::default())
}

/// Save app state to state.json. Used by beforeunload hook and periodic saves.
/// Also updates the Tauri-managed in-memory copy for the close handler (WR-03).
#[tauri::command]
pub async fn save_state(
    state_json: String,
    managed: tauri::State<'_, ManagedAppState>,
) -> Result<(), String> {
    let state: AppState = serde_json::from_str(&state_json).map_err(|e| e.to_string())?;
    // Update in-memory copy for the close handler.
    // Recover from poison since AppState has no invariants to violate.
    {
        let mut guard = managed.0.lock().unwrap_or_else(|e| {
            eprintln!("[efxmux] WARNING: State mutex was poisoned, recovering");
            e.into_inner()
        });
        *guard = state.clone();
    }
    // Use spawn_blocking for file I/O (per D-11, D-12)
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&state))
        .await
        .map_err(|e| e.to_string())?
}

/// Return the config directory path (~/.config/efx-mux/)
#[tauri::command]
pub fn get_config_dir() -> String {
    get_config_dir_path()
}
