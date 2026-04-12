//! Native git status via git2 (no shell-out)

use git2::Repository;
use tauri::async_runtime::spawn_blocking;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub modified: usize,
    pub staged: usize,
    pub untracked: usize,
}

impl GitStatus {
    pub fn for_path(path: &str) -> Result<Self, String> {
        let repo = Repository::open(path).map_err(|e| e.to_string())?;
        let head = repo.head().map_err(|e| e.to_string())?;
        let branch = head.shorthand().unwrap_or("HEAD").to_string();

        let mut modified = 0;
        let mut staged = 0;
        let mut untracked = 0;

        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true);
        let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

        for entry in statuses.iter() {
            let flags = entry.status();
            if flags.intersects(git2::Status::WT_MODIFIED) {
                modified += 1;
            }
            if flags.intersects(
                git2::Status::INDEX_MODIFIED | git2::Status::INDEX_NEW | git2::Status::INDEX_RENAMED,
            ) {
                staged += 1;
            }
            if flags.intersects(git2::Status::WT_NEW) {
                untracked += 1;
            }
        }

        Ok(GitStatus {
            branch,
            modified,
            staged,
            untracked,
        })
    }
}

#[tauri::command]
pub async fn get_git_status(path: String) -> Result<GitStatus, String> {
    spawn_blocking(move || GitStatus::for_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Individual file entry with status indicator for sidebar listing.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GitFileEntry {
    pub name: String,
    pub path: String,
    pub status: String, // "M", "S", "U"
}

/// Synchronous inner implementation of get_git_files for testing.
pub fn get_git_files_impl(path: &str) -> Result<Vec<GitFileEntry>, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    // Collect workdir-related statuses
    for entry in statuses.iter() {
        let flags = entry.status();
        let rel_path = entry.path().unwrap_or("").to_string();
        let name = rel_path.split('/').last().unwrap_or(&rel_path).to_string();
        let full_path = format!("{}/{}", path, rel_path);
        let status = if flags.intersects(
            git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_NEW
                | git2::Status::INDEX_RENAMED,
        ) {
            "S"
        } else if flags.intersects(git2::Status::WT_MODIFIED) {
            "M"
        } else if flags.intersects(git2::Status::WT_NEW) {
            "U"
        } else {
            continue;
        };
        files.push(GitFileEntry {
            name,
            path: full_path,
            status: status.to_string(),
        });
    }

    // git2 statuses() doesn't include INDEX_NEW files (staged, not yet committed)
    // that have no workdir representation. Use index entry stage to detect them.
    // Stage 2 = file is staged (in index but not in HEAD).
    let index = repo.index().map_err(|e| e.to_string())?;
    for entry in index.iter() {
        let entry_path_bytes = &entry.path;
        let entry_path = std::str::from_utf8(entry_path_bytes)
            .map(|s| s.to_string())
            .unwrap_or_else(|_| String::from_utf8_lossy(entry_path_bytes).to_string());
        // Skip if already in files
        if files.iter().any(|f| f.name == entry_path) {
            continue;
        }
        // Stage is stored in the upper 2 bits of flags (0=none, 1=normal merge, 2=staged, 3=both-merged)
        let stage = (entry.flags >> 2) & 0x3;
        if stage == 2 {
            let name = entry_path.split('/').last().unwrap_or(&entry_path).to_string();
            let full_path = format!("{}/{}", path, entry_path);
            files.push(GitFileEntry {
                name,
                path: full_path,
                status: "S".to_string(),
            });
        }
    }

    Ok(files)
}

/// Return file-level git status entries for the sidebar GIT CHANGES section.
#[tauri::command]
pub async fn get_git_files(path: String) -> Result<Vec<GitFileEntry>, String> {
    spawn_blocking(move || get_git_files_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn run_git(dir: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command failed");
        if !output.status.success() {
            eprintln!("git stderr: {}", String::from_utf8_lossy(&output.stderr));
        }
    }

    fn setup_git_repo() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        run_git(&dir.path(), &["init"]);
        run_git(&dir.path(), &["config", "user.email", "test@test.com"]);
        run_git(&dir.path(), &["config", "user.name", "Test"]);
        // Create initial commit so HEAD exists (git2 requires this for repo.head())
        let placeholder = dir.path().join(".gitkeep");
        std::fs::write(&placeholder, "").unwrap();
        run_git(&dir.path(), &["add", ".gitkeep"]);
        run_git(&dir.path(), &["commit", "-m", "initial"]);
        (dir, path)
    }

    #[test]
    fn empty_repo_has_zero_counts() {
        let (_dir, path) = setup_git_repo();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.modified, 0);
        assert_eq!(status.staged, 0);
        assert_eq!(status.untracked, 0);
    }

    #[test]
    fn staged_file_shows_staged_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "content").unwrap();
        run_git(&dir.path(), &["add", "test.txt"]);
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.staged, 1);
        assert_eq!(status.modified, 0);
        assert_eq!(status.untracked, 0);
    }

    #[test]
    fn modified_file_shows_modified_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "v1").unwrap();
        run_git(&dir.path(), &["add", "test.txt"]);
        run_git(&dir.path(), &["commit", "-m", "v1"]);
        std::fs::write(&file_path, "v2").unwrap();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.modified, 1);
        assert_eq!(status.staged, 0);
    }

    #[test]
    fn untracked_file_shows_untracked_count() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("new.txt");
        std::fs::write(&file_path, "new content").unwrap();
        let status = GitStatus::for_path(&path).unwrap();
        assert_eq!(status.untracked, 1);
    }

    #[test]
    fn get_git_files_returns_correct_status_letters() {
        let (dir, path) = setup_git_repo();
        // staged file (INDEX_NEW)
        let staged = dir.path().join("staged.txt");
        std::fs::write(&staged, "s").unwrap();
        run_git(&dir.path(), &["add", "staged.txt"]);
        // modified file (WT_MODIFIED) — commit first, then edit
        let modified = dir.path().join("modified.txt");
        std::fs::write(&modified, "m").unwrap();
        run_git(&dir.path(), &["add", "modified.txt"]);
        run_git(&dir.path(), &["commit", "-m", "m"]);
        std::fs::write(&modified, "mm").unwrap();
        // untracked file (WT_NEW)
        let untracked = dir.path().join("untracked.txt");
        std::fs::write(&untracked, "u").unwrap();

        let files = get_git_files_impl(&path).unwrap();
        let file_statuses: std::collections::HashMap<_, _> =
            files.iter().map(|f| (f.name.as_str(), f.status.as_str())).collect();
        assert_eq!(file_statuses.get("staged.txt").map(|s| *s), Some("S"));
        assert_eq!(file_statuses.get("modified.txt").map(|s| *s), Some("M"));
        assert_eq!(file_statuses.get("untracked.txt").map(|s| *s), Some("U"));
    }
}
