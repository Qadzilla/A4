import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { MULTI_STATE_FIXTURES } from '../lib/calc/filing/fixtures/multi-state';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineMultiState } from '../lib/calc/filing/states/multi-state';

// ─── F4 acceptance ─────────────────────────────────────────────────
// The corpus pins the three credit formulas and the allocation rules;
// this file adds the end-to-end proof — P5's whole pair running through
// the evaluation, with Massachusetts crediting the New York tax it
// would otherwise double-pay.

describe('the multi-state corpus', () => {
  for (const fixture of MULTI_STATE_FIXTURES) {
    it(fixture.id, () => {
      const r = determineMultiState(assertionsOf(fixture), fixture.taxYear, fixture.ctx);
      const e = fixture.expected;

      expect(r.status, 'status').toBe(e.status);
      if (e.shape !== undefined) expect(r.shape, 'shape').toBe(e.shape);
      if (e.receivingState !== undefined) {
        expect(r.credit?.receivingState, 'receiving').toBe(e.receivingState);
      }
      if (e.sourceState !== undefined) expect(r.credit?.sourceState, 'source').toBe(e.sourceState);
      if (e.doublyTaxedIncome !== undefined) {
        expect(r.credit?.doublyTaxedIncome, 'doubly taxed').toBe(e.doublyTaxedIncome);
      }
      if (e.credit !== undefined) {
        expect(Math.round(r.credit?.credit ?? -1), 'credit').toBe(e.credit);
      }
      if (e.boundBy !== undefined) expect(r.credit?.boundBy, 'bound by').toBe(e.boundBy);
      if (e.wagesPriorState !== undefined) {
        expect(r.allocation?.wages.priorState, 'wages prior').toBe(e.wagesPriorState);
      }
      if (e.wagesNewState !== undefined) {
        expect(r.allocation?.wages.newState, 'wages new').toBe(e.wagesNewState);
      }
      if (e.wagesBasis !== undefined) {
        expect(r.allocation?.wages.basis, 'basis').toBe(e.wagesBasis);
      }
      if (e.gainsPriorState !== undefined) {
        expect(r.allocation?.capitalGains?.priorState, 'gains prior').toBe(e.gainsPriorState);
      }
      if (e.gainsNewState !== undefined) {
        expect(r.allocation?.capitalGains?.newState, 'gains new').toBe(e.gainsNewState);
      }
      if (e.missingFactsContain !== undefined) {
        expect(r.missingFacts, 'missing').toContain(e.missingFactsContain);
      }
      if (e.refusalsContain !== undefined) {
        expect(JSON.stringify(r.refusals)).toContain(e.refusalsContain);
      }
      if (e.notesContain !== undefined) {
        expect(JSON.stringify(r.explanation.notes)).toContain(e.notesContain);
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
      assertionId: `f4${++n}`,
      factId,
      taxYear: 2025,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const p5 = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2000-05-05' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('state-of-residence', { kind: 'string', value: 'MA' }),
    make('employer-state', { kind: 'string', value: 'NY' }),
    make('gross-income', { kind: 'number', value: 65000 }),
    make('w2-wages', { kind: 'number', value: 65000 }),
  ];

  it("P5's full pair: both returns computed, and the credit between them", () => {
    const result = evaluateYear(p5(), 2025);

    // The home return is primary; New York rides alongside it.
    expect(result.state?.stateCode).toBe('MA');
    const ny = result.otherStates.find((s) => s.stateCode === 'NY');
    expect(ny).toBeDefined();

    const credit = result.multiState?.credit;
    if (!credit) throw new Error('expected a credit for taxes paid');
    expect(credit.receivingState).toBe('MA');
    expect(credit.sourceState).toBe('NY');
    expect(credit.form).toContain('OJC');
    expect(credit.credit).toBeGreaterThan(0);

    // The credit can never exceed either the source tax or MA's own tax
    // on that income — the two limbs of the formula.
    expect(credit.credit).toBeLessThanOrEqual(credit.taxDueToSource + 0.01);
    expect(credit.credit).toBeLessThanOrEqual(credit.receivingStateCap + 0.01);

    expect(JSON.stringify(result.notes)).toContain('taxed twice');
    // Massachusetts' own trap surfaces with it.
    expect(JSON.stringify(result.notes)).toContain('not the tax withheld');
  });

  it('a single-state year produces no multi-state determination at all', () => {
    const result = evaluateYear([...p5().filter((a) => a.factId !== 'employer-state')], 2025);
    expect(result.state?.stateCode).toBe('MA');
    expect(result.otherStates).toEqual([]);
    expect(result.multiState).toBeNull();
  });

  it('the sale-date allocation runs off the same ledger D5 built', () => {
    const result = evaluateYear(
      [
        ...p5().filter((a) => a.factId !== 'employer-state'),
        make('state-move-date', { kind: 'date', value: '2025-07-01' }),
        make('prior-state-of-residence', { kind: 'string', value: 'CA' }),
      ],
      2025,
      {
        trades: [
          {
            id: 't1',
            symbol: 'VOO',
            side: 'buy',
            tradeDate: '2024-01-05',
            units: 10,
            price: 400,
            fees: 0,
            source: 'snaptrade',
          },
          {
            id: 't2',
            symbol: 'VOO',
            side: 'sell',
            tradeDate: '2025-03-15',
            units: 10,
            price: 440,
            fees: 0,
            source: 'snaptrade',
          },
        ],
      },
    );
    const alloc = result.multiState?.allocation;
    if (!alloc) throw new Error('expected an allocation');
    // The March sale predates the July move, so it belongs to California.
    expect(alloc.capitalGains?.priorState).toBeCloseTo(400, 0);
    expect(alloc.capitalGains?.newState).toBe(0);
  });
});
