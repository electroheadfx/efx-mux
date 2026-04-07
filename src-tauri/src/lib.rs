// src-tauri/src/lib.rs
mod terminal;
mod theme;

use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
use terminal::pty::{ack_bytes, check_tmux, resize_pty, spawn_terminal, write_pty};
use theme::types::load_theme;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── macOS Application menu (first submenu = app name menu on macOS) ──
            let app_menu = SubmenuBuilder::new(app, "GSD MUX")
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
            theme::types::ensure_config_dir();

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
