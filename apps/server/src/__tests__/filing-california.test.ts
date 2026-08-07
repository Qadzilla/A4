import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { CALIFORNIA_FIXTURES } from '../lib/calc/filing/fixtures/california';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineCalifornia } from '../lib/calc/filing/states/california';

// ─── F1 acceptance ─────────────────────────────────────────────────
// The corpus pins California's own arithmetic against FTB's schedules;
// this file adds what only the wiring proves — that the state rides the
// same facts as the federal return without contaminating it, and that
// the 0% federal window and the California bill are computed from the
// same year without either one lying about the other.

describe('the california corpus', () => {
  for (const fixture of CALIFORNIA_FIXTURES) {
    it(fixture.id, () => {
      const result = determineCalifornia(assertionsOf(fixture), fixture.taxYear, fixture.ctx);
      const e = fixture.expected;

      expect(result.status, 'status').toBe(e.status);
      if (e.caAgi !== undefined) expect(result.caAgi, 'CA AGI').toBe(e.caAgi);
      if (e.hsaAddBack !== undefined) expect(result.hsaAddBack, 'HSA').toBe(e.hsaAddBack);
      if (e.standardDeduction !== undefined) {
        expect(result.standardDeduction, 'deduction').toBe(e.standardDeduction);
      }
      if (e.taxableIncome !== undefined) {
        expect(result.taxableIncome, 'taxable').toBe(e.taxableIncome);
      }
      if (e.taxBeforeCredits !== undefined) {
        expect(Math.round(result.taxBeforeCredits), 'tax before credits').toBe(e.taxBeforeCredits);
      }
      if (e.exemptionCredit !== undefined) {
        expect(result.exemptionCredit, 'exemption').toBe(e.exemptionCredit);
      }
      if (e.taxAfterCredits !== undefined) {
        expect(Math.round(result.taxAfterCredits), 'tax after credits').toBe(e.taxAfterCredits);
      }
      if (e.taxOnCapitalGains !== undefined) {
        expect(Math.round(result.taxOnCapitalGains), 'gains tax').toBe(e.taxOnCapitalGains);
      }
      if (e.renterStatus !== undefined) {
        expect(result.renterCredit.status, 'renter status').toBe(e.renterStatus);
      }
      if (e.renterAmount !== undefined) {
        expect(result.renterCredit.amount, 'renter amount').toBe(e.renterAmount);
      }
      if (e.calEitcEligible !== undefined) {
        expect(result.calEitc.eligible, 'CalEITC').toBe(e.calEitcEligible);
      }
      if (e.calEitcMax !== undefined) {
        expect(result.calEitc.maxCredit, 'CalEITC max').toBe(e.calEitcMax);
      }
      if (e.refusalsContain !== undefined) {
        expect(JSON.stringify(result.refusals)).toContain(e.refusalsContain);
      }
      if (e.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes)).toContain(e.notesContain);
      }
    });
  }
});

describe('the wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
    taxYear = 2025,
  ) =>
    makeAssertion({
      assertionId: `ca${++n}`,
      factId,
      taxYear,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const californian = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2000-05-05' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('state-of-residence', { kind: 'string', value: 'CA' }),
    make('gross-income', { kind: 'number', value: 42000 }),
    make('w2-wages', { kind: 'number', value: 42000 }),
  ];

  it('the state computes alongside the federal return without touching it', () => {
    const withState = evaluateYear(californian(), 2025);
    if (withState.liability === null) throw new Error('expected liability');
    if (withState.state?.stateCode !== 'CA') throw new Error('expected the California return');
    expect(withState.state.status).toBe('computed');
    expect(Math.round(withState.state.taxAfterCredits)).toBe(663);

    // The same person in Texas: identical federal numbers, no state at all.
    const texan = evaluateYear(
      [
        ...californian().filter((a) => a.factId !== 'state-of-residence'),
        make('state-of-residence', { kind: 'string', value: 'TX' }),
      ],
      2025,
    );
    if (texan.liability === null) throw new Error('expected liability');
    expect(texan.state).toBeNull();
    // State tax never leaks into the federal totals — that is the whole
    // reason a state is an independent rule set rather than a multiplier.
    expect(withState.liability.federalTax).toBe(texan.liability.federalTax);
    expect(withState.liability.totalTax).toBe(texan.liability.totalTax);
  });

  it('the 0% federal window and the California bill are both true at once', () => {
    const gains = [
      ...californian(),
      make('brokerage-account', { kind: 'bool', value: true }),
      make('sold-investments', { kind: 'bool', value: true }),
      make('realized-long-gains', { kind: 'number', value: 5000 }),
    ];
    const result = evaluateYear(gains, 2025);
    if (result.liability === null) throw new Error('expected liability');
    if (result.state === null) throw new Error('expected state');

    // Federally the gain sits inside the 0% long-term bracket…
    const withoutGains = evaluateYear(californian(), 2025);
    expect(result.liability.incomeTax).toBe(withoutGains.liability?.incomeTax);
    // …and California charges its ordinary rate on every dollar of it.
    if (result.state.stateCode !== 'CA') throw new Error('expected the California return');
    expect(result.state.taxOnCapitalGains).toBeGreaterThan(0);
    expect(JSON.stringify(result.notes)).toContain('no 0% window');
  });

  it('2026 refuses by name rather than indexing FTB’s figures itself', () => {
    const result = evaluateYear(
      californian().map((a) => ({ ...a, taxYear: 2026 })),
      2026,
    );
    expect(result.state?.status).toBe('refused');
    expect(JSON.stringify(result.notes)).toContain("aren't published yet");
    // The federal return is unaffected — a missing state year is not a
    // missing federal year.
    expect(result.liability).not.toBeNull();
  });
});
