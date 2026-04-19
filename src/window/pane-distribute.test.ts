import { describe, it, expect } from 'vitest';
import { computeTargetRows } from './pane-distribute';

describe('computeTargetRows — pure math', () => {
  it('single pane: returns [totalCells] regardless of weights', () => {
    expect(computeTargetRows(40, [10], 1)).toEqual([40]);
    expect(computeTargetRows(1, [99999], 1)).toEqual([1]);
  });

  it('two panes, even weights: splits evenly with drift on last', () => {
    expect(computeTargetRows(40, [10, 10], 2)).toEqual([20, 20]);
    expect(computeTargetRows(41, [10, 10], 2)).toEqual([20, 21]); // drift on last
  });

  it('two panes, weight 3:1 → 30:10 of 40', () => {
    expect(computeTargetRows(40, [300, 100], 2)).toEqual([30, 10]);
  });

  it('two panes, weight 1:3 → 10:30 of 40', () => {
    expect(computeTargetRows(40, [100, 300], 2)).toEqual([10, 30]);
  });

  it('three panes, equal weights, totalCells=12 → [4,4,4]', () => {
    expect(computeTargetRows(12, [1, 1, 1], 3)).toEqual([4, 4, 4]);
  });

  it('three panes, equal weights, totalCells=13 → drift to last [4,4,5]', () => {
    expect(computeTargetRows(13, [1, 1, 1], 3)).toEqual([4, 4, 5]);
  });

  it('min-1 clamp: small pane gets 1 even if weight share would round to 0', () => {
    // weights = [1000, 1], totalCells = 10 → naive round = [10, 0] → clamp [10, 1] → drift = -1 → pull from biggest → [9, 1]
    const r = computeTargetRows(10, [1000, 1], 2);
    expect(r).toEqual([9, 1]);
  });

  it('returns null when totalCells < termCount', () => {
    expect(computeTargetRows(2, [1, 1, 1], 3)).toBeNull();
  });

  it('returns null on non-finite totalCells', () => {
    expect(computeTargetRows(NaN, [1, 1], 2)).toBeNull();
    expect(computeTargetRows(Infinity, [1, 1], 2)).toBeNull();
  });

  it('returns null on mismatched weights length', () => {
    expect(computeTargetRows(10, [1, 1, 1], 2)).toBeNull();
  });

  it('returns null on zero or negative weight', () => {
    expect(computeTargetRows(10, [0, 1], 2)).toBeNull();
    expect(computeTargetRows(10, [-1, 1], 2)).toBeNull();
  });

  it('deterministic: same inputs produce same output across calls', () => {
    const a = computeTargetRows(37, [123, 456, 789], 3);
    const b = computeTargetRows(37, [123, 456, 789], 3);
    expect(a).toEqual(b);
  });

  it('post-condition: all outputs are integers ≥ 1 and sum to totalCells', () => {
    const cases: Array<[number, number[], number]> = [
      [100, [1, 2, 3], 3],
      [50, [5, 7], 2],
      [40, [10, 10, 10, 10], 4],
    ];
    for (const [tc, w, n] of cases) {
      const r = computeTargetRows(tc, w, n);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(r.length).toBe(n);
      expect(r.every(x => Number.isInteger(x) && x >= 1)).toBe(true);
      expect(r.reduce((a, b) => a + b, 0)).toBe(tc);
    }
  });
});
