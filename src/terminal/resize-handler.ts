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
