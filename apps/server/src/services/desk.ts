import { and, count, eq, gte } from 'drizzle-orm';
import type { DB } from '../db';
import { files, holdings, tax1099s, trades } from '../db/schema';
import { computeDeskStatus, computeRealizedGains, reconcile1099 } from '../lib/calc';
import type { DeskStatus, Extracted1099 } from '../lib/calc';
import { buildTaxPicture } from './tax-picture';

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;
const WASH_WINDOW_DAYS = 30;
const LTCG_RATE_ABOVE_ZERO_BRACKET = 0.15;

export interface DeskPosition {
  id: string;
  symbol: string;
  name: string;
  value: number;
  quantity: number | null;
  costBasis: number | null;
  acquiredAt: string | null;
  unrealized: number | null;
  term: 'short' | 'long' | null;
  daysToLongTerm: number | null;
}

/**
 * Every position with the things a decision turns on. One place for the
 * arithmetic, so the panels that slice it differently can't drift apart.
 *
 * Null rather than zero wherever the basis or date is missing — the
 * difference between "no gain" and "we don't know" is the whole product.
 */
export async function getDeskPositions(
  db: DB,
  userId: string,
  workspaceId: string,
  today = new Date(),
): Promise<DeskPosition[]> {
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)))
    .orderBy(holdings.symbol);

  return rows.map((h) => {
    const basisKnown = h.costBasis !== null && h.costBasis > 0;
    const heldDays = h.acquiredAt
      ? Math.floor((today.getTime() - new Date(`${h.acquiredAt}T00:00:00Z`).getTime()) / DAY_MS)
      : null;
    const isLong = heldDays !== null && heldDays > LONG_TERM_DAYS;
    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      value: h.value,
      quantity: h.quantity,
      costBasis: basisKnown ? h.costBasis : null,
      acquiredAt: h.acquiredAt,
      unrealized: basisKnown ? h.value - (h.costBasis as number) : null,
      term: heldDays === null ? null : isLong ? ('long' as const) : ('short' as const),
      daysToLongTerm: heldDays === null || isLong ? null : LONG_TERM_DAYS + 1 - heldDays,
    };
  });
}

/**
 * The sell decision, laid out side by side: every position against the
 * questions that decide it.
 *
 * Each row answers "if this were the only thing you sold" — the 0% bracket is
 * a shared allowance, so applying it to every row independently is a
 * simplification, and the panel says so rather than quietly compounding it.
 */
export async function getDeskComparison(
  db: DB,
  userId: string,
  workspaceId: string,
  today = new Date(),
) {
  const positions = await getDeskPositions(db, userId, workspaceId, today);

  const picture = await buildTaxPicture(db, userId, workspaceId);
  const marginalRate = picture.hasProfile ? picture.result.marginalFederalRate : null;
  const zeroBracketRoom = picture.hasProfile ? picture.result.ltcgZeroBracketRoom : 0;

  // A buy of the same symbol inside the window means selling at a loss now
  // would have that loss disallowed.
  const cutoff = new Date(today.getTime() - WASH_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const recentBuys = await db
    .select({ symbol: trades.symbol })
    .from(trades)
    .where(
      and(
        eq(trades.workspaceId, workspaceId),
        eq(trades.userId, userId),
        eq(trades.side, 'buy'),
        gte(trades.tradeDate, cutoff),
      ),
    );
  const boughtRecently = new Set(recentBuys.map((t) => t.symbol.toUpperCase()));

  return {
    context: {
      hasTaxProfile: picture.hasProfile,
      marginalFederalRatePct: marginalRate,
      ltcgZeroBracketRoom: zeroBracketRoom,
    },
    positions: positions.map((p) => {
      let estimatedTaxIfSoldToday: number | null = null;
      if (p.unrealized !== null && p.term !== null && marginalRate !== null) {
        if (p.unrealized <= 0) {
          estimatedTaxIfSoldToday = 0;
        } else if (p.term === 'short') {
          estimatedTaxIfSoldToday = p.unrealized * (marginalRate / 100);
        } else {
          const taxable = Math.max(0, p.unrealized - zeroBracketRoom);
          estimatedTaxIfSoldToday = taxable * LTCG_RATE_ABOVE_ZERO_BRACKET;
        }
      }
      return {
        ...p,
        estimatedTaxIfSoldToday,
        // Only a loss can be disallowed, so the flag is about losses only
        washRisk:
          p.unrealized !== null && p.unrealized < 0 && boughtRecently.has(p.symbol.toUpperCase()),
      };
    }),
  };
}

/**
 * Gathers everything the desk's standing status needs and hands it to the
 * pure engine. Nothing is decided here — this file only fetches.
 */
export async function getDeskStatus(
  db: DB,
  userId: string,
  workspaceId: string,
  taxYear: number,
  today = new Date(),
): Promise<DeskStatus> {
  const positions = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)));

  const tradeRows = await db
    .select()
    .from(trades)
    .where(and(eq(trades.workspaceId, workspaceId), eq(trades.userId, userId)));

  const lotTrades = tradeRows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side as 'buy' | 'sell',
    tradeDate: t.tradeDate,
    units: t.units,
    price: t.price,
    fees: t.fees,
  }));
  const ledger = tradeRows.length > 0 ? computeRealizedGains(lotTrades, taxYear) : null;

  const [documents] = await db
    .select({ value: count() })
    .from(files)
    .where(and(eq(files.workspaceId, workspaceId), eq(files.userId, userId)));

  // A 1099 covering this year, reconciled against the same ledger
  const [form] = await db
    .select()
    .from(tax1099s)
    .where(
      and(
        eq(tax1099s.workspaceId, workspaceId),
        eq(tax1099s.userId, userId),
        eq(tax1099s.taxYear, taxYear),
      ),
    );
  let reconciliation: {
    matches: number;
    mismatches: number;
    missingHistory: number;
    notOn1099: number;
  } | null = null;
  if (form && ledger) {
    const extracted = JSON.parse(form.payload) as Extracted1099;
    const result = reconcile1099(extracted, ledger.sales);
    reconciliation = {
      matches: result.matches,
      mismatches: result.mismatches,
      missingHistory: result.missingHistory,
      notOn1099: result.notOn1099,
    };
  }

  const picture = await buildTaxPicture(db, userId, workspaceId);
  // The profile carries its own year. A 2026 profile says nothing about 2025,
  // so the lines that depend on it read as not-started rather than borrowing
  // the wrong year's numbers.
  const profileCoversYear = picture.hasProfile && picture.inputs.taxYear === taxYear;

  return computeDeskStatus({
    taxYear,
    today,
    holdings: positions.map((h) => ({
      symbol: h.symbol,
      costBasis: h.costBasis,
      acquiredAt: h.acquiredAt,
      value: h.value,
    })),
    realized: ledger
      ? {
          shortTermGain: ledger.shortTermGain,
          longTermGain: ledger.longTermGain,
          washDisallowed: ledger.washDisallowed,
          saleCount: ledger.sales.filter((s) => s.units > 0).length,
        }
      : null,
    hasTrades: tradeRows.length > 0,
    documentCount: documents?.value ?? 0,
    reconciliation,
    hasTaxProfile: profileCoversYear,
    ltcgZeroBracketRoom: profileCoversYear ? picture.result.ltcgZeroBracketRoom : 0,
    quarterly: profileCoversYear ? picture.quarterly : null,
  });
}
