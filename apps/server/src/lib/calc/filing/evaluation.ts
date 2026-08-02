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
import { type FactAssertion, type FactId, factSet, factState } from './facts';
import { type FilingStatusDetermination, determineFilingStatus } from './filing-status';
import { filingYearData } from './year-data';

/** Things a branch could not compute, named. The fork reports these. */
export type BlockedItem =
  | 'filing-status-election' // joint-or-separate not chosen — no single liability
  | 'form-8615' // kiddie tax applies and Basis doesn't compute it
  | 'year-data'; // the year's figures aren't loaded

export interface YearEvaluation {
  dependency: DependencyDetermination;
  filingStatus: FilingStatusDetermination;
  /** Null when a blocked item prevents a single number. */
  liability: {
    federalTax: number;
    totalTax: number;
    ltcgZeroBracketRoom: number;
  } | null;
  blocked: BlockedItem[];
  notes: string[];
}

const num = (state: ReturnType<typeof factState>): number | null =>
  state.status === 'known' && state.value.kind === 'number' ? state.value.value : null;

export function evaluateYear(assertions: FactAssertion[], taxYear: number): YearEvaluation {
  const set = factSet(assertions, taxYear);
  const dependency = determineDependency(assertions, taxYear);
  const filingStatus = determineFilingStatus(assertions, taxYear);
  const blocked: BlockedItem[] = [];
  const notes: string[] = [];

  const wages = num(factState(set, 'w2-wages'));
  const longGains = num(factState(set, 'realized-long-gains'));
  const shortGains = num(factState(set, 'realized-short-gains'));

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

  // No single liability without a filing status: joint-or-separate is an
  // election, and averaging two returns would be a fabrication.
  if (filingStatus.status === 'unknown') {
    blocked.push('filing-status-election');
    notes.push('No filing status is settled, so there is no single liability to report.');
    return { dependency, filingStatus, liability: null, blocked, notes };
  }

  if (year === null) {
    return { dependency, filingStatus, liability: null, blocked, notes };
  }

  const data: TaxEstimatorData = {
    ...createDefaultTaxEstimatorData(),
    taxYear,
    // The estimator predates qss; surviving spouse uses the joint rates,
    // which is exactly what the status exists to provide.
    filingStatus: filingStatus.status === 'qss' ? 'mfj' : filingStatus.status,
    w2Wages: wages ?? 0,
    capitalGainsLong: longGains ?? 0,
    capitalGainsShort: shortGains ?? 0,
  };

  if (wages === null && longGains === null && shortGains === null) {
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

  const result = computeTaxEstimate(data);
  return {
    dependency,
    filingStatus,
    liability: {
      federalTax: result.federalTax + result.ltcgTax + result.niit,
      totalTax: result.totalTax,
      ltcgZeroBracketRoom: result.ltcgZeroBracketRoom,
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
