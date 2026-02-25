import type { CanvasItem } from '../stores/canvas-store';

export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number; // canvas-space x (vertical) or y (horizontal)
}

export interface AlignmentResult {
  guides: AlignmentGuide[];
  snapDeltaX: number;
  snapDeltaY: number;
}

const SNAP_THRESHOLD = 5;

export function computeAlignment(dragging: CanvasItem, allItems: CanvasItem[]): AlignmentResult {
  const others = allItems.filter((i) => i.id !== dragging.id);
  if (others.length === 0) return { guides: [], snapDeltaX: 0, snapDeltaY: 0 };

  const dragLeft = dragging.x;
  const dragRight = dragging.x + dragging.width;
  const dragCenterX = dragging.x + dragging.width / 2;
  const dragTop = dragging.y;
  const dragBottom = dragging.y + dragging.height;
  const dragCenterY = dragging.y + dragging.height / 2;

  const dragXPoints = [dragLeft, dragCenterX, dragRight];
  const dragYPoints = [dragTop, dragCenterY, dragBottom];

  let bestDx = Number.POSITIVE_INFINITY;
  let bestDy = Number.POSITIVE_INFINITY;
  let snapDeltaX = 0;
  let snapDeltaY = 0;
  const verticalPositions = new Set<number>();
  const horizontalPositions = new Set<number>();

  for (const other of others) {
    const otherLeft = other.x;
    const otherRight = other.x + other.width;
    const otherCenterX = other.x + other.width / 2;
    const otherTop = other.y;
    const otherBottom = other.y + other.height;
    const otherCenterY = other.y + other.height / 2;

    const otherXPoints = [otherLeft, otherCenterX, otherRight];
    const otherYPoints = [otherTop, otherCenterY, otherBottom];

    for (const dx of dragXPoints) {
      for (const ox of otherXPoints) {
        const dist = Math.abs(dx - ox);
        if (dist <= SNAP_THRESHOLD) {
          if (dist < bestDx) {
            bestDx = dist;
            snapDeltaX = ox - dx;
            verticalPositions.clear();
            verticalPositions.add(ox);
          } else if (dist === bestDx && ox - dx === snapDeltaX) {
            verticalPositions.add(ox);
          }
        }
      }
    }

    for (const dy of dragYPoints) {
      for (const oy of otherYPoints) {
        const dist = Math.abs(dy - oy);
        if (dist <= SNAP_THRESHOLD) {
          if (dist < bestDy) {
            bestDy = dist;
            snapDeltaY = oy - dy;
            horizontalPositions.clear();
            horizontalPositions.add(oy);
          } else if (dist === bestDy && oy - dy === snapDeltaY) {
            horizontalPositions.add(oy);
          }
        }
      }
    }
  }

  const guides: AlignmentGuide[] = [];
  for (const pos of verticalPositions) {
    guides.push({ type: 'vertical', position: pos });
  }
  for (const pos of horizontalPositions) {
    guides.push({ type: 'horizontal', position: pos });
  }

  return {
    guides,
    snapDeltaX: bestDx <= SNAP_THRESHOLD ? snapDeltaX : 0,
    snapDeltaY: bestDy <= SNAP_THRESHOLD ? snapDeltaY : 0,
  };
}

export interface SpacingGuide {
  axis: 'horizontal' | 'vertical';
  from: number; // canvas-space: right edge of left item (horizontal) or bottom edge of top item (vertical)
  to: number; // canvas-space: left edge of right item (horizontal) or top edge of bottom item (vertical)
  cross: number; // canvas-space: midpoint on perpendicular axis (for positioning the indicator)
}

export interface SpacingResult {
  spacingGuides: SpacingGuide[];
  snapDeltaX: number;
  snapDeltaY: number;
}

interface GapInfo {
  gap: number;
  aRight: number; // right edge of left item (or bottom edge of top item)
  bLeft: number; // left edge of right item (or top edge of bottom item)
  aCross: number; // perpendicular center of item A
  bCross: number; // perpendicular center of item B
}

function computeSpacingAxis(
  dragging: CanvasItem,
  others: CanvasItem[],
  axis: 'x' | 'y',
): { snapDelta: number; guides: SpacingGuide[] } {
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'width' : 'height';
  const crossPos = axis === 'x' ? 'y' : 'x';
  const crossSize = axis === 'x' ? 'height' : 'width';
  const guideAxis = axis === 'x' ? 'horizontal' : 'vertical';

  // Sort others by leading edge
  const sorted = [...others].sort((a, b) => a[pos] - b[pos]);

  // Collect reference gaps between consecutive sorted items
  const refGaps: GapInfo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const aEnd = a[pos] + a[size];
    const bStart = b[pos];
    const gap = bStart - aEnd;
    if (gap > 0) {
      refGaps.push({
        gap,
        aRight: aEnd,
        bLeft: bStart,
        aCross: a[crossPos] + a[crossSize] / 2,
        bCross: b[crossPos] + b[crossSize] / 2,
      });
    }
  }

  if (refGaps.length === 0) return { snapDelta: 0, guides: [] };

  // Find dragging item's neighbors
  const dragStart = dragging[pos];
  const dragEnd = dragging[pos] + dragging[size];

  let leftNeighbor: CanvasItem | null = null;
  let rightNeighbor: CanvasItem | null = null;
  for (const item of sorted) {
    const itemEnd = item[pos] + item[size];
    if (itemEnd <= dragStart) {
      if (!leftNeighbor || itemEnd > leftNeighbor[pos] + leftNeighbor[size]) {
        leftNeighbor = item;
      }
    }
    if (item[pos] >= dragEnd) {
      if (!rightNeighbor || item[pos] < rightNeighbor[pos]) {
        rightNeighbor = item;
      }
    }
  }

  let bestDelta = Number.POSITIVE_INFINITY;
  let bestAbsDelta = Number.POSITIVE_INFINITY;
  let matchedGapValue = 0;
  type Side = 'left' | 'right';
  let matchedSide: Side | null = null;

  // Check left gap against reference gaps
  if (leftNeighbor) {
    const leftEnd = leftNeighbor[pos] + leftNeighbor[size];
    const gapLeft = dragStart - leftEnd;
    for (const ref of refGaps) {
      const delta = leftEnd + ref.gap - dragStart; // snap so gapLeft == ref.gap
      const absDelta = Math.abs(delta);
      if (
        absDelta <= SNAP_THRESHOLD &&
        (absDelta < bestAbsDelta || (absDelta === bestAbsDelta && matchedSide !== 'left'))
      ) {
        bestAbsDelta = absDelta;
        bestDelta = delta;
        matchedGapValue = ref.gap;
        matchedSide = 'left';
      }
    }
  }

  // Check right gap against reference gaps
  if (rightNeighbor) {
    const rightStart = rightNeighbor[pos];
    const gapRight = rightStart - dragEnd;
    for (const ref of refGaps) {
      const delta = rightStart - ref.gap - dragging[size] - dragStart; // snap so gapRight == ref.gap
      const absDelta = Math.abs(delta);
      if (absDelta <= SNAP_THRESHOLD && absDelta < bestAbsDelta) {
        bestAbsDelta = absDelta;
        bestDelta = delta;
        matchedGapValue = ref.gap;
        matchedSide = 'right';
      }
    }
  }

  if (bestAbsDelta > SNAP_THRESHOLD) return { snapDelta: 0, guides: [] };

  // Generate spacing guides for all gaps matching this value + the dragging gap
  const guides: SpacingGuide[] = [];
  const dragCross = dragging[crossPos] + dragging[crossSize] / 2;

  // Reference gaps that match
  for (const ref of refGaps) {
    if (Math.abs(ref.gap - matchedGapValue) < 0.5) {
      guides.push({
        axis: guideAxis,
        from: ref.aRight,
        to: ref.bLeft,
        cross: (ref.aCross + ref.bCross) / 2,
      });
    }
  }

  // The dragging gap itself (after snap)
  const snappedStart = dragStart + bestDelta;
  const snappedEnd = snappedStart + dragging[size];

  if (matchedSide === 'left' && leftNeighbor) {
    const leftEnd = leftNeighbor[pos] + leftNeighbor[size];
    const neighborCross = leftNeighbor[crossPos] + leftNeighbor[crossSize] / 2;
    guides.push({
      axis: guideAxis,
      from: leftEnd,
      to: snappedStart,
      cross: (neighborCross + dragCross) / 2,
    });
  }
  if (matchedSide === 'right' && rightNeighbor) {
    const rightStart = rightNeighbor[pos];
    const neighborCross = rightNeighbor[crossPos] + rightNeighbor[crossSize] / 2;
    guides.push({
      axis: guideAxis,
      from: snappedEnd,
      to: rightStart,
      cross: (dragCross + neighborCross) / 2,
    });
  }

  return { snapDelta: bestDelta, guides };
}

export function computeSpacing(dragging: CanvasItem, allItems: CanvasItem[]): SpacingResult {
  const others = allItems.filter((i) => i.id !== dragging.id);
  if (others.length < 2) return { spacingGuides: [], snapDeltaX: 0, snapDeltaY: 0 };

  const xResult = computeSpacingAxis(dragging, others, 'x');
  const yResult = computeSpacingAxis(dragging, others, 'y');

  return {
    spacingGuides: [...xResult.guides, ...yResult.guides],
    snapDeltaX: xResult.snapDelta,
    snapDeltaY: yResult.snapDelta,
  };
}

export type AnchorPosition = 'top' | 'bottom' | 'left' | 'right';

export interface CanvasConnection {
  id: string;
  fromItemId: string;
  fromAnchor: AnchorPosition;
  toItemId: string;
  toAnchor: AnchorPosition;
}

export function getAnchorScreenPos(
  item: CanvasItem,
  anchor: AnchorPosition,
  zoom: number,
  pan: { x: number; y: number },
): { x: number; y: number } {
  let cx: number;
  let cy: number;

  switch (anchor) {
    case 'top':
      cx = item.x + item.width / 2;
      cy = item.y;
      break;
    case 'bottom':
      cx = item.x + item.width / 2;
      cy = item.y + item.height;
      break;
    case 'left':
      cx = item.x;
      cy = item.y + item.height / 2;
      break;
    case 'right':
      cx = item.x + item.width;
      cy = item.y + item.height / 2;
      break;
  }

  return {
    x: cx * zoom + pan.x,
    y: cy * zoom + pan.y,
  };
}

/** Direction unit vectors for each anchor. */
const anchorDir: Record<AnchorPosition, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Build an SVG cubic-bezier `d` attribute for a connection between two screen-space points.
 * Control points extend outward from each anchor's natural direction, producing smooth
 * S-curves / C-curves that always exit and enter at the correct angle.
 */
export function bezierPath(
  from: { x: number; y: number },
  fromAnchor: AnchorPosition,
  to: { x: number; y: number },
  toAnchor: AnchorPosition,
): string {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.max(40, Math.min(dist * 0.4, 200));

  const fd = anchorDir[fromAnchor];
  const td = anchorDir[toAnchor];

  const cx1 = from.x + fd.x * offset;
  const cy1 = from.y + fd.y * offset;
  const cx2 = to.x + td.x * offset;
  const cy2 = to.y + td.y * offset;

  return `M ${from.x},${from.y} C ${cx1},${cy1} ${cx2},${cy2} ${to.x},${to.y}`;
}
