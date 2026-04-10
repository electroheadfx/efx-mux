// file-tree.tsx -- Keyboard-navigable file tree with inline SVG icons (D-07, D-08, D-12, D-13, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Rewritten with inline SVG icons and tokens.ts colors (Phase 10)

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

// File Tree appearance settings (shared with preferences panel)
export const fileTreeFontSize = signal(13);
export const fileTreeLineHeight = signal(5);
export const fileTreeBgColor = signal('');

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

// ── Inline SVG Icons (replacing lucide-preact per reference D-08) ────────────

function FolderIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function FileCodeIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.textDim} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={colors.textDim} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

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

  const bgColor = fileTreeBgColor.value || colors.bgDeep;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: bgColor, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ gap: 8, padding: '6px 12px', backgroundColor: colors.bgBase, borderBottom: `1px solid ${colors.bgBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>File Tree</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim }}>{currentPath.value || '~/Dev/efx-mux'}</span>
      </div>
      {/* File list */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: '4px 0', outline: 'none' }}
        tabIndex={0}
        onKeyDown={handleKeydown}
      >
        {!loaded.value ? (
          <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Loading...</div>
        ) : entries.value.length === 0 ? (
          <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Empty directory</div>
        ) : (
          entries.value.map((entry, i) => {
            const isSelected = selectedIndex.value === i;
            return (
              <div
                key={entry.path}
                style={{ padding: `${fileTreeLineHeight.value}px 12px`, gap: 8, display: 'flex', alignItems: 'center', cursor: 'pointer', backgroundColor: isSelected ? colors.bgElevated : 'transparent' }}
                onClick={() => { selectedIndex.value = i; openEntry(entry); }}
                onMouseEnter={() => { selectedIndex.value = i; }}
              >
                {entry.is_dir
                  ? <FolderIcon />
                  : (entry.name.match(/\.(ts|tsx|js|jsx|rs|css)$/)
                      ? <FileCodeIcon />
                      : <FileTextIcon />
                    )
                }
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: fonts.sans, fontSize: fileTreeFontSize.value, color: isSelected ? colors.textPrimary : colors.textMuted }}>
                  {entry.name}
                </span>
                {!entry.is_dir && entry.size != null && (
                  <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, marginLeft: 'auto', flexShrink: 0 }}>
                    {formatSize(entry.size)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
