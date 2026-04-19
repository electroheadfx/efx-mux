// resize-handler.test.ts — Debug 22-terminal-not-filling-pane
//
// Verifies:
//  - attachResizeHandler installs a `efxmux:layout-changed` window listener
//  - dispatchLayoutChanged() triggers fitAddon.fit() on the next animation frame
//  - detach() removes the listener so stale terminals do not refit
//  - the hidden-container guard (display:none → skip fit) still applies
//
// Why: 22-11 changed SubScopePane to use explicit flex modes per pane. When a
// user splits the main panel, pre-existing terminals in the top pane keep
// their frozen rows/cols because ResizeObserver alone does not reliably fire
// across the split transition. The layout-change broadcast is the guaranteed
// refit path; this test guards it against regression.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachResizeHandler, dispatchLayoutChanged, LAYOUT_CHANGED_EVENT } from './resize-handler';
import { getCellMetricsForScope } from './cell-metrics';

// Module-level mock so resize-handler imports the mocked version.
vi.mock('./cell-metrics', () => ({
  getCellMetricsForScope: vi.fn(),
  snapDown: (value: number, step: number, min = 0) => {
    if (step <= 0) return value;
    const snapped = Math.floor(value / step) * step;
    return Math.max(min, snapped);
  },
}));

describe('resize-handler — layout-change broadcast', () => {
  let rafSpies: Array<() => void> = [];
  let originalRAF: typeof requestAnimationFrame;

  beforeEach(() => {
    rafSpies = [];
    originalRAF = globalThis.requestAnimationFrame;
    // Deterministic RAF: store callbacks and flush manually in each test.
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      rafSpies.push(() => cb(performance.now()));
      return rafSpies.length;
    }) as unknown as typeof requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    rafSpies = [];
  });

  function flushRAF(): void {
    const callbacks = rafSpies;
    rafSpies = [];
    for (const cb of callbacks) cb();
  }

  function makeFakes() {
    const container = document.createElement('div');
    // Mount so display:none queries resolve against a real style object.
    document.body.appendChild(container);
    const terminal = { cols: 80, rows: 24 } as any;
    const fitAddon = { fit: vi.fn() } as any;
    return { container, terminal, fitAddon };
  }

  it('LAYOUT_CHANGED_EVENT constant is the documented event name', () => {
    expect(LAYOUT_CHANGED_EVENT).toBe('efxmux:layout-changed');
  });

  it('dispatching efxmux:layout-changed runs fitAddon.fit() on next frame', () => {
    const { container, terminal, fitAddon } = makeFakes();

    attachResizeHandler(container, terminal, fitAddon, 'test-session');

    // Clear any initial observe-time fit calls.
    fitAddon.fit.mockClear();
    rafSpies = [];

    dispatchLayoutChanged();
    expect(fitAddon.fit).not.toHaveBeenCalled(); // deferred to RAF

    flushRAF();
    expect(fitAddon.fit).toHaveBeenCalledTimes(1);
  });

  it('dispatchLayoutChanged triggers refit for ALL attached terminals', () => {
    // Simulates the split-topology case: two terminals mounted, each in its
    // own pane. After a split or drag, both must refit.
    const a = makeFakes();
    const b = makeFakes();

    attachResizeHandler(a.container, a.terminal, a.fitAddon, 'sess-a');
    attachResizeHandler(b.container, b.terminal, b.fitAddon, 'sess-b');

    a.fitAddon.fit.mockClear();
    b.fitAddon.fit.mockClear();
    rafSpies = [];

    dispatchLayoutChanged();
    flushRAF();

    expect(a.fitAddon.fit).toHaveBeenCalledTimes(1);
    expect(b.fitAddon.fit).toHaveBeenCalledTimes(1);
  });

  it('hidden container (display:none) still skips fit() when event fires', () => {
    const { container, terminal, fitAddon } = makeFakes();
    container.style.display = 'none';

    attachResizeHandler(container, terminal, fitAddon, 'hidden-sess');

    fitAddon.fit.mockClear();
    rafSpies = [];

    dispatchLayoutChanged();
    flushRAF();

    expect(fitAddon.fit).not.toHaveBeenCalled();
  });

  it('detach() removes the layout-change listener', () => {
    const { container, terminal, fitAddon } = makeFakes();
    const handle = attachResizeHandler(container, terminal, fitAddon, 'to-detach');

    fitAddon.fit.mockClear();
    rafSpies = [];

    handle.detach();

    dispatchLayoutChanged();
    flushRAF();

    expect(fitAddon.fit).not.toHaveBeenCalled();
  });

  it('dispatchLayoutChanged is safe to call when no terminals are attached', () => {
    // Should not throw even if nothing is listening.
    expect(() => dispatchLayoutChanged()).not.toThrow();
  });
});

// Phase-22 follow-up (quick 260419-k1n): pane-height quantization after fit.
// Tests D, E, F — guard that runFit() snaps the pane height after fitAddon.fit().
// Uses vi.mock('./cell-metrics') declared at module top level.
describe('resize-handler — pane-height quantization', () => {
  let rafSpies: Array<() => void> = [];
  let originalRAF: typeof requestAnimationFrame;

  beforeEach(() => {
    rafSpies = [];
    originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      rafSpies.push(() => cb(performance.now()));
      return rafSpies.length;
    }) as unknown as typeof requestAnimationFrame;
    vi.mocked(getCellMetricsForScope).mockReset();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    rafSpies = [];
  });

  function flushRAF(): void {
    const callbacks = rafSpies;
    rafSpies = [];
    for (const cb of callbacks) cb();
  }

  function makePane(subscope: string) {
    const paneEl = document.createElement('div');
    paneEl.className = 'sub-scope-pane';
    paneEl.dataset.subscope = subscope;
    const containerEl = document.createElement('div');
    containerEl.className = 'terminal-container';
    paneEl.appendChild(containerEl);
    document.body.appendChild(paneEl);
    return { paneEl, containerEl };
  }

  it('Test D: quantizes pane height after fit when terminal is active', () => {
    // getCellMetricsForScope returns cell dims → snap should fire
    vi.mocked(getCellMetricsForScope).mockReturnValue({ cellWidth: 9, cellHeight: 18 });

    const { paneEl, containerEl } = makePane('main-0');
    // Pane offsetHeight = 217 → floor(217/18)*18 = 12*18 = 216
    Object.defineProperty(paneEl, 'offsetHeight', { configurable: true, value: 217 });

    const terminal = { cols: 80, rows: 12 } as any;
    const fitAddon = { fit: vi.fn() } as any;

    attachResizeHandler(containerEl, terminal, fitAddon, 'test-quant');
    fitAddon.fit.mockClear();
    rafSpies = [];

    // Change cols/rows so the lastCols/lastRows guard passes and IPC fires
    terminal.cols = 80;
    terminal.rows = 24;

    dispatchLayoutChanged();
    flushRAF();

    expect(paneEl.style.height).toBe('216px');
    // jsdom normalizes "flex: none" to "0 0 auto" (shorthand expansion)
    expect(paneEl.style.flex).toMatch(/^(none|0 0 auto)$/);

    document.body.removeChild(paneEl);
  });

  it('Test E: no quantization for mixed-content pane (getCellMetricsForScope returns null)', () => {
    vi.mocked(getCellMetricsForScope).mockReturnValue(null);

    const { paneEl, containerEl } = makePane('main-0');
    Object.defineProperty(paneEl, 'offsetHeight', { configurable: true, value: 217 });

    const terminal = { cols: 80, rows: 12 } as any;
    const fitAddon = { fit: vi.fn() } as any;

    attachResizeHandler(containerEl, terminal, fitAddon, 'test-mixed');
    fitAddon.fit.mockClear();
    rafSpies = [];

    terminal.cols = 80;
    terminal.rows = 24;

    dispatchLayoutChanged();
    flushRAF();

    // Should NOT set inline height — mixed-content guard skipped snap
    expect(paneEl.style.height).toBe('');

    document.body.removeChild(paneEl);
  });

  it('Test F: no churn when pane already aligned (diff < 1px)', () => {
    vi.mocked(getCellMetricsForScope).mockReturnValue({ cellWidth: 9, cellHeight: 18 });

    const { paneEl, containerEl } = makePane('main-0');
    // 216 = 12 * 18 — exactly aligned, snap diff = 0 → no-op
    Object.defineProperty(paneEl, 'offsetHeight', { configurable: true, value: 216 });

    const terminal = { cols: 80, rows: 12 } as any;
    const fitAddon = { fit: vi.fn() } as any;

    attachResizeHandler(containerEl, terminal, fitAddon, 'test-nochurn');
    fitAddon.fit.mockClear();
    rafSpies = [];

    terminal.cols = 80;
    terminal.rows = 24;

    dispatchLayoutChanged();
    flushRAF();

    // Height should NOT be set — no meaningful change
    expect(paneEl.style.height).toBe('');

    document.body.removeChild(paneEl);
  });
});
