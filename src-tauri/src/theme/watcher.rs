use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;

use super::types::{config_dir, theme_path};
use crate::state::state_path;

/// Start a background thread that watches ~/.config/efx-mux/ for theme.json changes.
///
/// Watches the parent directory (not the file) because editors perform atomic saves
/// via delete + rename, which would remove the watch on the file itself.
/// Debounces at 200ms (D-11) to handle rapid editor auto-save.
pub fn start_theme_watcher(app_handle: tauri::AppHandle) {
    let target_path: PathBuf = theme_path();
    let watch_dir: PathBuf = config_dir();

    let state_file_path: PathBuf = state_path();

    std::thread::spawn(move || {
        let target = target_path.clone();
        let state_target = state_file_path.clone();
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(200),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] File watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event path matches theme.json specifically
                let is_theme_event = events.iter().any(|e| e.path == target);
                if is_theme_event {
                    // Read and validate theme.json before emitting
                    match std::fs::read_to_string(&target) {
                        Ok(content) => {
                            match serde_json::from_str::<serde_json::Value>(&content) {
                                Ok(theme_value) => {
                                    if let Err(e) = handle.emit("theme-changed", theme_value) {
                                        eprintln!("[efxmux] Failed to emit theme-changed event: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "[efxmux] Invalid theme.json: {}. Keeping current theme.",
                                        e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[efxmux] Failed to read theme.json: {}", e);
                        }
                    }
                }

                // Check if any event path matches state.json
                let is_state_event = events.iter().any(|e| e.path == state_target);
                if is_state_event {
                    match std::fs::read_to_string(&state_target) {
                        Ok(content) => {
                            match serde_json::from_str::<serde_json::Value>(&content) {
                                Ok(state_value) => {
                                    if let Err(e) = handle.emit("state-changed", state_value) {
                                        eprintln!("[efxmux] Failed to emit state-changed event: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "[efxmux] Invalid state.json: {}. Keeping current state.",
                                        e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[efxmux] Failed to read state.json: {}", e);
                        }
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create theme file watcher: {:?}", e);
                return;
            }
        };

        // Watch the config directory (NonRecursive) -- not the file itself
        if let Err(e) = debouncer.watcher().watch(&watch_dir, RecursiveMode::NonRecursive) {
            eprintln!(
                "[efxmux] Failed to watch config dir {:?}: {:?}",
                watch_dir, e
            );
            return;
        }

        println!("[efxmux] Theme watcher active on {:?}", watch_dir);

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
