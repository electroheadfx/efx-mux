// resize-handler.js -- ResizeObserver + FitAddon + debounced IPC
// Per D-12: FitAddon.fit() fires instantly, invoke('resize_pty') debounced at 150ms
// Per D-14: resize is a control operation (always goes through)
// Per Pitfall 4: track last cols/rows to avoid infinite loop

const { invoke } = window.__TAURI__.core;

/**
 * Attach resize handling to a terminal + container.
 * @param {HTMLElement} container - The .terminal-area element
 * @param {import('@xterm/xterm').Terminal} terminal - xterm.js Terminal
 * @param {import('@xterm/addon-fit').FitAddon} fitAddon - FitAddon instance
 * @returns {{ detach: () => void }}
 */
export function attachResizeHandler(container, terminal, fitAddon, sessionName) {
  let lastCols = 0;
  let lastRows = 0;
  let resizeTimer = null;

  const observer = new ResizeObserver(() => {
    // Instant visual reflow (D-12)
    fitAddon.fit();

    const { cols, rows } = terminal;

    // Guard against infinite loop (Pitfall 4):
    // Only send IPC if dimensions actually changed
    if (cols === lastCols && rows === lastRows) return;

    lastCols = cols;
    lastRows = rows;

    // Debounced IPC to Rust (D-12: 150ms trailing)
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      invoke('resize_pty', { cols, rows, sessionName });
    }, 150);
  });

  observer.observe(container);

  return {
    detach() {
      observer.disconnect();
      clearTimeout(resizeTimer);
    },
  };
}
