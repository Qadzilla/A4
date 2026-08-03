// ─── A4 · The year, evaluated ──────────────────────────────────────
// One pass over the facts: run the determinations, map what income facts
// exist through the existing estimator, and report what could not be
// computed — so a fork can compare two hypothetical years honestly.
//
// The liability here is an estimate over known facts and says so. What
// matters for pricing a fork is consistency: both branches run through this
// same pass, so the difference between them is attributable to the forked
// fact and nothing else.
//
// Dependent standard deduction: the estimator has no dependent concept, so
// the limitation — greater of the floor or earned income plus the add-on,
// capped at the regular amount (Topic 551, figures in year-data) — is fed
// through the itemized path, which sums its inputs verbatim.

import {
  type TaxEstimatorData,
  computeTaxEstimate,
  createDefaultTaxEstimatorData,
} from '../tax-estimator';
import { type DependencyDetermination, determineDependency } from './dependency';
import { type EducationDetermination, determineEducation } from './education';
import { type FactAssertion, type FactId, factSet, factState, makeAssertion } from './facts';
import { type FilingStatusDetermination, determineFilingStatus } from './filing-status';
import { type PenaltyDetermination, determinePenalty } from './penalty';
import { type ResidencyDetermination, determineResidency } from './residency';
import { type SaversCreditDetermination, determineSaversCredit } from './savers-credit';
import { filingYearData } from './year-data';

/** Things a branch could not compute, named. The fork reports these. */
export type BlockedItem =
  | 'filing-status-election' // joint-or-separate not chosen — no single liability
  | 'form-8615' // kiddie tax applies and Basis doesn't compute it
  | 'form-1040nr' // nonresident year — a different return, not computable until E1
  | 'dual-status-year' // arrival/departure year — specialist return, E5's brief
  | 'residency-unknown' // the root fork unanswered — resident rates would be a default in disguise
  | 'year-data'; // the year's figures aren't loaded

export interface YearEvaluation {
  residency: ResidencyDetermination;
  dependency: DependencyDetermination;
  filingStatus: FilingStatusDetermination;
  /** Form 5329 — computed whenever early retirement money exists. */
  penalty: PenaltyDetermination | null;
  /** Form 8863 + student-loan interest — null on the blocked paths. */
  education: EducationDetermination | null;
  /** Form 8880 — the saver's credit, through its final year (TY2026). */
  savers: SaversCreditDetermination | null;
  /** Null when a blocked item prevents a single number. */
  liability: {
    /** Income tax including the LTCG worksheet — the 1040's tax line. */
    incomeTax: number;
    /** Income tax plus NIIT — with SE tax to join when D4 lands. */
    federalTax: number;
    totalTax: number;
    agi: number;
    deduction: number;
    taxableIncome: number;
    ltcgZeroBracketRoom: number;
    /** What documents say was already paid in — W-2 box 2, 1099-R box 4. */
    federalWithheld: number;
    /** The 10% additional tax on early retirement money (Form 5329). */
    earlyWithdrawalPenalty: number;
    /** The elected education credit actually applied (nonrefundable + refundable). */
    educationCredit: number;
    /** The saver's credit applied — mechanical, no election, stacks after education. */
    saversCredit: number;
    /** Negative: refund. Positive: still owed. The P6 shortfall lives here. */
    refundOrOwed: number;
  } | null;
  blocked: BlockedItem[];
  notes: string[];
}

const num = (state: ReturnType<typeof factState>): number | null =>
  state.status === 'known' && state.value.kind === 'number' ? state.value.value : null;
const bool = (state: ReturnType<typeof factState>): boolean | null =>
  state.status === 'known' && state.value.kind === 'bool' ? state.value.value : null;

export function evaluateYear(assertions: FactAssertion[], taxYear: number): YearEvaluation {
  const set = factSet(assertions, taxYear);
  const blocked: BlockedItem[] = [];
  const notes: string[] = [];

  // The root fork runs first — it selects the rule set everything else
  // belongs to. Its determination is asserted back as a rule-sourced fact so
  // downstream rules (dependency's citizen-or-resident test) consume it the
  // same way they would any fact, and the provenance chain stays walkable.
  const residency = determineResidency(assertions, taxYear);
  const augmented =
    residency.status === 'unknown'
      ? assertions
      : [
          ...assertions,
          makeAssertion({
            assertionId: `eval:residency:${taxYear}`,
            factId: 'residency-status',
            taxYear,
            value: { kind: 'string', value: residency.status },
            source: {
              kind: 'rule',
              ruleId: residency.explanation.ruleId,
              consumed: residency.consumed,
            },
            assertedAt: '9999-12-30T00:00:00Z',
            supersedes: null,
          } as Parameters<typeof makeAssertion>[0]),
        ];

  const dependency = determineDependency(augmented, taxYear);
  const filingStatus = determineFilingStatus(augmented, taxYear);

  const wages = num(factState(set, 'w2-wages'));
  const longGains = num(factState(set, 'realized-long-gains'));
  const shortGains = num(factState(set, 'realized-short-gains'));
  const interest = num(factState(set, 'interest-income'));
  const ordinaryDiv = num(factState(set, 'dividends-ordinary'));
  const qualifiedDiv = num(factState(set, 'dividends-qualified'));
  const taxableScholarship = num(factState(set, 'taxable-scholarship-income'));
  const unemployment = num(factState(set, 'unemployment-income'));
  const gambling = num(factState(set, 'gambling-winnings'));
  const retirementTaxable = num(factState(set, 'retirement-distribution-taxable'));
  const retirementGross = num(factState(set, 'retirement-distribution'));
  const stateRefund = num(factState(set, 'state-refund-received'));
  const w2Withheld = num(factState(set, 'w2-federal-withheld'));
  const retirementWithheld = num(factState(set, 'retirement-federal-withheld'));

  const year = filingYearData(taxYear);
  if (year === null) {
    blocked.push('year-data');
    notes.push(`Figures for ${taxYear} aren't loaded — no liability is computed for it.`);
  }

  // The kiddie tax: exposure plus unearned income over the threshold means
  // Form 8615 — the parents' rate — which Basis names and does not compute.
  if (dependency.consequences.kiddieTaxExposed && year) {
    // Unearned income for Form 8615 is investment income of every term —
    // short-term gains are just as unearned as long.
    const unearned = (longGains ?? 0) + (shortGains ?? 0);
    if (year.kiddieUnearnedThreshold === undefined) {
      if (unearned > 0) {
        blocked.push('form-8615');
        notes.push(
          `The kiddie-tax threshold for ${taxYear} isn't loaded — Form 8615 exposure can't be bounded, so the liability below stops at the person's own rates.`,
        );
      }
    } else if (unearned > year.kiddieUnearnedThreshold) {
      blocked.push('form-8615');
      notes.push(
        `Unearned income above $${year.kiddieUnearnedThreshold} is taxed at the parents' rate (Form 8615), which Basis doesn't compute — the liability below stops at the person's own rates and understates the true bill.`,
      );
    }
  }

  // The root fork gates everything: a nonresident files a different return,
  // a dual-status year is specialist work, and an unanswered residency
  // question can't quietly default to resident rates (Doctrine 7 and A2's
  // fence, respectively).
  if (residency.status === 'nonresident') {
    blocked.push('form-1040nr');
    notes.push(
      'Nonresident for tax purposes: the return is Form 1040-NR, which Basis computes at E1 — resident rates would be the wrong arithmetic, so no liability is shown.',
    );
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      blocked,
      notes,
    };
  }
  if (residency.status === 'dual-status') {
    blocked.push('dual-status-year');
    notes.push(
      'An arrival or departure year splits into resident and nonresident windows — genuinely specialist work, briefed at E5. No single liability exists.',
    );
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      blocked,
      notes,
    };
  }
  if (residency.status === 'unknown') {
    blocked.push('residency-unknown');
    notes.push(
      'Residency for tax purposes is unresolved — computing at resident rates would be a default in disguise. Citizenship or visa facts settle it.',
    );
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      blocked,
      notes,
    };
  }

  // No single liability without a filing status: joint-or-separate is an
  // election, and averaging two returns would be a fabrication.
  if (filingStatus.status === 'unknown') {
    blocked.push('filing-status-election');
    notes.push('No filing status is settled, so there is no single liability to report.');
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      blocked,
      notes,
    };
  }

  if (year === null) {
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      blocked,
      notes,
    };
  }

  const data: TaxEstimatorData = {
    ...createDefaultTaxEstimatorData(),
    taxYear,
    // The estimator predates qss; surviving spouse uses the joint rates,
    // which is exactly what the status exists to provide.
    filingStatus: filingStatus.status === 'qss' ? 'mfj' : filingStatus.status,
    w2Wages: wages ?? 0,
    // Qualified dividends ride the capital-gains brackets (the estimator's
    // capitalGainsLong is documented as LTCG + qualified dividends); the
    // rest of box 1a is ordinary investment income. As printed, never
    // clamped — a broker reporting qualified above ordinary produces a
    // negative ordinary remainder here, which is the broker's error made
    // visible rather than laundered.
    capitalGainsLong: (longGains ?? 0) + (qualifiedDiv ?? 0),
    capitalGainsShort: shortGains ?? 0,
    investmentIncome: (interest ?? 0) + (ordinaryDiv ?? 0) - (qualifiedDiv ?? 0),
    // Scholarship above tuition is income (Pub 970). It rides otherIncome
    // here; its earned-vs-unearned character (earned for the dependent
    // standard deduction, not for the kiddie tax) is D-phase's refinement.
    //
    // C5's streams ride along: unemployment is taxable in full; winnings
    // are taxable even in a losing year (losses only net by itemizing —
    // D-phase's asymmetry, never applied silently here); a retirement
    // distribution uses the printed taxable amount when the form gave one,
    // else the gross of its non-rollover part — basis in a first-job 401(k)
    // is almost always zero, and gross-over-taxable errs toward honesty
    // until D6 refines. Rollovers are already excluded at the fact layer.
    //
    // And the state-refund gate: a refund is income only if last year was
    // itemized. Unknown defaults to NOT taxable — the audience's reality —
    // and because the gate reads the fact here, forking
    // itemized-prior-year prices exactly what finding out is worth.
    otherIncome:
      (taxableScholarship ?? 0) +
      (num(factState(set, 'scholarship-included-in-income')) ?? 0) +
      (unemployment ?? 0) +
      (gambling ?? 0) +
      (retirementTaxable ?? retirementGross ?? 0) +
      (bool(factState(set, 'itemized-prior-year')) === true ? (stateRefund ?? 0) : 0),
    federalWithheld: (w2Withheld ?? 0) + (retirementWithheld ?? 0),
  };

  if (
    wages === null &&
    longGains === null &&
    shortGains === null &&
    interest === null &&
    ordinaryDiv === null &&
    taxableScholarship === null &&
    unemployment === null &&
    gambling === null &&
    retirementGross === null
  ) {
    notes.push('No income facts yet — the liability is a floor, not an estimate.');
  }

  // A claimable dependent's standard deduction is limited; route the exact
  // limited amount through the itemized path (a verbatim sum).
  if (dependency.canBeClaimed === 'yes') {
    const earned = wages ?? 0;
    const regular = computeTaxEstimate(data).deduction;
    const limited = Math.min(
      regular,
      Math.max(year.dependentStdFloor, earned + year.dependentStdAddon),
    );
    if (limited < regular) {
      data.deductionType = 'itemized';
      data.saltDeduction = 0;
      data.mortgageInterest = 0;
      data.charitableGiving = 0;
      data.otherItemized = limited;
      notes.push(
        `Standard deduction limited to $${limited} — a claimable dependent gets the greater of $${year.dependentStdFloor} or earned income plus $${year.dependentStdAddon}.`,
      );
    }
  }

  // First pass: MAGI for the education phaseouts is AGI before the
  // student-loan deduction (the deduction can't phase itself out).
  const firstPass = computeTaxEstimate(data);
  const education = determineEducation(augmented, taxYear, {
    magi: firstPass.agi,
    filingStatus: filingStatus.status,
    dependency,
  });
  if (education.studentLoanInterest.allowed > 0) {
    data.studentLoanInterest = education.studentLoanInterest.allowed;
    notes.push(
      `$${education.studentLoanInterest.allowed} of student-loan interest deducts above the line — no itemizing needed.`,
    );
  }

  const result = computeTaxEstimate(data);

  // The elected education credit, applied only when elected: the engine
  // prices both credits and never picks (the standing rule) — an unmade
  // election leaves the liability honest about what's on the table.
  const chosen =
    education.elected === 'aotc'
      ? education.aotc
      : education.elected === 'llc'
        ? education.llc
        : null;
  const preCreditTax = result.federalTax + result.ltcgTax;
  const appliedNonRefundable =
    chosen !== null && chosen.status === 'available'
      ? Math.min(chosen.nonRefundable, preCreditTax)
      : 0;
  const appliedRefundable =
    chosen !== null && chosen.status === 'available' ? chosen.refundable : 0;
  const educationCredit = appliedNonRefundable + appliedRefundable;
  if (educationCredit > 0) {
    notes.push(
      `The elected ${education.elected === 'aotc' ? 'American Opportunity' : 'Lifetime Learning'} credit applies: $${appliedNonRefundable} against tax${appliedRefundable > 0 ? ` plus $${appliedRefundable} refundable — money back even at zero tax` : ''}.`,
    );
  } else {
    const best = Math.max(
      education.aotc.status === 'available' ? education.aotc.amount : 0,
      education.llc.status === 'available' ? education.llc.amount : 0,
    );
    if (best > 0) {
      notes.push(
        `Up to $${best} of education credit is available and NOT applied — which credit to take is an election, and it hasn't been made. Both are priced in the education determination.`,
      );
    }
  }

  // The saver's credit is mechanical — no election exists, it stacks with
  // whatever education credit applied, bounded by the tax that remains.
  const savers = determineSaversCredit(augmented, taxYear, {
    agi: result.agi,
    filingStatus: filingStatus.status,
    dependency,
  });
  const appliedSavers =
    savers.status === 'available'
      ? Math.min(savers.amount, Math.max(0, preCreditTax - appliedNonRefundable))
      : 0;
  if (appliedSavers > 0) {
    notes.push(
      `The saver's credit applies: $${appliedSavers} for retirement contributions already made${taxYear === 2026 ? " — the credit's final year before the Saver's Match replaces it" : ''}.`,
    );
  }
  if (savers.iraOption !== null) {
    notes.push(savers.iraOption.note);
  }

  // The 5329: 10% on the early money, gross of exceptions (they are options
  // with prices, never assumptions — the module's standing rule). This is
  // what flips P6 from a small paper refund to owing.
  const penalty = determinePenalty(augmented, taxYear, result.agi);
  const additionalTax = penalty.applicable ? penalty.penalty : 0;
  if (penalty.applicable) {
    notes.push(
      `Early retirement money carries a 10% additional tax of $${penalty.penalty} on top of the income tax — the withholding that felt like settlement usually doesn't cover it. Exceptions exist and are priced separately.`,
    );
  }

  return {
    residency,
    dependency,
    filingStatus,
    penalty: penalty.applicable || penalty.refusals.length > 0 ? penalty : null,
    education,
    savers,
    liability: {
      incomeTax: result.federalTax + result.ltcgTax,
      federalTax:
        result.federalTax +
        result.ltcgTax +
        result.niit +
        additionalTax -
        appliedNonRefundable -
        appliedSavers,
      totalTax: result.totalTax + additionalTax - appliedNonRefundable - appliedSavers,
      agi: result.agi,
      deduction: result.deduction,
      taxableIncome: result.taxableIncome,
      ltcgZeroBracketRoom: result.ltcgZeroBracketRoom,
      federalWithheld: data.federalWithheld,
      earlyWithdrawalPenalty: additionalTax,
      educationCredit,
      saversCredit: appliedSavers,
      refundOrOwed:
        result.federalTax +
        result.ltcgTax +
        result.niit +
        additionalTax -
        appliedNonRefundable -
        appliedRefundable -
        appliedSavers -
        data.federalWithheld,
    },
    blocked,
    notes,
  };
}

/** The facts evaluation reads — the fork's search space, kept in one place. */
export const EVALUATION_CONSUMES: FactId[] = [
  'w2-wages',
  'realized-long-gains',
  'realized-short-gains',
];
