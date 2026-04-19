// resize-increments.ts -- Window-level NSWindow contentResizeIncrements sync
// and shared snapToCell helper for drag-manager quantization.
//
// Architecture C: increments are enabled ONLY when the main-panel's active tab
// is a terminal. Non-terminal tabs (editor, file-tree, gsd, git-changes) call
// clearWindowIncrements() so the window resizes freely by pixel.
//
// This module is the SOLE consumer of xterm.js _core internals. No other file
// should access _renderService or _core — keep the coupling at exactly one point.

import { invoke } from '@tauri-apps/api/core';
import { distributeCells } from './pane-distribute';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellGeom {
  originX: number;
  originY: number;
  cellW: number;
  cellH: number;
}

// ---------------------------------------------------------------------------
// Cell geometry reading (xterm private API — stable across 5.x / 6.x)
// ---------------------------------------------------------------------------

/**
 * Read the cell geometry of the first visible terminal in `.main-panel`.
 *
 * Returns null when:
 * - No terminal is mounted (startup, non-terminal active tab)
 * - The terminal's renderer has not measured yet (cell.width < 1)
 *
 * The `:not([style*="display: none"])` filter is essential because SubScopePane
 * always-mounts bodies with display:none toggled for inactive tabs — we want
 * the visible (active) terminal only.
 */
export function getActiveTerminalCellGeom(): CellGeom | null {
  const el = document.querySelector<HTMLElement>(
    '.main-panel .xterm:not([style*="display: none"])',
  );
  if (!el) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (el as any)._xterm?._core ?? (el as any).terminal?._core;
  const d = core?._renderService?.dimensions?.css?.cell;
  if (!d || d.width < 1 || d.height < 1) return null;

  const rect = el.getBoundingClientRect();
  return {
    originX: rect.left,
    originY: rect.top,
    cellW: d.width,
    cellH: d.height,
  };
}

// ---------------------------------------------------------------------------
// snapToCell — pure function, used by drag-manager for live quantization
// ---------------------------------------------------------------------------

/**
 * Snap a pixel coordinate to the nearest cell boundary, relative to the
 * terminal pane's origin.
 *
 * Returns `px` unchanged when:
 * - No visible terminal is mounted (null-guard — critical at startup)
 * - Cell step < 1 (degenerate font metric guard)
 *
 * CRITICAL: do NOT return `origin` as a fallback — that collapses the handle
 * to the pane edge (RESEARCH §5 pitfall).
 */
export function snapToCell(px: number, axis: 'x' | 'y'): number {
  const g = getActiveTerminalCellGeom();
  if (!g) return px;

  const origin = axis === 'x' ? g.originX : g.originY;
  const step = axis === 'x' ? g.cellW : g.cellH;

  if (step < 1) return px; // degenerate font metric guard

  const offset = px - origin;
  const snappedOffset = Math.round(offset / step) * step;
  return origin + snappedOffset;
}

// ---------------------------------------------------------------------------
// IPC helpers
// ---------------------------------------------------------------------------

/**
 * Set NSWindow contentResizeIncrements to snap the window content-rect to
 * cell boundaries during live resize. Silent-fail: increments are a UX nice-
 * to-have, not a correctness requirement.
 */
export async function syncWindowIncrements(cellW: number, cellH: number): Promise<void> {
  await invoke('set_content_resize_increments', { cellW, cellH }).catch((e: unknown) => {
    console.warn('[efxmux] set_content_resize_increments failed:', e);
  });
}

/**
 * Clear NSWindow contentResizeIncrements (reset to 1×1) so the window resizes
 * freely by pixel. Called when the active main-panel tab switches to a non-
 * terminal kind (editor, file-tree, gsd, git-changes). Silent-fail.
 */
export async function clearWindowIncrements(): Promise<void> {
  await invoke('clear_content_resize_increments').catch(() => {});
}

// ---------------------------------------------------------------------------
// Debounced sync — single 100ms trailing-edge debounce, module-scoped
// ---------------------------------------------------------------------------

let _debounceHandle: ReturnType<typeof setTimeout> | undefined;

/**
 * Read the active terminal's cell geometry and sync NSWindow increments,
 * debounced to at most one IPC call per 100ms.
 *
 * All callers (drag-manager, terminal-manager, theme-manager, main.tsx) use
 * this function — the single debounce ensures no IPC flood even when multiple
 * call sites fire in the same frame.
 *
 * If no visible terminal is found, the IPC call is skipped (no terminal to sync).
 */
export function syncIncrementsDebounced(): void {
  if (_debounceHandle !== undefined) {
    clearTimeout(_debounceHandle);
  }
  _debounceHandle = setTimeout(() => {
    _debounceHandle = undefined;
    const g = getActiveTerminalCellGeom();
    if (!g) return; // no visible terminal — nothing to sync

    // Round to nearest 0.5 to avoid sub-pixel drift between AppKit snap and
    // tmux col count (RESEARCH §5 sub-pixel pitfall).
    const cellW = Math.round(g.cellW * 2) / 2;
    const cellH = Math.round(g.cellH * 2) / 2;

    void syncWindowIncrements(cellW, cellH);

    // 260419-mty: post-distribute cell-aligned pcts across all stacked sub-scopes.
    // Runs in the SAME 100ms trailing tick — single coalescer (RESEARCH §2b).
    // Ordering: NSWindow snap IPC fires first (void — fire-and-forget), then we
    // divide up the new cell-multiple zone heights. The IPC is async but the
    // distribute reads DOM px that the NSWindow snap mutation will produce NEXT
    // frame; both distributeCells + IPC converge to the same geometry.
    distributeCells('main');
    distributeCells('right');
  }, 100);
}
