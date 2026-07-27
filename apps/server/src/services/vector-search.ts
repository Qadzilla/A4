import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db';
import { documentChunks, files } from '../db/schema';
import { embedSingle } from './embedding';
import { keywordSearchChunks } from './keyword-search';

/** Standard RRF constant — dampens the influence of top ranks. */
const RRF_K = 60;
/** How many candidates each signal contributes before fusion. */
const SIGNAL_FETCH_LIMIT = 20;

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

/**
 * Fuses ranked result lists via Reciprocal Rank Fusion: each chunk scores
 * Σ 1/(RRF_K + rank) across the lists it appears in. Rank-based, so the
 * incompatible score scales of BM25 and cosine similarity never need
 * normalizing against each other.
 */
export function reciprocalRankFusion(
  lists: ChunkSearchResult[][],
  topK: number,
): ChunkSearchResult[] {
  const fused = new Map<string, ChunkSearchResult>();

  for (const list of lists) {
    for (const [rank, result] of list.entries()) {
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = fused.get(result.chunkId);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(result.chunkId, { ...result, score: contribution });
      }
    }
  }

  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Hybrid two-signal search: BM25 keyword matching (exact names, amounts,
 * account numbers) and embedding similarity (meaning), fused with RRF.
 * When the embedding service is unavailable, degrades to keyword-only.
 */
export async function searchDocuments(
  query: string,
  workspaceId: string,
  db: DB,
  options?: { topK?: number; minScore?: number },
): Promise<SearchResult[]> {
  const topK = options?.topK ?? 5;

  let semantic: ChunkSearchResult[] = [];
  try {
    const queryEmbedding = await embedSingle(query);
    semantic = await searchChunks(queryEmbedding, workspaceId, db, {
      topK: SIGNAL_FETCH_LIMIT,
      minScore: options?.minScore,
    });
  } catch {
    // Embedding unavailable (e.g. no OPENAI_API_KEY) — keyword-only is still useful
  }
  const keyword = await keywordSearchChunks(query, workspaceId, db, {
    topK: SIGNAL_FETCH_LIMIT,
  });

  const results = reciprocalRankFusion([semantic, keyword], topK);

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
