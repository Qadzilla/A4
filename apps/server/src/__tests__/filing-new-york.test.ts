import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { NEW_YORK_FIXTURES } from '../lib/calc/filing/fixtures/new-york';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineNewYork } from '../lib/calc/filing/states/new-york';

// ─── F2 acceptance ─────────────────────────────────────────────────
// The corpus pins New York's three taxes against the IT-201-I
// schedules; this file adds what only the wiring proves — that the
// convenience rule reaches a Massachusetts resident through the
// evaluation itself, and that a second state in the union doesn't
// disturb the first.

describe('the new york corpus', () => {
  for (const fixture of NEW_YORK_FIXTURES) {
    it(fixture.id, () => {
      const r = determineNewYork(assertionsOf(fixture), fixture.taxYear, fixture.ctx);
      const e = fixture.expected;

      expect(r.status, 'status').toBe(e.status);
      if (e.basis !== undefined) expect(r.basis, 'basis').toBe(e.basis);
      if (e.nyAgi !== undefined) expect(r.nyAgi, 'NY AGI').toBe(e.nyAgi);
      if (e.standardDeduction !== undefined) {
        expect(r.standardDeduction, 'deduction').toBe(e.standardDeduction);
      }
      if (e.taxableIncome !== undefined) expect(r.taxableIncome, 'taxable').toBe(e.taxableIncome);
      if (e.stateTax !== undefined) expect(Math.round(r.stateTax), 'state tax').toBe(e.stateTax);
      if (e.householdCredit !== undefined) {
        expect(r.householdCredit, 'household credit').toBe(e.householdCredit);
      }
      if (e.nycTax !== undefined) expect(Math.round(r.nycTax), 'NYC tax').toBe(e.nycTax);
      if (e.nycSchoolTaxCredit !== undefined) {
        expect(r.nycSchoolTaxCredit, 'NYC school credit').toBe(e.nycSchoolTaxCredit);
      }
      if (e.yonkersResidentSurcharge !== undefined) {
        expect(Math.round(r.yonkersResidentSurcharge), 'Yonkers surcharge').toBe(
          e.yonkersResidentSurcharge,
        );
      }
      if (e.yonkersNonresidentTax !== undefined) {
        expect(Math.round(r.yonkersNonresidentTax), 'Yonkers NR').toBe(e.yonkersNonresidentTax);
      }
      if (e.totalNewYorkTax !== undefined) {
        expect(Math.round(r.totalNewYorkTax), 'total').toBe(e.totalNewYorkTax);
      }
      if (e.tuitionEligible !== undefined) {
        expect(r.collegeTuitionCredit.eligible, 'tuition').toBe(e.tuitionEligible);
      }
      if (e.statutoryResidencyDetected !== undefined) {
        expect(r.statutoryResidencyDetected, 'statutory residency').toBe(
          e.statutoryResidencyDetected,
        );
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
      assertionId: `ny${++n}`,
      factId,
      taxYear: 2025,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const person = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2000-05-05' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('gross-income', { kind: 'number', value: 65000 }),
    make('w2-wages', { kind: 'number', value: 65000 }),
  ];

  it('P5 at last: living in Massachusetts, taxed by New York anyway', () => {
    const result = evaluateYear(
      [
        ...person(),
        make('state-of-residence', { kind: 'string', value: 'MA' }),
        make('employer-state', { kind: 'string', value: 'NY' }),
      ],
      2025,
    );
    // Since F4 the RESIDENT state is the primary return; New York rides
    // alongside it as the source state, because both get filed.
    expect(result.state?.stateCode).toBe('MA');
    const ny = result.otherStates.find((s) => s.stateCode === 'NY');
    if (ny?.stateCode !== 'NY') throw new Error('expected the New York return');
    expect(ny.status).toBe('computed');
    expect(ny.basis).toBe('nonresident-convenience');
    // Every dollar of wages is New York income despite the person never
    // working there — the rule the page and the product both exist for.
    expect(ny.nyAgi).toBe(65000);
    expect(ny.totalNewYorkTax).toBeGreaterThan(0);
    expect(JSON.stringify(result.notes)).toContain('convenience of the employer');
    // The federal return is untouched by any of it.
    expect(result.liability).not.toBeNull();
  });

  it('a second state in the union leaves California exactly as it was', () => {
    const californian = evaluateYear(
      [...person(), make('state-of-residence', { kind: 'string', value: 'CA' })],
      2025,
    );
    expect(californian.state?.stateCode).toBe('CA');
    expect(californian.state?.status).toBe('computed');

    // And a New Yorker gets New York, not California.
    const newYorker = evaluateYear(
      [...person(), make('state-of-residence', { kind: 'string', value: 'NY' })],
      2025,
    );
    expect(newYorker.state?.stateCode).toBe('NY');
  });

  it('the three New York taxes stack on one address', () => {
    const yonkers = evaluateYear(
      [
        ...person(),
        make('state-of-residence', { kind: 'string', value: 'NY' }),
        make('months-in-yonkers', { kind: 'number', value: 12 }),
      ],
      2025,
    );
    if (yonkers.state?.stateCode !== 'NY') throw new Error('expected NY');
    expect(yonkers.state.yonkersResidentSurcharge).toBeGreaterThan(0);
    expect(yonkers.state.totalNewYorkTax).toBeGreaterThan(yonkers.state.stateTax);
  });
});
