import { describe, expect, it } from 'vitest';
import { buildForm8949Rows, costBasisCsv, form8949Csv } from '../lib/calc/exports';
import type { BasisHolding } from '../lib/calc/exports';
import type { RealizedSale } from '../lib/calc/lots';

function sale(partial: Partial<RealizedSale> & Pick<RealizedSale, 'symbol'>): RealizedSale {
  return {
    tradeId: 't1',
    saleDate: '2026-06-10',
    units: 10,
    proceeds: 1200,
    basis: 1000,
    gain: 200,
    term: 'short',
    acquiredAt: '2026-01-10',
    washDisallowed: 0,
    uncoveredUnits: 0,
    ...partial,
  };
}

describe('form 8949 worksheet', () => {
  it('puts short-term rows before long-term, each in date order', () => {
    const rows = buildForm8949Rows([
      sale({ symbol: 'VOO', term: 'long', saleDate: '2026-02-01' }),
      sale({ symbol: 'NVDA', term: 'short', saleDate: '2026-05-01' }),
      sale({ symbol: 'TSLA', term: 'short', saleDate: '2026-03-01' }),
    ]);
    expect(rows.map((r) => r.description)).toEqual(['10 sh. TSLA', '10 sh. NVDA', '10 sh. VOO']);
  });

  it('carries a wash sale as code W with the disallowed amount, added back to the gain', () => {
    const [row] = buildForm8949Rows([sale({ symbol: 'TSLA', gain: -265, washDisallowed: 265 })]);
    expect(row?.code).toBe('W');
    expect(row?.adjustment).toBe(265);
    // The reportable gain is the loss plus what the rule disallows — zero here
    expect(row?.gain).toBe(0);
  });

  it('excludes sales with no matched basis rather than reporting a zero basis', () => {
    const rows = buildForm8949Rows([
      sale({ symbol: 'DOGE', units: 0, proceeds: 0, basis: 0, uncoveredUnits: 300 }),
      sale({ symbol: 'NVDA' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('10 sh. NVDA');
  });

  it('totals each term separately in the csv', () => {
    const csv = form8949Csv(
      [
        sale({ symbol: 'NVDA', term: 'long', gain: 353.96 }),
        sale({ symbol: 'VOO', term: 'short', gain: 70.6 }),
        sale({ symbol: 'TSLA', term: 'short', gain: -265, washDisallowed: 265 }),
      ],
      2026,
    );
    expect(csv).toContain('Short-term total,,,,,,,70.60');
    expect(csv).toContain('Long-term total,,,,,,,353.96');
    expect(csv).toContain('Form 8949 worksheet — tax year 2026');
  });

  it('quotes fields containing a comma', () => {
    const csv = form8949Csv([sale({ symbol: 'BRK,B' })], 2026);
    expect(csv).toContain('"10 sh. BRK,B"');
  });
});

describe('cost basis report', () => {
  const today = new Date('2026-07-31T00:00:00Z');

  function holding(partial: Partial<BasisHolding> & Pick<BasisHolding, 'symbol'>): BasisHolding {
    return {
      name: partial.symbol,
      quantity: 10,
      costBasis: 1000,
      acquiredAt: '2026-01-10',
      value: 1200,
      ...partial,
    };
  }

  it('says NOT REPORTED rather than showing a zero basis', () => {
    const csv = costBasisCsv([holding({ symbol: 'VTI', costBasis: null })], today);
    expect(csv).toContain('NOT REPORTED');
    expect(csv).toContain('Positions with a known basis: 0 of 1');
  });

  it('counts the days left to long-term', () => {
    // Acquired 2026-01-10, so on 2026-07-31 it is 202 days held: 164 to go
    const csv = costBasisCsv([holding({ symbol: 'NVDA' })], today);
    expect(csv).toContain('Short-term,164');
  });

  it('reports a position held over a year as long-term with no countdown', () => {
    const csv = costBasisCsv([holding({ symbol: 'VOO', acquiredAt: '2024-01-10' })], today);
    expect(csv).toContain('Long-term,0');
  });

  it('sums unrealized only over positions whose basis is known', () => {
    const csv = costBasisCsv(
      [
        holding({ symbol: 'NVDA', costBasis: 1000, value: 1200 }),
        holding({ symbol: 'VTI', costBasis: null, value: 95000 }),
      ],
      today,
    );
    expect(csv).toContain('Unrealized on those positions,,,,,,200.00');
  });
});
