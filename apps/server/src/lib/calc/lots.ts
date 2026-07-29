// ─── Realized-Gains Lot Engine ─────────────────────────────────────
// FIFO lot matching over a chronological trade history:
//   • each sell consumes the oldest open lots of that symbol
//   • holding period > 365 days ⇒ long-term, else short-term
//   • wash sale: a loss sale with replacement buys within ±30 days has the
//     loss disallowed proportionally; the disallowed loss is added to the
//     replacement lot's basis (still-simplified: holding-period tacking and
//     cross-account replacements aren't modeled — this is an estimator).
// Sell units with no matching lot (transferred-in shares, missing history)
// are reported as uncovered rather than guessed — null over fabrication.

export interface LotTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  /** YYYY-MM-DD */
  tradeDate: string;
  units: number;
  /** per-unit price */
  price: number;
  fees: number;
}

export interface RealizedSale {
  tradeId: string;
  symbol: string;
  saleDate: string;
  /** units with known basis (matched to lots) */
  units: number;
  proceeds: number;
  basis: number;
  /** proceeds − basis, after nothing — wash adjustment reported separately */
  gain: number;
  term: 'short' | 'long';
  /** earliest acquisition date among consumed lots */
  acquiredAt: string | null;
  /** portion of a loss disallowed by the wash-sale rule (positive number) */
  washDisallowed: number;
  /** sell units that had no matching lot — excluded from gain entirely */
  uncoveredUnits: number;
}

export interface OpenLot {
  symbol: string;
  acquiredAt: string;
  units: number;
  /** per-unit basis, including any wash-sale adjustments */
  costPerUnit: number;
}

export interface RealizedSummary {
  sales: RealizedSale[];
  /** totals over `sales` (wash-disallowed losses added back) */
  shortTermGain: number;
  longTermGain: number;
  washDisallowed: number;
  openLots: OpenLot[];
  /** total sell units across all sales that had no basis history */
  uncoveredUnits: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;
const WASH_WINDOW_DAYS = 30;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

interface InternalLot {
  acquiredAt: string;
  units: number;
  costPerUnit: number;
  /** replacement-buy bookkeeping for wash sales */
  tradeId: string;
}

/**
 * Compute realized gains across the full trade history. `taxYear` filters the
 * REPORTED sales/totals; matching always runs over everything.
 */
export function computeRealizedGains(trades: LotTrade[], taxYear?: number): RealizedSummary {
  // Chronological; buys before sells on the same day so day trades can match
  const sorted = [...trades].sort((a, b) =>
    a.tradeDate === b.tradeDate
      ? a.side === b.side
        ? 0
        : a.side === 'buy'
          ? -1
          : 1
      : a.tradeDate < b.tradeDate
        ? -1
        : 1,
  );

  const lots = new Map<string, InternalLot[]>();
  const allSales: RealizedSale[] = [];

  for (const t of sorted) {
    if (t.units <= 0) continue;
    const symbol = t.symbol.toUpperCase();

    if (t.side === 'buy') {
      const queue = lots.get(symbol) ?? [];
      queue.push({
        acquiredAt: t.tradeDate,
        units: t.units,
        // fees capitalize into basis
        costPerUnit: t.price + (t.units > 0 ? t.fees / t.units : 0),
        tradeId: t.id,
      });
      lots.set(symbol, queue);
      continue;
    }

    // Sell: consume FIFO lots
    const queue = lots.get(symbol) ?? [];
    let remaining = t.units;
    let basis = 0;
    let matchedUnits = 0;
    let earliestAcquired: string | null = null;
    let longUnits = 0;
    while (remaining > 1e-9 && queue.length > 0) {
      const lot = queue[0] as InternalLot;
      const take = Math.min(lot.units, remaining);
      basis += take * lot.costPerUnit;
      matchedUnits += take;
      if (earliestAcquired === null || lot.acquiredAt < earliestAcquired) {
        earliestAcquired = lot.acquiredAt;
      }
      if (daysBetween(lot.acquiredAt, t.tradeDate) > LONG_TERM_DAYS) longUnits += take;
      lot.units -= take;
      remaining -= take;
      if (lot.units <= 1e-9) queue.shift();
    }
    const uncoveredUnits = remaining > 1e-9 ? remaining : 0;
    if (matchedUnits <= 1e-9) {
      // Nothing matched — report the sale as fully uncovered, no gain claimed
      allSales.push({
        tradeId: t.id,
        symbol,
        saleDate: t.tradeDate,
        units: 0,
        proceeds: 0,
        basis: 0,
        gain: 0,
        term: 'short',
        acquiredAt: null,
        washDisallowed: 0,
        uncoveredUnits,
      });
      continue;
    }

    // Proceeds only over the matched units; fees reduce proceeds pro-rata
    const proceeds = matchedUnits * t.price - fees(t, matchedUnits);
    const gain = proceeds - basis;
    // Majority-of-units rule for the term label (per-lot precision reported via totals)
    const term: RealizedSale['term'] = longUnits >= matchedUnits / 2 ? 'long' : 'short';
    allSales.push({
      tradeId: t.id,
      symbol,
      saleDate: t.tradeDate,
      units: matchedUnits,
      proceeds,
      basis,
      gain,
      term,
      acquiredAt: earliestAcquired,
      washDisallowed: 0,
      uncoveredUnits,
    });
  }

  // Wash-sale pass: for each loss sale, replacement buys within ±30 days
  // disallow the loss proportionally. The disallowed loss is added to the
  // basis of still-open replacement lots (planning-grade approximation).
  const buysBySymbol = new Map<string, LotTrade[]>();
  for (const t of sorted) {
    if (t.side !== 'buy') continue;
    const symbol = t.symbol.toUpperCase();
    const arr = buysBySymbol.get(symbol) ?? [];
    arr.push(t);
    buysBySymbol.set(symbol, arr);
  }
  for (const sale of allSales) {
    if (sale.gain >= 0 || sale.units <= 0) continue;
    const replacements = (buysBySymbol.get(sale.symbol) ?? []).filter((b) => {
      const d = daysBetween(sale.saleDate, b.tradeDate);
      if (Math.abs(d) > WASH_WINDOW_DAYS) return false;
      // A buy fully consumed BEFORE this sale is the sold position itself,
      // not a replacement — approximate by excluding buys older than the
      // earliest consumed lot's acquisition date.
      return sale.acquiredAt === null || b.tradeDate > sale.acquiredAt || d >= 0;
    });
    const replacementUnits = replacements.reduce((s, b) => s + b.units, 0);
    if (replacementUnits <= 0) continue;
    const washFraction = Math.min(1, replacementUnits / sale.units);
    const disallowed = Math.abs(sale.gain) * washFraction;
    sale.washDisallowed = disallowed;
    // Push the disallowed loss into still-open replacement lots' basis
    const replacementIds = new Set(replacements.map((b) => b.id));
    const openReplacements = (lots.get(sale.symbol) ?? []).filter((l) =>
      replacementIds.has(l.tradeId),
    );
    const openUnits = openReplacements.reduce((s, l) => s + l.units, 0);
    if (openUnits > 0) {
      for (const lot of openReplacements) {
        lot.costPerUnit += disallowed / openUnits;
      }
    }
  }

  const reported =
    taxYear === undefined
      ? allSales
      : allSales.filter((s) => s.saleDate.startsWith(String(taxYear)));

  let shortTermGain = 0;
  let longTermGain = 0;
  let washDisallowed = 0;
  let uncoveredTotal = 0;
  for (const s of reported) {
    const effective = s.gain + s.washDisallowed; // disallowed loss added back
    if (s.term === 'long') longTermGain += effective;
    else shortTermGain += effective;
    washDisallowed += s.washDisallowed;
    uncoveredTotal += s.uncoveredUnits;
  }

  const openLots: OpenLot[] = [];
  for (const [symbol, queue] of lots) {
    for (const lot of queue) {
      if (lot.units > 1e-9) {
        openLots.push({
          symbol,
          acquiredAt: lot.acquiredAt,
          units: lot.units,
          costPerUnit: lot.costPerUnit,
        });
      }
    }
  }

  return {
    sales: reported,
    shortTermGain,
    longTermGain,
    washDisallowed,
    openLots,
    uncoveredUnits: uncoveredTotal,
  };
}

function fees(t: LotTrade, matchedUnits: number): number {
  return t.units > 0 ? (t.fees * matchedUnits) / t.units : 0;
}
