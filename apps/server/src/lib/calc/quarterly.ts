// ─── Quarterly Estimated Payments ──────────────────────────────────
// IRS safe-harbor math (Form 2210 logic, simplified to the planning view):
// no penalty if withholding + timely estimates reach the LESSER of
//   • 90% of this year's tax, or
//   • 100% of last year's tax (110% if last year's AGI > $150k / $75k MFS).
// Under $1,000 owed after withholding → no estimates needed at all.

export interface QuarterlyInput {
  taxYear: number;
  /** Projected full-year total tax (from the estimator) */
  totalTax: number;
  /** Projected full-year withholding (federal + state treated as withheld evenly) */
  withheld: number;
  /** Estimated payments already made this year */
  estimatedPaymentsMade: number;
  priorYearTax: number | null;
  priorYearAgi: number | null;
  filingStatus: string;
}

export interface QuarterlyDeadline {
  quarter: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD */
  dueDate: string;
  passed: boolean;
  suggestedPayment: number;
}

export interface QuarterlyPlan {
  /** The safe-harbor target: pay this much across the year and penalties can't apply */
  requiredAnnualPayment: number;
  safeHarborBasis: 'current-year' | 'prior-year';
  /** Remaining gap to the safe harbor after withholding + payments made */
  shortfall: number;
  /** False when the de-minimis rule applies (< $1,000 owed) */
  estimatesNeeded: boolean;
  deadlines: QuarterlyDeadline[];
}

const DE_MINIMIS = 1000;
const HIGH_AGI_THRESHOLD = 150000;
const HIGH_AGI_THRESHOLD_MFS = 75000;

export function computeQuarterlyPlan(input: QuarterlyInput, today = new Date()): QuarterlyPlan {
  const currentYearBasis = 0.9 * input.totalTax;

  let priorYearBasis = Number.POSITIVE_INFINITY;
  if (input.priorYearTax !== null && input.priorYearTax >= 0) {
    const threshold = input.filingStatus === 'mfs' ? HIGH_AGI_THRESHOLD_MFS : HIGH_AGI_THRESHOLD;
    const multiplier = input.priorYearAgi !== null && input.priorYearAgi > threshold ? 1.1 : 1.0;
    priorYearBasis = input.priorYearTax * multiplier;
  }

  const requiredAnnualPayment = Math.min(currentYearBasis, priorYearBasis);
  const safeHarborBasis: QuarterlyPlan['safeHarborBasis'] =
    priorYearBasis < currentYearBasis ? 'prior-year' : 'current-year';

  const paid = input.withheld + input.estimatedPaymentsMade;
  const shortfall = Math.max(0, requiredAnnualPayment - paid);
  // De minimis is measured against actual tax owed after withholding
  const estimatesNeeded = input.totalTax - input.withheld >= DE_MINIMIS && shortfall > 0;

  const dueDates: Array<{ quarter: 1 | 2 | 3 | 4; dueDate: string }> = [
    { quarter: 1, dueDate: `${input.taxYear}-04-15` },
    { quarter: 2, dueDate: `${input.taxYear}-06-15` },
    { quarter: 3, dueDate: `${input.taxYear}-09-15` },
    { quarter: 4, dueDate: `${input.taxYear + 1}-01-15` },
  ];

  const todayIso = today.toISOString().slice(0, 10);
  const remaining = dueDates.filter((d) => d.dueDate >= todayIso).length;
  const perRemaining = remaining > 0 ? shortfall / remaining : 0;

  const deadlines: QuarterlyDeadline[] = dueDates.map((d) => {
    const passed = d.dueDate < todayIso;
    return {
      quarter: d.quarter,
      dueDate: d.dueDate,
      passed,
      suggestedPayment: passed || !estimatesNeeded ? 0 : perRemaining,
    };
  });

  return { requiredAnnualPayment, safeHarborBasis, shortfall, estimatesNeeded, deadlines };
}
