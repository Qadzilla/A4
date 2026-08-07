import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { SAVERS_FIXTURES } from '../lib/calc/filing/fixtures/savers-credit';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineSaversCredit } from '../lib/calc/filing/savers-credit';

// ─── D2 acceptance ─────────────────────────────────────────────────
// The corpus runs end-to-end through the evaluation so AGI, the filing
// bucket and the dependency determination are the real wiring. The
// stacking and bounding tests below are what fixtures can't say: the
// credit is mechanical, applies after the elected education credit, and
// never pays past zero.

function saversOf(fixture: (typeof SAVERS_FIXTURES)[number]) {
  const assertions = assertionsOf(fixture);
  const evaluation = evaluateYear(assertions, fixture.taxYear);
  const savers =
    evaluation.savers ??
    determineSaversCredit(assertions, fixture.taxYear, {
      agi: evaluation.liability?.agi ?? null,
      filingStatus: evaluation.filingStatus.status,
      dependency: evaluation.dependency,
    });
  return { evaluation, savers };
}

describe('the savers-credit corpus', () => {
  for (const fixture of SAVERS_FIXTURES) {
    it(fixture.id, () => {
      const { savers } = saversOf(fixture);

      if (fixture.expected.applicable !== undefined) {
        expect(savers.applicable, 'applicable').toBe(fixture.expected.applicable);
      }
      expect(savers.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.amount !== undefined) {
        expect(savers.amount, 'amount').toBe(fixture.expected.amount);
      }
      if (fixture.expected.rate !== undefined) {
        expect(savers.rate, 'rate').toBe(fixture.expected.rate);
      }
      if (fixture.expected.contributionBase !== undefined) {
        expect(savers.contributionBase, 'base').toBe(fixture.expected.contributionBase);
      }
      if (fixture.expected.reductions !== undefined) {
        expect(savers.reductions, 'reductions').toBe(fixture.expected.reductions);
      }
      for (const fact of fixture.expected.missingContains ?? []) {
        expect(savers.missingFacts).toContain(fact);
      }
      if (fixture.expected.iraOption !== undefined) {
        if (fixture.expected.iraOption === null) {
          expect(savers.iraOption).toBeNull();
        } else {
          expect(savers.iraOption?.additionalContribution, 'ira option amount').toBe(
            fixture.expected.iraOption.additionalContribution,
          );
          expect(savers.iraOption?.newCredit, 'ira option new credit').toBe(
            fixture.expected.iraOption.newCredit,
          );
          expect(savers.iraOption?.delta, 'ira option delta').toBe(
            fixture.expected.iraOption.delta,
          );
        }
      }
      if (fixture.expected.successor !== undefined) {
        expect(savers.successor?.name).toBe(fixture.expected.successor);
      }
    });
  }
});

describe('the evaluation wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `s${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  it('applies the credit mechanically and says it is the final year', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '2001-05-01' }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('gross-income', { kind: 'number', value: 22000 }),
        make('w2-wages', { kind: 'number', value: 22000 }),
        make('w2-retirement-contributions', { kind: 'number', value: 1500 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // 22,000 single 2026: taxable 5,900 → tax 590. The $750 credit bounds
    // to the tax that exists — nonrefundable means what it says.
    expect(result.liability.saversCredit).toBe(590);
    expect(result.liability.federalTax).toBe(0);
    expect(JSON.stringify(result.notes)).toContain('final year');
  });

  it('stacks after the elected education credit, inside the same bound', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '2001-05-01' }),
        // Not enough student-months to disqualify the saver's credit, but
        // enough enrollment for the LLC.
        make('full-time-student-months', { kind: 'number', value: 3 }),
        make('gross-income', { kind: 'number', value: 30000 }),
        make('w2-wages', { kind: 'number', value: 30000 }),
        make('w2-retirement-contributions', { kind: 'number', value: 2000 }),
        make('qualified-tuition-paid', { kind: 'number', value: 4000 }),
        make('education-credit-election', { kind: 'string', value: 'llc' }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // 30,000 single: tax 1,420. LLC 800 applies first; the saver's 10%-tier
    // credit ($200 at this AGI) fits inside what remains.
    expect(result.liability.educationCredit).toBe(800);
    expect(result.liability.saversCredit).toBe(200);
    expect(result.liability.federalTax).toBe(1420 - 800 - 200);
  });

  it('a student sees the credit closed and the education credit open — the disqualifiers differ', () => {
    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '2001-05-01' }),
        make('full-time-student-months', { kind: 'number', value: 9 }),
        make('gross-income', { kind: 'number', value: 22000 }),
        make('w2-wages', { kind: 'number', value: 22000 }),
        make('w2-retirement-contributions', { kind: 'number', value: 1500 }),
        make('degree-program', { kind: 'bool', value: true }),
        make('enrolled-half-time', { kind: 'bool', value: true }),
        make('aotc-years-used', { kind: 'number', value: 0 }),
        make('felony-drug-conviction', { kind: 'bool', value: false }),
        make('qualified-tuition-paid', { kind: 'number', value: 4000 }),
      ],
      2026,
    );
    expect(result.savers?.status).toBe('ineligible');
    expect(result.education?.aotc.status).toBe('available');
  });
});
