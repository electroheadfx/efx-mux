// file-tree.tsx -- Keyboard-navigable file tree with Lucide icons (D-07, D-08, D-12, D-13, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Upgraded with Lucide icons and file size metadata (Phase 9)

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { Folder, FileCode, FileText } from 'lucide-preact';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

// Local signals for component state
interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
}

const entries = signal<FileEntry[]>([]);
const selectedIndex = signal(0);
const currentPath = signal('');
const loaded = signal(false);

/**
 * Format file size into a human-readable string.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

/**
 * Get the active project from signals.
 */
function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}

/**
 * Load directory contents from Rust backend.
 */
async function loadDir(path: string): Promise<void> {
  try {
    const project = getActiveProject();
    const result = await invoke<FileEntry[]>('list_directory', { path, projectRoot: project?.path || null });
    entries.value = result;
    currentPath.value = path;
    selectedIndex.value = 0;
    loaded.value = true;
  } catch (err) {
    console.error('[efxmux] list_directory failed:', err);
    entries.value = [];
    loaded.value = true;
  }
}

/**
 * Open a file or navigate into a directory.
 */
function openEntry(entry: FileEntry): void {
  if (entry.is_dir) {
    loadDir(entry.path);
  } else {
    // Dispatch file-opened event for main.js (D-08, PANEL-06)
    document.dispatchEvent(new CustomEvent('file-opened', {
      detail: { path: entry.path, name: entry.name }
    }));
  }
}

/**
 * FileTree component.
 * Renders a navigable file tree for the active project directory.
 * Keyboard: ArrowUp/Down to select, Enter to open, Backspace to go up.
 */
export function FileTree() {
  useEffect(() => {
    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project && project.path) loadDir(project.path);
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load
    const project = getActiveProject();
    if (project && project.path) loadDir(project.path);

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  /**
   * Keyboard navigation handler (PANEL-05).
   */
  function handleKeydown(e: KeyboardEvent): void {
    if (!loaded.value || entries.value.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, entries.value.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (entries.value[selectedIndex.value]) {
          openEntry(entries.value[selectedIndex.value]);
        }
        break;
      case 'Backspace': {
        e.preventDefault();
        const project = getActiveProject();
        const rootPath = project?.path;
        const parent = currentPath.value.split('/').slice(0, -1).join('/');
        // Only navigate up if parent is still within (or equal to) the project root
        if (parent && rootPath && parent.startsWith(rootPath)) {
          loadDir(parent);
        } else if (parent && !rootPath) {
          // No project context, allow navigation (fallback)
          loadDir(parent);
        }
        break;
      }
    }
  }

  return (
    <div class="h-full flex flex-col bg-bg-terminal overflow-hidden">
      {/* Header bar (D-07) */}
      <div class="bg-bg px-4 py-2.5 gap-2 border-b border-border flex items-center shrink-0">
        <span class="text-xs font-medium text-text-bright font-sans">File Tree</span>
        <span class="flex-1"></span>
        <span class="text-[10px] font-mono text-[#484F58]">~/Dev/efx-mux</span>
      </div>
      {/* File list */}
      <div
        class="flex-1 overflow-auto py-1 outline-none"
        tabIndex={0}
        onKeyDown={handleKeydown}
      >
        {!loaded.value ? (
          <div class="p-4 text-text text-[13px]">Loading...</div>
        ) : entries.value.length === 0 ? (
          <div class="p-4 text-text text-[13px]">Empty directory</div>
        ) : (
          entries.value.map((entry, i) => (
            <div
              class={`px-4 py-[5px] gap-2 flex items-center cursor-pointer ${
                selectedIndex.value === i
                  ? 'text-text-bright bg-bg-raised'
                  : 'text-text hover:bg-bg-raised/50'
              }`}
              onClick={() => { selectedIndex.value = i; openEntry(entry); }}
              onMouseEnter={() => { selectedIndex.value = i; }}
            >
              {entry.is_dir
                ? <Folder size={14} class="text-accent shrink-0" />
                : (entry.name.match(/\.(ts|tsx|js|jsx|rs|css)$/)
                    ? <FileCode size={14} class="text-[#484F58] shrink-0" />
                    : <FileText size={14} class="text-[#484F58] shrink-0" />
                  )
              }
              <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-sans">
                {entry.name}
              </span>
              {!entry.is_dir && entry.size != null && (
                <span class="text-[10px] font-mono text-[#484F58] ml-auto shrink-0">
                  {formatSize(entry.size)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
