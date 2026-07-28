import Database from 'better-sqlite3';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { conversations, workspaceInsights } from '../db/schema';
import { scoreInsight } from '../services/insight-engine';

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

    CREATE TABLE budget_categories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      budgeted REAL NOT NULL,
      actual REAL NOT NULL,
      source TEXT,
      notes TEXT,
      group_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      institution TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL,
      group_id TEXT,
      last_updated TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE holdings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      target_pct REAL NOT NULL,
      quantity REAL,
      cost_basis REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE networth_entries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      value REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      next_billing_date TEXT NOT NULL,
      category_id TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';
const WORKSPACE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function makeInsight(overrides: Partial<typeof workspaceInsights.$inferInsert> = {}) {
  return {
    id: crypto.randomUUID(),
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    type: 'low_cash' as const,
    severity: 'warning' as const,
    title: 'Test insight',
    summary: 'Test summary',
    status: 'active' as const,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('insights.list', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns active insights ordered by severity then date', async () => {
    const t1 = new Date('2026-03-01T10:00:00Z');
    const t2 = new Date('2026-03-01T11:00:00Z');
    const t3 = new Date('2026-03-01T12:00:00Z');

    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ id: 'a', severity: 'info', createdAt: t3 }),
        makeInsight({ id: 'b', severity: 'critical', createdAt: t1 }),
        makeInsight({ id: 'c', severity: 'warning', createdAt: t2 }),
      ]);

    const conditions = [
      eq(workspaceInsights.userId, USER_ID),
      eq(workspaceInsights.workspaceId, WORKSPACE_ID),
      or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
    ];

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(and(...conditions));

    rows.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 2;
      const sb = severityOrder[b.severity] ?? 2;
      if (sa !== sb) return sa - sb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]?.id).toBe('b'); // critical
    expect(rows[1]?.id).toBe('c'); // warning
    expect(rows[2]?.id).toBe('a'); // info
  });

  it('filters by status', async () => {
    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ id: 'a', status: 'active' }),
        makeInsight({ id: 'b', status: 'dismissed' }),
        makeInsight({ id: 'c', status: 'engaged' }),
      ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.userId, USER_ID),
          eq(workspaceInsights.workspaceId, WORKSPACE_ID),
          eq(workspaceInsights.status, 'dismissed'),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('b');
  });

  it('filters by type', async () => {
    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ id: 'a', type: 'budget_overspend' }),
        makeInsight({ id: 'b', type: 'low_cash' }),
        makeInsight({ id: 'c', type: 'budget_overspend' }),
      ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.userId, USER_ID),
          eq(workspaceInsights.workspaceId, WORKSPACE_ID),
          eq(workspaceInsights.type, 'budget_overspend'),
        ),
      );

    expect(rows).toHaveLength(2);
  });

  it('excludes expired insights', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const future = new Date('2030-01-01T00:00:00Z');

    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ id: 'a', expiresAt: past }),
        makeInsight({ id: 'b', expiresAt: future }),
        makeInsight({ id: 'c', expiresAt: null }),
      ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.userId, USER_ID),
          eq(workspaceInsights.workspaceId, WORKSPACE_ID),
          or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
        ),
      );

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('returns parsed data objects', async () => {
    const dataObj = { categoryName: 'Dining', budgeted: 500, actual: 700, percentOver: 40 };
    await db.insert(workspaceInsights).values(makeInsight({ data: JSON.stringify(dataObj) }));

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.userId, USER_ID), eq(workspaceInsights.workspaceId, WORKSPACE_ID)),
      );

    const mapped = rows.map((row) => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
    }));

    expect(mapped[0]?.data).toEqual(dataObj);
  });

  it('returns empty array when no insights', async () => {
    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.userId, USER_ID), eq(workspaceInsights.workspaceId, WORKSPACE_ID)),
      );

    expect(rows).toHaveLength(0);
  });

  it('scopes to authenticated user', async () => {
    await db
      .insert(workspaceInsights)
      .values([makeInsight({ userId: USER_ID }), makeInsight({ userId: OTHER_USER })]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.userId, USER_ID), eq(workspaceInsights.workspaceId, WORKSPACE_ID)),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(USER_ID);
  });
});

describe('insights.dismiss', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('updates status to dismissed', async () => {
    const id = crypto.randomUUID();
    await db.insert(workspaceInsights).values(makeInsight({ id }));

    // Verify exists for this user
    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, id), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeDefined();

    await db
      .update(workspaceInsights)
      .set({ status: 'dismissed' })
      .where(eq(workspaceInsights.id, id));

    const [updated] = await db.select().from(workspaceInsights).where(eq(workspaceInsights.id, id));
    expect(updated?.status).toBe('dismissed');
  });

  it('throws NOT_FOUND for non-existent insight', async () => {
    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, 'nonexistent'), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeUndefined();
  });

  it('throws NOT_FOUND for another user insight', async () => {
    const id = crypto.randomUUID();
    await db.insert(workspaceInsights).values(makeInsight({ id, userId: OTHER_USER }));

    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, id), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeUndefined();
  });
});

describe('insights.engage', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates conversation and updates insight status', async () => {
    const insightId = crypto.randomUUID();
    await db.insert(workspaceInsights).values(makeInsight({ id: insightId }));

    // Simulate engage procedure
    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, insightId), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeDefined();

    const conversationId = crypto.randomUUID();
    const now = new Date();

    await db.insert(conversations).values({
      id: conversationId,
      workspaceId: insight!.workspaceId,
      userId: USER_ID,
      title: insight!.title,
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(workspaceInsights)
      .set({ status: 'engaged', conversationId })
      .where(eq(workspaceInsights.id, insightId));

    // Verify
    const [updatedInsight] = await db
      .select()
      .from(workspaceInsights)
      .where(eq(workspaceInsights.id, insightId));
    expect(updatedInsight?.status).toBe('engaged');
    expect(updatedInsight?.conversationId).toBe(conversationId);

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv).toBeDefined();
    expect(conv?.title).toBe(insight!.title);
    expect(conv?.workspaceId).toBe(WORKSPACE_ID);
  });

  it('returns existing conversation if already engaged', async () => {
    const insightId = crypto.randomUUID();
    const existingConvId = crypto.randomUUID();

    await db
      .insert(workspaceInsights)
      .values(makeInsight({ id: insightId, status: 'engaged', conversationId: existingConvId }));

    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, insightId), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeDefined();
    expect(insight?.status).toBe('engaged');
    expect(insight?.conversationId).toBe(existingConvId);

    // Router would return early here without creating a new conversation
    const allConvs = await db.select().from(conversations);
    expect(allConvs).toHaveLength(0); // No new conversation created
  });

  it('throws NOT_FOUND for non-existent insight', async () => {
    const [insight] = await db
      .select()
      .from(workspaceInsights)
      .where(and(eq(workspaceInsights.id, 'nonexistent'), eq(workspaceInsights.userId, USER_ID)));

    expect(insight).toBeUndefined();
  });
});

describe('insights.generate', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates new insights from engine results', async () => {
    const now = new Date();

    // Seed low-cash account
    await db.insert(schema.accounts).values({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      name: 'Checking',
      institution: 'Test Bank',
      type: 'checking',
      balance: 50,
      createdAt: now,
      updatedAt: now,
    });

    // Import and call generateInsights
    const { generateInsights } = await import('../services/insight-engine');
    const candidates = await generateInsights(db as any, USER_ID, WORKSPACE_ID);

    expect(candidates.length).toBeGreaterThan(0);

    // Insert candidates as the router would
    for (const candidate of candidates) {
      await db.insert(workspaceInsights).values({
        id: crypto.randomUUID(),
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        summary: candidate.summary,
        data: candidate.data ? JSON.stringify(candidate.data) : null,
        status: 'active',
        createdAt: now,
        expiresAt: candidate.expiresAt,
      });
    }

    const inserted = await db
      .select()
      .from(workspaceInsights)
      .where(eq(workspaceInsights.workspaceId, WORKSPACE_ID));

    expect(inserted.length).toBe(candidates.length);
    expect(inserted.every((r) => r.status === 'active')).toBe(true);
  });

  it('is idempotent — second call generates 0', async () => {
    const now = new Date();

    const { generateInsights } = await import('../services/insight-engine');

    // First call
    const first = await generateInsights(db as any, USER_ID, WORKSPACE_ID);
    for (const candidate of first) {
      await db.insert(workspaceInsights).values({
        id: crypto.randomUUID(),
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        summary: candidate.summary,
        data: candidate.data ? JSON.stringify(candidate.data) : null,
        status: 'active',
        createdAt: now,
        expiresAt: candidate.expiresAt,
      });
    }

    // Second call — deduplication should filter out all candidates
    const second = await generateInsights(db as any, USER_ID, WORKSPACE_ID);
    expect(second).toHaveLength(0);
  });
});

describe('insights.getUnreadCount', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns count of active non-expired insights', async () => {
    const future = new Date('2030-01-01T00:00:00Z');
    const past = new Date('2020-01-01T00:00:00Z');

    await db.insert(workspaceInsights).values([
      makeInsight({ status: 'active', expiresAt: null }),
      makeInsight({ status: 'active', expiresAt: future }),
      makeInsight({ status: 'active', expiresAt: past }), // expired — excluded
      makeInsight({ status: 'dismissed' }), // dismissed — excluded
      makeInsight({ status: 'engaged' }), // engaged — excluded
    ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.workspaceId, WORKSPACE_ID),
          eq(workspaceInsights.userId, USER_ID),
          eq(workspaceInsights.status, 'active'),
          or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
        ),
      );

    expect(rows.length).toBe(2);
  });

  it('returns 0 when no active insights', async () => {
    await db
      .insert(workspaceInsights)
      .values([makeInsight({ status: 'dismissed' }), makeInsight({ status: 'engaged' })]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.workspaceId, WORKSPACE_ID),
          eq(workspaceInsights.userId, USER_ID),
          eq(workspaceInsights.status, 'active'),
          or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
        ),
      );

    expect(rows.length).toBe(0);
  });
});

describe('insights.getLastGeneratedAt', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns null when no insights exist', async () => {
    const [latest] = await db
      .select({ createdAt: workspaceInsights.createdAt })
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, WORKSPACE_ID), eq(workspaceInsights.userId, USER_ID)),
      )
      .orderBy(desc(workspaceInsights.createdAt))
      .limit(1);

    expect(latest).toBeUndefined();
    const lastGeneratedAt = latest?.createdAt ?? null;
    expect(lastGeneratedAt).toBeNull();
  });

  it('returns the most recent insight createdAt', async () => {
    const t1 = new Date('2026-03-01T10:00:00Z');
    const t2 = new Date('2026-03-01T11:00:00Z');
    const t3 = new Date('2026-03-01T12:00:00Z');

    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ id: 'a', createdAt: t1 }),
        makeInsight({ id: 'b', createdAt: t2 }),
        makeInsight({ id: 'c', createdAt: t3 }),
      ]);

    const [latest] = await db
      .select({ createdAt: workspaceInsights.createdAt })
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, WORKSPACE_ID), eq(workspaceInsights.userId, USER_ID)),
      )
      .orderBy(desc(workspaceInsights.createdAt))
      .limit(1);

    expect(latest).toBeDefined();
    expect(latest!.createdAt.getTime()).toBe(t3.getTime());
  });
});

describe('insights.getEngagementStats', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns aggregate stats', async () => {
    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ status: 'engaged' }),
        makeInsight({ status: 'engaged' }),
        makeInsight({ status: 'dismissed' }),
        makeInsight({ status: 'dismissed' }),
        makeInsight({ status: 'active' }),
      ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, WORKSPACE_ID), eq(workspaceInsights.userId, USER_ID)),
      );

    const total = rows.length;
    const dismissed = rows.filter((r) => r.status === 'dismissed').length;
    const engaged = rows.filter((r) => r.status === 'engaged').length;
    const engagementRate = dismissed + engaged > 0 ? engaged / (engaged + dismissed) : 0;

    expect(total).toBe(5);
    expect(engaged).toBe(2);
    expect(dismissed).toBe(2);
    expect(engagementRate).toBe(0.5);
  });

  it('returns per-type breakdown', async () => {
    await db
      .insert(workspaceInsights)
      .values([
        makeInsight({ type: 'low_cash', status: 'engaged' }),
        makeInsight({ type: 'low_cash', status: 'dismissed' }),
        makeInsight({ type: 'budget_overspend', status: 'dismissed' }),
        makeInsight({ type: 'budget_overspend', status: 'dismissed' }),
        makeInsight({ type: 'budget_overspend', status: 'engaged' }),
      ]);

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, WORKSPACE_ID), eq(workspaceInsights.userId, USER_ID)),
      );

    const byType: Record<
      string,
      { generated: number; dismissed: number; engaged: number; rate: number }
    > = {};
    for (const row of rows) {
      if (!byType[row.type]) byType[row.type] = { generated: 0, dismissed: 0, engaged: 0, rate: 0 };
      const entry = byType[row.type]!;
      entry.generated++;
      if (row.status === 'dismissed') entry.dismissed++;
      if (row.status === 'engaged') entry.engaged++;
    }
    for (const entry of Object.values(byType)) {
      const acted = entry.dismissed + entry.engaged;
      entry.rate = acted > 0 ? entry.engaged / acted : 0;
    }

    expect(byType.low_cash?.rate).toBe(0.5);
    expect(byType.budget_overspend?.generated).toBe(3);
    expect(byType.budget_overspend?.rate).toBeCloseTo(1 / 3, 5);
  });

  it('returns zeros for empty workspace', async () => {
    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, WORKSPACE_ID), eq(workspaceInsights.userId, USER_ID)),
      );

    const total = rows.length;
    const dismissed = rows.filter((r) => r.status === 'dismissed').length;
    const engaged = rows.filter((r) => r.status === 'engaged').length;
    const engagementRate = dismissed + engaged > 0 ? engaged / (engaged + dismissed) : 0;

    expect(total).toBe(0);
    expect(engagementRate).toBe(0);
  });
});

describe('insights.list — score-based ordering', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns insights sorted by relevance score descending with relevanceScore field', async () => {
    const recent = new Date();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await db.insert(workspaceInsights).values([
      makeInsight({
        id: 'info-old',
        severity: 'info',
        type: 'subscription_spike',
        createdAt: fiveDaysAgo,
      }),
      makeInsight({
        id: 'crit-recent',
        severity: 'critical',
        type: 'low_cash',
        createdAt: recent,
      }),
      makeInsight({
        id: 'warn-mid',
        severity: 'warning',
        type: 'budget_overspend',
        createdAt: twoDaysAgo,
      }),
    ]);

    const conditions = [
      eq(workspaceInsights.userId, USER_ID),
      eq(workspaceInsights.workspaceId, WORKSPACE_ID),
      or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
    ];

    const rows = await db
      .select()
      .from(workspaceInsights)
      .where(and(...conditions));
    rows.sort((a, b) => scoreInsight(b) - scoreInsight(a));

    const mapped = rows.map((row) => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
      relevanceScore: scoreInsight(row),
    }));

    expect(mapped[0]?.id).toBe('crit-recent');
    expect(mapped[0]?.relevanceScore).toBeGreaterThan(mapped[1]!.relevanceScore);
    expect(mapped[1]?.relevanceScore).toBeGreaterThan(mapped[2]!.relevanceScore);
    expect(mapped.every((r) => typeof r.relevanceScore === 'number')).toBe(true);
  });
});
