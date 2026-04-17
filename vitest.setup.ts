// vitest.setup.ts — Global test setup for Efxmux
// Runs before every test file via vitest.config.ts setupFiles
import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ─── D-03: WebCrypto polyfill ────────────────────────────────
// jsdom lacks crypto.getRandomValues, which Tauri mocks need at import time
if (!globalThis.crypto?.getRandomValues) {
  const { randomFillSync } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (buf: Uint8Array) => randomFillSync(buf),
      subtle: {},
    },
  });
}

// ─── ResizeObserver polyfill ─────────────────────────────────
// jsdom lacks ResizeObserver. Terminal/editor resize handlers need it at
// construction time. Use a no-op stub — tests do not assert on observer callbacks.
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ─── D-01: Tauri IPC auto-mock ───────────────────────────────
// Set __TAURI_INTERNALS__ so any module importing @tauri-apps/api/core
// does not throw at module load time (Pitfall 1 from research)
beforeEach(() => {
  (globalThis as any).__TAURI_INTERNALS__ = {
    postMessage: vi.fn(),
    ipc: vi.fn(),
  };
  (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {};
});

afterEach(async () => {
  try {
    const { clearMocks } = await import('@tauri-apps/api/mocks');
    clearMocks();
  } catch {
    // clearMocks may fail if mocks weren't initialized; safe to ignore
  }
  delete (globalThis as any).__TAURI_INTERNALS__;
  delete (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
});

// ─── D-02: xterm.js auto-mock ────────────────────────────────
// jsdom has no WebGL/canvas — mock all xterm packages so any module
// that transitively imports Terminal gets a stub automatically
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: any;
    open = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();
    clear = vi.fn();
    reset = vi.fn();
    focus = vi.fn();
    blur = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    onTitleChange = vi.fn(() => ({ dispose: vi.fn() }));
    attachCustomKeyEventHandler = vi.fn();
    loadAddon = vi.fn();
    rows = 24;
    cols = 80;
    element = null;
    textarea = null;
    unicode = { activeVersion: '11' };
    parser = { registerOscHandler: vi.fn() };
    constructor(opts?: any) {
      this.options = opts || {};
    }
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-webgl', () => {
  class MockWebglAddon {
    dispose = vi.fn();
    onContextLoss = vi.fn(() => ({ dispose: vi.fn() }));
  }
  return { WebglAddon: MockWebglAddon };
});

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
    dispose = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock('@xterm/addon-web-links', () => {
  class MockWebLinksAddon {
    dispose = vi.fn();
  }
  return { WebLinksAddon: MockWebLinksAddon };
});

// ─── D-04: Signal reset utility ──────────────────────────────
// Exported for test files that need to reset module-scoped signals.
// Each test file imports and calls resetSignals() in its own beforeEach.
// We do NOT auto-reset here to avoid importing all signal modules globally
// (which would create circular dependency risk).
//
// Usage in test files:
//   import { someSignal } from './state-manager';
//   beforeEach(() => { someSignal.value = initialValue; });
