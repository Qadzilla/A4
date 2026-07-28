import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { holdings } from '../db/schema';
import { computeBenchmark } from '../services/benchmark';
import type { PolygonService } from '../services/polygon';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE holdings (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      symbol TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, target_pct REAL NOT NULL,
      quantity REAL, cost_basis REAL, acquired_at TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

/** Fake Polygon: SPY at $400 on any historical date, $500 now. */
function fakePolygon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getCachedBars: vi.fn().mockResolvedValue(null),
    cacheBars: vi.fn().mockResolvedValue(undefined),
    getAggregates: vi.fn().mockResolvedValue([{ timestamp: 1, close: 400 }]),
    getSnapshot: vi.fn().mockResolvedValue({ ticker: 'SPY', lastTrade: { price: 500 } }),
    ...overrides,
  } as unknown as PolygonService;
}

async function seedHolding(
  db: TestDb,
  id: string,
  opts: Partial<{
    symbol: string;
    value: number;
    costBasis: number | null;
    acquiredAt: string | null;
  }> = {},
) {
  await db.insert(holdings).values({
    id,
    workspaceId: 'ws-1',
    userId: 'user-1',
    symbol: opts.symbol ?? 'NVDA',
    name: opts.symbol ?? 'NVDA',
    value: opts.value ?? 1600,
    targetPct: 0,
    quantity: null,
    costBasis: opts.costBasis === undefined ? 1000 : opts.costBasis,
    acquiredAt: opts.acquiredAt === undefined ? '2025-01-15' : opts.acquiredAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('computeBenchmark', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('computes the same-dollars counterfactual', async () => {
    // $1000 invested when SPY was $400; SPY now $500 → counterfactual $1250
    await seedHolding(db, 'h1', { value: 1600, costBasis: 1000, acquiredAt: '2025-01-15' });

    const result = await computeBenchmark(db as never, fakePolygon(), 'user-1', 'ws-1');
    expect(result).not.toBeNull();
    expect(result?.invested).toBe(1000);
    expect(result?.actualValue).toBe(1600);
    expect(result?.counterfactualValue).toBeCloseTo(1250, 5);
    expect(result?.coverage).toBe(1);
    expect(result?.benchmarkSymbol).toBe('SPY');
  });

  it('excludes positions missing basis or date and reports coverage honestly', async () => {
    await seedHolding(db, 'h1', { symbol: 'NVDA', value: 1600, costBasis: 1000 });
    await seedHolding(db, 'h2', { symbol: 'VTI', value: 2400, costBasis: null }); // no basis
    await seedHolding(db, 'h3', { symbol: 'BND', value: 1000, acquiredAt: null }); // no date

    const result = await computeBenchmark(db as never, fakePolygon(), 'user-1', 'ws-1');
    expect(result?.positions).toHaveLength(1);
    expect(result?.coverage).toBeCloseTo(1600 / 5000, 5);
  });

  it('returns null when nothing is comparable', async () => {
    await seedHolding(db, 'h1', { costBasis: null, acquiredAt: null });
    expect(await computeBenchmark(db as never, fakePolygon(), 'user-1', 'ws-1')).toBeNull();
    expect(await computeBenchmark(db as never, fakePolygon(), 'user-1', 'ws-empty')).toBeNull();
  });

  it('returns null when the current benchmark price is unavailable', async () => {
    await seedHolding(db, 'h1');
    const polygon = fakePolygon({
      getSnapshot: vi.fn().mockRejectedValue(new Error('403')),
      getAggregates: vi.fn().mockResolvedValue([]),
    });
    expect(await computeBenchmark(db as never, polygon, 'user-1', 'ws-1')).toBeNull();
  });

  it('skips positions whose acquisition-date price cannot be found', async () => {
    await seedHolding(db, 'h1', { symbol: 'NVDA', acquiredAt: '2025-01-15' });
    await seedHolding(db, 'h2', { symbol: 'TSLA', acquiredAt: '2025-06-01' });
    const polygon = fakePolygon({
      getAggregates: vi
        .fn()
        // first historical lookup succeeds, second returns nothing
        .mockResolvedValueOnce([{ timestamp: 1, close: 400 }])
        .mockResolvedValueOnce([]),
    });

    const result = await computeBenchmark(db as never, polygon, 'user-1', 'ws-1');
    expect(result?.positions).toHaveLength(1);
    expect(result?.positions[0]?.symbol).toBe('NVDA');
  });

  it('uses cached bars before hitting the API', async () => {
    await seedHolding(db, 'h1');
    const polygon = fakePolygon({
      getCachedBars: vi.fn().mockResolvedValue([{ timestamp: 1, close: 250 }]),
    });

    const result = await computeBenchmark(db as never, polygon, 'user-1', 'ws-1');
    // $1000 at SPY $250 → $2000 at SPY $500
    expect(result?.counterfactualValue).toBeCloseTo(2000, 5);
    expect(
      (polygon as unknown as { getAggregates: ReturnType<typeof vi.fn> }).getAggregates,
    ).not.toHaveBeenCalled();
  });
});
