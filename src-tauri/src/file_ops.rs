//! File operations for right panel views (D-04, D-06, D-01)
//!
//! Provides git diff, directory listing, file reading, and checkbox write-back
//! commands consumed by the frontend via Tauri invoke.

use git2::{DiffOptions, Repository};
use std::path::Path;
use tauri::async_runtime::spawn_blocking;

use crate::state::ManagedAppState;

/// Entry returned by list_directory.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// Validate that a path does not contain traversal components.
fn is_safe_path(path: &str) -> bool {
    let p = Path::new(path);
    !p.components().any(|c| c.as_os_str() == "..")
}

/// Get unified diff for a file relative to its git repo (D-04).
/// Opens the git repo at the file's parent directory, generates a patch diff.
#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    spawn_blocking(move || {
        let file_path = Path::new(&path);
        if !file_path.exists() {
            return Err(format!("File not found: {}", path));
        }

        // Guard file size > 1MB
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > 1_048_576 {
            return Err("File too large for diff viewing".to_string());
        }

        // Find git repo by walking up from file's directory
        let repo = Repository::discover(file_path.parent().unwrap_or(file_path))
            .map_err(|e| format!("Not a git repository: {}", e))?;

        let workdir = repo
            .workdir()
            .ok_or_else(|| "Bare repository not supported".to_string())?;

        // Make path relative to repo workdir
        let rel_path = file_path
            .strip_prefix(workdir)
            .map_err(|_| "File is not inside the git repository".to_string())?;

        let mut opts = DiffOptions::new();
        opts.pathspec(rel_path.to_string_lossy().as_ref());
        opts.include_untracked(true);

        // Diff between index (HEAD) and workdir
        let diff = repo
            .diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| e.to_string())?;

        let mut output = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let origin = line.origin();
            match origin {
                '+' | '-' | ' ' => {
                    output.push(origin);
                    if let Ok(content) = std::str::from_utf8(line.content()) {
                        output.push_str(content);
                    }
                }
                'H' => {
                    // Hunk header line (@@...@@)
                    if let Ok(content) = std::str::from_utf8(line.content()) {
                        output.push_str(content);
                    }
                }
                _ => {}
            }
            true
        })
        .map_err(|e| e.to_string())?;

        // If diff is empty, file might be untracked — show full content as new file
        if output.trim().is_empty() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let mut new_file_output = String::from("@@ New file @@\n");
            for line in content.lines() {
                new_file_output.push('+');
                new_file_output.push_str(line);
                new_file_output.push('\n');
            }
            return Ok(new_file_output);
        }

        Ok(output)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// List directory contents sorted: directories first, then files, alphabetically (D-06).
/// Optionally validates that path is within project_root (T-06-05-01 mitigation).
#[tauri::command]
pub async fn list_directory(path: String, project_root: Option<String>) -> Result<Vec<FileEntry>, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    // Validate path is within project root if provided (T-06-05-01)
    if let Some(ref root) = project_root {
        let canonical_path = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
        let canonical_root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err("Path is outside project root".to_string());
        }
    }

    spawn_blocking(move || {
        let dir = Path::new(&path);
        if !dir.is_dir() {
            return Err(format!("Not a directory: {}", path));
        }

        let mut entries: Vec<FileEntry> = std::fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let metadata = entry.metadata().ok()?;
                let is_dir = metadata.is_dir();
                Some(FileEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir,
                    size: if is_dir { None } else { Some(metadata.len()) },
                })
            })
            .collect();

        // Sort: dirs first, then files, alphabetically within each group
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read file content as string (D-06). Guards against files > 1MB.
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    spawn_blocking(move || {
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > 1_048_576 {
            return Err("File too large (> 1MB)".to_string());
        }
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Alias for read_file_content (D-06).
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    read_file_content(path).await
}

/// Write checkbox state back to a .md file (D-01).
/// Finds the specified line, validates it contains a task list checkbox,
/// and toggles it. Uses atomic write (tmp + rename) for safety.
#[tauri::command]
pub async fn write_checkbox(
    path: String,
    line: u32,
    checked: bool,
    managed: tauri::State<'_, ManagedAppState>,
) -> Result<(), String> {
    // Derive project root from active project for path validation
    let project_root = {
        let guard = managed.0.lock().map_err(|e| e.to_string())?;
        guard.project.active.clone()
    };

    if let Some(ref root) = project_root {
        let full = Path::new(&path);
        if !full.starts_with(root) {
            return Err("Path is outside the active project directory".to_string());
        }
    }

    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    spawn_blocking(move || {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

        let idx = line as usize;
        if idx >= lines.len() {
            return Err(format!(
                "Line {} out of range (file has {} lines)",
                line,
                lines.len()
            ));
        }

        let target = &lines[idx];
        // Validate: must be a task list item (- [ ] or - [x] or * [ ] or * [x])
        let checkbox_re = regex::Regex::new(r"^(\s*[-*]\s*\[)[ xX](\].*)$")
            .map_err(|e| e.to_string())?;

        if let Some(caps) = checkbox_re.captures(target) {
            let prefix = &caps[1];
            let suffix = &caps[2];
            let mark = if checked { "x" } else { " " };
            lines[idx] = format!("{}{}{}", prefix, mark, suffix);
        } else {
            return Err(format!("Line {} is not a checkbox task item", line));
        }

        // Atomic write: tmp + rename
        let tmp_path = format!("{}.tmp", path);
        let output = lines.join("\n");
        // Preserve trailing newline if original had one
        let output = if content.ends_with('\n') {
            format!("{}\n", output)
        } else {
            output
        };
        std::fs::write(&tmp_path, &output).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
