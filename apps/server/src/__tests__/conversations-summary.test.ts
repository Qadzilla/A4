import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { conversations } from '../db/schema';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
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
  `);
  return drizzle(sqlite, { schema });
}

describe('conversations.summary column', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts conversation with null summary', async () => {
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
    expect(result?.summary).toBeNull();
  });

  it('inserts conversation with a summary', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const summaryText = 'User discussed Q1 budget allocation and revenue targets.';

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      summary: summaryText,
      createdAt: now,
      updatedAt: now,
    });

    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(result?.summary).toBe(summaryText);
  });

  it('updates summary on existing conversation', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    const [before] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(before?.summary).toBeNull();

    await db
      .update(conversations)
      .set({ summary: 'Updated summary after analysis.' })
      .where(eq(conversations.id, id));

    const [after] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(after?.summary).toBe('Updated summary after analysis.');
  });

  it('clears summary back to null', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      summary: 'Initial summary.',
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(conversations)
      .set({ summary: null })
      .where(eq(conversations.id, id));

    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(result?.summary).toBeNull();
  });

  it('summary does not affect other conversation queries', async () => {
    const now = new Date();

    await db.insert(conversations).values([
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-1', summary: 'Has a summary', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-1', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), workspaceId: 'ws-1', userId: 'user-1', createdAt: now, updatedAt: now },
    ]);

    const results = await db
      .select()
      .from(conversations)
      .where(eq(conversations.workspaceId, 'ws-1'));

    expect(results).toHaveLength(3);
    expect(results.filter((c) => c.summary !== null)).toHaveLength(1);
    expect(results.filter((c) => c.summary === null)).toHaveLength(2);
  });
});
