//! .md file watcher for GSD Viewer auto-refresh (D-02, PANEL-03).
//!
//! Watches a project directory for changes to .md files and emits
//! `md-file-changed` Tauri events to trigger frontend refresh.
//! Pattern mirrors theme/watcher.rs: watch directory (not file) because
//! editors do atomic saves (delete + rename).

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;

/// Start a background thread that watches `project_path` for .md file changes.
///
/// Emits `md-file-changed` event with the changed file path as payload.
/// Uses 200ms debounce to handle rapid editor auto-save.
pub fn start_md_watcher(app_handle: tauri::AppHandle, project_path: PathBuf) {
    let watch_dir = project_path.clone();

    std::thread::spawn(move || {
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(200),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] MD file watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event path is a .md file
                let md_events: Vec<_> = events
                    .iter()
                    .filter(|e| {
                        e.path
                            .extension()
                            .map(|ext| ext == "md")
                            .unwrap_or(false)
                    })
                    .collect();

                if !md_events.is_empty() {
                    // Emit with the first changed .md file path
                    let changed_path = md_events[0].path.to_string_lossy().to_string();
                    if let Err(e) = handle.emit("md-file-changed", changed_path) {
                        eprintln!("[efxmux] Failed to emit md-file-changed event: {}", e);
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create MD file watcher: {:?}", e);
                return;
            }
        };

        // Watch the project directory (NonRecursive to match theme/watcher.rs pattern)
        if let Err(e) = debouncer
            .watcher()
            .watch(&watch_dir, RecursiveMode::NonRecursive)
        {
            eprintln!(
                "[efxmux] Failed to watch project dir {:?}: {:?}",
                watch_dir, e
            );
            return;
        }

        println!(
            "[efxmux] MD file watcher active on {:?}",
            watch_dir
        );

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}

/// Frontend command to set project path and (re)start the .md file watcher.
/// Called when the active project changes.
#[tauri::command]
pub fn set_project_path(path: String, app: tauri::AppHandle) {
    let project_path = PathBuf::from(&path);
    if project_path.is_dir() {
        start_md_watcher(app, project_path);
    } else {
        eprintln!(
            "[efxmux] set_project_path: not a directory: {}",
            path
        );
    }
}
