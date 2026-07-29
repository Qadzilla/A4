import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { accounts, holdings } from '../db/schema';
import { applyBrokerageSync } from '../services/snaptrade';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE holdings (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      symbol TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, target_pct REAL NOT NULL,
      quantity REAL, cost_basis REAL, acquired_at TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      name TEXT NOT NULL, institution TEXT NOT NULL, type TEXT NOT NULL, balance REAL NOT NULL,
      group_id TEXT, last_updated TEXT, notes TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

const WS = 'ws-1';
const USER = 'user-1';

describe('applyBrokerageSync', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates holdings and a cash-only brokerage account', async () => {
    const summary = await applyBrokerageSync(db as never, USER, WS, [
      {
        institution: 'Robinhood',
        positions: [
          { symbol: 'NVDA', name: 'NVIDIA Corp', units: 10, price: 120, averagePurchasePrice: 90 },
          {
            symbol: 'voo',
            name: 'Vanguard S&P 500',
            units: 2,
            price: 500,
            averagePurchasePrice: null,
          },
        ],
        cash: 412.33,
      },
    ]);

    expect(summary).toEqual({
      accountsSynced: 1,
      positionsCreated: 2,
      positionsUpdated: 0,
      cashAccountsUpserted: 1,
    });

    const rows = await db.select().from(holdings);
    const nvda = rows.find((h) => h.symbol === 'NVDA');
    expect(nvda?.value).toBe(1200);
    expect(nvda?.quantity).toBe(10);
    expect(nvda?.costBasis).toBe(900); // 10 units × $90 avg
    const voo = rows.find((h) => h.symbol === 'VOO'); // symbol uppercased
    expect(voo?.costBasis).toBeNull();

    const [account] = await db.select().from(accounts);
    expect(account?.type).toBe('brokerage-cash');
    expect(account?.balance).toBe(412.33);
    expect(account?.institution).toBe('Robinhood');
  });

  it('updates existing positions but preserves targetPct and acquiredAt', async () => {
    await db.insert(holdings).values({
      id: 'h1',
      workspaceId: WS,
      userId: USER,
      symbol: 'NVDA',
      name: 'NVIDIA',
      value: 1000,
      targetPct: 40,
      quantity: 8,
      costBasis: 700,
      acquiredAt: '2025-01-15', // learned from a statement — sync must not erase it
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await applyBrokerageSync(db as never, USER, WS, [
      {
        institution: 'Robinhood',
        positions: [
          { symbol: 'NVDA', name: 'NVIDIA Corp', units: 10, price: 120, averagePurchasePrice: 95 },
        ],
        cash: null,
      },
    ]);

    expect(summary.positionsUpdated).toBe(1);
    const [row] = await db.select().from(holdings);
    expect(row?.value).toBe(1200);
    expect(row?.quantity).toBe(10);
    expect(row?.costBasis).toBe(950);
    expect(row?.targetPct).toBe(40);
    expect(row?.acquiredAt).toBe('2025-01-15');
  });

  it('keeps the stored cost basis when the brokerage reports no average price', async () => {
    await db.insert(holdings).values({
      id: 'h1',
      workspaceId: WS,
      userId: USER,
      symbol: 'DOGE',
      name: 'Dogecoin',
      value: 100,
      targetPct: 0,
      quantity: 500,
      costBasis: 150,
      acquiredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await applyBrokerageSync(db as never, USER, WS, [
      {
        institution: 'Coinbase',
        positions: [
          { symbol: 'DOGE', name: 'Dogecoin', units: 500, price: 0.3, averagePurchasePrice: null },
        ],
        cash: null,
      },
    ]);

    const [row] = await db.select().from(holdings);
    expect(row?.value).toBeCloseTo(150, 5);
    expect(row?.costBasis).toBe(150); // untouched
  });

  it('skips empty symbols and non-positive units, updates cash account in place', async () => {
    await applyBrokerageSync(db as never, USER, WS, [
      { institution: 'Robinhood', positions: [], cash: 100 },
    ]);
    const summary = await applyBrokerageSync(db as never, USER, WS, [
      {
        institution: 'Robinhood',
        positions: [
          { symbol: '', name: 'Mystery', units: 5, price: 10, averagePurchasePrice: null },
          { symbol: 'AAPL', name: 'Apple', units: 0, price: 200, averagePurchasePrice: null },
        ],
        cash: 250,
      },
    ]);

    expect(summary.positionsCreated).toBe(0);
    const rows = await db.select().from(accounts);
    expect(rows).toHaveLength(1); // updated, not duplicated
    expect(rows[0]?.balance).toBe(250);
  });
});
