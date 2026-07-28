import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { conversations, documentChunks, messages } from '../db/schema';

function createTestDb() {
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
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      summary TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      model TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

function makeEmbedding(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}

describe('document_chunks table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves a chunk with blob embedding', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const embedding = makeEmbedding([0.1, 0.2, 0.3]);

    await db.insert(documentChunks).values({
      id,
      fileId: 'file-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      chunkIndex: 0,
      content: 'Revenue was $1.2M in Q4.',
      tokenCount: 12,
      embedding,
      createdAt: now,
    });

    const [result] = await db.select().from(documentChunks).where(eq(documentChunks.id, id));
    expect(result).toBeDefined();
    expect(result?.fileId).toBe('file-1');
    expect(result?.workspaceId).toBe('ws-1');
    expect(result?.chunkIndex).toBe(0);
    expect(result?.content).toBe('Revenue was $1.2M in Q4.');
    expect(result?.tokenCount).toBe(12);
    expect(result?.embedding).toBeInstanceOf(Buffer);
  });

  it('retrieves chunks for a file in order by chunkIndex', async () => {
    const now = new Date();
    const emb = makeEmbedding([0.1]);

    await db.insert(documentChunks).values([
      {
        id: 'c-2',
        fileId: 'file-A',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 2,
        content: 'Third chunk',
        tokenCount: 5,
        embedding: emb,
        createdAt: now,
      },
      {
        id: 'c-0',
        fileId: 'file-A',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'First chunk',
        tokenCount: 5,
        embedding: emb,
        createdAt: now,
      },
      {
        id: 'c-1',
        fileId: 'file-A',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 1,
        content: 'Second chunk',
        tokenCount: 5,
        embedding: emb,
        createdAt: now,
      },
    ]);

    const rows = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.fileId, 'file-A'))
      .orderBy(asc(documentChunks.chunkIndex));

    expect(rows).toHaveLength(3);
    expect(rows[0]?.chunkIndex).toBe(0);
    expect(rows[1]?.chunkIndex).toBe(1);
    expect(rows[2]?.chunkIndex).toBe(2);
  });

  it('scopes by workspaceId', async () => {
    const now = new Date();
    const emb = makeEmbedding([0.5]);

    await db.insert(documentChunks).values([
      {
        id: 'c-ws1',
        fileId: 'file-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'WS1 chunk',
        tokenCount: 3,
        embedding: emb,
        createdAt: now,
      },
      {
        id: 'c-ws2',
        fileId: 'file-2',
        workspaceId: 'ws-2',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'WS2 chunk',
        tokenCount: 3,
        embedding: emb,
        createdAt: now,
      },
    ]);

    const ws1Rows = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.workspaceId, 'ws-1'));
    expect(ws1Rows).toHaveLength(1);
    expect(ws1Rows[0]?.content).toBe('WS1 chunk');
  });

  it('deletes all chunks for a file', async () => {
    const now = new Date();
    const emb = makeEmbedding([0.1]);

    await db.insert(documentChunks).values([
      {
        id: 'c-d1',
        fileId: 'file-del',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'A',
        tokenCount: 1,
        embedding: emb,
        createdAt: now,
      },
      {
        id: 'c-d2',
        fileId: 'file-del',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 1,
        content: 'B',
        tokenCount: 1,
        embedding: emb,
        createdAt: now,
      },
      {
        id: 'c-keep',
        fileId: 'file-keep',
        workspaceId: 'ws-1',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'C',
        tokenCount: 1,
        embedding: emb,
        createdAt: now,
      },
    ]);

    await db.delete(documentChunks).where(eq(documentChunks.fileId, 'file-del'));

    const remaining = await db.select().from(documentChunks);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe('c-keep');
  });

  it('stores and reads back Float32Array blob correctly', async () => {
    const now = new Date();
    const values = [0.123, -0.456, 0.789, 1.0];
    const embedding = makeEmbedding(values);

    await db.insert(documentChunks).values({
      id: 'c-float',
      fileId: 'file-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      chunkIndex: 0,
      content: 'test',
      tokenCount: 1,
      embedding,
      createdAt: now,
    });

    const [result] = await db.select().from(documentChunks).where(eq(documentChunks.id, 'c-float'));
    expect(result?.embedding).toBeInstanceOf(Buffer);

    const f32 = new Float32Array(
      result!.embedding.buffer,
      result!.embedding.byteOffset,
      result!.embedding.byteLength / 4,
    );
    expect(f32).toHaveLength(4);
    for (let i = 0; i < values.length; i++) {
      expect(f32[i]).toBeCloseTo(values[i]!, 5);
    }
  });
});

describe('messages table — citations column', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('stores and retrieves citations JSON on messages', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const citations = JSON.stringify([
      {
        index: 0,
        fileId: 'file-1',
        fileName: 'report.pdf',
        chunkContent: 'Revenue was $1.2M',
        score: 0.95,
      },
    ]);

    await db.insert(messages).values({
      id,
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'assistant',
      content: 'Based on the report, revenue was $1.2M.',
      citations,
      createdAt: now,
    });

    const [result] = await db.select().from(messages).where(eq(messages.id, id));
    expect(result?.citations).toBe(citations);
    const parsed = JSON.parse(result!.citations!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].score).toBe(0.95);
  });

  it('existing messages have null citations', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id,
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'user',
      content: 'Hello',
      createdAt: now,
    });

    const [result] = await db.select().from(messages).where(eq(messages.id, id));
    expect(result?.citations).toBeNull();
  });
});
