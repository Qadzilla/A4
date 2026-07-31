import { and, count, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { files, holdings, tax1099s, trades } from '../db/schema';
import { computeDeskStatus, computeRealizedGains, reconcile1099 } from '../lib/calc';
import type { DeskStatus, Extracted1099 } from '../lib/calc';
import { buildTaxPicture } from './tax-picture';

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
