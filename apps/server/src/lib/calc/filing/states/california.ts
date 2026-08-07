// ─── F1 · California (Form 540) ────────────────────────────────────
// The largest user state, and the one that quietly undoes the federal
// 0% capital-gains window: California has no preferential rate at all,
// so every dollar realized "tax-free" federally is taxed here at the
// ordinary rate. B3 said that in one line; this module turns it into a
// number.
//
// Authority: 2025 Form 540 and its instructions; Schedule CA (540) for
// the conformity adjustments; ftb.ca.gov credit pages; FTB 3514 booklet
// for CalEITC. Every figure lives in ca-data.ts with its source named.
//
// A state is an independent rule set, not a percentage of the federal
// bill (the F-phase preface). So this recomputes from California's own
// starting point: federal AGI, adjusted by the enumerated conformity
// set, against California's brackets, deduction and credits.
//
// The conformity set, enumerated and fenced:
//   HSA — California does not conform. Contributions made through
//         payroll (W-2 box 12 code W) are excluded from federal wages
//         but taxed by California, so they add back into CA income
//         (Schedule CA (540) line 13). California is one of only two
//         states that does this, and nobody expects it.
//   Student-loan interest — conforms. No adjustment.
//   Capital gains — no preferential rate. Nothing to adjust; the gains
//         are already in federal AGI and California simply taxes them.
//   Tips and overtime — the new federal deductions are below the line,
//         so they never reduced federal AGI and cannot leak into CA.
// Anything else detected names itself and defers (the fence).
//
// The credits are the oblivious money: a renter's credit that costs
// nothing but knowing it exists, and CalEITC — which California opens
// to childless workers at 18, where the federal credit largely does
// not. Its investment-income ceiling is the cruel case: a few thousand
// dollars of gains ends the credit outright.

import type { TaxBracket } from '../../tax-data';
import { type FactAssertion, type FactId, factSet, factState } from '../facts';
import type { FilingStatus } from '../filing-status';
import type { ResidencyStatus } from '../residency';
import type { RuleTrace } from '../trace';
import { californiaData } from './ca-data';

export type CaliforniaStatus = 'computed' | 'refused' | 'not-applicable';

export type RenterCreditStatus =
  | 'claimed'
  | 'income-too-high'
  | 'not-enough-months'
  | 'lived-with-someone-who-can-claim-you'
  | 'unknown';

export interface CaliforniaDetermination {
  stateCode: 'CA';
  status: CaliforniaStatus;
  /** Federal AGI plus the enumerated conformity adjustments. */
  caAgi: number;
  hsaAddBack: number;
  standardDeduction: number;
  taxableIncome: number;
  taxBeforeCredits: number;
  exemptionCredit: number;
  renterCredit: { amount: number; status: RenterCreditStatus };
  calEitc: {
    eligible: boolean | 'unknown';
    /** The year's maximum for this child count — the exact figure is a lookup. */
    maxCredit: number;
    reason: string;
  };
  /** What California charges after its nonrefundable credits. */
  taxAfterCredits: number;
  /** The part of the CA bill caused by capital gains — B3, in dollars. */
  taxOnCapitalGains: number;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface CaliforniaContext {
  federalAgi: number;
  filingStatus: FilingStatus;
  canBeClaimed: 'yes' | 'no' | 'unknown';
  residencyStatus: ResidencyStatus;
  /** Wages plus self-employment profit — CalEITC's base. */
  earnedIncome: number;
  /** Interest, dividends and net gains — CalEITC's ceiling test. */
  investmentIncome: number;
  /** Total capital gains in federal AGI, for the no-preference finding. */
  capitalGains: number;
}

const CITE =
  '2025 Form 540 + instructions; Schedule CA (540) conformity; ftb.ca.gov renter’s credit and CalEITC pages; FTB 3514 booklet';

/** California's schedules are plain marginal brackets. */
function applyBrackets(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return tax;
}

export function determineCalifornia(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: CaliforniaContext,
): CaliforniaDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const str = (id: FactId): string | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
  };

  const finish = (
    partial: Partial<CaliforniaDetermination> & { status: CaliforniaStatus },
  ): CaliforniaDetermination => ({
    stateCode: 'CA',
    caAgi: 0,
    hsaAddBack: 0,
    standardDeduction: 0,
    taxableIncome: 0,
    taxBeforeCredits: 0,
    exemptionCredit: 0,
    renterCredit: { amount: 0, status: 'unknown' },
    calEitc: { eligible: 'unknown', maxCredit: 0, reason: '' },
    taxAfterCredits: 0,
    taxOnCapitalGains: 0,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'state/ca-540',
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

  // ── Whose return is this ──
  if (str('state-of-residence') !== 'CA') {
    return finish({ status: 'not-applicable' });
  }

  // California has no nonresident-alien concept: a federal 1040-NR filer
  // still files a CA return, and a part-year or dual-status year needs the
  // 540NR allocation that F4 owns. Named, not approximated.
  if (ctx.residencyStatus === 'nonresident' || ctx.residencyStatus === 'dual-status') {
    return finish({
      status: 'refused',
      refusals: [
        'California has no nonresident-alien concept — federal residency does not carry over, and this year would file the 540NR with income allocated between California and elsewhere. That allocation is a later slice; nothing here is approximated.',
      ],
    });
  }

  const year = californiaData(taxYear);
  if (year === null) {
    return finish({
      status: 'refused',
      refusals: [
        `California's ${taxYear} figures aren't published yet — FTB indexes the brackets, standard deduction and credit limits annually and had not released ${taxYear} at the time this was built. Indexing them here would be a guess with a dollar sign on it, so California is left uncomputed for this year.`,
      ],
    });
  }

  // ── CA AGI: federal AGI plus the enumerated conformity set ──
  const hsaAddBack = num('w2-hsa-contributions') ?? 0;
  const caAgi = ctx.federalAgi + hsaAddBack;
  if (hsaAddBack > 0) {
    notes.push(
      `$${hsaAddBack} of health-savings-account money taken out of your pay is tax-free federally but NOT in California — one of only two states that taxes it. It adds back into California income (Schedule CA 540), so California taxes ${hsaAddBack} more than the federal return does.`,
    );
  }

  // ── Deduction, with the dependent floor ──
  const regular = year.standardDeduction[ctx.filingStatus === 'qss' ? 'mfj' : ctx.filingStatus];
  const standardDeduction =
    ctx.canBeClaimed === 'yes' ? Math.min(regular, Math.max(year.dependentStdFloor, 0)) : regular;
  const taxableIncome = Math.max(0, caAgi - standardDeduction);

  const brackets = year.brackets[ctx.filingStatus === 'qss' ? 'mfj' : ctx.filingStatus];
  const taxBeforeCredits = applyBrackets(taxableIncome, brackets);

  // ── The B3 promise, in dollars: California has no 0% window ──
  const taxWithoutGains = applyBrackets(
    Math.max(0, taxableIncome - Math.max(0, ctx.capitalGains)),
    brackets,
  );
  const taxOnCapitalGains = taxBeforeCredits - taxWithoutGains;
  if (taxOnCapitalGains > 0) {
    notes.push(
      `California taxes capital gains as ordinary income — there is no 0% window here. The gains in this year cost $${Math.round(taxOnCapitalGains)} of California tax no matter how long anything was held.`,
    );
  }

  // ── Exemption credit ──
  const agiLimit =
    year.exemptionCreditAgiLimit[ctx.filingStatus === 'qss' ? 'mfj' : ctx.filingStatus];
  let exemptionCredit = year.exemptionCredit;
  if (ctx.federalAgi > agiLimit) {
    exemptionCredit = 0;
    notes.push(
      `Federal AGI above $${agiLimit} phases the California exemption credit down; the worksheet that computes the reduced amount is a preparer step, so no credit is claimed here.`,
    );
  }
  const afterExemption = Math.max(0, taxBeforeCredits - exemptionCredit);

  // ── Renter's credit: the one that costs nothing but knowing ──
  const rentMonths = num('rent-months-california');
  const jointish =
    ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss' || ctx.filingStatus === 'hoh';
  const renterAgiLimit = jointish
    ? year.renterCredit.agiLimitJoint
    : year.renterCredit.agiLimitSingle;
  const renterAmount = jointish ? year.renterCredit.joint : year.renterCredit.single;
  let renterCredit: CaliforniaDetermination['renterCredit'] = { amount: 0, status: 'unknown' };
  if (rentMonths === null) {
    missing.push('rent-months-california');
    notes.push(
      `California pays renters a credit of $${renterAmount} for having paid rent at least ${year.renterCredit.monthsRequired} months of the year — no receipts, no schedule, one checkbox. Whether you rented isn't on file, and it is worth asking.`,
    );
  } else if (rentMonths < year.renterCredit.monthsRequired) {
    renterCredit = { amount: 0, status: 'not-enough-months' };
  } else if (caAgi > renterAgiLimit) {
    renterCredit = { amount: 0, status: 'income-too-high' };
    notes.push(
      `The renter's credit stops above $${renterAgiLimit} of California income; this year is over it.`,
    );
  } else if (ctx.canBeClaimed === 'yes') {
    renterCredit = { amount: 0, status: 'lived-with-someone-who-can-claim-you' };
    notes.push(
      "The renter's credit is closed to someone who lived with a person entitled to claim them as a dependent — the same household fact that limits the standard deduction.",
    );
  } else {
    renterCredit = { amount: Math.min(renterAmount, afterExemption), status: 'claimed' };
    notes.push(
      `California's renter's credit applies: $${renterAmount} for renting here at least ${year.renterCredit.monthsRequired} months. It is nonrefundable, so it only offsets tax actually owed.`,
    );
  }

  const taxAfterCredits = Math.max(0, afterExemption - renterCredit.amount);

  // ── CalEITC: eligibility computed, amount named ──
  // The credit itself comes from FTB's published EITC table rather than a
  // formula, so this determines whether it is available and reports the
  // year's maximum — it never invents a figure the table owns.
  const birth = ((): number | null => {
    if (!consumed.includes('birth-date')) consumed.push('birth-date');
    const s = factState(set, 'birth-date');
    return s.status === 'known' && s.value.kind === 'date'
      ? Number(s.value.value.slice(0, 4))
      : null;
  })();
  const age = birth === null ? null : taxYear - birth;
  const eitc = year.calEitc;
  let calEitc: CaliforniaDetermination['calEitc'];
  if (ctx.earnedIncome < 1) {
    calEitc = {
      eligible: false,
      maxCredit: 0,
      reason: 'CalEITC needs at least $1 of earned income.',
    };
  } else if (ctx.earnedIncome > eitc.maxEarnedIncome) {
    calEitc = {
      eligible: false,
      maxCredit: 0,
      reason: `Earned income above $${eitc.maxEarnedIncome} is over the CalEITC ceiling.`,
    };
  } else if (ctx.investmentIncome > eitc.investmentIncomeLimit) {
    calEitc = {
      eligible: false,
      maxCredit: 0,
      reason: `Investment income over $${eitc.investmentIncomeLimit} ends CalEITC outright — not reduced, ended. This year has $${Math.round(ctx.investmentIncome)}.`,
    };
    notes.push(calEitc.reason);
  } else if (ctx.canBeClaimed === 'yes') {
    calEitc = {
      eligible: false,
      maxCredit: 0,
      reason:
        'Someone who can be claimed as a dependent cannot take CalEITC without a qualifying child of their own.',
    };
  } else if (age === null) {
    missing.push('birth-date');
    calEitc = {
      eligible: 'unknown',
      maxCredit: eitc.maxCredit.none,
      reason: `CalEITC opens to childless workers at ${eitc.minAge} — a date of birth settles it, and it is worth up to $${eitc.maxCredit.none}.`,
    };
  } else if (age < eitc.minAge) {
    calEitc = {
      eligible: false,
      maxCredit: 0,
      reason: `CalEITC requires age ${eitc.minAge} or a qualifying child.`,
    };
  } else if (ctx.canBeClaimed === 'unknown') {
    calEitc = {
      eligible: 'unknown',
      maxCredit: eitc.maxCredit.none,
      reason:
        'CalEITC is closed to anyone who could be claimed as a dependent — whether that applies is unresolved.',
    };
  } else {
    calEitc = {
      eligible: true,
      maxCredit: eitc.maxCredit.none,
      reason: `Eligible for CalEITC — California pays childless workers from age ${eitc.minAge}, where the federal credit largely does not. Worth up to $${eitc.maxCredit.none}; the exact amount comes from FTB's EITC table at this income, and it is refundable.`,
    };
    notes.push(calEitc.reason);
  }

  return finish({
    status: 'computed',
    caAgi,
    hsaAddBack,
    standardDeduction,
    taxableIncome,
    taxBeforeCredits,
    exemptionCredit,
    renterCredit,
    calEitc,
    taxAfterCredits,
    taxOnCapitalGains,
    missingFacts: missing,
  });
}
