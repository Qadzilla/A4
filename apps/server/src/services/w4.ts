// ─── H5 · The W-4, over the desk ───────────────────────────────────
// Reads the completed year and turns its outcome into next year's
// paycheck. Pay frequency is the one input the engine cannot derive —
// nothing on a return says how often someone is paid — so it is asked
// for, with fortnightly as the stated assumption rather than a silent
// one.

import type { DB } from '../db';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import type { PayFrequency, W4Advice } from '../lib/calc/filing/w4';
import { w4Advice } from '../lib/calc/filing/w4';
import { computeQuarterlyPlan } from '../lib/calc/quarterly';
import type { FactScopeKeys } from './facts';
import { loadFilingYear } from './filing-year';

export async function w4For(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  payFrequency: PayFrequency = 'biweekly',
  today: Date = new Date(),
): Promise<W4Advice | null> {
  const year = await loadFilingYear(db, keys, taxYear);
  const evaluation = evaluateYear(year.assertions, taxYear, year.extras);
  const liability = evaluation.liability;
  // A year that cannot be totalled has no gap to project forward. The
  // W-4 is the one form here that needs last year to be finished first.
  if (liability === null || evaluation.inputs === null) return null;

  const status = evaluation.filingStatus.status;
  const filingStatus = status === 'unknown' ? 'single' : status;

  // The safe-harbor target, for the quarterly instrument. Prior-year
  // figures are this year's, because from next year's vantage point
  // that is exactly what they are.
  const plan = computeQuarterlyPlan({
    taxYear: taxYear + 1,
    totalTax: liability.federalTax,
    withheld: liability.federalWithheld,
    estimatedPaymentsMade: 0,
    priorYearTax: liability.federalTax,
    priorYearAgi: liability.agi,
    filingStatus: filingStatus === 'qss' ? 'mfj' : filingStatus,
  });

  return w4Advice({
    basedOn: taxYear,
    gap: liability.refundOrOwed,
    income: liability.agi,
    filingStatus,
    selfEmploymentIncome: evaluation.inputs.selfEmploymentIncome,
    payFrequency,
    today,
    safeHarborShortfall: plan.estimatesNeeded ? plan.shortfall : null,
  });
}
