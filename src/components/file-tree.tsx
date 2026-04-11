// file-tree.tsx -- Keyboard-navigable file tree with inline SVG icons (D-07, D-08, D-12, D-13, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Rewritten with inline SVG icons and tokens.ts colors (Phase 10)
// Added tree mode with collapsible folders and parent nav button (quick-260411-e3e)

import { useEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

// File Tree appearance settings (shared with preferences panel)
export const fileTreeFontSize = signal(13);
export const fileTreeLineHeight = signal(2);
export const fileTreeBgColor = signal('');

// View mode signal
const viewMode = signal<'flat' | 'tree'>('tree');

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

// ── Tree mode state ──────────────────────────────────────────────

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null; // null = not loaded, [] = loaded but empty
  expanded: boolean;
  depth: number;
}

const treeNodes = signal<TreeNode[]>([]);

/**
 * Flatten expanded tree nodes into a render list.
 */
function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.expanded && node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

const flattenedTree = computed(() => flattenTree(treeNodes.value));

/**
 * Load children for a tree node (lazy loading).
 */
async function loadTreeChildren(node: TreeNode): Promise<void> {
  try {
    const project = getActiveProject();
    const result = await invoke<FileEntry[]>('list_directory', { path: node.entry.path, projectRoot: project?.path || null });
    node.children = result.map(entry => ({
      entry,
      children: null,
      expanded: false,
      depth: node.depth + 1,
    }));
    // Trigger reactivity by replacing the array
    treeNodes.value = [...treeNodes.value];
  } catch (err) {
    console.error('[efxmux] tree list_directory failed:', err);
    node.children = [];
    treeNodes.value = [...treeNodes.value];
  }
}

/**
 * Toggle expand/collapse of a tree folder node.
 */
async function toggleTreeNode(node: TreeNode): Promise<void> {
  if (!node.entry.is_dir) return;
  if (node.children === null) {
    // First expansion: load children
    node.expanded = true;
    await loadTreeChildren(node);
  } else {
    // Toggle
    node.expanded = !node.expanded;
    treeNodes.value = [...treeNodes.value];
  }
}

/**
 * Initialize tree from project root.
 */
async function initTree(): Promise<void> {
  const project = getActiveProject();
  if (!project?.path) return;
  try {
    const result = await invoke<FileEntry[]>('list_directory', { path: project.path, projectRoot: project.path });
    treeNodes.value = result.map(entry => ({
      entry,
      children: null,
      expanded: false,
      depth: 0,
    }));
    selectedIndex.value = 0;
  } catch (err) {
    console.error('[efxmux] tree init failed:', err);
    treeNodes.value = [];
  }
}

/**
 * Find the parent TreeNode for a given node in the flattened list.
 */
function findParentNode(node: TreeNode, allNodes: TreeNode[]): TreeNode | null {
  // Walk up by searching for a folder at depth-1 that contains this node
  const idx = allNodes.indexOf(node);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (allNodes[i].depth === node.depth - 1 && allNodes[i].entry.is_dir) {
      return allNodes[i];
    }
  }
  return null;
}

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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg class="shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke={colors.textDim} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
      <path d="M3 1.5L7 5L3 8.5" />
    </svg>
  );
}

// ── Mode toggle icons ────────────────────────────────────────────

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? colors.accent : colors.textDim} stroke-width="1.5" stroke-linecap="round">
      <line x1="3" y1="3" x2="12" y2="3" />
      <line x1="3" y1="7" x2="12" y2="7" />
      <line x1="3" y1="11" x2="12" y2="11" />
      <circle cx="1" cy="3" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
      <circle cx="1" cy="7" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
      <circle cx="1" cy="11" r="0.5" fill={active ? colors.accent : colors.textDim} stroke="none" />
    </svg>
  );
}

function TreeIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? colors.accent : colors.textDim} stroke-width="1.5" stroke-linecap="round">
      <line x1="1" y1="2" x2="12" y2="2" />
      <line x1="4" y1="6" x2="12" y2="6" />
      <line x1="4" y1="10" x2="12" y2="10" />
      <line x1="2" y1="4" x2="2" y2="10" />
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
 * Navigate to parent directory (shared between button and keyboard).
 */
function navigateToParent(): void {
  const project = getActiveProject();
  const rootPath = project?.path;
  const parent = currentPath.value.split('/').slice(0, -1).join('/');
  if (parent && rootPath && parent.startsWith(rootPath)) {
    loadDir(parent);
  } else if (parent && !rootPath) {
    loadDir(parent);
  }
}

/**
 * Check if we can navigate to parent (not at project root).
 */
function canNavigateUp(): boolean {
  const project = getActiveProject();
  const rootPath = project?.path;
  if (!rootPath) return !!currentPath.value;
  return currentPath.value !== rootPath && currentPath.value.startsWith(rootPath);
}

/**
 * Open a file or navigate into a directory.
 */
function openEntry(entry: FileEntry): void {
  if (entry.is_dir) {
    loadDir(entry.path);
  } else {
    document.dispatchEvent(new CustomEvent('file-opened', {
      detail: { path: entry.path, name: entry.name }
    }));
  }
}

/**
 * FileTree component.
 * Renders a navigable file tree for the active project directory.
 * Supports flat mode (drill-down) and tree mode (collapsible hierarchy).
 */
export function FileTree() {
  useEffect(() => {
    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project && project.path) {
          loadDir(project.path);
          if (viewMode.value === 'tree') {
            initTree();
          }
        }
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load
    const project = getActiveProject();
    if (project && project.path) {
      loadDir(project.path);
      if (viewMode.value === 'tree') {
        initTree();
      }
    }

    return () => {
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  /**
   * Keyboard navigation handler for flat mode.
   */
  function handleFlatKeydown(e: KeyboardEvent): void {
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
        navigateToParent();
        break;
      }
    }
  }

  /**
   * Keyboard navigation handler for tree mode.
   */
  function handleTreeKeydown(e: KeyboardEvent): void {
    const flat = flattenedTree.value;
    if (flat.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, flat.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
        break;
      case 'Enter': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (!node) break;
        if (node.entry.is_dir) {
          toggleTreeNode(node);
        } else {
          document.dispatchEvent(new CustomEvent('file-opened', {
            detail: { path: node.entry.path, name: node.entry.name }
          }));
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (node?.entry.is_dir && !node.expanded) {
          toggleTreeNode(node);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const node = flat[selectedIndex.value];
        if (!node) break;
        if (node.entry.is_dir && node.expanded) {
          // Collapse expanded folder
          toggleTreeNode(node);
        } else {
          // Move to parent folder
          const parent = findParentNode(node, flat);
          if (parent) {
            const parentIdx = flat.indexOf(parent);
            if (parentIdx >= 0) selectedIndex.value = parentIdx;
          }
        }
        break;
      }
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (viewMode.value === 'flat') {
      handleFlatKeydown(e);
    } else {
      handleTreeKeydown(e);
    }
  }

  function switchToFlat() {
    viewMode.value = 'flat';
    selectedIndex.value = 0;
  }

  function switchToTree() {
    viewMode.value = 'tree';
    selectedIndex.value = 0;
    if (treeNodes.value.length === 0) {
      initTree();
    }
  }

  const bgColor = fileTreeBgColor.value || colors.bgDeep;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: bgColor, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ gap: 6, padding: '6px 12px', backgroundColor: colors.bgBase, borderBottom: `1px solid ${colors.bgBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>File Tree</span>

        {/* Parent nav button -- flat mode only */}
        {viewMode.value === 'flat' && canNavigateUp() && (
          <span
            onClick={navigateToParent}
            style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted, cursor: 'pointer', userSelect: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            title="Navigate to parent directory"
          >..</span>
        )}

        <span style={{ flex: 1 }} />

        {/* Mode toggle */}
        <span
          onClick={switchToFlat}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          title="Flat mode"
        >
          <ListIcon active={viewMode.value === 'flat'} />
        </span>
        <span
          onClick={switchToTree}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          title="Tree mode"
        >
          <TreeIcon active={viewMode.value === 'tree'} />
        </span>

        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
          {viewMode.value === 'flat' ? (currentPath.value || '~/Dev/efx-mux') : ''}
        </span>
      </div>
      {/* File list */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: '4px 0', outline: 'none' }}
        tabIndex={0}
        onKeyDown={handleKeydown}
      >
        {viewMode.value === 'flat' ? (
          /* Flat mode rendering */
          !loaded.value ? (
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
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--file-tree-font, Geist)', fontSize: fileTreeFontSize.value, color: isSelected ? colors.textPrimary : colors.textMuted }}>
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
          )
        ) : (
          /* Tree mode rendering */
          flattenedTree.value.length === 0 ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: fileTreeFontSize.value }}>Loading...</div>
          ) : (
            flattenedTree.value.map((node, i) => {
              const isSelected = selectedIndex.value === i;
              const paddingLeft = 12 + (node.depth * 16);
              return (
                <div
                  key={node.entry.path + '-' + node.depth}
                  style={{
                    padding: `${fileTreeLineHeight.value}px 12px`,
                    paddingLeft,
                    gap: 6,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? colors.bgElevated : 'transparent',
                  }}
                  onClick={() => {
                    selectedIndex.value = i;
                    if (node.entry.is_dir) {
                      toggleTreeNode(node);
                    } else {
                      document.dispatchEvent(new CustomEvent('file-opened', {
                        detail: { path: node.entry.path, name: node.entry.name }
                      }));
                    }
                  }}
                  onMouseEnter={() => { selectedIndex.value = i; }}
                >
                  {/* Chevron for folders, spacer for files */}
                  {node.entry.is_dir ? (
                    <span style={{ display: 'flex', alignItems: 'center', width: 10, flexShrink: 0 }}>
                      <ChevronIcon expanded={node.expanded} />
                    </span>
                  ) : (
                    <span style={{ width: 10, flexShrink: 0 }} />
                  )}
                  {node.entry.is_dir
                    ? <FolderIcon />
                    : (node.entry.name.match(/\.(ts|tsx|js|jsx|rs|css)$/)
                        ? <FileCodeIcon />
                        : <FileTextIcon />
                      )
                  }
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--file-tree-font, Geist)', fontSize: fileTreeFontSize.value, color: isSelected ? colors.textPrimary : colors.textMuted }}>
                    {node.entry.name}
                  </span>
                  {!node.entry.is_dir && node.entry.size != null && (
                    <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textDim, marginLeft: 'auto', flexShrink: 0 }}>
                      {formatSize(node.entry.size)}
                    </span>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
