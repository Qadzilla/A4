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

import { FEDERAL_TAX_DATA } from '../tax-data';
import {
  type TaxEstimatorData,
  computeTaxEstimate,
  createDefaultTaxEstimatorData,
} from '../tax-estimator';
import {
  type CapitalGainsDetermination,
  type CapitalGainsTrade,
  determineCapitalGains,
} from './capital-gains';
import { type DependencyDetermination, determineDependency } from './dependency';
import { type DualStatusBrief, determineDualStatusBrief } from './dual-status';
import { type EducationDetermination, determineEducation } from './education';
import { type FactAssertion, type FactId, factSet, factState, makeAssertion } from './facts';
import { type FilingStatusDetermination, determineFilingStatus } from './filing-status';
import { type NonresidentDetermination, determineNonresidentReturn } from './nonresident';
import { type PenaltyDetermination, determinePenalty } from './penalty';
import { type PtcDetermination, type PtcMonth, determinePtc } from './ptc';
import { type ResidencyDetermination, determineResidency } from './residency';
import { type SaversCreditDetermination, determineSaversCredit } from './savers-credit';
import { type SelfEmploymentDetermination, determineSelfEmployment } from './self-employment';
import { type CaliforniaDetermination, determineCalifornia } from './states/california';
import { type TipsOvertimeDetermination, determineTipsOvertime } from './tips-overtime';
import { type TreatyDetermination, determineTreatyBenefits } from './treaties';
import { filingYearData } from './year-data';

/** Things a branch could not compute, named. The fork reports these. */
export type BlockedItem =
  | 'filing-status-election' // joint-or-separate not chosen — no single liability
  | 'form-8615' // kiddie tax applies and Basis doesn't compute it
  | 'form-8962' // marketplace coverage with no 1095-A months to reconcile — the refund freezes
  | 'sch-c' // a claimed expense outside the simple set — computing around it would overstate
  | 'form-1040nr' // nonresident year holding income E1 refuses to classify (or a §6013 election)
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
  /** Form 8962 — null when there is no marketplace coverage in play. */
  ptc: PtcDetermination | null;
  /** Schedule C/SE — null when the year has no self-employment income. */
  se: SelfEmploymentDetermination | null;
  /** Form 8949/Sch D — null when no trades or crypto disposals exist. */
  capitalGains: CapitalGainsDetermination | null;
  /** Sch 1-A + Form 4137 — null when no tip or overtime money exists. */
  tipsOvertime: TipsOvertimeDetermination | null;
  /** Form 1040-NR (E1) — present exactly on nonresident years. */
  nonresident: NonresidentDetermination | null;
  /** Treaty benefits (E3) — null when no citizenship/visa facts put one in play. */
  treaties: TreatyDetermination | null;
  /** The E5 brief — present exactly when the year straddles residency. */
  dualStatus: DualStatusBrief | null;
  /** The state return (F-phase) — null when the state isn't modelled yet. */
  state: CaliforniaDetermination | null;
  /** Null when a blocked item prevents a single number. */
  liability: {
    /** Income tax including the LTCG worksheet — the 1040's tax line. */
    incomeTax: number;
    /** Income tax plus NIIT plus self-employment tax (Schedule 2). */
    federalTax: number;
    totalTax: number;
    agi: number;
    deduction: number;
    taxableIncome: number;
    ltcgZeroBracketRoom: number;
    /** What documents say was already paid in — W-2 box 2, 1099-R box 4. */
    federalWithheld: number;
    /** Schedule SE's tax — the 15.3% no one withheld. */
    selfEmploymentTax: number;
    /** Sch 1-A: the tips + overtime deduction actually applied (TY2025–28). */
    tipsOvertimeDeduction: number;
    /** Form 4137: employee FICA on tips the employer never saw. */
    form4137Tax: number;
    /** The 10% additional tax on early retirement money (Form 5329). */
    earlyWithdrawalPenalty: number;
    /** The elected education credit actually applied (nonrefundable + refundable). */
    educationCredit: number;
    /** The saver's credit applied — mechanical, no election, stacks after education. */
    saversCredit: number;
    /** Excess advance premium credit owed back (Schedule 2). */
    ptcRepayment: number;
    /** Premium credit beyond what was advanced — refundable. */
    ptcAdditionalCredit: number;
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

export interface EvaluationExtras {
  /**
   * The 1095-A's monthly table, from the stored form (C4) — tables aren't
   * facts, so the caller that can see the database hands them in. Absent
   * while the marketplace fact is true blocks on the 8962 by name.
   */
  ptcMonths?: PtcMonth[];
  /**
   * The trade ledger (C3 documents + SnapTrade sync + manual), same rule:
   * trades aren't facts. When present, the lot engine's totals become
   * rule-sourced gain facts that supersede any person estimate.
   */
  trades?: CapitalGainsTrade[];
}

export function evaluateYear(
  assertions: FactAssertion[],
  taxYear: number,
  extras?: EvaluationExtras,
): YearEvaluation {
  const set = factSet(assertions, taxYear);
  const blocked: BlockedItem[] = [];
  const notes: string[] = [];

  // The trade ledger, when the caller hands it in, becomes the year's
  // gains through the lot engine — and the totals come back as rule-
  // sourced facts that supersede any person estimate (Doctrines 5 and 8).
  // Crypto disposals ride the same determination from facts alone: the
  // no-form path needs no ledger.
  const cgDetermination = determineCapitalGains(assertions, extras?.trades ?? [], taxYear);
  const capitalGains = cgDetermination.status === 'none' ? null : cgDetermination;
  // Gains are read through the computed set so the estimator, the kiddie
  // guard and every fork price the ledger's number, not the estimate.
  const gainsSet =
    capitalGains !== null ? factSet([...assertions, ...capitalGains.facts], taxYear) : set;

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
  const longGains = num(factState(gainsSet, 'realized-long-gains'));
  const shortGains = num(factState(gainsSet, 'realized-short-gains'));
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
    // E1: the 1040-NR computes. The module decides what the return can
    // hold (ECI wages and scholarship, exempt interest, the state-tax
    // itemization) and names everything it refuses — and a computed
    // trade ledger or crypto disposal is exactly the classification it
    // refuses, so those years stay blocked with the reason visible.
    const nonresident = determineNonresidentReturn(augmented, taxYear);
    notes.push(...(nonresident.explanation.notes ?? []));
    // E3: the treaty benefits, applied by citation — India's standard
    // deduction and China's $5,000 exemption. Uncoded student articles
    // surface as teaching notes, never as silent omissions.
    const treatyDet = determineTreatyBenefits(augmented, taxYear);
    const treaties =
      treatyDet.benefits.length > 0 ||
      treatyDet.refusals.length > 0 ||
      (treatyDet.explanation.notes ?? []).length > 0
        ? treatyDet
        : null;
    if (treaties !== null) {
      notes.push(...(treaties.explanation.notes ?? []));
      notes.push(...treaties.refusals);
    }
    if (nonresident.status === 'refused' || capitalGains !== null || year === null) {
      if (capitalGains !== null) {
        notes.push(
          'Investment sales or crypto disposals on a nonresident year: capital-gains classification for a nonresident turns on presence days and source rules E1 does not attempt — a preparer question, named rather than mis-computed.',
        );
      }
      blocked.push('form-1040nr');
      notes.push(...nonresident.refusals);
      return {
        residency,
        dependency,
        filingStatus,
        liability: null,
        penalty: null,
        education: null,
        savers: null,
        ptc: null,
        se: null,
        capitalGains,
        tipsOvertime: null,
        nonresident,
        treaties,
        dualStatus: null,
        state: null,
        blocked,
        notes,
      };
    }

    // China Article 20: up to $5,000 of the wage/scholarship ECI comes
    // out before anything is taxed — wages first, then scholarship.
    let nrWages = nonresident.eci.wages;
    let nrScholarship = nonresident.eci.taxableScholarship;
    const chinaExemption = treaties?.benefits.find((b) => b.kind === 'wage-scholarship-exemption');
    if (chinaExemption && chinaExemption.amount !== null) {
      const fromWages = Math.min(chinaExemption.amount, nrWages);
      const fromScholarship = Math.min(chinaExemption.amount - fromWages, nrScholarship);
      nrWages -= fromWages;
      nrScholarship -= fromScholarship;
      notes.push(
        `$${fromWages + fromScholarship} of income is exempt under the China treaty (Article ${chinaExemption.article}) and never enters the taxable total.`,
      );
    }

    // India Article 21(2): the standard deduction returns — used when it
    // beats the state-tax itemization, which at a student income it
    // essentially always does. The choice is arithmetic, not an election.
    const indiaStd = treaties?.benefits.find((b) => b.kind === 'standard-deduction');
    const stdAmount = indiaStd
      ? (FEDERAL_TAX_DATA[taxYear]?.standardDeduction[nonresident.filingStatus] ?? 0)
      : 0;
    const useStandard = indiaStd !== undefined && stdAmount > nonresident.itemizedStateTax;
    if (useStandard) {
      notes.push(
        `The standard deduction ($${stdAmount}) applies under India Article 21(2) — larger than the $${nonresident.itemizedStateTax} of state tax that would otherwise itemize, and most nonresidents get neither.`,
      );
    }

    // The return that remains, through the same estimator: ECI at the
    // graduated rates (single or MFS column), the state tax itemized —
    // or India's standard deduction — and otherwise NO deduction at
    // all: taxed from the first dollar. Exempt §871(i) interest never
    // enters income.
    const nrData: TaxEstimatorData = {
      ...createDefaultTaxEstimatorData(),
      taxYear,
      filingStatus: nonresident.filingStatus,
      w2Wages: nrWages,
      otherIncome: nrScholarship,
      deductionType: useStandard ? 'standard' : 'itemized',
      saltDeduction: useStandard ? 0 : nonresident.itemizedStateTax,
      federalWithheld: nonresident.federalWithheld,
    };
    const nrResult = computeTaxEstimate(nrData);
    const nrTax = nrResult.federalTax + nrResult.ltcgTax;
    return {
      residency,
      dependency,
      filingStatus,
      penalty: null,
      education: null,
      savers: null,
      ptc: null,
      se: null,
      capitalGains,
      tipsOvertime: null,
      nonresident,
      treaties,
      dualStatus: null,
      state: null,
      liability: {
        incomeTax: nrTax,
        // No NIIT (NRAs are outside §1411), no SE tax, no Schedule 2
        // riders — and employee FICA is NOT a return line here: for the
        // exempt-visa students this path serves it should never have
        // been withheld at all, which is E4's refund, not this total.
        federalTax: nrTax,
        totalTax: nrTax,
        agi: nrResult.agi,
        deduction: nrResult.deduction,
        taxableIncome: nrResult.taxableIncome,
        // The 0% long-term window is resident planning; nonresident
        // gains follow different rules entirely, so no room is claimed.
        ltcgZeroBracketRoom: 0,
        federalWithheld: nonresident.federalWithheld,
        selfEmploymentTax: 0,
        tipsOvertimeDeduction: 0,
        form4137Tax: 0,
        earlyWithdrawalPenalty: 0,
        educationCredit: 0,
        saversCredit: 0,
        ptcRepayment: 0,
        ptcAdditionalCredit: 0,
        refundOrOwed: nrTax - nonresident.federalWithheld,
      },
      blocked,
      notes,
    };
  }
  if (residency.status === 'dual-status') {
    // E5: the best refusal in the product — no dual-status return is
    // computed (the fence), but the brief organises everything already
    // known so the preparer meeting is twenty minutes, not two hours.
    const dualStatus = determineDualStatusBrief(assertions, taxYear);
    blocked.push('dual-status-year');
    notes.push(
      'An arrival or departure year splits into resident and nonresident windows — genuinely specialist work. No single liability exists; the dual-status brief carries everything already known.',
    );
    if (dualStatus !== null) {
      notes.push(...(dualStatus.explanation.notes ?? []));
    }
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      ptc: null,
      se: null,
      capitalGains,
      tipsOvertime: null,
      nonresident: null,
      treaties: null,
      dualStatus,
      state: null,
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
      ptc: null,
      se: null,
      capitalGains,
      tipsOvertime: null,
      nonresident: null,
      treaties: null,
      dualStatus: null,
      state: null,
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
      ptc: null,
      se: null,
      capitalGains,
      tipsOvertime: null,
      nonresident: null,
      treaties: null,
      dualStatus: null,
      state: null,
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
      ptc: null,
      se: null,
      capitalGains,
      tipsOvertime: null,
      nonresident: null,
      treaties: null,
      dualStatus: null,
      state: null,
      blocked,
      notes,
    };
  }

  // Schedule C/SE runs before the estimator: its net profit is an input.
  // A refusal poisons the whole liability — every downstream number (AGI,
  // the phaseouts, the credits) sits on top of a Schedule C that couldn't
  // be computed honestly, so nothing is shown rather than something wrong.
  const seDetermination = determineSelfEmployment(augmented, taxYear, wages ?? 0);
  const se = seDetermination.status === 'none' ? null : seDetermination;
  if (se !== null && se.status === 'refused') {
    blocked.push('sch-c');
    notes.push(...se.refusals);
    return {
      residency,
      dependency,
      filingStatus,
      liability: null,
      penalty: null,
      education: null,
      savers: null,
      ptc: null,
      se,
      capitalGains,
      tipsOvertime: null,
      nonresident: null,
      treaties: null,
      dualStatus: null,
      state: null,
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
    // Unreported tips ride along too: they were never in W-2 box 1, and
    // they are taxable income in EVERY year — the 4137 (their FICA) and
    // the Sch 1-A deduction (their income-tax relief, 2025–28 only) both
    // hang off the same fact downstream.
    otherIncome:
      (taxableScholarship ?? 0) +
      (num(factState(set, 'scholarship-included-in-income')) ?? 0) +
      (unemployment ?? 0) +
      (gambling ?? 0) +
      (retirementTaxable ?? retirementGross ?? 0) +
      (num(factState(set, 'unreported-tips')) ?? 0) +
      (bool(factState(set, 'itemized-prior-year')) === true ? (stateRefund ?? 0) : 0),
    federalWithheld: (w2Withheld ?? 0) + (retirementWithheld ?? 0),
  };

  // The Schedule C profit joins the income. At or above the $400 floor of
  // net earnings it rides selfEmploymentIncome, where the estimator's SE
  // arithmetic (the 0.9235 factor, the wage-base offset, the half
  // deduction) matches the module's to the dollar. Under the floor it
  // rides otherIncome instead — still income tax, lawfully no SE tax,
  // which the estimator's unconditional SE math can't express.
  if (se !== null && se.status === 'computed') {
    if (se.seTaxApplies) {
      data.selfEmploymentIncome = se.netProfit;
    } else {
      data.otherIncome += se.netProfit;
    }
    notes.push(...(se.explanation.notes ?? []));
  }

  // The 8949's own findings ride along: uncovered units, wash sales, a
  // superseded estimate, the crypto defaults — all named, none silent.
  if (capitalGains !== null) {
    notes.push(...(capitalGains.explanation.notes ?? []));
  }

  // E3's survival case: China's Article 20 is carved out of the saving
  // clause, so the $5,000 exemption follows the student ACROSS the
  // residency flip — the year-six F-1 keeps it on a plain 1040. Only a
  // substantial-presence resident qualifies here: a green card changes
  // the analysis, and a citizen never takes treaty benefits.
  const residentTreatyDet = determineTreatyBenefits(augmented, taxYear);
  const treatySurvivor =
    residency.status === 'resident' && residency.rule === 'substantial-presence'
      ? residentTreatyDet.benefits.find((b) => b.survivesResidency && b.amount !== null)
      : undefined;
  const treaties = treatySurvivor !== undefined ? residentTreatyDet : null;
  if (treatySurvivor?.amount) {
    const exempt = Math.min(treatySurvivor.amount, wages ?? 0);
    if (exempt > 0) {
      // Rides otherIncome as a negative so the wage input (and the FICA
      // arithmetic that keys off it) stays as printed.
      data.otherIncome -= exempt;
      notes.push(
        `$${exempt} of wages stays exempt under the China treaty (Article ${treatySurvivor.article}) even as a RESIDENT — this benefit survives the residency flip, which almost nothing else does.`,
      );
    }
  }

  if (
    wages === null &&
    longGains === null &&
    shortGains === null &&
    interest === null &&
    ordinaryDiv === null &&
    taxableScholarship === null &&
    unemployment === null &&
    gambling === null &&
    retirementGross === null &&
    se === null
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

  let result = computeTaxEstimate(data);

  // Sch 1-A + Form 4137, computed on the final AGI (the deduction is
  // BELOW the line — it reduces taxable income only, so no MAGI-based
  // phaseout above moves, and no circularity exists). When it applies,
  // the estimator re-runs with the deduction stacked on the standard
  // deduction, and every credit below bounds against the reduced tax.
  const tipsOtDet = determineTipsOvertime(augmented, taxYear, {
    magi: result.agi,
    filingStatus: filingStatus.status,
    seNetProfit: se !== null && se.status === 'computed' ? se.netProfit : 0,
    w2Wages: wages ?? 0,
  });
  const tipsOvertime =
    tipsOtDet.status === 'none' && tipsOtDet.form4137 === null ? null : tipsOtDet;
  if (tipsOvertime !== null) {
    notes.push(...(tipsOvertime.explanation.notes ?? []));
    notes.push(...tipsOvertime.refusals);
    if (tipsOvertime.totalDeduction > 0) {
      data.belowLineDeductions = tipsOvertime.totalDeduction;
      result = computeTaxEstimate(data);
    }
  }
  const form4137Tax = tipsOvertime?.form4137?.ficaOwed ?? 0;

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

  // The 8962: marketplace coverage must reconcile before any refund moves.
  // Months come from the stored 1095-A (they aren't facts); coverage with
  // no months is the freeze, named.
  const marketplace = ((): boolean => {
    const state = factState(set, 'marketplace-health-insurance');
    return state.status === 'known' && state.value.kind === 'bool' && state.value.value;
  })();
  let ptc: PtcDetermination | null = null;
  let ptcRepayment = 0;
  let ptcAdditionalCredit = 0;
  if (extras?.ptcMonths !== undefined && extras.ptcMonths.length > 0) {
    ptc = determinePtc(augmented, extras.ptcMonths, {
      householdMagi: result.agi,
      filingStatus: filingStatus.status,
      taxYear,
    });
    if (ptc.status === 'reconciled') {
      ptcRepayment = ptc.repayment;
      ptcAdditionalCredit = ptc.additionalCredit;
      notes.push(...(ptc.explanation.notes ?? []));
    } else if (ptc.status !== 'not-applicable') {
      blocked.push('form-8962');
      notes.push(
        ...(ptc.refusals.length > 0
          ? ptc.refusals
          : ['The 8962 could not be completed — the refund stays frozen until it is.']),
      );
    }
  } else if (marketplace) {
    blocked.push('form-8962');
    notes.push(
      'Marketplace coverage without the 1095-A reconciled: filing without Form 8962 freezes the entire refund — not the difference, all of it.',
    );
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

  // F1: the state return, an independent rule set over the same facts —
  // never a percentage of the federal bill. California recomputes from
  // federal AGI through its own conformity set, brackets and credits, and
  // reports separately: state tax is not added into the federal totals.
  const californiaDet = determineCalifornia(augmented, taxYear, {
    federalAgi: result.agi,
    filingStatus: filingStatus.status,
    canBeClaimed: dependency.canBeClaimed,
    residencyStatus: residency.status,
    earnedIncome: (wages ?? 0) + (se !== null && se.status === 'computed' ? se.netProfit : 0),
    // CalEITC's Worksheet 1 counts interest, the full ordinary-dividend
    // box, and net capital gain — not the qualified subset separately.
    investmentIncome:
      (interest ?? 0) + (ordinaryDiv ?? 0) + Math.max(0, (longGains ?? 0) + (shortGains ?? 0)),
    // The no-preference finding measures what the federal side treated
    // preferentially: long-term gains plus qualified dividends.
    capitalGains: data.capitalGainsLong,
  });
  const state = californiaDet.status === 'not-applicable' ? null : californiaDet;
  if (state !== null) {
    notes.push(...(state.explanation.notes ?? []));
    notes.push(...state.refusals);
  }

  return {
    residency,
    dependency,
    filingStatus,
    penalty: penalty.applicable || penalty.refusals.length > 0 ? penalty : null,
    education,
    savers,
    ptc,
    se,
    capitalGains,
    tipsOvertime,
    nonresident: null,
    treaties,
    dualStatus: null,
    state,
    liability: {
      incomeTax: result.federalTax + result.ltcgTax,
      federalTax:
        result.federalTax +
        result.ltcgTax +
        result.niit +
        result.selfEmploymentTax +
        additionalTax +
        form4137Tax +
        ptcRepayment -
        appliedNonRefundable -
        appliedSavers,
      totalTax:
        result.totalTax +
        additionalTax +
        form4137Tax +
        ptcRepayment -
        appliedNonRefundable -
        appliedSavers,
      agi: result.agi,
      deduction: result.deduction,
      taxableIncome: result.taxableIncome,
      ltcgZeroBracketRoom: result.ltcgZeroBracketRoom,
      federalWithheld: data.federalWithheld,
      selfEmploymentTax: result.selfEmploymentTax,
      tipsOvertimeDeduction: tipsOvertime?.totalDeduction ?? 0,
      form4137Tax,
      earlyWithdrawalPenalty: additionalTax,
      educationCredit,
      saversCredit: appliedSavers,
      ptcRepayment,
      ptcAdditionalCredit,
      refundOrOwed:
        result.federalTax +
        result.ltcgTax +
        result.niit +
        result.selfEmploymentTax +
        additionalTax +
        form4137Tax +
        ptcRepayment -
        ptcAdditionalCredit -
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
