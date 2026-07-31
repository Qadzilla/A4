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

/**
 * Reports height to the parent so the panel can size itself to the content.
 *
 * Measures the content wrapper, not documentElement. `documentElement`'s
 * scrollHeight can never be less than the frame's own viewport, so reporting
 * it feeds the parent's height back into the measurement: every cycle the
 * frame grew, the next report came back larger, and a panel ratcheted its way
 * up to the ceiling regardless of what was in it.
 */
const MEASURE_SCRIPT = `
  const root = document.querySelector('.panel-root');
  // Both of these are driven by content. documentElement.scrollHeight is not:
  // it can never be less than the frame's own viewport, so reporting it feeds
  // the parent's height straight back into the next measurement.
  const measure = () => Math.ceil(Math.max(root.scrollHeight, document.body.scrollHeight));
  let last = -1;
  const send = () => {
    const height = measure();
    // The first call can land before layout, and a frame that reports zero is
    // a frame the parent has to ignore — so keep looking until there's
    // something real to report.
    if (height <= 0 || height === last) return;
    last = height;
    parent.postMessage({ source: 'basis-panel', id: window.name, height }, '*');
  };
  new ResizeObserver(send).observe(root);
  window.addEventListener('load', send);
  // Fonts and the first layout pass can both land after the observer is set
  // up, and neither reliably resizes the element it is watching.
  requestAnimationFrame(send);
  for (const delay of [0, 60, 250, 800]) setTimeout(send, delay);
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
        // No slack added here: the reported height is the content's own, so
        // padding it would just be another way to grow without cause.
        setHeight(Math.min(data.height, 4000));
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
