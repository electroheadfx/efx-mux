// pty-bridge.ts -- Channel setup, PTY I/O, flow control ACK
// Per D-05: Channel<Vec<u8>> streaming (not emit events)
// Per D-11: JS sends ack_bytes after each chunk processed
// Per Research Pitfall 1: Vec<u8> arrives as number[], convert to Uint8Array
// Per D-10: All PTY commands are session-aware (sessionName parameter)
// Migrated to TypeScript with @tauri-apps/api imports (Phase 6.1)

import { invoke, Channel } from '@tauri-apps/api/core';
import type { Terminal } from '@xterm/xterm';

/**
 * Connect an xterm.js Terminal to a PTY backend via Tauri Channel.
 */
export async function connectPty(terminal: Terminal, sessionName: string, startDir?: string, shellCommand?: string): Promise<{ disconnect: () => void }> {
  // Create Channel for PTY output streaming (D-05, TERM-06)
  const channel = new Channel<number[]>();

  channel.onmessage = (data: number[]): void => {
    // data arrives as number[] (JSON-serialized Vec<u8>) -- Pitfall 1
    // xterm.js Terminal.write() accepts Uint8Array
    const bytes = new Uint8Array(data);
    terminal.write(bytes);

    // ACK bytes for flow control (D-11)
    // Tells Rust side how many bytes JS has consumed
    invoke('ack_bytes', { count: bytes.length, sessionName }).catch(() => {});
  };

  // Spawn PTY with tmux session (D-03, D-04)
  // Pass actual terminal dimensions to avoid initial 80x24 mismatch with tmux
  await invoke('spawn_terminal', {
    onOutput: channel,
    sessionName,
    startDir: startDir ?? null,
    shellCommand: shellCommand ?? null,
    cols: terminal.cols,
    rows: terminal.rows,
  });

  // Wire terminal input -> PTY write (D-10: pass sessionName)
  const onDataDisposable = terminal.onData((data: string) => {
    // data is a string of characters typed by user
    invoke('write_pty', { data, sessionName }).catch(() => {});
  });

  // Wire terminal resize -> PTY resize (D-10: pass sessionName)
  const onResizeDisposable = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    invoke('resize_pty', { cols, rows, sessionName }).catch(() => {});
  });

  return {
    disconnect(): void {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
    },
  };
}
