import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { files, pageEmbeddings } from '../db/schema';
import { env } from '../env';

vi.mock('../services/visual-embedding', () => ({
  embedPageImages: vi.fn(),
}));
vi.mock('../services/storage', () => ({
  storage: { get: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')) },
}));

let mockPageCount = 3;
vi.mock('mupdf', () => ({
  Document: {
    openDocument: () => ({
      countPages: () => mockPageCount,
      loadPage: () => ({
        toPixmap: () => ({ asPNG: () => new Uint8Array([137, 80, 78, 71]) }),
      }),
    }),
  },
  Matrix: { scale: () => [1.5, 0, 0, 1.5, 0, 0] },
  ColorSpace: { DeviceRGB: 'rgb' },
}));

import { embedFilePages } from '../services/page-embedding';
import { embedPageImages } from '../services/visual-embedding';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL, file_size INTEGER NOT NULL, mime_type TEXT NOT NULL,
      extension TEXT NOT NULL, storage_path TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE page_embeddings (
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL, page INTEGER NOT NULL, embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function seedFile(db: TestDb, id: string, mimeType = 'application/pdf') {
  await db.insert(files).values({
    id,
    userId: 'user-1',
    workspaceId: 'ws-1',
    fileName: 'statement.pdf',
    fileSize: 1000,
    mimeType,
    extension: 'pdf',
    storagePath: `uploads/${id}.pdf`,
    createdAt: new Date(),
  });
}

function mockEmbeddings() {
  vi.mocked(embedPageImages).mockImplementation(async (buffers) =>
    buffers.map((_, i) => new Float32Array([i, 1, 0])),
  );
}

describe('embedFilePages', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    mockPageCount = 3;
    vi.mocked(embedPageImages).mockReset();
    env.VOYAGE_API_KEY = 'test-key';
  });

  it('renders and embeds each page, writing 1-based page rows', async () => {
    mockEmbeddings();
    await seedFile(db, 'f1');

    await embedFilePages({ fileId: 'f1' }, db as never);

    const rows = await db.select().from(pageEmbeddings);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.page).sort()).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.fileId === 'f1' && r.workspaceId === 'ws-1')).toBe(true);
    // Embedding round-trips as Float32Array
    const first = rows.find((r) => r.page === 1)!;
    const vec = new Float32Array(
      first.embedding.buffer,
      first.embedding.byteOffset,
      first.embedding.byteLength / 4,
    );
    expect(vec).toHaveLength(3);
  });

  it('is a no-op when VOYAGE_API_KEY is unset', async () => {
    env.VOYAGE_API_KEY = undefined;
    await seedFile(db, 'f1');

    await embedFilePages({ fileId: 'f1' }, db as never);

    expect(await db.select().from(pageEmbeddings)).toHaveLength(0);
    expect(embedPageImages).not.toHaveBeenCalled();
  });

  it('skips non-PDF files and missing files', async () => {
    mockEmbeddings();
    await seedFile(db, 'f-csv', 'text/csv');

    await embedFilePages({ fileId: 'f-csv' }, db as never);
    await embedFilePages({ fileId: 'f-missing' }, db as never);

    expect(await db.select().from(pageEmbeddings)).toHaveLength(0);
    expect(embedPageImages).not.toHaveBeenCalled();
  });

  it('caps rendering at 200 pages', async () => {
    mockEmbeddings();
    mockPageCount = 250;
    await seedFile(db, 'f-big');

    await embedFilePages({ fileId: 'f-big' }, db as never);

    expect(await db.select().from(pageEmbeddings)).toHaveLength(200);
  });

  it('batches API calls at 8 pages per call', async () => {
    mockEmbeddings();
    mockPageCount = 10;
    await seedFile(db, 'f1');

    await embedFilePages({ fileId: 'f1' }, db as never);

    expect(embedPageImages).toHaveBeenCalledTimes(2);
    expect(vi.mocked(embedPageImages).mock.calls[0]![0]).toHaveLength(8);
    expect(vi.mocked(embedPageImages).mock.calls[1]![0]).toHaveLength(2);
  });

  it('replaces prior rows on re-run instead of duplicating', async () => {
    mockEmbeddings();
    await seedFile(db, 'f1');

    await embedFilePages({ fileId: 'f1' }, db as never);
    await embedFilePages({ fileId: 'f1' }, db as never);

    expect(await db.select().from(pageEmbeddings)).toHaveLength(3);
  });

  it('leaves the existing index intact when the embedding API fails', async () => {
    mockEmbeddings();
    await seedFile(db, 'f1');
    await embedFilePages({ fileId: 'f1' }, db as never);

    vi.mocked(embedPageImages).mockRejectedValue(new Error('Voyage API error 500'));
    await expect(embedFilePages({ fileId: 'f1' }, db as never)).rejects.toThrow('Voyage');

    // Previous complete index still present for the retry window
    expect(await db.select().from(pageEmbeddings)).toHaveLength(3);
  });

  it('rejects payloads without a fileId', async () => {
    await expect(embedFilePages({}, db as never)).rejects.toThrow('fileId');
  });
});
