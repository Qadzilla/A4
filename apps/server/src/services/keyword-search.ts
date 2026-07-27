import { sql } from 'drizzle-orm';
import type { DB } from '../db';
import type { ChunkSearchResult } from './vector-search';

/**
 * Converts free text into a safe FTS5 query. Each whitespace-separated term
 * becomes a quoted phrase (so punctuation like "$4,251.03" matches its token
 * sequence literally), joined with OR — BM25 ranks chunks matching more terms
 * higher, and recall matters more than precision here because results are
 * fused with the semantic signal downstream.
 *
 * Returns null when nothing searchable remains.
 */
export function sanitizeFtsQuery(query: string): string | null {
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter((t) => t.length > 0);

  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

/**
 * BM25 keyword search over document chunks via the document_chunks_fts index.
 * Scores are normalized to (0, 1] by rank position — raw BM25 magnitudes are
 * not comparable across queries, and rank is all the RRF fusion needs.
 *
 * Returns [] when the query is unsearchable or the FTS index is missing
 * (never throws on malformed input).
 */
export async function keywordSearchChunks(
  query: string,
  workspaceId: string,
  db: DB,
  options?: { topK?: number },
): Promise<ChunkSearchResult[]> {
  const topK = options?.topK ?? 5;
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  try {
    const rows = db.all(sql`
      SELECT
        c.id AS chunkId,
        c.file_id AS fileId,
        c.content AS content,
        c.chunk_index AS chunkIndex
      FROM document_chunks_fts
      JOIN document_chunks c ON c.id = document_chunks_fts.chunk_id
      WHERE document_chunks_fts MATCH ${ftsQuery}
        AND c.workspace_id = ${workspaceId}
      ORDER BY bm25(document_chunks_fts)
      LIMIT ${topK}
    `) as Array<{ chunkId: string; fileId: string; content: string; chunkIndex: number }>;

    return rows.map((row, i) => ({
      ...row,
      score: 1 / (1 + i),
    }));
  } catch {
    return [];
  }
}
