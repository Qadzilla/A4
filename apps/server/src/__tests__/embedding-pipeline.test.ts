import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { documentChunks, files } from '../db/schema';

// Mock dependencies
vi.mock('../services/storage', () => ({
  storage: {
    get: vi.fn().mockResolvedValue(Buffer.from('fake file content')),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/text-extraction', () => ({
  extractText: vi.fn(),
}));
vi.mock('../services/chunking', () => ({
  chunkText: vi.fn(),
}));
vi.mock('../services/embedding', () => ({
  embedTexts: vi.fn(),
}));

import { chunkText } from '../services/chunking';
import { embedTexts } from '../services/embedding';
import { embedFile } from '../services/embedding-pipeline';
import { extractText } from '../services/text-extraction';

const mockExtractText = vi.mocked(extractText);
const mockChunkText = vi.mocked(chunkText);
const mockEmbedTexts = vi.mocked(embedTexts);

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

const TEST_FILE = {
  id: 'file-1',
  userId: 'user-1',
  workspaceId: 'ws-1',
  fileName: 'report.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  extension: 'pdf',
  storagePath: '/uploads/report.pdf',
  createdAt: new Date(),
};

describe('embedFile', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await db.insert(files).values(TEST_FILE);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts, chunks, embeds, and stores chunks for a file', async () => {
    mockExtractText.mockResolvedValue('Hello world. This is a test.');
    mockChunkText.mockReturnValue([
      { content: 'Hello world.', tokenCount: 3, chunkIndex: 0 },
      { content: 'This is a test.', tokenCount: 4, chunkIndex: 1 },
    ]);
    mockEmbedTexts.mockResolvedValue([
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3, 0.4]),
    ]);

    const result = await embedFile('file-1', db);

    expect(result.chunksCreated).toBe(2);
    expect(mockExtractText).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    expect(mockChunkText).toHaveBeenCalledWith('Hello world. This is a test.');
    expect(mockEmbedTexts).toHaveBeenCalledWith(['Hello world.', 'This is a test.']);

    const rows = await db.select().from(documentChunks).where(eq(documentChunks.fileId, 'file-1'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.content).toBe('Hello world.');
    expect(rows[1]!.content).toBe('This is a test.');
    expect(rows[0]!.workspaceId).toBe('ws-1');
    expect(rows[0]!.userId).toBe('user-1');
  });

  it('returns 0 chunks for empty text extraction', async () => {
    mockExtractText.mockResolvedValue('');

    const result = await embedFile('file-1', db);
    expect(result.chunksCreated).toBe(0);
    expect(mockChunkText).not.toHaveBeenCalled();
  });

  it('deletes existing chunks before re-embedding', async () => {
    // Insert existing chunks
    await db.insert(documentChunks).values({
      id: 'old-chunk',
      fileId: 'file-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      chunkIndex: 0,
      content: 'Old content',
      tokenCount: 2,
      embedding: Buffer.from(new Float32Array([0.9]).buffer),
      createdAt: new Date(),
    });

    mockExtractText.mockResolvedValue('New content here.');
    mockChunkText.mockReturnValue([
      { content: 'New content here.', tokenCount: 4, chunkIndex: 0 },
    ]);
    mockEmbedTexts.mockResolvedValue([new Float32Array([0.5, 0.6])]);

    const result = await embedFile('file-1', db);
    expect(result.chunksCreated).toBe(1);

    const rows = await db.select().from(documentChunks).where(eq(documentChunks.fileId, 'file-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe('New content here.');
  });

  it('throws when file not found', async () => {
    await expect(embedFile('nonexistent', db)).rejects.toThrow('File not found: nonexistent');
  });

  it('propagates embedding API failure', async () => {
    mockExtractText.mockResolvedValue('Some text.');
    mockChunkText.mockReturnValue([
      { content: 'Some text.', tokenCount: 3, chunkIndex: 0 },
    ]);
    mockEmbedTexts.mockRejectedValue(new Error('OpenAI API error'));

    await expect(embedFile('file-1', db)).rejects.toThrow('OpenAI API error');

    // No partial state — chunks shouldn't exist
    const rows = await db.select().from(documentChunks).where(eq(documentChunks.fileId, 'file-1'));
    expect(rows).toHaveLength(0);
  });
});
