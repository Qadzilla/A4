import { memo, useEffect, useRef, useState } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import type { FileCardData, FileTablePreview } from '../../lib/file-utils';
import { formatFileSize, getFileTypeLabel, getFileUrl, pdfjsLib } from '../../lib/file-utils';

function MiniTable({ preview }: { preview: FileTablePreview }) {
  const maxCols = 4;
  const maxRows = 3;
  const cols = preview.columns.slice(0, maxCols);
  const rows = preview.rows.slice(0, maxRows);

  return (
    <table className="w-full text-[9px] border-collapse">
      <thead>
        <tr>
          {cols.map((col, i) => (
            <th
              key={i}
              className="border-b border-border/40 px-1 py-0.5 text-left font-medium text-muted-foreground truncate max-w-[60px]"
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.slice(0, maxCols).map((cell, ci) => (
              <td
                key={ci}
                className="border-b border-border/20 px-1 py-0.5 text-foreground/80 truncate max-w-[60px]"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Renders PDF page 1 to an offscreen canvas, converts to blob URL, then displays
 * via <img> — leverages the browser's native high-quality image resampling instead
 * of canvas's inferior downscaling. Always crisp at any card size.
 */
function PdfPreview({ fileId }: { fileId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = getFileUrl(fileId);
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);
        if (cancelled) { pdf.destroy(); return; }

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: dpr * 3 });

        // Render to offscreen canvas
        const offscreen = document.createElement('canvas');
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const ctx = offscreen.getContext('2d');
        if (!ctx) { pdf.destroy(); return; }

        await page.render({ canvasContext: ctx, viewport, canvas: offscreen } as any).promise;
        pdf.destroy();
        if (cancelled) return;

        // Convert to blob URL for <img> display
        const blob = await new Promise<Blob | null>((resolve) => offscreen.toBlob(resolve, 'image/png'));
        if (cancelled || !blob) return;

        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setSrc(blobUrl);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [fileId]);

  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {src && <img src={src} alt="PDF preview" className="h-full w-full object-contain" />}
    </>
  );
}

export const FileCardContent = memo(function FileCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as FileCardData | undefined;

  // Empty state — no file uploaded yet
  if (!data?.fileId) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center border-2 border-dashed border-border/50 rounded-sm bg-muted/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-8 text-muted-foreground/40 mb-1"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[10px] text-muted-foreground/60">Upload a file</span>
      </div>
    );
  }

  // PDF — live render
  if (data.mimeType === 'application/pdf') {
    return (
      <div className="h-full w-full flex flex-col rounded-sm border border-border/40 bg-white dark:bg-zinc-50 overflow-hidden">
        <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <PdfPreview fileId={data.fileId} />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 border-t border-border/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted-foreground shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-[9px] text-muted-foreground truncate">{data.fileName}</span>
        </div>
      </div>
    );
  }

  // Image — served directly from server at full resolution
  if (data.mimeType.startsWith('image/')) {
    return (
      <div className="h-full w-full flex flex-col rounded-sm border border-border/40 bg-background overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          <img
            src={getFileUrl(data.fileId)}
            alt={data.fileName}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 border-t border-border/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted-foreground shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-[9px] text-muted-foreground truncate">{data.fileName}</span>
        </div>
      </div>
    );
  }

  // Table preview (CSV / Excel)
  if (data.tablePreview) {
    return (
      <div className="h-full w-full flex flex-col rounded-sm border border-border/40 bg-background overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 border-b border-border/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted-foreground shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          <span className="text-[9px] text-muted-foreground truncate">{data.fileName}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-1 py-0.5">
          <MiniTable preview={data.tablePreview} />
        </div>
      </div>
    );
  }

  // Text preview (TXT / DOCX)
  if (data.textPreview) {
    return (
      <div className="h-full w-full flex flex-col rounded-sm border border-border/40 bg-background overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 border-b border-border/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted-foreground shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="text-[9px] text-muted-foreground truncate">{data.fileName}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-2 py-1">
          <p className="text-[9px] leading-tight text-foreground/70 whitespace-pre-wrap line-clamp-[8]">
            {data.textPreview}
          </p>
        </div>
      </div>
    );
  }

  // Fallback — file icon + name + size
  return (
    <div className="h-full w-full flex flex-col items-center justify-center rounded-sm border border-border/40 bg-background gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-muted-foreground/50">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="text-[10px] font-medium text-foreground/80 truncate max-w-[90%] px-2">{data.fileName}</span>
      <span className="text-[9px] text-muted-foreground">
        {getFileTypeLabel(data.mimeType)} · {formatFileSize(data.fileSize)}
      </span>
    </div>
  );
});
