// resize-handler.ts -- ResizeObserver + FitAddon + debounced IPC
// Per D-12: FitAddon.fit() fires instantly, invoke('resize_pty') debounced at 150ms
// Per D-14: resize is a control operation (always goes through)
// Per Pitfall 4: track last cols/rows to avoid infinite loop
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)
//
// Debug 22-terminal-not-filling-pane: ResizeObserver alone is unreliable for
// pre-existing terminals whose pane transitions between flex modes on split
// topology change. Add a belt-and-suspenders `efxmux:layout-changed` listener
// that runs the same RAF-deferred fit() path. Every code path that mutates
// pane geometry (drag-manager intra-zone drag, spawnSubScopeForZone,
// closeSubScope) dispatches this event so all mounted terminals refit.

import { invoke } from '@tauri-apps/api/core';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/** Event name broadcast by drag-manager + sub-scope-pane when any pane geometry changes. */
export const LAYOUT_CHANGED_EVENT = 'efxmux:layout-changed';

/** Dispatch a layout-change signal. Terminals (and anything else that cares) will refit. */
export function dispatchLayoutChanged(): void {
  // Guarded for non-browser environments (e.g. unit tests that bypass jsdom).
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT));
  }
}

/**
 * Attach resize handling to a terminal + container.
 */
export function attachResizeHandler(
  container: HTMLElement,
  terminal: Terminal,
  fitAddon: FitAddon,
  sessionName: string
): { detach: () => void } {
  let lastCols = 0;
  let lastRows = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  // Shared fit+IPC path. Used by both the ResizeObserver and the
  // `efxmux:layout-changed` listener so their behaviour is identical.
  function runFit(): void {
    // Defer fit() to next frame to avoid ResizeObserver infinite loop (UAT gap test 5)
    requestAnimationFrame(() => {
      // Skip fit when container is hidden (display:none). During restoreTabs(), all
      // non-active tab containers are display:none while their ResizeObservers are
      // active. When a subsequent tab is appended and the browser reflows, the
      // ResizeObserver fires for the hidden container. Without this guard,
      // fitAddon.fit() would measure 0 cols, terminal.onResize would emit, and
      // resize_pty would be invoked with 0 dimensions — sending SIGWINCH with the
      // wrong size to the running process (e.g. Claude Code TUI), breaking fullscreen.
      if (container.style.display === 'none') return;
      fitAddon.fit();

      const { cols, rows } = terminal;

      // Guard against infinite loop (Pitfall 4):
      // Only send IPC if dimensions actually changed
      if (cols === lastCols && rows === lastRows) return;

      lastCols = cols;
      lastRows = rows;

      // Debounced IPC to Rust (D-12: 150ms trailing)
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        invoke('resize_pty', { cols, rows, sessionName }).catch(() => {});
      }, 150);
    });
  }

  const observer = new ResizeObserver(() => runFit());
  observer.observe(container);

  // Debug 22-terminal-not-filling-pane: belt-and-suspenders refit path.
  // Listen for explicit layout-change broadcasts from the drag manager and
  // SubScopePane topology mutations so pre-existing terminals always refit
  // even when ResizeObserver misses the cascaded size change.
  const onLayoutChanged = (): void => runFit();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(LAYOUT_CHANGED_EVENT, onLayoutChanged);
  }

  return {
    detach(): void {
      observer.disconnect();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener(LAYOUT_CHANGED_EVENT, onLayoutChanged);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
    },
  };
}
