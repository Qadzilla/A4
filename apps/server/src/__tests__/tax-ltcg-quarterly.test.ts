import { describe, expect, it } from 'vitest';
import { computeQuarterlyPlan } from '../lib/calc/quarterly';
import { computeTaxEstimate, createDefaultTaxEstimatorData } from '../lib/calc/tax-estimator';

function estimate(overrides: Partial<ReturnType<typeof createDefaultTaxEstimatorData>>) {
  return computeTaxEstimate({ ...createDefaultTaxEstimatorData(), ...overrides });
}

describe('long-term capital gains brackets', () => {
  it('taxes LTCG at 0% when total income sits inside the 0% bracket', () => {
    // 2025 single: 0% LTCG bracket tops out at $48,350 of taxable income.
    // $30k wages − $15k standard deduction = $15k ordinary TI; $10k LTCG
    // stacks to $25k — all inside the 0% bracket.
    const r = estimate({ taxYear: 2025, w2Wages: 30000, capitalGainsLong: 10000 });
    expect(r.ltcgTax).toBe(0);
    // Room left: 48,350 − 15,000 − 10,000 = 23,350
    expect(r.ltcgZeroBracketRoom).toBeCloseTo(23350, 5);
    // Ordinary tax must NOT include the LTCG
    const ordinaryOnly = estimate({ taxYear: 2025, w2Wages: 30000 });
    expect(r.federalTax).toBeCloseTo(ordinaryOnly.federalTax, 5);
  });

  it('taxes LTCG at 15% once stacked above the 0% bracket', () => {
    // $100k wages − $15k = $85k ordinary TI (above 48,350) → all LTCG at 15%
    const r = estimate({ taxYear: 2025, w2Wages: 100000, capitalGainsLong: 10000 });
    expect(r.ltcgTax).toBeCloseTo(1500, 5);
    expect(r.ltcgZeroBracketRoom).toBe(0);
  });

  it('splits LTCG across the 0% and 15% brackets at the boundary', () => {
    // $50k wages − $15k = $35k ordinary TI. 0% room = 13,350; $20k LTCG →
    // 13,350 at 0% + 6,650 at 15% = $997.50
    const r = estimate({ taxYear: 2025, w2Wages: 50000, capitalGainsLong: 20000 });
    expect(r.ltcgTax).toBeCloseTo(6650 * 0.15, 2);
  });

  it('treats short-term gains as ordinary income', () => {
    const withStcg = estimate({ taxYear: 2025, w2Wages: 30000, capitalGainsShort: 10000 });
    const asWages = estimate({ taxYear: 2025, w2Wages: 40000 });
    // Same federal income tax; FICA differs because wages carry payroll tax
    expect(withStcg.federalTax).toBeCloseTo(asWages.federalTax, 5);
    expect(withStcg.ltcgTax).toBe(0);
  });

  it('applies NIIT only above the MAGI threshold', () => {
    const below = estimate({ taxYear: 2025, w2Wages: 100000, capitalGainsLong: 20000 });
    expect(below.niit).toBe(0);
    // $250k wages + $50k LTCG → AGI $300k, $100k over the $200k single
    // threshold; NIIT on min(NII 50k, excess 100k) = 3.8% × 50k = $1,900
    const above = estimate({ taxYear: 2025, w2Wages: 250000, capitalGainsLong: 50000 });
    expect(above.niit).toBeCloseTo(1900, 5);
  });
});

describe('computeQuarterlyPlan', () => {
  const base = {
    taxYear: 2026,
    totalTax: 20000,
    withheld: 10000,
    estimatedPaymentsMade: 0,
    priorYearTax: null,
    priorYearAgi: null,
    filingStatus: 'single',
  };

  it('uses 90% of current-year tax when there is no prior year', () => {
    const plan = computeQuarterlyPlan(base, new Date('2026-01-10'));
    expect(plan.requiredAnnualPayment).toBe(18000);
    expect(plan.safeHarborBasis).toBe('current-year');
    expect(plan.shortfall).toBe(8000);
    expect(plan.estimatesNeeded).toBe(true);
    // All 4 deadlines ahead → spread evenly
    expect(plan.deadlines.every((d) => !d.passed)).toBe(true);
    expect(plan.deadlines[0]?.suggestedPayment).toBe(2000);
  });

  it('prefers the prior-year safe harbor when it is lower', () => {
    const plan = computeQuarterlyPlan(
      { ...base, priorYearTax: 12000, priorYearAgi: 80000 },
      new Date('2026-01-10'),
    );
    expect(plan.requiredAnnualPayment).toBe(12000); // 100% of prior < 90% of current
    expect(plan.safeHarborBasis).toBe('prior-year');
    expect(plan.shortfall).toBe(2000);
  });

  it('applies the 110% multiplier for prior AGI over $150k', () => {
    const plan = computeQuarterlyPlan(
      { ...base, priorYearTax: 15000, priorYearAgi: 200000 },
      new Date('2026-01-10'),
    );
    expect(plan.requiredAnnualPayment).toBeCloseTo(16500, 5); // 110% of 15k, still < 18k
  });

  it('spreads only across remaining deadlines mid-year', () => {
    const plan = computeQuarterlyPlan(base, new Date('2026-07-01'));
    const remaining = plan.deadlines.filter((d) => !d.passed);
    expect(remaining.map((d) => d.quarter)).toEqual([3, 4]);
    expect(remaining[0]?.suggestedPayment).toBe(4000); // 8000 / 2
    expect(plan.deadlines[0]?.suggestedPayment).toBe(0); // passed
  });

  it('needs no estimates under the $1,000 de-minimis rule', () => {
    const plan = computeQuarterlyPlan(
      { ...base, totalTax: 10800, withheld: 10000 },
      new Date('2026-01-10'),
    );
    expect(plan.estimatesNeeded).toBe(false);
    expect(plan.deadlines.every((d) => d.suggestedPayment === 0)).toBe(true);
  });
});
