import Database from 'better-sqlite3';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
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
      tool_calls TEXT,
      tool_call_id TEXT,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function insertConversation(
  db: TestDb,
  overrides: Partial<typeof conversations.$inferInsert> & {
    id: string;
    workspaceId: string;
    userId: string;
  },
) {
  const now = new Date();
  await db.insert(conversations).values({
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function insertMessage(
  db: TestDb,
  overrides: Partial<typeof messages.$inferInsert> & {
    id: string;
    conversationId: string;
    userId: string;
    content: string;
  },
) {
  await db.insert(messages).values({
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  });
}

describe('chat router — DB operations', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('createConversation', () => {
    it('creates with default model', async () => {
      const id = crypto.randomUUID();
      const now = new Date();

      await db.insert(conversations).values({
        id,
        workspaceId: 'ws-1',
        userId: 'user-1',
        title: null,
        model: 'claude-sonnet-4-6',
        createdAt: now,
        updatedAt: now,
      });

      const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
      expect(result).toBeDefined();
      expect(result!.model).toBe('claude-sonnet-4-6');
      expect(result!.title).toBeNull();
      expect(result!.userId).toBe('user-1');
    });

    it('creates with custom title and model', async () => {
      const id = crypto.randomUUID();
      const now = new Date();

      await db.insert(conversations).values({
        id,
        workspaceId: 'ws-1',
        userId: 'user-1',
        title: 'Q1 Budget Discussion',
        model: 'claude-opus-4-6',
        createdAt: now,
        updatedAt: now,
      });

      const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
      expect(result!.title).toBe('Q1 Budget Discussion');
      expect(result!.model).toBe('claude-opus-4-6');
    });
  });

  describe('listConversations', () => {
    it('returns conversations for user+workspace, newest first', async () => {
      const t1 = new Date('2026-03-01T10:00:00Z');
      const t2 = new Date('2026-03-01T11:00:00Z');
      const t3 = new Date('2026-03-01T12:00:00Z');

      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1', updatedAt: t1, createdAt: t1 });
      await insertConversation(db, { id: 'c-2', workspaceId: 'ws-1', userId: 'user-1', updatedAt: t3, createdAt: t2 });
      await insertConversation(db, { id: 'c-3', workspaceId: 'ws-1', userId: 'user-1', updatedAt: t2, createdAt: t3 });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, 'user-1'), eq(conversations.workspaceId, 'ws-1')))
        .orderBy(desc(conversations.updatedAt));

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('c-2');
      expect(results[1]!.id).toBe('c-3');
      expect(results[2]!.id).toBe('c-1');
    });

    it('excludes other users conversations', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1' });
      await insertConversation(db, { id: 'c-2', workspaceId: 'ws-1', userId: 'user-2' });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, 'user-1'), eq(conversations.workspaceId, 'ws-1')));

      expect(results).toHaveLength(1);
      expect(results[0]!.userId).toBe('user-1');
    });

    it('excludes other workspace conversations', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1' });
      await insertConversation(db, { id: 'c-2', workspaceId: 'ws-2', userId: 'user-1' });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, 'user-1'), eq(conversations.workspaceId, 'ws-1')));

      expect(results).toHaveLength(1);
      expect(results[0]!.workspaceId).toBe('ws-1');
    });

    it('includes messageCount per conversation', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1' });
      await insertConversation(db, { id: 'c-2', workspaceId: 'ws-1', userId: 'user-1' });

      await insertMessage(db, { id: 'm-1', conversationId: 'c-1', userId: 'user-1', content: 'Hello' });
      await insertMessage(db, { id: 'm-2', conversationId: 'c-1', userId: 'user-1', content: 'World' });
      await insertMessage(db, { id: 'm-3', conversationId: 'c-2', userId: 'user-1', content: 'Hi' });

      const convoIds = ['c-1', 'c-2'];
      const counts = await db
        .select({ conversationId: messages.conversationId, messageCount: count() })
        .from(messages)
        .where(inArray(messages.conversationId, convoIds))
        .groupBy(messages.conversationId);

      const countMap = new Map(counts.map((c) => [c.conversationId, c.messageCount]));
      expect(countMap.get('c-1')).toBe(2);
      expect(countMap.get('c-2')).toBe(1);
    });
  });

  describe('getConversation', () => {
    it('returns conversation with messages in chronological order', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1' });

      const t1 = new Date('2026-03-01T10:00:00Z');
      const t2 = new Date('2026-03-01T10:01:00Z');
      const t3 = new Date('2026-03-01T10:02:00Z');

      await insertMessage(db, { id: 'm-1', conversationId: 'c-1', userId: 'user-1', content: 'Hello', createdAt: t1 });
      await insertMessage(db, { id: 'm-2', conversationId: 'c-1', userId: 'user-1', content: 'Reply', role: 'assistant', createdAt: t2 });
      await insertMessage(db, { id: 'm-3', conversationId: 'c-1', userId: 'user-1', content: 'Thanks', createdAt: t3 });

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'c-1'), eq(conversations.userId, 'user-1')));

      expect(conversation).toBeDefined();

      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, 'c-1'))
        .orderBy(asc(messages.createdAt));

      expect(msgs).toHaveLength(3);
      expect(msgs[0]!.id).toBe('m-1');
      expect(msgs[1]!.role).toBe('assistant');
      expect(msgs[2]!.id).toBe('m-3');
    });

    it('returns no rows for non-existent id', async () => {
      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'nonexistent'), eq(conversations.userId, 'user-1')));

      expect(results).toHaveLength(0);
    });

    it('returns no rows for other users conversation', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-2' });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'c-1'), eq(conversations.userId, 'user-1')));

      expect(results).toHaveLength(0);
    });
  });

  describe('sendMessage', () => {
    it('inserts user message and updates conversation updatedAt', async () => {
      const earlyDate = new Date('2026-03-01T10:00:00Z');
      await insertConversation(db, {
        id: 'c-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        createdAt: earlyDate,
        updatedAt: earlyDate,
      });

      const msgId = crypto.randomUUID();
      const now = new Date('2026-03-01T12:00:00Z');

      await db.insert(messages).values({
        id: msgId,
        conversationId: 'c-1',
        userId: 'user-1',
        role: 'user',
        content: 'What was Q4 revenue?',
        createdAt: now,
      });

      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, 'c-1'));

      const [msg] = await db.select().from(messages).where(eq(messages.id, msgId));
      expect(msg).toBeDefined();
      expect(msg!.role).toBe('user');
      expect(msg!.content).toBe('What was Q4 revenue?');

      const [convo] = await db.select().from(conversations).where(eq(conversations.id, 'c-1'));
      expect(convo!.updatedAt.getTime()).toBe(now.getTime());
      expect(convo!.updatedAt.getTime()).toBeGreaterThan(earlyDate.getTime());
    });

    it('returns no rows if conversation does not exist', async () => {
      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'nonexistent'), eq(conversations.userId, 'user-1')));

      expect(results).toHaveLength(0);
    });

    it('returns no rows if conversation belongs to other user', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-2' });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'c-1'), eq(conversations.userId, 'user-1')));

      expect(results).toHaveLength(0);
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation and all its messages', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-1' });
      await insertMessage(db, { id: 'm-1', conversationId: 'c-1', userId: 'user-1', content: 'Hello' });
      await insertMessage(db, { id: 'm-2', conversationId: 'c-1', userId: 'user-1', content: 'World' });

      await db.delete(messages).where(eq(messages.conversationId, 'c-1'));
      await db.delete(conversations).where(eq(conversations.id, 'c-1'));

      const remainingMessages = await db.select().from(messages).where(eq(messages.conversationId, 'c-1'));
      const remainingConvos = await db.select().from(conversations).where(eq(conversations.id, 'c-1'));

      expect(remainingMessages).toHaveLength(0);
      expect(remainingConvos).toHaveLength(0);
    });

    it('returns no rows for other users conversation', async () => {
      await insertConversation(db, { id: 'c-1', workspaceId: 'ws-1', userId: 'user-2' });

      const results = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, 'c-1'), eq(conversations.userId, 'user-1')));

      expect(results).toHaveLength(0);
    });

    it('is idempotent for already-deleted conversations', async () => {
      // Deleting a non-existent conversation should not throw
      await db.delete(messages).where(eq(messages.conversationId, 'nonexistent'));
      await db.delete(conversations).where(eq(conversations.id, 'nonexistent'));

      const results = await db.select().from(conversations).where(eq(conversations.id, 'nonexistent'));
      expect(results).toHaveLength(0);
    });
  });
});
