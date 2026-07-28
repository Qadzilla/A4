import Database from 'better-sqlite3';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { workspaceInsights } from '../db/schema';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE workspace_insights (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      conversation_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('workspaceInsights table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves an insight with all fields', async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    const expires = new Date('2026-04-01T00:00:00Z');
    const dataObj = { categoryName: 'Dining', budgeted: 500, actual: 700, percentOver: 40 };

    await db.insert(workspaceInsights).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'budget_overspend',
      severity: 'warning',
      title: 'Dining budget 40% over',
      summary: 'You spent $700 of your $500 dining budget this month.',
      data: JSON.stringify(dataObj),
      status: 'active',
      conversationId: 'conv-1',
      createdAt: now,
      expiresAt: expires,
    });

    const [result] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(result).toBeDefined();
    expect(result?.workspaceId).toBe('ws-1');
    expect(result?.userId).toBe('user-1');
    expect(result?.type).toBe('budget_overspend');
    expect(result?.severity).toBe('warning');
    expect(result?.title).toBe('Dining budget 40% over');
    expect(result?.summary).toBe('You spent $700 of your $500 dining budget this month.');
    expect(result?.status).toBe('active');
    expect(result?.conversationId).toBe('conv-1');

    const parsed = JSON.parse(result!.data!);
    expect(parsed).toEqual(dataObj);
  });

  it('filters insights by workspace', async () => {
    const now = new Date();
    await db.insert(workspaceInsights).values([
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-A',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'critical',
        title: 'Low cash',
        summary: 'Cash is low',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-A',
        userId: 'user-1',
        type: 'debt_deadline',
        severity: 'warning',
        title: 'Debt due',
        summary: 'Payment due soon',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-B',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'info',
        title: 'Low cash',
        summary: 'Cash is low',
        createdAt: now,
      },
    ]);

    const results = await db
      .select()
      .from(workspaceInsights)
      .where(eq(workspaceInsights.workspaceId, 'ws-A'));
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.workspaceId === 'ws-A')).toBe(true);
  });

  it('filters insights by status', async () => {
    const now = new Date();
    await db.insert(workspaceInsights).values([
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'critical',
        title: 'A',
        summary: 'A',
        status: 'active',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'info',
        title: 'B',
        summary: 'B',
        status: 'dismissed',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'warning',
        title: 'C',
        summary: 'C',
        status: 'engaged',
        createdAt: now,
      },
    ]);

    const results = await db
      .select()
      .from(workspaceInsights)
      .where(eq(workspaceInsights.status, 'active'));
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('A');
  });

  it('filters insights by type', async () => {
    const now = new Date();
    await db.insert(workspaceInsights).values([
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'budget_overspend',
        severity: 'warning',
        title: 'Budget',
        summary: 'Over',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'critical',
        title: 'Cash',
        summary: 'Low',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'budget_overspend',
        severity: 'info',
        title: 'Budget2',
        summary: 'Over2',
        createdAt: now,
      },
    ]);

    const results = await db
      .select()
      .from(workspaceInsights)
      .where(eq(workspaceInsights.type, 'budget_overspend'));
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.type === 'budget_overspend')).toBe(true);
  });

  it('updates insight status to dismissed', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaceInsights).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'low_cash',
      severity: 'critical',
      title: 'Low cash',
      summary: 'Cash is low',
      createdAt: now,
    });

    await db
      .update(workspaceInsights)
      .set({ status: 'dismissed' })
      .where(eq(workspaceInsights.id, id));

    const [result] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(result?.status).toBe('dismissed');
  });

  it('updates insight status to engaged with conversationId', async () => {
    const id = crypto.randomUUID();
    const convId = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaceInsights).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'portfolio_drift',
      severity: 'warning',
      title: 'Drift detected',
      summary: 'AAPL drifted 8% from target',
      createdAt: now,
    });

    await db
      .update(workspaceInsights)
      .set({ status: 'engaged', conversationId: convId })
      .where(eq(workspaceInsights.id, id));

    const [result] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(result?.status).toBe('engaged');
    expect(result?.conversationId).toBe(convId);
  });

  it('handles null data column', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaceInsights).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'networth_change',
      severity: 'info',
      title: 'Net worth up',
      summary: 'Your net worth increased 5% this month.',
      data: null,
      createdAt: now,
    });

    const [result] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(result?.data).toBeNull();
  });

  it('handles null expiresAt', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaceInsights).values({
      id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'subscription_spike',
      severity: 'warning',
      title: 'Subs up',
      summary: 'Monthly subscriptions increased 30%.',
      createdAt: now,
      expiresAt: null,
    });

    const [result] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(result?.expiresAt).toBeNull();
  });

  it('orders insights by createdAt descending', async () => {
    const t1 = new Date('2026-03-01T10:00:00Z');
    const t2 = new Date('2026-03-01T11:00:00Z');
    const t3 = new Date('2026-03-01T12:00:00Z');

    await db.insert(workspaceInsights).values([
      {
        id: 'ins-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'critical',
        title: 'First',
        summary: 'A',
        createdAt: t1,
      },
      {
        id: 'ins-2',
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'warning',
        title: 'Second',
        summary: 'B',
        createdAt: t2,
      },
      {
        id: 'ins-3',
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'low_cash',
        severity: 'info',
        title: 'Third',
        summary: 'C',
        createdAt: t3,
      },
    ]);

    const results = await db
      .select()
      .from(workspaceInsights)
      .orderBy(desc(workspaceInsights.createdAt));
    expect(results).toHaveLength(3);
    expect(results[0]?.id).toBe('ins-3');
    expect(results[1]?.id).toBe('ins-2');
    expect(results[2]?.id).toBe('ins-1');
  });
});
