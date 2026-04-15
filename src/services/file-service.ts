// file-service.ts -- File IPC wrappers with typed errors (Phase 15, D-10, D-12)
//
// Provides frontend wrappers for file_ops.rs Tauri commands.
// Each function throws FileError on failure for try/catch handling.

import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

/**
 * Typed error class for file operations.
 * Code indicates the error type, details provides context.
 */
export class FileError extends Error {
  constructor(
    public code: string,
    public details?: string
  ) {
    super(`${code}${details ? `: ${details}` : ''}`);
    this.name = 'FileError';
  }
}

/**
 * Write content to a file atomically.
 * @param path Absolute path to the file
 * @param content Content to write
 */
export async function writeFile(path: string, content: string): Promise<void> {
  try {
    await invoke('write_file_content', { path, content });
    // Trigger git status refresh for sidebar and git-changes-tab.
    // The Rust file watcher only watches .git/index, not working tree changes.
    // Emit the same event name so existing listeners pick it up.
    await emit('git-status-changed');
  } catch (e) {
    throw new FileError('WriteError', String(e));
  }
}

/**
 * Delete a file or directory.
 * @param path Absolute path to the file or directory
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    await invoke('delete_file', { path });
  } catch (e) {
    throw new FileError('DeleteError', String(e));
  }
}

/**
 * Rename or move a file.
 * @param from Source path
 * @param to Destination path
 */
export async function renameFile(from: string, to: string): Promise<void> {
  try {
    await invoke('rename_file', { from, to });
  } catch (e) {
    throw new FileError('RenameError', String(e));
  }
}

/**
 * Create an empty file, creating parent directories if needed.
 * @param path Absolute path to the file
 */
export async function createFile(path: string): Promise<void> {
  try {
    await invoke('create_file', { path });
  } catch (e) {
    throw new FileError('CreateError', String(e));
  }
}

/**
 * Read content from a file.
 * @param path Absolute path to the file
 * @returns File content as string
 */
export async function readFile(path: string): Promise<string> {
  try {
    return await invoke<string>('read_file_content', { path });
  } catch (e) {
    throw new FileError('ReadError', String(e));
  }
}
