import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db';
import { documentChunks, files } from '../db/schema';
import { embedSingle } from './embedding';

export interface ChunkSearchResult {
  chunkId: string;
  fileId: string;
  content: string;
  chunkIndex: number;
  score: number;
}

export interface SearchResult extends ChunkSearchResult {
  fileName: string;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  if (mag === 0) return 0;
  return dot / mag;
}

export async function searchChunks(
  queryEmbedding: Float32Array,
  workspaceId: string,
  db: DB,
  options?: { topK?: number; minScore?: number },
): Promise<ChunkSearchResult[]> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.3;

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.workspaceId, workspaceId));

  const scored: ChunkSearchResult[] = [];

  for (const chunk of chunks) {
    const buf = chunk.embedding;
    const embedding = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score >= minScore) {
      scored.push({
        chunkId: chunk.id,
        fileId: chunk.fileId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function searchDocuments(
  query: string,
  workspaceId: string,
  db: DB,
  options?: { topK?: number; minScore?: number },
): Promise<SearchResult[]> {
  const queryEmbedding = await embedSingle(query);
  const results = await searchChunks(queryEmbedding, workspaceId, db, options);

  if (results.length === 0) return [];

  const uniqueFileIds = [...new Set(results.map((r) => r.fileId))];
  const fileRows = await db
    .select({ id: files.id, fileName: files.fileName })
    .from(files)
    .where(inArray(files.id, uniqueFileIds));

  const fileNameMap = new Map(fileRows.map((f) => [f.id, f.fileName]));

  return results.map((r) => ({
    ...r,
    fileName: fileNameMap.get(r.fileId) ?? 'Unknown',
  }));
}
