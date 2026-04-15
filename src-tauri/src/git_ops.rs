//! Git operations for stage/unstage/commit/push (Phase 15)
//!
//! Provides git2-based commands for staging, unstaging, committing, and pushing
//! changes. Consumed by the frontend via Tauri invoke.

use git2::{Cred, PushOptions, RemoteCallbacks, Repository, Signature};
use std::env;
use std::path::Path;
use tauri::async_runtime::spawn_blocking;

/// Typed error enum for git operations (D-08).
#[derive(Debug, Clone, serde::Serialize)]
pub enum GitError {
    NotARepo,
    FileNotFound,
    IndexError(String),
    CommitError(String),
    PushRejected(String),
    AuthFailed,
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::NotARepo => write!(f, "Not a git repository"),
            GitError::FileNotFound => write!(f, "File not found"),
            GitError::IndexError(s) => write!(f, "Index error: {}", s),
            GitError::CommitError(s) => write!(f, "Commit error: {}", s),
            GitError::PushRejected(s) => write!(f, "Push rejected: {}", s),
            GitError::AuthFailed => write!(f, "Authentication failed"),
        }
    }
}

impl std::error::Error for GitError {}

/// Synchronous inner implementation of stage_file for testing.
/// Adds a file to the git index.
pub fn stage_file_impl(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    // Get workdir for relative path calculation
    let workdir = repo.workdir().ok_or(GitError::NotARepo)?;

    // file_path can be absolute or relative to repo root
    let rel_path = if Path::new(file_path).is_absolute() {
        Path::new(file_path)
            .strip_prefix(workdir)
            .map_err(|_| GitError::FileNotFound)?
    } else {
        Path::new(file_path)
    };

    // Verify the file exists
    if !workdir.join(rel_path).exists() {
        return Err(GitError::FileNotFound);
    }

    let mut index = repo
        .index()
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    index
        .add_path(rel_path)
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    index
        .write()
        .map_err(|e| GitError::IndexError(e.to_string()))?;

    Ok(())
}

/// Synchronous inner implementation of unstage_file for testing.
/// Removes a file from the git index (resets to HEAD state).
pub fn unstage_file_impl(repo_path: &str, file_path: &str) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    // Get workdir for relative path calculation
    let workdir = repo.workdir().ok_or(GitError::NotARepo)?;

    // file_path can be absolute or relative to repo root
    let rel_path = if Path::new(file_path).is_absolute() {
        Path::new(file_path)
            .strip_prefix(workdir)
            .map_err(|_| GitError::FileNotFound)?
    } else {
        Path::new(file_path)
    };

    // Check if file exists in HEAD tree
    let head = repo.head().map_err(|e| GitError::IndexError(e.to_string()))?;
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| GitError::IndexError(e.to_string()))?;
    let head_tree = head_commit
        .tree()
        .map_err(|e| GitError::IndexError(e.to_string()))?;

    // Check if file exists in HEAD
    let file_in_head = head_tree.get_path(rel_path).is_ok();

    if file_in_head {
        // File exists in HEAD: reset to HEAD state
        repo.reset_default(Some(head_tree.as_object()), [rel_path.to_string_lossy().as_ref()])
            .map_err(|e| GitError::IndexError(e.to_string()))?;
    } else {
        // File is new (not in HEAD): remove from index entirely
        let mut index = repo
            .index()
            .map_err(|e| GitError::IndexError(e.to_string()))?;
        index
            .remove_path(rel_path)
            .map_err(|e| GitError::IndexError(e.to_string()))?;
        index
            .write()
            .map_err(|e| GitError::IndexError(e.to_string()))?;
    }

    Ok(())
}

/// Synchronous inner implementation of commit for testing.
/// Creates a commit from staged changes.
pub fn commit_impl(repo_path: &str, message: &str) -> Result<String, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    // Get signature from config or create default
    let sig = repo
        .signature()
        .or_else(|_| Signature::now("Efxmux User", "user@efxmux.local"))
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    // Prepare tree from index
    let mut index = repo
        .index()
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    // Check if there are staged changes
    let tree_id = index
        .write_tree()
        .map_err(|e| GitError::CommitError(e.to_string()))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    // Get parent commit (HEAD)
    let parent = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    // Check if there are actual changes to commit
    let parent_tree = parent
        .tree()
        .map_err(|e| GitError::CommitError(e.to_string()))?;
    let diff = repo
        .diff_tree_to_index(Some(&parent_tree), Some(&index), None)
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    if diff.deltas().count() == 0 {
        return Err(GitError::CommitError("Nothing to commit".to_string()));
    }

    // Create commit
    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
        .map_err(|e| GitError::CommitError(e.to_string()))?;

    Ok(commit_id.to_string())
}

/// Synchronous inner implementation of push for testing.
/// Pushes to remote, discovering auth method from remote URL (D-09).
pub fn push_impl(
    repo_path: &str,
    remote: Option<&str>,
    branch: Option<&str>,
) -> Result<(), GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;
    let remote_name = remote.unwrap_or("origin");

    // Get current branch name if not specified
    let branch_name = branch
        .map(|s| s.to_string())
        .or_else(|| {
            repo.head()
                .ok()
                .and_then(|h| h.shorthand().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "main".to_string());

    let mut remote_obj = repo
        .find_remote(remote_name)
        .map_err(|e| GitError::PushRejected(e.to_string()))?;

    // Discover auth method from remote URL (D-09)
    let url = remote_obj.url().unwrap_or("");
    let mut callbacks = RemoteCallbacks::new();

    if url.starts_with("ssh://") || url.starts_with("git@") {
        // SSH authentication
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            let user = username_from_url.unwrap_or("git");
            let home = env::var("HOME").unwrap_or_else(|_| "/".to_string());

            // Try ssh-agent first, then fall back to file-based key
            Cred::ssh_key_from_agent(user).or_else(|_| {
                Cred::ssh_key(
                    user,
                    None,
                    Path::new(&format!("{}/.ssh/id_rsa", home)),
                    None,
                )
            })
        });
    } else if url.starts_with("https://") {
        // HTTPS: try credential helper
        callbacks.credentials(|url, username, _allowed_types| {
            let config = repo.config().ok();
            if let Some(cfg) = config {
                if let Ok(cred) = Cred::credential_helper(&cfg, url, username) {
                    return Ok(cred);
                }
            }
            Err(git2::Error::from_str("No credentials found"))
        });
    }

    callbacks.push_update_reference(|refname, status| {
        if let Some(msg) = status {
            Err(git2::Error::from_str(&format!(
                "Push rejected: {} - {}",
                refname, msg
            )))
        } else {
            Ok(())
        }
    });

    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    let refspec = format!(
        "refs/heads/{}:refs/heads/{}",
        branch_name, branch_name
    );
    remote_obj
        .push(&[&refspec], Some(&mut push_opts))
        .map_err(|e| {
            let msg = e.message();
            if msg.contains("authentication") || msg.contains("credential") {
                GitError::AuthFailed
            } else {
                GitError::PushRejected(msg.to_string())
            }
        })?;

    Ok(())
}

/// Stage a file in the git index.
#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || stage_file_impl(&repo_path, &file_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Unstage a file from the git index.
#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || unstage_file_impl(&repo_path, &file_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Create a commit from staged changes.
#[tauri::command]
pub async fn commit(repo_path: String, message: String) -> Result<String, String> {
    spawn_blocking(move || commit_impl(&repo_path, &message))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Push to remote repository.
#[tauri::command]
pub async fn push(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<(), String> {
    spawn_blocking(move || push_impl(&repo_path, remote.as_deref(), branch.as_deref()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Synchronous inner implementation of get_unpushed_count for testing.
/// Returns the number of commits ahead of the upstream tracking branch.
pub fn get_unpushed_count_impl(repo_path: &str) -> Result<usize, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    let head = repo.head().map_err(|e| GitError::IndexError(e.to_string()))?;
    let local_oid = head.target().ok_or_else(|| GitError::IndexError("No HEAD target".to_string()))?;

    // Get current branch name
    let branch_name = head.shorthand().unwrap_or("main");
    let branch = match repo.find_branch(branch_name, git2::BranchType::Local) {
        Ok(b) => b,
        Err(_) => return Ok(0), // No local branch found, no upstream to compare
    };

    let upstream = match branch.upstream() {
        Ok(upstream) => upstream,
        Err(_) => return Ok(0), // No upstream configured, cannot determine unpushed
    };

    let upstream_oid = match upstream.get().target() {
        Some(oid) => oid,
        None => return Ok(0), // No upstream target
    };

    let (ahead, _behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .map_err(|e| GitError::IndexError(e.to_string()))?;

    Ok(ahead)
}

/// Get the number of commits ahead of upstream (unpushed commits).
#[tauri::command]
pub async fn get_unpushed_count(repo_path: String) -> Result<usize, String> {
    spawn_blocking(move || get_unpushed_count_impl(&repo_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
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
        run_git(dir.path(), &["init"]);
        run_git(dir.path(), &["config", "user.email", "test@test.com"]);
        run_git(dir.path(), &["config", "user.name", "Test"]);
        // Create initial commit so HEAD exists
        let placeholder = dir.path().join(".gitkeep");
        std::fs::write(&placeholder, "").unwrap();
        run_git(dir.path(), &["add", ".gitkeep"]);
        run_git(dir.path(), &["commit", "-m", "initial"]);
        (dir, path)
    }

    #[test]
    fn stage_file_adds_to_index() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "content").unwrap();

        // Stage the file
        let result = stage_file_impl(&path, "test.txt");
        assert!(result.is_ok(), "stage_file_impl failed: {:?}", result);

        // Verify via git status that the file is staged
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains("A  test.txt"),
            "File should be staged: {}",
            status
        );
    }

    #[test]
    fn unstage_file_removes_from_index() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "content").unwrap();
        run_git(dir.path(), &["add", "test.txt"]);

        // Unstage the file
        let result = unstage_file_impl(&path, "test.txt");
        assert!(result.is_ok(), "unstage_file_impl failed: {:?}", result);

        // Verify via git status that the file is not staged
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains("?? test.txt"),
            "File should be untracked after unstaging: {}",
            status
        );
    }

    #[test]
    fn unstage_new_file_removes_from_index() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("newfile.txt");
        std::fs::write(&file_path, "new content").unwrap();
        run_git(dir.path(), &["add", "newfile.txt"]);

        // Verify file is staged (should show 'A  newfile.txt')
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains("A  newfile.txt"),
            "File should be staged before unstage: {}",
            status
        );

        // Unstage the NEW file (not in HEAD)
        let result = unstage_file_impl(&path, "newfile.txt");
        assert!(result.is_ok(), "unstage_file_impl failed for new file: {:?}", result);

        // Verify file is now untracked (should show '?? newfile.txt')
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains("?? newfile.txt"),
            "New file should be untracked after unstaging: {}",
            status
        );
    }

    #[test]
    fn commit_creates_commit_with_message() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "content").unwrap();
        run_git(dir.path(), &["add", "test.txt"]);

        // Commit
        let result = commit_impl(&path, "Test commit message");
        assert!(result.is_ok(), "commit_impl failed: {:?}", result);

        // Verify via git log
        let output = std::process::Command::new("git")
            .args(["log", "--oneline", "-1"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let log = String::from_utf8_lossy(&output.stdout);
        assert!(
            log.contains("Test commit message"),
            "Commit message should appear in log: {}",
            log
        );
    }

    #[test]
    fn stage_file_returns_error_for_non_repo_path() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        // No git init - not a repo

        let result = stage_file_impl(path, "test.txt");
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::NotARepo => {}
            e => panic!("Expected NotARepo, got {:?}", e),
        }
    }

    #[test]
    fn commit_returns_error_when_nothing_staged() {
        let (_dir, path) = setup_git_repo();

        // No staged changes
        let result = commit_impl(&path, "Empty commit");
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::CommitError(msg) => {
                assert!(
                    msg.contains("Nothing to commit"),
                    "Expected 'Nothing to commit', got: {}",
                    msg
                );
            }
            e => panic!("Expected CommitError, got {:?}", e),
        }
    }

    #[test]
    fn stage_file_returns_error_for_nonexistent_file() {
        let (_dir, path) = setup_git_repo();

        let result = stage_file_impl(&path, "nonexistent.txt");
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::FileNotFound => {}
            e => panic!("Expected FileNotFound, got {:?}", e),
        }
    }

    #[test]
    fn get_unpushed_count_returns_zero_for_no_upstream() {
        let (_dir, path) = setup_git_repo();
        // No remote configured, should return 0
        let result = get_unpushed_count_impl(&path);
        assert!(result.is_ok(), "get_unpushed_count_impl failed: {:?}", result);
        assert_eq!(result.unwrap(), 0);
    }
}
