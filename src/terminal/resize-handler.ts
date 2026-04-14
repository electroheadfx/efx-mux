// resize-handler.ts -- ResizeObserver + FitAddon + debounced IPC
// Per D-12: FitAddon.fit() fires instantly, invoke('resize_pty') debounced at 150ms
// Per D-14: resize is a control operation (always goes through)
// Per Pitfall 4: track last cols/rows to avoid infinite loop
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)

import { invoke } from '@tauri-apps/api/core';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

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

  const observer = new ResizeObserver(() => {
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
  });

  observer.observe(container);

  return {
    detach(): void {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    },
  };
}
