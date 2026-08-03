// ─── D4 · Self-employment & misclassification (Sch C / SE / 8919) ──
// The 15.3% surprise, made legible before it's a bill — and the 7.65%
// recovery when "contractor" was a lie.
//
// Authority: Schedule C and SE instructions; Pub 334; Form 8919 and SS-8
// (common-law employee factors). Mileage rates in year-data (2025: 70¢;
// 2026 splits mid-year and the floor is used, named). SE arithmetic is
// statutory: net profit × 0.9235 = net earnings; 12.4% Social Security up
// to the wage base (offset by W-2 wages) + 2.9% Medicare; half the tax
// deducts. No SE tax at all under $400 of net earnings — the floor is in
// the law and the engine knows it.
//
// Income composes from C2's facts exactly as C2 stored them: contract
// income, platform gross minus its decomposition (refunds and personal
// items are not receipts; fees are a real expense), minus the NEC/K
// overlap so the same dollars never count twice.
//
// Expenses are the enumerated simple set — mileage, phone share,
// supplies, platform fees — because they cover the gig cases. A home
// office or anything outside the set REFUSES by name: computing around a
// real expense the person claims would overstate their tax silently,
// and handing off is the honest move.
//
// Misclassification: three life questions and one document signal. When
// the common-law factors lean employee, BOTH filings are priced — full
// SE tax as-is, employee-share-only via SS-8 + Form 8919 — with the
// SS-8 reality stated plainly. The engine recommends neither.

import { FEDERAL_TAX_DATA } from '../tax-data';
import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

export const SE_NET_EARNINGS_FACTOR = 0.9235;
export const SE_SS_RATE = 0.124;
export const SE_MEDICARE_RATE = 0.029;
export const SE_FLOOR = 400;
export const EMPLOYEE_SS_RATE = 0.062;
export const EMPLOYEE_MEDICARE_RATE = 0.0145;

export type SelfEmploymentStatus = 'computed' | 'none' | 'refused' | 'missing-facts';

export interface SelfEmploymentDetermination {
  status: SelfEmploymentStatus;
  grossReceipts: number;
  expenses: {
    mileage: number;
    phone: number;
    supplies: number;
    platformFees: number;
    total: number;
  };
  netProfit: number;
  /** × 0.9235 — what the SE tax actually runs on. */
  netEarnings: number;
  /** False under the $400 floor: income tax yes, SE tax no. */
  seTaxApplies: boolean;
  /** The module's own SE computation — must equal the estimator's. */
  seTax: number;
  halfDeduction: number;
  misclassification: {
    signals: string[];
    leansEmployee: boolean;
    asIsSeTax: number;
    with8919EmployeeShare: number;
    delta: number;
    note: string;
  } | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE =
  'Schedule C / Schedule SE instructions; Pub 334; Form 8919 + SS-8 (worker classification)';

export function determineSelfEmployment(
  assertions: FactAssertion[],
  taxYear: number,
  w2Wages: number,
): SelfEmploymentDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const read = (id: FactId): FactState => {
    if (!consumed.includes(id)) consumed.push(id);
    return factState(set, id);
  };
  const num = (id: FactId): number | null => {
    const s = read(id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const boolFact = (id: FactId): boolean | null => {
    const s = read(id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };
  const isUnresolved = (id: FactId): boolean => {
    const s = factState(set, id);
    return s.status === 'unasserted' || s.status === 'unknown';
  };

  const notes: string[] = [];

  const finish = (
    partial: Partial<SelfEmploymentDetermination> & { status: SelfEmploymentStatus },
  ): SelfEmploymentDetermination => ({
    grossReceipts: 0,
    expenses: { mileage: 0, phone: 0, supplies: 0, platformFees: 0, total: 0 },
    netProfit: 0,
    netEarnings: 0,
    seTaxApplies: false,
    seTax: 0,
    halfDeduction: 0,
    misclassification: null,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'self-employment/sch-c-se',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Status', value: partial.status },
      ],
      notes,
    },
    consumed,
    ...partial,
  });

  // ── Income, composed exactly as C2 stored it ──
  const contract = num('contract-income') ?? num('nec-income') ?? 0;
  const platformGross = num('platform-income') ?? 0;
  const refunds = num('platform-refunds') ?? 0;
  const personalItems = num('personal-items-proceeds') ?? 0;
  const overlap = num('nec-k-overlap') ?? 0;
  const platformBusiness = Math.max(0, platformGross - refunds - personalItems);
  const grossReceipts = Math.max(0, contract + platformBusiness - overlap);

  if (grossReceipts <= 0) {
    return finish({ status: 'none' });
  }

  // ── The fence: a real expense outside the set refuses by name ──
  const homeOffice = num('home-office-expense');
  const otherExpenses = num('other-business-expenses');
  if ((homeOffice !== null && homeOffice > 0) || (otherExpenses !== null && otherExpenses > 0)) {
    const named = [
      ...(homeOffice !== null && homeOffice > 0 ? [`a home office ($${homeOffice})`] : []),
      ...(otherExpenses !== null && otherExpenses > 0
        ? [`expenses outside the simple set ($${otherExpenses})`]
        : []),
    ].join(' and ');
    return finish({
      status: 'refused',
      grossReceipts,
      refusals: [
        `The year claims ${named}. Basis computes the simple expense set (mileage, phone share, supplies, platform fees) — computing around a real expense would overstate the tax silently, so this Schedule C needs a preparer or the fuller slice. Nothing here is guessed.`,
      ],
    });
  }

  // ── The enumerated expenses; unknown computes at zero, priced ──
  const year = filingYearData(taxYear);
  const missing: FactId[] = [];
  const miles = num('business-miles');
  let mileage = 0;
  if (miles !== null && year !== null) {
    mileage = Math.round(miles * year.mileage.rate);
    if (year.mileage.note !== null && miles > 0) notes.push(year.mileage.note);
  } else if (miles === null && isUnresolved('business-miles')) {
    missing.push('business-miles');
  }
  const phone = num('business-phone-expense') ?? 0;
  if (num('business-phone-expense') === null && isUnresolved('business-phone-expense')) {
    missing.push('business-phone-expense');
  }
  const supplies = num('business-supplies-expense') ?? 0;
  const platformFees = num('platform-fees') ?? 0;
  const totalExpenses = mileage + phone + supplies + platformFees;
  if (missing.length > 0) {
    notes.push(
      'Expenses not yet on file compute at zero — every mile and dollar found lowers both the income tax and the 15.3%, so the mileage question is usually the most valuable unanswered one.',
    );
  }

  const netProfit = Math.max(0, grossReceipts - totalExpenses);
  const netEarnings = netProfit * SE_NET_EARNINGS_FACTOR;
  const seTaxApplies = netEarnings >= SE_FLOOR;

  // ── SE tax, with the wage-base offset (must match the estimator) ──
  const fed = FEDERAL_TAX_DATA[taxYear];
  const wageBase = fed?.ssWageBase ?? Number.POSITIVE_INFINITY;
  const ssTaxable = Math.max(0, Math.min(netEarnings, wageBase - w2Wages));
  const seTax = seTaxApplies ? ssTaxable * SE_SS_RATE + netEarnings * SE_MEDICARE_RATE : 0;
  const halfDeduction = seTax * 0.5;

  if (seTaxApplies) {
    notes.push(
      `Self-employment tax is $${Math.round(seTax)} on top of the income tax — the 15.3% no one withheld. Quarterly estimated payments exist for exactly this; the desk's quarterly card knows the safe-harbor amounts.`,
    );
  } else {
    notes.push(
      `Net earnings of $${Math.round(netEarnings)} sit under the $400 floor — the income is still taxed as income, but no self-employment tax applies.`,
    );
  }

  // ── Misclassification: signals, and both filings priced ──
  const signals: string[] = [];
  if (boolFact('payer-set-hours') === true) signals.push('the company set the schedule');
  if (boolFact('payer-provided-equipment') === true)
    signals.push("the work ran on the company's equipment");
  if (boolFact('payer-controlled-how') === true)
    signals.push('the company directed how the work was done');
  const samePayer = boolFact('same-payer-w2-and-1099') === true;
  if (samePayer) signals.push('the same company issued both a W-2 and a 1099');

  const leansEmployee = signals.length >= 2 || samePayer;
  let misclassification: SelfEmploymentDetermination['misclassification'] = null;
  if (leansEmployee && netProfit > 0) {
    // Form 8919 taxes the full compensation like wages — no 0.9235 factor.
    const employeeShare =
      Math.max(0, Math.min(netProfit, wageBase - w2Wages)) * EMPLOYEE_SS_RATE +
      netProfit * EMPLOYEE_MEDICARE_RATE;
    misclassification = {
      signals,
      leansEmployee,
      asIsSeTax: Math.round(seTax),
      with8919EmployeeShare: Math.round(employeeShare),
      delta: Math.round(seTax - employeeShare),
      note: `Being paid on a 1099 doesn't make someone a contractor — here, ${signals.join('; ')}, and that pattern leans employee. Two filings exist: as-is pays the full $${Math.round(seTax)} of self-employment tax; filing Form SS-8 and Form 8919 pays only the employee share, $${Math.round(employeeShare)} — $${Math.round(seTax - employeeShare)} less. The SS-8 reality, plainly: the IRS contacts the company, the determination takes months, and the working relationship will know. Both paths are priced; the choice is not the engine's to make.`,
    };
    notes.push(misclassification.note);
  }

  return finish({
    status: 'computed',
    grossReceipts,
    expenses: { mileage, phone, supplies, platformFees, total: totalExpenses },
    netProfit,
    netEarnings,
    seTaxApplies,
    seTax,
    halfDeduction,
    misclassification,
    missingFacts: missing,
  });
}
