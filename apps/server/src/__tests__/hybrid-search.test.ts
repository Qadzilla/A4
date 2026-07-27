import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDocumentChunksFts } from '../db/fts';
import * as schema from '../db/schema';
import { documentChunks, files, pageEmbeddings } from '../db/schema';
import type { ChunkSearchResult } from '../services/vector-search';
import { reciprocalRankFusion, searchDocuments } from '../services/vector-search';

vi.mock('../services/embedding', () => ({
  embedSingle: vi.fn(),
}));
vi.mock('../services/visual-embedding', () => ({
  embedVisualQuery: vi.fn(),
}));

import { embedSingle } from '../services/embedding';
import { embedVisualQuery } from '../services/visual-embedding';

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
    CREATE TABLE page_embeddings (
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL, page INTEGER NOT NULL, embedding BLOB NOT NULL,
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
  setupDocumentChunksFts(sqlite);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

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
  content: string,
  embedding: number[],
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
    embedding: Buffer.from(new Float32Array(embedding).buffer),
    createdAt: new Date(),
  });
}

function makeResult(chunkId: string, score: number): ChunkSearchResult {
  return { chunkId, fileId: 'f1', content: `content ${chunkId}`, chunkIndex: 0, score };
}

describe('reciprocalRankFusion', () => {
  it('ranks a chunk present in both lists above single-list chunks', () => {
    const semantic = [makeResult('both', 0.9), makeResult('sem-only', 0.8)];
    const keyword = [makeResult('kw-only', 1.0), makeResult('both', 0.5)];

    const fused = reciprocalRankFusion([semantic, keyword], 5);
    expect(fused[0]!.chunkId).toBe('both');
  });

  it('includes single-list chunks', () => {
    const fused = reciprocalRankFusion([[makeResult('a', 0.9)], [makeResult('b', 1.0)]], 5);
    expect(fused.map((r) => r.chunkId).sort()).toEqual(['a', 'b']);
  });

  it('respects topK', () => {
    const list = [makeResult('a', 0.9), makeResult('b', 0.8), makeResult('c', 0.7)];
    expect(reciprocalRankFusion([list, []], 2)).toHaveLength(2);
  });

  it('returns empty for empty inputs', () => {
    expect(reciprocalRankFusion([[], []], 5)).toEqual([]);
  });
});

describe('hybrid searchDocuments', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(embedSingle).mockReset();
  });

  it('returns keyword-only hits that semantic search missed', async () => {
    // Query embedding orthogonal to every chunk → semantic finds nothing
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([0, 0, 1]));

    await insertFile(db, 'f1', 'statement.pdf');
    await insertChunk(db, 'c-exact', 'Account number 8842-1190 charged $52.00', [1, 0, 0]);

    const results = await searchDocuments('8842-1190', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-exact');
  });

  it('returns semantic-only hits that keyword search missed', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'report.pdf');
    // No token overlap with the query text
    await insertChunk(db, 'c-sem', 'Netflix and Spotify renew monthly', [1, 0, 0]);

    const results = await searchDocuments('recurring subscription charges', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c-sem');
  });

  it('ranks chunks found by both signals above single-signal chunks', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'docs.pdf');
    // c-both: semantic match (aligned embedding) AND keyword match ("insurance")
    await insertChunk(db, 'c-both', 'insurance premium due in July', [1, 0, 0]);
    // c-sem: semantic match only
    await insertChunk(db, 'c-sem', 'monthly protection plan payment', [0.95, 0.05, 0]);
    // c-kw: keyword match only (orthogonal embedding)
    await insertChunk(db, 'c-kw', 'insurance card photocopy', [0, 1, 0]);

    const results = await searchDocuments('insurance', 'ws-1', db as any);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.chunkId).toBe('c-both');
  });

  it('degrades to keyword-only when embeddings are unavailable', async () => {
    vi.mocked(embedSingle).mockRejectedValue(new Error('OPENAI_API_KEY missing'));

    await insertFile(db, 'f1', 'ledger.pdf');
    await insertChunk(db, 'c1', 'wire transfer confirmation 99120', [1, 0, 0]);

    const results = await searchDocuments('wire transfer', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c1');
  });

  it('scopes both signals by workspace and respects topK', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'a.pdf', 'ws-1');
    await insertFile(db, 'f2', 'b.pdf', 'ws-2');
    await insertChunk(db, 'c1', 'budget item alpha', [1, 0, 0], { fileId: 'f1' });
    await insertChunk(db, 'c2', 'budget item beta', [0.9, 0.1, 0], { fileId: 'f1' });
    await insertChunk(db, 'c3', 'budget item gamma', [0.8, 0.2, 0], { fileId: 'f1' });
    await insertChunk(db, 'c-other', 'budget item delta', [1, 0, 0], {
      fileId: 'f2',
      workspaceId: 'ws-2',
    });

    const results = await searchDocuments('budget', 'ws-1', db as any, { topK: 2 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.fileId === 'f1')).toBe(true);
  });

  it('produces citation-shaped results with fileName for every hit', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([0, 0, 1]));

    await insertFile(db, 'f1', 'invoice-2026.pdf');
    await insertChunk(db, 'c1', 'Invoice INV-0042 total $1,900.00', [1, 0, 0]);

    const results = await searchDocuments('INV-0042', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.fileName).toBe('invoice-2026.pdf');
    expect(typeof r.fileId).toBe('string');
    expect(typeof r.content).toBe('string');
    expect(typeof r.chunkIndex).toBe('number');
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('visual signal', () => {
  let db: TestDb;

  function insertPage(dbi: TestDb, fileId: string, page: number, embedding: number[]) {
    return dbi.insert(pageEmbeddings).values({
      id: `pe-${fileId}-${page}`,
      fileId,
      workspaceId: 'ws-1',
      userId: 'user-1',
      page,
      embedding: Buffer.from(new Float32Array(embedding).buffer),
      createdAt: new Date(),
    });
  }

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(embedSingle).mockReset();
    vi.mocked(embedVisualQuery).mockReset();
  });

  it('surfaces visually matched pages as page-level citations', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([0, 0, 1]));
    vi.mocked(embedVisualQuery).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'scanned-statement.pdf');
    await insertPage(db, 'f1', 4, [1, 0, 0]); // aligned with the visual query
    await insertPage(db, 'f1', 2, [0, 1, 0]); // orthogonal

    const results = await searchDocuments('the page with the pie chart', 'ws-1', db as any);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const top = results[0]!;
    expect(top.chunkId).toBe('page:f1:4');
    expect(top.content).toBe('[Page 4 matched visually]');
    expect(top.chunkIndex).toBe(4);
    expect(top.fileName).toBe('scanned-statement.pdf');
  });

  it('fuses visual hits with text signals, ranking multi-signal chunks first', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));
    vi.mocked(embedVisualQuery).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'docs.pdf');
    // Text chunk hit by BOTH semantic and keyword signals
    await insertChunk(db, 'c-both', 'insurance premium schedule', [1, 0, 0]);
    // Page hit only by the visual signal
    await insertPage(db, 'f1', 1, [1, 0, 0]);

    const results = await searchDocuments('insurance', 'ws-1', db as any);
    expect(results.map((r) => r.chunkId)).toContain('page:f1:1');
    expect(results[0]!.chunkId).toBe('c-both'); // two signals beat one
  });

  it('degrades silently when the visual embedding service is unavailable', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([0, 0, 1]));
    vi.mocked(embedVisualQuery).mockRejectedValue(new Error('VOYAGE_API_KEY is not set'));

    await insertFile(db, 'f1', 'a.pdf');
    await insertPage(db, 'f1', 1, [1, 0, 0]);
    await insertChunk(db, 'c1', 'wire transfer 99120', [1, 0, 0]);

    const results = await searchDocuments('wire transfer', 'ws-1', db as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('c1');
  });

  it('skips the visual API entirely when no pages are indexed', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([1, 0, 0]));

    await insertFile(db, 'f1', 'a.pdf');
    await insertChunk(db, 'c1', 'budget alpha', [1, 0, 0]);

    await searchDocuments('budget', 'ws-1', db as any);
    expect(embedVisualQuery).not.toHaveBeenCalled();
  });

  it('scopes visual hits to the workspace', async () => {
    vi.mocked(embedSingle).mockResolvedValue(new Float32Array([0, 0, 1]));
    vi.mocked(embedVisualQuery).mockResolvedValue(new Float32Array([1, 0, 0]));

    await db.insert(pageEmbeddings).values({
      id: 'pe-other',
      fileId: 'f-other',
      workspaceId: 'ws-other',
      userId: 'user-2',
      page: 1,
      embedding: Buffer.from(new Float32Array([1, 0, 0]).buffer),
      createdAt: new Date(),
    });

    const results = await searchDocuments('chart', 'ws-1', db as any);
    expect(results).toHaveLength(0);
  });
});
