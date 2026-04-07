// src-tauri/src/lib.rs
pub mod git_status;
pub mod project;
mod state;
mod terminal;
mod theme;

use tauri::Manager;
use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
use terminal::pty::{ack_bytes, check_tmux, resize_pty, spawn_terminal, write_pty};
use theme::iterm2::import_iterm2_theme;
use state::{get_config_dir, load_state, save_state, ManagedAppState};
use theme::types::load_theme;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── macOS Application menu (first submenu = app name menu on macOS) ──
            let app_menu = SubmenuBuilder::new(app, "Efxmux")
                .item(&PredefinedMenuItem::about(app, None, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
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
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            // Build and set the full menu
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;

            // Ensure ~/.config/efxmux/ exists before anything reads it
            state::ensure_config_dir();
            theme::types::ensure_config_dir();

            // Load initial state into Tauri managed state (for close handler, WR-03)
            let initial_state = state::load_state_sync();
            app.manage(ManagedAppState(std::sync::Mutex::new(initial_state)));

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
            spawn_terminal,
            write_pty,
            resize_pty,
            ack_bytes,
            load_theme,
            import_iterm2_theme,
            load_state,
            save_state,
            get_config_dir,
            git_status::get_git_status,
            project::add_project,
            project::remove_project,
            project::switch_project,
            project::get_projects,
            project::get_active_project,
        ])
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
