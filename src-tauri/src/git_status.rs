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
