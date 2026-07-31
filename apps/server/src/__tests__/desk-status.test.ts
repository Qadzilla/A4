import { describe, expect, it } from 'vitest';
import { computeDeskStatus } from '../lib/calc/desk-status';
import type { DeskStatusInput } from '../lib/calc/desk-status';
import type { QuarterlyPlan } from '../lib/calc/quarterly';

const TODAY = new Date('2026-07-31T00:00:00Z');

function input(overrides: Partial<DeskStatusInput> = {}): DeskStatusInput {
  return {
    taxYear: 2026,
    today: TODAY,
    holdings: [],
    realized: null,
    hasTrades: false,
    documentCount: 0,
    reconciliation: null,
    hasTaxProfile: false,
    ltcgZeroBracketRoom: 0,
    quarterly: null,
    ...overrides,
  };
}

function line(status: ReturnType<typeof computeDeskStatus>, id: string) {
  const found = status.lines.find((l) => l.id === id);
  if (!found) throw new Error(`no line ${id}`);
  return found;
}

function quarterlyPlan(overrides: Partial<QuarterlyPlan> = {}): QuarterlyPlan {
  return {
    requiredAnnualPayment: 18000,
    safeHarborBasis: 'current-year',
    shortfall: 8000,
    estimatesNeeded: true,
    deadlines: [
      { quarter: 1, dueDate: '2026-04-15', passed: true, suggestedPayment: 0 },
      { quarter: 2, dueDate: '2026-06-15', passed: true, suggestedPayment: 0 },
      { quarter: 3, dueDate: '2026-09-15', passed: false, suggestedPayment: 4000 },
      { quarter: 4, dueDate: '2027-01-15', passed: false, suggestedPayment: 4000 },
    ],
    ...overrides,
  };
}

describe('an empty desk', () => {
  it('is not-started everywhere it could be, and never claims resolved', () => {
    const status = computeDeskStatus(input());
    expect(status.counts.resolved).toBe(0);
    expect(status.lines).toHaveLength(9);
    expect(line(status, 'documents').status).toBe('not-started');
    expect(line(status, 'basis').status).toBe('not-started');
    expect(line(status, 'trades').status).toBe('not-started');
  });

  it('says it cannot tell where the answer depends on data another line is missing', () => {
    const status = computeDeskStatus(input());
    // These three can't be computed without trades, basis and dates
    expect(line(status, 'wash').status).toBe('unknown');
    expect(line(status, 'losses').status).toBe('unknown');
    expect(line(status, 'approaching').status).toBe('unknown');
  });
});

describe('cost basis', () => {
  it('counts what is missing rather than blaming anyone', () => {
    const status = computeDeskStatus(
      input({
        holdings: [
          { symbol: 'NVDA', costBasis: 1000, acquiredAt: '2026-01-01', value: 1200 },
          { symbol: 'VTI', costBasis: null, acquiredAt: null, value: 9000 },
          { symbol: 'BND', costBasis: null, acquiredAt: null, value: 500 },
        ],
      }),
    );
    const basis = line(status, 'basis');
    expect(basis.status).toBe('attention');
    expect(basis.detail).toContain('Missing on 2 of 3 positions');
    expect(basis.detail).not.toMatch(/\byou\b/i);
  });

  it('resolves when every position has one', () => {
    const status = computeDeskStatus(
      input({ holdings: [{ symbol: 'NVDA', costBasis: 1000, acquiredAt: null, value: 1200 }] }),
    );
    expect(line(status, 'basis').status).toBe('resolved');
  });
});

describe('wash sales', () => {
  const withTrades = {
    hasTrades: true,
    realized: { shortTermGain: 70, longTermGain: 353, washDisallowed: 0, saleCount: 3 },
  };

  it('resolves when the year is clean', () => {
    const status = computeDeskStatus(input(withTrades));
    expect(line(status, 'wash').status).toBe('resolved');
  });

  it('flags the disallowed amount and says where it goes', () => {
    const status = computeDeskStatus(
      input({ ...withTrades, realized: { ...withTrades.realized, washDisallowed: 265 } }),
    );
    const wash = line(status, 'wash');
    expect(wash.status).toBe('attention');
    expect(wash.detail).toContain('$265');
    expect(wash.detail).toContain('replacement shares');
  });
});

describe('approaching long-term', () => {
  it('names the nearest position and counts the rest', () => {
    const status = computeDeskStatus(
      input({
        holdings: [
          // 2025-08-20 → 345 days held on 2026-07-31, so 21 days to go
          { symbol: 'NVDA', costBasis: 100, acquiredAt: '2025-08-20', value: 120 },
          // 2025-07-01 → 395 days, already long-term
          { symbol: 'VOO', costBasis: 100, acquiredAt: '2025-07-01', value: 120 },
          // 2025-09-01 → 333 days, 33 to go
          { symbol: 'TSLA', costBasis: 100, acquiredAt: '2025-09-01', value: 90 },
        ],
      }),
    );
    const approaching = line(status, 'approaching');
    expect(approaching.status).toBe('attention');
    expect(approaching.detail).toContain('NVDA turns long-term in 21 days');
    expect(approaching.detail).toContain('1 other');
  });

  it('resolves when nothing is close to the line', () => {
    const status = computeDeskStatus(
      input({
        holdings: [{ symbol: 'AAPL', costBasis: 100, acquiredAt: '2026-07-01', value: 120 }],
      }),
    );
    expect(line(status, 'approaching').status).toBe('resolved');
  });
});

describe('the 0% window', () => {
  it('needs a profile before it will say anything', () => {
    const status = computeDeskStatus(input({ ltcgZeroBracketRoom: 22425 }));
    expect(line(status, 'window').status).toBe('not-started');
  });

  it('reports the room as something to act on', () => {
    const status = computeDeskStatus(input({ hasTaxProfile: true, ltcgZeroBracketRoom: 22425 }));
    const window = line(status, 'window');
    expect(window.status).toBe('attention');
    expect(window.detail).toContain('$22,425');
  });

  it('resolves when income is above the bracket', () => {
    const status = computeDeskStatus(input({ hasTaxProfile: true, ltcgZeroBracketRoom: 0 }));
    expect(line(status, 'window').status).toBe('resolved');
  });
});

describe('quarterly payments', () => {
  it('quotes the next deadline that has not passed', () => {
    const status = computeDeskStatus(input({ hasTaxProfile: true, quarterly: quarterlyPlan() }));
    const quarterly = line(status, 'quarterly');
    expect(quarterly.status).toBe('attention');
    expect(quarterly.detail).toContain('2026-09-15');
    expect(quarterly.detail).toContain('$4,000');
  });

  it('resolves when withholding already covers the safe harbour', () => {
    const status = computeDeskStatus(
      input({
        hasTaxProfile: true,
        quarterly: quarterlyPlan({ estimatesNeeded: false, shortfall: 0 }),
      }),
    );
    expect(line(status, 'quarterly').status).toBe('resolved');
  });
});

describe('the 1099 check', () => {
  it('is not-started until a form is uploaded', () => {
    const status = computeDeskStatus(input());
    expect(line(status, 'reconcile').status).toBe('not-started');
    expect(line(status, 'reconcile').detail).toContain('2026');
  });

  it('resolves only when nothing at all disagrees', () => {
    const status = computeDeskStatus(
      input({
        reconciliation: { matches: 4, mismatches: 0, missingHistory: 0, notOn1099: 0 },
      }),
    );
    expect(line(status, 'reconcile').status).toBe('resolved');
  });

  it('lists every kind of disagreement it found', () => {
    const status = computeDeskStatus(
      input({
        reconciliation: { matches: 2, mismatches: 1, missingHistory: 1, notOn1099: 1 },
      }),
    );
    const reconcile = line(status, 'reconcile');
    expect(reconcile.status).toBe('attention');
    expect(reconcile.detail).toContain('1 disagree');
    expect(reconcile.detail).toContain('without trade history');
    expect(reconcile.detail).toContain('missing from the form');
  });
});

describe('losses', () => {
  it('sums only the positions that are under water', () => {
    const status = computeDeskStatus(
      input({
        holdings: [
          { symbol: 'TSLA', costBasis: 1200, acquiredAt: null, value: 1000 }, // −200
          { symbol: 'DOGE', costBasis: 340, acquiredAt: null, value: 285 }, // −55
          { symbol: 'NVDA', costBasis: 1000, acquiredAt: null, value: 1500 }, // +500, ignored
        ],
      }),
    );
    const losses = line(status, 'losses');
    expect(losses.status).toBe('attention');
    expect(losses.detail).toContain('$255');
  });
});

describe('counts', () => {
  it('adds up to the number of lines', () => {
    const status = computeDeskStatus(input({ documentCount: 3, hasTrades: true }));
    const total = Object.values(status.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(status.lines.length);
  });
});
