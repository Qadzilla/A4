import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import {
  analyzeLowCash,
  analyzePortfolioDrift,
  generateInsights,
  scoreInsight,
} from '../services/insight-engine';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
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
    CREATE TABLE debts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      balance REAL NOT NULL,
      annual_interest_rate REAL NOT NULL,
      minimum_payment REAL NOT NULL,
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

const WS = 'ws-test';
const USER = 'user-test';
const now = new Date();

describe('analyzeLowCash', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns critical when total liquid < 100', async () => {
    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Bank',
      type: 'checking',
      balance: 50,
      createdAt: now,
      updatedAt: now,
    });
    const results = await analyzeLowCash(db, USER, WS);
    expect(results).toHaveLength(1);
    expect(results[0]?.severity).toBe('critical');
  });

  it('returns warning when total liquid 100-499', async () => {
    await db.insert(schema.accounts).values([
      {
        id: 'acc-1',
        workspaceId: WS,
        userId: USER,
        name: 'Checking',
        institution: 'Bank',
        type: 'checking',
        balance: 200,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-2',
        workspaceId: WS,
        userId: USER,
        name: 'Savings',
        institution: 'Bank',
        type: 'savings',
        balance: 100,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const results = await analyzeLowCash(db, USER, WS);
    expect(results).toHaveLength(1);
    expect(results[0]?.severity).toBe('warning');
  });

  it('skips when total liquid >= 500', async () => {
    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Bank',
      type: 'checking',
      balance: 5000,
      createdAt: now,
      updatedAt: now,
    });
    const results = await analyzeLowCash(db, USER, WS);
    expect(results).toHaveLength(0);
  });

  it('skips when no checking/savings accounts', async () => {
    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Credit Card',
      institution: 'Bank',
      type: 'credit_card',
      balance: -500,
      createdAt: now,
      updatedAt: now,
    });
    const results = await analyzeLowCash(db, USER, WS);
    expect(results).toHaveLength(0);
  });
});

describe('analyzePortfolioDrift', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns warning for >5% drift', async () => {
    // 60/40 split vs 50/50 target → 10% drift each (>5 but <=15 = warning)
    await db.insert(schema.holdings).values([
      {
        id: 'h-1',
        workspaceId: WS,
        userId: USER,
        symbol: 'AAPL',
        name: 'Apple',
        value: 6000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'h-2',
        workspaceId: WS,
        userId: USER,
        symbol: 'GOOG',
        name: 'Google',
        value: 4000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const results = await analyzePortfolioDrift(db, USER, WS);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.severity === 'warning')).toBe(true);
  });

  it('returns critical for >15% drift', async () => {
    await db.insert(schema.holdings).values([
      {
        id: 'h-1',
        workspaceId: WS,
        userId: USER,
        symbol: 'AAPL',
        name: 'Apple',
        value: 9000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'h-2',
        workspaceId: WS,
        userId: USER,
        symbol: 'GOOG',
        name: 'Google',
        value: 1000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const results = await analyzePortfolioDrift(db, USER, WS);
    expect(results.some((r) => r.severity === 'critical')).toBe(true);
  });

  it('skips holdings without targetPct', async () => {
    await db.insert(schema.holdings).values([
      {
        id: 'h-1',
        workspaceId: WS,
        userId: USER,
        symbol: 'AAPL',
        name: 'Apple',
        value: 5000,
        targetPct: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'h-2',
        workspaceId: WS,
        userId: USER,
        symbol: 'GOOG',
        name: 'Google',
        value: 5000,
        targetPct: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const results = await analyzePortfolioDrift(db, USER, WS);
    expect(results).toHaveLength(0);
  });

  it('skips when portfolio value is 0', async () => {
    await db.insert(schema.holdings).values({
      id: 'h-1',
      workspaceId: WS,
      userId: USER,
      symbol: 'AAPL',
      name: 'Apple',
      value: 0,
      targetPct: 50,
      createdAt: now,
      updatedAt: now,
    });
    const results = await analyzePortfolioDrift(db, USER, WS);
    expect(results).toHaveLength(0);
  });
});

describe('generateInsights — deduplication', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('filters out candidates with matching active dedupeKeys', async () => {
    // Insert an active insight with a dedupeKey matching what budget_overspend would generate
    await db.insert(schema.workspaceInsights).values({
      id: 'existing-1',
      workspaceId: WS,
      userId: USER,
      type: 'low_cash',
      severity: 'warning',
      title: 'Existing',
      summary: 'Existing',
      data: JSON.stringify({
        dedupeKey: 'low_cash:workspace',
        totalLiquid: 300,
        threshold: 500,
        lowestAccount: 'Checking',
        lowestBalance: 300,
      }),
      status: 'active',
      createdAt: now,
    });

    // Seed account data that would generate the same dedupeKey
    await db.insert(schema.accounts).values({
      id: 'acct-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Chase',
      type: 'checking',
      balance: 300,
      createdAt: now,
      updatedAt: now,
    });

    const results = await generateInsights(db, USER, WS);
    const budgetInsights = results.filter((r) => r.type === 'low_cash');
    expect(budgetInsights).toHaveLength(0);
  });

  it('allows regeneration after dismissal', async () => {
    // Insert a dismissed insight — should NOT block new candidates
    await db.insert(schema.workspaceInsights).values({
      id: 'dismissed-1',
      workspaceId: WS,
      userId: USER,
      type: 'low_cash',
      severity: 'warning',
      title: 'Old',
      summary: 'Old',
      data: JSON.stringify({
        dedupeKey: 'low_cash:workspace',
        totalLiquid: 300,
        threshold: 500,
        lowestAccount: 'Checking',
        lowestBalance: 300,
      }),
      status: 'dismissed',
      createdAt: now,
    });

    await db.insert(schema.accounts).values({
      id: 'acct-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Chase',
      type: 'checking',
      balance: 300,
      createdAt: now,
      updatedAt: now,
    });

    const results = await generateInsights(db, USER, WS);
    const budgetInsights = results.filter((r) => r.type === 'low_cash');
    expect(budgetInsights).toHaveLength(1);
  });

  it('runs all analyzers in parallel and returns combined results', async () => {
    // Seed data for both surviving analyzers: low cash + portfolio drift
    await db.insert(schema.accounts).values({
      id: 'acct-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Chase',
      type: 'checking',
      balance: 300,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.holdings).values([
      {
        id: 'h-1',
        workspaceId: WS,
        userId: USER,
        symbol: 'AAPL',
        name: 'Apple',
        value: 9000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'h-2',
        workspaceId: WS,
        userId: USER,
        symbol: 'VOO',
        name: 'Vanguard',
        value: 1000,
        targetPct: 50,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const results = await generateInsights(db, USER, WS);
    const types = new Set(results.map((r) => r.type));
    expect(types.has('low_cash')).toBe(true);
    expect(types.has('portfolio_drift')).toBe(true);
  });
});

describe('scoreInsight', () => {
  it('critical + recent + high-confidence → score > 0.9', () => {
    const score = scoreInsight({ type: 'low_cash', severity: 'critical', createdAt: new Date() });
    expect(score).toBeGreaterThan(0.9);
  });

  it('info + old + low-confidence → score < 0.3', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const score = scoreInsight({
      type: 'subscription_spike',
      severity: 'info',
      createdAt: eightDaysAgo,
    });
    expect(score).toBeLessThan(0.3);
  });

  it('recency decays linearly — newer scores higher', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const hundredHoursAgo = new Date(Date.now() - 100 * 60 * 60 * 1000);
    const newer = scoreInsight({ type: 'low_cash', severity: 'warning', createdAt: oneHourAgo });
    const older = scoreInsight({
      type: 'low_cash',
      severity: 'warning',
      createdAt: hundredHoursAgo,
    });
    expect(newer).toBeGreaterThan(older);
  });

  it('severity dominates — critical + old beats info + new', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const critical = scoreInsight({
      type: 'low_cash',
      severity: 'critical',
      createdAt: sixDaysAgo,
    });
    const info = scoreInsight({ type: 'low_cash', severity: 'info', createdAt: new Date() });
    expect(critical).toBeGreaterThan(info);
  });

  it('clamps recency at 0 for >7 days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const score = scoreInsight({ type: 'low_cash', severity: 'warning', createdAt: tenDaysAgo });
    // severity*0.5 + 0 + confidence*0.2 = 0.6*0.5 + 0 + 1.0*0.2 = 0.5
    expect(score).toBeCloseTo(0.5, 1);
  });
});

describe('engagement-aware suppression', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('suppresses type with >5 dismissals and <10% engagement', async () => {
    // Seed 8 dismissed low_cash insights
    for (let i = 0; i < 8; i++) {
      await db.insert(schema.workspaceInsights).values({
        id: `sup-${i}`,
        workspaceId: WS,
        userId: USER,
        type: 'low_cash',
        severity: 'warning',
        title: 'Low cash',
        summary: 'Low',
        status: 'dismissed',
        createdAt: now,
      });
    }

    // Seed account data that would trigger low_cash
    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Bank',
      type: 'checking',
      balance: 50,
      createdAt: now,
      updatedAt: now,
    });

    const results = await generateInsights(db, USER, WS);
    const lowCash = results.filter((r) => r.type === 'low_cash');
    expect(lowCash).toHaveLength(0);
  });

  it('does not suppress with ≤5 dismissals', async () => {
    // Seed 3 dismissed low_cash insights
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.workspaceInsights).values({
        id: `sup-${i}`,
        workspaceId: WS,
        userId: USER,
        type: 'low_cash',
        severity: 'warning',
        title: 'Low cash',
        summary: 'Low',
        status: 'dismissed',
        createdAt: now,
      });
    }

    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Bank',
      type: 'checking',
      balance: 50,
      createdAt: now,
      updatedAt: now,
    });

    const results = await generateInsights(db, USER, WS);
    const lowCash = results.filter((r) => r.type === 'low_cash');
    expect(lowCash).toHaveLength(1);
  });

  it('does not suppress with >10% engagement rate', async () => {
    // Seed 6 dismissed + 2 engaged (25% rate)
    for (let i = 0; i < 6; i++) {
      await db.insert(schema.workspaceInsights).values({
        id: `dis-${i}`,
        workspaceId: WS,
        userId: USER,
        type: 'low_cash',
        severity: 'warning',
        title: 'Low cash',
        summary: 'Low',
        status: 'dismissed',
        createdAt: now,
      });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(schema.workspaceInsights).values({
        id: `eng-${i}`,
        workspaceId: WS,
        userId: USER,
        type: 'low_cash',
        severity: 'warning',
        title: 'Low cash',
        summary: 'Low',
        status: 'engaged',
        createdAt: now,
      });
    }

    await db.insert(schema.accounts).values({
      id: 'acc-1',
      workspaceId: WS,
      userId: USER,
      name: 'Checking',
      institution: 'Bank',
      type: 'checking',
      balance: 50,
      createdAt: now,
      updatedAt: now,
    });

    const results = await generateInsights(db, USER, WS);
    const lowCash = results.filter((r) => r.type === 'low_cash');
    expect(lowCash).toHaveLength(1);
  });
});
