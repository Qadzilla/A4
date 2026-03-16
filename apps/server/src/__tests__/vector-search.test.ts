import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { documentChunks, files } from '../db/schema';
import { cosineSimilarity, searchChunks, searchDocuments } from '../services/vector-search';

vi.mock('../services/embedding', () => ({
  embedSingle: vi.fn(),
}));

import { embedSingle } from '../services/embedding';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
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
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

function makeEmbedding(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}

function insertFile(db: TestDb, id: string, fileName: string, workspaceId = 'ws-1') {
  return db.insert(files).values({
    id,
    userId: 'user-1',
    workspaceId,
    fileName,
    fileSize: 1000,
    mimeType: 'application/pdf',
    extension: 'pdf',
    storagePath: `/uploads/${id}.pdf`,
    createdAt: new Date(),
  });
}

function insertChunk(
  db: TestDb,
  id: string,
  fileId: string,
  embedding: number[],
  opts: { workspaceId?: string; chunkIndex?: number; content?: string } = {},
) {
  return db.insert(documentChunks).values({
    id,
    fileId,
    workspaceId: opts.workspaceId ?? 'ws-1',
    userId: 'user-1',
    chunkIndex: opts.chunkIndex ?? 0,
    content: opts.content ?? `Chunk ${id}`,
    tokenCount: 10,
    embedding: makeEmbedding(embedding),
    createdAt: new Date(),
  });
}

describe('cosineSimilarity', () => {
  it('returns ~1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns ~0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns ~-1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero-magnitude vector', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('searchChunks', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('ranks results by similarity descending', async () => {
    // Query vector points in direction [1, 0, 0]
    const queryEmb = new Float32Array([1, 0, 0]);

    // Chunk embeddings with decreasing similarity to query
    await insertChunk(db, 'c-best', 'f1', [1, 0, 0], { content: 'Best match' });
    await insertChunk(db, 'c-mid', 'f1', [0.7, 0.7, 0], { content: 'Mid match' });
    await insertChunk(db, 'c-low', 'f1', [0.1, 0.9, 0], { content: 'Low match' });

    const results = await searchChunks(queryEmb, 'ws-1', db as any);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.chunkId).toBe('c-best');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('respects topK limit', async () => {
    const queryEmb = new Float32Array([1, 0, 0]);
    await insertChunk(db, 'c1', 'f1', [1, 0, 0]);
    await insertChunk(db, 'c2', 'f1', [0.9, 0.1, 0]);
    await insertChunk(db, 'c3', 'f1', [0.8, 0.2, 0]);

    const results = await searchChunks(queryEmb, 'ws-1', db as any, { topK: 2 });
    expect(results).toHaveLength(2);
  });

  it('filters by minScore', async () => {
    const queryEmb = new Float32Array([1, 0, 0]);
    await insertChunk(db, 'c-high', 'f1', [1, 0, 0]);
    await insertChunk(db, 'c-low', 'f1', [0, 1, 0]); // orthogonal → score ~0

    const results = await searchChunks(queryEmb, 'ws-1', db as any, { minScore: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-high');
  });

  it('scopes to workspace', async () => {
    const queryEmb = new Float32Array([1, 0, 0]);
    await insertChunk(db, 'c-ws1', 'f1', [1, 0, 0], { workspaceId: 'ws-1' });
    await insertChunk(db, 'c-ws2', 'f2', [1, 0, 0], { workspaceId: 'ws-2' });

    const results = await searchChunks(queryEmb, 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-ws1');
  });

  it('returns empty array for workspace with no chunks', async () => {
    const queryEmb = new Float32Array([1, 0, 0]);
    const results = await searchChunks(queryEmb, 'ws-empty', db as any);
    expect(results).toEqual([]);
  });
});

describe('searchDocuments', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
    vi.mocked(embedSingle).mockReset();
  });

  it('returns results with fileName from files table', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'quarterly-report.pdf');
    await insertChunk(db, 'c1', 'f1', [1, 0, 0], { content: 'Revenue grew 20%' });

    const results = await searchDocuments('revenue growth', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.fileName).toBe('quarterly-report.pdf');
    expect(results[0]!.content).toBe('Revenue grew 20%');
    expect(results[0]!.score).toBeCloseTo(1.0, 3);
  });

  it('propagates embedding errors', async () => {
    vi.mocked(embedSingle).mockRejectedValue(new Error('API key not set'));

    await expect(searchDocuments('test', 'ws-1', db as any)).rejects.toThrow('API key not set');
  });
});
