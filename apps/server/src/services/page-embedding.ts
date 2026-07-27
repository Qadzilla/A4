import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { files, pageEmbeddings } from '../db/schema';
import { env } from '../env';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { embedPageImages } from './visual-embedding';

/**
 * Renders each PDF page and embeds it with a multimodal model so pages become
 * findable by visual description ("the page with the pie chart"). The most
 * expensive per-document feature in Phase 6 — queue-based, presence-gated on
 * VOYAGE_API_KEY, and page-capped.
 */

/** Modest render scale — retrieval needs layout, not print fidelity. */
const RENDER_SCALE = 1.5;
/** Hard page cap per file. */
const MAX_PAGES = 200;
/** Voyage batch size per API call. */
const EMBED_BATCH_SIZE = 8;

export async function embedFilePages(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('embed-pages payload requires a fileId string');
  }

  if (!env.VOYAGE_API_KEY) return; // feature disabled — treat as done, not failed

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran
  if (file.mimeType !== 'application/pdf') return;

  const buffer = await storage.get(file.storagePath);
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  const pageCount = Math.min(doc.countPages(), MAX_PAGES);
  if (pageCount === 0) return;

  const matrix = mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE);
  const pngBuffers: Buffer[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    pngBuffers.push(Buffer.from(pixmap.asPNG()));
  }

  // Embed in batches BEFORE touching existing rows — an API failure mid-way
  // must leave the previous (complete) index intact for the retry
  const embeddings: Float32Array[] = [];
  for (let i = 0; i < pngBuffers.length; i += EMBED_BATCH_SIZE) {
    const batch = pngBuffers.slice(i, i + EMBED_BATCH_SIZE);
    embeddings.push(...(await embedPageImages(batch)));
  }

  await db.delete(pageEmbeddings).where(eq(pageEmbeddings.fileId, fileId));
  const now = new Date();
  await db.insert(pageEmbeddings).values(
    embeddings.map((embedding, i) => ({
      id: crypto.randomUUID(),
      fileId,
      workspaceId: file.workspaceId,
      userId: file.userId,
      page: i + 1,
      embedding: Buffer.from(embedding.buffer),
      createdAt: now,
    })),
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerPageEmbeddingHandler(): void {
  registerJobHandler(JOB_TYPES.embedPages, embedFilePages);
}
