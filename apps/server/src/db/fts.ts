import type { Database } from 'better-sqlite3';

/**
 * Creates the FTS5 index over document_chunks.content plus triggers that keep
 * it in sync on insert/update/delete. Idempotent — safe to run on every boot.
 *
 * Skips silently when document_chunks does not exist yet (fresh DB before
 * `drizzle-kit push`, or a bare in-memory test DB) since the triggers would
 * fail to reference it.
 */
export function setupDocumentChunksFts(sqlite: Database): void {
  const chunksTable = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_chunks'`)
    .get();
  if (!chunksTable) return;

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS document_chunks_fts_ai AFTER INSERT ON document_chunks BEGIN
      INSERT INTO document_chunks_fts (content, chunk_id) VALUES (new.content, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS document_chunks_fts_ad AFTER DELETE ON document_chunks BEGIN
      DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS document_chunks_fts_au AFTER UPDATE OF content ON document_chunks BEGIN
      DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
      INSERT INTO document_chunks_fts (content, chunk_id) VALUES (new.content, new.id);
    END;
  `);

  // Backfill chunks that predate the FTS table (first boot after this feature ships)
  const ftsCount = sqlite.prepare('SELECT count(*) AS n FROM document_chunks_fts').get() as {
    n: number;
  };
  if (ftsCount.n === 0) {
    sqlite.exec(`
      INSERT INTO document_chunks_fts (content, chunk_id)
      SELECT content, id FROM document_chunks;
    `);
  }
}
