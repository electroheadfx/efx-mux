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

/// Extract a display name from a relative git path.
///
/// libgit2's status iterator can return entries with a trailing `/` for
/// untracked entries that are themselves directories — most commonly
/// nested git repositories such as git worktrees, where libgit2 reports
/// the directory as a single opaque entry instead of recursing into it.
///
/// A naive `path.split('/').last()` returns `""` for those entries, which
/// surfaced in the UI as "blank filename" rows in the git panel
/// (debug session: git-blank-filenames). This helper strips the trailing
/// slash before extracting the basename so the directory name is shown.
fn extract_display_name(rel_path: &str) -> String {
    let trimmed = rel_path.trim_end_matches('/');
    trimmed
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(rel_path)
        .to_string()
}

/// Synchronous inner implementation of get_git_files for testing.
pub fn get_git_files_impl(path: &str) -> Result<Vec<GitFileEntry>, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let mut opts = git2::StatusOptions::new();
    opts.show(git2::StatusShow::IndexAndWorkdir);
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    // Collect workdir-related statuses
    for entry in statuses.iter() {
        let flags = entry.status();
        let rel_path = entry.path().unwrap_or("").to_string();
        // libgit2 may return a trailing '/' for nested-repo / worktree dirs
        // that it does not recurse into. Strip it so the filename render is
        // not blank and downstream stage/diff calls receive a clean path.
        let trimmed_rel = rel_path.trim_end_matches('/').to_string();
        let name = extract_display_name(&rel_path);
        let full_path = format!("{}/{}", path, trimmed_rel);
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

    Ok(files)
}

/// Return file-level git status entries for the sidebar GIT CHANGES section.
#[tauri::command]
pub async fn get_git_files(path: String) -> Result<Vec<GitFileEntry>, String> {
    spawn_blocking(move || get_git_files_impl(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Per-file diff stats (additions/deletions) for the sidebar.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileDiffStats {
    pub path: String,
    pub additions: usize,
    pub deletions: usize,
}

/// Synchronous inner implementation of get_file_diff_stats for testing.
///
/// Computes per-file line additions/deletions by diffing HEAD tree against
/// the working directory with index (captures both staged and unstaged changes).
/// Uses git2's Patch API for accurate per-file line_stats.
pub fn get_file_diff_stats_impl(repo_path: &str) -> Result<Vec<FileDiffStats>, String> {
    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    // Get HEAD tree (required to diff against)
    let head_tree = repo
        .head()
        .and_then(|h| h.peel_to_tree())
        .map_err(|e| e.to_string())?;

    // Diff HEAD tree vs workdir+index -- captures all changes regardless of staging state
    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), None)
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();

    for idx in 0..diff.deltas().len() {
        if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, idx) {
            let (_, adds, dels) = patch.line_stats().unwrap_or((0, 0, 0));
            if adds > 0 || dels > 0 {
                let delta = diff.get_delta(idx).unwrap();
                let rel = delta
                    .new_file()
                    .path()
                    .unwrap_or(std::path::Path::new(""));
                let full = format!("{}/{}", repo_path, rel.display());
                results.push(FileDiffStats {
                    path: full,
                    additions: adds,
                    deletions: dels,
                });
            }
        }
    }

    Ok(results)
}

/// Return per-file diff stats (additions/deletions) for the git panel.
#[tauri::command]
pub async fn get_file_diff_stats(repo_path: String) -> Result<Vec<FileDiffStats>, String> {
    spawn_blocking(move || get_file_diff_stats_impl(&repo_path))
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
    fn get_file_diff_stats_returns_additions_and_deletions() {
        let (dir, path) = setup_git_repo();
        // Create a file, commit it, then modify
        let file = dir.path().join("stats.txt");
        std::fs::write(&file, "line1\nline2\nline3\n").unwrap();
        run_git(dir.path(), &["add", "stats.txt"]);
        run_git(dir.path(), &["commit", "-m", "add stats.txt"]);

        // Modify: remove line2, add two new lines
        std::fs::write(&file, "line1\nline3\nnewA\nnewB\n").unwrap();

        let stats = get_file_diff_stats_impl(&path).unwrap();
        let entry = stats.iter().find(|s| s.path.ends_with("stats.txt"));
        assert!(entry.is_some(), "stats.txt should have diff stats");
        let entry = entry.unwrap();
        assert!(entry.additions > 0, "Should have additions");
        assert!(entry.deletions > 0, "Should have deletions");
    }

    #[test]
    fn get_file_diff_stats_empty_for_clean_repo() {
        let (_dir, path) = setup_git_repo();
        let stats = get_file_diff_stats_impl(&path).unwrap();
        assert!(stats.is_empty(), "Clean repo should have no diff stats");
    }

    #[test]
    fn get_git_files_returns_correct_status_letters() {
        let (dir, path) = setup_git_repo();
        // modified file (WT_MODIFIED) — commit first, then edit
        let modified = dir.path().join("modified.txt");
        std::fs::write(&modified, "m").unwrap();
        run_git(&dir.path(), &["add", "modified.txt"]);
        run_git(&dir.path(), &["commit", "-m", "add modified"]);
        std::fs::write(&modified, "mm").unwrap();
        // staged file (INDEX_NEW) — add AFTER the commit so it stays staged
        let staged = dir.path().join("staged.txt");
        std::fs::write(&staged, "s").unwrap();
        run_git(&dir.path(), &["add", "staged.txt"]);
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

    // ─── extract_display_name unit tests ────────────────────────────────────

    #[test]
    fn extract_display_name_handles_plain_file() {
        assert_eq!(extract_display_name("foo.txt"), "foo.txt");
    }

    #[test]
    fn extract_display_name_handles_nested_file() {
        assert_eq!(extract_display_name("src/lib/foo.txt"), "foo.txt");
    }

    #[test]
    fn extract_display_name_handles_trailing_slash_dir() {
        // Reproduces the git-blank-filenames bug: libgit2 returns nested-repo
        // dirs with a trailing '/' which previously caused blank UI rows.
        assert_eq!(
            extract_display_name(".claude/worktrees/agent-a515d87e/"),
            "agent-a515d87e"
        );
    }

    #[test]
    fn extract_display_name_handles_top_level_dir_with_slash() {
        assert_eq!(extract_display_name("worktrees/"), "worktrees");
    }

    #[test]
    fn extract_display_name_handles_empty_string() {
        // Defensive — should never happen, but should not panic.
        assert_eq!(extract_display_name(""), "");
    }

    // ─── nested-repo regression test ────────────────────────────────────────

    /// Regression test for git-blank-filenames: when an untracked directory
    /// is itself a git repository (such as a git worktree), libgit2 reports
    /// it as a single entry with a trailing slash and does not recurse into
    /// it. Previously this produced a `GitFileEntry` with an empty `name`
    /// field, which rendered as a blank row in the git panel.
    #[test]
    fn get_git_files_handles_untracked_nested_repo_dir() {
        let (outer_dir, outer_path) = setup_git_repo();

        // Create an untracked subdir that is itself a git repo (mimics a
        // git worktree / nested repo). libgit2 will report this as a single
        // untracked entry with a trailing slash.
        let nested_dir = outer_dir.path().join("nested-repo");
        std::fs::create_dir(&nested_dir).unwrap();
        run_git(&nested_dir, &["init"]);
        run_git(&nested_dir, &["config", "user.email", "n@n.com"]);
        run_git(&nested_dir, &["config", "user.name", "Nested"]);
        // Add at least one file so the nested repo is non-empty
        std::fs::write(nested_dir.join("inner.txt"), "x").unwrap();

        let files = get_git_files_impl(&outer_path).unwrap();
        let nested_entry = files
            .iter()
            .find(|f| f.path.contains("nested-repo"))
            .expect("nested-repo dir should appear as a git entry");

        assert!(
            !nested_entry.name.is_empty(),
            "name must not be blank for nested-repo dir, got: {:?}",
            nested_entry
        );
        assert_eq!(
            nested_entry.name, "nested-repo",
            "name should be the directory's basename"
        );
        assert!(
            !nested_entry.path.ends_with('/'),
            "path should not have a trailing slash, got: {:?}",
            nested_entry.path
        );
        assert_eq!(nested_entry.status, "U");
    }
}
