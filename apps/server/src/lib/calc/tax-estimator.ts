// ─── Tax Estimator Utils ───────────────────────────────────────────
// Types, defaults, and deterministic computation pipeline for US tax estimation.

import { formatCurrency } from './currency-utils';
import type { StateTaxConfig, TaxBracket, TaxFilingStatus } from './tax-data';
import { FEDERAL_TAX_DATA, STATE_TAX_DATA } from './tax-data';

// ─── Types ─────────────────────────────────────────────────────────

export interface TaxEstimatorData {
  taxYear: number;
  filingStatus: TaxFilingStatus;
  stateCode: string;

  // Income
  w2Wages: number;
  selfEmploymentIncome: number;
  /** Interest + ordinary (non-qualified) dividends — taxed as ordinary income */
  investmentIncome: number;
  /** Net short-term capital gains — taxed as ordinary income */
  capitalGainsShort: number;
  /** Net long-term capital gains + qualified dividends — preferential 0/15/20 brackets */
  capitalGainsLong: number;
  otherIncome: number;

  // Adjustments (above-the-line)
  retirement401k: number;
  traditionalIRA: number;
  hsaContribution: number;
  studentLoanInterest: number;

  // Deductions
  deductionType: 'standard' | 'itemized';
  saltDeduction: number;
  mortgageInterest: number;
  charitableGiving: number;
  otherItemized: number;
  /**
   * Below-the-line deductions that stack ON TOP of the standard/itemized
   * choice and never touch AGI — the OBBBA tips/overtime deductions
   * (Sch 1-A, TY2025–28) are the occupants. Reduces taxable income only,
   * so every AGI/MAGI-based phaseout upstream is unaffected.
   */
  belowLineDeductions: number;

  // Credits
  numDependentChildren: number;
  otherCredits: number;

  // Withholding / payments
  federalWithheld: number;
  stateWithheld: number;
  estimatedPayments: number;

  notes: string;
}

export interface TaxEstimateResult {
  grossIncome: number;
  adjustments: number;
  seDeduction: number;
  agi: number;
  deduction: number;
  taxableIncome: number;
  federalTax: number;
  /** Tax on long-term gains at the preferential 0/15/20 rates */
  ltcgTax: number;
  /** Net investment income tax (3.8% over the MAGI threshold) */
  niit: number;
  /** How much MORE long-term gain could be realized this year at the 0% federal rate */
  ltcgZeroBracketRoom: number;
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;
  selfEmploymentTax: number;
  stateTax: number;
  childTaxCredit: number;
  otherCredits: number;
  totalTax: number;
  totalPayments: number;
  refundOrOwed: number;
  effectiveRate: number;
  marginalFederalRate: number;
  marginalStateRate: number;
}

// ─── Helpers ───────────────────────────────────────────────────────

export function createDefaultTaxEstimatorData(): TaxEstimatorData {
  return {
    taxYear: 2025,
    filingStatus: 'single',
    stateCode: '',
    w2Wages: 0,
    selfEmploymentIncome: 0,
    investmentIncome: 0,
    capitalGainsShort: 0,
    capitalGainsLong: 0,
    otherIncome: 0,
    retirement401k: 0,
    traditionalIRA: 0,
    hsaContribution: 0,
    studentLoanInterest: 0,
    deductionType: 'standard',
    saltDeduction: 0,
    mortgageInterest: 0,
    charitableGiving: 0,
    otherItemized: 0,
    belowLineDeductions: 0,
    numDependentChildren: 0,
    otherCredits: 0,
    federalWithheld: 0,
    stateWithheld: 0,
    estimatedPayments: 0,
    notes: '',
  };
}

function applyBrackets(
  income: number,
  brackets: TaxBracket[],
): { tax: number; marginalRate: number } {
  let tax = 0;
  let marginalRate = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    const taxable = Math.min(income, b.max) - b.min;
    tax += taxable * b.rate;
    marginalRate = b.rate;
  }
  return { tax, marginalRate };
}

/**
 * Tax on `amount` stacked ON TOP of `floor` income within `brackets` — the
 * LTCG method: long-term gains fill the preferential brackets starting where
 * ordinary taxable income ends.
 */
function applyBracketsAbove(floor: number, amount: number, brackets: TaxBracket[]): number {
  if (amount <= 0) return 0;
  const top = floor + amount;
  let tax = 0;
  for (const b of brackets) {
    if (top <= b.min) break;
    const lo = Math.max(b.min, floor);
    const hi = Math.min(b.max, top);
    if (hi > lo) tax += (hi - lo) * b.rate;
  }
  return tax;
}

// ─── Computation ───────────────────────────────────────────────────

export function computeTaxEstimate(data: TaxEstimatorData): TaxEstimateResult {
  const fed = FEDERAL_TAX_DATA[data.taxYear] ?? FEDERAL_TAX_DATA[2025]!;

  // 1. Gross Income (short-term gains are ordinary; long-term get their own brackets below)
  const grossIncome =
    data.w2Wages +
    data.selfEmploymentIncome +
    data.investmentIncome +
    data.capitalGainsShort +
    data.capitalGainsLong +
    data.otherIncome;

  // 2. Self-Employment Tax (compute early — half is an adjustment)
  const seBase = data.selfEmploymentIncome * fed.seMultiplier;
  const ssTaxableSE = Math.max(0, Math.min(seBase, fed.ssWageBase - data.w2Wages));
  const selfEmploymentTax = ssTaxableSE * fed.seSSTaxRate + seBase * fed.seMedicareTaxRate;
  const seDeduction = selfEmploymentTax * 0.5;

  // 3. Adjustments & AGI
  const adjustments =
    data.retirement401k +
    data.traditionalIRA +
    data.hsaContribution +
    data.studentLoanInterest +
    seDeduction;
  const agi = Math.max(0, grossIncome - adjustments);

  // 4. Deductions
  const standardDeduction = fed.standardDeduction[data.filingStatus];
  let deduction: number;
  if (data.deductionType === 'standard') {
    deduction = standardDeduction;
  } else {
    const salt = Math.min(data.saltDeduction, fed.saltCap);
    deduction = salt + data.mortgageInterest + data.charitableGiving + data.otherItemized;
  }
  const taxableIncome = Math.max(0, agi - deduction - data.belowLineDeductions);

  // 5. Federal Income Tax — long-term gains are carved out of ordinary income
  // and taxed at the preferential 0/15/20 brackets, stacked on top of the
  // ordinary taxable income (the Schedule D worksheet method, simplified).
  const ltcgPortion = Math.min(data.capitalGainsLong, taxableIncome);
  const ordinaryTaxableIncome = taxableIncome - ltcgPortion;
  const fedBrackets = fed.brackets[data.filingStatus];
  const { tax: federalTax, marginalRate: marginalFederalRate } = applyBrackets(
    ordinaryTaxableIncome,
    fedBrackets,
  );
  const ltcgBrackets = fed.ltcgBrackets[data.filingStatus];
  const ltcgTax = applyBracketsAbove(ordinaryTaxableIncome, ltcgPortion, ltcgBrackets);
  // Room left in the 0% long-term bracket — gains realizable this year at 0% federal
  const zeroBracketTop = ltcgBrackets[0]?.rate === 0 ? (ltcgBrackets[0]?.max ?? 0) : 0;
  const ltcgZeroBracketRoom = Math.max(0, zeroBracketTop - ordinaryTaxableIncome - ltcgPortion);

  // 5b. Net investment income tax (3.8% on investment income over the MAGI threshold)
  const netInvestmentIncome = data.investmentIncome + data.capitalGainsShort + ltcgPortion;
  const niit =
    fed.niitRate *
    Math.min(
      Math.max(0, netInvestmentIncome),
      Math.max(0, agi - fed.niitThreshold[data.filingStatus]),
    );

  // 6. FICA (W-2 employee portion)
  const socialSecurityTax = Math.min(data.w2Wages, fed.ssWageBase) * fed.ssRate;
  const medicareTax = data.w2Wages * fed.medicareRate;
  const medicareThreshold = fed.additionalMedicareThreshold[data.filingStatus];
  const additionalMedicareTax =
    Math.max(0, data.w2Wages - medicareThreshold) * fed.additionalMedicareRate;

  // 7. State Tax
  let stateTax = 0;
  let marginalStateRate = 0;
  const stateData = data.stateCode ? STATE_TAX_DATA[data.taxYear]?.[data.stateCode] : undefined;
  if (stateData) {
    stateTax = computeStateTax(agi, data.filingStatus, stateData);
    marginalStateRate = getStateMarginalRate(agi, data.filingStatus, stateData);
  }

  // 8. Credits
  const childTaxCredit = Math.min(
    data.numDependentChildren * fed.childTaxCredit,
    federalTax + ltcgTax,
  );
  const otherCredits = data.otherCredits;

  // 9. Total Tax
  const totalTax = Math.max(
    0,
    federalTax +
      ltcgTax +
      niit +
      socialSecurityTax +
      medicareTax +
      additionalMedicareTax +
      selfEmploymentTax +
      stateTax -
      childTaxCredit -
      otherCredits,
  );

  // 10. Payments & Refund
  const totalPayments = data.federalWithheld + data.stateWithheld + data.estimatedPayments;
  const refundOrOwed = totalPayments - totalTax;

  // 11. Effective Rate
  const effectiveRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;

  return {
    grossIncome,
    adjustments,
    seDeduction,
    agi,
    deduction,
    taxableIncome,
    federalTax,
    ltcgTax,
    niit,
    ltcgZeroBracketRoom,
    socialSecurityTax,
    medicareTax,
    additionalMedicareTax,
    selfEmploymentTax,
    stateTax,
    childTaxCredit,
    otherCredits,
    totalTax,
    totalPayments,
    refundOrOwed,
    effectiveRate,
    marginalFederalRate: marginalFederalRate * 100,
    marginalStateRate: marginalStateRate * 100,
  };
}

function computeStateTax(
  agi: number,
  filingStatus: TaxFilingStatus,
  config: StateTaxConfig,
): number {
  if (config.type === 'none') return 0;

  const stateStdDed = config.standardDeduction ? config.standardDeduction[filingStatus] : 0;
  const taxableIncome = Math.max(0, agi - stateStdDed);

  if (config.type === 'flat') {
    return taxableIncome * (config.rate ?? 0);
  }

  // Progressive
  if (!config.brackets) return 0;
  const brackets =
    filingStatus === 'mfj' || filingStatus === 'hoh'
      ? (config.brackets.mfj ?? config.brackets.single)
      : config.brackets.single;
  return applyBrackets(taxableIncome, brackets).tax;
}

function getStateMarginalRate(
  agi: number,
  filingStatus: TaxFilingStatus,
  config: StateTaxConfig,
): number {
  if (config.type === 'none') return 0;
  if (config.type === 'flat') return config.rate ?? 0;

  if (!config.brackets) return 0;
  const stateStdDed = config.standardDeduction ? config.standardDeduction[filingStatus] : 0;
  const taxableIncome = Math.max(0, agi - stateStdDed);
  const brackets =
    filingStatus === 'mfj' || filingStatus === 'hoh'
      ? (config.brackets.mfj ?? config.brackets.single)
      : config.brackets.single;
  return applyBrackets(taxableIncome, brackets).marginalRate;
}

export function formatTaxCurrency(value: number): string {
  return formatCurrency(value, 'USD');
}

export function formatTaxPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
