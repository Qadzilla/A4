import { useAuthToken } from '@/auth/useAuthToken';
import { useTRPC } from '@/lib/trpc';
import { useSpaceId } from '@/surfaces/layout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function DocumentsSurface() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const queryClient = useQueryClient();
  const getToken = useAuthToken();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importHoldings, setImportHoldings] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: documents = [], isLoading } = useQuery({
    ...trpc.file.list.queryOptions({ workspaceId: spaceId }),
    // Poll while anything is still processing so status flips without a reload
    refetchInterval: (query) =>
      query.state.data?.some(
        (d) => d.chunkCount === 0 || d.importStatus === 'pending' || d.importStatus === 'running',
      )
        ? 4000
        : false,
  });

  const uploadFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setIsUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('workspaceId', spaceId);
        if (importHoldings) form.append('importHoldings', '1');

        const token = await getToken();
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: form,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Upload failed');
        }
        await queryClient.invalidateQueries({ queryKey: trpc.file.list.queryKey() });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [spaceId, importHoldings, getToken, queryClient, trpc],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      const token = await getToken();
      await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await queryClient.invalidateQueries({ queryKey: trpc.file.list.queryKey() });
    },
    [getToken, queryClient, trpc],
  );

  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <p className="eyebrow mb-1.5">Documents</p>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Every statement, made queryable</h1>
      <p className="mb-8 max-w-md text-sm text-muted">
        Statements and tax forms get parsed, entity-linked, and made searchable. Brokerage
        statements can also import straight into your portfolio.
      </p>

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void uploadFile(file);
        }}
        className={`flex w-full max-w-xl flex-col items-center rounded-card border border-dashed p-10 text-center transition-colors ${
          isDragging
            ? 'border-accent bg-accent-soft'
            : 'border-hairline bg-surface hover:border-accent'
        }`}
      >
        {isUploading ? (
          <Loader2 size={24} strokeWidth={1.5} className="mb-3 animate-spin text-accent" />
        ) : (
          <Upload size={24} strokeWidth={1.5} className="mb-3 text-accent" />
        )}
        <p className="text-sm font-medium">
          {isUploading ? 'Uploading…' : 'Drop a statement here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted">PDF · CSV · Excel · up to 10 MB</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls,.docx,.png,.jpg,.jpeg,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = '';
        }}
      />

      <label className="mt-3 flex max-w-xl cursor-pointer items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={importHoldings}
          onChange={(e) => setImportHoldings(e.target.checked)}
          className="accent-accent"
        />
        Import holdings from this statement into my portfolio
      </label>

      {uploadError && (
        <div className="mt-4 max-w-xl rounded-card border border-bad/30 bg-bad-soft px-4 py-2.5 text-sm text-bad">
          {uploadError}
        </div>
      )}

      {/* Document list */}
      <section className="mt-10 max-w-xl">
        <h2 className="eyebrow mb-3">Uploaded</h2>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-card border border-hairline bg-surface" />
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet — your uploads land here.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-hairline bg-surface">
            {documents.map((d, i) => (
              <div
                key={d.id}
                className={`group flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-hairline' : ''}`}
              >
                <FileText size={16} strokeWidth={1.75} className="shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs text-muted">
                    {fmtSize(d.fileSize)}
                    {' · '}
                    {d.chunkCount > 0 ? 'searchable' : 'processing…'}
                    {d.importStatus &&
                      (d.importStatus === 'done' ? (
                        <span className="text-good"> · imported to portfolio</span>
                      ) : d.importStatus === 'failed' ? (
                        <span className="text-bad"> · import failed</span>
                      ) : (
                        <span className="text-accent"> · importing…</span>
                      ))}
                  </p>
                  {d.importError && <p className="mt-0.5 text-xs text-bad">{d.importError}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void deleteFile(d.id)}
                  className="rounded-card p-1.5 text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                  aria-label={`Delete ${d.fileName}`}
                >
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
