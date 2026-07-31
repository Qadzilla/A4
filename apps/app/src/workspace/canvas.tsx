import type { Panel } from '@/workspace/panel';
import { PanelCard } from '@/workspace/panels';
import { type Box, type Guide, snap } from '@/workspace/snapping';
import { LayoutGrid, Maximize2, Minus, Plus, Rows3 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

/** How long a panel's height has to hold still before it counts as settled. */
const SETTLE_MS = 180;

/** How wide a panel gets when a tab opens it. Past this, lines get hard to track. */
const TAB_MAX_WIDTH = 920;

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
  /** Alignment lines for the drag in progress, cleared when it ends. */
  const [guides, setGuides] = useState<Guide[]>([]);
  /**
   * The panel a tab has opened, or null for the desk.
   *
   * An open panel replaces the desk rather than being magnified on it. The
   * canvas is for seeing how things sit together; a tab is for reading one
   * thing, at whatever width it needs, without the rest in the way.
   */
  const [focused, setFocused] = useState<string | null>(null);

  const heightsRef = useRef<Record<string, number>>({});
  const [measuredAt, setMeasuredAt] = useState(0);
  /**
   * Panels this session placed on its own, and that nobody has moved since.
   *
   * They stay eligible for re-packing, because a panel's height can arrive
   * well after the panel does — a generated answer renders in an iframe that
   * reports its real height a few hundred milliseconds in, long after the
   * card around it has settled. Anything the user has dragged, and anything
   * that came back from the server already placed, is left exactly alone.
   */
  const autoPlacedRef = useRef<Set<string>>(new Set());

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

  const openPanel = panels.find((p) => p.id === focused) ?? null;

  // A panel removed while open leaves its tab pointing at nothing.
  useEffect(() => {
    if (focused && !panels.some((p) => p.id === focused)) setFocused(null);
  }, [focused, panels]);

  /** Columns that fit the viewport at the current zoom, at least one. */
  const columnCount = useCallback(() => {
    const width = (viewportRef.current?.clientWidth ?? 900) / zoom;
    return Math.max(1, Math.floor((width - ORIGIN) / (DEFAULT_PANEL_WIDTH + GAP)));
  }, [zoom]);

  // Lay out everything this session is responsible for, and do it again
  // whenever a height changes — heights arrive late and out of order.
  useEffect(() => {
    const loose = panels.filter((p) => !places[p.id] || autoPlacedRef.current.has(p.id));
    if (loose.length === 0) return;
    // Wait until every one of them has reported a height, so the pack is
    // computed from what is actually on screen rather than a guess.
    if (!loose.every((p) => heightsRef.current[p.id] !== undefined)) return;

    const timer = setTimeout(() => {
      const columns = columnCount();
      // Panels the user placed hold their ground; the rest fill in around them.
      const fixed = Object.fromEntries(
        Object.entries(places).filter(([id]) => !autoPlacedRef.current.has(id)),
      );
      const packed = packPanels(
        loose.map((p) => p.id),
        heightsRef.current,
        columns,
        DEFAULT_PANEL_WIDTH,
        columnTops(fixed, heightsRef.current, columns),
      );
      // Only write what actually moved. Without this the effect re-runs on its
      // own output and the desk writes to the server forever.
      const moved = Object.entries(packed).filter(([id, place]) => {
        const current = places[id];
        return !current || current.x !== place.x || current.y !== place.y;
      });
      if (moved.length === 0) return;
      for (const [id, place] of moved) {
        autoPlacedRef.current.add(id);
        onLayout(id, place);
      }
      setPlaces((prev) => ({ ...prev, ...Object.fromEntries(moved) }));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
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
        const moved: Box = {
          id: dragging.id,
          x: dragging.x + dx,
          y: dragging.y + dy,
          width: current.w,
          height: heightsRef.current[dragging.id] ?? ASSUMED_HEIGHT,
        };
        const others: Box[] = Object.entries(prev)
          .filter(([id]) => id !== dragging.id)
          .map(([id, p]) => ({
            id,
            x: p.x,
            y: p.y,
            width: p.w,
            height: heightsRef.current[id] ?? ASSUMED_HEIGHT,
          }));
        const pull = snap(moved, others);
        setGuides(pull.guides);
        return {
          ...prev,
          [dragging.id]: { ...current, x: moved.x + pull.dx, y: moved.y + pull.dy },
        };
      });
    };
    const onUp = () => {
      setGuides([]);
      if (dragging.kind !== 'pan') {
        const place = places[dragging.id];
        // Moved by hand, so it is no longer the canvas's to rearrange.
        autoPlacedRef.current.delete(dragging.id);
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
    // Tidying is an explicit request to arrange the whole desk, so everything
    // goes back to being the canvas's to place.
    autoPlacedRef.current = new Set(Object.keys(packed));
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* One tab per thing on the desk. Selecting one doesn't open a separate
          view of it — it moves the desk so that panel is what you're looking
          at. The desk stays the only place anything lives. */}
      {panels.length > 1 && (
        <div className="flex shrink-0 items-stretch gap-px overflow-x-auto border-hairline border-b bg-paper">
          <PanelTab
            active={focused === null}
            onSelect={() => setFocused(null)}
            title="Back to the desk"
          >
            <LayoutGrid size={12} /> Desk
          </PanelTab>
          {panels.map((panel) => (
            <PanelTab
              key={panel.id}
              active={focused === panel.id}
              onSelect={() => setFocused(panel.id)}
              title={panel.subtitle ? `${panel.title} · ${panel.subtitle}` : panel.title}
            >
              <span className="max-w-[11rem] truncate">{panel.title}</span>
              {/* Three pre-trade checks are only told apart by their subject,
                  so the subject has to be on the tab, not just in the tooltip. */}
              {panel.subtitle && (
                <span className="max-w-[7rem] truncate font-normal text-faint">
                  {panel.subtitle}
                </span>
              )}
            </PanelTab>
          ))}
        </div>
      )}

      {/* A tab replaces the desk with the one thing it names, at the width
          that thing wants — a generated answer gets the better part of a
          thousand pixels instead of four hundred.

          The surface stays mounted underneath so the desk keeps its pan, zoom
          and arrangement. Only the panels come out of it: a panel rendered in
          two places at once is a panel whose iframe is fighting itself for a
          name, and it's wasted work besides. */}
      {openPanel && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-paper">
          <div className="mx-auto px-6 py-6" style={{ maxWidth: TAB_MAX_WIDTH }}>
            <PanelCard panel={openPanel} taxYear={taxYear} onDismiss={onDismiss} />
          </div>
        </div>
      )}

      <div
        className={`relative min-h-0 flex-1 ${openPanel ? 'hidden' : ''}`}
        aria-hidden={!!openPanel}
      >
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
            {guides.map((g) => (
              <div
                key={`${g.axis}-${g.at}-${g.from}`}
                aria-hidden
                className="pointer-events-none absolute z-20 bg-accent"
                style={
                  g.axis === 'x'
                    ? { left: g.at, top: g.from, width: 1, height: g.to - g.from }
                    : { top: g.at, left: g.from, height: 1, width: g.to - g.from }
                }
              />
            ))}
            {(openPanel ? [] : panels).map((panel) => {
              const place = places[panel.id];
              return (
                <CanvasPanel
                  key={panel.id}
                  panel={panel}
                  taxYear={taxYear}
                  place={place}
                  active={
                    (dragging?.kind !== 'pan' && dragging?.id === panel.id) || focused === panel.id
                  }
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
    </div>
  );
}

function PanelTab({
  active,
  onSelect,
  title,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 font-medium text-xs transition-colors ${
        active
          ? 'border-b-accent bg-surface text-ink'
          : 'border-b-transparent text-muted hover:bg-surface/60 hover:text-ink'
      }`}
    >
      {children}
    </button>
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
    const report = () => onMeasure(panel.id, el.offsetHeight);
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    // A backstop for the same late arrivals. The observer is the right signal
    // and usually the first one, but it is delivered on the rendering
    // lifecycle — a backgrounded or throttled tab can hold the callback back
    // long past the moment the panel needs placing.
    const timers = [60, 250, 700, 1500].map((delay) => setTimeout(report, delay));
    return () => {
      observer.disconnect();
      for (const timer of timers) clearTimeout(timer);
    };
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
