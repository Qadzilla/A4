import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { documentChunks, files } from '../db/schema';
import { chunkText } from './chunking';
import { embedTexts } from './embedding';
import { JOB_TYPES, enqueueJob } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

export async function embedFile(fileId: string, db: DB): Promise<{ chunksCreated: number }> {
  // Look up file
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  // Extract text
  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    return { chunksCreated: 0 };
  }

  // Chunk
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { chunksCreated: 0 };
  }

  // Embed (on the user's own OpenAI key when they've configured one)
  const embeddings = await embedTexts(
    chunks.map((c) => c.content),
    { userId: file.userId, db },
  );

  // Delete existing chunks (idempotent re-embedding)
  await db.delete(documentChunks).where(eq(documentChunks.fileId, fileId));

  // Insert new chunks
  const now = new Date();
  await db.insert(documentChunks).values(
    chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      fileId,
      workspaceId: file.workspaceId,
      userId: file.userId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: Buffer.from(embeddings[i]!.buffer),
      createdAt: now,
    })),
  );

  // Queue entity extraction — additive to RAG, so a queue failure never
  // blocks embedding
  try {
    await enqueueJob(JOB_TYPES.extractEntities, { fileId }, { db });
  } catch (err) {
    console.warn(`[entities] Failed to enqueue extraction for file ${fileId}:`, err);
  }

  return { chunksCreated: chunks.length };
}
