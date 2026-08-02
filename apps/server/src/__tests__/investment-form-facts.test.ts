import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { factSet, factState, makeAssertion } from '../lib/calc/filing/facts';
import {
  type ExtractedBRow,
  type StoredInvestmentFormRow,
  liveInvestmentForms,
  planInvestmentFacts,
  tradesFromBRows,
} from '../services/investment-form-facts';

// ─── C3 acceptance ─────────────────────────────────────────────────
// One document, three families; the corrected consolidated re-runs what
// depended on it; B rows become trades the lot engine already knows how to
// read; a sale SnapTrade already synced is never duplicated; and the
// qualified-dividend split reaches the estimator's capital-gains bucket
// distinctly.

const NOW = '2026-08-02T12:00:00.000Z';

let n = 0;
function form(
  overrides: Partial<StoredInvestmentFormRow> & {
    div?: { ordinary: number | null; qualified: number | null } | null;
    int?: { interest: number | null } | null;
    bRows?: ExtractedBRow[];
  },
): StoredInvestmentFormRow {
  n += 1;
  return {
    fileId: overrides.fileId ?? `file-${n}`,
    brokerTin: overrides.brokerTin !== undefined ? overrides.brokerTin : `99-00000${n}`,
    corrected: overrides.corrected ?? false,
    createdAt: overrides.createdAt ?? n,
    extracted: {
      broker: `Broker ${n}`,
      brokerTin: overrides.brokerTin !== undefined ? overrides.brokerTin : `99-00000${n}`,
      corrected: overrides.corrected ?? false,
      taxYear: 2026,
      div: overrides.div ?? null,
      int: overrides.int ?? null,
      bRows: overrides.bRows ?? [],
    },
  };
}

const bRow = (over: Partial<ExtractedBRow>): ExtractedBRow => ({
  symbol: 'NVDA',
  description: null,
  quantity: 8,
  acquiredDate: '2025-01-15',
  soldDate: '2026-06-20',
  proceeds: 1620,
  costBasis: 1182,
  category: 'D',
  washSaleDisallowed: null,
  ...over,
});

function plan(live: StoredInvestmentFormRow[]) {
  return planInvestmentFacts({
    live,
    prevLive: [],
    taxYear: 2026,
    triggeringFileId: live[live.length - 1]?.fileId ?? 'file-x',
    nowIso: NOW,
  });
}

describe('one document, three families', () => {
  it('asserts DIV, INT and the sold flag from a single consolidated form', () => {
    const out = plan([
      form({
        div: { ordinary: 480, qualified: 410 },
        int: { interest: 62 },
        bRows: [bRow({})],
      }),
    ]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('dividends-ordinary')?.value).toEqual({ kind: 'number', value: 480 });
    expect(byId.get('dividends-qualified')?.value).toEqual({ kind: 'number', value: 410 });
    expect(byId.get('interest-income')?.value).toEqual({ kind: 'number', value: 62 });
    expect(byId.get('sold-investments')?.value).toEqual({ kind: 'bool', value: true });
  });

  it('reports qualified above ordinary as printed — the broker owns the error', () => {
    const out = plan([form({ div: { ordinary: 100, qualified: 150 } })]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('dividends-qualified')?.value).toEqual({ kind: 'number', value: 150 });
    expect(byId.get('dividends-ordinary')?.value).toEqual({ kind: 'number', value: 100 });
  });

  it('sums across brokers and says so in the provenance', () => {
    const out = plan([form({ int: { interest: 40 } }), form({ int: { interest: 25 } })]);
    const interest = out.find((a) => a.factId === 'interest-income');
    expect(interest?.value).toEqual({ kind: 'number', value: 65 });
    if (interest?.source.kind === 'document') {
      expect(interest.source.field).toContain('across 2 brokers');
    }
  });

  it('a corrected consolidated retires its predecessor by broker TIN', () => {
    const original = form({
      fileId: 'feb',
      brokerTin: '11-1111111',
      div: { ordinary: 480, qualified: 410 },
    });
    const corrected = form({
      fileId: 'march',
      brokerTin: '11-1111111',
      corrected: true,
      createdAt: 99,
      div: { ordinary: 495, qualified: 425 },
    });
    const live = liveInvestmentForms([original, corrected]);
    expect(live.map((f) => f.fileId)).toEqual(['march']);
    const out = plan(live);
    expect(out.find((a) => a.factId === 'dividends-ordinary')?.value).toEqual({
      kind: 'number',
      value: 495,
    });
  });
});

describe('B rows become trades', () => {
  it('reconstructs the lot: one sell, one synthetic buy, content-addressed ids', () => {
    const { insert, skipped } = tradesFromBRows('file-a', [bRow({})], []);
    expect(skipped).toEqual([]);
    expect(insert).toHaveLength(2);
    const sell = insert.find((t) => t.side === 'sell');
    const buy = insert.find((t) => t.side === 'buy');
    expect(sell?.externalId).toBe('1099b:file-a:0:sell');
    expect(sell?.price).toBeCloseTo(1620 / 8);
    expect(buy?.tradeDate).toBe('2025-01-15');
    expect(buy?.price).toBeCloseTo(1182 / 8);
  });

  it('VARIOUS acquisition or unknown basis yields the sell alone — never an imputed lot', () => {
    const noDate = tradesFromBRows('f', [bRow({ acquiredDate: null })], []);
    const noBasis = tradesFromBRows('f', [bRow({ costBasis: null, category: 'E' })], []);
    expect(noDate.insert.map((t) => t.side)).toEqual(['sell']);
    expect(noBasis.insert.map((t) => t.side)).toEqual(['sell']);
  });

  it('cruel case: a sale SnapTrade already synced is one trade, not two — delta surfaced', () => {
    const existing = [
      {
        symbol: 'NVDA',
        side: 'sell',
        tradeDate: '2026-06-20',
        units: 8,
        price: 200, // 1600 total — the broker says 1620
        externalId: 'snaptrade-123',
      },
    ];
    const { insert, skipped } = tradesFromBRows('file-a', [bRow({})], existing);
    expect(insert).toEqual([]); // neither sell nor synthetic buy
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.proceedsDelta).toBeCloseTo(20);
  });

  it('its own prior trades do not block a replan of the same file', () => {
    const existing = [
      {
        symbol: 'NVDA',
        side: 'sell',
        tradeDate: '2026-06-20',
        units: 8,
        price: 202.5,
        externalId: '1099b:file-a:0:sell',
      },
    ];
    const { insert, skipped } = tradesFromBRows('file-a', [bRow({})], existing);
    // Re-derived with the same content-addressed id: the db upsert is a
    // no-op, and nothing reads as a foreign duplicate.
    expect(skipped).toEqual([]);
    expect(insert.some((t) => t.externalId === '1099b:file-a:0:sell')).toBe(true);
  });

  it('a row without a sold date or quantity derives nothing', () => {
    expect(tradesFromBRows('f', [bRow({ soldDate: null })], []).insert).toEqual([]);
    expect(tradesFromBRows('f', [bRow({ quantity: null })], []).insert).toEqual([]);
  });
});

describe('the qualified split reaches the estimator', () => {
  let m = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `q${++m}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(m).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  it('qualified dividends land in the 0% capital-gains bracket at low income', () => {
    const base = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '1999-06-01' }),
      make('gross-income', { kind: 'number', value: 30000 }),
      make('w2-wages', { kind: 'number', value: 28000 }),
      make('full-time-student-months', { kind: 'number', value: 0 }),
    ];
    const qualified = evaluateYear(
      [
        ...base,
        make('dividends-ordinary', { kind: 'number', value: 2000 }),
        make('dividends-qualified', { kind: 'number', value: 2000 }),
      ],
      2026,
    );
    const ordinary = evaluateYear(
      [
        ...base,
        make('dividends-ordinary', { kind: 'number', value: 2000 }),
        make('dividends-qualified', { kind: 'number', value: 0 }),
      ],
      2026,
    );
    if (qualified.liability === null || ordinary.liability === null) {
      throw new Error('expected liabilities');
    }
    // Same $2,000 of dividends: qualified rides the 0% bracket, ordinary
    // is taxed at 12% — the split is the finding, about $240 of it.
    expect(qualified.liability.agi).toBe(ordinary.liability.agi);
    expect(ordinary.liability.incomeTax - qualified.liability.incomeTax).toBeGreaterThan(200);
  });

  it('interest is ordinary income, never capital gains', () => {
    const withInterest = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '1999-06-01' }),
        make('gross-income', { kind: 'number', value: 42000 }),
        make('w2-wages', { kind: 'number', value: 42000 }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('interest-income', { kind: 'number', value: 1000 }),
      ],
      2026,
    );
    if (withInterest.liability === null) throw new Error('expected liability');
    expect(withInterest.liability.agi).toBe(43000);
    // 12% bracket: the $1,000 of interest costs $120, not $0.
    expect(withInterest.liability.incomeTax).toBeGreaterThan(2863 + 100);
  });
});

describe('facts compose with the person', () => {
  it('a document sold-investments corroborates rather than contradicts the person saying so', () => {
    const person = makeAssertion({
      assertionId: 'p-sold',
      factId: 'sold-investments',
      taxYear: 2026,
      value: { kind: 'bool', value: true },
      source: { kind: 'person', conversationId: null },
      assertedAt: '2026-07-01T00:00:00Z',
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);
    const docFacts = plan([form({ bRows: [bRow({})] })]);
    const state = factState(factSet([person, ...docFacts], 2026), 'sold-investments');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.assertions.length).toBe(2);
  });
});
