import { memo } from 'react';
import type { EmbedCardData } from '../../lib/embed-utils';
import { isValidEmbedUrl } from '../../lib/embed-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const EmbedCardContent = memo(function EmbedCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as EmbedCardData | undefined;
  const url = data?.url ?? '';
  const title = data?.title ?? '';
  const valid = url !== '' && isValidEmbedUrl(url);

  return (
    <div className="flex h-full w-full flex-col bg-card overflow-hidden shadow-md">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/40 bg-muted/30 shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3 text-muted-foreground shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-[10px] text-muted-foreground truncate">
          {title || (valid ? new URL(url).hostname : 'Embed')}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {valid ? (
          <iframe
            src={url}
            title={title || 'Embedded content'}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            className="h-full w-full border-0 pointer-events-none"
          />
        ) : url !== '' ? (
          <div className="flex h-full w-full items-center justify-center p-3">
            <p className="text-[11px] text-destructive text-center">Invalid URL</p>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
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
            <span className="text-[11px] text-muted-foreground">Paste a URL</span>
          </div>
        )}
      </div>
    </div>
  );
});
