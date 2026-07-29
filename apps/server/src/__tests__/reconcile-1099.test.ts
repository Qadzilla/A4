import { describe, expect, it } from 'vitest';
import type { RealizedSale } from '../lib/calc/lots';
import { reconcile1099 } from '../lib/calc/reconcile';
import type { Extracted1099 } from '../lib/calc/reconcile';

function sale(
  partial: Partial<RealizedSale> & Pick<RealizedSale, 'symbol' | 'gain'>,
): RealizedSale {
  return {
    tradeId: 't1',
    saleDate: '2026-03-10',
    units: 10,
    proceeds: 1000,
    basis: 1000 - partial.gain,
    term: 'short',
    acquiredAt: '2025-01-01',
    washDisallowed: 0,
    uncoveredUnits: 0,
    ...partial,
  };
}

function form(rows: Extracted1099['rows']): Extracted1099 {
  return { broker: 'Robinhood', taxYear: 2026, rows };
}

describe('reconcile1099', () => {
  it('matches when reported and computed agree within tolerance', () => {
    const r = reconcile1099(
      form([
        {
          symbol: 'NVDA',
          description: null,
          proceeds: 740.5,
          costBasis: 386.04,
          gain: 354.46,
          term: 'long',
          quantity: 4,
        },
      ]),
      [sale({ symbol: 'NVDA', term: 'long', proceeds: 740, basis: 386.04, gain: 353.96 })],
    );
    expect(r.rows[0]?.status).toBe('match'); // $0.50 proceeds delta ≤ $1
    expect(r.matches).toBe(1);
    expect(r.mismatches).toBe(0);
  });

  it('flags mismatches with deltas', () => {
    const r = reconcile1099(
      form([
        {
          symbol: 'VOO',
          description: null,
          proceeds: 1196.2,
          costBasis: 900,
          gain: 296.2,
          term: 'short',
          quantity: 2,
        },
      ]),
      [sale({ symbol: 'VOO', term: 'short', proceeds: 1196.2, basis: 1125.6, gain: 70.6 })],
    );
    const row = r.rows[0];
    expect(row?.status).toBe('mismatch');
    expect(row?.deltas.basis).toBeCloseTo(-225.6, 5); // broker reports LOWER basis
    expect(row?.deltas.proceeds).toBeCloseTo(0, 5);
    expect(r.mismatches).toBe(1);
  });

  it('treats a null reported basis as non-comparable, not a mismatch', () => {
    const r = reconcile1099(
      form([
        {
          symbol: 'DOGE',
          description: null,
          proceeds: 120,
          costBasis: null,
          gain: null,
          term: 'short',
          quantity: 300,
        },
      ]),
      [sale({ symbol: 'DOGE', term: 'short', proceeds: 120, basis: 90, gain: 30 })],
    );
    expect(r.rows[0]?.status).toBe('match'); // proceeds agree; basis unknown on the form
    expect(r.rows[0]?.deltas.basis).toBeNull();
  });

  it('reports missing-history and not-on-1099 rows', () => {
    const r = reconcile1099(
      form([
        {
          symbol: 'PLTR',
          description: null,
          proceeds: 500,
          costBasis: 400,
          gain: 100,
          term: 'short',
          quantity: 20,
        },
      ]),
      [sale({ symbol: 'TSLA', term: 'short', proceeds: 840, basis: 1105, gain: -265 })],
    );
    const statuses = r.rows.map((row) => row.status).sort();
    expect(statuses).toEqual(['missing-history', 'not-on-1099']);
    expect(r.missingHistory).toBe(1);
    expect(r.notOn1099).toBe(1);
  });

  it('aggregates unknown-term rows across both terms and sums multiple sales', () => {
    const r = reconcile1099(
      form([
        {
          symbol: 'NVDA',
          description: null,
          proceeds: 1500,
          costBasis: 900,
          gain: 600,
          term: 'unknown',
          quantity: null,
        },
      ]),
      [
        sale({ symbol: 'NVDA', term: 'short', proceeds: 500, basis: 300, gain: 200 }),
        sale({ symbol: 'NVDA', term: 'long', proceeds: 1000, basis: 600, gain: 400 }),
      ],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.status).toBe('match');
    expect(r.rows[0]?.computed?.proceeds).toBe(1500);
  });
});
