// cell-metrics.test.ts — unit tests for readCellMetrics + snapDown
//
// Phase-22 follow-up (quick 260419-k1n): these tests exercise only the pure
// helper functions. getCellMetricsForScope + isTerminalScopeActive are
// integration concerns tested at their call sites (drag-manager.test.ts and
// resize-handler.test.ts). No inline mocks for getTerminalScope here.

import { describe, it, expect } from 'vitest';
import { readCellMetrics, snapDown } from './cell-metrics';

describe('readCellMetrics', () => {
  it('returns null for an object with no _core', () => {
    const mockTerminal = {} as any;
    expect(readCellMetrics(mockTerminal)).toBeNull();
  });

  it('returns null when _core exists but _renderService is missing', () => {
    const mockTerminal = { _core: {} } as any;
    expect(readCellMetrics(mockTerminal)).toBeNull();
  });

  it('returns null when cell.width is 0', () => {
    const mockTerminal = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: 0, height: 18 } } },
        },
      },
    } as any;
    expect(readCellMetrics(mockTerminal)).toBeNull();
  });

  it('returns null when cell.height is 0', () => {
    const mockTerminal = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: 9, height: 0 } } },
        },
      },
    } as any;
    expect(readCellMetrics(mockTerminal)).toBeNull();
  });

  it('returns null when cell dimensions are NaN', () => {
    const mockTerminal = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: NaN, height: NaN } } },
        },
      },
    } as any;
    expect(readCellMetrics(mockTerminal)).toBeNull();
  });

  it('returns { cellWidth, cellHeight } when all internals are present and valid', () => {
    const mockTerminal = {
      _core: {
        _renderService: {
          dimensions: { css: { cell: { width: 9.5, height: 18 } } },
        },
      },
    } as any;
    const result = readCellMetrics(mockTerminal);
    expect(result).not.toBeNull();
    expect(result!.cellWidth).toBe(9.5);
    expect(result!.cellHeight).toBe(18);
  });
});

describe('snapDown', () => {
  it('snaps down to nearest multiple of step', () => {
    // 57 / 18 = 3.16... → floor = 3 → 3 * 18 = 54
    expect(snapDown(57, 18)).toBe(54);
  });

  it('returns exact multiple when value is already aligned', () => {
    expect(snapDown(54, 18)).toBe(54);
  });

  it('respects the min floor when snapped value would be below min', () => {
    // floor(20/18)*18 = 18, but min=48 wins
    expect(snapDown(20, 18, 48)).toBe(48);
  });

  it('respects the min floor even when snapped value is 0', () => {
    // floor(10/18)*18 = 0, min=48 wins
    expect(snapDown(10, 18, 48)).toBe(48);
  });

  it('is a no-op (returns value) when step is 0 (defensive)', () => {
    expect(snapDown(10, 0)).toBe(10);
  });

  it('is a no-op when step is negative (defensive)', () => {
    expect(snapDown(57, -5)).toBe(57);
  });

  it('returns min when value is less than min and step > 0', () => {
    expect(snapDown(20, 18, 48)).toBe(48);
  });
});
