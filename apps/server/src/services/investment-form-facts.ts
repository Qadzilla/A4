// ─── C3 · Investment documents become facts and trades ─────────────
// One consolidated brokerage PDF carries three families: dividend totals
// (with the qualified split, which is taxed at capital-gains rates — often
// 0% for this audience), interest, and lot-level sale rows. The totals
// become facts; the sale rows become document-sourced trades in the same
// table SnapTrade fills, so the lot engine and the ledger recompute from
// them with no new machinery — which is exactly what makes the corrected-
// consolidated-in-March scenario a re-run instead of a rewrite.
//
// The rules, from BASIS_FILING.md C3:
//  - Numbers as printed. Qualified dividends exceeding ordinary is the
//    broker's error to own — asserted verbatim, never clamped.
//  - No basis imputation: a row without basis produces a sell with no
//    matching buy, and the lot engine's existing uncovered-units honesty
//    carries it. The 8949 category rides the stored row for D5.
//  - A sale the trades table already has (SnapTrade sync, manual entry) is
//    not inserted twice: matched on symbol, date and units, skipped, and
//    any proceeds disagreement surfaced — never silently preferred.
//  - Wash-sale logic stays in the lot engine. Nothing here nets anything.

import type { FactAssertion, FactId } from '../lib/calc/filing/facts';
import { makeAssertion } from '../lib/calc/filing/facts';

export interface ExtractedBRow {
  symbol: string;
  description: string | null;
  quantity: number | null;
  /** ISO date, or null when the form prints VARIOUS or leaves it blank. */
  acquiredDate: string | null;
  soldDate: string | null;
  proceeds: number | null;
  /** Null when the broker reports basis as unknown — never imputed. */
  costBasis: number | null;
  /** Form 8949 category (A/B short covered/noncovered, D/E long). */
  category: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  /** Wash-sale disallowance the broker printed, as printed. */
  washSaleDisallowed: number | null;
}

export interface ExtractedInvestmentForms {
  broker: string | null;
  brokerTin: string | null;
  corrected: boolean;
  taxYear: number;
  div: { ordinary: number | null; qualified: number | null } | null;
  int: { interest: number | null } | null;
  bRows: ExtractedBRow[];
}

export interface StoredInvestmentFormRow {
  fileId: string;
  brokerTin: string | null;
  corrected: boolean;
  createdAt: number;
  extracted: ExtractedInvestmentForms;
}

/** The fact ids this planner may write — document-sourced only. */
export const INVESTMENT_FORM_FACT_IDS: FactId[] = [
  'interest-income',
  'dividends-ordinary',
  'dividends-qualified',
  'sold-investments',
];

/**
 * Which stored forms count: per (broker TIN, year), a corrected form
 * retires its predecessors — the March-corrected consolidated 1099. No-TIN
 * forms stay live individually rather than guessing identity.
 */
export function liveInvestmentForms(rows: StoredInvestmentFormRow[]): StoredInvestmentFormRow[] {
  const byTin = new Map<string, StoredInvestmentFormRow[]>();
  const noTin: StoredInvestmentFormRow[] = [];
  for (const row of rows) {
    if (row.brokerTin === null || row.brokerTin.trim() === '') {
      noTin.push(row);
      continue;
    }
    const list = byTin.get(row.brokerTin.trim()) ?? [];
    list.push(row);
    byTin.set(row.brokerTin.trim(), list);
  }
  const live: StoredInvestmentFormRow[] = [...noTin];
  for (const group of byTin.values()) {
    const corrected = group.filter((r) => r.corrected).sort((a, b) => b.createdAt - a.createdAt);
    if (corrected.length > 0) live.push(corrected[0] as StoredInvestmentFormRow);
    else live.push(...group);
  }
  return live.sort((a, b) => a.createdAt - b.createdAt);
}

export interface InvestmentFactPlanInput {
  live: StoredInvestmentFormRow[];
  /** Live DOCUMENT-sourced assertions of this planner's facts. */
  prevLive: FactAssertion[];
  taxYear: number;
  triggeringFileId: string;
  nowIso: string;
}

/** Dividend and interest totals across the live forms, as printed. */
export function planInvestmentFacts(input: InvestmentFactPlanInput): FactAssertion[] {
  const { live, prevLive, taxYear, triggeringFileId, nowIso } = input;
  const out: FactAssertion[] = [];
  const prevByFact = new Map(prevLive.map((a) => [a.factId, a]));

  if (live.length === 0) return out;

  const push = (
    factId: FactId,
    value: { kind: 'number'; value: number } | { kind: 'bool'; value: boolean },
    field: string,
  ) => {
    out.push(
      makeAssertion({
        assertionId: `invform:${factId}:${triggeringFileId}:${nowIso}`,
        factId,
        taxYear,
        value,
        source: { kind: 'document', fileId: triggeringFileId, field },
        assertedAt: nowIso,
        supersedes: prevByFact.get(factId)?.assertionId ?? null,
      } as Parameters<typeof makeAssertion>[0]),
    );
  };

  const suffix = live.length > 1 ? ` (total across ${live.length} brokers)` : '';
  const sum = (pick: (f: ExtractedInvestmentForms) => number | null) => {
    let total = 0;
    let seen = false;
    for (const row of live) {
      const v = pick(row.extracted);
      if (v !== null) {
        total += v;
        seen = true;
      }
    }
    return { total, seen };
  };

  const interest = sum((f) => f.int?.interest ?? null);
  if (interest.seen)
    push('interest-income', { kind: 'number', value: interest.total }, `1099-INT box 1${suffix}`);

  const ordinary = sum((f) => f.div?.ordinary ?? null);
  if (ordinary.seen)
    push(
      'dividends-ordinary',
      { kind: 'number', value: ordinary.total },
      `1099-DIV box 1a${suffix}`,
    );

  const qualified = sum((f) => f.div?.qualified ?? null);
  if (qualified.seen)
    push(
      'dividends-qualified',
      { kind: 'number', value: qualified.total },
      `1099-DIV box 1b${suffix} — taxed at the capital-gains rates, not as ordinary income`,
    );

  if (live.some((r) => r.extracted.bRows.length > 0)) {
    push('sold-investments', { kind: 'bool', value: true }, '1099-B sale rows on file');
  }

  return out;
}

// ─── B rows become trades ──────────────────────────────────────────

export interface DerivedTrade {
  symbol: string;
  side: 'buy' | 'sell';
  tradeDate: string;
  units: number;
  price: number;
  fees: number;
  source: 'document';
  externalId: string;
}

export interface ExistingTradeSummary {
  symbol: string;
  side: string;
  tradeDate: string;
  units: number;
  price: number;
  externalId: string | null;
}

export interface TradeDerivation {
  insert: DerivedTrade[];
  /** Sales the table already had — matched, skipped, disagreement surfaced. */
  skipped: Array<{
    symbol: string;
    soldDate: string;
    units: number;
    /** |1099-B proceeds − existing trade proceeds|, when both are known. */
    proceedsDelta: number | null;
  }>;
}

const sameUnits = (a: number, b: number) => Math.abs(a - b) < 0.001;

/**
 * A 1099-B row is a completed disposition: it becomes a sell trade, and —
 * when the broker reported basis and an acquisition date — a synthetic buy
 * that reconstructs the lot. External ids are content-addressed on
 * (file, row) so replans are idempotent, and a corrected form's trades can
 * be swept by file id.
 */
export function tradesFromBRows(
  fileId: string,
  rows: ExtractedBRow[],
  existing: ExistingTradeSummary[],
): TradeDerivation {
  const insert: DerivedTrade[] = [];
  const skipped: TradeDerivation['skipped'] = [];

  rows.forEach((row, index) => {
    if (row.soldDate === null || row.quantity === null || row.proceeds === null) return;
    const symbol = row.symbol.toUpperCase();
    const units = row.quantity;

    // The SnapTrade-dedupe rule: a sale already known (any source other than
    // this same file) is not inserted twice. A proceeds disagreement is
    // surfaced for the reconciliation surface — never silently preferred.
    const match = existing.find(
      (t) =>
        t.side === 'sell' &&
        t.symbol.toUpperCase() === symbol &&
        t.tradeDate === row.soldDate &&
        sameUnits(t.units, units) &&
        !(t.externalId ?? '').startsWith(`1099b:${fileId}:`),
    );
    if (match) {
      skipped.push({
        symbol,
        soldDate: row.soldDate,
        units,
        proceedsDelta:
          row.proceeds !== null ? Math.abs(row.proceeds - match.price * match.units) : null,
      });
      return;
    }

    insert.push({
      symbol,
      side: 'sell',
      tradeDate: row.soldDate,
      units,
      price: row.proceeds / units,
      fees: 0,
      source: 'document',
      externalId: `1099b:${fileId}:${index}:sell`,
    });

    // The lot: only with a real acquisition date AND reported basis. VARIOUS
    // or unknown basis leaves the sell unmatched — the lot engine's
    // uncovered-units honesty is the design, not a gap.
    if (row.acquiredDate !== null && row.costBasis !== null) {
      insert.push({
        symbol,
        side: 'buy',
        tradeDate: row.acquiredDate,
        units,
        price: row.costBasis / units,
        fees: 0,
        source: 'document',
        externalId: `1099b:${fileId}:${index}:buy`,
      });
    }
  });

  return { insert, skipped };
}
