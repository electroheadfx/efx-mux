// src-tauri/src/lib.rs
pub mod file_ops;
pub mod file_watcher;
pub mod git_ops;
pub mod git_status;
pub mod project;
pub mod server;
mod state;
mod terminal;
mod theme;

use std::collections::HashMap;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use terminal::pty::{ack_bytes, check_tmux, cleanup_dead_sessions, destroy_pty_session, get_agent_version, get_pty_sessions, resize_pty, send_literal_sequence, spawn_terminal, write_pty, PtyManager};
use theme::iterm2::import_iterm2_theme;
use server::{detect_agent, kill_all_servers, restart_server, start_server, stop_server, ServerProcesses};
use state::{get_config_dir, load_state, save_state, ManagedAppState};
use theme::types::load_theme;

#[tauri::command]
fn force_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── macOS Application menu (first submenu = app name menu on macOS) ──
            let app_menu = SubmenuBuilder::new(app, "Efxmux")
                .item(&PredefinedMenuItem::about(app, None, None)?)
                .separator()
                .item(&MenuItem::with_id(app, "quit", "Quit Efxmux", true, Some("CmdOrCtrl+Q"))?)
                .build()?;

            // ── File menu — Add Project (Cmd+N) ─────────────────────────────────
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&MenuItem::with_id(app, "add-project", "Add Project", true, Some("CmdOrCtrl+N"))?)
                .build()?;

            // ── Edit menu — wires Cmd+C/V/X/A to WKWebView clipboard (per D-16) ──
            // PredefinedMenuItem maps to OS-level accelerators; WKWebView inherits.
            // @tauri-apps/plugin-clipboard-manager NOT needed for Cmd+C/V.
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // ── Window menu ───────────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .build()?;

            // Build and set the full menu
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;

            // Augment PATH for bundled app: macOS .app bundles inherit a minimal PATH
            // (/usr/bin:/bin:/usr/sbin:/sbin) that excludes Homebrew. Prepend known
            // Homebrew and user-local bin directories so tmux (and agent CLIs like
            // claude, opencode) are found regardless of launch method.
            {
                let current_path = std::env::var("PATH").unwrap_or_default();
                let extra = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin";
                if !current_path.contains("/opt/homebrew/bin") {
                    let augmented = format!("{}:{}", extra, current_path);
                    std::env::set_var("PATH", &augmented);
                    println!("[efx-mux] Augmented PATH for bundle: {}", augmented);
                }
            }

            // Ensure ~/.config/efx-mux/ exists before anything reads it
            state::ensure_config_dir();
            theme::types::ensure_config_dir();

            // Load initial state into Tauri managed state (for close handler, WR-03)
            let initial_state = state::load_state_sync();
            app.manage(ManagedAppState(std::sync::Mutex::new(initial_state)));

            // Initialize PtyManager for multi-session PTY support (D-09)
            app.manage(PtyManager(std::sync::Mutex::new(HashMap::new())));

            // Initialize ServerProcesses managed state for per-project server management (Phase 7, 07-06)
            app.manage(ServerProcesses(std::sync::Mutex::new(HashMap::new())));

            // Start theme file watcher (D-09: watch theme.json for changes)
            let app_handle = app.handle().clone();
            theme::watcher::start_theme_watcher(app_handle);

            // Probe for tmux availability (D-01)
            // If tmux is missing, the frontend will show a modal.
            match check_tmux() {
                Ok(version) => println!("[efx-mux] tmux found: {}", version),
                Err(e) => eprintln!("[efx-mux] WARNING: {}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands (D-09: session-aware via PtyManager)
            spawn_terminal,
            write_pty,
            resize_pty,
            ack_bytes,
            get_pty_sessions,
            destroy_pty_session,
            cleanup_dead_sessions,

            // Theme
            load_theme,
            import_iterm2_theme,

            // State
            load_state,
            save_state,
            get_config_dir,

            // Git
            git_status::get_git_status,
            git_status::get_git_files,
            git_status::get_file_diff_stats,
            git_ops::stage_file,
            git_ops::unstage_file,
            git_ops::commit,
            git_ops::push,
            git_ops::get_unpushed_count,
            git_ops::uncommit,
            git_ops::get_git_log,
            git_ops::revert_file,

            // Projects
            project::add_project,
            project::update_project,
            project::remove_project,
            project::switch_project,
            project::get_projects,
            project::get_active_project,

            // Phase 6: File operations (D-04, D-06, D-01)
            file_ops::get_file_diff,
            file_ops::list_directory,
            file_ops::read_file_content,
            file_ops::read_file,
            file_ops::write_checkbox,
            // Phase 15: File CRUD (D-12)
            file_ops::write_file_content,
            file_ops::delete_file,
            file_ops::rename_file,
            file_ops::create_file,

            // Phase 6: File watcher (D-02)
            file_watcher::set_project_path,

            // Workspace switching
            terminal::pty::switch_tmux_session,

            // Shift+Enter newline: send literal sequence directly to tmux pane stdin
            send_literal_sequence,

            // Agent version detection (D-17)
            get_agent_version,

            // Phase 7: Server process management
            start_server,
            stop_server,
            restart_server,
            detect_agent,

            // App lifecycle
            force_quit,
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "quit" => { let _ = app.emit("quit-requested", ()); }
                "add-project" => { let _ = app.emit("add-project-requested", ()); }
                _ => {}
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill ALL server processes on close (07-06: per-project HashMap, T-07-10)
                kill_all_servers(&window.app_handle());

                // Synchronously save the latest in-memory state to disk.
                // This guarantees state.json is written even if the JS
                // beforeunload async invoke did not complete (WR-03 fix).
                let managed = window.state::<ManagedAppState>();
                let snapshot = managed.0.lock().ok().map(|g| g.clone());
                if let Some(ref s) = snapshot {
                    if let Err(e) = state::save_state_sync(s) {
                        eprintln!("[efxmux] WARNING: Failed to save state on close: {}", e);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    // Kill ALL server processes on Cmd+Q / app quit (07-09: T-07-10)
                    // Both ExitRequested and Exit are handled to cover all exit paths:
                    // - ExitRequested fires when last window closes naturally
                    // - Exit fires unconditionally on app termination (Cmd+Q, menu quit)
                    kill_all_servers(app_handle);

                    // Synchronously save the latest in-memory state to disk.
                    let managed = app_handle.state::<ManagedAppState>();
                    let snapshot = managed.0.lock().ok().map(|g| g.clone());
                    if let Some(ref s) = snapshot {
                        if let Err(e) = state::save_state_sync(s) {
                            eprintln!("[efxmux] WARNING: Failed to save state on quit: {}", e);
                        }
                    }
                }
                _ => {}
            }
        });
}
