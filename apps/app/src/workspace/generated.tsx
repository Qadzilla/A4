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

// The bank of elements lives in one file, laid out side by side by
// `elements.html` and inlined here — the frame has an opaque origin, so it
// cannot fetch a stylesheet of its own.
import FRAME_STYLES from './panel.css?raw';

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

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLES}</style></head><body class="panel-frame"><div class="panel-root">${html}</div><script>${MEASURE_SCRIPT}<\/script></body></html>`;

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
