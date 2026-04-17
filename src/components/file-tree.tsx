// file-tree.tsx -- Keyboard-navigable file tree with inline SVG icons (D-07, D-08, D-12, D-13, PANEL-05, PANEL-06)
// Loads directory contents via list_directory Rust command.
// Dispatches file-opened CustomEvent for main.js to handle.
// Rewritten with inline SVG icons and tokens.ts colors (Phase 10)
// Added tree mode with collapsible folders and parent nav button (quick-260411-e3e)
// Phase 18 Plan 03: context menu wiring, delete flow, inline create row, git-status-changed listener

import { useEffect, useState, useRef } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Trash2, FilePlus, FolderPlus, ExternalLink, FolderOpen, Zap, Code2, MousePointer2, Type, Braces, Plus } from 'lucide-preact';
import { colors, fonts } from '../tokens';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
// quick-260417-f6e: active-tab-aware seeding imports (circular with unified-tab-bar,
// which imports revealFileInTree from this file; both signals are read inside an async
// function body, so by the time seedSelectionFromActiveTab() runs both modules have
// fully evaluated).
import { activeUnifiedTabId, editorTabs } from './unified-tab-bar';
import { ContextMenu, type ContextMenuItem } from './context-menu';
import { showConfirmModal } from './confirm-modal';
import { showToast } from './toast';
import { deleteFile, createFile, createFolder, renameFile, copyPath, detectEditors, launchExternalEditor, openDefault, revealInFinder, type DetectedEditors } from '../services/file-service';

interface ChildCount { files: number; folders: number; total: number; capped: boolean; }

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
// quick-260417-f6e: -1 = no selection. Seeded from the active unified tab on initial
// load / project switch. Terminal or git-changes tab active (or no tab) -> stays -1;
// editor tab active -> revealFileInTree() writes a real index. Row 0 was the prior
// default, which made the tree LIE about having a file open when the user was looking
// at a terminal.
const selectedIndex = signal(-1);
// Phase 18 quick-260416-uig (bug 3): hoveredIndex is decoupled from selectedIndex.
// Click / keyboard / reveal -> selectedIndex (drives white filename + persistent bg).
// Mouse hover -> hoveredIndex (drives bg tint only; filename color is unchanged).
// -1 means "no row currently hovered".
const hoveredIndex = signal(-1);
const currentPath = signal('');
const loaded = signal(false);

// Phase 18 (D-01..D-26): context menu + create-row state
interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}
const activeMenu = signal<MenuState | null>(null);
// Inline create row state: tracks which parent dir has an active create-row and its kind
interface CreateRowState { parentDir: string; kind: 'file' | 'folder'; afterIndex: number; }
const activeCreateRow = signal<CreateRowState | null>(null);
// Phase 18 Plan 04 (D-06): cached detected editors — populated once on first FileTree mount.
export const detectedEditors = signal<DetectedEditors | null>(null);
let editorsDetectInflight = false;
async function ensureEditorsDetected(): Promise<void> {
  if (detectedEditors.value !== null || editorsDetectInflight) return;
  editorsDetectInflight = true;
  try {
    detectedEditors.value = await detectEditors();
  } catch (err) {
    console.warn('[efxmux] detect_editors failed:', err);
    detectedEditors.value = { zed: false, code: false, subl: false, cursor: false, idea: false };
  } finally {
    editorsDetectInflight = false;
  }
}

// Phase 18 Plan 04 (D-22, D-10): header dropdown anchor state — reused for [+] and Open In header buttons.
const headerMenu = signal<MenuState | null>(null);

// Phase 18 Plan 05 (D-11..D-14): intra-tree mouse-drag state + Finder drop-zone visual signal
const DRAG_THRESHOLD_PX = 5;
interface TreeDragState {
  sourcePath: string | null;
  sourceEl: HTMLElement | null;
  ghostEl: HTMLElement | null;
  startX: number;
  startY: number;
  dragging: boolean;
}
const treeDrag: TreeDragState = {
  sourcePath: null, sourceEl: null, ghostEl: null, startX: 0, startY: 0, dragging: false,
};
// Finder drop-zone outline/glow state
const finderDropActive = signal<boolean>(false);


// ── Click timer for single-click vs double-click distinction ─────
let fileClickTimer: ReturnType<typeof setTimeout> | null = null;
let pendingClickEntry: { path: string; name: string } | null = null;

function handleFileClick(path: string, name: string): void {
  // If a timer is already pending for the SAME file, this is a double-click
  if (fileClickTimer && pendingClickEntry?.path === path) {
    clearTimeout(fileClickTimer);
    fileClickTimer = null;
    pendingClickEntry = null;
    document.dispatchEvent(new CustomEvent('file-opened-pinned', {
      detail: { path, name }
    }));
    return;
  }

  // Clear any pending timer for a different file
  if (fileClickTimer) {
    clearTimeout(fileClickTimer);
  }

  pendingClickEntry = { path, name };
  fileClickTimer = setTimeout(() => {
    fileClickTimer = null;
    pendingClickEntry = null;
    document.dispatchEvent(new CustomEvent('file-opened', {
      detail: { path, name }
    }));
  }, 250); // 250ms window for double-click detection
}

// ── Tree mode state ──────────────────────────────────────────────

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null; // null = not loaded, [] = loaded but empty
  expanded: boolean;
  depth: number;
}

const treeNodes = signal<TreeNode[]>([]);
const pendingRevealPath = signal<string>('');

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
 * quick-260417-f6e: Seed selectedIndex based on the currently-active unified tab
 * on initial FileTree load (and project switch). Behavior:
 *   - If activeUnifiedTabId points to an editor tab, reveal + select that file
 *     in the current view (flat or tree). revealFileInTree handles folder expansion
 *     in tree mode and loadDir(parent) in flat mode — and leaves selectedIndex at
 *     the correct row.
 *   - Otherwise (terminal tab, git-changes tab, or no tab), leave selectedIndex
 *     at -1 so no row is highlighted.
 *
 * Called AFTER initTree/loadDir have populated their lists, so the index math
 * inside revealFileInTree can resolve against real data.
 */
async function seedSelectionFromActiveTab(): Promise<void> {
  const activeId = activeUnifiedTabId.value;
  if (!activeId) return;  // no active tab -> leave -1
  const match = editorTabs.value.find(t => t.id === activeId);
  if (!match) return;     // active tab is terminal or git-changes -> leave -1
  // Active tab is an editor tab -> reveal its file in the tree.
  await revealFileInTree(match.filePath);
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
    // quick-260417-f6e: seed from active tab context instead of hard-coding 0.
    selectedIndex.value = -1;

    // Execute any pending reveal that was deferred because tree wasn't loaded
    if (pendingRevealPath.value) {
      const pathToReveal = pendingRevealPath.value;
      pendingRevealPath.value = '';
      await revealFileInTree(pathToReveal);
    } else {
      // No explicit reveal pending -- seed from active tab (quick-260417-f6e).
      await seedSelectionFromActiveTab();
    }
  } catch (err) {
    console.error('[efxmux] tree init failed:', err);
    treeNodes.value = [];
  }
}

/**
 * Refresh the tree from disk while preserving the user's expand/collapse state
 * AND the currently-selected entry. Designed for the git-status-changed listener
 * path, where a file mutation (create/delete/rename/move/copy) requires re-reading
 * the directory listing without disturbing the rest of the user's view.
 *
 * Algorithm (UAT Tests 6 + 7 fix, 2026-04-16):
 *   1. Snapshot the set of currently-expanded folder paths.
 *   2. Snapshot the path of the currently-selected entry.
 *   3. Run initTree() (replaces treeNodes.value with fresh root entries, expanded:false).
 *   4. Re-expand the snapshot paths in shortest-first order so parents are loaded
 *      before children can be located. Each re-expansion uses toggleTreeNode which
 *      lazy-loads children when needed.
 *   5. Re-anchor selectedIndex by walking the post-refresh flattenedTree to find
 *      the previously-selected path. If the entry is gone (mutation deleted it),
 *      clamp to the prior index or 0.
 *
 * NOTE: initTree() itself is NOT modified — its current "wipe" semantics remain
 * correct for project-switch (handleProjectChanged) and initial mount.
 */
async function refreshTreePreservingState(): Promise<void> {
  // 1. Snapshot expanded paths from current flattened tree
  const expandedPaths = new Set<string>();
  for (const node of flattenedTree.value) {
    if (node.entry.is_dir && node.expanded) {
      expandedPaths.add(node.entry.path);
    }
  }
  // 2. Snapshot currently-selected entry's path (by index → path)
  const prevIndex = selectedIndex.value;
  const prevSelectedPath = flattenedTree.value[prevIndex]?.entry.path ?? null;

  // 3. Rebuild the tree from disk (this resets every node to expanded:false + selectedIndex=0)
  await initTree();

  // 4. Re-expand snapshot paths in shortest-first order so parents load before children
  const sortedExpanded = Array.from(expandedPaths).sort((a, b) => a.length - b.length);
  for (const path of sortedExpanded) {
    // Locate the node in the current flattened tree (must re-read each pass because
    // toggleTreeNode mutates treeNodes.value, invalidating prior references).
    const node = flattenedTree.value.find(n => n.entry.path === path && n.entry.is_dir);
    if (!node || node.expanded) continue;
    try {
      await toggleTreeNode(node);
    } catch {
      // Swallow: a folder may have been deleted by the mutation; silently leave it collapsed.
    }
  }

  // 5. Re-anchor selectedIndex by previous path if still present
  if (prevSelectedPath) {
    const newIdx = flattenedTree.value.findIndex(n => n.entry.path === prevSelectedPath);
    if (newIdx >= 0) {
      selectedIndex.value = newIdx;
    } else {
      // Entry was deleted — clamp to a safe index
      const flatLen = flattenedTree.value.length;
      selectedIndex.value = Math.min(prevIndex, Math.max(0, flatLen - 1));
    }
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
    // quick-260417-f6e: default to -1 ("no row selected"). We only seed from the
    // active tab on the FIRST load of the project root (initial mount / project
    // switch). Sub-directory drilling leaves selectedIndex at -1 — the user is
    // exploring, not opening a file.
    selectedIndex.value = -1;
    loaded.value = true;
    // Seed from active tab only when we landed on the project root (initial load
    // or project switch). If path is a deeper directory, leave -1.
    if (project?.path && path === project.path) {
      await seedSelectionFromActiveTab();
    }
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

// ── Phase 18 Plan 05 (D-11..D-14): intra-tree mouse-drag to move files/folders ────

/**
 * Look up a tree entry by its data-file-tree-index value.
 * Flat mode reads from entries.value; tree mode reads from flattenedTree.
 */
function getEntryByIndex(i: number): FileEntry | undefined {
  if (viewMode.value === 'flat') return entries.value[i];
  return flattenedTree.value[i]?.entry;
}

function onRowMouseDown(e: MouseEvent, path: string): void {
  if (e.button !== 0) return;
  const target = e.currentTarget as HTMLElement;
  // Prevent text selection during drag
  e.preventDefault();
  treeDrag.sourcePath = path;
  treeDrag.sourceEl = target;
  treeDrag.startX = e.clientX;
  treeDrag.startY = e.clientY;
  treeDrag.dragging = false;
  document.addEventListener('mousemove', onTreeDocMouseMove);
  document.addEventListener('mouseup', onTreeDocMouseUp);
}

function onTreeDocMouseMove(e: MouseEvent): void {
  if (!treeDrag.sourcePath || !treeDrag.sourceEl) return;
  const dx = Math.abs(e.clientX - treeDrag.startX);
  const dy = Math.abs(e.clientY - treeDrag.startY);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (!treeDrag.dragging && dist >= DRAG_THRESHOLD_PX) {
    treeDrag.dragging = true;
    treeDrag.sourceEl.style.opacity = '0.4';
    const ghost = treeDrag.sourceEl.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.top = `${treeDrag.sourceEl.getBoundingClientRect().top}px`;
    ghost.style.left = `${e.clientX - 40}px`;
    ghost.style.opacity = '0.8';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.transition = 'none';
    ghost.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    ghost.style.borderRadius = '6px';
    document.body.appendChild(ghost);
    treeDrag.ghostEl = ghost;
  }
  if (!treeDrag.dragging) return;
  if (treeDrag.ghostEl) {
    treeDrag.ghostEl.style.left = `${e.clientX - 40}px`;
    treeDrag.ghostEl.style.top = `${e.clientY - 10}px`;
  }
  // Clear previous highlights, apply new highlight to row under cursor
  const rowEls = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
  rowEls.forEach(el => { el.style.borderLeft = ''; el.style.backgroundColor = ''; });
  for (const el of rowEls) {
    const rect = el.getBoundingClientRect();
    if (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    ) {
      const idx = el.dataset.fileTreeIndex;
      if (idx !== undefined) {
        const entry = getEntryByIndex(parseInt(idx, 10));
        if (entry && entry.path !== treeDrag.sourcePath) {
          el.style.borderLeft = `2px solid ${colors.accent}`;
          el.style.backgroundColor = `${colors.accent}20`;
        }
      }
      break;
    }
  }
}

async function onTreeDocMouseUp(e: MouseEvent): Promise<void> {
  document.removeEventListener('mousemove', onTreeDocMouseMove);
  document.removeEventListener('mouseup', onTreeDocMouseUp);
  const sourcePath = treeDrag.sourcePath;
  const wasDragging = treeDrag.dragging;
  cleanupTreeDrag();
  if (!wasDragging || !sourcePath) return;

  // Resolve drop target (D-12)
  let targetDir: string | null = null;
  const rowEls = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
  for (const el of rowEls) {
    const rect = el.getBoundingClientRect();
    if (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    ) {
      const idx = el.dataset.fileTreeIndex;
      if (idx !== undefined) {
        const entry = getEntryByIndex(parseInt(idx, 10));
        if (entry && entry.path !== sourcePath) {
          targetDir = entry.is_dir ? entry.path : entry.path.replace(/\/[^/]+$/, '');
        }
      }
      break;
    }
  }
  // Empty-area drop → project root
  if (!targetDir) {
    const project = getActiveProject();
    targetDir = project?.path ?? null;
  }
  if (!targetDir) return;

  // Compute source's current parent; abort no-op move (dropping into own parent)
  const sourceParent = sourcePath.replace(/\/[^/]+$/, '');
  if (sourceParent === targetDir) return;

  const sourceName = sourcePath.split('/').pop()!;
  const target = `${targetDir}/${sourceName}`;

  // Prevent moving a folder into itself or its descendant
  if (target.startsWith(sourcePath + '/') || target === sourcePath) return;

  try {
    await renameFile(sourcePath, target);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('exists')) {
      showToast({ type: 'error', message: `File exists: ${sourceName}` });
    } else {
      showToast({
        type: 'error',
        message: `Could not move ${sourceName}`,
        hint: 'Check target folder permissions.',
      });
    }
  }
}

function cleanupTreeDrag(): void {
  if (treeDrag.sourceEl) treeDrag.sourceEl.style.opacity = '';
  if (treeDrag.ghostEl) treeDrag.ghostEl.remove();
  document.querySelectorAll<HTMLElement>('[data-file-tree-index]').forEach(el => {
    el.style.borderLeft = '';
    el.style.backgroundColor = '';
  });
  treeDrag.sourcePath = null;
  treeDrag.sourceEl = null;
  treeDrag.ghostEl = null;
  treeDrag.startX = 0;
  treeDrag.startY = 0;
  treeDrag.dragging = false;
}

/**
 * Reveal a file in the tree by expanding folders along its path and selecting it.
 * Used by editor tab click to show where a file lives in the tree.
 */
export async function revealFileInTree(filePath: string): Promise<void> {
  const project = getActiveProject();
  if (!project?.path) return;

  const rootPath = project.path;
  // Compute relative path from project root
  if (!filePath.startsWith(rootPath)) return;
  const relative = filePath.slice(rootPath.length).replace(/^\//, '');
  const segments = relative.split('/');

  if (viewMode.value === 'tree') {
    // If tree not loaded yet, defer the reveal until initTree completes
    if (treeNodes.value.length === 0) {
      pendingRevealPath.value = filePath;
      return;
    }
    // Walk tree from root, expanding each folder segment
    let currentNodes = treeNodes.value;
    for (let i = 0; i < segments.length - 1; i++) {
      const folderName = segments[i];
      const folderNode = currentNodes.find(n => n.entry.is_dir && n.entry.name === folderName);
      if (!folderNode) return; // folder not found in tree
      if (!folderNode.expanded) {
        await toggleTreeNode(folderNode);
      } else if (folderNode.children === null) {
        await loadTreeChildren(folderNode);
      }
      currentNodes = folderNode.children ?? [];
    }

    // Find the target file in the flattened list and select it
    const flat = flattenedTree.value;
    const targetName = segments[segments.length - 1];
    const targetIdx = flat.findIndex(n => n.entry.name === targetName && n.entry.path === filePath);
    if (targetIdx >= 0) {
      selectedIndex.value = targetIdx;
      // Scroll into view after a tick to allow DOM to update
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('file-tree-scroll-to-selected'));
      });
    }
  } else {
    // Flat mode: navigate to file's parent directory
    const parentPath = filePath.split('/').slice(0, -1).join('/');
    await loadDir(parentPath);
    // Find file in entries
    const targetName = segments[segments.length - 1];
    const idx = entries.value.findIndex(e => e.name === targetName && e.path === filePath);
    if (idx >= 0) {
      selectedIndex.value = idx;
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('file-tree-scroll-to-selected'));
      });
    }
  }
}

/**
 * Phase 18 Plan 03: Inline create row for New File / New Folder.
 * VSCode-style: renders an autofocused input inside the tree list.
 * Enter commits via createFile/createFolder, Escape cancels, blur commits.
 * Invalid names show inline error text and keep the row mounted.
 */
interface InlineCreateRowProps {
  parentDir: string;
  kind: 'file' | 'folder';
  depth: number;
  onDone: () => void;
}

function InlineCreateRow({ parentDir, kind, depth, onDone }: InlineCreateRowProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    // Autofocus on mount (RESEARCH.md §5)
    inputRef.current?.focus();
  }, []);

  function validate(raw: string): string | null {
    const v = raw.trim();
    if (!v) return 'Name required';
    if (v.includes('/') || v.includes('\0')) return 'Invalid characters (no / or null)';
    return null;
  }

  async function commit() {
    if (committedRef.current) return;
    const err = validate(name);
    if (err) { setError(err); return; }
    committedRef.current = true;
    const target = `${parentDir}/${name.trim()}`;
    try {
      if (kind === 'file') await createFile(target);
      else await createFolder(target);
      onDone();
    } catch (e) {
      committedRef.current = false;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('exists')) {
        setError(`'${name.trim()}' already exists`);
      } else {
        setError(msg);
      }
      // Re-focus input so the user can fix and retry
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const paddingLeft = 12 + (depth * 16);
  const Icon = kind === 'folder' ? FolderIcon : FileTextIcon;
  const placeholder = kind === 'file' ? 'New file name' : 'New folder name';

  return (
    <div>
      <div
        style={{
          padding: `${fileTreeLineHeight.value}px 12px`,
          paddingLeft,
          gap: 6,
          display: 'flex',
          alignItems: 'center',
          backgroundColor: colors.bgElevated,
        }}
      >
        <span style={{ width: 10, flexShrink: 0 }} />
        <Icon />
        <input
          ref={inputRef}
          value={name}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!error}
          onInput={(e) => { setName((e.target as HTMLInputElement).value); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); committedRef.current = true; onDone(); }
          }}
          onBlur={() => { if (!committedRef.current) void commit(); }}
          style={{
            flex: 1,
            background: 'transparent',
            border: `1px solid ${error ? colors.diffRed : colors.bgBorder}`,
            borderRadius: 3,
            padding: '2px 4px',
            color: colors.textPrimary,
            fontFamily: 'var(--file-tree-font, Geist)',
            fontSize: fileTreeFontSize.value,
            outline: 'none',
          }}
          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = colors.accent; }}
        />
      </div>
      {error && (
        <div
          style={{
            fontSize: 11,
            color: colors.diffRed,
            paddingLeft: 28 + depth * 16,
            paddingBottom: 2,
          }}
        >{error}</div>
      )}
    </div>
  );
}

/**
 * FileTree component.
 * Renders a navigable file tree for the active project directory.
 * Supports flat mode (drill-down) and tree mode (collapsible hierarchy).
 */
export function FileTree() {
  // Phase 18 Plan 05: scroll container ref for Finder drop-zone outline + hit-testing
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Phase 18 Plan 04 (D-06): kick off editor detection once on mount (cached thereafter)
    void ensureEditorsDetected();

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

    // Scroll-to-selected handler for revealFileInTree
    function handleScrollToSelected() {
      const idx = selectedIndex.value;
      const el = document.querySelector(`[data-file-tree-index="${idx}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
    document.addEventListener('file-tree-scroll-to-selected', handleScrollToSelected);

    // Phase 18 Plan 03 + Plan 08: listen for git-status-changed to refresh tree after file ops.
    // Plan 08 introduced refreshTreePreservingState() to preserve expand/collapse state.
    let unlistenFs: (() => void) | null = null;
    (async () => {
      unlistenFs = await listen('git-status-changed', () => {
        const project = getActiveProject();
        if (!project?.path) return;
        if (viewMode.value === 'tree') {
          // UAT Tests 6 + 7 fix (2026-04-16): use the state-preserving refresh path
          // instead of initTree(), which would wipe all expansion state on every mutation.
          void refreshTreePreservingState();
        } else {
          loadDir(currentPath.value);
        }
      });
    })();

    // Phase 18 Plan 09 (UAT Test 5 fix): listen for Cmd+Backspace routed through the native
    // Tauri menu. WKWebView intercepts Cmd+Backspace via NSResponder doCommandBySelector:
    // before it reaches our keydown handlers, so the shortcut is bound to a native MenuItem
    // in src-tauri/src/lib.rs. The menu event handler emits 'delete-selected-tree-row';
    // we consume it here and route to triggerDeleteConfirm for the currently-selected entry.
    let unlistenDelete: (() => void) | null = null;
    (async () => {
      unlistenDelete = await listen('delete-selected-tree-row', () => {
        // Guard: only act when a project is active and a row is actually selected.
        const project = getActiveProject();
        if (!project?.path) return;
        let entry: FileEntry | undefined;
        if (viewMode.value === 'flat') {
          entry = entries.value[selectedIndex.value];
        } else {
          entry = flattenedTree.value[selectedIndex.value]?.entry;
        }
        if (entry) void triggerDeleteConfirm(entry);
      });
    })();

    // Phase 18 Plan 05 (D-15..D-18): Finder drop event handlers. main.tsx dispatches
    // tree-finder-* CustomEvents for OS drops whose paths are OUTSIDE the project root.
    async function handleFinderDragover(e: Event) {
      finderDropActive.value = true;
      const { position } = (e as CustomEvent).detail as { paths: string[]; position: { x: number; y: number } };
      // Highlight the row under the cursor, if any (same visual grammar as intra-tree drag)
      const rowEls = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
      rowEls.forEach(el => { el.style.borderLeft = ''; el.style.backgroundColor = ''; });
      for (const el of rowEls) {
        const rect = el.getBoundingClientRect();
        if (
          position.x >= rect.left && position.x <= rect.right &&
          position.y >= rect.top && position.y <= rect.bottom
        ) {
          el.style.borderLeft = `2px solid ${colors.accent}`;
          el.style.backgroundColor = `${colors.accent}20`;
          break;
        }
      }
    }

    function handleFinderDragleave() {
      finderDropActive.value = false;
      document.querySelectorAll<HTMLElement>('[data-file-tree-index]').forEach(el => {
        el.style.borderLeft = '';
        el.style.backgroundColor = '';
      });
    }

    async function handleFinderDrop(e: Event) {
      finderDropActive.value = false;
      document.querySelectorAll<HTMLElement>('[data-file-tree-index]').forEach(el => {
        el.style.borderLeft = '';
        el.style.backgroundColor = '';
      });
      const { paths, position } = (e as CustomEvent).detail as { paths: string[]; position: { x: number; y: number } };
      if (!paths || paths.length === 0) return;
      // Resolve target directory from cursor position (same logic as intra-drag)
      let targetDir: string | null = null;
      const rowEls = document.querySelectorAll<HTMLElement>('[data-file-tree-index]');
      for (const el of rowEls) {
        const rect = el.getBoundingClientRect();
        if (
          position.x >= rect.left && position.x <= rect.right &&
          position.y >= rect.top && position.y <= rect.bottom
        ) {
          const idx = el.dataset.fileTreeIndex;
          if (idx !== undefined) {
            const entry = getEntryByIndex(parseInt(idx, 10));
            if (entry) {
              targetDir = entry.is_dir ? entry.path : entry.path.replace(/\/[^/]+$/, '');
            }
          }
          break;
        }
      }
      if (!targetDir) {
        // Check if drop happened inside the scroll container's bounds
        const containerRect = scrollContainerRef.current?.getBoundingClientRect();
        if (containerRect
            && position.x >= containerRect.left && position.x <= containerRect.right
            && position.y >= containerRect.top && position.y <= containerRect.bottom) {
          const project = getActiveProject();
          targetDir = project?.path ?? null;
        } else {
          showToast({ type: 'error', message: 'Drop target outside file tree' });
          return;
        }
      }
      // Copy each source path into target (D-17, D-20)
      for (const src of paths) {
        const name = src.split('/').pop() || src;
        const dst = `${targetDir}/${name}`;
        try {
          await copyPath(src, dst);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes('exists')) {
            showToast({ type: 'error', message: `File exists: ${name}` });
          } else {
            showToast({
              type: 'error',
              message: `Could not copy ${name}`,
              hint: 'Check target folder permissions.',
            });
          }
        }
      }
    }

    document.addEventListener('tree-finder-dragover', handleFinderDragover);
    document.addEventListener('tree-finder-dragleave', handleFinderDragleave);
    document.addEventListener('tree-finder-drop', handleFinderDrop);

    // Initial load
    const project = getActiveProject();
    if (project && project.path) {
      loadDir(project.path);
      if (viewMode.value === 'tree') {
        initTree();
      }
    }

    return () => {
      if (unlistenFs) unlistenFs();
      if (unlistenDelete) unlistenDelete();
      document.removeEventListener('project-changed', handleProjectChanged);
      document.removeEventListener('file-tree-scroll-to-selected', handleScrollToSelected);
      document.removeEventListener('tree-finder-dragover', handleFinderDragover);
      document.removeEventListener('tree-finder-dragleave', handleFinderDragleave);
      document.removeEventListener('tree-finder-drop', handleFinderDrop);
    };
  }, []);

  /**
   * Phase 18 Plan 03: Reusable delete confirm dispatcher.
   * Triggered by context menu "Delete" action, Delete key, or Cmd+Backspace.
   * For folders, fetches child count for the confirm message.
   */
  async function triggerDeleteConfirm(entry: FileEntry): Promise<void> {
    const name = entry.name;
    const path = entry.path;
    let msg: string;
    if (entry.is_dir) {
      // Count descendants for the confirm message (D-02)
      let countSuffix = '';
      try {
        const c = await invoke<ChildCount>('count_children', { path });
        if (c.capped) countSuffix = ` and 10000+ items`;
        else if (c.total > 0) countSuffix = ` and ${c.total} items`;
      } catch {
        countSuffix = '';  // fall back to no-count message on error
      }
      msg = `'${name}'${countSuffix} will be permanently deleted. This cannot be undone.`;
    } else {
      msg = `'${name}' will be permanently deleted. This cannot be undone.`;
    }
    const title = entry.is_dir ? `Delete folder ${name}?` : `Delete ${name}?`;
    showConfirmModal({
      title,
      message: msg,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteFile(path);
          // Clamp selectedIndex to valid range so UI doesn't crash on empty
          const flatLen = viewMode.value === 'flat'
            ? Math.max(0, entries.value.length - 1)
            : Math.max(0, flattenedTree.value.length - 1);
          selectedIndex.value = Math.min(selectedIndex.value, flatLen);
        } catch (e) {
          showToast({
            type: 'error',
            message: `Could not delete ${name}`,
            hint: 'Check file permissions and try again.',
          });
        }
      },
      onCancel: () => {},
    });
  }

  /**
   * Phase 18 Plan 03: Build per-row context menu items (Delete, New File, New Folder).
   * Open In / external-editor items land in Plan 18-04.
   */
  // Phase 18 Plan 04: build Open In submenu children from detected editors (D-06, D-08, D-09)
  function buildOpenInChildren(path: string): ContextMenuItem[] {
    const ed = detectedEditors.value;
    if (!ed) return [];
    const children: ContextMenuItem[] = [];
    if (ed.zed)    children.push({ label: 'Zed',                 icon: Zap,           action: () => { void launchOrToast('Zed', path); } });
    if (ed.code)   children.push({ label: 'Visual Studio Code',  icon: Code2,         action: () => { void launchOrToast('Visual Studio Code', path); } });
    if (ed.cursor) children.push({ label: 'Cursor',              icon: MousePointer2, action: () => { void launchOrToast('Cursor', path); } });
    if (ed.subl)   children.push({ label: 'Sublime Text',        icon: Type,          action: () => { void launchOrToast('Sublime Text', path); } });
    if (ed.idea)   children.push({ label: 'IntelliJ IDEA',       icon: Braces,        action: () => { void launchOrToast('IntelliJ IDEA', path); } });
    return children;
  }

  async function launchOrToast(app: string, path: string): Promise<void> {
    try {
      await launchExternalEditor(app, path);
    } catch {
      showToast({
        type: 'error',
        message: `Could not launch ${app}`,
        hint: 'Make sure the app is installed.',
      });
    }
  }

  // Phase 18 Plan 04 (D-23): resolve target directory for header [+] create
  function resolveHeaderCreateTarget(): string {
    const project = getActiveProject();
    const projectPath = project?.path || '';
    let selectedEntry: FileEntry | undefined;
    if (viewMode.value === 'flat') {
      selectedEntry = entries.value[selectedIndex.value];
    } else {
      selectedEntry = flattenedTree.value[selectedIndex.value]?.entry;
    }
    if (selectedEntry) {
      if (selectedEntry.is_dir) return selectedEntry.path;
      // File → parent directory
      return selectedEntry.path.replace(/\/[^/]+$/, '') || projectPath;
    }
    return projectPath;
  }

  function openHeaderCreateMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const target = resolveHeaderCreateTarget();
    const items: ContextMenuItem[] = [
      {
        label: 'New File',
        icon: FilePlus,
        action: () => {
          const afterIdx = selectedIndex.value;
          activeCreateRow.value = { parentDir: target, kind: 'file', afterIndex: afterIdx };
        },
      },
      {
        label: 'New Folder',
        icon: FolderPlus,
        action: () => {
          const afterIdx = selectedIndex.value;
          activeCreateRow.value = { parentDir: target, kind: 'folder', afterIndex: afterIdx };
        },
      },
    ];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    headerMenu.value = { x: rect.left, y: rect.bottom + 2, items };
  }

  function openHeaderOpenInMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const project = getActiveProject();
    if (!project?.path) return;
    const children = buildOpenInChildren(project.path);
    if (children.length === 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Render detected-editor children inline as the top-level menu items (simpler than nesting)
    headerMenu.value = { x: rect.left, y: rect.bottom + 2, items: children };
  }

  function buildRowMenuItems(entry: FileEntry): ContextMenuItem[] {
    const isDir = entry.is_dir;
    // Resolve the target directory for "New File" / "New Folder" (D-23)
    const targetDir = isDir ? entry.path : entry.path.replace(/\/[^/]+$/, '');
    const items: ContextMenuItem[] = [];
    // Phase 18 Plan 04: Open In submenu (only when editors detected)
    const openInChildren = buildOpenInChildren(entry.path);
    if (openInChildren.length > 0) {
      items.push({
        label: 'Open In',
        icon: ExternalLink,
        children: openInChildren,
      });
    }
    // Open with default app (always)
    items.push({
      label: 'Open with default app',
      icon: ExternalLink,
      action: () => { void openDefault(entry.path).catch(() => showToast({ type: 'error', message: `Could not open ${entry.name}` })); },
    });
    // Reveal in Finder (always)
    items.push({
      label: 'Reveal in Finder',
      icon: FolderOpen,
      action: () => { void revealInFinder(entry.path).catch(() => showToast({ type: 'error', message: `Could not reveal ${entry.name}` })); },
    });
    items.push({ label: '', action: () => {}, separator: true });
    // New File
    items.push({
      label: 'New File',
      icon: FilePlus,
      action: () => {
        const afterIdx = viewMode.value === 'flat'
          ? entries.value.findIndex(e => e.path === entry.path)
          : flattenedTree.value.findIndex(n => n.entry.path === entry.path);
        activeCreateRow.value = { parentDir: targetDir, kind: 'file', afterIndex: afterIdx };
        // If targetDir is a collapsed folder in tree mode, expand it first
        if (viewMode.value === 'tree' && isDir) {
          const node = flattenedTree.value[afterIdx];
          if (node && !node.expanded) toggleTreeNode(node);
        }
      },
    });
    // New Folder
    items.push({
      label: 'New Folder',
      icon: FolderPlus,
      action: () => {
        const afterIdx = viewMode.value === 'flat'
          ? entries.value.findIndex(e => e.path === entry.path)
          : flattenedTree.value.findIndex(n => n.entry.path === entry.path);
        activeCreateRow.value = { parentDir: targetDir, kind: 'folder', afterIndex: afterIdx };
        if (viewMode.value === 'tree' && isDir) {
          const node = flattenedTree.value[afterIdx];
          if (node && !node.expanded) toggleTreeNode(node);
        }
      },
    });
    items.push({ label: '', action: () => {}, separator: true });
    // Delete
    items.push({
      label: 'Delete',
      icon: Trash2,
      action: () => { void triggerDeleteConfirm(entry); },
    });
    return items;
  }

  function handleRowContextMenu(e: MouseEvent, entry: FileEntry, rowIndex: number): void {
    e.preventDefault();
    e.stopPropagation();
    selectedIndex.value = rowIndex;
    activeMenu.value = { x: e.clientX, y: e.clientY, items: buildRowMenuItems(entry) };
  }

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
      case 'Delete': {
        e.preventDefault();
        const entry = entries.value[selectedIndex.value];
        if (entry) void triggerDeleteConfirm(entry);
        break;
      }
      case 'Backspace': {
        if (e.metaKey) {
          e.preventDefault();
          const entry = entries.value[selectedIndex.value];
          if (entry) void triggerDeleteConfirm(entry);
          break;
        }
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
      case 'Backspace': {
        if (e.metaKey) {
          e.preventDefault();
          const entry = flattenedTree.value[selectedIndex.value]?.entry;
          if (entry) void triggerDeleteConfirm(entry);
        }
        break;
      }
      case 'Delete': {
        e.preventDefault();
        const entry = flattenedTree.value[selectedIndex.value]?.entry;
        if (entry) void triggerDeleteConfirm(entry);
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

        {/* Phase 18 Plan 04 (D-22): Header [+] create dropdown button */}
        <span
          onClick={openHeaderCreateMenu}
          title="New file or folder"
          style={{
            cursor: 'pointer',
            width: 28,
            height: 28,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = colors.bgElevated; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          <Plus size={14} color={colors.textMuted} />
        </span>

        {/* Phase 18 Plan 04 (D-10): Header Open In button — hidden when no editors detected */}
        {(() => {
          const ed = detectedEditors.value;
          const hasAny = !!(ed && (ed.zed || ed.code || ed.subl || ed.cursor || ed.idea));
          if (!hasAny) return null;
          return (
            <span
              onClick={openHeaderOpenInMenu}
              title="Open project in external editor"
              style={{
                cursor: 'pointer',
                width: 28,
                height: 28,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = colors.bgElevated; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <ExternalLink size={14} color={colors.textMuted} />
            </span>
          );
        })()}

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
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '4px 0',
          outline: finderDropActive.value ? `1px solid ${colors.accent}` : 'none',
          boxShadow: finderDropActive.value
            ? `inset 0 0 0 1px ${colors.accent}, 0 0 12px 0 ${colors.accent}40`
            : 'none',
        }}
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
              const cr = activeCreateRow.value;
              return (
                <>
                  <div
                    key={entry.path}
                    data-file-tree-index={i}
                    style={{
                      padding: `${fileTreeLineHeight.value}px 12px`,
                      gap: 8,
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      // Phase 18 quick-260416-uig (bug 3): hover OR click-selection
                      // lights up the bg; filename color is driven solely by isSelected below.
                      backgroundColor: (hoveredIndex.value === i || isSelected) ? colors.bgElevated : 'transparent',
                      // Phase 18 quick-260416-uig (bug 2): prevent filename text selection on right-click.
                      // WKWebView needs the -webkit- prefix; Preact's `userSelect` alone does not emit it.
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    onClick={() => {
                      selectedIndex.value = i;
                      if (entry.is_dir) {
                        loadDir(entry.path);
                      } else {
                        handleFileClick(entry.path, entry.name);
                      }
                    }}
                    onMouseEnter={() => { hoveredIndex.value = i; }}
                    onMouseLeave={() => { if (hoveredIndex.value === i) hoveredIndex.value = -1; }}
                    onContextMenu={(e) => handleRowContextMenu(e as unknown as MouseEvent, entry, i)}
                    onMouseDown={(e) => onRowMouseDown(e as unknown as MouseEvent, entry.path)}
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
                  {cr && cr.afterIndex === i && (
                    <InlineCreateRow
                      parentDir={cr.parentDir}
                      kind={cr.kind}
                      depth={0}
                      onDone={() => { activeCreateRow.value = null; }}
                    />
                  )}
                </>
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
              const cr = activeCreateRow.value;
              return (
                <>
                  <div
                    key={node.entry.path + '-' + node.depth}
                    data-file-tree-index={i}
                    style={{
                      padding: `${fileTreeLineHeight.value}px 12px`,
                      paddingLeft,
                      gap: 6,
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      // Phase 18 quick-260416-uig (bug 3): mirror of flat-mode row bg logic.
                      backgroundColor: (hoveredIndex.value === i || isSelected) ? colors.bgElevated : 'transparent',
                      // Phase 18 quick-260416-uig (bug 2): no filename selection on right-click.
                      // WKWebView needs the -webkit- prefix; Preact's `userSelect` alone does not emit it.
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    onClick={() => {
                      selectedIndex.value = i;
                      if (node.entry.is_dir) {
                        toggleTreeNode(node);
                      } else {
                        handleFileClick(node.entry.path, node.entry.name);
                      }
                    }}
                    onMouseEnter={() => { hoveredIndex.value = i; }}
                    onMouseLeave={() => { if (hoveredIndex.value === i) hoveredIndex.value = -1; }}
                    onContextMenu={(e) => handleRowContextMenu(e as unknown as MouseEvent, node.entry, i)}
                    onMouseDown={(e) => onRowMouseDown(e as unknown as MouseEvent, node.entry.path)}
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
                  {cr && cr.afterIndex === i && (
                    <InlineCreateRow
                      parentDir={cr.parentDir}
                      kind={cr.kind}
                      depth={node.depth + (node.entry.is_dir ? 1 : 0)}
                      onDone={() => { activeCreateRow.value = null; }}
                    />
                  )}
                </>
              );
            })
          )
        )}
      </div>
      {activeMenu.value && (
        <ContextMenu
          items={activeMenu.value.items}
          x={activeMenu.value.x}
          y={activeMenu.value.y}
          onClose={() => { activeMenu.value = null; }}
        />
      )}
      {/* Phase 18 Plan 04: Header dropdown menu (for [+] and Open In header buttons) */}
      {headerMenu.value && (
        <ContextMenu
          items={headerMenu.value.items}
          x={headerMenu.value.x}
          y={headerMenu.value.y}
          onClose={() => { headerMenu.value = null; }}
        />
      )}
    </div>
  );
}
