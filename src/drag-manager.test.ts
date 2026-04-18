// drag-manager.test.ts — Phase 22 Plan 04: intra-zone resize handle tests
//
// Tests:
//   - intra-zone handle registers and persists ratio
//   - re-init is idempotent (calling attachIntraZoneHandles twice does not add duplicate listeners)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { attachIntraZoneHandles } from './drag-manager';

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
  let ipcSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupDOM();
    ipcSpy = vi.fn();
    mockIPC((cmd: string, args: any) => {
      if (cmd === 'load_state') return MOCK_STATE;
      if (cmd === 'save_state') { ipcSpy(args); return undefined; }
      return undefined;
    });
  });

  afterEach(() => {
    // Clean up dataset flags between tests
    document.querySelectorAll('[data-handle]').forEach(el => {
      delete (el as HTMLElement).dataset.dragInit;
    });
  });

  it('intra-zone handle registers and persists ratio', () => {
    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    expect(handle.dataset.dragInit).toBeUndefined();

    attachIntraZoneHandles('main');

    // Should be marked as initialized
    expect(handle.dataset.dragInit).toBe('true');

    // Simulate a drag: mousedown on handle, move, mouseup
    const panel = document.querySelector<HTMLElement>('.main-panel')!;
    const panelRect = { top: 0, height: 300 } as DOMRect;

    // Mock getBoundingClientRect for the panel
    const origGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      if (this === panel) return panelRect as DOMRect;
      return { top: 0, height: 300 } as DOMRect;
    } as any;

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 150 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 150 }));

    Element.prototype.getBoundingClientRect = origGetBCR;

    // Expect save_state called with main-split-0-pct in layout
    expect(ipcSpy).toHaveBeenCalled();
    const lastCall = ipcSpy.mock.calls.at(-1) as any[];
    const stateJson = lastCall?.[0]?.stateJson;
    expect(stateJson).toBeDefined();
    const parsed = JSON.parse(stateJson);
    expect(parsed.layout['main-split-0-pct']).toMatch(/^\d+(\.\d+)?%$/);
  });

  it('re-init is idempotent — calling attachIntraZoneHandles twice does not error', () => {
    attachIntraZoneHandles('main');
    attachIntraZoneHandles('main'); // second call — should be no-op (dataset.dragInit gate)

    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    expect(handle.dataset.dragInit).toBe('true');
    // No error should have been thrown
  });

  it('skips handles already marked dragInit', () => {
    const handle = document.querySelector<HTMLElement>('[data-handle="main-intra-0"]')!;
    handle.dataset.dragInit = 'true';

    // Patch makeDragH to track if it was called
    let makeDragHCalled = false;
    const origMakeDragH = (require('./drag-manager') as any).makeDragH;
    vi.spyOn(require('./drag-manager'), 'makeDragH').mockImplementation(function(this: any, ...args: any[]) {
      makeDragHCalled = true;
      return origMakeDragH.apply(this, args);
    });

    attachIntraZoneHandles('main');
    expect(makeDragHCalled).toBe(false); // Already initialized, should be skipped
  });
});
