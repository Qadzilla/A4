/**
 * Alignment while dragging.
 *
 * Ported from A4's canvas, where it did more work than anything else to make
 * an arrangement look arranged. It matters more here: these panels are
 * uniform-width rectangles that obviously *want* to line up, and the gap
 * between a desk and a pile is mostly whether edges agree.
 *
 * Two kinds of help. Alignment matches a dragged panel's edges and centres
 * against every other panel. Spacing notices when a panel is nearly the same
 * distance from a neighbour as two other panels are from each other, and
 * closes that gap exactly — so a row ends up evenly spaced rather than merely
 * aligned.
 */

/** How close an edge has to be, in desk pixels, before it snaps. */
export const SNAP_THRESHOLD = 6;

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A line to draw while dragging, in desk coordinates. */
export interface Guide {
  axis: 'x' | 'y';
  /** Where the line sits on its axis. */
  at: number;
  /** How far it runs along the other axis. */
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** The three positions on each axis worth matching: both edges and the centre. */
function edges(box: Box, axis: 'x' | 'y'): number[] {
  return axis === 'x'
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height];
}

function span(box: Box, axis: 'x' | 'y'): [number, number] {
  return axis === 'x' ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
}

/**
 * Match the dragged box's edges and centres against every other box.
 *
 * Returns the smallest correction on each axis, plus a guide for each line
 * that ended up matching, running between the two boxes it connects.
 */
export function computeAlignment(dragged: Box, others: Box[]): SnapResult {
  const result: SnapResult = { dx: 0, dy: 0, guides: [] };

  for (const axis of ['x', 'y'] as const) {
    let best = Number.POSITIVE_INFINITY;
    let delta = 0;
    let at = 0;
    let partner: Box | null = null;

    for (const other of others) {
      for (const mine of edges(dragged, axis)) {
        for (const theirs of edges(other, axis)) {
          const distance = Math.abs(theirs - mine);
          if (distance <= SNAP_THRESHOLD && distance < best) {
            best = distance;
            delta = theirs - mine;
            at = theirs;
            partner = other;
          }
        }
      }
    }

    if (!partner) continue;
    if (axis === 'x') result.dx = delta;
    else result.dy = delta;

    // Run the guide across both boxes, so it reads as a relationship between
    // them rather than a line floating in space.
    const [a1, a2] = span(dragged, axis);
    const [b1, b2] = span(partner, axis);
    result.guides.push({
      axis,
      at,
      from: Math.min(a1, b1),
      to: Math.max(a2, b2),
    });
  }

  return result;
}

/**
 * Match the gap on one side of the dragged box to a gap that already exists
 * between two other boxes on the same axis.
 *
 * Only considers boxes that overlap on the perpendicular axis, since a panel
 * two columns away and four hundred pixels down isn't part of the same row.
 */
export function computeSpacing(dragged: Box, others: Box[]): SnapResult {
  const result: SnapResult = { dx: 0, dy: 0, guides: [] };

  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    const [myStart, myEnd] = span(dragged, axis);

    const row = others
      .filter((o) => {
        const [start, end] = span(o, axis);
        return start < myEnd && end > myStart;
      })
      .sort((a, b) => a[axis] - b[axis]);
    if (row.length < 2) continue;

    // The gaps already established between neighbours in this row.
    const known = new Set<number>();
    for (let i = 0; i < row.length - 1; i++) {
      const left = row[i];
      const right = row[i + 1];
      if (!left || !right) continue;
      const gap = right[axis] - (left[axis] + left[size]);
      if (gap > 0) known.add(Math.round(gap));
    }
    if (known.size === 0) continue;

    let best = Number.POSITIVE_INFINITY;
    let delta = 0;

    for (const neighbour of row) {
      const before = neighbour[axis] - (dragged[axis] + dragged[size]);
      const after = dragged[axis] - (neighbour[axis] + neighbour[size]);
      for (const gap of known) {
        for (const actual of [before, after]) {
          if (actual <= 0) continue;
          const off = actual - gap;
          if (Math.abs(off) <= SNAP_THRESHOLD && Math.abs(off) < best) {
            best = Math.abs(off);
            // Closing a gap that is too wide means moving toward the
            // neighbour, and the direction depends on which side it's on.
            delta = actual === before ? off : -off;
          }
        }
      }
    }

    if (best === Number.POSITIVE_INFINITY) continue;
    if (axis === 'x') result.dx = delta;
    else result.dy = delta;
  }

  return result;
}

/**
 * The correction to apply to a drag, and the lines to draw for it.
 *
 * Alignment wins ties: lining up with an edge is more legible than matching a
 * gap, and applying both at once would fight over the same axis.
 */
export function snap(dragged: Box, others: Box[]): SnapResult {
  const alignment = computeAlignment(dragged, others);
  const spacing = computeSpacing(dragged, others);
  return {
    dx: alignment.dx !== 0 ? alignment.dx : spacing.dx,
    dy: alignment.dy !== 0 ? alignment.dy : spacing.dy,
    guides: alignment.guides,
  };
}
