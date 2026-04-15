// git-service.ts -- Git IPC wrappers with typed errors (Phase 15, D-10, D-11)
//
// Provides frontend wrappers for git_ops.rs Tauri commands.
// Each function throws GitError on failure for try/catch handling.

import { invoke } from '@tauri-apps/api/core';

/**
 * Typed error class for git operations.
 * Code indicates the error type, details provides context.
 */
export class GitError extends Error {
  constructor(
    public code: string,
    public details?: string
  ) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'GitError';
  }
}

/**
 * Stage a file in the git index.
 * @param repoPath Path to the git repository root
 * @param filePath Path to the file to stage (relative to repo root)
 */
export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('stage_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('StageError', String(e));
  }
}

/**
 * Unstage a file from the git index.
 * @param repoPath Path to the git repository root
 * @param filePath Path to the file to unstage (relative to repo root)
 */
export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('unstage_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('UnstageError', String(e));
  }
}

/**
 * Create a commit from staged changes.
 * @param repoPath Path to the git repository root
 * @param message Commit message
 * @returns Commit ID (OID) as a string
 */
export async function commit(repoPath: string, message: string): Promise<string> {
  try {
    return await invoke<string>('commit', { repoPath, message });
  } catch (e) {
    throw new GitError('CommitError', String(e));
  }
}

/**
 * Push to a remote repository.
 * @param repoPath Path to the git repository root
 * @param remote Remote name (defaults to 'origin')
 * @param branch Branch name (defaults to current branch)
 */
export async function push(repoPath: string, remote?: string, branch?: string): Promise<void> {
  try {
    await invoke('push', { repoPath, remote, branch });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('AuthFailed') || msg.includes('Authentication failed')) {
      throw new GitError('AuthFailed', msg);
    } else if (msg.includes('PushRejected') || msg.includes('Push rejected')) {
      throw new GitError('PushRejected', msg);
    }
    throw new GitError('PushError', msg);
  }
}

/**
 * Revert (discard) working tree changes for a single file.
 * @param repoPath Path to the git repository root
 * @param filePath Path to the file to revert (relative to repo root)
 */
export async function revertFile(repoPath: string, filePath: string): Promise<void> {
  try {
    await invoke('revert_file', { repoPath, filePath });
  } catch (e) {
    throw new GitError('RevertError', String(e));
  }
}

/**
 * Per-file diff stats (additions/deletions).
 */
export interface FileDiffStats {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Get per-file diff stats (additions/deletions) for all changed files.
 * @param repoPath Path to the git repository root
 * @returns Array of per-file stats, empty array on failure
 */
export async function getFileDiffStats(repoPath: string): Promise<FileDiffStats[]> {
  try {
    return await invoke<FileDiffStats[]>('get_file_diff_stats', { repoPath });
  } catch (e) {
    console.warn('[git-service] getFileDiffStats failed:', e);
    return [];
  }
}

/**
 * A single commit entry from the git log (maps to GitLogCommit in Rust).
 */
export interface GitCommitEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;  // Unix epoch seconds
  refs: string[];
}

/**
 * Get recent commit log entries from the repository.
 * @param repoPath Path to the git repository root
 * @param limit Max number of commits to return (default 50)
 * @returns Array of commit entries, empty array on failure
 */
export async function getGitLog(repoPath: string, limit?: number): Promise<GitCommitEntry[]> {
  try {
    return await invoke<GitCommitEntry[]>('get_git_log', { repoPath, limit: limit ?? 50 });
  } catch (e) {
    console.warn('[git-service] getGitLog failed:', e);
    return [];
  }
}

/**
 * Get the number of commits ahead of upstream (unpushed commits).
 * @param repoPath Path to the git repository root
 * @returns Number of unpushed commits (0 if no upstream configured or on error)
 */
export async function getUnpushedCount(repoPath: string): Promise<number> {
  try {
    return await invoke<number>('get_unpushed_count', { repoPath });
  } catch (e) {
    console.warn('[git-service] getUnpushedCount failed:', e);
    return 0; // Fail safe: hide push button rather than crash
  }
}
