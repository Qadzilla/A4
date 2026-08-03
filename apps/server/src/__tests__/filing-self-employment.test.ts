import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { SELF_EMPLOYMENT_FIXTURES } from '../lib/calc/filing/fixtures/self-employment';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineSelfEmployment } from '../lib/calc/filing/self-employment';

// ─── D4 acceptance ─────────────────────────────────────────────────
// The corpus carries the statutory arithmetic (the 0.9235, the floor on
// net earnings, the wage-base offset, the 7.65% recovery); this file adds
// what the fixtures can't say — the profit joining the estimator so both
// SE computations agree to the dollar, the under-floor income riding as
// income without SE tax, and a claimed home office poisoning the whole
// liability instead of being computed around.

describe('the self-employment corpus', () => {
  for (const fixture of SELF_EMPLOYMENT_FIXTURES) {
    it(fixture.id, () => {
      const assertions = assertionsOf(fixture);
      const wages = fixture.facts.find((f) => f.factId === 'w2-wages');
      const result = determineSelfEmployment(
        assertions,
        fixture.taxYear,
        wages && wages.value.kind === 'number' ? wages.value.value : 0,
      );

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.grossReceipts !== undefined) {
        expect(result.grossReceipts, 'gross').toBe(fixture.expected.grossReceipts);
      }
      if (fixture.expected.mileageExpense !== undefined) {
        expect(result.expenses.mileage, 'mileage').toBe(fixture.expected.mileageExpense);
      }
      if (fixture.expected.totalExpenses !== undefined) {
        expect(result.expenses.total, 'expenses').toBe(fixture.expected.totalExpenses);
      }
      if (fixture.expected.netProfit !== undefined) {
        expect(result.netProfit, 'net profit').toBe(fixture.expected.netProfit);
      }
      if (fixture.expected.seTaxApplies !== undefined) {
        expect(result.seTaxApplies, 'floor').toBe(fixture.expected.seTaxApplies);
      }
      if (fixture.expected.seTax !== undefined) {
        expect(Math.round(result.seTax), 'se tax').toBe(fixture.expected.seTax);
      }
      if (fixture.expected.leansEmployee !== undefined) {
        expect(result.misclassification?.leansEmployee ?? false, 'leans').toBe(
          fixture.expected.leansEmployee,
        );
      }
      if (fixture.expected.employeeShare !== undefined) {
        expect(result.misclassification?.with8919EmployeeShare, '8919 share').toBe(
          fixture.expected.employeeShare,
        );
      }
      if (fixture.expected.delta !== undefined) {
        expect(result.misclassification?.delta, 'delta').toBe(fixture.expected.delta);
      }
      if (fixture.expected.missingFactsContain !== undefined) {
        expect(result.missingFacts, 'missing').toContain(fixture.expected.missingFactsContain);
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
      assertionId: `w${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const life = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2004-01-10' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('gross-income', { kind: 'number', value: 2700 }),
  ];

  it('P4 computes at last: the SE tax IS the bill, and both computations agree', () => {
    const result = evaluateYear(
      [
        ...life(),
        make('contract-income', { kind: 'number', value: 1800 }),
        make('platform-income', { kind: 'number', value: 900 }),
        make('business-miles', { kind: 'number', value: 0 }),
        make('business-phone-expense', { kind: 'number', value: 0 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    if (result.se === null || result.se.status !== 'computed') throw new Error('expected se');

    // The module's own arithmetic and the estimator's must be the same law.
    expect(result.liability.selfEmploymentTax).toBeCloseTo(result.se.seTax, 6);
    expect(Math.round(result.liability.selfEmploymentTax)).toBe(381);
    // $2,700 sits far under the standard deduction: no income tax at all —
    // the 15.3% is the entire federal bill. The half-deduction trims AGI.
    expect(result.liability.incomeTax).toBe(0);
    expect(Math.round(result.liability.agi)).toBe(2700 - Math.round(result.se.halfDeduction));
    expect(Math.round(result.liability.federalTax)).toBe(381);
    expect(Math.round(result.liability.refundOrOwed)).toBe(381);
  });

  it('under the floor the income is still income — with zero SE tax', () => {
    const result = evaluateYear(
      [
        ...life(),
        make('w2-wages', { kind: 'number', value: 30000 }),
        make('contract-income', { kind: 'number', value: 390 }),
        make('business-miles', { kind: 'number', value: 0 }),
        make('business-phone-expense', { kind: 'number', value: 0 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.selfEmploymentTax).toBe(0);
    // But the $390 raised AGI — income tax applies to it like any income.
    const without = evaluateYear(
      [...life(), make('w2-wages', { kind: 'number', value: 30000 })],
      2026,
    );
    if (without.liability === null) throw new Error('expected liability');
    expect(result.liability.agi).toBe(without.liability.agi + 390);
  });

  it('a home office poisons the whole liability, by name', () => {
    const result = evaluateYear(
      [
        ...life(),
        make('contract-income', { kind: 'number', value: 30000 }),
        make('home-office-expense', { kind: 'number', value: 2400 }),
      ],
      2026,
    );
    expect(result.liability).toBeNull();
    expect(result.blocked).toContain('sch-c');
    expect(JSON.stringify(result.notes)).toContain('home office');
  });

  it('line 16 stays clean: SE tax rides Schedule 2, never the income-tax line', () => {
    const result = evaluateYear(
      [
        ...life(),
        make('gross-income', { kind: 'number', value: 50000 }),
        make('w2-wages', { kind: 'number', value: 30000 }),
        make('contract-income', { kind: 'number', value: 20000 }),
        make('business-miles', { kind: 'number', value: 0 }),
        make('business-phone-expense', { kind: 'number', value: 0 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // The A8 surface: incomeTax is the 1040's tax line and excludes SE tax;
    // federalTax carries it, exactly once.
    expect(result.liability.federalTax - result.liability.incomeTax).toBeCloseTo(
      result.liability.selfEmploymentTax,
      6,
    );
  });
});
