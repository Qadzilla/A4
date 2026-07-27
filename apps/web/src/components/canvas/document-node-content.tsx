import { memo } from 'react';
import { getFileTypeLabel } from '../../lib/file-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export interface DocumentNodeData {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** The cited passage this node pins */
  snippet?: string;
  /** 1-based citation number from the chat message it was dragged from */
  citationIndex?: number;
}

export const DocumentNodeContent = memo(function DocumentNodeContent({
  item,
}: {
  item: CanvasItem;
}) {
  const data = item.data as DocumentNodeData | undefined;

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 bg-muted/20 px-3 py-1.5 min-w-0">
        {data?.citationIndex !== undefined && (
          <span className="shrink-0 inline-flex items-center justify-center size-4 text-[9px] font-medium bg-[var(--color-paige)]/10 text-[var(--color-paige)] rounded-sm">
            {data.citationIndex}
          </span>
        )}
        <span className="text-[10px] font-medium text-foreground truncate flex-1">
          {data?.fileName ?? 'Document'}
        </span>
        <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
          {data ? getFileTypeLabel(data.mimeType) : 'DOC'}
        </span>
      </div>

      {/* Body — the pinned passage */}
      <div className="flex-1 px-3 py-2 min-h-0 overflow-hidden">
        {data?.snippet ? (
          <blockquote className="border-l-2 border-[var(--color-paige)]/30 pl-2 text-[11px] leading-snug text-foreground/80 italic line-clamp-[7]">
            {data.snippet}
          </blockquote>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            Open to view the document
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pb-1.5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pinned source</p>
      </div>
    </div>
  );
});
