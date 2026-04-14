import { useEffect, useRef } from "react";

// --- Utility helpers ---
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// --- Constants ---
const CARD_SIZES = [
  { w: 120, h: 80 },
  { w: 140, h: 95 },
  { w: 180, h: 120 },
  { w: 200, h: 130 },
  { w: 240, h: 160 },
  { w: 220, h: 150 },
];

const CARD_COUNT = 16;
const CONNECTION_COUNT = 5;
const CONNECTION_LIFETIME = 4000;

// --- Card / connection factories ---
function buildCardContent() {
  const r = Math.random();
  if (r < 0.2) {
    const points = [];
    let val = randomRange(0.3, 0.7);
    for (let i = 0; i < Math.floor(randomRange(12, 24)); i++) {
      val += randomRange(-0.12, 0.12);
      val = Math.max(0.05, Math.min(0.95, val));
      points.push(val);
    }
    const goesUp = points[points.length - 1] > points[0];
    return { type: "sparkline", points, goesUp };
  } else if (r < 0.35) {
    const candles = [];
    let base = randomRange(0.3, 0.6);
    for (let i = 0; i < Math.floor(randomRange(6, 12)); i++) {
      const open = base + randomRange(-0.05, 0.05);
      const close = open + randomRange(-0.15, 0.15);
      const high = Math.max(open, close) + randomRange(0.02, 0.08);
      const low = Math.min(open, close) - randomRange(0.02, 0.08);
      candles.push({ open: Math.max(0.05, open), close: Math.max(0.05, close), high: Math.min(0.95, high), low: Math.max(0.05, low) });
      base = close;
    }
    return { type: "candles", candles };
  } else if (r < 0.5) {
    const points = [];
    let val = randomRange(0.3, 0.7);
    for (let i = 0; i < 10; i++) {
      val += randomRange(-0.1, 0.1);
      val = Math.max(0.1, Math.min(0.9, val));
      points.push(val);
    }
    const goesUp = Math.random() > 0.4;
    return { type: "kpi", points, goesUp };
  } else if (r < 0.65) {
    const bars = [];
    for (let i = 0; i < Math.floor(randomRange(4, 8)); i++) bars.push(randomRange(0.15, 0.95));
    return { type: "bars", bars };
  } else if (r < 0.78) {
    const rows = [];
    for (let i = 0; i < Math.floor(randomRange(3, 6)); i++) {
      rows.push({ labelW: randomRange(0.25, 0.45), valueW: randomRange(0.12, 0.25), positive: Math.random() > 0.4 });
    }
    return { type: "table", rows };
  } else if (r < 0.88) {
    const segments = [];
    let total = 0;
    for (let i = 0; i < Math.floor(randomRange(2, 5)); i++) {
      const v = randomRange(0.1, 0.5);
      segments.push(v);
      total += v;
    }
    return { type: "donut", segments: segments.map(s => s / total) };
  } else {
    const segments = [];
    let total = 0;
    for (let i = 0; i < Math.floor(randomRange(2, 4)); i++) {
      const v = randomRange(0.2, 0.6);
      segments.push(v);
      total += v;
    }
    return { type: "stacked", segments: segments.map(s => s / total) };
  }
}

function createCard(vw, vh, spawnFromRight) {
  const size = CARD_SIZES[Math.floor(Math.random() * CARD_SIZES.length)];
  const speed = randomRange(0.25, 0.6);
  const sizeMultiplier = (size.w * size.h) / (240 * 160);
  const parallaxSpeed = speed * lerp(0.5, 1.0, 1 - sizeMultiplier);

  return {
    x: spawnFromRight ? vw + randomRange(20, 300) : randomRange(-100, vw + 400),
    y: randomRange(-60, vh + 60),
    w: size.w,
    h: size.h,
    rotation: randomRange(-3, 3) * (Math.PI / 180),
    dx: -parallaxSpeed,
    dy: randomRange(-0.05, 0.05),
    content: buildCardContent(),
    hasGreenAccent: Math.random() < 0.22,
    greenSide: Math.random() < 0.5 ? "top" : "left",
    sizeMultiplier,
    opacity: spawnFromRight ? 0 : 1,
  };
}

function createConnection(cardCount, now) {
  let a, b;
  do {
    a = Math.floor(Math.random() * cardCount);
    b = Math.floor(Math.random() * cardCount);
  } while (a === b);
  return {
    from: a,
    to: b,
    cpOffsetX1: randomRange(-60, 60),
    cpOffsetY1: randomRange(-60, 60),
    cpOffsetX2: randomRange(-60, 60),
    cpOffsetY2: randomRange(-60, 60),
    born: now,
  };
}

// --- Main component ---
export default function CanvasBackground() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = vw + "px";
      canvas.style.height = vh + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!stateRef.current) {
        const now = Date.now();
        const cards = [];
        const cols = Math.ceil(Math.sqrt(CARD_COUNT * (vw / vh)));
        const rows = Math.ceil(CARD_COUNT / cols);
        const cellW = (vw + 400) / cols;
        const cellH = (vh + 120) / rows;
        for (let i = 0; i < CARD_COUNT; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const card = createCard(vw, vh, false);
          card.x = col * cellW - 100 + randomRange(0, cellW - card.w);
          card.y = row * cellH - 60 + randomRange(0, cellH - card.h);
          cards.push(card);
        }
        const connections = [];
        for (let i = 0; i < CONNECTION_COUNT; i++) {
          const conn = createConnection(cards.length, now);
          conn.born = now - Math.floor(randomRange(0, CONNECTION_LIFETIME));
          connections.push(conn);
        }
        stateRef.current = { cards, connections, vw, vh, startTime: now };
      } else {
        stateRef.current.vw = vw;
        stateRef.current.vh = vh;
      }
    }

    resize();
    window.addEventListener("resize", resize);


    function getCardCenter(card) {
      return { x: card.x + card.w / 2, y: card.y + card.h / 2 };
    }

    function getCenterOpacity(card, vw, vh) {
      const cx = vw / 2;
      const cy = vh / 2;
      const cardCx = card.x + card.w / 2;
      const cardCy = card.y + card.h / 2;
      const dist = Math.sqrt((cardCx - cx) ** 2 + (cardCy - cy) ** 2);
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      return lerp(0.3, 1.0, Math.min(dist / maxDist, 1));
    }

    function drawCard(card, vw, vh) {
      const baseOpacity = getCenterOpacity(card, vw, vh) * card.opacity;
      if (baseOpacity < 0.001) return;

      const alpha = Math.min(1, baseOpacity * 2.5);

      ctx.save();
      ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
      ctx.rotate(card.rotation);
      ctx.translate(-card.w / 2, -card.h / 2);

      roundRect(ctx, 0, 0, card.w, card.h, 0);
      ctx.fillStyle = `rgba(32, 32, 32, ${alpha * 0.3})`;
      ctx.fill();

      roundRect(ctx, 0, 0, card.w, card.h, 0);
      ctx.strokeStyle = `rgba(50, 50, 50, ${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (card.hasGreenAccent) {
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, 0, 0, card.w, card.h, 0);
        ctx.clip();
        ctx.fillStyle = `rgba(16, 185, 129, ${0.4 * alpha})`;
        if (card.greenSide === "top") {
          ctx.fillRect(0, 0, card.w, 2.5);
        } else {
          ctx.fillRect(0, 0, 2.5, card.h);
        }
        ctx.restore();
      }

      const pad = 14;
      const c = card.content;
      const innerW = card.w - pad * 2;
      const innerH = card.h - pad * 2;
      const white = (a) => `rgba(255, 255, 255, ${Math.min(1, a * 2.5) * alpha})`;
      const green = (a) => `rgba(16, 185, 129, ${Math.min(1, a * 2.5) * alpha})`;
      const red = (a) => `rgba(248, 113, 113, ${Math.min(1, a * 2.5) * alpha})`;

      if (c.type === "sparkline") {
        ctx.fillStyle = white(0.05);
        ctx.fillRect(pad, pad, innerW * 0.4, 2);
        const chartY = pad + 14;
        const chartH = innerH - 18;
        ctx.beginPath();
        for (let i = 0; i < c.points.length; i++) {
          const px = pad + (i / (c.points.length - 1)) * innerW;
          const py = chartY + (1 - c.points[i]) * chartH;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = c.goesUp ? green(0.12) : red(0.1);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const lastX = pad + innerW;
        const lastY = chartY + (1 - c.points[c.points.length - 1]) * chartH;
        ctx.lineTo(lastX, chartY + chartH);
        ctx.lineTo(pad, chartY + chartH);
        ctx.closePath();
        ctx.fillStyle = c.goesUp ? green(0.03) : red(0.02);
        ctx.fill();

      } else if (c.type === "candles") {
        const chartY = pad + 6;
        const chartH = innerH - 10;
        const candleW = Math.min(8, (innerW / c.candles.length) * 0.55);
        const gap = (innerW - candleW * c.candles.length) / (c.candles.length + 1);
        for (let i = 0; i < c.candles.length; i++) {
          const cx = pad + gap * (i + 1) + candleW * i + candleW / 2;
          const { open, close, high, low } = c.candles[i];
          const isUp = close >= open;
          const color = isUp ? green : red;
          ctx.strokeStyle = color(0.08);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, chartY + (1 - high) * chartH);
          ctx.lineTo(cx, chartY + (1 - low) * chartH);
          ctx.stroke();
          const bodyTop = chartY + (1 - Math.max(open, close)) * chartH;
          const bodyBot = chartY + (1 - Math.min(open, close)) * chartH;
          ctx.fillStyle = color(0.1);
          ctx.fillRect(cx - candleW / 2, bodyTop, candleW, Math.max(1, bodyBot - bodyTop));
        }

      } else if (c.type === "kpi") {
        ctx.fillStyle = white(0.06);
        ctx.fillRect(pad, pad, innerW * 0.55, 6);
        ctx.fillStyle = c.goesUp ? green(0.1) : red(0.08);
        ctx.fillRect(pad, pad + 12, innerW * 0.25, 3);
        const chartY = pad + 26;
        const chartH = innerH - 30;
        if (chartH > 10) {
          ctx.beginPath();
          for (let i = 0; i < c.points.length; i++) {
            const px = pad + (i / (c.points.length - 1)) * innerW;
            const py = chartY + (1 - c.points[i]) * chartH;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = c.goesUp ? green(0.1) : red(0.08);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

      } else if (c.type === "bars") {
        ctx.fillStyle = white(0.04);
        ctx.fillRect(pad, pad, innerW * 0.35, 2);
        const chartY = pad + 10;
        const chartH = innerH - 14;
        const barW = Math.min(12, (innerW / c.bars.length) * 0.6);
        const gap = (innerW - barW * c.bars.length) / (c.bars.length + 1);
        const baseY = chartY + chartH;
        for (let i = 0; i < c.bars.length; i++) {
          const bh = c.bars[i] * chartH;
          ctx.fillStyle = white(0.05);
          ctx.fillRect(pad + gap * (i + 1) + barW * i, baseY - bh, barW, bh);
        }

      } else if (c.type === "table") {
        for (let i = 0; i < c.rows.length; i++) {
          const rowY = pad + i * 14;
          if (rowY + 4 > card.h - pad) break;
          const row = c.rows[i];
          ctx.fillStyle = white(0.04);
          ctx.fillRect(pad, rowY, innerW * row.labelW, 2);
          ctx.fillStyle = row.positive ? green(0.08) : red(0.06);
          ctx.fillRect(card.w - pad - innerW * row.valueW, rowY, innerW * row.valueW, 2);
          if (i < c.rows.length - 1) {
            ctx.fillStyle = white(0.02);
            ctx.fillRect(pad, rowY + 10, innerW, 0.5);
          }
        }

      } else if (c.type === "donut") {
        const cx = pad + Math.min(innerW, innerH) * 0.35;
        const cy = pad + innerH * 0.5;
        const outerR = Math.min(innerW, innerH) * 0.32;
        const innerR = outerR * 0.55;
        let angle = -Math.PI / 2;
        for (let i = 0; i < c.segments.length; i++) {
          const sweep = c.segments[i] * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx, cy, outerR, angle, angle + sweep);
          ctx.arc(cx, cy, innerR, angle + sweep, angle, true);
          ctx.closePath();
          ctx.fillStyle = i === 0 ? green(0.08) : white(0.03 + i * 0.01);
          ctx.fill();
          angle += sweep + 0.04;
        }
        const legendX = cx + outerR + 10;
        for (let i = 0; i < Math.min(c.segments.length, 3); i++) {
          const ly = cy - outerR + 8 + i * 12;
          ctx.fillStyle = white(0.04);
          ctx.fillRect(legendX, ly, innerW * 0.2, 2);
        }

      } else if (c.type === "stacked") {
        ctx.fillStyle = white(0.04);
        ctx.fillRect(pad, pad, innerW * 0.5, 2);
        const barY = pad + innerH * 0.4;
        const barH = 8;
        let bx = pad;
        for (let i = 0; i < c.segments.length; i++) {
          const sw = c.segments[i] * innerW;
          ctx.fillStyle = i === 0 ? green(0.1) : white(0.03 + i * 0.015);
          ctx.fillRect(bx, barY, sw - 1, barH);
          bx += sw;
        }
        bx = pad;
        for (let i = 0; i < c.segments.length; i++) {
          const sw = c.segments[i] * innerW;
          ctx.fillStyle = white(0.04);
          ctx.fillRect(bx + 2, barY + barH + 6, sw * 0.5, 2);
          bx += sw;
        }
      }

      ctx.restore();
    }

    function drawConnections(state, time, now) {
      const { cards, connections } = state;
      const pulse = (Math.sin(time * 0.0015) + 1) / 2;

      for (const conn of connections) {
        const a = cards[conn.from];
        const b = cards[conn.to];
        if (!a || !b) continue;

        const age = now - conn.born;
        const fadeIn = Math.min(age / 1000, 1);
        const remaining = CONNECTION_LIFETIME - age;
        const fadeOut = remaining < 1000 ? Math.max(remaining / 1000, 0) : 1;
        const connAlpha = fadeIn * fadeOut;
        if (connAlpha < 0.001) continue;

        const baseOpacity = lerp(0.15, 0.35, pulse) * connAlpha;
        const ac = getCardCenter(a);
        const bc = getCardCenter(b);
        const mx = (ac.x + bc.x) / 2;
        const my = (ac.y + bc.y) / 2;

        ctx.beginPath();
        ctx.moveTo(ac.x, ac.y);
        ctx.bezierCurveTo(
          mx + conn.cpOffsetX1, my + conn.cpOffsetY1,
          mx + conn.cpOffsetX2, my + conn.cpOffsetY2,
          bc.x, bc.y
        );
        ctx.strokeStyle = `rgba(74,222,128,${baseOpacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const dotOpacity = lerp(0.2, 0.4, pulse) * connAlpha;
        ctx.fillStyle = `rgba(74,222,128,${dotOpacity})`;
        ctx.beginPath();
        ctx.arc(ac.x, ac.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bc.x, bc.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function findBestY(cards, skipIndex, vh) {
      const occupied = [];
      for (let i = 0; i < cards.length; i++) {
        if (i === skipIndex) continue;
        occupied.push(cards[i].y + cards[i].h / 2);
      }
      occupied.sort((a, b) => a - b);

      let bestY = vh / 2;
      let bestGap = 0;

      if (occupied.length > 0) {
        const topGap = occupied[0] + 60;
        if (topGap > bestGap) { bestGap = topGap; bestY = topGap / 2 - 60; }
      }
      for (let i = 0; i < occupied.length - 1; i++) {
        const gap = occupied[i + 1] - occupied[i];
        if (gap > bestGap) {
          bestGap = gap;
          bestY = (occupied[i] + occupied[i + 1]) / 2;
        }
      }
      if (occupied.length > 0) {
        const bottomGap = vh + 60 - occupied[occupied.length - 1];
        if (bottomGap > bestGap) { bestY = occupied[occupied.length - 1] + bottomGap / 2; }
      }

      return bestY + randomRange(-30, 30);
    }

    const REPULSION_DIST = 200;
    const REPULSION_STRENGTH = 0.15;

    function applyRepulsion(cards) {
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i];
          const b = cards[j];
          const acx = a.x + a.w / 2;
          const acy = a.y + a.h / 2;
          const bcx = b.x + b.w / 2;
          const bcy = b.y + b.h / 2;

          const ddx = acx - bcx;
          const ddy = acy - bcy;

          const minDistX = (a.w + b.w) / 2 + 30;
          const minDistY = (a.h + b.h) / 2 + 20;
          const overlapX = Math.max(0, minDistX - Math.abs(ddx));
          const overlapY = Math.max(0, minDistY - Math.abs(ddy));

          if (overlapX > 0 && overlapY > 0) {
            const pushY = (ddy >= 0 ? 1 : -1) * REPULSION_STRENGTH;
            a.dy += pushY * 0.5;
            b.dy -= pushY * 0.5;
          }
        }
        cards[i].dy *= 0.98;
      }
    }

    function updateState(state, now) {
      const { cards, connections, vw, vh } = state;
      const margin = 260;

      applyRepulsion(cards);

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        card.x += card.dx;
        card.y += card.dy;
        if (card.opacity < 1) card.opacity = Math.min(card.opacity + 0.005, 1);

        if (card.x < -card.w - margin) {
          const bestY = findBestY(cards, i, vh);
          cards[i] = createCard(vw, vh, true);
          cards[i].y = bestY - cards[i].h / 2;
        }
        if (card.y > vh + margin) card.y = -card.h - margin;
        if (card.y < -card.h - margin) card.y = vh + margin;
      }

      for (let i = 0; i < connections.length; i++) {
        if (now - connections[i].born > CONNECTION_LIFETIME) {
          connections[i] = createConnection(cards.length, now);
        }
      }
    }

    function frame() {
      const state = stateRef.current;
      if (!state) return;
      const { vw, vh, cards } = state;
      const now = Date.now();
      const time = now - state.startTime;

      ctx.clearRect(0, 0, vw, vh);

      drawConnections(state, time, now);

      for (const card of cards) {
        drawCard(card, vw, vh);
      }

      updateState(state, now);
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
