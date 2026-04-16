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

/** Result of detect_editors — which external-editor CLIs are installed. */
export interface DetectedEditors {
  zed: boolean;
  code: boolean;
  subl: boolean;
  cursor: boolean;
  idea: boolean;
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
    await emit('git-status-changed');
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
    await emit('git-status-changed');
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
    await emit('git-status-changed');
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

/**
 * Create a directory at the given path (Phase 18, D-25).
 * Rejects paths that already exist.
 * @param path Absolute path to the new directory
 */
export async function createFolder(path: string): Promise<void> {
  try {
    await invoke('create_folder', { path });
    await emit('git-status-changed');
  } catch (e) {
    throw new FileError('CreateFolderError', String(e));
  }
}

/**
 * Copy a file or directory (recursive for directories). Aborts on conflict (D-20).
 * @param from Source path
 * @param to Destination path
 */
export async function copyPath(from: string, to: string): Promise<void> {
  try {
    await invoke('copy_path', { from, to });
    await emit('git-status-changed');
  } catch (e) {
    throw new FileError('CopyError', String(e));
  }
}

/**
 * Launch an external GUI editor to open a file or folder (Phase 18, D-08).
 * @param app Application name as LaunchServices sees it (e.g. "Zed", "Visual Studio Code")
 * @param path Absolute path to the file or folder
 */
export async function launchExternalEditor(app: string, path: string): Promise<void> {
  try {
    await invoke('launch_external_editor', { app, path });
  } catch (e) {
    throw new FileError('LaunchError', String(e));
  }
}

/**
 * Open a path with the macOS default application (Phase 18, D-06 fallback).
 */
export async function openDefault(path: string): Promise<void> {
  try {
    await invoke('open_default', { path });
  } catch (e) {
    throw new FileError('OpenDefaultError', String(e));
  }
}

/**
 * Reveal a path in Finder (Phase 18, D-06 fallback).
 */
export async function revealInFinder(path: string): Promise<void> {
  try {
    await invoke('reveal_in_finder', { path });
  } catch (e) {
    throw new FileError('RevealError', String(e));
  }
}

/**
 * Probe which external-editor CLIs are installed on the host (Phase 18, D-06).
 */
export async function detectEditors(): Promise<DetectedEditors> {
  try {
    return await invoke<DetectedEditors>('detect_editors');
  } catch (e) {
    throw new FileError('DetectError', String(e));
  }
}
