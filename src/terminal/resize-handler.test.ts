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
