// sub-scope-pane.quant.test.tsx
// Phase-22 follow-up (quick 260419-k1n) Task 3: initial mount quantization.
// Tests J and K — verify that SubScopePane's useEffect quantizes the pane
// height on mount when the scope has an active terminal.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { getCellMetricsForScope } from '../terminal/cell-metrics';
import { mockIPC } from '@tauri-apps/api/mocks';
import { loadAppState } from '../state-manager';
import { getTerminalScope } from './terminal-tabs';
import { __resetActiveSubScopesForTesting } from './sub-scope-pane';

// Module-level mock so SubScopePane imports the mocked getCellMetricsForScope.
vi.mock('../terminal/cell-metrics', () => ({
  getCellMetricsForScope: vi.fn(),
  snapDown: (value: number, step: number, min = 0) => {
    if (step <= 0) return value;
    const snapped = Math.floor(value / step) * step;
    return Math.max(min, snapped);
  },
  isTerminalScopeActive: vi.fn().mockReturnValue(false),
  readCellMetrics: vi.fn(),
}));

// Import after mocks are set up
const { SubScopePane } = await import('./sub-scope-pane');

const MOCK_STATE = {
  version: 1,
  layout: {},
  theme: { mode: 'dark' },
  session: {},
  project: { active: null, projects: [] },
  panels: {},
};

describe('SubScopePane mount quantization (quick 260419-k1n)', () => {
  let rafCallbacks: Array<FrameRequestCallback> = [];
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;

  beforeEach(async () => {
    rafCallbacks = [];
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;

    vi.mocked(getCellMetricsForScope).mockReset();

    __resetActiveSubScopesForTesting();
    for (const s of ['main-0', 'main-1', 'main-2', 'right-0', 'right-1', 'right-2'] as const) {
      getTerminalScope(s).tabs.value = [];
      getTerminalScope(s).activeTabId.value = '';
    }

    mockIPC((cmd) => {
      if (cmd === 'load_state') return MOCK_STATE;
      if (cmd === 'save_state') return undefined;
      return undefined;
    });
    await loadAppState();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    rafCallbacks = [];
    vi.mocked(getCellMetricsForScope).mockReset();
  });

  function flushRAFs(count = 2): void {
    for (let i = 0; i < count; i++) {
      const batch = rafCallbacks.splice(0);
      for (const cb of batch) cb(performance.now());
    }
  }

  it('Test J: mount snaps pane height when scope has active terminal', () => {
    vi.mocked(getCellMetricsForScope).mockReturnValue({ cellWidth: 9, cellHeight: 18 });

    const { container } = render(<SubScopePane scope="main-0" zone="main" />);

    const paneEl = container.querySelector<HTMLElement>('.sub-scope-pane[data-subscope="main-0"]')!;
    expect(paneEl).not.toBeNull();

    // Set offsetHeight so snap math works: 217 → floor(217/18)*18 = 216
    Object.defineProperty(paneEl, 'offsetHeight', { configurable: true, value: 217 });

    // Flush 2 RAFs to simulate double-RAF effect
    flushRAFs(2);

    expect(paneEl.style.height).toBe('216px');
    expect(paneEl.style.flex).toMatch(/^(none|0 0 auto)$/);
  });

  it('Test K: mount is a no-op for mixed-content pane (getCellMetricsForScope returns null)', () => {
    vi.mocked(getCellMetricsForScope).mockReturnValue(null);

    const { container } = render(<SubScopePane scope="main-0" zone="main" />);

    const paneEl = container.querySelector<HTMLElement>('.sub-scope-pane[data-subscope="main-0"]')!;
    expect(paneEl).not.toBeNull();

    Object.defineProperty(paneEl, 'offsetHeight', { configurable: true, value: 217 });

    flushRAFs(2);

    // No inline height set — mixed-content guard skipped snap
    expect(paneEl.style.height).toBe('');
  });
});
