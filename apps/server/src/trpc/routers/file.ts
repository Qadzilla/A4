import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { documentChunks, files, jobs } from '../../db/schema';
import { protectedProcedure, router } from '../trpc';

export const fileRouter = router({
  /**
   * What the workspace needs to show a document: its name and how many pages
   * it has. Counting means opening the PDF, so this is deliberately its own
   * call rather than a column on list().
   */
  info: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.userId, ctx.userId)));
      if (!file) return null;

      let pageCount = 0;
      if (file.mimeType === 'application/pdf') {
        try {
          const { storage } = await import('../../services/storage');
          const buffer = await storage.get(file.storagePath);
          const mupdf = await import('mupdf');
          pageCount = mupdf.Document.openDocument(buffer, 'application/pdf').countPages();
        } catch (err) {
          // A document we can't open still gets a panel — just without pages
          console.warn(`[file] page count failed for ${input.fileId}:`, err);
        }
      }

      return {
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        pageCount,
      };
    }),

  /**
   * Uploaded documents with processing signals: chunk count (RAG readiness)
   * and any pending/failed import job, so the client can show honest status.
   */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: files.id,
          fileName: files.fileName,
          fileSize: files.fileSize,
          mimeType: files.mimeType,
          createdAt: files.createdAt,
          chunkCount: sql<number>`(
            SELECT count(*) FROM document_chunks
            WHERE document_chunks.file_id = ${files.id}
          )`,
        })
        .from(files)
        .where(and(eq(files.workspaceId, input.workspaceId), eq(files.userId, ctx.userId)))
        .orderBy(desc(files.createdAt));

      // Import job status per file (jobs store fileId inside the JSON payload)
      const importJobs = await ctx.db
        .select({ payload: jobs.payload, status: jobs.status, lastError: jobs.lastError })
        .from(jobs)
        .where(eq(jobs.type, 'import-statement'));
      const importStatus = new Map<string, { status: string; lastError: string | null }>();
      for (const job of importJobs) {
        try {
          const { fileId } = JSON.parse(job.payload) as { fileId?: string };
          if (fileId) importStatus.set(fileId, { status: job.status, lastError: job.lastError });
        } catch {
          // ignore malformed payloads
        }
      }

      return rows.map((row) => ({
        ...row,
        importStatus: importStatus.get(row.id)?.status ?? null,
        importError:
          importStatus.get(row.id)?.status === 'failed'
            ? (importStatus.get(row.id)?.lastError ?? null)
            : null,
      }));
    }),
});
