import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_WIDTH, columnTops, packPanels } from '../canvas';

/**
 * Packing is where the canvas is most likely to be quietly wrong: the result
 * still renders, it just renders badly, and a screenshot of the top of the
 * desk looks fine while everything else is a thousand pixels below the fold.
 */

const H = (heights: Record<string, number>) => heights;

describe('packPanels', () => {
  it('fills columns left to right before wrapping', () => {
    const places = packPanels(['a', 'b', 'c'], H({ a: 200, b: 200, c: 200 }), 3);
    expect(places.a?.x).toBeLessThan(places.b?.x ?? 0);
    expect(places.b?.x).toBeLessThan(places.c?.x ?? 0);
    // Same row, so the same y
    expect(places.a?.y).toBe(places.b?.y);
    expect(places.b?.y).toBe(places.c?.y);
  });

  it('sends the next panel to the shortest column, not the next one along', () => {
    const places = packPanels(
      ['tall', 'short', 'next'],
      H({ tall: 800, short: 100, next: 100 }),
      2,
    );
    // 'next' belongs under 'short', which ended far higher than 'tall'
    expect(places.next?.x).toBe(places.short?.x);
    expect(places.next?.y).toBeGreaterThan(places.short?.y ?? 0);
  });

  it('gives every panel the default width', () => {
    const places = packPanels(['a', 'b'], H({ a: 100, b: 100 }), 2);
    expect(places.a?.w).toBe(DEFAULT_PANEL_WIDTH);
    expect(places.b?.w).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('still places a panel whose height has not been reported', () => {
    const places = packPanels(['a', 'b'], H({}), 1);
    expect(places.a?.y).toBeLessThan(places.b?.y ?? 0);
  });

  it('collapses to a single column when only one fits', () => {
    const places = packPanels(['a', 'b', 'c'], H({ a: 100, b: 100, c: 100 }), 1);
    expect(new Set([places.a?.x, places.b?.x, places.c?.x]).size).toBe(1);
  });
});

describe('columnTops', () => {
  it('reports where each column already ends', () => {
    const placed = {
      a: { x: 32, y: 32, w: DEFAULT_PANEL_WIDTH },
      b: { x: 32 + DEFAULT_PANEL_WIDTH + 28, y: 32, w: DEFAULT_PANEL_WIDTH },
    };
    const tops = columnTops(placed, H({ a: 500, b: 100 }), 2);
    expect(tops[0]).toBeGreaterThan(tops[1] ?? 0);
  });

  it('ignores a panel dragged outside the columns rather than mis-crediting one', () => {
    const placed = { stray: { x: 9000, y: 40, w: DEFAULT_PANEL_WIDTH } };
    expect(columnTops(placed, H({ stray: 300 }), 2)).toEqual([32, 32]);
  });

  /**
   * The bug this file exists for. Heights arrive one panel at a time, so
   * placement runs once per arrival. Packing each arrival against the current
   * column tops has to interleave them; an earlier version started every
   * batch below everything already placed, and twenty-five panels became one
   * six-thousand-pixel column.
   */
  it('interleaves panels arriving one at a time instead of stacking them', () => {
    const heights = H({ a: 200, b: 200, c: 200, d: 200 });
    let placed: Record<string, { x: number; y: number; w: number }> = {};
    for (const id of ['a', 'b', 'c', 'd']) {
      const packed = packPanels(
        [id],
        heights,
        2,
        DEFAULT_PANEL_WIDTH,
        columnTops(placed, heights, 2),
      );
      placed = { ...placed, ...packed };
    }
    // Two columns, two rows — not four rows
    expect(new Set(Object.values(placed).map((p) => p.x)).size).toBe(2);
    const lowest = Math.max(...Object.values(placed).map((p) => p.y));
    expect(lowest).toBeLessThan(600);
  });
});
