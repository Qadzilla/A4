// ─── 1099-B Reconciliation ─────────────────────────────────────────
// Compares what the broker's 1099-B reports against what our lot engine
// computed from the trade history. Comparison is per symbol + term; a 1099
// row with unknown term matches the symbol across both terms. Dollar
// tolerance absorbs rounding. The output never guesses — a symbol we have
// no history for is 'missing-history', not a fabricated match.

import type { RealizedSale } from './lots';

export interface Extracted1099Row {
  symbol: string;
  description: string | null;
  proceeds: number;
  costBasis: number | null;
  /** gain/loss as reported (after the broker's own wash adjustments) */
  gain: number | null;
  term: 'short' | 'long' | 'unknown';
  quantity: number | null;
}

export interface Extracted1099 {
  broker: string | null;
  taxYear: number;
  rows: Extracted1099Row[];
}

export interface ReconciliationRow {
  symbol: string;
  term: 'short' | 'long' | 'unknown';
  reported: { proceeds: number; basis: number | null; gain: number | null } | null;
  computed: { proceeds: number; basis: number; gain: number } | null;
  status: 'match' | 'mismatch' | 'missing-history' | 'not-on-1099';
  /** reported − computed, where both sides are known */
  deltas: { proceeds: number | null; basis: number | null; gain: number | null };
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  matches: number;
  mismatches: number;
  missingHistory: number;
  notOn1099: number;
}

const TOLERANCE = 1.0; // dollars — absorbs per-lot rounding on the form

interface Bucket {
  proceeds: number;
  basis: number;
  gain: number;
}

function bucketKey(symbol: string, term: string): string {
  return `${symbol.toUpperCase()}|${term}`;
}

/** Sum computed sales by symbol+term (raw gains — the 1099 reports its own wash handling). */
function bucketSales(sales: RealizedSale[]): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const s of sales) {
    if (s.units <= 0) continue;
    const key = bucketKey(s.symbol, s.term);
    const b = buckets.get(key) ?? { proceeds: 0, basis: 0, gain: 0 };
    b.proceeds += s.proceeds;
    b.basis += s.basis;
    b.gain += s.gain;
    buckets.set(key, b);
  }
  return buckets;
}

function delta(reported: number | null, computed: number | null): number | null {
  if (reported === null || computed === null) return null;
  return reported - computed;
}

function within(d: number | null): boolean {
  return d === null || Math.abs(d) <= TOLERANCE;
}

export function reconcile1099(
  extracted: Extracted1099,
  sales: RealizedSale[],
): ReconciliationResult {
  const computedBuckets = bucketSales(sales);
  const consumed = new Set<string>();
  const rows: ReconciliationRow[] = [];

  for (const row of extracted.rows) {
    const symbol = row.symbol.toUpperCase();
    // Term-specific bucket first; unknown-term rows aggregate both terms
    let computed: Bucket | null = null;
    const keys =
      row.term === 'unknown'
        ? [bucketKey(symbol, 'short'), bucketKey(symbol, 'long')]
        : [bucketKey(symbol, row.term)];
    for (const key of keys) {
      const b = computedBuckets.get(key);
      if (b) {
        computed = computed
          ? {
              proceeds: computed.proceeds + b.proceeds,
              basis: computed.basis + b.basis,
              gain: computed.gain + b.gain,
            }
          : { ...b };
        consumed.add(key);
      }
    }

    if (!computed) {
      rows.push({
        symbol,
        term: row.term,
        reported: { proceeds: row.proceeds, basis: row.costBasis, gain: row.gain },
        computed: null,
        status: 'missing-history',
        deltas: { proceeds: null, basis: null, gain: null },
      });
      continue;
    }

    const deltas = {
      proceeds: delta(row.proceeds, computed.proceeds),
      basis: delta(row.costBasis, computed.basis),
      gain: delta(row.gain, computed.gain),
    };
    const status: ReconciliationRow['status'] =
      within(deltas.proceeds) && within(deltas.basis) ? 'match' : 'mismatch';
    rows.push({
      symbol,
      term: row.term,
      reported: { proceeds: row.proceeds, basis: row.costBasis, gain: row.gain },
      computed,
      status,
      deltas,
    });
  }

  // Ledger sales the 1099 never mentioned
  for (const [key, b] of computedBuckets) {
    if (consumed.has(key)) continue;
    const [symbol, term] = key.split('|') as [string, 'short' | 'long'];
    rows.push({
      symbol,
      term,
      reported: null,
      computed: b,
      status: 'not-on-1099',
      deltas: { proceeds: null, basis: null, gain: null },
    });
  }

  let matches = 0;
  let mismatches = 0;
  let missingHistory = 0;
  let notOn1099 = 0;
  for (const r of rows) {
    if (r.status === 'match') matches += 1;
    else if (r.status === 'mismatch') mismatches += 1;
    else if (r.status === 'missing-history') missingHistory += 1;
    else notOn1099 += 1;
  }

  return { rows, matches, mismatches, missingHistory, notOn1099 };
}
