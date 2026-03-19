import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { aiUsage, conversations } from '../db/schema';
import { calculateCostCents } from '../routes/chat-stream';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_cents INTEGER,
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
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function insertUsage(
  db: TestDb,
  overrides: Partial<typeof aiUsage.$inferInsert> & {
    id: string;
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
) {
  await db.insert(aiUsage).values({
    createdAt: new Date(),
    ...overrides,
  });
}

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

describe('ai_usage table', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves a usage record', async () => {
    await insertUsage(db, {
      id: 'usage-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      model: 'claude-sonnet-4-6',
      inputTokens: 500,
      outputTokens: 200,
      costCents: 1,
    });

    const [row] = await db.select().from(aiUsage).where(eq(aiUsage.id, 'usage-1'));
    expect(row).toBeDefined();
    expect(row!.userId).toBe('user-1');
    expect(row!.conversationId).toBe('conv-1');
    expect(row!.model).toBe('claude-sonnet-4-6');
    expect(row!.inputTokens).toBe(500);
    expect(row!.outputTokens).toBe(200);
    expect(row!.costCents).toBe(1);
  });

  it('calculates cost correctly for claude-sonnet-4-6', () => {
    // 1000 input + 500 output
    // (1000/1M * 3 + 500/1M * 15) * 100 = (0.003 + 0.0075) * 100 = 1.05 → rounds to 1
    const cost = calculateCostCents('claude-sonnet-4-6', 1000, 500);
    expect(cost).toBe(1);
  });

  it('calculates cost correctly for claude-opus-4-6', () => {
    // 2000 input + 1000 output
    // (2000/1M * 15 + 1000/1M * 75) * 100 = (0.03 + 0.075) * 100 = 10.5 → rounds to 11
    const cost = calculateCostCents('claude-opus-4-6', 2000, 1000);
    expect(cost).toBe(11);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCostCents('unknown-model', 1000, 500);
    expect(cost).toBe(0);
  });

  it('allows null conversationId', async () => {
    await insertUsage(db, {
      id: 'usage-2',
      userId: 'user-1',
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      outputTokens: 50,
    });

    const [row] = await db.select().from(aiUsage).where(eq(aiUsage.id, 'usage-2'));
    expect(row).toBeDefined();
    expect(row!.conversationId).toBeNull();
  });
});

describe('getUsage query logic', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('sums usage across all conversations for a user', async () => {
    await insertUsage(db, {
      id: 'u1',
      userId: 'user-1',
      conversationId: 'conv-1',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 10,
    });
    await insertUsage(db, {
      id: 'u2',
      userId: 'user-1',
      conversationId: 'conv-2',
      model: 'claude-sonnet-4-6',
      inputTokens: 2000,
      outputTokens: 1000,
      costCents: 20,
    });

    const rows = await db
      .select({
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        costCents: aiUsage.costCents,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, 'user-1'));

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    for (const r of rows) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCost += r.costCents ?? 0;
    }

    expect(totalInput).toBe(3000);
    expect(totalOutput).toBe(1500);
    expect(totalCost).toBe(30);
    expect(rows.length).toBe(2);
  });

  it('scopes to workspace when workspaceId provided', async () => {
    await insertConversation(db, { id: 'conv-1', workspaceId: 'ws-1', userId: 'user-1' });
    await insertConversation(db, { id: 'conv-2', workspaceId: 'ws-2', userId: 'user-1' });

    await insertUsage(db, {
      id: 'u1',
      userId: 'user-1',
      conversationId: 'conv-1',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 10,
    });
    await insertUsage(db, {
      id: 'u2',
      userId: 'user-1',
      conversationId: 'conv-2',
      model: 'claude-sonnet-4-6',
      inputTokens: 2000,
      outputTokens: 1000,
      costCents: 20,
    });

    // Query scoped to ws-1 only
    const rows = await db
      .select({
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        costCents: aiUsage.costCents,
      })
      .from(aiUsage)
      .innerJoin(conversations, eq(aiUsage.conversationId, conversations.id))
      .where(
        and(
          eq(aiUsage.userId, 'user-1'),
          eq(conversations.workspaceId, 'ws-1'),
        ),
      );

    expect(rows.length).toBe(1);
    expect(rows[0]!.inputTokens).toBe(1000);
    expect(rows[0]!.costCents).toBe(10);
  });

  it('returns zeros for user with no usage', async () => {
    const rows = await db
      .select({
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        costCents: aiUsage.costCents,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, 'user-nonexistent'));

    expect(rows.length).toBe(0);
  });
});
