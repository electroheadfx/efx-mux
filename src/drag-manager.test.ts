// drag-manager.test.ts — Phase 22 Plan 04: intra-zone resize handle tests
//
// Tests:
//   - intra-zone handle registers and persists ratio
//   - re-init is idempotent (calling attachIntraZoneHandles twice does not add duplicate listeners)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import * as dragManager from './drag-manager';
import { loadAppState } from './state-manager';

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

describe('Phase quick-260419-l4c: snap-to-cell quantization', () => {
  // Note: existing tests above mount terminals WITHOUT _xterm._core, so snapToCell
  // returns px unchanged (pass-through) in those tests — their assertions remain valid.
  // These new tests explicitly mount a stub terminal so snapToCell quantizes.

  function setupSnapDOM() {
    // initDragManager() early-returns when document.getElementById('app') is null.
    // Wrap everything in #app so initDragManager() proceeds.
    document.body.innerHTML = `
      <div id="app">
        <div class="main-panel" style="height: 400px; display: flex; flex-direction: column; position: relative; top: 0; left: 0;">
          <div class="sub-scope-pane" data-subscope="main-0" style="flex: 1; height: 200px;"></div>
          <div class="split-handle-h-intra" data-handle="main-intra-0" style="height: 4px;"></div>
          <div class="sub-scope-pane" data-subscope="main-1" style="flex: 1; height: 200px;"></div>
          <div class="split-handle-v" data-handle="sidebar-main"></div>
        </div>
      </div>
    `;
    // Mount a stub .xterm inside .main-panel so snapToCell can read cell geometry.
    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    // Cell geometry: cellW=10, cellH=20, origin at (40, 100)
    (xterm as any)._xterm = {
      _core: {
        _renderService: {
          dimensions: {
            css: { cell: { width: 10, height: 20 } },
          },
        },
      },
    };
    xterm.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 100,
        right: 840,
        bottom: 700,
        width: 800,
        height: 600,
        x: 40,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);
    panel.appendChild(xterm);
  }

  beforeEach(() => {
    setupSnapDOM();
    mockIPC((cmd: string) => {
      if (cmd === 'load_state') return MOCK_STATE;
      if (cmd === 'save_state') return undefined;
      if (cmd === 'set_content_resize_increments') return undefined;
      if (cmd === 'clear_content_resize_increments') return undefined;
      return undefined;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.querySelectorAll('[data-handle]').forEach(el => {
      delete (el as HTMLElement).dataset.dragInit;
    });
  });

  it('sidebar-main onDrag quantizes --sidebar-w to cellW multiples relative to pane origin', () => {
    // origin=40, cellW=10
    // clientX=205 → snapToCell(205,'x') = 40 + round((205-40)/10)*10 = 40 + round(16.5)*10 = 40 + 170 = 210
    // The sidebar handle's onDrag then clamps(40, 400, 210) = 210 and sets --sidebar-w: "210px"
    dragManager.initDragManager();
    const handle = document.querySelector<HTMLElement>('[data-handle="sidebar-main"]')!;

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 205 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 205 }));

    const sidebarW = document.documentElement.style.getPropertyValue('--sidebar-w');
    // The snapped value 210 is cell-aligned (offset 170 = 17 cells × 10px)
    expect(sidebarW).toBe('210px');
  });

  it('intra-zone onDrag snaps clientY to cellH before height math', () => {
    // origin=100, cellH=20
    // clientY=253 → snapToCell(253,'y') = 100 + round((253-100)/20)*20 = 100 + round(7.65)*20 = 100 + 160 = 260
    // Verify that pane heights are computed from snapped=260, not raw 253.
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

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 253 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 253 }));

    // With snapped clientY=260: pct = (260-0)/400 = 65%, clamped = 65%
    // newPane0Px = 0.65 * 400 = 260px
    const final0 = parseFloat(pane0.style.height || '0');
    // Should be 260px (from snapped=260), not ~252.5px (from raw=253)
    expect(final0).toBeCloseTo(260, 0);
  });
});
