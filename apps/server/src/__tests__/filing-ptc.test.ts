import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { PTC_FIXTURES } from '../lib/calc/filing/fixtures/ptc';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determinePtc } from '../lib/calc/filing/ptc';
import { assessReadiness } from '../lib/calc/filing/readiness';

// ─── D3 acceptance ─────────────────────────────────────────────────
// The corpus carries the paired-year law and the hand-computed
// arithmetic; this file adds the wiring the fixtures can't say — the
// freeze blocking by name, the repayment riding Schedule 2, the credit
// riding the refund, and P7's blocker vanishing the moment the monthly
// table arrives.

describe('the ptc corpus', () => {
  for (const fixture of PTC_FIXTURES) {
    it(fixture.id, () => {
      const assertions = assertionsOf(fixture);
      const magi = fixture.facts.find((f) => f.factId === 'gross-income');
      const result = determinePtc(assertions, fixture.months, {
        householdMagi: magi && magi.value.kind === 'number' ? magi.value.value : null,
        filingStatus: fixture.filingStatus ?? 'single',
        taxYear: fixture.taxYear,
      });

      expect(result.status, 'status').toBe(fixture.expected.status);
      if (fixture.expected.fplPercent !== undefined) {
        expect(result.fplPercent, 'fpl %').toBe(fixture.expected.fplPercent);
      }
      if (fixture.expected.ptcTotal !== undefined) {
        expect(result.ptcTotal, 'ptc total').toBe(fixture.expected.ptcTotal);
      }
      if (fixture.expected.aptcTotal !== undefined) {
        expect(result.aptcTotal, 'aptc total').toBe(fixture.expected.aptcTotal);
      }
      if (fixture.expected.additionalCredit !== undefined) {
        expect(result.additionalCredit, 'additional credit').toBe(
          fixture.expected.additionalCredit,
        );
      }
      if (fixture.expected.repayment !== undefined) {
        expect(result.repayment, 'repayment').toBe(fixture.expected.repayment);
      }
      if (fixture.expected.repaymentBeforeCap !== undefined) {
        expect(result.repaymentBeforeCap, 'before cap').toBe(fixture.expected.repaymentBeforeCap);
      }
      if (fixture.expected.capApplied !== undefined) {
        expect(result.capApplied, 'cap').toBe(fixture.expected.capApplied);
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
      assertionId: `p${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const insured = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2002-02-02' }),
    make('full-time-student-months', { kind: 'number', value: 0 }),
    make('gross-income', { kind: 'number', value: 31300 }),
    make('w2-wages', { kind: 'number', value: 31300 }),
    make('marketplace-health-insurance', { kind: 'bool', value: true }),
  ];

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    premium: 450,
    slcsp: 420,
    aptc: 300,
  }));

  it('blocks by name when coverage exists and the months do not', () => {
    const result = evaluateYear(insured(), 2026);
    expect(result.blocked).toContain('form-8962');
    expect(JSON.stringify(result.notes)).toContain('freezes');
    expect(result.ptc).toBeNull();
  });

  it('reconciles when the months arrive: the repayment rides Schedule 2', () => {
    const result = evaluateYear(insured(), 2026, { ptcMonths: months });
    if (result.liability === null) throw new Error('expected liability');
    expect(result.blocked).not.toContain('form-8962');
    expect(result.liability.ptcRepayment).toBe(626);
    // Line 16 stays pre-credit, pre-Schedule-2 — the A8 surface is untouched.
    const withoutPtc = evaluateYear(
      insured().filter((a) => a.factId !== 'marketplace-health-insurance'),
      2026,
    );
    if (withoutPtc.liability === null) throw new Error('expected liability');
    expect(result.liability.incomeTax).toBe(withoutPtc.liability.incomeTax);
    expect(result.liability.federalTax).toBe(withoutPtc.liability.federalTax + 626);
    expect(result.liability.refundOrOwed).toBe(withoutPtc.liability.refundOrOwed + 626);
  });

  it('a lower-than-estimated year pays the credit into the refund', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2002-02-02' }),
      make('full-time-student-months', { kind: 'number', value: 0 }),
      make('gross-income', { kind: 'number', value: 31300 }),
      make('w2-wages', { kind: 'number', value: 31300 }),
      make('marketplace-health-insurance', { kind: 'bool', value: true }),
    ].map((a) => ({ ...a, taxYear: 2025 }));
    const result = evaluateYear(facts, 2025, { ptcMonths: months });
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.ptcAdditionalCredit).toBe(726);
    // Refundable: it moves the refund line, never the tax lines.
    const without = evaluateYear(
      facts.filter((a) => a.factId !== 'marketplace-health-insurance'),
      2025,
    );
    if (without.liability === null) throw new Error('expected liability');
    expect(result.liability.federalTax).toBe(without.liability.federalTax);
    expect(result.liability.refundOrOwed).toBe(without.liability.refundOrOwed - 726);
  });

  it("P7's freeze lifts the moment the monthly table arrives", () => {
    const p7 = [
      ...insured(),
      make('contract-income', { kind: 'number', value: 38000 }),
      make('digital-asset-activity', { kind: 'bool', value: false }),
    ];
    const docs = [
      { kind: '1095-A' as const, fileId: 'f1' },
      { kind: 'W-2' as const, fileId: 'f2' },
    ];
    const MARCH = new Date('2027-03-01T12:00:00Z');

    const frozen = assessReadiness(p7, docs, 2026, MARCH);
    expect(frozen.blockers.some((b) => b.id === 'computation:form-8962')).toBe(true);

    const thawed = assessReadiness(p7, docs, 2026, MARCH, { ptcMonths: months });
    expect(thawed.blockers.some((b) => b.id === 'computation:form-8962')).toBe(false);
    // Since D4 the Schedule C computes too — nothing blocks this year any
    // more. (Before D4 this asserted form:sch-c remained; that blocker's
    // removal is D4's acceptance.)
    expect(thawed.blockers.some((b) => b.id === 'form:sch-c')).toBe(false);
    expect(thawed.verdict).not.toBe('blocked');
  });
});
