import type { Panel } from '@/workspace/panel';
import { PanelCard } from '@/workspace/panels';
import { Maximize2, Minus, Plus, Rows3 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The desk as a surface rather than a list.
 *
 * A stacked column forced every answer through one width, which is the wrong
 * constraint for material that ranges from a single figure to a nine-position
 * table. Here a panel has a place and a width, and keeps both.
 *
 * Deliberately small: a plane you can pan and zoom, panels you can move and
 * widen. No connectors, no nesting, no grouping. Height isn't stored — these
 * panels are vertical-flow content and size to what they hold, so width is the
 * only dimension worth arguing with.
 */

export const DEFAULT_PANEL_WIDTH = 440;
const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 1200;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.4;

/** Breathing room between packed panels, and the margin they start at. */
const GAP = 28;
const ORIGIN = 32;

export interface Placement {
  x: number;
  y: number;
  w: number;
}

/** A panel that hasn't reported a height yet still needs a plausible one. */
const ASSUMED_HEIGHT = 260;

/**
 * How far down each column is already occupied.
 *
 * Panels are assigned to whichever column their x sits nearest, so a panel the
 * user dragged somewhere still holds its place against later arrivals instead
 * of being packed over.
 */
export function columnTops(
  placed: Record<string, Placement>,
  heights: Record<string, number>,
  columns: number,
  width = DEFAULT_PANEL_WIDTH,
): number[] {
  const tops: number[] = new Array(Math.max(1, columns)).fill(ORIGIN);
  for (const [id, place] of Object.entries(placed)) {
    const column = Math.round((place.x - ORIGIN) / (width + GAP));
    const top = tops[column];
    if (top === undefined) continue;
    tops[column] = Math.max(top, place.y + (heights[id] ?? ASSUMED_HEIGHT) + GAP);
  }
  return tops;
}

/**
 * Lay panels into columns, shortest-column-first, using the heights they
 * actually rendered at.
 *
 * `tops` is where each column already ends, so this can either tidy the whole
 * desk (fresh tops) or drop new panels into the gaps left by what is already
 * there. Placing incrementally matters more than it looks: heights arrive one
 * panel at a time, so this runs once per arrival, and a version that started
 * every batch below everything else turned the desk into a single tall stack.
 */
export function packPanels(
  order: string[],
  heights: Record<string, number>,
  columns: number,
  width = DEFAULT_PANEL_WIDTH,
  tops?: number[],
): Record<string, Placement> {
  const running = tops ? [...tops] : new Array(Math.max(1, columns)).fill(ORIGIN);
  const out: Record<string, Placement> = {};
  for (const id of order) {
    let shortest = 0;
    for (let c = 1; c < running.length; c++) {
      if (running[c] < running[shortest]) shortest = c;
    }
    out[id] = { x: ORIGIN + shortest * (width + GAP), y: running[shortest], w: width };
    running[shortest] += (heights[id] ?? ASSUMED_HEIGHT) + GAP;
  }
  return out;
}

type DragState =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'move'; id: string; startX: number; startY: number; x: number; y: number }
  | { kind: 'resize'; id: string; startX: number; w: number };

export function Canvas({
  panels,
  taxYear,
  onDismiss,
  onLayout,
  emptyMessage,
}: {
  panels: Panel[];
  taxYear: number;
  onDismiss: (id: string) => void;
  /** Called once per gesture, on release — never during the drag. */
  onLayout: (id: string, place: Placement) => void;
  emptyMessage: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [places, setPlaces] = useState<Record<string, Placement>>({});
  const [dragging, setDragging] = useState<DragState | null>(null);

  const heightsRef = useRef<Record<string, number>>({});
  const [measuredAt, setMeasuredAt] = useState(0);

  // Panels arrive carrying their stored place; anything without one is left
  // out of `places` so the packing pass below can claim it.
  useEffect(() => {
    setPlaces((prev) => {
      const next: Record<string, Placement> = {};
      let changed = false;
      for (const p of panels) {
        const stored =
          typeof p.x === 'number' && typeof p.y === 'number' && typeof p.w === 'number'
            ? { x: p.x, y: p.y, w: p.w }
            : undefined;
        const existing = prev[p.id];
        const place = existing ?? stored;
        if (place) next[p.id] = place;
        if (!existing !== !place) changed = true;
      }
      // Only replace when the set actually differs, or every render loops.
      const sameSize = Object.keys(next).length === Object.keys(prev).length;
      if (sameSize && !changed && Object.keys(next).every((k) => prev[k] === next[k])) return prev;
      return next;
    });
  }, [panels]);

  /** Columns that fit the viewport at the current zoom, at least one. */
  const columnCount = useCallback(() => {
    const width = (viewportRef.current?.clientWidth ?? 900) / zoom;
    return Math.max(1, Math.floor((width - ORIGIN) / (DEFAULT_PANEL_WIDTH + GAP)));
  }, [zoom]);

  // Place anything unplaced, once it has been measured. Runs after layout so
  // the heights are real; the result is persisted so it only happens once.
  useLayoutEffect(() => {
    const unplaced = panels.filter((p) => !places[p.id]);
    if (unplaced.length === 0) return;
    // Wait until every unplaced panel has reported a height, so the pack is
    // computed from what is actually on screen rather than a guess.
    if (!unplaced.every((p) => heightsRef.current[p.id] !== undefined)) return;

    const columns = columnCount();
    const packed = packPanels(
      unplaced.map((p) => p.id),
      heightsRef.current,
      columns,
      DEFAULT_PANEL_WIDTH,
      // Fill the space beneath what is already on the desk, column by column,
      // rather than starting below all of it.
      columnTops(places, heightsRef.current, columns),
    );
    for (const [id, place] of Object.entries(packed)) onLayout(id, place);
    setPlaces((prev) => ({ ...prev, ...packed }));
    // biome-ignore lint/correctness/useExhaustiveDependencies: measuredAt is
    // the point — heights live in a ref so they don't re-render on every
    // pixel, and this is the signal that a new one has landed and the pack is
    // worth recomputing.
  }, [panels, places, columnCount, onLayout, measuredAt]);

  const measure = useCallback((id: string, height: number) => {
    if (heightsRef.current[id] === height) return;
    heightsRef.current[id] = height;
    setMeasuredAt(Date.now());
  }, []);

  // ── Gestures ──────────────────────────────────────────────
  // Tracked on the window so a fast drag that leaves the panel — or the
  // viewport — still moves the thing you grabbed.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (dragging.kind === 'pan') {
        setPan({
          x: dragging.panX + (e.clientX - dragging.startX),
          y: dragging.panY + (e.clientY - dragging.startY),
        });
        return;
      }
      // Pointer travel is in screen pixels; the canvas is scaled, so the
      // distance the panel moves has to be divided back out.
      const dx = (e.clientX - dragging.startX) / zoom;
      if (dragging.kind === 'resize') {
        const w = clamp(dragging.w + dx, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
        setPlaces((prev) => {
          const current = prev[dragging.id];
          return current ? { ...prev, [dragging.id]: { ...current, w } } : prev;
        });
        return;
      }
      const dy = (e.clientY - dragging.startY) / zoom;
      setPlaces((prev) => {
        const current = prev[dragging.id];
        if (!current) return prev;
        return { ...prev, [dragging.id]: { ...current, x: dragging.x + dx, y: dragging.y + dy } };
      });
    };
    const onUp = () => {
      if (dragging.kind !== 'pan') {
        const place = places[dragging.id];
        if (place) onLayout(dragging.id, place);
      }
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, zoom, places, onLayout]);

  const startPan = (e: React.PointerEvent) => {
    // Only the surface itself pans — a drag that begins on a panel belongs to
    // the panel, and a drag inside one is probably someone selecting a figure.
    if (e.target !== e.currentTarget) return;
    setDragging({ kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y });
  };

  const zoomBy = useCallback((factor: number, originX?: number, originY?: number) => {
    setZoom((z) => {
      const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      if (next === z) return z;
      const box = viewportRef.current?.getBoundingClientRect();
      const cx = originX ?? (box ? box.width / 2 : 0);
      const cy = originY ?? (box ? box.height / 2 : 0);
      // Keep the point under the cursor still while the scale changes.
      setPan((p) => ({
        x: cx - ((cx - p.x) * next) / z,
        y: cy - ((cy - p.y) * next) / z,
      }));
      return next;
    });
  }, []);

  // Wheel pans; wheel with a modifier zooms, the way every canvas does.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const box = el.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX - box.left, e.clientY - box.top);
        return;
      }
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  /** Re-pack everything into columns and bring the view back to it. */
  const tidy = () => {
    const packed = packPanels(
      panels.map((p) => p.id),
      heightsRef.current,
      columnCount(),
    );
    setPlaces(packed);
    for (const [id, place] of Object.entries(packed)) onLayout(id, place);
    setPan({ x: 0, y: 0 });
  };

  /** Zoom out far enough to see everything, then centre it. */
  const fit = () => {
    const box = viewportRef.current?.getBoundingClientRect();
    const all = Object.entries(places);
    if (!box || all.length === 0) return;
    const right = Math.max(...all.map(([, p]) => p.x + p.w));
    const bottom = Math.max(...all.map(([id, p]) => p.y + (heightsRef.current[id] ?? 260)));
    const next = clamp(Math.min((box.width - 48) / right, (box.height - 48) / bottom), MIN_ZOOM, 1);
    setZoom(next);
    setPan({ x: 24, y: 24 });
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={viewportRef}
        onPointerDown={startPan}
        className={`absolute inset-0 touch-none ${dragging?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          // A faint rule grid, so panning reads as movement across a surface
          // rather than content sliding for no reason.
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--color-hairline) 1px, transparent 0)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {panels.map((panel) => {
            const place = places[panel.id];
            return (
              <CanvasPanel
                key={panel.id}
                panel={panel}
                taxYear={taxYear}
                place={place}
                active={dragging?.kind !== 'pan' && dragging?.id === panel.id}
                onMeasure={measure}
                onDismiss={onDismiss}
                onGrab={(e) =>
                  place &&
                  setDragging({
                    kind: 'move',
                    id: panel.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    x: place.x,
                    y: place.y,
                  })
                }
                onGrabEdge={(e) =>
                  place &&
                  setDragging({ kind: 'resize', id: panel.id, startX: e.clientX, w: place.w })
                }
              />
            );
          })}
        </div>
      </div>

      {panels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-8 pt-16">
          <div className="pointer-events-auto max-w-sm">{emptyMessage}</div>
        </div>
      )}

      {/* Controls sit over the surface rather than in it, so they don't pan away. */}
      {panels.length > 0 && (
        <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-full border border-hairline bg-surface px-1.5 py-1 shadow-card">
          <CanvasButton onClick={tidy} label="Tidy the desk">
            <Rows3 size={14} />
          </CanvasButton>
          <CanvasButton onClick={fit} label="Fit everything on screen">
            <Maximize2 size={14} />
          </CanvasButton>
          <span className="mx-1 h-4 w-px bg-hairline" />
          <CanvasButton onClick={() => zoomBy(1 / 1.15)} label="Zoom out">
            <Minus size={14} />
          </CanvasButton>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="tnum min-w-[3rem] font-mono text-xs text-muted transition-colors hover:text-ink"
          >
            {Math.round(zoom * 100)}%
          </button>
          <CanvasButton onClick={() => zoomBy(1.15)} label="Zoom in">
            <Plus size={14} />
          </CanvasButton>
        </div>
      )}
    </div>
  );
}

function CanvasButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
    >
      {children}
    </button>
  );
}

function CanvasPanel({
  panel,
  taxYear,
  place,
  active,
  onMeasure,
  onDismiss,
  onGrab,
  onGrabEdge,
}: {
  panel: Panel;
  taxYear: number;
  place: Placement | undefined;
  active: boolean;
  onMeasure: (id: string, height: number) => void;
  onDismiss: (id: string) => void;
  onGrab: (e: React.PointerEvent) => void;
  onGrabEdge: (e: React.PointerEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // A generated panel reports its own height late, and a live panel's height
  // changes when its query resolves — so watch rather than measure once.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onMeasure(panel.id, el.offsetHeight));
    observer.observe(el);
    onMeasure(panel.id, el.offsetHeight);
    return () => observer.disconnect();
  }, [panel.id, onMeasure]);

  return (
    <div
      ref={ref}
      // Unplaced panels still have to render to be measured; they're kept
      // invisible for the one frame that takes rather than flashing at 0,0.
      className={`absolute ${place ? '' : 'invisible'} ${active ? 'z-10' : ''}`}
      style={{
        left: place?.x ?? 0,
        top: place?.y ?? 0,
        width: place?.w ?? DEFAULT_PANEL_WIDTH,
      }}
    >
      <div className="group relative">
        {/* The whole header is the handle — a panel is grabbed where you'd
            expect to grab a piece of paper, by the top edge. */}
        <div
          onPointerDown={onGrab}
          className="absolute inset-x-0 top-0 z-10 h-11 cursor-grab active:cursor-grabbing"
          aria-hidden
        />
        <PanelCard panel={panel} taxYear={taxYear} onDismiss={onDismiss} />
        <div
          onPointerDown={onGrabEdge}
          aria-hidden
          className="absolute top-8 -right-1 bottom-8 w-2 cursor-ew-resize rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: 'var(--color-accent)' }}
        />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
