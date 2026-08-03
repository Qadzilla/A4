import { describe, expect, it } from 'vitest';
import { determineCapitalGains } from '../lib/calc/filing/capital-gains';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { CAPITAL_GAINS_FIXTURES } from '../lib/calc/filing/fixtures/capital-gains';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { computeRealizedGains } from '../lib/calc/lots';

// ─── D5 acceptance ─────────────────────────────────────────────────
// The fence enforced as a test: the lot engine's output IS the spec, so
// the regression gate replays every fixture's trades through both the raw
// engine and the determination and requires identical dollars. On top of
// that, what only the wiring can prove: computed gains driving the kiddie
// guard, an estimate resolving by supersession instead of contradiction,
// and the crypto no-form path reaching the liability.

describe('the capital-gains corpus', () => {
  for (const fixture of CAPITAL_GAINS_FIXTURES) {
    it(fixture.id, () => {
      const result = determineCapitalGains(assertionsOf(fixture), fixture.trades, fixture.taxYear);

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.shortTerm !== undefined) {
        expect(result.shortTerm, 'short').toBeCloseTo(fixture.expected.shortTerm, 5);
      }
      if (fixture.expected.longTerm !== undefined) {
        expect(result.longTerm, 'long').toBeCloseTo(fixture.expected.longTerm, 5);
      }
      if (fixture.expected.washDisallowed !== undefined) {
        expect(result.washDisallowed, 'wash').toBeCloseTo(fixture.expected.washDisallowed, 5);
      }
      if (fixture.expected.uncoveredUnits !== undefined) {
        expect(result.uncoveredUnits, 'uncovered').toBe(fixture.expected.uncoveredUnits);
      }
      if (fixture.expected.rowCount !== undefined) {
        expect(result.rows, 'rows').toHaveLength(fixture.expected.rowCount);
      }
      for (const [symbol, category] of Object.entries(fixture.expected.categories ?? {})) {
        const row = result.rows.find((r) => r.symbol === symbol);
        expect(row, `row for ${symbol}`).toBeDefined();
        expect(row?.category, `category of ${symbol}`).toBe(category);
      }
      if (fixture.expected.cryptoTerm !== undefined) {
        expect(result.crypto?.term, 'crypto term').toBe(fixture.expected.cryptoTerm);
      }
      if (fixture.expected.supersededContain !== undefined) {
        expect(result.supersededEstimates, 'superseded').toContain(
          fixture.expected.supersededContain,
        );
      }
      if (fixture.expected.missingFactsContain !== undefined) {
        expect(result.missingFacts, 'missing').toContain(fixture.expected.missingFactsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes)).toContain(fixture.expected.notesContain);
      }
      if (fixture.expected.rowFileId !== undefined) {
        const named = result.rows.some(
          (r) =>
            r.provenance.kind === 'trade' && r.provenance.fileId === fixture.expected.rowFileId,
        );
        expect(named, 'provenance names the file').toBe(true);
      }
    });
  }

  it('regression gate: the determination and the raw lot engine agree to the cent', () => {
    for (const fixture of CAPITAL_GAINS_FIXTURES) {
      if (fixture.trades.length === 0) continue;
      const raw = computeRealizedGains(fixture.trades, fixture.taxYear);
      const result = determineCapitalGains(assertionsOf(fixture), fixture.trades, fixture.taxYear);
      const cryptoShort = result.crypto?.term === 'short' ? result.crypto.gain : 0;
      const cryptoLong = result.crypto?.term === 'long' ? result.crypto.gain : 0;
      expect(result.shortTerm - cryptoShort, `${fixture.id} short`).toBeCloseTo(
        raw.shortTermGain,
        9,
      );
      expect(result.longTerm - cryptoLong, `${fixture.id} long`).toBeCloseTo(raw.longTermGain, 9);
      expect(result.washDisallowed, `${fixture.id} wash`).toBeCloseTo(raw.washDisallowed, 9);
      expect(result.uncoveredUnits, `${fixture.id} uncovered`).toBe(raw.uncoveredUnits);
    }
  });
});

describe('the wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
    taxYear = 2026,
  ) =>
    makeAssertion({
      assertionId: `cgw${++n}`,
      factId,
      taxYear,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  it('an estimate resolves by supersession — the ledger computes, nothing contradicts', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2000-05-05' }),
      make('full-time-student-months', { kind: 'number', value: 0 }),
      make('gross-income', { kind: 'number', value: 46000 }),
      make('w2-wages', { kind: 'number', value: 45000 }),
      make('realized-short-gains', { kind: 'number', value: 2000 }),
    ];
    const trades = [
      {
        id: 'w1',
        symbol: 'NVDA',
        side: 'buy' as const,
        tradeDate: '2026-01-05',
        units: 10,
        price: 100,
        fees: 0,
        source: 'snaptrade' as const,
      },
      {
        id: 'w2',
        symbol: 'NVDA',
        side: 'sell' as const,
        tradeDate: '2026-06-05',
        units: 10,
        price: 225,
        fees: 0,
        source: 'snaptrade' as const,
      },
    ];
    const withLedger = evaluateYear(facts, 2026, { trades });
    if (withLedger.liability === null) throw new Error('expected liability');
    // The computed $1,250 replaces the $2,000 estimate: same liability as if
    // the person had said 1,250 all along, and no contradiction blocker.
    const saidExactly = evaluateYear(
      facts.map((a) =>
        a.factId === 'realized-short-gains'
          ? { ...a, value: { kind: 'number' as const, value: 1250 } }
          : a,
      ),
      2026,
    );
    if (saidExactly.liability === null) throw new Error('expected liability');
    expect(withLedger.liability.totalTax).toBeCloseTo(saidExactly.liability.totalTax, 6);
    expect(withLedger.capitalGains?.supersededEstimates).toContain('realized-short-gains');
    expect(JSON.stringify(withLedger.notes)).toContain('supersedes the estimate');
  });

  it('computed gains drive the kiddie guard — the ledger triggers the 8615, not a guess', () => {
    const dependent = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2006-03-10' }),
      make('full-time-student-months', { kind: 'number', value: 9 }),
      make('lived-with-parents-months', { kind: 'number', value: 12 }),
      make('self-support-share-pct', { kind: 'number', value: 20 }),
      make('gross-income', { kind: 'number', value: 4000 }),
    ];
    const trades = [
      {
        id: 'k1',
        symbol: 'TSLA',
        side: 'buy' as const,
        tradeDate: '2026-01-05',
        units: 10,
        price: 100,
        fees: 0,
        source: 'snaptrade' as const,
      },
      {
        id: 'k2',
        symbol: 'TSLA',
        side: 'sell' as const,
        tradeDate: '2026-07-05',
        units: 10,
        price: 410,
        fees: 0,
        source: 'snaptrade' as const,
      },
    ];
    // $3,100 of computed short gains — above the $2,700 threshold.
    const result = evaluateYear(dependent, 2026, { trades });
    expect(result.blocked).toContain('form-8615');
    // Without the ledger no gains exist anywhere, and no 8615 triggers.
    const without = evaluateYear(dependent, 2026);
    expect(without.blocked).not.toContain('form-8615');
  });

  it('the crypto no-form path reaches the liability without any ledger', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2000-05-05' }),
      make('full-time-student-months', { kind: 'number', value: 0 }),
      make('gross-income', { kind: 'number', value: 46200 }),
      make('w2-wages', { kind: 'number', value: 45000 }),
      make('crypto-proceeds', { kind: 'number', value: 1200 }),
      make('crypto-cost-basis', { kind: 'number', value: 800 }),
    ];
    const result = evaluateYear(facts, 2026);
    if (result.liability === null) throw new Error('expected liability');
    const without = evaluateYear(
      facts.filter((a) => a.factId !== 'crypto-proceeds' && a.factId !== 'crypto-cost-basis'),
      2026,
    );
    if (without.liability === null) throw new Error('expected liability');
    // $400 of gain, defaulted short (term unknown) — taxed as ordinary income.
    expect(result.liability.taxableIncome).toBeCloseTo(without.liability.taxableIncome + 400, 6);
    expect(result.capitalGains?.crypto?.term).toBe('short');
    expect(result.capitalGains?.missingFacts).toContain('crypto-held-over-year');
  });

  it('a person estimate with no ledger stands exactly as asserted', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2000-05-05' }),
      make('full-time-student-months', { kind: 'number', value: 0 }),
      make('gross-income', { kind: 'number', value: 47000 }),
      make('w2-wages', { kind: 'number', value: 45000 }),
      make('realized-short-gains', { kind: 'number', value: 2000 }),
    ];
    const result = evaluateYear(facts, 2026);
    expect(result.capitalGains).toBeNull();
    if (result.liability === null) throw new Error('expected liability');
    const without = evaluateYear(
      facts.filter((a) => a.factId !== 'realized-short-gains'),
      2026,
    );
    if (without.liability === null) throw new Error('expected liability');
    expect(result.liability.taxableIncome).toBeCloseTo(without.liability.taxableIncome + 2000, 6);
  });
});
