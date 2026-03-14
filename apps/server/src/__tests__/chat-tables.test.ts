import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { conversations, messages } from '../db/schema';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
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
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('conversations table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves a conversation', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      title: 'Q1 Budget Review',
      model: 'claude-sonnet-4-6',
      createdAt: now,
      updatedAt: now,
    });

    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(result).toBeDefined();
    expect(result?.workspaceId).toBe('ws-1');
    expect(result?.userId).toBe('user-1');
    expect(result?.title).toBe('Q1 Budget Review');
    expect(result?.model).toBe('claude-sonnet-4-6');
  });

  it('scopes conversations by userId and workspaceId', async () => {
    const now = new Date();

    await db.insert(conversations).values([
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-1', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-2', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-1', createdAt: now, updatedAt: now },
    ]);

    const user1Convos = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, 'user-1'));

    expect(user1Convos).toHaveLength(2);
    expect(user1Convos.every((c) => c.userId === 'user-1')).toBe(true);
  });

  it('allows null title', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(result?.title).toBeNull();
  });

  it('deletes a conversation (hard delete)', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    await db.delete(conversations).where(eq(conversations.id, id));

    const results = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(results).toHaveLength(0);
  });
});

describe('messages table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves a user message', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id,
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'user',
      content: 'What was our revenue last quarter?',
      createdAt: now,
    });

    const [result] = await db.select().from(messages).where(eq(messages.id, id));
    expect(result).toBeDefined();
    expect(result?.role).toBe('user');
    expect(result?.content).toBe('What was our revenue last quarter?');
    expect(result?.tokenCount).toBeNull();
    expect(result?.model).toBeNull();
  });

  it('inserts and retrieves an assistant message with token tracking', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id,
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'assistant',
      content: 'Based on your data, Q4 revenue was $1.2M.',
      tokenCount: 350,
      model: 'claude-sonnet-4-6',
      createdAt: now,
    });

    const [result] = await db.select().from(messages).where(eq(messages.id, id));
    expect(result).toBeDefined();
    expect(result?.role).toBe('assistant');
    expect(result?.tokenCount).toBe(350);
    expect(result?.model).toBe('claude-sonnet-4-6');
  });

  it('retrieves messages for a conversation in creation order', async () => {
    const t1 = new Date('2026-03-01T10:00:00Z');
    const t2 = new Date('2026-03-01T10:01:00Z');
    const t3 = new Date('2026-03-01T10:02:00Z');

    await db.insert(messages).values([
      { id: 'msg-1', conversationId: 'conv-A', userId: 'user-1', role: 'user', content: 'Hello', createdAt: t1 },
      { id: 'msg-2', conversationId: 'conv-A', userId: 'user-1', role: 'assistant', content: 'Hi there', createdAt: t2 },
      { id: 'msg-3', conversationId: 'conv-A', userId: 'user-1', role: 'user', content: 'Thanks', createdAt: t3 },
      { id: 'msg-4', conversationId: 'conv-B', userId: 'user-1', role: 'user', content: 'Other convo', createdAt: t1 },
    ]);

    const convAMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, 'conv-A'))
      .orderBy(asc(messages.createdAt));

    expect(convAMessages).toHaveLength(3);
    expect(convAMessages[0]?.id).toBe('msg-1');
    expect(convAMessages[1]?.id).toBe('msg-2');
    expect(convAMessages[2]?.id).toBe('msg-3');
  });
});
