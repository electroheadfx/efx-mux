//! Git operations for stage/unstage/commit/push (Phase 15)
//!
//! Provides git2-based commands for staging, unstaging, committing, and pushing
//! changes. Consumed by the frontend via Tauri invoke.
//!
//! Push uses system `git push` (not git2) to leverage macOS Keychain, ssh-agent,
//! and credential helpers that git2 cannot access reliably.

use git2::{Repository, Signature};
use std::path::Path;
use std::process::Command;
use tauri::async_runtime::spawn_blocking;

/// Typed error enum for git operations (D-08).
#[derive(Debug, Clone, serde::Serialize)]
pub enum GitError {
    NotARepo,
    FileNotFound,
    IndexError(String),
    CommitError(String),
    PushRejected(String),
    RevertError(String),
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
            GitError::RevertError(s) => write!(f, "Revert error: {}", s),
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

    // Get HEAD commit to check if file exists there
    let head_commit = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    match head_commit {
        Some(commit) => {
            let tree = commit.tree().map_err(|e| GitError::IndexError(e.to_string()))?;
            let file_in_head = tree.get_path(rel_path).is_ok();

            if file_in_head {
                // File exists in HEAD: use reset_default to restore index entry from HEAD
                // Pass the commit (not tree) - reset_default expects a committish
                repo.reset_default(Some(commit.as_object()), [rel_path.to_string_lossy().as_ref()])
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
        }
        None => {
            // No HEAD commit (empty repo) - just remove from index
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

/// Synchronous inner implementation of push using system git binary.
///
/// Uses `git push` subprocess instead of git2 to leverage the system's SSH agent,
/// macOS Keychain integration, and credential helpers. git2's libgit2 SSH auth
/// has a known issue where the credentials callback can loop infinitely when
/// the SSH agent has no keys and the key file requires a passphrase.
pub fn push_impl(
    repo_path: &str,
    remote: Option<&str>,
    branch: Option<&str>,
) -> Result<(), GitError> {
    // Verify it's a valid git repo first
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

    // Drop the repo handle before shelling out to avoid lock contention
    drop(repo);

    // Shell out to system git for push -- this uses the system's SSH agent,
    // macOS Keychain, and any configured credential helpers correctly.
    let output = Command::new("git")
        .args(["push", remote_name, &branch_name])
        .current_dir(repo_path)
        .env("GIT_TERMINAL_PROMPT", "0") // Prevent interactive prompts in background
        .output()
        .map_err(|e| GitError::PushRejected(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stderr_lower = stderr.to_lowercase();

        // Check for missing/invalid remote first -- "does not appear to be a git
        // repository" comes before "could not read from remote" in git's output
        // when the remote name itself is invalid or not configured.
        if stderr_lower.contains("does not appear to be a git repository")
            || stderr_lower.contains("no such remote")
        {
            return Err(GitError::PushRejected(stderr));
        }

        // Auth failures: permission denied, actual authentication errors
        if stderr_lower.contains("authentication")
            || stderr_lower.contains("permission denied")
            || stderr_lower.contains("could not read from remote")
        {
            return Err(GitError::AuthFailed);
        }

        // Push rejected by remote (non-fast-forward, hooks, etc.)
        if stderr_lower.contains("rejected")
            || stderr_lower.contains("non-fast-forward")
            || stderr_lower.contains("failed to push")
        {
            return Err(GitError::PushRejected(stderr));
        }

        // For upstream tracking issues, provide a helpful message
        if stderr_lower.contains("no upstream branch")
            || stderr_lower.contains("has no upstream")
        {
            return Err(GitError::PushRejected(format!(
                "No upstream branch. Run: git push -u {} {}",
                remote_name, branch_name
            )));
        }

        return Err(GitError::PushRejected(stderr));
    }

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

/// Push to remote repository using system git binary.
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

    // Try upstream of current branch first, then fall back to origin/main or origin/master
    let upstream_oid = match branch.upstream() {
        Ok(upstream) => upstream.get().target(),
        Err(_) => {
            // No upstream configured -- try origin/main or origin/master as fallback
            repo.find_reference("refs/remotes/origin/main")
                .or_else(|_| repo.find_reference("refs/remotes/origin/master"))
                .ok()
                .and_then(|r| r.target())
        }
    };

    let upstream_oid = match upstream_oid {
        Some(oid) => oid,
        None => return Ok(0), // No remote reference at all
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

/// A single commit entry for the git log.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GitLogCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub refs: Vec<String>,
}

/// Synchronous inner implementation of get_git_log for testing.
/// Walks the commit history from HEAD up to `limit` entries and decorates
/// each commit with any matching branch/tag ref names.
pub fn get_git_log_impl(repo_path: &str, limit: usize) -> Result<Vec<GitLogCommit>, GitError> {
    let repo = Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    // Start revwalk from HEAD
    let mut revwalk = repo.revwalk().map_err(|e| GitError::IndexError(e.to_string()))?;
    revwalk.push_head().map_err(|e| GitError::IndexError(e.to_string()))?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| GitError::IndexError(e.to_string()))?;

    // Collect commits
    let mut commits: Vec<GitLogCommit> = Vec::with_capacity(limit);
    for oid_result in revwalk.take(limit) {
        let oid = oid_result.map_err(|e| GitError::IndexError(e.to_string()))?;
        let c = repo.find_commit(oid).map_err(|e| GitError::IndexError(e.to_string()))?;

        let hash = oid.to_string();
        let short_hash = hash[..7.min(hash.len())].to_string();
        let message = c.summary().unwrap_or("").to_string();
        let author = c.author().name().unwrap_or("Unknown").to_string();
        let timestamp = c.time().seconds();

        commits.push(GitLogCommit {
            hash,
            short_hash,
            message,
            author,
            timestamp,
            refs: Vec::new(),
        });
    }

    // Build oid -> ref names map from all references
    if let Ok(refs) = repo.references() {
        for reference in refs.flatten() {
            let ref_name = match reference.shorthand() {
                Some(name) => name.to_string(),
                None => continue,
            };
            // Resolve to the commit this ref points to (peel through tags)
            if let Ok(commit) = reference.peel_to_commit() {
                let ref_oid = commit.id().to_string();
                for entry in commits.iter_mut() {
                    if entry.hash == ref_oid {
                        entry.refs.push(ref_name.clone());
                    }
                }
            }
        }
    }

    Ok(commits)
}

/// Get recent commit log entries.
#[tauri::command]
pub async fn get_git_log(repo_path: String, limit: Option<usize>) -> Result<Vec<GitLogCommit>, String> {
    let max = limit.unwrap_or(50);
    spawn_blocking(move || get_git_log_impl(&repo_path, max))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Uncommit: reset HEAD to HEAD^ (soft reset, keeps changes staged).
pub fn uncommit_impl(repo_path: &str) -> Result<(), GitError> {
    Repository::open(repo_path).map_err(|_| GitError::NotARepo)?;

    let output = std::process::Command::new("git")
        .args(["reset", "--soft", "HEAD^"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| GitError::IndexError(format!("Failed to run git reset: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(GitError::IndexError(format!("git reset HEAD^ failed: {}", stderr)));
    }

    Ok(())
}

/// Uncommit the last commit (soft reset HEAD^).
#[tauri::command]
pub async fn uncommit(repo_path: String) -> Result<(), String> {
    spawn_blocking(move || uncommit_impl(&repo_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Synchronous inner implementation of revert_file for testing.
/// Discards working tree changes for a tracked modified file using system git.
/// For untracked files (`?` status), git checkout is a no-op which is correct --
/// untracked files should not be silently deleted.
pub fn revert_file_impl(repo_path: &str, file_path: &str) -> Result<(), GitError> {
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

    let rel_str = rel_path.to_string_lossy();

    // Drop the repo handle before shelling out to avoid lock contention
    drop(repo);

    // Shell out to system git for checkout -- same rationale as push_impl:
    // git2's checkout_index has edge cases with submodules and permissions
    // that system git handles correctly.
    let output = Command::new("git")
        .args(["checkout", "--", &rel_str])
        .current_dir(repo_path)
        .output()
        .map_err(|e| GitError::RevertError(format!("Failed to run git: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(GitError::RevertError(stderr));
    }

    Ok(())
}

/// Revert (discard) working tree changes for a single file.
#[tauri::command]
pub async fn revert_file(repo_path: String, file_path: String) -> Result<(), String> {
    spawn_blocking(move || revert_file_impl(&repo_path, &file_path))
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
    fn unstage_modified_file_resets_to_head() {
        // Test unstaging a file that EXISTS in HEAD (the reset_default path)
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("existing.txt");

        // Create and commit the file first
        std::fs::write(&file_path, "original content").unwrap();
        run_git(dir.path(), &["add", "existing.txt"]);
        run_git(dir.path(), &["commit", "-m", "add existing.txt"]);

        // Modify and stage the file
        std::fs::write(&file_path, "modified content").unwrap();
        run_git(dir.path(), &["add", "existing.txt"]);

        // Verify file is staged as modified
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains("M  existing.txt"),
            "File should be staged as modified: {}",
            status
        );

        // Unstage the modified file (should use reset_default path)
        let result = unstage_file_impl(&path, "existing.txt");
        assert!(result.is_ok(), "unstage_file_impl failed for modified file: {:?}", result);

        // Verify file is now unstaged but still modified (' M existing.txt')
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(
            status.contains(" M existing.txt"),
            "File should be unstaged but modified: {}",
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

    #[test]
    fn push_impl_returns_error_for_non_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        let result = push_impl(path, None, None);
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::NotARepo => {}
            e => panic!("Expected NotARepo, got {:?}", e),
        }
    }

    #[test]
    fn push_impl_returns_error_for_no_remote() {
        let (_dir, path) = setup_git_repo();
        // No remote configured -- git says "does not appear to be a git repository"
        let result = push_impl(&path, None, None);
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::PushRejected(msg) => {
                assert!(
                    msg.contains("does not appear to be a git repository"),
                    "Expected remote-not-found message, got: {}",
                    msg
                );
            }
            e => panic!("Expected PushRejected for missing remote, got {:?}", e),
        }
    }

    #[test]
    fn revert_file_discards_changes() {
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("tracked.txt");

        // Create and commit a file with known content
        std::fs::write(&file_path, "original content").unwrap();
        run_git(dir.path(), &["add", "tracked.txt"]);
        run_git(dir.path(), &["commit", "-m", "add tracked.txt"]);

        // Modify the file
        std::fs::write(&file_path, "modified content").unwrap();
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "modified content", "File should be modified before revert");

        // Revert the file
        let result = revert_file_impl(&path, "tracked.txt");
        assert!(result.is_ok(), "revert_file_impl failed: {:?}", result);

        // Verify content matches original
        let reverted = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(
            reverted, "original content",
            "File should be reverted to original content"
        );
    }

    #[test]
    fn revert_file_deletes_untracked() {
        // UAT Test 18 fix: per-file revert on an untracked file MUST delete it
        // (git checkout is meaningless for untracked content; current impl errors).
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("untracked.txt");
        std::fs::write(&file_path, "untracked content").unwrap();
        assert!(file_path.exists(), "Untracked file must exist before revert");

        let result = revert_file_impl(&path, "untracked.txt");
        assert!(result.is_ok(), "revert_file on untracked file must succeed: {:?}", result);
        assert!(
            !file_path.exists(),
            "Untracked file MUST be deleted from disk after revert"
        );
    }

    #[test]
    fn revert_file_no_op_on_clean() {
        // UAT Test 18 fix: revert on a clean (CURRENT) tracked file must be a silent no-op.
        let (dir, path) = setup_git_repo();
        let file_path = dir.path().join("tracked.txt");

        // Create and commit a file
        std::fs::write(&file_path, "committed content").unwrap();
        run_git(dir.path(), &["add", "tracked.txt"]);
        run_git(dir.path(), &["commit", "-m", "add tracked.txt"]);

        // Revert without modifying — should be a no-op
        let result = revert_file_impl(&path, "tracked.txt");
        assert!(result.is_ok(), "revert_file on clean tracked file must succeed: {:?}", result);
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "committed content", "Clean file content must be unchanged");
    }
}
