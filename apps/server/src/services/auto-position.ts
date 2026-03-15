// Auto-positioning for canvas items created by AI tools

interface PositionedItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

const START_X = 100;
const START_Y = 100;
const GAP = 40;
const MAX_ROW_WIDTH = 1200;

export function findNextPosition(
  existingItems: PositionedItem[],
  _newWidth: number,
  _newHeight: number,
): { x: number; y: number } {
  if (existingItems.length === 0) {
    return { x: START_X, y: START_Y };
  }

  let maxBottom = -Infinity;
  for (const item of existingItems) {
    const bottom = item.y + item.height;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return { x: START_X, y: maxBottom + GAP };
}

export function findBatchPositions(
  existingItems: PositionedItem[],
  newItems: { width: number; height: number }[],
): { x: number; y: number }[] {
  if (newItems.length === 0) return [];

  const positions: { x: number; y: number }[] = [];
  const first = newItems[0]!;
  const start = findNextPosition(existingItems, first.width, first.height);

  let cursorX = start.x;
  let cursorY = start.y;
  let maxRowHeight = 0;

  for (const item of newItems) {
    // Wrap to next row if this item would exceed max width
    if (cursorX !== START_X && cursorX + item.width > MAX_ROW_WIDTH) {
      cursorY += maxRowHeight + GAP;
      cursorX = START_X;
      maxRowHeight = 0;
    }

    positions.push({ x: cursorX, y: cursorY });
    cursorX += item.width + GAP;
    if (item.height > maxRowHeight) maxRowHeight = item.height;
  }

  return positions;
}
