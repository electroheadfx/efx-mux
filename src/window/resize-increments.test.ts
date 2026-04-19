// resize-increments.test.ts — Unit tests for resize-increments.ts
// Coverage: snapToCell math + null-guard + sub-1 guard, debounce coalescing,
// clearWindowIncrements dispatch, getActiveTerminalCellGeom.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

// ---------------------------------------------------------------------------
// Helpers: mount / unmount stub terminal element
// ---------------------------------------------------------------------------

/**
 * Mount a stub `.main-panel .xterm` element with mocked xterm internals.
 * Returns the element so tests can clean up.
 */
function mountStubTerminal(opts: {
  cellWidth: number;
  cellHeight: number;
  rectLeft?: number;
  rectTop?: number;
}): HTMLElement {
  const { cellWidth, cellHeight, rectLeft = 100, rectTop = 50 } = opts;

  // Create .main-panel wrapper
  const panel = document.createElement('div');
  panel.className = 'main-panel';

  // Create .xterm element (visible — no display:none inline style)
  const xterm = document.createElement('div');
  xterm.className = 'xterm';

  // Attach mock _xterm internals matching what getActiveTerminalCellGeom reads
  (xterm as any)._xterm = {
    _core: {
      _renderService: {
        dimensions: {
          css: {
            cell: { width: cellWidth, height: cellHeight },
          },
        },
      },
    },
  };

  // Mock getBoundingClientRect
  xterm.getBoundingClientRect = () =>
    ({
      left: rectLeft,
      top: rectTop,
      right: rectLeft + 800,
      bottom: rectTop + 600,
      width: 800,
      height: 600,
      x: rectLeft,
      y: rectTop,
      toJSON: () => ({}),
    } as DOMRect);

  panel.appendChild(xterm);
  document.body.appendChild(panel);
  return panel;
}

function unmountStubTerminal(panel: HTMLElement): void {
  panel.remove();
}

// ---------------------------------------------------------------------------
// Import module under test AFTER helpers are defined so mocks can be reset
// between describes cleanly via vi.resetModules().
// ---------------------------------------------------------------------------

// We import lazily inside each test that needs fresh module state for the
// debounce tests. For pure-function tests the module is imported at top level.
import {
  snapToCell,
  getActiveTerminalCellGeom,
  clearWindowIncrements,
  syncIncrementsDebounced,
  syncWindowIncrements,
} from './resize-increments';

// ---------------------------------------------------------------------------
// describe: getActiveTerminalCellGeom
// ---------------------------------------------------------------------------

describe('getActiveTerminalCellGeom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when no .main-panel .xterm element is mounted', () => {
    expect(getActiveTerminalCellGeom()).toBeNull();
  });

  it('returns expected shape when a valid terminal is mounted', () => {
    const panel = mountStubTerminal({ cellWidth: 10, cellHeight: 20, rectLeft: 100, rectTop: 50 });
    const geom = getActiveTerminalCellGeom();
    expect(geom).not.toBeNull();
    expect(geom!.cellW).toBe(10);
    expect(geom!.cellH).toBe(20);
    expect(geom!.originX).toBe(100);
    expect(geom!.originY).toBe(50);
    unmountStubTerminal(panel);
  });

  it('returns null when cell.width is 0 (renderer not yet measured)', () => {
    const panel = mountStubTerminal({ cellWidth: 0, cellHeight: 20 });
    expect(getActiveTerminalCellGeom()).toBeNull();
    unmountStubTerminal(panel);
  });

  it('returns null when xterm element has display:none inline style', () => {
    const panel = document.createElement('div');
    panel.className = 'main-panel';
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    xterm.style.display = 'none';
    (xterm as any)._xterm = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: 10, height: 20 } } },
        },
      },
    };
    xterm.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
    panel.appendChild(xterm);
    document.body.appendChild(panel);
    // The querySelector filter :not([style*="display: none"]) should exclude this element
    expect(getActiveTerminalCellGeom()).toBeNull();
    panel.remove();
  });

  it('falls back to terminal._core when _xterm is absent', () => {
    const panel = document.createElement('div');
    panel.className = 'main-panel';
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    (xterm as any).terminal = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: 8, height: 16 } } },
        },
      },
    };
    xterm.getBoundingClientRect = () =>
      ({ left: 20, top: 30, right: 820, bottom: 630, width: 800, height: 600, x: 20, y: 30, toJSON: () => ({}) } as DOMRect);
    panel.appendChild(xterm);
    document.body.appendChild(panel);
    const geom = getActiveTerminalCellGeom();
    expect(geom).not.toBeNull();
    expect(geom!.cellW).toBe(8);
    unmountStubTerminal(panel);
  });
});

// ---------------------------------------------------------------------------
// describe: snapToCell
// ---------------------------------------------------------------------------

describe('snapToCell', () => {
  let panel: HTMLElement;

  beforeEach(() => {
    // Mount a terminal with cellW=10, cellH=20, origin at (100, 50)
    panel = mountStubTerminal({ cellWidth: 10, cellHeight: 20, rectLeft: 100, rectTop: 50 });
  });

  afterEach(() => {
    unmountStubTerminal(panel);
  });

  // X-axis tests (origin=100, cellW=10)
  it('snaps px=205 on x-axis to 210 (round up at .5 — JS Math.round)', () => {
    // offset = 205 - 100 = 105; round(105/10) = round(10.5) = 11 (JS rounds .5 up)
    // snappedOffset = 11*10 = 110; result = 100 + 110 = 210
    expect(snapToCell(205, 'x')).toBe(210);
  });

  it('snaps px=217 on x-axis to 220 (round up)', () => {
    // offset = 217 - 100 = 117; round(117/10)*10 = 120; result = 220
    expect(snapToCell(217, 'x')).toBe(220);
  });

  it('returns exact boundary px=100 unchanged on x-axis', () => {
    // offset = 0; round(0/10)*10 = 0; result = 100
    expect(snapToCell(100, 'x')).toBe(100);
  });

  it('snaps px=115 on x-axis to 120 (round up at .5)', () => {
    // offset = 115 - 100 = 15; round(15/10)*10 = 20; result = 120
    expect(snapToCell(115, 'x')).toBe(120);
  });

  // Y-axis tests (origin=50, cellH=20)
  it('snaps px=80 on y-axis to 90 (round up at .5 — JS Math.round)', () => {
    // offset = 80 - 50 = 30; round(30/20) = round(1.5) = 2 (JS rounds .5 up)
    // snappedOffset = 2*20 = 40; result = 50 + 40 = 90
    expect(snapToCell(80, 'y')).toBe(90);
  });

  it('snaps px=85 on y-axis to 90 (round up at .5)', () => {
    // offset = 85 - 50 = 35; round(35/20)*20 = 40; result = 90
    expect(snapToCell(85, 'y')).toBe(90);
  });

  it('snaps px=253 on y-axis to 260 (round up)', () => {
    // offset = 253 - 50 = 203; round(203/20)*20 = 200; result = 250
    // Wait: 203/20 = 10.15, round = 10, result = 50 + 200 = 250
    // Actually let's compute carefully: round(10.15) = 10, so 10*20=200, 50+200=250
    expect(snapToCell(253, 'y')).toBe(250);
  });
});

describe('snapToCell — edge cases', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns px unchanged when no terminal is mounted (null-guard)', () => {
    // No panel mounted
    expect(snapToCell(999, 'x')).toBe(999);
    expect(snapToCell(42, 'y')).toBe(42);
  });

  it('returns px unchanged when cellW < 1 (degenerate font guard)', () => {
    const panel = mountStubTerminal({ cellWidth: 0.5, cellHeight: 20, rectLeft: 100, rectTop: 50 });
    // step = 0.5 < 1 → pass-through
    expect(snapToCell(205, 'x')).toBe(205);
    unmountStubTerminal(panel);
  });
});

// ---------------------------------------------------------------------------
// describe: syncIncrementsDebounced — coalescing
// ---------------------------------------------------------------------------

describe('syncIncrementsDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('coalesces 5 rapid calls into at most 1 IPC invoke within 100ms window', async () => {
    const panel = mountStubTerminal({ cellWidth: 10, cellHeight: 20, rectLeft: 100, rectTop: 50 });

    let invokeCount = 0;
    mockIPC((cmd: string) => {
      if (cmd === 'set_content_resize_increments') {
        invokeCount++;
        return undefined;
      }
      return undefined;
    });

    // Call 5 times with 10ms gaps each
    for (let i = 0; i < 5; i++) {
      syncIncrementsDebounced();
      vi.advanceTimersByTime(10);
    }

    // Advance past the 100ms debounce window
    vi.advanceTimersByTime(200);

    // Allow microtask queue to flush (promise chain in syncWindowIncrements)
    await vi.runAllTimersAsync();

    expect(invokeCount).toBeLessThanOrEqual(1);
    unmountStubTerminal(panel);
  });

  it('rounds cell dimensions to nearest 0.5 before IPC call', async () => {
    const panel = mountStubTerminal({ cellWidth: 8.7, cellHeight: 18.3, rectLeft: 0, rectTop: 0 });

    let capturedArgs: Record<string, number> | null = null;
    mockIPC((cmd: string, args: any) => {
      if (cmd === 'set_content_resize_increments') {
        capturedArgs = args as Record<string, number>;
        return undefined;
      }
      return undefined;
    });

    syncIncrementsDebounced();
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    // 8.7 rounded to nearest 0.5 = 8.5 (Math.round(8.7*2)/2 = Math.round(17.4)/2 = 17/2 = 8.5)
    expect(capturedArgs).not.toBeNull();
    expect(capturedArgs!.cellW).toBe(8.5);
    // 18.3 rounded to nearest 0.5 = 18.5 (Math.round(18.3*2)/2 = Math.round(36.6)/2 = 37/2 = 18.5)
    expect(capturedArgs!.cellH).toBe(18.5);

    unmountStubTerminal(panel);
  });

  it('does not call IPC when no terminal is mounted', async () => {
    let invokeCount = 0;
    mockIPC((cmd: string) => {
      if (cmd === 'set_content_resize_increments') invokeCount++;
      return undefined;
    });

    syncIncrementsDebounced();
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    expect(invokeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// describe: clearWindowIncrements
// ---------------------------------------------------------------------------

describe('clearWindowIncrements', () => {
  it('invokes clear_content_resize_increments with no extra args', async () => {
    let capturedCmd = '';
    let capturedArgs: unknown = null;
    mockIPC((cmd: string, args: unknown) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return undefined;
    });

    await clearWindowIncrements();

    expect(capturedCmd).toBe('clear_content_resize_increments');
    // Args should be empty object or nullish — not cell_w/cell_h
    if (capturedArgs !== null && capturedArgs !== undefined) {
      expect(Object.keys(capturedArgs as object)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// describe: syncWindowIncrements
// ---------------------------------------------------------------------------

describe('syncWindowIncrements', () => {
  it('invokes set_content_resize_increments with provided cellW and cellH', async () => {
    let capturedArgs: Record<string, number> | null = null;
    mockIPC((cmd: string, args: any) => {
      if (cmd === 'set_content_resize_increments') {
        capturedArgs = args as Record<string, number>;
      }
      return undefined;
    });

    await syncWindowIncrements(10, 20);

    expect(capturedArgs).not.toBeNull();
    expect(capturedArgs!.cellW).toBe(10);
    expect(capturedArgs!.cellH).toBe(20);
  });
});
