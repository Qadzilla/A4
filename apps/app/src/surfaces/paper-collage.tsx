import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The landing ground: a pile of torn financial paper — a 1971 finance page
 * and a 1099-B, both about cost basis — cropped into scraps.
 *
 * Two source images are rendered once and cropped 1:1 by every scrap, so the
 * type is the same size on every fragment (the thing that sells "one physical
 * pile" rather than assorted screenshots). Everything else — tear shape,
 * crop window, rotation, tone — is generated per scrap, so no two pieces
 * repeat and the grid never shows.
 */

const SOURCES = [
  { url: '/paper-news.jpg', w: 1082, h: 1400, contentTop: 0.02, contentBottom: 0.99 },
  { url: '/paper-1099.jpg', w: 1082, h: 1400, contentTop: 0.02, contentBottom: 0.62 },
] as const;

/** Deterministic PRNG — the pile must look identical on every render. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One edge of a scrap: either a clean guillotine cut (two corners) or a tear —
 * an irregular walk with occasional deep nicks, never parallel to the edge.
 */
function edgePoints(
  rnd: () => number,
  from: [number, number],
  to: [number, number],
  torn: boolean,
): string[] {
  if (!torn) return [`${to[0].toFixed(1)}% ${to[1].toFixed(1)}%`];
  const steps = 7 + Math.floor(rnd() * 8);
  const [fx, fy] = from;
  const [tx, ty] = to;
  // Inward normal of this edge, so excursions bite into the scrap
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  const points: string[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Most nibbles are shallow; every few steps allow a deep one
    const deep = rnd() < 0.22;
    const bite = (deep ? 3 + rnd() * 6 : rnd() * 2.2) * (i === steps ? 0 : 1);
    const wobble = (rnd() - 0.5) * 1.5;
    const x = fx + dx * t + nx * bite + wobble;
    const y = fy + dy * t + ny * bite + wobble;
    points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }
  return points;
}

function tearPolygon(rnd: () => number): string {
  // One or two torn edges; the rest are cut. Paper gets cut as well as torn.
  const tornCount = rnd() < 0.35 ? 1 : 2;
  const start = Math.floor(rnd() * 4);
  const torn = [false, false, false, false];
  for (let i = 0; i < tornCount; i++) torn[(start + i) % 4] = true;

  const corners: Array<[number, number]> = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const pts: string[] = ['0% 0%'];
  for (let e = 0; e < 4; e++) {
    pts.push(
      ...edgePoints(
        rnd,
        corners[e] as [number, number],
        corners[(e + 1) % 4] as [number, number],
        torn[e] ?? false,
      ),
    );
  }
  return `polygon(${pts.join(',')})`;
}

interface Scrap {
  key: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  source: (typeof SOURCES)[number];
  cropX: number;
  cropY: number;
  clip: string;
  tint: string;
  tintAlpha: number;
  drift: number;
  delay: number;
  /** Base-course sheets are buried: no drift, no shadow, nothing to see. */
  base: boolean;
}

/** Cell size of the jittered grid the top course is seeded on. */
const CELL_W = 250;
const CELL_H = 190;

/**
 * One stock. Sheets differ only in how deeply they're shaded — two tint
 * families read as two different papers, which is what makes a pile look
 * assembled rather than found.
 */
const PAPER_TINT = '152,128,88';

/**
 * A course of the pile. The base course is all large sheets laid nearly flat
 * with heavy overlap — it exists to guarantee coverage, since a single layer
 * of jittered scraps always leaves holes somewhere. The top course is the
 * varied one that does the visual work.
 */
function buildCourse(width: number, height: number, startKey: number, base: boolean): Scrap[] {
  const cellW = base ? 300 : CELL_W;
  const cellH = base ? 225 : CELL_H;
  const jitter = base ? 0.45 : 1.4;
  // Extra ring of cells so the pile runs past every edge
  const cols = Math.max(3, Math.ceil(width / cellW) + 3);
  const rows = Math.max(3, Math.ceil(height / cellH) + 3);
  const scraps: Scrap[] = [];
  let key = startKey;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rnd = mulberry32(key * 2654435761 + 12345);
      const source = SOURCES[rnd() < 0.55 ? 0 : 1] as (typeof SOURCES)[number];

      // Size varies widely on the top course — slivers through near-sheets —
      // so the pile never reads as evenly shredded.
      const roll = rnd();
      const w = base
        ? 440 + rnd() * 220
        : roll < 0.16
          ? 130 + rnd() * 90 // fragment
          : roll > 0.9
            ? 480 + rnd() * 200 // large sheet
            : 250 + rnd() * 190;
      const h = base ? 320 + rnd() * 180 : roll < 0.16 ? 70 + rnd() * 80 : 110 + rnd() * 190;

      const left = (c - 1.5) * cellW + (rnd() - 0.5) * cellW * jitter;
      const top = (r - 1.5) * cellH + (rnd() - 0.5) * cellH * jitter;

      // Crop from a content-bearing part of the source page
      const span = source.contentBottom - source.contentTop;
      const cropX = rnd() * Math.max(1, source.w - w);
      const cropY = source.contentTop * source.h + rnd() * Math.max(1, span * source.h - h);

      // Sheets underneath lie flatter; the loose scraps on top can land anyhow
      const upsideDown = !base && rnd() < 0.06;
      const rotate = upsideDown ? 178 + (rnd() - 0.5) * 12 : (rnd() - 0.5) * (base ? 14 : 44);

      scraps.push({
        key,
        left,
        top,
        width: w,
        height: h,
        rotate,
        source,
        cropX,
        cropY,
        clip: tearPolygon(rnd),
        tint: PAPER_TINT,
        // The base course sits in shadow under everything else
        tintAlpha: base ? 0.1 + rnd() * 0.05 : 0.02 + rnd() * 0.05,
        drift: 6 + rnd() * 10,
        delay: -rnd() * 40,
        base,
      });
      key += 1;
    }
  }
  return scraps;
}

function buildScraps(width: number, height: number): Scrap[] {
  const under = buildCourse(width, height, 0, true);
  return [...under, ...buildCourse(width, height, under.length, false)];
}

export function PaperCollage() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1440, h: 900 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scraps = useMemo(() => buildScraps(size.w, size.h), [size.w, size.h]);

  // The scraps are a fixed physical size, so a narrow viewport shows far less
  // paper behind the same words — the wash has to work harder there.
  const narrow = size.w < 700;
  const wash = narrow
    ? 'radial-gradient(120% 62% at 50% 46%, rgba(226,216,195,0.97) 0%, rgba(226,216,195,0.93) 30%, rgba(226,216,195,0.7) 58%, rgba(226,216,195,0.3) 80%, rgba(226,216,195,0) 98%)'
    : 'radial-gradient(80% 72% at 50% 46%, rgba(226,216,195,0.93) 0%, rgba(226,216,195,0.8) 26%, rgba(226,216,195,0.54) 52%, rgba(226,216,195,0.22) 76%, rgba(226,216,195,0) 96%)';

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: '#ded4bd' }}
    >
      {scraps.map((s) => (
        <div
          key={s.key}
          className={s.base ? 'absolute' : 'paper-scrap absolute'}
          style={{
            left: s.left,
            top: s.top,
            width: s.width,
            height: s.height,
            transform: `rotate(${s.rotate}deg)`,
            ...(s.base
              ? null
              : {
                  filter: 'drop-shadow(0 1px 1.5px rgba(70,52,28,0.22))',
                  animationDuration: `${s.drift * 6}s`,
                  animationDelay: `${s.delay}s`,
                }),
          }}
        >
          <div
            className="relative h-full w-full"
            style={{
              clipPath: s.clip,
              backgroundImage: `url(${s.source.url})`,
              backgroundPosition: `-${s.cropX}px -${s.cropY}px`,
              backgroundRepeat: 'no-repeat',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `rgba(${s.tint},${s.tintAlpha})`,
                mixBlendMode: 'multiply',
              }}
            />
          </div>
        </div>
      ))}

      {/* Calm the middle so the hero has ground to stand on. The wash is the
          paper's own colour, not a lighter one — anything cooler than the stock
          reads as fog sitting on the pile instead of clean paper. */}
      <div
        className="absolute inset-0"
        style={{
          background: wash,
        }}
      />
      {/* Settle the edges into the page */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(60,46,28,0.10), rgba(60,46,28,0) 22%, rgba(60,46,28,0) 72%, rgba(60,46,28,0.14))',
        }}
      />
    </div>
  );
}
