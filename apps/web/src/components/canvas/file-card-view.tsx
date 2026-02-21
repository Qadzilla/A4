import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@a4/ui';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { useAuthToken } from '../../hooks/useAuthToken';
import {
  uploadFile,
  generatePreview,
  getFileUrl,
  formatFileSize,
  getFileTypeLabel,
  pdfjsLib,
} from '../../lib/file-utils';
import type { FileCardData, FileTablePreview } from '../../lib/file-utils';

const ACCEPTED = '.pdf,.csv,.xlsx,.xls,.docx,.png,.jpg,.jpeg,.webp,.txt';

function PreviewTable({ preview }: { preview: FileTablePreview }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-muted/30">
            {preview.columns.map((col, i) => (
              <th
                key={i}
                className="border-b border-border/40 px-3 py-1.5 text-left font-medium text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/10">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-border/20 px-3 py-1.5 text-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Full PDF viewer with zoom controls for the tab view. */
function PdfViewer({ fileId }: { fileId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const nativeSizeRef = useRef({ width: 0, height: 0 });
  const fitZoomRef = useRef(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = getFileUrl(fileId);
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);
        if (cancelled) { pdf.destroy(); return; }

        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) { pdf.destroy(); return; }

        const dpr = window.devicePixelRatio || 1;
        const nativeVp = page.getViewport({ scale: 1 });
        nativeSizeRef.current = { width: nativeVp.width, height: nativeVp.height };

        // Fit-to-width as initial zoom (subtract 32px for padding)
        const availableWidth = container.clientWidth - 32;
        const fitZoom = availableWidth / nativeVp.width;
        fitZoomRef.current = fitZoom;
        setZoom(fitZoom);

        // High-res backing store for crispness
        const renderScale = dpr * 3;
        const viewport = page.getViewport({ scale: renderScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Set initial CSS size
        canvas.style.width = `${nativeVp.width * fitZoom}px`;
        canvas.style.height = `${nativeVp.height * fitZoom}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) { pdf.destroy(); return; }

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        pdf.destroy();
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fileId]);

  // Update CSS size when zoom changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const native = nativeSizeRef.current;
    if (!canvas || !native.width) return;
    canvas.style.width = `${native.width * zoom}px`;
    canvas.style.height = `${native.height * zoom}px`;
  }, [zoom]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.25, fitZoomRef.current * 3));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.25, fitZoomRef.current * 0.25));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(fitZoomRef.current);
  }, []);

  const displayPercent = Math.round((zoom / fitZoomRef.current) * 100);

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto bg-muted/20"
      >
        <div className="flex items-start justify-center min-h-full p-4">
          {loading && (
            <div className="flex items-center justify-center py-24 w-full">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          <canvas ref={canvasRef} className="shadow-lg" />
        </div>
      </div>

      {!loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-background/90 backdrop-blur-md border border-border/60 rounded-lg px-1.5 py-1 shadow-lg">
          <button
            type="button"
            onClick={zoomOut}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="px-2 py-0.5 rounded-md hover:bg-muted transition-colors text-[11px] font-medium text-foreground min-w-[44px] text-center"
          >
            {displayPercent}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export const FileCardView = memo(function FileCardView({
  item,
  workspaceId,
}: {
  item: CanvasItem;
  workspaceId: string;
}) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const renameItem = useCanvasStore((s) => s.renameItem);
  const getToken = useAuthToken();

  const data = item.data as FileCardData | undefined;
  const hasFile = !!data?.fileId;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);

      try {
        const result = await uploadFile(file, workspaceId, getToken);
        const preview = await generatePreview(file);

        const fileCardData: FileCardData = {
          fileId: result.fileId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          ...preview,
        };

        updateItemData(item.id, fileCardData as unknown as Record<string, unknown>);

        // Auto-rename card to filename on first upload
        if (item.name === 'Untitled File') {
          renameItem(item.id, file.name);
        }
      } catch (err: any) {
        setError(err.message ?? 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [workspaceId, getToken, updateItemData, renameItem, item.id, item.name],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
      e.target.value = '';
    },
    [handleFileSelected],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelected(file);
    },
    [handleFileSelected],
  );

  // PDF-specific full-bleed layout with viewer + zoom
  if (hasFile && !isUploading && data!.mimeType === 'application/pdf') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Compact toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-background shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted-foreground shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">{data!.fileName}</p>
            <p className="text-[11px] text-muted-foreground">{getFileTypeLabel(data!.mimeType)} · {formatFileSize(data!.fileSize)}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <a
              href={getFileUrl(data!.fileId)}
              download={data!.fileName}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </a>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Replace
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={onFileInput} className="hidden" />
        </div>

        {/* PDF viewer fills remaining space */}
        <PdfViewer fileId={data!.fileId} />

        {error && (
          <div className="px-4 py-2 border-t border-destructive/30 bg-destructive/5">
            <p className="text-[12px] text-destructive">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Default layout for non-PDF files
  return (
    <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5 text-primary"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
            <p className="text-[11px] text-black/60 dark:text-zinc-300">
              {hasFile ? `${getFileTypeLabel(data!.mimeType)} · ${formatFileSize(data!.fileSize)}` : 'No file uploaded'}
            </p>
          </div>
        </div>

        {/* Upload dropzone (empty state or replace) */}
        {!hasFile || isUploading ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-12 transition-colors duration-200 cursor-pointer',
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-border/60 hover:border-primary/40 hover:bg-primary/5',
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              onChange={onFileInput}
              className="hidden"
            />
            {isUploading ? (
              <>
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-[13px] text-muted-foreground">Uploading...</p>
              </>
            ) : (
              <>
                <div className="size-12 rounded-xl bg-muted/30 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6 text-muted-foreground/60"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-foreground">
                    Click to upload or drag & drop
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    PDF, CSV, Excel, Word, images, text (max 10MB)
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* File metadata */}
            <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-muted-foreground shrink-0"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-[13px] font-medium text-foreground truncate">{data!.fileName}</span>
              </div>
              <div className="flex gap-4 text-[11px] text-muted-foreground">
                <span>Type: {getFileTypeLabel(data!.mimeType)}</span>
                <span>Size: {formatFileSize(data!.fileSize)}</span>
              </div>
            </div>

            {data!.mimeType.startsWith('image/') && (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <p className="text-[11px] text-muted-foreground mb-2">Preview</p>
                <img
                  src={getFileUrl(data!.fileId)}
                  alt={data!.fileName}
                  className="max-h-[400px] w-full object-contain rounded"
                />
              </div>
            )}

            {data!.tablePreview && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Preview (first 5 rows)</p>
                <PreviewTable preview={data!.tablePreview} />
              </div>
            )}

            {data!.textPreview && (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <p className="text-[11px] text-muted-foreground mb-2">Preview</p>
                <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {data!.textPreview}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <a
                href={getFileUrl(data!.fileId)}
                download={data!.fileName}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </a>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Replace
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                onChange={onFileInput}
                className="hidden"
              />
            </div>
          </>
        )}

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-[12px] text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId);
