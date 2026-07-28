import { FileText } from 'lucide-react';

export function DocumentsSurface() {
  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <p className="eyebrow mb-1.5">Documents</p>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Every statement, made queryable</h1>
      <p className="mb-8 max-w-md text-sm text-muted">
        Statements, W-2s, and 1099s get parsed, entity-linked, and reconciled against your actual
        history. The pipeline is live on the server — the upload surface wires up with the import
        flow in P3.
      </p>
      <div className="flex max-w-md flex-col items-center rounded-card border border-dashed border-hairline p-10 text-center">
        <FileText size={24} strokeWidth={1.5} className="mb-3 text-faint" />
        <p className="text-sm font-medium">Drop zone arrives with the import flow</p>
        <p className="mt-1 text-xs text-muted">
          PDF · CSV · searchable by keyword, meaning, and page
        </p>
      </div>
    </div>
  );
}
