import { memo, useEffect, useRef, useState } from 'react';
import type { EmbedCardData } from '../../lib/embed-utils';
import { isValidEmbedUrl } from '../../lib/embed-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

export const EmbedCardView = memo(
  function EmbedCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<EmbedCardData>(() => {
      const d = item.data as EmbedCardData | undefined;
      return { url: d?.url ?? '', title: d?.title ?? '' };
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as EmbedCardData | undefined;
      setData({ url: d?.url ?? '', title: d?.title ?? '' });
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, data as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [data, item.id, updateItemData]);

    // Cleanup timers
    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<EmbedCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const valid = data.url !== '' && isValidEmbedUrl(data.url);
    const hasUrl = data.url.trim() !== '';

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-card px-4 py-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-primary"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <input
            type="text"
            value={data.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Title (optional)"
            className="w-32 shrink-0 rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            value={data.url}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://..."
            className="flex-1 min-w-0 rounded-md border border-border bg-muted/20 px-2.5 py-1 text-[12px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
          {valid && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open
            </a>
          )}
          {saveStatus !== 'idle' && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 relative">
          {valid ? (
            <iframe
              src={data.url}
              title={data.title || 'Embedded content'}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              className="h-full w-full border-0"
            />
          ) : hasUrl ? (
            <div className="flex h-full w-full items-center justify-center bg-muted/30">
              <div className="text-center space-y-2">
                <p className="text-[13px] text-destructive">Invalid URL</p>
                <p className="text-[11px] text-muted-foreground">
                  Only http:// and https:// URLs are supported
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/30">
              <div className="size-12 rounded-2xl bg-muted/30 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6 text-muted-foreground/40"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-muted-foreground">
                  Paste a URL above to embed content
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Google Sheets, YouTube, dashboards, and more
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
