import { memo, useRef, useEffect } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useTheme } from '../../hooks/useTheme';

const MAP_W = 160;
const MAP_H = 120;
const PADDING = 20; // world-space padding around bounding box

interface CanvasMinimapProps {
  zoom: number;
  pan: { x: number; y: number };
  canvasRef: React.RefObject<HTMLDivElement | null>;
  isPanelCollapsed: boolean;
}

export const CanvasMinimap = memo(function CanvasMinimap({ zoom, pan, canvasRef, isPanelCollapsed }: CanvasMinimapProps) {
  const items = useCanvasStore((s) => s.items);
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const canvas = ref.current;
    const container = canvasRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_W * dpr;
    canvas.height = MAP_H * dpr;
    canvas.style.width = `${MAP_W}px`;
    canvas.style.height = `${MAP_H}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, MAP_W, MAP_H);

    if (items.length === 0) return;

    // 1. Compute world bounding box of all items
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of items) {
      if (item.x < minX) minX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
    }

    // Also include the current viewport in the bounding box so the
    // viewport rect is always visible even when scrolled far away
    const rect = container.getBoundingClientRect();
    const vpLeft = -pan.x / zoom;
    const vpTop = -pan.y / zoom;
    const vpRight = vpLeft + rect.width / zoom;
    const vpBottom = vpTop + rect.height / zoom;

    if (vpLeft < minX) minX = vpLeft;
    if (vpTop < minY) minY = vpTop;
    if (vpRight > maxX) maxX = vpRight;
    if (vpBottom > maxY) maxY = vpBottom;

    minX -= PADDING;
    minY -= PADDING;
    maxX += PADDING;
    maxY += PADDING;

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;

    // 2. Scale factor to fit world into minimap
    const scale = Math.min(MAP_W / worldW, MAP_H / worldH);
    const offsetX = (MAP_W - worldW * scale) / 2;
    const offsetY = (MAP_H - worldH * scale) / 2;

    const toMapX = (wx: number) => (wx - minX) * scale + offsetX;
    const toMapY = (wy: number) => (wy - minY) * scale + offsetY;

    // 3. Draw items as green rectangles
    ctx.fillStyle = '#22c55e'; // green-500
    for (const item of items) {
      const x = toMapX(item.x);
      const y = toMapY(item.y);
      const w = Math.max(2, item.width * scale);
      const h = Math.max(2, item.height * scale);
      ctx.fillRect(x, y, w, h);
    }

    // 4. Draw viewport rectangle
    const vx = toMapX(vpLeft);
    const vy = toMapY(vpTop);
    const vw = (rect.width / zoom) * scale;
    const vh = (rect.height / zoom) * scale;

    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx + 0.5, vy + 0.5, vw, vh);
  }, [items, zoom, pan, canvasRef, isDark]);

  // Don't render if canvas is empty
  if (items.length === 0) return null;

  return (
    <div
      className="absolute bottom-4 z-30 rounded-lg border border-border/40 backdrop-blur-sm shadow-lg overflow-hidden transition-[right] duration-300 ease-in-out bg-white/70 dark:bg-black/60"
      style={{ right: isPanelCollapsed ? 16 : 376 }}
    >
      <canvas ref={ref} />
    </div>
  );
});
