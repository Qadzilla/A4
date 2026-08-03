// ─── Capital-gains fixtures (D5) ───────────────────────────────────
// The lot engine's behaviour is the spec (the D5 fence), so the dollar
// arithmetic below reuses the exact scenarios its own tests pinned —
// replayed through the fact model, where the regression gate in the test
// file asserts the module and the raw engine agree number-for-number.
// What's new here is what D5 added: the 8949 category ladder (printed
// wins, document rows derive from what the form reported, synced trades
// wait for the form), person-provenance crypto rows, and the computed
// totals superseding estimates instead of contradicting them.

import type {
  CapitalGainsDetermination,
  CapitalGainsTrade,
  Form8949Category,
} from '../capital-gains';
import type { FilingFixture } from './types';

export interface CapitalGainsExpected {
  status: CapitalGainsDetermination['status'];
  shortTerm?: number;
  longTerm?: number;
  washDisallowed?: number;
  uncoveredUnits?: number;
  rowCount?: number;
  /** Category of the first row, or per-symbol when keyed. */
  categories?: Partial<Record<string, Form8949Category | null>>;
  cryptoTerm?: 'short' | 'long';
  supersededContain?: string;
  missingFactsContain?: string;
  notesContain?: string;
  /** Assert a row's provenance names this fileId. */
  rowFileId?: string;
}

export interface CapitalGainsFixture extends FilingFixture<CapitalGainsExpected> {
  trades: CapitalGainsTrade[];
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

let n = 0;
const t = (
  partial: Omit<CapitalGainsTrade, 'id' | 'fees' | 'source'> & {
    fees?: number;
    source?: CapitalGainsTrade['source'];
  },
): CapitalGainsTrade => {
  n += 1;
  return { id: `cg-t${n}`, fees: 0, source: 'snaptrade', ...partial };
};

export const CAPITAL_GAINS_FIXTURES: CapitalGainsFixture[] = [
  {
    id: 'cg/fifo-short-arithmetic',
    source: {
      kind: 'authority',
      citation:
        'Pub 550: FIFO is the default lot-identification method. 10@$100 + 5@$150 = $1,750 basis against $3,000 of proceeds — the lot-engine scenario, replayed through the fact model.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 100 }),
      t({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-03-10', units: 10, price: 150 }),
      t({ symbol: 'NVDA', side: 'sell', tradeDate: '2025-06-10', units: 15, price: 200 }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 1250,
      longTerm: 0,
      rowCount: 1,
      categories: { NVDA: null },
      notesContain: '1099-B',
    },
    note: 'Identical dollars to the lot test — and the synced trade gets NO category box: guessing what the broker reports to the IRS is how CP2000 letters start, so the box waits for the form.',
  },
  {
    id: 'cg/long-term-boundary-pair',
    source: {
      kind: 'authority',
      citation:
        'Pub 550 / Sch D instructions: long-term means held MORE than one year. Exactly 365 days is short; 366 is long — the boundary the lot engine already pins.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({ symbol: 'VOO', side: 'buy', tradeDate: '2024-06-11', units: 10, price: 400 }),
      t({ symbol: 'VOO', side: 'sell', tradeDate: '2025-06-11', units: 10, price: 500 }),
      t({ symbol: 'SPY', side: 'buy', tradeDate: '2024-01-10', units: 10, price: 400 }),
      t({ symbol: 'SPY', side: 'sell', tradeDate: '2025-06-11', units: 10, price: 500 }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 1000,
      longTerm: 1000,
      rowCount: 2,
    },
    note: 'Two identical $1,000 gains, one day of holding apart on the calendar that matters — the same dollars land in different boxes and different brackets.',
  },
  {
    id: 'cg/wash-sale-carried-forward',
    source: {
      kind: 'authority',
      citation:
        'Pub 550 wash-sale rule: a loss with replacement shares bought within 30 days is disallowed; the disallowed loss joins the replacement basis. The lot-engine TSLA scenario, verbatim.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 300 }),
      t({ symbol: 'TSLA', side: 'sell', tradeDate: '2025-05-01', units: 10, price: 200 }),
      t({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-05-15', units: 10, price: 210 }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 0,
      washDisallowed: 1000,
      notesContain: "replacement lot's basis",
    },
    note: 'The −$1,000 that is not a deduction this year: fully replaced, fully disallowed, living in the new lot at $310/unit until it sells clean.',
  },
  {
    id: 'cg/uncovered-units-honesty',
    source: {
      kind: 'adversarial',
      rationale:
        'Sold units with no purchase history must be reported as uncovered — never a guessed basis. The determination carries the count and says where the missing lots usually are.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({ symbol: 'DOGE', side: 'buy', tradeDate: '2025-03-01', units: 100, price: 0.3 }),
      t({ symbol: 'DOGE', side: 'sell', tradeDate: '2025-06-01', units: 300, price: 0.4 }),
    ],
    expected: {
      status: 'computed',
      uncoveredUnits: 200,
      notesContain: 'NOT guessed',
    },
    note: '100 matched units make $10 of real gain; the other 200 make a named absence. Transferred-in shares are the usual cause, and the original account has the lots.',
  },
  {
    id: 'cg/year-filter-matches-across-history',
    source: {
      kind: 'authority',
      citation:
        'Sch D reports the year’s sales; lot matching runs over the whole history — a 2025 sale consumes a 2024 lot. The lot-engine year-filter scenario.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({ symbol: 'NVDA', side: 'buy', tradeDate: '2024-01-10', units: 20, price: 50 }),
      t({ symbol: 'NVDA', side: 'sell', tradeDate: '2024-11-01', units: 10, price: 140 }),
      t({ symbol: 'NVDA', side: 'sell', tradeDate: '2025-02-01', units: 10, price: 120 }),
    ],
    expected: {
      status: 'computed',
      longTerm: 700,
      shortTerm: 0,
      rowCount: 1,
    },
    note: 'Only the February 2025 sale reports this year ($1,200 − $500 = $700, long)  — but it found its basis in a 2024 lot the 2024 sale had only half-consumed. History is one ledger; the year is a filter.',
  },
  {
    id: 'cg/category-printed-wins',
    source: {
      kind: 'authority',
      citation:
        "8949 instructions: the box comes from the broker's own reporting. A printed category is kept as printed even where a derivation would disagree — matching the IRS's copy is the point.",
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({
        symbol: 'AAPL',
        side: 'buy',
        tradeDate: '2025-01-10',
        units: 10,
        price: 100,
        source: 'document',
        fileId: 'file-consolidated-1',
        category: 'B',
      }),
      t({
        symbol: 'AAPL',
        side: 'sell',
        tradeDate: '2025-03-10',
        units: 10,
        price: 120,
        source: 'document',
        fileId: 'file-consolidated-1',
        category: 'B',
      }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 200,
      categories: { AAPL: 'B' },
      rowFileId: 'file-consolidated-1',
    },
    note: 'Basis is on file, so a derivation would say A — but the broker printed B (basis not reported to the IRS), and the broker’s box is what the IRS will match against.',
  },
  {
    id: 'cg/category-derived-covered-pair',
    source: {
      kind: 'authority',
      citation:
        '8949 boxes: A = short-term with basis reported, D = long-term with basis reported. A document row with basis and dates but no printed box derives the covered box from what the form reported.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({
        symbol: 'MSFT',
        side: 'buy',
        tradeDate: '2025-01-10',
        units: 5,
        price: 200,
        source: 'document',
        fileId: 'file-b-2',
      }),
      t({
        symbol: 'MSFT',
        side: 'sell',
        tradeDate: '2025-04-10',
        units: 5,
        price: 240,
        source: 'document',
        fileId: 'file-b-2',
      }),
      t({
        symbol: 'VTI',
        side: 'buy',
        tradeDate: '2023-06-01',
        units: 5,
        price: 200,
        source: 'document',
        fileId: 'file-b-2',
      }),
      t({
        symbol: 'VTI',
        side: 'sell',
        tradeDate: '2025-04-10',
        units: 5,
        price: 260,
        source: 'document',
        fileId: 'file-b-2',
      }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 200,
      longTerm: 300,
      categories: { MSFT: 'A', VTI: 'D' },
    },
  },
  {
    id: 'cg/category-noncovered-derived',
    source: {
      kind: 'authority',
      citation:
        '8949 boxes B/E: the 1099-B row exists but basis was not reported. A document sell with no reconstructable lot derives the noncovered box, shows its printed proceeds, and claims no gain.',
    },
    taxYear: 2025,
    facts: [],
    trades: [
      t({
        symbol: 'GME',
        side: 'sell',
        tradeDate: '2025-05-01',
        units: 10,
        price: 25,
        source: 'document',
        fileId: 'file-b-3',
      }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 0,
      uncoveredUnits: 10,
      categories: { GME: 'B' },
      notesContain: 'NOT guessed',
    },
    note: 'The VARIOUS/unknown-basis row: proceeds $250 shown as printed, basis null, gain honestly zero until the lots surface. C3 stored the row; D5 refuses to invent its history.',
  },
  {
    id: 'cg/crypto-long-person-row',
    source: {
      kind: 'authority',
      citation:
        '8949 instructions: boxes C (short) and F (long) are for transactions NOT reported on a 1099-B — exchange-less crypto disposals land there by construction.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'crypto-proceeds', value: num(1200) },
      { factId: 'crypto-cost-basis', value: num(800) },
      { factId: 'crypto-held-over-year', value: bool(true) },
    ],
    trades: [],
    expected: {
      status: 'computed',
      longTerm: 400,
      shortTerm: 0,
      rowCount: 1,
      categories: { 'DIGITAL ASSETS': 'F' },
      cryptoTerm: 'long',
    },
    note: 'The no-form path end to end: person-asserted disposal, category F (long, not on any 1099-B — because no form exists), person provenance on the row. $400 of long gain that fits inside the 0% window.',
  },
  {
    id: 'cg/crypto-unknown-term-defaults-short',
    source: {
      kind: 'adversarial',
      rationale:
        'An unknown holding period must not silently pick the friendly rate. Short-term is the higher-tax reading (the gross-over-taxable precedent), the default is named in a note, and the fact surfaces as fork-able — one question, priced.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'crypto-proceeds', value: num(1200) },
      { factId: 'crypto-cost-basis', value: num(800) },
    ],
    trades: [],
    expected: {
      status: 'computed',
      shortTerm: 400,
      longTerm: 0,
      cryptoTerm: 'short',
      categories: { 'DIGITAL ASSETS': 'C' },
      missingFactsContain: 'crypto-held-over-year',
      notesContain: 'SHORT-term',
    },
  },
  {
    id: 'cg/crypto-missing-basis-is-priced',
    source: {
      kind: 'adversarial',
      rationale:
        'No basis imputation (the C3 fence): missing basis means the whole proceeds counts as gain, the note says exactly that, and the missing fact carries the price of finding the exchange history.',
    },
    taxYear: 2026,
    facts: [{ factId: 'crypto-proceeds', value: num(1200) }],
    trades: [],
    expected: {
      status: 'computed',
      shortTerm: 1200,
      missingFactsContain: 'crypto-cost-basis',
      notesContain: 'until the basis is found',
    },
  },
  {
    id: 'cg/estimate-superseded-not-contradicted',
    source: {
      kind: 'adversarial',
      rationale:
        "Doctrine 8's mechanism: a person's '$2,000 or so of gains' plus a computed ledger must resolve by supersession — the rule fact retires the estimate with the chain visible. A contradiction here would block the year over the engine disagreeing with a guess.",
    },
    taxYear: 2025,
    facts: [{ factId: 'realized-short-gains', value: num(2000) }],
    trades: [
      t({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 100 }),
      t({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-03-10', units: 10, price: 150 }),
      t({ symbol: 'NVDA', side: 'sell', tradeDate: '2025-06-10', units: 15, price: 200 }),
    ],
    expected: {
      status: 'computed',
      shortTerm: 1250,
      supersededContain: 'realized-short-gains',
      notesContain: 'supersedes the estimate',
    },
  },
  {
    id: 'cg/no-trades-no-crypto-none',
    source: {
      kind: 'adversarial',
      rationale:
        'A W-2-only year must produce none — no zero-dollar 8949 noise, no phantom rule facts overwriting nothing. Person-asserted gains without a ledger stand exactly as asserted.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-wages', value: num(42000) }],
    trades: [],
    expected: { status: 'none' },
  },
];
