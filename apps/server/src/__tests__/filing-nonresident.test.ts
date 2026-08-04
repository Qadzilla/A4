import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { NONRESIDENT_FIXTURES } from '../lib/calc/filing/fixtures/nonresident';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineNonresidentReturn } from '../lib/calc/filing/nonresident';

// ─── E1 acceptance ─────────────────────────────────────────────────
// The corpus pins the shape (no standard deduction, exempt interest,
// the named refusals); this file adds what only the wiring proves — the
// full P3 return end to end, the scholarship routing flipping with A2's
// status, the year-six resident getting NONE of this, and a trade
// ledger keeping a nonresident year honestly blocked.

describe('the nonresident corpus', () => {
  for (const fixture of NONRESIDENT_FIXTURES) {
    it(fixture.id, () => {
      const result = determineNonresidentReturn(assertionsOf(fixture), fixture.taxYear);

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.filingStatus !== undefined) {
        expect(result.filingStatus, 'shape').toBe(fixture.expected.filingStatus);
      }
      if (fixture.expected.wages !== undefined) {
        expect(result.eci.wages, 'wages').toBe(fixture.expected.wages);
      }
      if (fixture.expected.taxableScholarship !== undefined) {
        expect(result.eci.taxableScholarship, 'scholarship').toBe(
          fixture.expected.taxableScholarship,
        );
      }
      if (fixture.expected.exemptInterest !== undefined) {
        expect(result.exemptInterest, 'exempt interest').toBe(fixture.expected.exemptInterest);
      }
      if (fixture.expected.itemizedStateTax !== undefined) {
        expect(result.itemizedStateTax, 'state tax').toBe(fixture.expected.itemizedStateTax);
      }
      if (fixture.expected.federalWithheld !== undefined) {
        expect(result.federalWithheld, 'withheld').toBe(fixture.expected.federalWithheld);
      }
      if (fixture.expected.outOfScopeContain !== undefined) {
        expect(result.outOfScope, 'out of scope').toContain(fixture.expected.outOfScopeContain);
      }
      if (fixture.expected.refusalsContain !== undefined) {
        expect(JSON.stringify(result.refusals)).toContain(fixture.expected.refusalsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes)).toContain(fixture.expected.notesContain);
      }
    });
  }
});

describe('the wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `nr${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const f1 = (entryYear = 2024) => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: entryYear }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2004-08-20' }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
  ];

  it('P3 end to end: the 1040-NR computes, taxed from the first dollar', () => {
    const result = evaluateYear(
      [
        ...f1(),
        make('w2-wages', { kind: 'number', value: 12000 }),
        make('w2-federal-withheld', { kind: 'number', value: 1400 }),
      ],
      2026,
    );
    expect(result.residency.status).toBe('nonresident');
    expect(result.blocked).not.toContain('form-1040nr');
    if (result.liability === null) throw new Error('expected the 1040-NR liability');
    expect(result.liability.deduction).toBe(0);
    expect(result.liability.taxableIncome).toBe(12000);
    expect(result.liability.incomeTax).toBeCloseTo(1200, 0); // 10% to the bracket top
    // No FICA on this surface: for the exempt-visa student it should never
    // have been withheld (E4's refund), so totalTax IS the income tax.
    expect(result.liability.totalTax).toBe(result.liability.incomeTax);
    expect(result.liability.refundOrOwed).toBeCloseTo(1200 - 1400, 0);
    expect(result.nonresident?.status).toBe('computed');
  });

  it('the scholarship routes by A2 status — ECI bare here, sheltered for the resident twin', () => {
    const scholarship = [
      // Derived fact — rule-sourced, the way C4's planner writes it.
      makeAssertion({
        assertionId: `nrsch${++n}`,
        factId: 'taxable-scholarship-income',
        taxYear: 2026,
        value: { kind: 'number', value: 5000 },
        source: { kind: 'rule', ruleId: 'c4/taxable-scholarship', consumed: [] },
        assertedAt: '2026-01-01T00:00:00Z',
        supersedes: null,
      } as Parameters<typeof makeAssertion>[0]),
      make('scholarship-federal-withheld', { kind: 'number', value: 700 }),
    ];
    const nr = evaluateYear([...f1(), ...scholarship], 2026);
    if (nr.liability === null) throw new Error('expected NR liability');
    expect(nr.liability.taxableIncome).toBe(5000);
    expect(nr.liability.incomeTax).toBeCloseTo(500, 0);
    expect(nr.liability.refundOrOwed).toBeCloseTo(-200, 0); // the 14% over-withheld

    const resident = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '1998-08-20' }),
        make('full-time-student-months', { kind: 'number', value: 9 }),
        make('gross-income', { kind: 'number', value: 5000 }),
        ...scholarship.map((a) => ({ ...a, assertionId: `${a.assertionId}r` })),
      ],
      2026,
    );
    if (resident.liability === null) throw new Error('expected resident liability');
    // The same $5,000: behind the resident's standard deduction it is $0 of
    // tax. The routing on A2's status is the whole difference.
    expect(resident.liability.incomeTax).toBe(0);
  });

  it('the cruel case: an F-1 in year six is a RESIDENT and gets none of this', () => {
    const result = evaluateYear(
      [
        ...f1(2021), // 2021–2025 consume the five exempt years
        make('days-present', { kind: 'number', value: 330 }),
        make('w2-wages', { kind: 'number', value: 12000 }),
      ],
      2026,
    );
    expect(result.residency.status).toBe('resident');
    expect(result.nonresident).toBeNull();
    if (result.liability === null) throw new Error('expected resident liability');
    // The standard deduction is back — the flip is A2's, and E1 trusts it.
    expect(result.liability.deduction).toBe(16100);
    expect(result.liability.incomeTax).toBe(0);
  });

  it('a trade ledger keeps a nonresident year blocked, with the reason named', () => {
    const result = evaluateYear(
      [...f1(), make('w2-wages', { kind: 'number', value: 12000 })],
      2026,
      {
        trades: [
          {
            id: 'nr-t1',
            symbol: 'VOO',
            side: 'buy',
            tradeDate: '2026-01-05',
            units: 2,
            price: 400,
            fees: 0,
            source: 'snaptrade',
          },
          {
            id: 'nr-t2',
            symbol: 'VOO',
            side: 'sell',
            tradeDate: '2026-06-05',
            units: 2,
            price: 450,
            fees: 0,
            source: 'snaptrade',
          },
        ],
      },
    );
    expect(result.liability).toBeNull();
    expect(result.blocked).toContain('form-1040nr');
    expect(JSON.stringify(result.notes)).toContain('presence days');
  });

  it('the state-tax itemization works through the whole stack', () => {
    const result = evaluateYear(
      [
        ...f1(),
        make('w2-wages', { kind: 'number', value: 30000 }),
        make('w2-state-tax-withheld', { kind: 'number', value: 1500 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.deduction).toBe(1500);
    expect(result.liability.taxableIncome).toBe(28500);
    // 10% × 12,250 + 12% × 16,250 = 1,225 + 1,950 = 3,175.
    expect(result.liability.incomeTax).toBeCloseTo(3175, 0);
  });
});
