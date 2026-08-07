import { describe, expect, it } from 'vitest';
import { determineEducation } from '../lib/calc/filing/education';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { EDUCATION_FIXTURES } from '../lib/calc/filing/fixtures/education';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';

// ─── D1 acceptance ─────────────────────────────────────────────────
// The corpus carries the arithmetic and the gates; this file runs it
// end-to-end through the evaluation — so MAGI, the SLI two-pass, the
// election's income side and the applied-credit bounds are all the real
// wiring, not a re-derivation.

function educationOf(fixture: (typeof EDUCATION_FIXTURES)[number]) {
  const assertions = assertionsOf(fixture);
  const evaluation = evaluateYear(assertions, fixture.taxYear);
  const education =
    evaluation.education ??
    determineEducation(assertions, fixture.taxYear, {
      magi: evaluation.liability?.agi ?? null,
      filingStatus: evaluation.filingStatus.status,
      dependency: evaluation.dependency,
    });
  return { evaluation, education };
}

describe('the education corpus', () => {
  for (const fixture of EDUCATION_FIXTURES) {
    it(fixture.id, () => {
      const { evaluation, education } = educationOf(fixture);

      if (fixture.expected.aotc) {
        expect(education.aotc.status, 'aotc status').toBe(fixture.expected.aotc.status);
        if (fixture.expected.aotc.amount !== undefined) {
          expect(education.aotc.amount, 'aotc amount').toBe(fixture.expected.aotc.amount);
        }
        if (fixture.expected.aotc.refundable !== undefined) {
          expect(education.aotc.refundable, 'aotc refundable').toBe(
            fixture.expected.aotc.refundable,
          );
        }
      }
      if (fixture.expected.llc) {
        expect(education.llc.status, 'llc status').toBe(fixture.expected.llc.status);
        if (fixture.expected.llc.amount !== undefined) {
          expect(education.llc.amount, 'llc amount').toBe(fixture.expected.llc.amount);
        }
      }
      if (fixture.expected.sli) {
        expect(education.studentLoanInterest.status, 'sli status').toBe(
          fixture.expected.sli.status,
        );
        if (fixture.expected.sli.allowed !== undefined) {
          expect(education.studentLoanInterest.allowed, 'sli allowed').toBe(
            fixture.expected.sli.allowed,
          );
        }
      }
      for (const fact of fixture.expected.aotcMissingContains ?? []) {
        expect(education.aotc.missingFacts).toContain(fact);
      }
      if (fixture.expected.electionSuggested !== undefined) {
        expect(education.scholarshipElection?.suggestedAmount).toBe(
          fixture.expected.electionSuggested,
        );
      }
      if (fixture.expected.electionGain !== undefined) {
        expect(education.scholarshipElection?.creditGain).toBe(fixture.expected.electionGain);
      }
      if (fixture.expected.agi !== undefined) {
        expect(evaluation.liability?.agi, 'agi through the evaluation').toBe(fixture.expected.agi);
      }
    });
  }
});

describe('the standing rules', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `e${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const eligible = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2001-05-01' }),
    make('gross-income', { kind: 'number', value: 30000 }),
    make('w2-wages', { kind: 'number', value: 30000 }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
    make('degree-program', { kind: 'bool', value: true }),
    make('enrolled-half-time', { kind: 'bool', value: true }),
    make('aotc-years-used', { kind: 'number', value: 0 }),
    make('felony-drug-conviction', { kind: 'bool', value: false }),
    make('qualified-tuition-paid', { kind: 'number', value: 4000 }),
  ];

  it('never applies a credit without the election — priced, noted, left on the table', () => {
    const result = evaluateYear(eligible(), 2026);
    if (result.liability === null) throw new Error('expected liability');
    expect(result.education?.aotc.amount).toBe(2500);
    expect(result.liability.educationCredit).toBe(0);
    expect(JSON.stringify(result.notes)).toContain('NOT applied');
    expect(JSON.stringify(result.notes)).toContain('election');
  });

  it('applies the elected credit, bounded by tax, with the refundable slice reaching past zero', () => {
    const result = evaluateYear(
      [...eligible(), make('education-credit-election', { kind: 'string', value: 'aotc' })],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // 30,000 single 2026: taxable 13,900 → tax 1,420. Nonrefundable 1,500
    // bounds to the tax; the $1,000 refundable slice still pays out.
    expect(result.liability.educationCredit).toBe(1420 + 1000);
    expect(result.liability.federalTax).toBe(0);
    expect(result.liability.refundOrOwed).toBe(-1000);
  });

  it('honours the LLC election even where the AOTC is bigger — an election, not a ranking', () => {
    const result = evaluateYear(
      [...eligible(), make('education-credit-election', { kind: 'string', value: 'llc' })],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.educationCredit).toBe(800);
  });

  it('a felony drug conviction closes the AOTC and only the AOTC', () => {
    const facts = [
      ...eligible().filter((a) => a.factId !== 'felony-drug-conviction'),
      make('felony-drug-conviction', { kind: 'bool', value: true }),
    ];
    const result = evaluateYear(facts, 2026);
    expect(result.education?.aotc.status).toBe('ineligible');
    expect(result.education?.llc.status).toBe('available');
    expect(result.education?.llc.amount).toBe(800);
  });

  it('names the transcript as the way to recover a forgotten AOTC count', () => {
    const facts = eligible().filter((a) => a.factId !== 'aotc-years-used');
    const result = evaluateYear(facts, 2026);
    expect(result.education?.aotc.status).toBe('missing-facts');
    expect(result.education?.aotc.missingFacts).toContain('aotc-years-used');
    expect(JSON.stringify(result.education?.explanation.notes)).toContain('transcript');
  });

  it('phases both credits over the same band', () => {
    const facts = [
      ...eligible().filter((a) => a.factId !== 'w2-wages' && a.factId !== 'gross-income'),
      make('w2-wages', { kind: 'number', value: 85000 }),
      make('gross-income', { kind: 'number', value: 85000 }),
    ];
    const result = evaluateYear(facts, 2026);
    // MAGI 85,000 sits halfway through 80k–90k: both credits halve.
    expect(result.education?.aotc.amount).toBe(1250);
    expect(result.education?.llc.amount).toBe(400);
  });
});
