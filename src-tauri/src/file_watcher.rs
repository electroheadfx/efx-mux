//! File watchers for auto-refresh functionality.
//!
//! 1. .md file watcher for GSD Viewer auto-refresh (D-02, PANEL-03).
//!    Watches a project directory for changes to .md files and emits
//!    `md-file-changed` Tauri events to trigger frontend refresh.
//!
//! 2. Git status watcher for sidebar Git Changes pane auto-refresh.
//!    Watches .git/ directory for index changes and emits `git-status-changed`
//!    events to trigger sidebar refresh.
//!
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
            .watch(&watch_dir, RecursiveMode::Recursive)
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
        start_md_watcher(app.clone(), project_path.clone());
        start_git_watcher(app.clone(), project_path.clone());
        start_file_tree_watcher(app, project_path);
    } else {
        eprintln!(
            "[efxmux] set_project_path: not a directory: {}",
            path
        );
    }
}

// TODO(Pitfall-11): watchers leak on project switch — see PITFALLS.md lines 270-291.
// Each call to set_project_path spawns a NEW watcher thread without killing the previous one.
// Out of scope for Phase 21 Plan 01 (reuse existing infra per D-04). Fix in a dedicated plan.

/// Start a background thread that watches `project_path` for ANY file changes
/// (FIX-01 / D-05). Emits `file-tree-changed` with the changed path as payload
/// so the frontend can refresh the file tree AND any open editor tabs.
///
/// Uses a 300ms debounce (slightly higher than md watcher's 200ms) to coalesce
/// burst saves from external editors like Zed.
///
/// Filters out noise to avoid churn:
/// - `.git/` (covered by start_git_watcher)
/// - `.planning/` (GSD-only churn — user edits these constantly via GSD workflow)
/// - `node_modules/`, `target/`, `dist/` (build artifacts)
/// - `.DS_Store` (macOS metadata)
/// - Hidden files (final component starts with `.`) EXCEPT `.env*` and `.gitignore`
pub fn start_file_tree_watcher(app_handle: tauri::AppHandle, project_path: PathBuf) {
    let watch_dir = project_path.clone();

    std::thread::spawn(move || {
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(300),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] File tree watcher error: {:?}", e);
                        return;
                    }
                };

                // Filter out noisy paths. Keep first surviving event path.
                let surviving: Vec<_> = events
                    .iter()
                    .filter(|e| {
                        let path_str = e.path.to_string_lossy();

                        // Skip .git/ — covered by start_git_watcher
                        if path_str.contains("/.git/") {
                            return false;
                        }
                        // Skip GSD planning dir — high-churn, user-expected, not file-tree-relevant
                        if path_str.contains("/.planning/") {
                            return false;
                        }
                        // Skip common build/output dirs
                        if path_str.contains("/node_modules/")
                            || path_str.contains("/target/")
                            || path_str.contains("/dist/")
                        {
                            return false;
                        }
                        // Skip .DS_Store files anywhere in the tree
                        if path_str.contains("/.DS_Store") || path_str.ends_with("/.DS_Store") {
                            return false;
                        }

                        // Skip hidden files (final component starts with `.`)
                        // EXCEPT `.env*` and `.gitignore` which developers edit.
                        if let Some(name) = e.path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with('.') {
                                let is_env = name.starts_with(".env");
                                let is_gitignore = name == ".gitignore";
                                if !is_env && !is_gitignore {
                                    return false;
                                }
                            }
                        }

                        true
                    })
                    .collect();

                if !surviving.is_empty() {
                    // Emit once per debounced batch using the first surviving path
                    // (matches md watcher's "first changed" pattern).
                    let changed_path = surviving[0].path.to_string_lossy().to_string();
                    if let Err(e) = handle.emit("file-tree-changed", changed_path) {
                        eprintln!("[efxmux] Failed to emit file-tree-changed event: {}", e);
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create file tree watcher: {:?}", e);
                return;
            }
        };

        // Watch the project directory recursively — external editors can modify any file.
        if let Err(e) = debouncer
            .watcher()
            .watch(&watch_dir, RecursiveMode::Recursive)
        {
            eprintln!(
                "[efxmux] Failed to watch project dir for file tree {:?}: {:?}",
                watch_dir, e
            );
            return;
        }

        println!(
            "[efxmux] File tree watcher active on {:?}",
            watch_dir
        );

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}

/// Start a background thread that watches `.git/` directory for changes.
///
/// Emits `git-status-changed` event when git index or refs change.
/// Uses 300ms debounce to handle rapid git operations.
pub fn start_git_watcher(app_handle: tauri::AppHandle, project_path: PathBuf) {
    let git_dir = project_path.join(".git");

    // Only start watcher if .git directory exists (is a git repo)
    if !git_dir.is_dir() {
        println!(
            "[efxmux] No .git directory found at {:?}, skipping git watcher",
            project_path
        );
        return;
    }

    std::thread::spawn(move || {
        let handle = app_handle.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(300),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(e) => {
                        eprintln!("[efxmux] Git watcher error: {:?}", e);
                        return;
                    }
                };

                // Check if any event is relevant to git status:
                // - index file (staging area)
                // - HEAD, refs/* (branch changes, commits)
                // - COMMIT_EDITMSG (commit in progress)
                let relevant_events: Vec<_> = events
                    .iter()
                    .filter(|e| {
                        let path_str = e.path.to_string_lossy();
                        path_str.contains(".git/index")
                            || path_str.contains(".git/HEAD")
                            || path_str.contains(".git/refs")
                            || path_str.contains(".git/COMMIT_EDITMSG")
                            || path_str.contains(".git/MERGE_HEAD")
                            || path_str.contains(".git/REBASE_HEAD")
                    })
                    .collect();

                if !relevant_events.is_empty() {
                    if let Err(e) = handle.emit("git-status-changed", ()) {
                        eprintln!("[efxmux] Failed to emit git-status-changed event: {}", e);
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[efxmux] Failed to create git watcher: {:?}", e);
                return;
            }
        };

        // Watch the .git directory recursively to catch index, HEAD, and refs changes
        if let Err(e) = debouncer
            .watcher()
            .watch(&git_dir, RecursiveMode::Recursive)
        {
            eprintln!(
                "[efxmux] Failed to watch .git dir {:?}: {:?}",
                git_dir, e
            );
            return;
        }

        println!(
            "[efxmux] Git status watcher active on {:?}",
            git_dir
        );

        // Keep thread alive -- debouncer drops if scope exits
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}
