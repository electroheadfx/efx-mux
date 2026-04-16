//! File operations for right panel views (D-04, D-06, D-01)
//!
//! Provides git diff, directory listing, file reading, and checkbox write-back
//! commands consumed by the frontend via Tauri invoke.

use git2::{DiffOptions, Repository};
use std::path::Path;
use tauri::async_runtime::spawn_blocking;
use tauri::{AppHandle, Emitter};

use crate::state::ManagedAppState;

/// Entry returned by list_directory.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// Child count result for count_children (Phase 18, D-02).
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChildCount {
    pub files: u32,
    pub folders: u32,
    pub total: u32,
    pub capped: bool,
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
    spawn_blocking(move || get_file_diff_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Synchronous inner implementation of get_file_diff for testing.
pub fn get_file_diff_impl(path: &str) -> Result<String, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Guard file size > 1MB
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
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

    // Helper closure to extract patch text from a git2::Diff
    let extract_patch = |diff: git2::Diff| -> Result<String, String> {
        let mut out = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let origin = line.origin();
            match origin {
                '+' | '-' | ' ' => {
                    out.push(origin);
                    if let Ok(content) = std::str::from_utf8(line.content()) {
                        out.push_str(content);
                    }
                }
                'H' => {
                    if let Ok(content) = std::str::from_utf8(line.content()) {
                        out.push_str(content);
                    }
                }
                _ => {}
            }
            true
        })
        .map_err(|e| e.to_string())?;
        Ok(out)
    };

    let pathspec = rel_path.to_string_lossy().to_string();

    // 1. Try staged diff (HEAD tree → index) first
    let staged_output = if let Ok(head_ref) = repo.head() {
        if let Ok(head_commit) = head_ref.peel_to_commit() {
            if let Ok(head_tree) = head_commit.tree() {
                let mut opts = DiffOptions::new();
                opts.pathspec(&pathspec);
                if let Ok(diff) = repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts)) {
                    extract_patch(diff)?
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // 2. Try unstaged diff (index → workdir)
    let mut opts = DiffOptions::new();
    opts.pathspec(&pathspec);
    opts.include_untracked(true);
    let unstaged_diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.to_string())?;
    let unstaged_output = extract_patch(unstaged_diff)?;

    // Combine: prefer staged if present, append unstaged if also present
    let output = if !staged_output.trim().is_empty() && !unstaged_output.trim().is_empty() {
        format!("{}\n{}", staged_output, unstaged_output)
    } else if !staged_output.trim().is_empty() {
        staged_output
    } else {
        unstaged_output
    };

    // If both empty, file might be untracked — show full content as new file
    if output.trim().is_empty() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut new_file_output = String::from("@@ New file @@\n");
        for line in content.lines() {
            new_file_output.push('+');
            new_file_output.push_str(line);
            new_file_output.push('\n');
        }
        return Ok(new_file_output);
    }

    Ok(output)
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

/// Synchronous inner implementation of write_checkbox for testing.
pub fn write_checkbox_impl(
    path: &str,
    line: u32,
    checked: bool,
) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
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
}

/// Synchronous inner implementation of write_file_content for testing.
pub fn write_file_content_impl(path: &str, content: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    // Atomic write: tmp + rename
    let tmp_path = format!("{}.tmp", path);
    std::fs::write(&tmp_path, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write content to a file atomically (D-12).
#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || write_file_content_impl(&path, &content))
        .await
        .map_err(|e| e.to_string())?
}

/// Synchronous inner implementation of delete_file for testing.
pub fn delete_file_impl(path: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    let p = Path::new(path);
    if p.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

/// Delete a file or directory (D-12).
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || delete_file_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Synchronous inner implementation of rename_file for testing.
pub fn rename_file_impl(from: &str, to: &str) -> Result<(), String> {
    if !is_safe_path(from) || !is_safe_path(to) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

/// Rename/move a file (D-12).
#[tauri::command]
pub async fn rename_file(from: String, to: String) -> Result<(), String> {
    if !is_safe_path(&from) || !is_safe_path(&to) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || rename_file_impl(&from, &to))
        .await
        .map_err(|e| e.to_string())?
}

/// Synchronous inner implementation of create_file for testing.
pub fn create_file_impl(path: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    // Create parent directories if needed
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(path, "").map_err(|e| e.to_string())
}

/// Create an empty file (D-12).
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || create_file_impl(&path))
        .await
        .map_err(|e| e.to_string())?
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

    spawn_blocking(move || write_checkbox_impl(&path, line, checked))
        .await
        .map_err(|e| e.to_string())?
}

// ============================================================================
// Phase 18: File tree enhancements (D-17, D-25, D-02)
// ============================================================================

/// Synchronous inner implementation of create_folder for testing.
pub fn create_folder_impl(path: &str) -> Result<(), String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    if Path::new(path).exists() {
        return Err(format!("Path already exists: {}", path));
    }
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Create a directory (Phase 18, D-25).
#[tauri::command]
pub async fn create_folder(path: String, app: AppHandle) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    let path_clone = path.clone();
    spawn_blocking(move || create_folder_impl(&path_clone))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app.emit("git-status-changed", ());
    Ok(())
}

/// Recursive copy helper (std only — matches file_ops.rs style).
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_child = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_child)?;
        } else {
            std::fs::copy(entry.path(), &dst_child)?;
        }
    }
    Ok(())
}

/// Synchronous inner implementation of copy_path for testing.
pub fn copy_path_impl(from: &str, to: &str) -> Result<(), String> {
    if !is_safe_path(from) || !is_safe_path(to) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    let from_p = Path::new(from);
    let to_p = Path::new(to);
    if to_p.exists() {
        return Err(format!("Target exists: {}", to));
    }
    let meta = std::fs::metadata(from_p).map_err(|e| e.to_string())?;
    if meta.is_file() {
        std::fs::copy(from_p, to_p).map(|_| ()).map_err(|e| e.to_string())
    } else if meta.is_dir() {
        copy_dir_recursive(from_p, to_p).map_err(|e| {
            // Best-effort cleanup on partial failure (RESEARCH.md §2 partial-failure policy).
            let _ = std::fs::remove_dir_all(to_p);
            e.to_string()
        })
    } else {
        Err("Unsupported file type".to_string())
    }
}

/// Copy a file or directory (Phase 18, D-17).
#[tauri::command]
pub async fn copy_path(from: String, to: String, app: AppHandle) -> Result<(), String> {
    if !is_safe_path(&from) || !is_safe_path(&to) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    let from_clone = from.clone();
    let to_clone = to.clone();
    spawn_blocking(move || copy_path_impl(&from_clone, &to_clone))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app.emit("git-status-changed", ());
    Ok(())
}

fn count_children_walk(dir: &Path, c: &mut ChildCount, cap: u32) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        if c.total >= cap {
            c.capped = true;
            return Ok(());
        }
        let e = entry?;
        let ty = e.file_type()?;
        c.total += 1;
        if ty.is_dir() {
            c.folders += 1;
            let _ = count_children_walk(&e.path(), c, cap);
            if c.capped {
                return Ok(());
            }
        } else {
            c.files += 1;
        }
    }
    Ok(())
}

/// Synchronous inner implementation of count_children for testing.
pub fn count_children_impl(path: &str, cap: u32) -> Result<ChildCount, String> {
    if !is_safe_path(path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    let mut c = ChildCount {
        files: 0,
        folders: 0,
        total: 0,
        capped: false,
    };
    count_children_walk(Path::new(path), &mut c, cap).map_err(|e| e.to_string())?;
    Ok(c)
}

/// Count descendants of a directory, capped at 10000 (Phase 18, D-02).
#[tauri::command]
pub async fn count_children(path: String) -> Result<ChildCount, String> {
    if !is_safe_path(&path) {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    spawn_blocking(move || count_children_impl(&path, 10_000))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn is_safe_path_accepts_relative_paths() {
        assert!(is_safe_path("src/foo.ts"));
        assert!(is_safe_path("src/nested/deep/file.rs"));
        assert!(is_safe_path("foo"));
        assert!(is_safe_path("a/b/c/d/e/f/g.txt"));
    }

    #[test]
    fn is_safe_path_rejects_traversal() {
        assert!(!is_safe_path("../foo"));
        assert!(!is_safe_path("src/../../../etc/passwd"));
        assert!(!is_safe_path("foo/../../bar"));
    }

    #[test]
    fn is_safe_path_accepts_absolute_paths_on_unix() {
        // On Unix, absolute paths like /etc/passwd don't contain ".." components,
        // so is_safe_path (which only checks for "..") allows them.
        // This is acceptable since the function's purpose is traversal prevention.
        #[cfg(unix)]
        {
            assert!(is_safe_path("/etc/passwd"));
        }
        // On Windows, absolute paths contain root components that are not ".."
        #[cfg(windows)]
        {
            assert!(!is_safe_path("C:\\Users\\foo"));
        }
    }

    #[test]
    fn file_too_large_rejected() {
        let dir = TempDir::new().unwrap();
        let big_file = dir.path().join("big.txt");
        // Write ~1.1MB (1,157,000 bytes)
        let content = "x".repeat(1_157_000);
        std::fs::write(&big_file, content).unwrap();
        let path = big_file.to_str().unwrap().to_string();

        // Initialize git repo so get_file_diff can discover it
        let _ = std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.email", "t@t.com"])
            .current_dir(dir.path())
            .output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.name", "T"])
            .current_dir(dir.path())
            .output();

        let result = get_file_diff_impl(&path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("too large"), "Expected 'too large' error, got: {}", err);
    }

    #[test]
    fn write_checkbox_toggles_checkbox_state() {
        let dir = TempDir::new().unwrap();
        let md_file = dir.path().join("tasks.md");
        std::fs::write(&md_file, "- [ ] Task 1\n- [x] Task 2\n").unwrap();
        let path = md_file.to_str().unwrap().to_string();

        // Toggle first line: - [ ] -> - [x]
        let result = write_checkbox_impl(&path, 0, true);
        assert!(result.is_ok(), "write_checkbox_impl failed: {:?}", result);

        let content = std::fs::read_to_string(&md_file).unwrap();
        assert!(content.contains("- [x] Task 1"), "First line should be checked: {}", content);
        assert!(content.contains("- [x] Task 2"), "Second line should still be checked: {}", content);
    }

    #[test]
    fn write_checkbox_rejects_non_checkbox_line() {
        let dir = TempDir::new().unwrap();
        let md_file = dir.path().join("notes.md");
        std::fs::write(&md_file, "This is not a checkbox\n").unwrap();
        let path = md_file.to_str().unwrap().to_string();

        let result = write_checkbox_impl(&path, 0, true);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("not a checkbox"), "Expected 'not a checkbox' error, got: {}", err);
    }

    // ========== Phase 15: write_file_content tests ==========

    #[test]
    fn write_file_content_writes_and_reads() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.txt");
        let path = file.to_str().unwrap();

        write_file_content_impl(path, "hello world").unwrap();
        let content = std::fs::read_to_string(path).unwrap();
        assert_eq!(content, "hello world");
    }

    #[test]
    fn write_file_content_rejects_traversal() {
        let result = write_file_content_impl("../etc/passwd", "bad");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    #[test]
    fn write_file_content_overwrites_existing() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.txt");
        let path = file.to_str().unwrap();

        std::fs::write(&file, "original").unwrap();
        write_file_content_impl(path, "updated").unwrap();
        let content = std::fs::read_to_string(path).unwrap();
        assert_eq!(content, "updated");
    }

    // ========== Phase 15: delete_file tests ==========

    #[test]
    fn delete_file_removes_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("to_delete.txt");
        std::fs::write(&file, "content").unwrap();
        let path = file.to_str().unwrap();

        assert!(file.exists());
        delete_file_impl(path).unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn delete_file_removes_directory() {
        let dir = TempDir::new().unwrap();
        let subdir = dir.path().join("subdir");
        std::fs::create_dir(&subdir).unwrap();
        std::fs::write(subdir.join("file.txt"), "content").unwrap();
        let path = subdir.to_str().unwrap();

        assert!(subdir.exists());
        delete_file_impl(path).unwrap();
        assert!(!subdir.exists());
    }

    #[test]
    fn delete_file_rejects_traversal() {
        let result = delete_file_impl("../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    // ========== Phase 15: rename_file tests ==========

    #[test]
    fn rename_file_moves_file() {
        let dir = TempDir::new().unwrap();
        let from = dir.path().join("old.txt");
        let to = dir.path().join("new.txt");
        std::fs::write(&from, "content").unwrap();

        rename_file_impl(from.to_str().unwrap(), to.to_str().unwrap()).unwrap();

        assert!(!from.exists());
        assert!(to.exists());
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "content");
    }

    #[test]
    fn rename_file_rejects_traversal_in_from() {
        let dir = TempDir::new().unwrap();
        let to = dir.path().join("new.txt");
        let result = rename_file_impl("../etc/passwd", to.to_str().unwrap());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    #[test]
    fn rename_file_rejects_traversal_in_to() {
        let dir = TempDir::new().unwrap();
        let from = dir.path().join("old.txt");
        std::fs::write(&from, "content").unwrap();
        let result = rename_file_impl(from.to_str().unwrap(), "../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    // ========== Phase 15: create_file tests ==========

    #[test]
    fn create_file_creates_empty_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("new.txt");
        let path = file.to_str().unwrap();

        assert!(!file.exists());
        create_file_impl(path).unwrap();
        assert!(file.exists());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "");
    }

    #[test]
    fn create_file_creates_parent_directories() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a").join("b").join("c").join("deep.txt");
        let path = file.to_str().unwrap();

        assert!(!file.exists());
        create_file_impl(path).unwrap();
        assert!(file.exists());
    }

    #[test]
    fn create_file_rejects_traversal() {
        let result = create_file_impl("../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    // ========== Phase 18: create_folder tests ==========

    #[test]
    fn create_folder_creates_directory() {
        let dir = TempDir::new().unwrap();
        let new_dir = dir.path().join("new_folder");
        let path = new_dir.to_str().unwrap();

        assert!(!new_dir.exists());
        create_folder_impl(path).unwrap();
        assert!(new_dir.exists());
        assert!(new_dir.is_dir());
    }

    #[test]
    fn create_folder_rejects_existing() {
        let dir = TempDir::new().unwrap();
        let existing = dir.path().join("existing");
        std::fs::create_dir(&existing).unwrap();
        let path = existing.to_str().unwrap();

        let result = create_folder_impl(path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("already exists"), "Expected 'already exists' error, got: {}", err);
    }

    #[test]
    fn create_folder_rejects_traversal() {
        let result = create_folder_impl("../etc/newdir");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    // ========== Phase 18: copy_path tests ==========

    #[test]
    fn copy_path_copies_file() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("source.txt");
        let dst = dir.path().join("dest.txt");
        std::fs::write(&src, "hello world").unwrap();

        copy_path_impl(src.to_str().unwrap(), dst.to_str().unwrap()).unwrap();

        assert!(src.exists(), "Source should still exist (copy, not move)");
        assert!(dst.exists(), "Destination should exist");
        assert_eq!(std::fs::read_to_string(&src).unwrap(), "hello world");
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "hello world");
    }

    #[test]
    fn copy_path_copies_directory_recursively() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("src_dir");
        let dst = dir.path().join("dst_dir");
        std::fs::create_dir(&src).unwrap();
        std::fs::write(src.join("file1.txt"), "content1").unwrap();
        std::fs::create_dir(src.join("subdir")).unwrap();
        std::fs::write(src.join("subdir").join("file2.txt"), "content2").unwrap();

        copy_path_impl(src.to_str().unwrap(), dst.to_str().unwrap()).unwrap();

        // Destination has the complete tree
        assert!(dst.exists());
        assert!(dst.is_dir());
        assert!(dst.join("file1.txt").exists());
        assert!(dst.join("subdir").exists());
        assert!(dst.join("subdir").join("file2.txt").exists());
        assert_eq!(
            std::fs::read_to_string(dst.join("file1.txt")).unwrap(),
            "content1"
        );
        assert_eq!(
            std::fs::read_to_string(dst.join("subdir").join("file2.txt")).unwrap(),
            "content2"
        );

        // Source tree still intact (non-destructive)
        assert!(src.exists());
        assert!(src.join("file1.txt").exists());
        assert!(src.join("subdir").join("file2.txt").exists());
    }

    #[test]
    fn copy_path_rejects_existing_target() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("src.txt");
        let dst = dir.path().join("dst.txt");
        std::fs::write(&src, "source").unwrap();
        std::fs::write(&dst, "preexisting").unwrap();

        let result = copy_path_impl(src.to_str().unwrap(), dst.to_str().unwrap());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Target exists"), "Expected 'Target exists' error, got: {}", err);

        // Filesystem unchanged — destination still has its original content
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "preexisting");
    }

    #[test]
    fn copy_path_rejects_traversal() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("src.txt");
        std::fs::write(&src, "content").unwrap();

        let result = copy_path_impl("../etc/passwd", dir.path().join("dst.txt").to_str().unwrap());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);

        let result = copy_path_impl(src.to_str().unwrap(), "../etc/evil");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("directory traversal"), "Expected traversal error, got: {}", err);
    }

    // ========== Phase 18: count_children tests ==========

    #[test]
    fn count_children_counts_files_and_dirs() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        // Fixture: 2 subdirs (a, b) each with 1 file, plus 1 file at root = 3 files, 2 folders
        std::fs::create_dir(root.join("a")).unwrap();
        std::fs::create_dir(root.join("b")).unwrap();
        std::fs::write(root.join("a").join("file_a.txt"), "a").unwrap();
        std::fs::write(root.join("b").join("file_b.txt"), "b").unwrap();
        std::fs::write(root.join("root_file.txt"), "r").unwrap();

        let count = count_children_impl(root.to_str().unwrap(), 10_000).unwrap();
        assert_eq!(count.files, 3);
        assert_eq!(count.folders, 2);
        assert_eq!(count.total, 5);
        assert!(!count.capped);
    }

    #[test]
    fn count_children_caps_at_limit() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        // Same fixture as above (5 total entries)
        std::fs::create_dir(root.join("a")).unwrap();
        std::fs::create_dir(root.join("b")).unwrap();
        std::fs::write(root.join("a").join("file_a.txt"), "a").unwrap();
        std::fs::write(root.join("b").join("file_b.txt"), "b").unwrap();
        std::fs::write(root.join("root_file.txt"), "r").unwrap();

        // Cap at 3 entries → must set capped: true
        let count = count_children_impl(root.to_str().unwrap(), 3).unwrap();
        assert!(count.capped, "Expected capped=true when entries exceed cap");
    }
}
