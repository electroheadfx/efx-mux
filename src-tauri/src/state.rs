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

    #[serde(default = "default_file_tree_font_size", rename = "file-tree-font-size")]
    pub file_tree_font_size: String,

    #[serde(default = "default_file_tree_line_height", rename = "file-tree-line-height")]
    pub file_tree_line_height: String,

    #[serde(default, rename = "file-tree-bg-color")]
    pub file_tree_bg_color: String,

    /// Extra layout fields from JS. Preserves round-trip
    /// so the frontend can store arbitrary layout data without Rust schema changes.
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
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
            file_tree_font_size: default_file_tree_font_size(),
            file_tree_line_height: default_file_tree_line_height(),
            file_tree_bg_color: String::new(),
            extra: std::collections::HashMap::new(),
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

    // Phase 19 (D-03): persisted GSD sub-tab selection
    #[serde(default = "default_gsd_sub_tab", rename = "gsd-sub-tab")]
    pub gsd_sub_tab: String,
}

impl Default for PanelsState {
    fn default() -> Self {
        Self {
            right_top_tab: default_right_top_tab(),
            right_bottom_tab: default_right_bottom_tab(),
            gsd_sub_tab: default_gsd_sub_tab(),
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
    "File Tree".into()
}
fn default_right_bottom_tab() -> String {
    "git".into()
}
fn default_gsd_sub_tab() -> String {
    "State".into()
}
fn default_server_pane_height() -> String {
    "200px".into()
}
fn default_server_pane_state() -> String {
    "strip".into()
}
fn default_file_tree_font_size() -> String {
    "13".into()
}
fn default_file_tree_line_height() -> String {
    "2".into()
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

/// Returns true if writing `incoming` would wipe a non-empty on-disk project list.
/// Used by `save_state` (the JS-facing Tauri command) to defend against the
/// HMR-on-checkout state.json wipe scenario: Vite remounts Preact with an empty
/// in-memory state, which propagates through beforeunload/save-on-mount and would
/// otherwise atomically replace the user's real project registry.
///
/// Internal Rust callers (add_project, remove_project, switch_project,
/// update_project) call `save_state_sync` directly with already-mutated state
/// and bypass this guard -- exactly what we want for legitimate "user removed
/// last project" flows.
pub fn would_wipe_projects(incoming: &AppState) -> bool {
    if !incoming.project.projects.is_empty() {
        return false;
    }
    // Incoming has no projects; check if disk has any.
    let disk = load_state_sync();
    !disk.project.projects.is_empty()
}

/// Save with the HMR-wipe guard. If the guard trips, returns Ok(()) silently
/// (no error to the frontend) but logs a warning to stderr.
pub fn guarded_save(state: &AppState) -> Result<(), String> {
    if would_wipe_projects(state) {
        eprintln!(
            "[efxmux] WARNING: refused to overwrite non-empty project list with empty state \
             (likely Vite HMR remount or blank state replacement). state.json left untouched."
        );
        return Ok(());
    }
    save_state_sync(state)
}

/// Save state to state.json. Called from spawn_blocking thread (per D-11, D-12)
pub fn save_state_sync(state: &AppState) -> Result<(), String> {
    // Create config dir if missing (don't rely on ensure_config_dir which swallows errors)
    let dir = state_path().parent().unwrap().to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
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
    // Use spawn_blocking for file I/O (per D-11, D-12).
    // Route through guarded_save to defend against the HMR-wipe scenario
    // (Vite remount sending empty projects via beforeunload/save-on-mount).
    tauri::async_runtime::spawn_blocking(move || guarded_save(&state))
        .await
        .map_err(|e| e.to_string())?
}

/// Return the config directory path (~/.config/efx-mux/)
#[tauri::command]
pub fn get_config_dir() -> String {
    get_config_dir_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_roundtrip() {
        let state = AppState::default();
        let json = serde_json::to_string(&state).unwrap();
        let restored: AppState = serde_json::from_str(&json).unwrap();
        assert_eq!(state.version, restored.version);
        assert_eq!(state.layout.sidebar_w, restored.layout.sidebar_w);
        assert_eq!(state.theme.mode, restored.theme.mode);
    }

    #[test]
    fn layout_state_roundtrip() {
        let layout = LayoutState {
            sidebar_w: "250px".into(),
            right_w: "30%".into(),
            right_h_pct: "60".into(),
            sidebar_collapsed: true,
            server_pane_height: "300px".into(),
            server_pane_state: "full".into(),
            file_tree_font_size: "14".into(),
            file_tree_line_height: "1.5".into(),
            file_tree_bg_color: "#1a1a2e".into(),
            extra: std::collections::HashMap::new(),
        };
        let json = serde_json::to_string(&layout).unwrap();
        let restored: LayoutState = serde_json::from_str(&json).unwrap();
        assert_eq!(layout.sidebar_w, restored.sidebar_w);
        assert_eq!(layout.sidebar_collapsed, restored.sidebar_collapsed);
    }

    #[test]
    fn theme_state_roundtrip() {
        let theme = ThemeState { mode: "light".into() };
        let json = serde_json::to_string(&theme).unwrap();
        let restored: ThemeState = serde_json::from_str(&json).unwrap();
        assert_eq!(theme.mode, restored.mode);
    }

    #[test]
    fn session_state_roundtrip() {
        let session = SessionState {
            main_tmux_session: "my-session".into(),
            right_tmux_session: "my-session-right".into(),
            extra: std::collections::HashMap::new(),
        };
        let json = serde_json::to_string(&session).unwrap();
        let restored: SessionState = serde_json::from_str(&json).unwrap();
        assert_eq!(session.main_tmux_session, restored.main_tmux_session);
    }

    #[test]
    fn project_state_roundtrip() {
        let project = ProjectState {
            active: Some("/path/to/project".into()),
            projects: vec![ProjectEntry {
                path: "/path/to/project".into(),
                name: "My Project".into(),
                agent: "claude".into(),
                gsd_file: Some("PLAN.md".into()),
                server_cmd: Some("npm run dev".into()),
                server_url: None,
            }],
        };
        let json = serde_json::to_string(&project).unwrap();
        let restored: ProjectState = serde_json::from_str(&json).unwrap();
        assert_eq!(project.active, restored.active);
        assert_eq!(project.projects.len(), restored.projects.len());
    }

    #[test]
    fn project_entry_roundtrip() {
        let entry = ProjectEntry {
            path: "/path/to/project".into(),
            name: "My Project".into(),
            agent: "claude".into(),
            gsd_file: Some("PLAN.md".into()),
            server_cmd: Some("npm run dev".into()),
            server_url: None,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let restored: ProjectEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(entry.name, restored.name);
    }

    #[test]
    fn panels_state_roundtrip() {
        let panels = PanelsState {
            right_top_tab: "GSD".into(),
            right_bottom_tab: "Files".into(),
            gsd_sub_tab: "Phases".into(),
        };
        let json = serde_json::to_string(&panels).unwrap();
        let restored: PanelsState = serde_json::from_str(&json).unwrap();
        assert_eq!(panels.right_top_tab, restored.right_top_tab);
        assert_eq!(panels.gsd_sub_tab, restored.gsd_sub_tab);
    }

    #[test]
    fn panels_state_default_has_state() {
        let panels = PanelsState::default();
        assert_eq!(panels.gsd_sub_tab, "State");
    }

    #[test]
    fn panels_state_missing_key_defaults_to_state() {
        let json = r#"{"right-top-tab":"GSD","right-bottom-tab":"Bash"}"#;
        let panels: PanelsState = serde_json::from_str(json).unwrap();
        assert_eq!(panels.gsd_sub_tab, "State");
    }

    #[test]
    fn app_state_default_has_version_1() {
        let state = AppState::default();
        assert_eq!(state.version, 1);
    }

    // -- save_state HMR-wipe guard tests ---------------------------------------
    //
    // These tests share the HOME env var to sandbox state.json under a temp
    // directory. The HOME_LOCK Mutex serializes execution so parallel test
    // threads don't clobber each other's HOME setting.

    use std::sync::Mutex;
    static HOME_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_home<F: FnOnce()>(test_name: &str, test: F) {
        let _guard = HOME_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!(
            "efxmux-test-{}-{}",
            std::process::id(),
            test_name
        ));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let prev = std::env::var("HOME").ok();
        std::env::set_var("HOME", &tmp);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(test));
        // Restore HOME
        match prev {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        let _ = std::fs::remove_dir_all(&tmp);
        if let Err(e) = result {
            std::panic::resume_unwind(e);
        }
    }

    fn seed_state_with_one_project() -> AppState {
        AppState {
            project: ProjectState {
                active: Some("/p1".into()),
                projects: vec![ProjectEntry {
                    path: "/p1".into(),
                    name: "P1".into(),
                    agent: "claude".into(),
                    gsd_file: None,
                    server_cmd: None,
                    server_url: None,
                }],
            },
            ..AppState::default()
        }
    }

    #[test]
    fn save_state_guard_refuses_wipe() {
        with_temp_home("refuses_wipe", || {
            // Pre-write a state.json containing one project.
            let seeded = seed_state_with_one_project();
            save_state_sync(&seeded).expect("seed write should succeed");

            // Build an empty incoming state (simulating HMR remount).
            let incoming = AppState::default();

            // Guard must detect this as a wipe attempt.
            assert!(would_wipe_projects(&incoming), "guard should report wipe");

            // guarded_save returns Ok(()) but does NOT actually write.
            guarded_save(&incoming).expect("guarded_save should return Ok even when refusing");

            // Reload from disk: the seeded project must survive.
            let after = load_state_sync();
            assert_eq!(
                after.project.projects.len(),
                1,
                "seeded project must survive HMR-wipe attempt"
            );
            assert_eq!(after.project.projects[0].path, "/p1");
        });
    }

    #[test]
    fn save_state_guard_allows_empty_to_empty() {
        with_temp_home("empty_to_empty", || {
            // Seed disk with empty projects (default state).
            let empty_seed = AppState::default();
            save_state_sync(&empty_seed).expect("seed write should succeed");

            // Disk is empty, incoming is empty -> not a wipe.
            assert!(
                !would_wipe_projects(&AppState::default()),
                "empty disk + empty incoming should not be flagged as wipe"
            );

            guarded_save(&AppState::default()).expect("guarded_save should succeed");

            // Reload: still empty, file exists.
            let after = load_state_sync();
            assert_eq!(after.project.projects.len(), 0);
            assert!(state_path().exists(), "state file should exist after save");
        });
    }

    #[test]
    fn save_state_guard_allows_non_empty_write() {
        with_temp_home("non_empty_write", || {
            // Seed disk with one project.
            let seeded = seed_state_with_one_project();
            save_state_sync(&seeded).expect("seed write should succeed");

            // Build incoming with two projects.
            let incoming = AppState {
                project: ProjectState {
                    active: Some("/p2".into()),
                    projects: vec![
                        ProjectEntry {
                            path: "/p1".into(),
                            name: "P1".into(),
                            agent: "claude".into(),
                            gsd_file: None,
                            server_cmd: None,
                            server_url: None,
                        },
                        ProjectEntry {
                            path: "/p2".into(),
                            name: "P2".into(),
                            agent: "opencode".into(),
                            gsd_file: None,
                            server_cmd: None,
                            server_url: None,
                        },
                    ],
                },
                ..AppState::default()
            };

            // Non-empty incoming should never be flagged as wipe.
            assert!(
                !would_wipe_projects(&incoming),
                "non-empty incoming must not be flagged as wipe"
            );

            guarded_save(&incoming).expect("guarded_save should succeed");

            // Reload: 2 projects on disk now.
            let after = load_state_sync();
            assert_eq!(after.project.projects.len(), 2);
            assert_eq!(after.project.active.as_deref(), Some("/p2"));
        });
    }
}
