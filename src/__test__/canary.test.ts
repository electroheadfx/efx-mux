// src/__test__/canary.test.ts
// Smoke tests proving the test infrastructure works end-to-end.
// Each describe block validates one infrastructure requirement.
import { mockIPC } from '@tauri-apps/api/mocks';

describe('INFRA-01: Vitest environment', () => {
  it('runs in jsdom with globals available', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
  });

  it('has WebCrypto polyfill active', () => {
    expect(globalThis.crypto).toBeDefined();
    expect(globalThis.crypto.getRandomValues).toBeInstanceOf(Function);
    const buf = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buf);
    // At least one byte should be non-zero (probabilistically certain)
    expect(buf.some((b) => b !== 0)).toBe(true);
  });
});

describe('INFRA-02: xterm.js mock', () => {
  it('can import Terminal without crashing', async () => {
    const { Terminal } = await import('@xterm/xterm');
    expect(Terminal).toBeDefined();
    const term = new Terminal({ rows: 24, cols: 80 });
    expect(term.open).toBeDefined();
    expect(term.write).toBeDefined();
    expect(term.dispose).toBeDefined();
  });

  it('can import xterm addons without crashing', async () => {
    const { WebglAddon } = await import('@xterm/addon-webgl');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    expect(WebglAddon).toBeDefined();
    expect(FitAddon).toBeDefined();
    expect(WebLinksAddon).toBeDefined();
  });
});

describe('INFRA-03: Tauri IPC mock', () => {
  it('__TAURI_INTERNALS__ is set by setup file', () => {
    expect((globalThis as any).__TAURI_INTERNALS__).toBeDefined();
  });

  it('mockIPC intercepts invoke calls', async () => {
    const handler = vi.fn().mockReturnValue({ projects: [] });
    mockIPC(handler);

    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('load_state');

    expect(handler).toHaveBeenCalledWith(
      'load_state',
      expect.anything()
    );
  });
});

describe('INFRA-04: Coverage smoke', () => {
  it('imports a real source module for coverage tracking', async () => {
    // Import tokens.ts -- a simple module with no side effects
    // This validates that coverage instrumentation works on source files
    const tokens = await import('../tokens');
    expect(tokens).toBeDefined();
  });
});

describe('INFRA-05: jest-dom matchers', () => {
  it('provides custom DOM matchers', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';
    document.body.appendChild(div);
    expect(div).toBeInTheDocument();
    expect(div).toHaveTextContent('hello');
    document.body.removeChild(div);
  });
});
