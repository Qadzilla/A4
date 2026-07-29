import { describe, expect, it } from 'vitest';
import { computeRealizedGains } from '../lib/calc/lots';
import type { LotTrade } from '../lib/calc/lots';

let n = 0;
function trade(partial: Omit<LotTrade, 'id' | 'fees'> & { fees?: number }): LotTrade {
  n += 1;
  return { id: `t${n}`, fees: 0, ...partial };
}

describe('computeRealizedGains', () => {
  it('matches FIFO lots and computes the gain', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 100 }),
      trade({ symbol: 'NVDA', side: 'buy', tradeDate: '2025-03-10', units: 10, price: 150 }),
      trade({ symbol: 'NVDA', side: 'sell', tradeDate: '2025-06-10', units: 15, price: 200 }),
    ]);
    const [sale] = r.sales;
    // 10 @ $100 + 5 @ $150 = $1,750 basis; proceeds 15 × $200 = $3,000
    expect(sale?.basis).toBe(1750);
    expect(sale?.proceeds).toBe(3000);
    expect(sale?.gain).toBe(1250);
    expect(sale?.term).toBe('short');
    expect(sale?.acquiredAt).toBe('2025-01-10');
    expect(r.shortTermGain).toBe(1250);
    expect(r.longTermGain).toBe(0);
    // 5 units of the second lot remain open
    expect(r.openLots).toEqual([
      { symbol: 'NVDA', acquiredAt: '2025-03-10', units: 5, costPerUnit: 150 },
    ]);
  });

  it('classifies > 365 days as long-term', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'VOO', side: 'buy', tradeDate: '2024-01-10', units: 10, price: 400 }),
      trade({ symbol: 'VOO', side: 'sell', tradeDate: '2025-06-11', units: 10, price: 500 }),
    ]);
    expect(r.sales[0]?.term).toBe('long');
    expect(r.longTermGain).toBe(1000);
    // Exactly 365 days is still short-term
    const exact = computeRealizedGains([
      trade({ symbol: 'VOO', side: 'buy', tradeDate: '2024-06-11', units: 10, price: 400 }),
      trade({ symbol: 'VOO', side: 'sell', tradeDate: '2025-06-11', units: 10, price: 500 }),
    ]);
    expect(exact.sales[0]?.term).toBe('short');
  });

  it('capitalizes buy fees into basis and nets sell fees from proceeds', () => {
    const r = computeRealizedGains([
      trade({
        symbol: 'AAPL',
        side: 'buy',
        tradeDate: '2025-01-10',
        units: 10,
        price: 100,
        fees: 10,
      }),
      trade({
        symbol: 'AAPL',
        side: 'sell',
        tradeDate: '2025-02-10',
        units: 10,
        price: 110,
        fees: 5,
      }),
    ]);
    // basis 1000 + 10; proceeds 1100 − 5 → gain 85
    expect(r.sales[0]?.gain).toBeCloseTo(85, 5);
  });

  it('disallows a loss when replacement shares are bought within 30 days', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 300 }),
      trade({ symbol: 'TSLA', side: 'sell', tradeDate: '2025-05-01', units: 10, price: 200 }),
      trade({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-05-15', units: 10, price: 210 }),
    ]);
    const [sale] = r.sales;
    expect(sale?.gain).toBe(-1000);
    expect(sale?.washDisallowed).toBe(1000); // fully replaced → fully disallowed
    // Loss added back to totals…
    expect(r.shortTermGain).toBe(0);
    expect(r.washDisallowed).toBe(1000);
    // …and pushed into the replacement lot's basis: 210 + 1000/10 = 310
    expect(r.openLots[0]?.costPerUnit).toBeCloseTo(310, 5);
  });

  it('disallows proportionally on partial replacement', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 300 }),
      trade({ symbol: 'TSLA', side: 'sell', tradeDate: '2025-05-01', units: 10, price: 200 }),
      trade({ symbol: 'TSLA', side: 'buy', tradeDate: '2025-05-20', units: 4, price: 210 }),
    ]);
    expect(r.sales[0]?.washDisallowed).toBeCloseTo(400, 5); // 4/10 of the $1,000 loss
    expect(r.shortTermGain).toBeCloseTo(-600, 5);
  });

  it('does not flag gains or far-apart buys as wash sales', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'VTI', side: 'buy', tradeDate: '2025-01-10', units: 10, price: 200 }),
      trade({ symbol: 'VTI', side: 'sell', tradeDate: '2025-05-01', units: 10, price: 180 }),
      trade({ symbol: 'VTI', side: 'buy', tradeDate: '2025-07-15', units: 10, price: 170 }),
    ]);
    expect(r.sales[0]?.washDisallowed).toBe(0); // replacement is 75 days later
    expect(r.shortTermGain).toBe(-200);
  });

  it('reports uncovered units instead of guessing basis', () => {
    const r = computeRealizedGains([
      trade({ symbol: 'DOGE', side: 'buy', tradeDate: '2025-03-01', units: 100, price: 0.3 }),
      trade({ symbol: 'DOGE', side: 'sell', tradeDate: '2025-06-01', units: 300, price: 0.4 }),
    ]);
    const [sale] = r.sales;
    expect(sale?.units).toBe(100);
    expect(sale?.uncoveredUnits).toBe(200);
    expect(sale?.gain).toBeCloseTo(10, 5); // only the matched 100 units
    expect(r.uncoveredUnits).toBe(200);
  });

  it('filters reported sales by tax year while matching across all history', () => {
    const trades = [
      trade({ symbol: 'NVDA', side: 'buy', tradeDate: '2024-01-10', units: 20, price: 50 }),
      trade({ symbol: 'NVDA', side: 'sell', tradeDate: '2024-11-01', units: 10, price: 140 }),
      trade({ symbol: 'NVDA', side: 'sell', tradeDate: '2025-02-01', units: 10, price: 120 }),
    ];
    const r2025 = computeRealizedGains(trades, 2025);
    expect(r2025.sales).toHaveLength(1);
    expect(r2025.sales[0]?.saleDate).toBe('2025-02-01');
    // Second sale consumed the SAME 2024 lot: basis $500, proceeds $1,200
    expect(r2025.longTermGain).toBe(700);
    const r2024 = computeRealizedGains(trades, 2024);
    expect(r2024.shortTermGain).toBe(900);
  });
});
