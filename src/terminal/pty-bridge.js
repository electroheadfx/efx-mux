// pty-bridge.js -- Channel setup, PTY I/O, flow control ACK
// Per D-05: Channel<Vec<u8>> streaming (not emit events)
// Per D-11: JS sends ack_bytes after each chunk processed
// Per Research Pitfall 1: Vec<u8> arrives as number[], convert to Uint8Array
// Per D-10: All PTY commands are session-aware (sessionName parameter)

const { invoke, Channel } = window.__TAURI__.core;

/**
 * Connect an xterm.js Terminal to a PTY backend via Tauri Channel.
 * @param {import('@xterm/xterm').Terminal} terminal - xterm.js Terminal instance
 * @param {string} sessionName - tmux session name (per D-02: project basename)
 * @returns {Promise<{ disconnect: () => void }>}
 */
export async function connectPty(terminal, sessionName) {
  // Create Channel for PTY output streaming (D-05, TERM-06)
  const channel = new Channel();

  channel.onmessage = (data) => {
    // data arrives as number[] (JSON-serialized Vec<u8>) -- Pitfall 1
    // xterm.js Terminal.write() accepts Uint8Array
    const bytes = new Uint8Array(data);
    terminal.write(bytes);

    // ACK bytes for flow control (D-11)
    // Tells Rust side how many bytes JS has consumed
    invoke('ack_bytes', { count: bytes.length, sessionName });
  };

  // Spawn PTY with tmux session (D-03, D-04)
  await invoke('spawn_terminal', {
    onOutput: channel,
    sessionName,
  });

  // Wire terminal input -> PTY write (D-10: pass sessionName)
  const onDataDisposable = terminal.onData((data) => {
    // data is a string of characters typed by user
    invoke('write_pty', { data, sessionName });
  });

  // Wire terminal resize -> PTY resize (D-10: pass sessionName)
  const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
    invoke('resize_pty', { cols, rows, sessionName });
  });

  return {
    disconnect() {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
    },
  };
}
