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
}

/** Cell size of the jittered grid the scraps are seeded on. */
const CELL_W = 250;
const CELL_H = 190;

function buildScraps(width: number, height: number): Scrap[] {
  const cols = Math.max(2, Math.ceil(width / CELL_W) + 1);
  const rows = Math.max(2, Math.ceil(height / CELL_H) + 1);
  const scraps: Scrap[] = [];
  let key = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rnd = mulberry32(key * 2654435761 + 12345);
      const source = SOURCES[rnd() < 0.55 ? 0 : 1] as (typeof SOURCES)[number];

      // Size varies widely — slivers through near-sheets — so the pile never
      // reads as evenly shredded.
      const roll = rnd();
      const w =
        roll < 0.16
          ? 130 + rnd() * 90 // fragment
          : roll > 0.9
            ? 480 + rnd() * 200 // large sheet
            : 250 + rnd() * 190;
      const h = roll < 0.16 ? 70 + rnd() * 80 : 110 + rnd() * 190;

      // Jitter well past the cell so no row or column can line up
      const left = c * CELL_W - CELL_W * 0.5 + (rnd() - 0.5) * CELL_W * 1.5;
      const top = r * CELL_H - CELL_H * 0.5 + (rnd() - 0.5) * CELL_H * 1.6;

      // Crop from a content-bearing part of the source page
      const span = source.contentBottom - source.contentTop;
      const cropX = rnd() * Math.max(1, source.w - w);
      const cropY = source.contentTop * source.h + rnd() * Math.max(1, span * source.h - h);

      const upsideDown = rnd() < 0.06;
      const rotate = upsideDown ? 178 + (rnd() - 0.5) * 12 : (rnd() - 0.5) * 44;

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
        tint: rnd() < 0.5 ? '198,158,84' : '126,124,112',
        tintAlpha: 0.06 + rnd() * 0.1,
        drift: 6 + rnd() * 10,
        delay: -rnd() * 40,
      });
      key += 1;
    }
  }
  return scraps;
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
          className="paper-scrap absolute"
          style={{
            left: s.left,
            top: s.top,
            width: s.width,
            height: s.height,
            transform: `rotate(${s.rotate}deg)`,
            filter: 'drop-shadow(0 1px 1.5px rgba(70,52,28,0.22))',
            animationDuration: `${s.drift * 6}s`,
            animationDelay: `${s.delay}s`,
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

      {/* Calm the middle so the hero has ground to stand on. Two requirements
          pull against each other: it has to reach zero, or the whole pile sits
          under a haze; and it has to fall off slowly over a large radius, or
          the falloff has a visible edge and reads as a blob. Hence the wide
          ellipse and the long tail of stops. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 108% at 50% 46%, rgba(241,233,219,0.9) 0%, rgba(241,233,219,0.82) 24%, rgba(241,233,219,0.64) 44%, rgba(241,233,219,0.4) 62%, rgba(241,233,219,0.18) 80%, rgba(241,233,219,0) 100%)',
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
