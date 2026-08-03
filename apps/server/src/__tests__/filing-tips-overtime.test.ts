import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { TIPS_OVERTIME_FIXTURES } from '../lib/calc/filing/fixtures/tips-overtime';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { requiredForms } from '../lib/calc/filing/requirements';
import { determineTipsOvertime } from '../lib/calc/filing/tips-overtime';

// ─── D7 acceptance ─────────────────────────────────────────────────
// The corpus carries the verified law (caps, the ceil phaseout, the
// joint-only rule, the window); this file adds the wiring — the tipped
// P1 end to end, the deduction stacking BELOW the line so AGI and every
// MAGI phaseout hold still, and the 4137 riding Schedule 2 while the
// income-tax line stays clean.

describe('the tips-overtime corpus', () => {
  for (const fixture of TIPS_OVERTIME_FIXTURES) {
    it(fixture.id, () => {
      const assertions = assertionsOf(fixture);
      const wages = fixture.facts.find((f) => f.factId === 'w2-wages');
      const result = determineTipsOvertime(assertions, fixture.taxYear, {
        magi: fixture.ctx.magi,
        filingStatus: fixture.ctx.filingStatus ?? 'single',
        seNetProfit: fixture.ctx.seNetProfit ?? 0,
        w2Wages: wages && wages.value.kind === 'number' ? wages.value.value : 0,
      });

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.tipsQualified !== undefined) {
        expect(result.tips.qualified, 'qualified').toBe(fixture.expected.tipsQualified);
      }
      if (fixture.expected.tipsAllowed !== undefined) {
        expect(result.tips.allowed, 'tips allowed').toBe(fixture.expected.tipsAllowed);
      }
      if (fixture.expected.overtimeAllowed !== undefined) {
        expect(result.overtime.allowed, 'overtime allowed').toBe(fixture.expected.overtimeAllowed);
      }
      if (fixture.expected.totalDeduction !== undefined) {
        expect(result.totalDeduction, 'total').toBe(fixture.expected.totalDeduction);
      }
      if (fixture.expected.fica4137 !== undefined) {
        expect(result.form4137?.ficaOwed, '4137 fica').toBeCloseTo(fixture.expected.fica4137, 5);
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
      assertionId: `to${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const server = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2003-04-04' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('gross-income', { kind: 'number', value: 25000 }),
    make('w2-wages', { kind: 'number', value: 18000 }),
    make('w2-tips', { kind: 'number', value: 7000 }),
    make('tipped-occupation-listed', { kind: 'bool', value: true }),
  ];

  it('the tipped P1, end to end: the deduction erases the income tax', () => {
    const result = evaluateYear(server(), 2026);
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.tipsOvertimeDeduction).toBe(7000);
    // 18,000 − 16,100 standard − 7,000 tips → taxable 0, income tax 0.
    expect(result.liability.taxableIncome).toBe(0);
    expect(result.liability.incomeTax).toBe(0);
    expect(JSON.stringify(result.notes)).toContain('headline');
  });

  it('below the line means BELOW: AGI and the standard deduction hold still', () => {
    const withDeduction = evaluateYear(server(), 2026);
    const without = evaluateYear(
      server().filter((a) => a.factId !== 'tipped-occupation-listed'),
      2026,
    );
    if (withDeduction.liability === null || without.liability === null) {
      throw new Error('expected liabilities');
    }
    // Same AGI, same standard deduction — only taxable income moves.
    expect(withDeduction.liability.agi).toBe(without.liability.agi);
    expect(withDeduction.liability.deduction).toBe(without.liability.deduction);
    // Occupation unknown → deduction 0 → 1,900 stays taxable.
    expect(without.liability.tipsOvertimeDeduction).toBe(0);
    expect(without.liability.taxableIncome).toBe(1900);
    expect(withDeduction.liability.taxableIncome).toBe(0);
  });

  it('the 4137 rides Schedule 2: FICA comes due, the income-tax line stays clean', () => {
    const facts = [...server(), make('unreported-tips', { kind: 'number', value: 3000 })];
    const result = evaluateYear(facts, 2026);
    if (result.liability === null) throw new Error('expected liability');
    // The cash joins income (AGI 21,000), the deduction grows to 10,000,
    // taxable stays 0 — and the 7.65% arrives as its own line.
    expect(result.liability.agi).toBe(21000);
    expect(result.liability.tipsOvertimeDeduction).toBe(10000);
    expect(result.liability.incomeTax).toBe(0);
    expect(result.liability.form4137Tax).toBeCloseTo(229.5, 5);
    expect(result.liability.federalTax).toBeCloseTo(229.5, 5);
    expect(result.liability.refundOrOwed).toBeCloseTo(229.5, 5);
    expect(result.tipsOvertime?.form4137?.unreportedTips).toBe(3000);
  });

  it('the year requires its forms: Sch 1-A in the window, the 4137 with unreported cash', () => {
    const facts = [...server(), make('unreported-tips', { kind: 'number', value: 3000 })];
    const forms = requiredForms(facts, [], 2026).map((f) => f.form);
    expect(forms).toContain('sch-1-a');
    expect(forms).toContain('form-4137');
    // Outside the window the schedule vanishes; the 4137 does not.
    const facts2024 = facts.map((a) => ({ ...a, taxYear: 2024 }));
    const forms2024 = requiredForms(facts2024, [], 2024).map((f) => f.form);
    expect(forms2024).not.toContain('sch-1-a');
    expect(forms2024).toContain('form-4137');
  });
});
