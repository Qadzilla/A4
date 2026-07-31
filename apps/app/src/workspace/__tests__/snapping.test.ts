import { describe, expect, it } from 'vitest';
import { type Box, SNAP_THRESHOLD, computeAlignment, computeSpacing, snap } from '../snapping';

const box = (id: string, x: number, y: number, width = 440, height = 200): Box => ({
  id,
  x,
  y,
  width,
  height,
});

describe('computeAlignment', () => {
  it('pulls a nearly-aligned left edge into line', () => {
    const result = computeAlignment(box('a', 34, 400), [box('b', 32, 32)]);
    expect(result.dx).toBe(-2);
  });

  it('leaves an edge alone once it is further than the threshold', () => {
    const result = computeAlignment(box('a', 32 + SNAP_THRESHOLD + 1, 400), [box('b', 32, 32)]);
    expect(result.dx).toBe(0);
  });

  it('matches centres, not only edges', () => {
    // b spans 100..300, centre 200. a is 40 wide, centre at 178 — 22 away from
    // b's left edge but only 2 from its centre.
    const result = computeAlignment(box('a', 158, 400, 40), [box('b', 100, 32, 200)]);
    expect(result.dx).toBe(2);
  });

  it('takes the closest match when several are in range', () => {
    const result = computeAlignment(box('a', 35, 400), [box('b', 32, 32), box('c', 38, 32)]);
    // 3 away from 32, 3 away from 38 — either is fine, but it must pick one
    expect(Math.abs(result.dx)).toBe(3);
  });

  it('draws a guide spanning both panels', () => {
    const result = computeAlignment(box('a', 34, 400), [box('b', 32, 32)]);
    const guide = result.guides.find((g) => g.axis === 'x');
    expect(guide).toBeDefined();
    expect(guide?.from).toBe(32);
    expect(guide?.to).toBe(600);
  });

  it('snaps both axes independently', () => {
    const result = computeAlignment(box('a', 34, 234), [box('b', 32, 32), box('c', 900, 232)]);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(-2);
  });

  it('does nothing when there is nothing to align to', () => {
    expect(computeAlignment(box('a', 34, 400), [])).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('computeSpacing', () => {
  /**
   * Three panels in a row. Two already sit 28 apart; the third is dropped 31
   * from its neighbour, which should close to 28 so the gaps match.
   */
  it('matches an existing gap between neighbours', () => {
    const a = box('a', 0, 0);
    const b = box('b', 468, 0); // 28 after a
    const dragged = box('c', 939, 0); // 31 after b
    const result = computeSpacing(dragged, [a, b]);
    expect(dragged.x + result.dx).toBe(936);
  });

  it('ignores panels that share no row', () => {
    const a = box('a', 0, 0);
    const b = box('b', 468, 0);
    // Far below both, so it is not part of that row
    const dragged = box('c', 939, 2000);
    expect(computeSpacing(dragged, [a, b]).dx).toBe(0);
  });

  it('needs at least two neighbours to know what the spacing is', () => {
    expect(computeSpacing(box('c', 939, 0), [box('a', 0, 0)]).dx).toBe(0);
  });
});

describe('snap', () => {
  it('prefers alignment over spacing when both apply', () => {
    // Aligned within 2px of a's left edge, and also near a matching gap.
    const dragged = box('c', 2, 300);
    const result = snap(dragged, [box('a', 0, 0), box('b', 468, 0)]);
    expect(result.dx).toBe(-2);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  it('falls back to spacing when nothing is aligned', () => {
    const result = snap(box('c', 939, 0), [box('a', 0, 0), box('b', 468, 0)]);
    expect(result.dx).toBe(-3);
  });

  it('returns no correction for a panel dragged into open space', () => {
    const result = snap(box('c', 5000, 5000), [box('a', 0, 0), box('b', 468, 0)]);
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
