import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { holdings } from '../db/schema';
import type { PolygonService } from './polygon';

/**
 * The benchmark counterfactual — the product's most sobering number.
 *
 * Design (P3): for every position whose cost basis AND acquisition date are
 * known, ask "what would the same dollars be worth had they gone into the
 * S&P 500 on the same day?" using daily closes (cached in marketBars via the
 * existing Polygon pipeline):
 *
 *   counterfactual = costBasis × (SPY_close_today / SPY_close_at_acquisition)
 *
 * This is a true same-dollars, same-dates comparison — not a time-weighted
 * index return that ignores when the user actually invested. Positions
 * missing basis or date are excluded and reported as uncovered, so the
 * number is never fabricated. Lot-level granularity (multiple buys per
 * symbol) arrives with brokerage-API history; statements give us one date
 * per position, which the import records as the earliest lot.
 */

const BENCHMARK_SYMBOL = 'SPY';
/** Look ahead a few days from the acquisition date to skip weekends/holidays. */
const TRADING_DAY_WINDOW_DAYS = 7;

export interface BenchmarkPosition {
  symbol: string;
  invested: number;
  actualValue: number;
  counterfactualValue: number;
  acquiredAt: string;
}

export interface BenchmarkResult {
  benchmarkSymbol: string;
  /** Sum of cost basis across covered positions */
  invested: number;
  actualValue: number;
  counterfactualValue: number;
  /** Fraction of total holdings value that the comparison covers, 0..1 */
  coverage: number;
  positions: BenchmarkPosition[];
}

function isoDaysAfter(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function closeOnOrAfter(
  polygon: PolygonService,
  db: DB,
  date: string,
): Promise<number | null> {
  const from = date;
  const to = isoDaysAfter(date, TRADING_DAY_WINDOW_DAYS);
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();

  const cached = await polygon.getCachedBars(db, BENCHMARK_SYMBOL, 'day', 1, fromMs, toMs);
  if (cached && cached.length > 0) return cached[0]?.close ?? null;

  const bars = await polygon.getAggregates(BENCHMARK_SYMBOL, 1, 'day', from, to, 'asc', 10);
  if (bars.length > 0) {
    await polygon.cacheBars(db, BENCHMARK_SYMBOL, 'day', 1, bars);
    return bars[0]?.close ?? null;
  }
  return null;
}

async function latestClose(polygon: PolygonService, db: DB): Promise<number | null> {
  try {
    const snapshot = await polygon.getSnapshot(BENCHMARK_SYMBOL);
    const live = snapshot.lastTrade?.price ?? snapshot.day?.close ?? snapshot.prevDay?.close;
    if (live && live > 0) return live;
  } catch {
    // fall through to bars
  }
  const today = new Date().toISOString().slice(0, 10);
  const from = isoDaysAfter(today, -TRADING_DAY_WINDOW_DAYS);
  const bars = await polygon.getAggregates(BENCHMARK_SYMBOL, 1, 'day', from, today, 'desc', 10);
  return bars[0]?.close ?? null;
}

export async function computeBenchmark(
  db: DB,
  polygon: PolygonService,
  userId: string,
  workspaceId: string,
): Promise<BenchmarkResult | null> {
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)));

  const totalValue = rows.reduce((s, h) => s + h.value, 0);
  const eligible = rows.filter(
    (h) => h.costBasis !== null && h.costBasis > 0 && h.acquiredAt !== null,
  );
  if (eligible.length === 0 || totalValue === 0) return null;

  const spyNow = await latestClose(polygon, db);
  if (!spyNow) return null;

  const positions: BenchmarkPosition[] = [];
  for (const holding of eligible) {
    const acquiredAt = holding.acquiredAt as string;
    const spyThen = await closeOnOrAfter(polygon, db, acquiredAt);
    if (!spyThen || spyThen <= 0) continue;

    const invested = holding.costBasis as number;
    positions.push({
      symbol: holding.symbol,
      invested,
      actualValue: holding.value,
      counterfactualValue: invested * (spyNow / spyThen),
      acquiredAt,
    });
  }
  if (positions.length === 0) return null;

  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const actualValue = positions.reduce((s, p) => s + p.actualValue, 0);
  const counterfactualValue = positions.reduce((s, p) => s + p.counterfactualValue, 0);

  return {
    benchmarkSymbol: BENCHMARK_SYMBOL,
    invested,
    actualValue,
    counterfactualValue,
    coverage: actualValue / totalValue,
    positions,
  };
}
