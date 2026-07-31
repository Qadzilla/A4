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

const FRAME_STYLES = `
  :root {
    --paper: #e2d8c3;
    --surface: #faf7f0;
    --ink: #1c1813;
    --muted: #5c6472;
    --faint: #9aa2b1;
    --hairline: #d9d0bd;
    --accent: #2b59ff;
    --good: #166b4d;
    --bad: #b03a2e;
    --warn: #a26a12;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  /* Tabular figures line up in columns, the way the rest of the product does */
  .n, table, .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  h1, h2, h3 { margin: 0 0 8px; font-weight: 600; letter-spacing: -0.01em; }
  h1 { font-size: 20px; } h2 { font-size: 16px; } h3 { font-size: 14px; }
  p { margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 500; color: var(--muted); font-size: 11px;
       letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 8px 6px 0; }
  td { padding: 7px 8px 7px 0; border-top: 1px solid var(--hairline); }
  tr:first-child td { border-top: 0; }
  .card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 2px; padding: 12px; }
  .muted { color: var(--muted); } .faint { color: var(--faint); }
  .good { color: var(--good); } .bad { color: var(--bad); } .warn { color: var(--warn); }
  .accent { color: var(--accent); }
  svg { max-width: 100%; height: auto; }
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
