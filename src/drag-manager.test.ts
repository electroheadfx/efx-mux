// drag-manager.test.ts — Phase 22 Plan 04: intra-zone resize handle tests
//
// Tests:
//   - intra-zone handle registers and persists ratio
//   - re-init is idempotent (calling attachIntraZoneHandles twice does not add duplicate listeners)
//   - quantized intra-zone drag (quick 260419-k1n Task 2)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import * as dragManager from './drag-manager';
import { loadAppState } from './state-manager';
import { getCellMetricsForScope } from './terminal/cell-metrics';

// Module-level mock so drag-manager imports the mocked getCellMetricsForScope.
vi.mock('./terminal/cell-metrics', () => ({
  getCellMetricsForScope: vi.fn(),
  snapDown: (value: number, step: number, min = 0) => {
    if (step <= 0) return value;
    const snapped = Math.floor(value / step) * step;
    return Math.max(min, snapped);
  },
  isTerminalScopeActive: vi.fn().mockReturnValue(true),
  readCellMetrics: vi.fn(),
}));

function setupDOM() {
  document.body.innerHTML = `
    <div class="main-panel" style="height: 300px; position: relative; top: 0;">
      <div class="sub-scope-pane" data-subscope="main-0" style="height: 100%;"></div>
      <div data-handle="main-intra-0" style="height: 8px; position: relative; top: 0;"></div>
      <div class="sub-scope-pane" data-subscope="main-1" style="height: 100%;"></div>
    </div>
  `;
}

const MOCK_STATE = {
  version: 1,
  layout: {},
  theme: { mode: 'dark' },
  session: {},
  project: { active: null, projects: [] },
  panels: {},
};

describe('Phase 22: intra-zone handles', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ipcSpy: any;

  beforeEach(() => {
    setupDOM();
    ipcSpy = vi.fn();
    mockIPC((cmd: string, _args: any) => {
      if (cmd === 'load_state') return MOCK_STATE;
      if (cmd === 'save_state') { ipcSpy(_args); return undefined; }
      return undefined;
    });
  });

  afterEach(() => {
    // Clean up dataset flags between tests
    document.querySelectorAll('[data-handle]').forEach(el => {
      delete (el as HTMLElement).dataset.dragInit;
    });
  });

  it('intra-zone handle registers and persists ratio', async () => {
    await loadAppState(); // Initialize currentState in state-manager

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    expect(handle.dataset.dragInit).toBeUndefined();

    dragManager.attachIntraZoneHandles('main');

    // Should be marked as initialized
    expect(handle.dataset.dragInit).toBe('true');

    // Simulate a drag: mousedown on handle, move, mouseup
    // Mock getBoundingClientRect for the panel
    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    const origGetBCR = Element.prototype.getBoundingClientRect;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 300 } as DOMRect),
    });

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 150 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 150 }));

    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: origGetBCR,
    });

    // Expect save_state called with main-split-0-pct in layout
    expect(ipcSpy).toHaveBeenCalled();
    const calls = ipcSpy.mock.calls;
    const lastCall = calls[calls.length - 1] as any[];
    const stateJson = lastCall?.[0]?.stateJson;
    expect(stateJson).toBeDefined();
    const parsed = JSON.parse(stateJson);
    expect(parsed.layout['main-split-0-pct']).toMatch(/^\d+(\.\d+)?%$/);
  });

  it('re-init is idempotent — calling attachIntraZoneHandles twice does not error', () => {
    dragManager.attachIntraZoneHandles('main');
    dragManager.attachIntraZoneHandles('main'); // second call — should be no-op (dataset.dragInit gate)

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    expect(handle.dataset.dragInit).toBe('true');
    // No error should have been thrown
  });
});

describe('Phase 22 gap-closure (22-11): attachIntraZoneHandles fresh-handle binding (must FAIL on current code)', () => {
  beforeEach(() => {
    // DOM setup: two sub-scope panes with a fresh handle between them
    document.body.innerHTML = `
      <div class="main-panel" style="height: 400px; display: flex; flex-direction: column;">
        <div class="sub-scope-pane" data-subscope="main-0" style="flex: 1; min-height: 48px; height: 200px;"></div>
        <div class="split-handle-h-intra" data-handle="main-intra-0" style="height: 4px;"></div>
        <div class="sub-scope-pane" data-subscope="main-1" style="flex: 1; min-height: 48px; height: 200px;"></div>
      </div>
    `;
    document.documentElement.style.removeProperty('--main-split-0-pct');
    document.documentElement.style.removeProperty('--main-split-1-pct');
    mockIPC((cmd: string) => {
      if (cmd === 'load_state') return { version: 1, layout: {}, theme: { mode: 'dark' }, session: {}, project: { active: null, projects: [] }, panels: {} };
      if (cmd === 'save_state') return undefined;
      return undefined;
    });
  });

  afterEach(() => {
    document.querySelectorAll('[data-handle]').forEach(el => {
      delete (el as HTMLElement).dataset.dragInit;
    });
  });

  it('binds fresh handles AND drag changes both panes\' flex-basis by the dragged delta', () => {
    dragManager.attachIntraZoneHandles('main');
    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    expect(handle.dataset.dragInit).toBe('true');

    const pane0 = document.querySelector<HTMLElement>('[data-subscope="main-0"]')!;
    const pane1 = document.querySelector<HTMLElement>('[data-subscope="main-1"]')!;
    // Capture initial heights (jsdom returns the inline-style value)
    const initial0 = parseFloat(pane0.style.height) || 200;
    const initial1 = parseFloat(pane1.style.height) || 200;

    // Mock getBoundingClientRect for the panel so the drag math has a rect
    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 400, bottom: 400, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    });
    // Mock offsetHeight for pane0/pane1 (jsdom returns 0 by default)
    Object.defineProperty(pane0, 'offsetHeight', { configurable: true, value: 200 });
    Object.defineProperty(pane1, 'offsetHeight', { configurable: true, value: 200 });

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 300 }));

    // After Task 2: drag handler mutates pane0.style.height up + pane1.style.height down.
    const final0 = parseFloat(pane0.style.height || pane0.style.flexBasis || '0');
    const final1 = parseFloat(pane1.style.height || pane1.style.flexBasis || '0');
    // CURRENT CODE: panes have hardcoded flex:1, no inline height assignment from drag → FAIL
    // POST-TASK-2: pane0.height grows ~100px, pane1.height shrinks ~100px → PASS
    expect(final0).toBeGreaterThan(initial0 + 50); // grew by at least half the delta
    expect(final1).toBeLessThan(initial1 - 50);    // shrank by at least half the delta
  });

  it('drag flips pane.flex to "none" so the new height is actually respected', () => {
    dragManager.attachIntraZoneHandles('main');
    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    const pane0 = document.querySelector<HTMLElement>('[data-subscope="main-0"]')!;
    const pane1 = document.querySelector<HTMLElement>('[data-subscope="main-1"]')!;

    // Pre-drag: panes have a truthy flex (from inline style in beforeEach).
    // jsdom normalizes "flex: 1" to "1 1 0%", so just assert it contains "1".
    expect(pane0.style.flex).toContain('1');
    expect(pane1.style.flex).toContain('1');

    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 400, bottom: 400, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    });
    Object.defineProperty(pane0, 'offsetHeight', { configurable: true, value: 200 });
    Object.defineProperty(pane1, 'offsetHeight', { configurable: true, value: 200 });

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 250 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 250 }));

    // Post-drag (POST-TASK-2): drag handler must set flex: 'none' on both adjacent panes
    // so the explicit height actually renders. On CURRENT CODE the drag only sets the CSS var
    // and leaves the pane inline flex:1 untouched → FAIL.
    // (jsdom normalizes "flex: none" to "0 0 auto"; we check for that specific shorthand.)
    expect(pane0.style.flex).toMatch(/^(none|0 0 auto)$/);
    expect(pane1.style.flex).toMatch(/^(none|0 0 auto)$/);
    // Also verify the CSS var was written (sanity: this was already working in 22-04).
    expect(document.documentElement.style.getPropertyValue('--main-split-0-pct')).toMatch(/^\d+(\.\d+)?%$/);
  });
});

// Phase-22 follow-up (quick 260419-k1n): quantized intra-zone drag.
// Tests A, B, C for Task 2.
describe('Phase 22 quick-260419-k1n: quantized intra-zone drag', () => {
  const MOCK_STATE_QUANT = {
    version: 1,
    layout: {},
    theme: { mode: 'dark' },
    session: {},
    project: { active: null, projects: [] },
    panels: {},
  };

  function setupQuantDOM() {
    document.body.innerHTML = `
      <div class="main-panel" style="height: 400px; display: flex; flex-direction: column;">
        <div class="sub-scope-pane" data-subscope="main-0" style="flex: 1; min-height: 48px; height: 200px;"></div>
        <div class="split-handle-h-intra" data-handle="main-intra-0" style="height: 4px;"></div>
        <div class="sub-scope-pane" data-subscope="main-1" style="flex: 1; min-height: 48px; height: 200px;"></div>
      </div>
    `;
    document.documentElement.style.removeProperty('--main-split-0-pct');
  }

  beforeEach(async () => {
    setupQuantDOM();
    vi.mocked(getCellMetricsForScope).mockReset();
    mockIPC((cmd: string) => {
      if (cmd === 'load_state') return MOCK_STATE_QUANT;
      if (cmd === 'save_state') return undefined;
      return undefined;
    });
    await loadAppState();
  });

  afterEach(() => {
    document.querySelectorAll('[data-handle]').forEach(el => {
      delete (el as HTMLElement).dataset.dragInit;
    });
    vi.mocked(getCellMetricsForScope).mockReset();
  });

  it('Test A: snaps pane0 height to multiple of cellHeight when both panes have active terminals', async () => {
    // Both scopes return cell dims → snap should fire
    vi.mocked(getCellMetricsForScope).mockImplementation((scope) => {
      if (scope === 'main-0' || scope === 'main-1') {
        return { cellWidth: 9, cellHeight: 18 };
      }
      return null;
    });

    dragManager.attachIntraZoneHandles('main');

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    const pane0 = document.querySelector<HTMLElement>('[data-subscope="main-0"]')!;
    const pane1 = document.querySelector<HTMLElement>('[data-subscope="main-1"]')!;

    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 400, bottom: 400, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    });
    // Total height = 200 + 200 = 400px
    Object.defineProperty(pane0, 'offsetHeight', { configurable: true, value: 200 });
    Object.defineProperty(pane1, 'offsetHeight', { configurable: true, value: 200 });

    // Drag to 223px from top (pane0 would become 223px if unquantized)
    // panel.top=0, clientY=223 → pct = 223/400 * 100 = 55.75%
    // rawPane0Px = (55.75/100) * 400 = 223
    // snapDown(223, 18) = floor(223/18)*18 = floor(12.38)*18 = 12*18 = 216
    // finalPct = (216/400)*100 = 54.0%
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 223 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 223 }));

    expect(pane0.style.height).toBe('216px');
    expect(pane0.style.flex).toMatch(/^(none|0 0 auto)$/);
    expect(pane1.style.height).toBe('184px');

    // Persisted pct should reflect the snapped value: 216/400 = 54.0%
    // (We can't easily read the IPC call value directly but we verify via CSS var)
    // The CSS var during drag reflects onDrag (unquantized), but onEnd should write 54.0%
    // Indirectly confirmed by inline style being 216px
  });

  it('Test B: mixed-content pane skips snap — drag preserves pixel position', async () => {
    // main-1 has no active terminal (returns null) → no quantization
    vi.mocked(getCellMetricsForScope).mockImplementation((scope) => {
      if (scope === 'main-0') return { cellWidth: 9, cellHeight: 18 };
      return null; // main-1 = mixed content
    });

    dragManager.attachIntraZoneHandles('main');

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    const pane0 = document.querySelector<HTMLElement>('[data-subscope="main-0"]')!;

    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 400, bottom: 400, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    });
    Object.defineProperty(pane0, 'offsetHeight', { configurable: true, value: 200 });
    const pane1 = document.querySelector<HTMLElement>('[data-subscope="main-1"]')!;
    Object.defineProperty(pane1, 'offsetHeight', { configurable: true, value: 200 });

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 223 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 223 }));

    // onDrag sets pane0.style.height to the raw drag pixel value (223/400*400 = 223px via onDrag).
    // onEnd: mixed-content guard fires, no snap → pane0 height NOT changed by quantize path.
    // But onDrag already set it to the raw value. We verify it's NOT 216 (the snapped value).
    expect(pane0.style.height).not.toBe('216px');
  });

  it('Test C: minHeight floor wins over snap when drag is too low', async () => {
    // Both panes have active terminals
    vi.mocked(getCellMetricsForScope).mockImplementation(() => ({ cellWidth: 9, cellHeight: 18 }));

    dragManager.attachIntraZoneHandles('main');

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    const pane0 = document.querySelector<HTMLElement>('[data-subscope="main-0"]')!;
    const pane1 = document.querySelector<HTMLElement>('[data-subscope="main-1"]')!;

    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 400, bottom: 400, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    });
    Object.defineProperty(pane0, 'offsetHeight', { configurable: true, value: 200 });
    Object.defineProperty(pane1, 'offsetHeight', { configurable: true, value: 200 });

    // Drag to 30px — would give rawPane0Px = (10/100)*400 = 40 after 10% clamp
    // snapDown(40, 18, 48) = max(48, floor(40/18)*18) = max(48, 36) = 48
    // maxPane0 = 400 - 48 = 352; finalPane0 = min(48, 352) = 48
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 30 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 30 }));

    // pane0 should be at 48px (minHeight floor wins over snap of 36px)
    expect(pane0.style.height).toBe('48px');
    expect(pane1.style.height).toBe('352px');
  });
});
