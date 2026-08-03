// ─── D1 · Education credits & student-loan interest ────────────────
// The AOTC is the largest single sum most of this audience can recover —
// up to $2,500 a year, 40% of it refundable at zero tax — and the one most
// often lost to the dependency rules: if the parents can claim the
// student, the credit is theirs to take, not the student's.
//
// Authority: Form 8863 instructions and Pub 970 (credit arithmetic and
// phaseouts verified 2026-08: 100% of the first $2,000 of qualified
// expenses + 25% of the next $2,000; 40% refundable; both credits phase
// out over $80k–$90k single / $160k–$180k joint; LLC is 20% of up to
// $10,000, nonrefundable). Student-loan interest: IRC §221 via Schedule 1,
// $2,500 cap, phaseouts in year-data.
//
// Standing rules held here:
//  - Never picks between AOTC and LLC. Both are computed and priced; the
//    election is a fact the person asserts, not a preference the engine
//    forms. One student, one year, one credit — the exclusivity is stated.
//  - Exceptions and elections are options with dollars. The scholarship
//    election (deliberately counting scholarship as income to free up
//    tuition for the credit) is priced on its credit side here and netted
//    against the income side by the evaluation, which owns marginal rates.
//  - The double-dip guard is explicit: a dollar of tax-free scholarship
//    cannot also fund a credit, so qualified expenses are netted before
//    any arithmetic.
//
// Fences: no graduate nuances beyond the LLC, no 529 interactions (named),
// and eligibility follows A3's dependency determination — this module
// never recomputes age.

import type { DependencyDetermination } from './dependency';
import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { FilingStatus } from './filing-status';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

// Statutory credit arithmetic (verified 2026-08; not indexed).
export const AOTC_FULL_TIER = 2000; // 100% of the first…
export const AOTC_QUARTER_TIER = 2000; // …25% of the next
export const AOTC_REFUNDABLE_SHARE = 0.4;
export const AOTC_LIFETIME_YEARS = 4;
export const LLC_RATE = 0.2;
export const LLC_EXPENSE_CAP = 10000;

export type CreditStatus = 'available' | 'ineligible' | 'missing-facts' | 'blocked';

export interface CreditOption {
  id: 'aotc' | 'llc';
  status: CreditStatus;
  /** After the MAGI phaseout. Zero unless available. */
  amount: number;
  refundable: number;
  nonRefundable: number;
  missingFacts: FactId[];
  reasons: string[];
}

export interface EducationDetermination {
  aotc: CreditOption;
  llc: CreditOption;
  /** One student, one year, one credit — stated, never resolved here. */
  exclusivity: string;
  /** The election on file, if the person has made one. */
  elected: 'aotc' | 'llc' | 'none' | null;
  /**
   * The scholarship election, priced on its credit side. The evaluation
   * nets the income side at the marginal rate — this module doesn't know
   * rates and doesn't guess them.
   */
  scholarshipElection: {
    suggestedAmount: number;
    creditGain: number;
    note: string;
  } | null;
  studentLoanInterest: {
    status: 'available' | 'denied' | 'missing-facts' | 'none';
    /** The deductible amount after cap and phaseout. */
    allowed: number;
    missingFacts: FactId[];
    reasons: string[];
  };
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface EducationContext {
  /** MAGI before the SLI deduction — the evaluation's first-pass AGI. */
  magi: number | null;
  filingStatus: FilingStatus | 'unknown';
  dependency: DependencyDetermination;
}

const CITE =
  'Form 8863 instructions / Pub 970 — education credits; IRC §221 — student loan interest';

/** Linear phaseout multiplier: 1 below the band, 0 above it. */
function phaseMultiplier(magi: number, start: number, end: number): number {
  if (magi <= start) return 1;
  if (magi >= end) return 0;
  return (end - magi) / (end - start);
}

export function determineEducation(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: EducationContext,
): EducationDetermination {
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
  const str = (id: FactId): string | null => {
    const s = read(id);
    return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
  };

  const notes: string[] = [];
  const year = filingYearData(taxYear);

  const option = (
    id: 'aotc' | 'llc',
    status: CreditStatus,
    partial: Partial<CreditOption> = {},
  ): CreditOption => ({
    id,
    status,
    amount: 0,
    refundable: 0,
    nonRefundable: 0,
    missingFacts: [],
    reasons: [],
    ...partial,
  });

  const sli = (
    status: EducationDetermination['studentLoanInterest']['status'],
    partial: Partial<EducationDetermination['studentLoanInterest']> = {},
  ): EducationDetermination['studentLoanInterest'] => ({
    status,
    allowed: 0,
    missingFacts: [],
    reasons: [],
    ...partial,
  });

  const finish = (
    aotc: CreditOption,
    llc: CreditOption,
    interest: EducationDetermination['studentLoanInterest'],
    scholarshipElection: EducationDetermination['scholarshipElection'] = null,
  ): EducationDetermination => ({
    aotc,
    llc,
    exclusivity:
      'One student, one year, one credit: the AOTC and the LLC can never both be taken for the same student. Both are priced here; taking one is an election.',
    elected: ((): 'aotc' | 'llc' | 'none' | null => {
      const e = str('education-credit-election');
      return e === 'aotc' || e === 'llc' || e === 'none' ? e : null;
    })(),
    scholarshipElection,
    studentLoanInterest: interest,
    explanation: {
      ruleId: 'education/8863',
      citation: CITE,
      steps: [
        { label: 'AOTC', value: `${aotc.status} $${aotc.amount}` },
        { label: 'LLC', value: `${llc.status} $${llc.amount}` },
        { label: 'Student-loan interest', value: `${interest.status} $${interest.allowed}` },
      ],
      notes,
    },
    consumed,
  });

  // ── The gates every path shares ──
  if (year === null) {
    notes.push(`Figures for ${taxYear} aren't loaded — nothing here is computed.`);
    return finish(
      option('aotc', 'missing-facts'),
      option('llc', 'missing-facts'),
      sli('missing-facts'),
    );
  }

  if (str('residency-status') === 'nonresident') {
    const why =
      'Nonresidents generally cannot take the education credits or the interest deduction — the 1040-NR runs different rules, which land at E-phase.';
    notes.push(why);
    return finish(
      option('aotc', 'blocked', { reasons: [why] }),
      option('llc', 'blocked', { reasons: [why] }),
      sli('denied', { reasons: [why] }),
    );
  }

  if (ctx.filingStatus === 'mfs') {
    const why =
      'Married filing separately gets neither education credit nor the interest deduction — statutory, no exceptions.';
    notes.push(why);
    return finish(
      option('aotc', 'blocked', { reasons: [why] }),
      option('llc', 'blocked', { reasons: [why] }),
      sli('denied', { reasons: [why] }),
    );
  }

  if (ctx.dependency.canBeClaimed === 'yes') {
    const why =
      "Claimable as a dependent: the education credit belongs on the parents' return — theirs to take, not the student's — and the interest deduction is denied outright.";
    notes.push(why);
    return finish(
      option('aotc', 'blocked', { reasons: [why] }),
      option('llc', 'blocked', { reasons: [why] }),
      sli('denied', { reasons: [why] }),
    );
  }

  const dependencyOpen = ctx.dependency.canBeClaimed === 'unknown';
  if (dependencyOpen) {
    notes.push(
      'Whether anyone can claim the student decides who owns these credits — the open dependency facts are the ones worth resolving first.',
    );
  }

  // ── Qualified expenses, with the double-dip guard ──
  const tuition = num('qualified-tuition-paid');
  const scholarships = num('scholarships-received') ?? 0;
  const election = num('scholarship-included-in-income') ?? 0;
  const billedOnly = num('tuition-billed-legacy');

  // Tax-free scholarship reduces qualified expenses dollar for dollar; the
  // election claws dollars back by making them taxable instead.
  const qtre =
    tuition === null
      ? null
      : Math.max(0, tuition - Math.max(0, Math.min(scholarships, tuition) - election));

  const expenseMissing: FactId[] = [];
  if (tuition === null) {
    expenseMissing.push('qualified-tuition-paid');
    if (billedOnly !== null) {
      notes.push(
        `A school reported $${billedOnly} billed (the retired box 2) — billed is not paid, and the credit runs on payments. The paid figure decides this.`,
      );
    }
  }

  // ── Phaseout, shared by both credits ──
  const mfjBucket = ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss';
  const phase =
    ctx.magi === null
      ? 1
      : phaseMultiplier(
          ctx.magi,
          mfjBucket
            ? year.educationCreditPhaseout.startMfj
            : year.educationCreditPhaseout.startSingle,
          mfjBucket ? year.educationCreditPhaseout.endMfj : year.educationCreditPhaseout.endSingle,
        );
  if (ctx.magi === null) {
    notes.push(
      'MAGI unknown — credits computed assuming income under the phaseout band; income facts refine this.',
    );
  }

  // ── AOTC eligibility ──
  const degree = boolFact('degree-program');
  const halfTime = boolFact('enrolled-half-time');
  const yearsUsed = num('aotc-years-used');
  const felony = boolFact('felony-drug-conviction');

  const aotcMissing: FactId[] = [...expenseMissing];
  const aotcReasons: string[] = [];
  if (degree === null) aotcMissing.push('degree-program');
  if (halfTime === null) aotcMissing.push('enrolled-half-time');
  if (yearsUsed === null) aotcMissing.push('aotc-years-used');
  if (felony === null) aotcMissing.push('felony-drug-conviction');

  let aotc: CreditOption;
  if (degree === false) {
    aotc = option('aotc', 'ineligible', {
      reasons: ['The AOTC needs a degree or credential program — the LLC does not.'],
    });
  } else if (halfTime === false) {
    aotc = option('aotc', 'ineligible', {
      reasons: ['The AOTC needs at least half-time enrollment — the LLC does not.'],
    });
  } else if (yearsUsed !== null && yearsUsed >= AOTC_LIFETIME_YEARS) {
    aotc = option('aotc', 'ineligible', {
      reasons: [
        'The AOTC has four lifetime years and all four are used — the LLC has no such limit.',
      ],
    });
  } else if (felony === true) {
    aotc = option('aotc', 'ineligible', {
      reasons: [
        'A felony drug conviction closes the AOTC (and only the AOTC — the LLC has no such test).',
      ],
    });
  } else if (aotcMissing.length > 0 || dependencyOpen || qtre === null) {
    aotc = option('aotc', 'missing-facts', {
      missingFacts: dependencyOpen
        ? [...new Set([...aotcMissing, ...ctx.dependency.missingFacts])]
        : aotcMissing,
    });
    if (yearsUsed === null) {
      notes.push(
        'Years of AOTC already used: old returns say, and so does the IRS Wage & Income transcript — the same pull that recovers lost W-2s.',
      );
    }
  } else {
    const raw =
      Math.min(qtre, AOTC_FULL_TIER) +
      0.25 * Math.max(0, Math.min(qtre - AOTC_FULL_TIER, AOTC_QUARTER_TIER));
    const amount = Math.round(raw * phase);
    // The under-24 restriction (Form 8863 line 7): the refundable slice is
    // closed to filers meeting the kiddie-tax conditions — A3's exposure
    // flag is exactly that test.
    const refundBlocked = ctx.dependency.consequences.kiddieTaxExposed;
    const refundable = refundBlocked ? 0 : Math.round(amount * AOTC_REFUNDABLE_SHARE);
    if (refundBlocked && amount > 0) {
      notes.push(
        'The refundable 40% of the AOTC is closed to filers under 24 meeting the support conditions (Form 8863 line 7) — the credit still offsets tax, it just cannot pay out past zero.',
      );
    }
    aotc = option('aotc', 'available', {
      amount,
      refundable,
      nonRefundable: amount - refundable,
    });
  }

  // ── LLC ──
  const months = num('full-time-student-months');
  const anyEnrollment = degree === true || halfTime === true || (months !== null && months > 0);
  let llc: CreditOption;
  if (qtre === null || dependencyOpen) {
    llc = option('llc', 'missing-facts', {
      missingFacts: dependencyOpen
        ? [...new Set([...expenseMissing, ...ctx.dependency.missingFacts])]
        : expenseMissing,
    });
  } else if (!anyEnrollment) {
    llc =
      degree === null && halfTime === null && months === null
        ? option('llc', 'missing-facts', { missingFacts: ['full-time-student-months'] })
        : option('llc', 'ineligible', {
            reasons: ['The LLC needs some postsecondary enrollment — none is on file.'],
          });
  } else {
    const amount = Math.round(LLC_RATE * Math.min(qtre, LLC_EXPENSE_CAP) * phase);
    llc = option('llc', 'available', { amount, nonRefundable: amount });
  }

  // ── The scholarship election, priced on the credit side ──
  let scholarshipElection: EducationDetermination['scholarshipElection'] = null;
  if (
    aotc.status === 'available' &&
    tuition !== null &&
    scholarships > 0 &&
    qtre !== null &&
    qtre < AOTC_FULL_TIER + AOTC_QUARTER_TIER
  ) {
    const shelteredNow = Math.max(0, Math.min(scholarships, tuition) - election);
    const headroom = Math.min(shelteredNow, AOTC_FULL_TIER + AOTC_QUARTER_TIER - qtre);
    if (headroom > 0) {
      const withElection = qtre + headroom;
      const rawAfter =
        Math.min(withElection, AOTC_FULL_TIER) +
        0.25 * Math.max(0, Math.min(withElection - AOTC_FULL_TIER, AOTC_QUARTER_TIER));
      const creditGain = Math.round(rawAfter * phase) - aotc.amount;
      if (creditGain > 0) {
        scholarshipElection = {
          suggestedAmount: headroom,
          creditGain,
          note: `Counting $${headroom} of scholarship as taxable income frees the same dollars of tuition for the credit — worth $${creditGain} of credit against the income tax the extra $${headroom} costs. Legal, in the 8863 instructions, and almost nobody does it. Both sides are laid out; the choice is an election.`,
        };
      }
    }
  }

  // ── Student-loan interest ──
  const paidBool = boolFact('paid-student-loan-interest');
  const paid = num('student-loan-interest-paid');
  let interest: EducationDetermination['studentLoanInterest'];
  if (dependencyOpen) {
    interest = sli('missing-facts', { missingFacts: ctx.dependency.missingFacts });
  } else if (paid === null) {
    interest =
      paidBool === true
        ? sli('missing-facts', { missingFacts: ['student-loan-interest-paid'] })
        : sli('none');
  } else if (paid <= 0) {
    interest = sli('none');
  } else {
    const sliPhase =
      ctx.magi === null
        ? 1
        : phaseMultiplier(
            ctx.magi,
            mfjBucket ? year.studentLoanInterest.startMfj : year.studentLoanInterest.startSingle,
            mfjBucket ? year.studentLoanInterest.endMfj : year.studentLoanInterest.endSingle,
          );
    const allowed = Math.round(Math.min(paid, year.studentLoanInterest.max) * sliPhase);
    interest = sli(allowed > 0 ? 'available' : 'denied', {
      allowed,
      reasons:
        allowed > 0 ? [] : ['Income above the phaseout band — the deduction phases to nothing.'],
    });
    if (allowed > 0 && ctx.dependency.canBeClaimed === 'no') {
      notes.push(
        'If the parents paid this interest: because nobody can claim the student, the law treats it as paid by the student — deductible here anyway.',
      );
    }
  }

  return finish(aotc, llc, interest, scholarshipElection);
}
