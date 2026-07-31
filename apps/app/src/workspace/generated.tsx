import { useEffect, useRef, useState } from 'react';

/**
 * An answer Bip composed, rather than a layout chosen in advance.
 *
 * It renders in an iframe with `allow-scripts` but deliberately without
 * `allow-same-origin`, which puts it in an opaque origin: it can't reach this
 * app's DOM, storage, cookies or session, and any request it tried to make
 * would go out unauthenticated. The only thing it can do is draw, and tell us
 * how tall it turned out.
 *
 * The product's own materials are injected around it so a generated answer
 * looks like it belongs on the desk rather than pasted onto it.
 */

/**
 * The bank of elements Bip composes from — the full set is laid out side by
 * side at `/elements.html`, which is where changes here should be checked.
 *
 * Shipping the stylesheet rather than asking for CSS in the payload is what
 * keeps generated answers consistent: Bip writes `<div class="card">` and the
 * spacing, hairlines and figures come out the same every time, which also
 * leaves nearly all of the HTML budget for content.
 *
 * Data surfaces are deliberately light and cool rather than the warm paper of
 * the landing page: cream on cream has too little contrast to read a column of
 * figures against. Numbers use tabular figures in the sans — not a monospace
 * face, which lines up just as well but reads like a terminal.
 */
const FRAME_STYLES = `
  :root {
    --surface: #ffffff;
    --surface-2: #fafbfc;
    --ink: #0d1117;
    --ink-2: #384250;
    --ink-3: #6b7480;
    --ink-4: #98a1ae;
    --line: #eceef2;
    --line-2: #e1e4ea;
    --accent: #2b59ff;
    --accent-tint: #eef2ff;
    --pos: #0e8f5d;  --pos-tint: #e8f6ef;
    --neg: #d8453c;  --neg-tint: #fdeceb;
    --hold: #b7791f; --hold-tint: #fdf5e6;
    --r-sm: 6px; --r: 10px; --r-lg: 14px;
    --shadow: 0 1px 2px rgba(13,17,23,.04), 0 4px 14px -6px rgba(13,17,23,.10);

    /* Panels generated before this palette wrote their own CSS against the old
       names. They're stored, so they still have to render. */
    --paper: var(--surface-2);
    --hairline: var(--line);
    --muted: var(--ink-3);
    --faint: var(--ink-4);
    --good: var(--pos);
    --bad: var(--neg);
    --warn: var(--hold);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: transparent; color: var(--ink);
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px; line-height: 1.6; letter-spacing: -0.006em;
    -webkit-font-smoothing: antialiased;
  }
  .num { font-variant-numeric: tabular-nums lining-nums; font-feature-settings: "tnum" 1; }
  h1, h2, h3 { margin: 0 0 8px; font-weight: 600; letter-spacing: -0.02em; }
  h1 { font-size: 20px; } h2 { font-size: 16px; } h3 { font-size: 14px; }
  p { margin: 0 0 10px; }
  svg { max-width: 100%; height: auto; }
  .stack > * + * { margin-top: 20px; }

  .card { background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--r-lg); box-shadow: var(--shadow); padding: 24px; }
  .label { font-size: 12px; font-weight: 500; color: var(--ink-3); }
  .sub { font-size: 13px; color: var(--ink-3); }
  .pos { color: var(--pos); } .neg { color: var(--neg); } .hold { color: var(--hold); }
  .muted { color: var(--ink-3); } .faint { color: var(--ink-4); } .accent { color: var(--accent); }

  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500;
          padding: 3px 9px; border-radius: 99px; background: var(--surface-2);
          color: var(--ink-3); border: 1px solid var(--line); }
  .chip.p { background: var(--pos-tint); color: var(--pos); border-color: transparent; }
  .chip.h { background: var(--hold-tint); color: var(--hold); border-color: transparent; }
  .chip.a { background: var(--accent-tint); color: var(--accent); border-color: transparent; }

  .lead { font-size: 44px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.05; }
  .lead-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }

  .figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1px;
          background: var(--line); border-radius: var(--r); overflow: hidden; }
  .figs > div { background: var(--surface); padding: 16px 18px; }
  .figs .v { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; }

  .band { display: grid; grid-template-columns: 44px 1fr 128px; align-items: center; gap: 14px; padding: 7px 0; }
  .band .r { font-size: 13px; font-weight: 600; color: var(--ink-3); text-align: right; }
  .band .t { height: 30px; border-radius: var(--r-sm); background: var(--surface-2);
             border: 1px solid var(--line); position: relative; overflow: hidden; }
  .band .t i { position: absolute; inset: 0 auto 0 0; background: var(--accent); opacity: .10; }
  .band.on .r { color: var(--accent); }
  .band.on .t { border-color: transparent; background: var(--accent-tint); }
  .band.on .t i { opacity: .22; }
  .band .g { font-size: 12px; color: var(--ink-4); }
  .band.on .g { color: var(--accent); font-weight: 500; }

  .meter { height: 10px; border-radius: 99px; background: var(--line); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--accent); border-radius: 99px; }

  .opt { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
         padding: 16px 0; border-top: 1px solid var(--line); }
  .opt:first-of-type { border-top: 0; padding-top: 4px; }
  .opt h4 { margin: 0 0 4px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
  .opt p { margin: 0; font-size: 13px; color: var(--ink-3); }
  .opt .w { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; white-space: nowrap; }

  .ba { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; }
  .ba .s { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r); padding: 16px 18px; }
  .ba .s.next { background: var(--accent-tint); border-color: transparent; }
  .ba .s .v { font-size: 26px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; }
  .ba .s.now .v { color: var(--ink-3); }
  .ba .s.next .label, .ba .s.next .v { color: var(--accent); }
  .ba .mid { display: flex; align-items: center; color: var(--ink-4); font-size: 18px; }

  .ev { display: grid; grid-template-columns: 96px 20px 1fr; align-items: start; padding: 0 0 22px; }
  .ev:last-child { padding-bottom: 0; }
  .ev .d { font-size: 12px; color: var(--ink-4); padding: 1px 14px 0 0; text-align: right; }
  .ev .m { position: relative; display: flex; justify-content: center; }
  .ev .m::before { content: ""; width: 9px; height: 9px; border-radius: 50%;
                   background: var(--line-2); margin-top: 6px; z-index: 1; }
  .ev:not(:last-child) .m::after { content: ""; position: absolute; top: 16px; bottom: -22px;
                                   width: 1px; background: var(--line); }
  .ev.done .m::before { background: var(--pos); }
  .ev.now .m::before { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }
  .ev .b { padding-left: 14px; font-size: 13.5px; }
  .ev.now .b { font-weight: 600; }
  .ev .b em { font-style: normal; display: block; font-size: 12.5px; color: var(--ink-3); font-weight: 400; }

  .cd { display: flex; align-items: baseline; gap: 8px; }
  .cd b { font-size: 48px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; }
  .cd span { font-size: 15px; color: var(--ink-3); }

  .split { display: flex; gap: 3px; height: 36px; }
  .split i { border-radius: var(--r-sm); }
  .legend { display: grid; gap: 10px; margin-top: 16px; }
  .legend div { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 10px;
                align-items: center; font-size: 13px; }
  .legend b { width: 8px; height: 8px; border-radius: 2px; }
  .legend .pct { color: var(--ink-4); font-size: 12px; min-width: 34px; text-align: right; }
  .legend .amt { font-weight: 500; min-width: 66px; text-align: right; }

  /* A table with more columns than the panel is wide scrolls rather than
     losing its right-hand columns off the edge. Scoped to cards holding a
     table so it can't clip the elements that draw outside their box. */
  .card:has(table) { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 12px; font-weight: 500; color: var(--ink-4); text-align: left; padding: 0 0 10px; }
  thead th.r, td.r { text-align: right; }
  tbody td { padding: 13px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
  .tick { font-weight: 600; letter-spacing: -0.01em; }
  .none { color: var(--ink-4); }

  .callout { background: linear-gradient(180deg, var(--accent-tint), #fff);
             border: 1px solid #dbe3ff; border-radius: var(--r-lg); padding: 22px 24px; }
  .callout .label { color: var(--accent); }
  .callout .v { font-size: 32px; font-weight: 600; letter-spacing: -0.03em; color: var(--accent); margin: 6px 0; }

  .step { display: grid; grid-template-columns: 26px 1fr; gap: 14px; padding: 0 0 20px; }
  .step:last-child { padding-bottom: 0; }
  .step .i { width: 24px; height: 24px; border-radius: 50%; background: var(--surface-2);
             border: 1px solid var(--line); font-size: 12px; font-weight: 600; color: var(--ink-3);
             display: flex; align-items: center; justify-content: center; }
  .step h4 { margin: 2px 0 3px; font-size: 13.5px; font-weight: 600; }
  .step p { margin: 0; font-size: 13px; color: var(--ink-3); }

  .quote { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .quote .t { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
  .quote .p { font-size: 30px; font-weight: 600; letter-spacing: -0.03em; }

  .range { position: relative; height: 6px; border-radius: 99px; margin: 26px 0 8px;
           background: linear-gradient(90deg, var(--line-2), var(--accent) 140%); }
  .range .pin { position: absolute; top: -6px; width: 3px; height: 18px; border-radius: 99px; background: var(--ink); }
  .range .cap { position: absolute; top: -26px; transform: translateX(-50%);
                font-size: 12px; font-weight: 600; white-space: nowrap; }
  .ends { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-4); }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px,1fr)); gap: 18px 20px; }
  .stats .k { font-size: 12px; color: var(--ink-4); }
  .stats .v { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin-top: 2px; }

  .def { background: var(--surface-2); border-radius: var(--r); padding: 16px 18px; }
  .def h4 { margin: 0 0 4px; font-size: 13.5px; font-weight: 600; }
  .def p { margin: 0; font-size: 13px; color: var(--ink-3); }
  .def .term { display: inline-block; margin-top: 8px; font-size: 11.5px; color: var(--ink-4);
               background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; }

  .caveat { display: grid; grid-template-columns: 18px 1fr; gap: 12px; padding: 14px 16px;
            background: var(--hold-tint); border-radius: var(--r); font-size: 13px; color: #7c5310; }
  .caveat .i { width: 16px; height: 16px; border-radius: 50%; background: var(--hold); color: #fff;
               font-size: 11px; font-weight: 700; display: flex; align-items: center;
               justify-content: center; margin-top: 2px; }

  .row { display: grid; grid-template-columns: 8px 1fr auto; gap: 12px; align-items: center;
         padding: 13px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
  .row:first-child { border-top: 0; }
  .row i { width: 7px; height: 7px; border-radius: 50%; }
  .row .v { font-size: 13px; color: var(--ink-3); }
`;

/** Reports height to the parent so the panel can size itself to the content. */
const MEASURE_SCRIPT = `
  const send = () => parent.postMessage(
    { source: 'basis-panel', id: window.name, height: document.documentElement.scrollHeight },
    '*'
  );
  new ResizeObserver(send).observe(document.documentElement);
  window.addEventListener('load', send);
  send();
`;

export function GeneratedPanel({ id, html }: { id: string; html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; id?: string; height?: number } | null;
      if (!data || data.source !== 'basis-panel' || data.id !== id) return;
      if (typeof data.height === 'number' && data.height > 0) {
        // A little slack so a scrollbar never appears for a rounding error
        setHeight(Math.min(data.height + 8, 4000));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id]);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLES}</style></head><body>${html}<script>${MEASURE_SCRIPT}<\/script></body></html>`;

  return (
    <iframe
      ref={ref}
      name={id}
      title="Generated answer"
      srcDoc={doc}
      // No allow-same-origin: the frame cannot touch this app or its session
      sandbox="allow-scripts"
      className="w-full border-0"
      style={{ height }}
    />
  );
}
