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

  it('B1 does NOT retire yet — losses are exactly where the two diverge', () => {
    // B1 quietly treats a loss as zero tax and says it is an estimate.
    const b1 = stateTaxOnGains('MA', 2025, { shortTerm: -3000, longTerm: 5000 });
    expect(b1.status).toBe('applies');

    // F3 refuses the same year rather than guessing MA's ordering.
    const facts = assertionsOf({
      id: 'recon-loss',
      source: { kind: 'adversarial', rationale: 'the divergence' },
      taxYear: 2025,
      facts: [
        { factId: 'state-of-residence', value: { kind: 'string', value: 'MA' } },
        { factId: 'realized-short-gains', value: { kind: 'number', value: -3000 } },
        { factId: 'realized-long-gains', value: { kind: 'number', value: 5000 } },
      ],
      expected: null,
    });
    const f3 = determineMassachusetts(facts, 2025, {
      filingStatus: 'single',
      stateOfResidence: 'MA',
      seNetProfit: 0,
    });
    expect(f3.status).toBe('refused');
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

  it('P5 with a New York employer still gets New York, not Massachusetts', () => {
    // The precedence the union encodes: the convenience rule reaches
    // across the border, and the home-state return is F4's work.
    const result = evaluateYear(
      [...bostonian(), make('employer-state', { kind: 'string', value: 'NY' })],
      2025,
    );
    expect(result.state?.stateCode).toBe('NY');
  });
});
