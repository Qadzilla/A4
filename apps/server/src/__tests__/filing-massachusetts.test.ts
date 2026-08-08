import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { MASSACHUSETTS_FIXTURES } from '../lib/calc/filing/fixtures/massachusetts';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineMassachusetts } from '../lib/calc/filing/states/massachusetts';
import { stateTaxOnGains } from '../lib/calc/state-gains';

// ─── F3 acceptance ─────────────────────────────────────────────────
// The corpus pins Massachusetts' classes and its three mercies; this
// file adds the wiring, and the reconciliation the contract demanded:
// B1's estimate and F3's real module must agree on the gains-only case
// they both claim to cover.

describe('the massachusetts corpus', () => {
  for (const fixture of MASSACHUSETTS_FIXTURES) {
    it(fixture.id, () => {
      const r = determineMassachusetts(assertionsOf(fixture), fixture.taxYear, fixture.ctx);
      const e = fixture.expected;

      expect(r.status, 'status').toBe(e.status);
      if (e.partBTaxable !== undefined) expect(r.partBTaxable, 'part B').toBe(e.partBTaxable);
      if (e.personalExemption !== undefined) {
        expect(r.personalExemption, 'exemption').toBe(e.personalExemption);
      }
      if (e.rentalDeduction !== undefined) {
        expect(r.rentalDeduction, 'rental').toBe(e.rentalDeduction);
      }
      if (e.studentLoanDeduction !== undefined) {
        expect(r.studentLoanDeduction, 'loan interest').toBe(e.studentLoanDeduction);
      }
      if (e.massachusettsAgi !== undefined) {
        expect(r.massachusettsAgi, 'MA AGI').toBe(e.massachusettsAgi);
      }
      if (e.taxBeforeMercies !== undefined) {
        expect(Math.round(r.taxBeforeMercies), 'tax before mercies').toBe(e.taxBeforeMercies);
      }
      if (e.noTaxStatus !== undefined) expect(r.noTaxStatus, 'NTS').toBe(e.noTaxStatus);
      if (e.limitedIncomeCredit !== undefined) {
        expect(Math.round(r.limitedIncomeCredit), 'LIC').toBe(e.limitedIncomeCredit);
      }
      if (e.totalMassachusettsTax !== undefined) {
        expect(Math.round(r.totalMassachusettsTax), 'total').toBe(e.totalMassachusettsTax);
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

describe('B1 and F3 reconcile', () => {
  it('the estimate and the real module agree on gains, which is all B1 ever claimed', () => {
    const gains = { shortTerm: 2000, longTerm: 3000 };
    const b1 = stateTaxOnGains('MA', 2025, gains);
    if (b1.status !== 'applies') throw new Error('expected B1 to apply');

    const facts = assertionsOf({
      id: 'recon',
      source: { kind: 'adversarial', rationale: 'reconciliation between B1 and F3' },
      taxYear: 2025,
      facts: [
        { factId: 'state-of-residence', value: { kind: 'string', value: 'MA' } },
        { factId: 'realized-short-gains', value: { kind: 'number', value: gains.shortTerm } },
        { factId: 'realized-long-gains', value: { kind: 'number', value: gains.longTerm } },
      ],
      expected: null,
    });
    const f3 = determineMassachusetts(facts, 2025, {
      filingStatus: 'single',
      stateOfResidence: 'MA',
      seNetProfit: 0,
    });
    if (f3.status !== 'computed') throw new Error('expected F3 to compute');

    // Same rates, same arithmetic — the estimate was never wrong about
    // gains, only silent about losses and about everything else on the
    // return. That silence is why B1 stays alive.
    expect(f3.shortTermGains * 0.085).toBeCloseTo(b1.estimatedShortTermTax, 6);
    expect(f3.longTermGains * 0.05).toBeCloseTo(b1.estimatedLongTermTax, 6);
  });

  it('the divergence is gone: losses net the same way in both', () => {
    // This test used to assert the opposite. B1 clamped losses at zero
    // and F3 refused them, because M.G.L. c. 62 § 2(c) had not been
    // transcribed — mass.gov blocks automated fetching and the Schedule
    // B and D instructions were unreachable. The statute itself was
    // reachable all along on malegislature.gov, which is better
    // authority anyway. Both now run the same netting.
    const gains = { shortTerm: -3000, longTerm: 5000 };
    const b1 = stateTaxOnGains('MA', 2025, gains);
    if (b1.status !== 'applies') throw new Error('expected B1 to apply');

    const facts = assertionsOf({
      id: 'recon-loss',
      source: { kind: 'adversarial', rationale: 'the former divergence' },
      taxYear: 2025,
      facts: [
        { factId: 'state-of-residence', value: { kind: 'string', value: 'MA' } },
        { factId: 'realized-short-gains', value: { kind: 'number', value: gains.shortTerm } },
        { factId: 'realized-long-gains', value: { kind: 'number', value: gains.longTerm } },
      ],
      expected: null,
    });
    const f3 = determineMassachusetts(facts, 2025, {
      filingStatus: 'single',
      stateOfResidence: 'MA',
      seNetProfit: 0,
    });
    if (f3.status !== 'computed') throw new Error('expected F3 to compute, not refuse');

    // $3,000 of short-term loss against $5,000 of long-term gain leaves
    // $2,000 taxable at 5% — and both modules say so.
    expect(f3.longTermGains).toBe(2000);
    expect(f3.shortTermGains).toBe(0);
    expect(b1.estimatedLongTermTax).toBeCloseTo(f3.longTermGains * 0.05, 6);
    expect(b1.estimatedShortTermTax).toBeCloseTo(f3.shortTermGains * 0.085, 6);
  });

  it('F3 goes further than B1 can: the interest-and-dividends leg', () => {
    // B1 prices one hypothetical sale, so it has no interest income to
    // offer a loss. F3 has the whole year, and the statute's FIRST stop
    // for a short-term loss is interest and dividends.
    const facts = assertionsOf({
      id: 'recon-interest',
      source: { kind: 'adversarial', rationale: 'where the year beats the trade' },
      taxYear: 2025,
      facts: [
        { factId: 'state-of-residence', value: { kind: 'string', value: 'MA' } },
        { factId: 'w2-wages', value: { kind: 'number', value: 40000 } },
        { factId: 'interest-income', value: { kind: 'number', value: 5000 } },
        { factId: 'realized-short-gains', value: { kind: 'number', value: -4000 } },
      ],
      expected: null,
    });
    const f3 = determineMassachusetts(facts, 2025, {
      filingStatus: 'single',
      stateOfResidence: 'MA',
      seNetProfit: 0,
    });
    if (f3.status !== 'computed') throw new Error('expected F3 to compute');

    // $2,000 of the loss comes off the interest — the aggregate cap —
    // and the other $2,000 carries forward as a Part A loss.
    expect(f3.interestDividends).toBe(3000);
    expect(f3.netting?.appliedAgainstInterest).toBe(2000);
    expect(f3.netting?.carryforward.partA).toBe(2000);
  });
});

describe('the wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `ma${++n}`,
      factId,
      taxYear: 2025,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const bostonian = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2000-05-05' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('state-of-residence', { kind: 'string', value: 'MA' }),
    make('gross-income', { kind: 'number', value: 65000 }),
    make('w2-wages', { kind: 'number', value: 65000 }),
  ];

  it('Massachusetts computes through the evaluation, federal untouched', () => {
    const result = evaluateYear(bostonian(), 2025);
    if (result.state?.stateCode !== 'MA') throw new Error('expected the Massachusetts return');
    expect(result.state.status).toBe('computed');
    expect(Math.round(result.state.totalMassachusettsTax)).toBe(3030);

    const newHampshire = evaluateYear(
      [
        ...bostonian().filter((a) => a.factId !== 'state-of-residence'),
        make('state-of-residence', { kind: 'string', value: 'NH' }),
      ],
      2025,
    );
    expect(newHampshire.state).toBeNull();
    expect(result.liability?.federalTax).toBe(newHampshire.liability?.federalTax);
  });

  it('a low-income year surfaces No Tax Status as a finding, not silence', () => {
    const result = evaluateYear(
      [
        ...bostonian().filter((a) => a.factId !== 'w2-wages' && a.factId !== 'gross-income'),
        make('gross-income', { kind: 'number', value: 7500 }),
        make('w2-wages', { kind: 'number', value: 7500 }),
      ],
      2025,
    );
    if (result.state?.stateCode !== 'MA') throw new Error('expected MA');
    expect(result.state.noTaxStatus).toBe(true);
    expect(result.state.totalMassachusettsTax).toBe(0);
    expect(JSON.stringify(result.notes)).toContain('owe Massachusetts nothing');
  });

  it('P5 files both: Massachusetts is home, New York is the source state', () => {
    // Before F4 New York displaced the home return. It no longer does —
    // the resident state is primary and New York rides alongside, which
    // is what actually happens: two returns get filed.
    const result = evaluateYear(
      [...bostonian(), make('employer-state', { kind: 'string', value: 'NY' })],
      2025,
    );
    expect(result.state?.stateCode).toBe('MA');
    expect(result.otherStates.map((s) => s.stateCode)).toContain('NY');
    expect(result.multiState?.credit?.receivingState).toBe('MA');
    expect(result.multiState?.credit?.sourceState).toBe('NY');
  });
});
