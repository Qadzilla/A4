import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupDocumentChunksFts } from '../db/fts';
import * as schema from '../db/schema';
import { documentChunks } from '../db/schema';
import { keywordSearchChunks, sanitizeFtsQuery } from '../services/keyword-search';

function createRawDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return sqlite;
}

function createTestDb() {
  const sqlite = createRawDb();
  setupDocumentChunksFts(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

type TestDb = ReturnType<typeof createTestDb>['db'];

function insertChunk(
  db: TestDb,
  id: string,
  content: string,
  opts: { workspaceId?: string; fileId?: string; chunkIndex?: number } = {},
) {
  return db.insert(documentChunks).values({
    id,
    fileId: opts.fileId ?? 'f1',
    workspaceId: opts.workspaceId ?? 'ws-1',
    userId: 'user-1',
    chunkIndex: opts.chunkIndex ?? 0,
    content,
    tokenCount: 10,
    embedding: Buffer.from(new Float32Array([0, 0, 0]).buffer),
    createdAt: new Date(),
  });
}

describe('sanitizeFtsQuery', () => {
  it('quotes each term and joins with OR', () => {
    expect(sanitizeFtsQuery('revenue growth')).toBe('"revenue" OR "growth"');
  });

  it('strips double quotes from input', () => {
    expect(sanitizeFtsQuery('say "hello" world')).toBe('"say" OR "hello" OR "world"');
  });

  it('preserves punctuation inside terms as quoted phrases', () => {
    expect(sanitizeFtsQuery('$4,251.03')).toBe('"$4,251.03"');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(sanitizeFtsQuery('')).toBeNull();
    expect(sanitizeFtsQuery('   ')).toBeNull();
    expect(sanitizeFtsQuery('""')).toBeNull();
  });
});

describe('keyword search', () => {
  let db: TestDb;

  beforeEach(() => {
    ({ db } = createTestDb());
  });

  it('finds a chunk by exact phrase', async () => {
    await insertChunk(db, 'c1', 'The quarterly revenue exceeded projections');
    await insertChunk(db, 'c2', 'Office supplies were purchased in bulk');
    await insertChunk(db, 'c3', 'Employee headcount remained flat');

    const results = await keywordSearchChunks('quarterly revenue', 'ws-1', db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.chunkId).toBe('c1');
  });

  it('finds exact numeric strings', async () => {
    await insertChunk(db, 'c1', 'Payment of $4,251.03 posted on July 3');
    await insertChunk(db, 'c2', 'Payment of $9,999.99 posted on July 4');

    const results = await keywordSearchChunks('4,251.03', 'ws-1', db);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c1');
  });

  it('scopes results by workspaceId', async () => {
    await insertChunk(db, 'c-ws1', 'wire transfer to Cayman account', { workspaceId: 'ws-1' });
    await insertChunk(db, 'c-ws2', 'wire transfer to Cayman account', { workspaceId: 'ws-2' });

    const results = await keywordSearchChunks('wire transfer', 'ws-1', db);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-ws1');
  });

  it('stays in sync on chunk delete', async () => {
    await insertChunk(db, 'c1', 'unique searchable snippet');
    expect(await keywordSearchChunks('snippet', 'ws-1', db)).toHaveLength(1);

    await db.delete(documentChunks).where(eq(documentChunks.id, 'c1'));
    expect(await keywordSearchChunks('snippet', 'ws-1', db)).toHaveLength(0);
  });

  it('stays in sync on chunk content update', async () => {
    await insertChunk(db, 'c1', 'original wording here');
    await db
      .update(documentChunks)
      .set({ content: 'replacement phrasing instead' })
      .where(eq(documentChunks.id, 'c1'));

    expect(await keywordSearchChunks('original wording', 'ws-1', db)).toHaveLength(0);
    const results = await keywordSearchChunks('replacement phrasing', 'ws-1', db);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('replacement phrasing instead');
  });

  it('degrades gracefully on FTS special characters', async () => {
    await insertChunk(db, 'c1', 'co-op membership dues');

    await expect(
      keywordSearchChunks('co-op "quoted" term* NEAR( ^', 'ws-1', db),
    ).resolves.toBeDefined();
  });

  it('respects the topK limit and ranks by BM25', async () => {
    await insertChunk(db, 'c1', 'budget budget budget review');
    await insertChunk(db, 'c2', 'budget review for the month');
    await insertChunk(db, 'c3', 'annual budget');
    await insertChunk(db, 'c4', 'unrelated grocery list');

    const results = await keywordSearchChunks('budget', 'ws-1', db, { topK: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('returns empty for a query with no matches', async () => {
    await insertChunk(db, 'c1', 'some content');
    expect(await keywordSearchChunks('zzz-nonexistent', 'ws-1', db)).toEqual([]);
  });

  it('backfills existing chunks on first FTS creation', async () => {
    const sqlite = createRawDb();
    const rawDb = drizzle(sqlite, { schema });
    // Chunks inserted BEFORE the FTS table exists
    await insertChunk(rawDb, 'c-pre', 'pre-existing indexed content');

    setupDocumentChunksFts(sqlite);

    const results = await keywordSearchChunks('pre-existing', 'ws-1', rawDb);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-pre');
  });

  it('setup is idempotent and skips DBs without document_chunks', () => {
    const { sqlite } = createTestDb();
    expect(() => setupDocumentChunksFts(sqlite)).not.toThrow();

    const bare = new Database(':memory:');
    expect(() => setupDocumentChunksFts(bare)).not.toThrow();
  });
});
