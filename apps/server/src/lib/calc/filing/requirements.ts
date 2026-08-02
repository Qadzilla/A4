// ─── A5 · Requirements & scope ─────────────────────────────────────
// Life facts become the two lists everything else runs on: which documents
// should exist (expectations — what absence detection stands on), and which
// forms the year requires — checked against an enforced SCOPE object, so
// out of scope is a first-class answer with an explanation, never a silent
// omission.
//
// The asymmetry at the heart of it, from the contract: income creates form
// requirements directly, not via documents. P4's $1,800 of DoorDash is
// below the 1099-NEC threshold, so no form will ever arrive — and Schedule
// C is required anyway. A product that waits for paper misses exactly the
// people the paper trail has abandoned.
//
// Fences: no document reading (C-phase), no readiness verdicts (A6), and
// SCOPE flips to supported only in the slice that ships the support —
// never optimistically here.

import { determineDependency } from './dependency';
import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import { determineResidency } from './residency';
import { filingYearData, informationReturnThresholds } from './year-data';

// ─── Documents ─────────────────────────────────────────────────────

export type DocumentKind =
  | 'W-2'
  | '1099-NEC'
  | '1099-K'
  | '1099-B'
  | '1099-DIV'
  | '1099-INT'
  | '1099-G'
  | '1099-R'
  | '1098-T'
  | '1098-E'
  | '1095-A'
  | 'W-2G'
  | '1042-S';

export interface Expectation {
  document: DocumentKind;
  /** The facts that make Basis expect it — "you said you had two jobs." */
  because: FactId[];
  /** Who should send it, in plain words. */
  from: string;
  /**
   * False where an issuance threshold means it may legitimately never come —
   * absence of a non-mandatory document is a note, not an alarm.
   */
  mandatory: boolean;
  /** ISO date it should have arrived by, for absence timing. Null: no statute. */
  arrivesBy: string | null;
}

/** A document that has actually arrived — C-phase will supply these. */
export interface ArrivedDoc {
  kind: DocumentKind;
  fileId: string;
  /**
   * The year the document reports on — a 2026 W-2 satisfies nothing about
   * 2025. Optional only until C-phase reads it off the paper; unstated
   * matches the year under assessment.
   */
  taxYear?: number;
}

// ─── Forms and scope ───────────────────────────────────────────────

export type FormId =
  | 'form-1040'
  | 'form-1040-nr'
  | 'sch-1'
  | 'sch-c'
  | 'sch-se'
  | 'sch-d'
  | 'form-8949'
  | 'form-8615'
  | 'form-8863'
  | 'form-8880'
  | 'form-8962'
  | 'form-5329'
  | 'form-8843'
  | 'sch-1-a'
  | 'form-4137'
  | 'state-ca-540'
  | 'state-ny-it201'
  | 'state-ma-1';

interface ScopeEntry {
  supported: boolean;
  /** The slice that ships it, for unsupported entries. */
  plannedAt: string | null;
  /** Plain words: what this form is, for the refusal that teaches. */
  whatItMeans: string;
}

/**
 * The enforced coverage set. Three entries are true today because the
 * capability already ships (the P4 lot engine and exports build 8949/Sch D
 * worksheets; the estimator computes the 1040's core arithmetic). Everything
 * else waits for its named slice — flipping an entry rides the slice that
 * earns it.
 */
export const SCOPE: { version: number; forms: Record<FormId, ScopeEntry> } = {
  version: 1,
  forms: {
    'form-1040': {
      supported: true,
      plannedAt: null,
      whatItMeans: 'The federal income tax return itself — every other form feeds a line on it.',
    },
    'form-8949': {
      supported: true,
      plannedAt: null,
      whatItMeans: 'The sale-by-sale list of investments sold, matching what brokers report.',
    },
    'sch-d': {
      supported: true,
      plannedAt: null,
      whatItMeans: 'The totals of investment gains and losses, carried to the return.',
    },
    'form-1040-nr': {
      supported: false,
      plannedAt: 'E1',
      whatItMeans:
        'The return nonresidents file instead of the 1040 — different deductions, different rules on what income the US taxes.',
    },
    'sch-1': {
      supported: false,
      plannedAt: 'C5',
      whatItMeans: 'Extra income that has no line of its own — unemployment, prizes, and the like.',
    },
    'sch-c': {
      supported: false,
      plannedAt: 'D4',
      whatItMeans: 'Profit from working for yourself: what came in, what it cost, what is taxed.',
    },
    'sch-se': {
      supported: false,
      plannedAt: 'D4',
      whatItMeans:
        'Social Security and Medicare tax on self-employment profit — the 15.3% no one withheld.',
    },
    'form-8615': {
      supported: false,
      plannedAt: 'B2/D-phase',
      whatItMeans:
        "Investment income of a student under 24 taxed at the parents' rate — the kiddie tax.",
    },
    'form-8863': {
      supported: false,
      plannedAt: 'D1',
      whatItMeans: 'The education credits — up to $2,500, partly refundable, for tuition paid.',
    },
    'form-8880': {
      supported: false,
      plannedAt: 'D2',
      whatItMeans: "The saver's credit — up to $1,000 for retirement contributions, through 2026.",
    },
    'form-8962': {
      supported: false,
      plannedAt: 'D3',
      whatItMeans:
        'Reconciles marketplace insurance help with actual income. Skipping it freezes the whole refund.',
    },
    'form-5329': {
      supported: false,
      plannedAt: 'D6',
      whatItMeans: 'The 10% penalty on early retirement withdrawals, and its exceptions.',
    },
    'form-8843': {
      supported: false,
      plannedAt: 'E2',
      whatItMeans:
        'The statement every exempt-visa student owes each year, income or none — it protects the exemption.',
    },
    'sch-1-a': {
      supported: false,
      plannedAt: 'D7',
      whatItMeans: 'The new deductions for tips and overtime pay, tax years 2025 through 2028.',
    },
    'form-4137': {
      supported: false,
      plannedAt: 'D7',
      whatItMeans: 'Social Security and Medicare on tips an employer never saw.',
    },
    'state-ca-540': {
      supported: false,
      plannedAt: 'F1',
      whatItMeans: 'The California return — its own rules, credits and rates.',
    },
    'state-ny-it201': {
      supported: false,
      plannedAt: 'F2',
      whatItMeans: 'The New York return — state, city and Yonkers taxes in one filing.',
    },
    'state-ma-1': {
      supported: false,
      plannedAt: 'F3',
      whatItMeans: 'The Massachusetts return — 8.5% on short-term gains, its own deductions.',
    },
  },
};

export interface FormRequirement {
  form: FormId;
  because: FactId[];
  supported: boolean;
  /** Present exactly when unsupported: the refusal that teaches. */
  ifUnsupported: { whyItApplies: string; whatItMeans: string } | null;
}

// ─── Expectations ──────────────────────────────────────────────────

const bool = (s: FactState): boolean | null =>
  s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
const num = (s: FactState): number | null =>
  s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;

/**
 * Which documents this year should produce, from the live facts alone.
 * Computed, never stored: a superseded fact takes its expectations with it.
 */
export function expectations(assertions: FactAssertion[], taxYear: number): Expectation[] {
  const set = factSet(assertions, taxYear);
  const get = (id: FactId) => factState(set, id);
  const out: Expectation[] = [];
  const jan31 = `${taxYear + 1}-01-31`;
  const feb15 = `${taxYear + 1}-02-15`;
  const mar15 = `${taxYear + 1}-03-15`;

  const year = filingYearData(taxYear);

  const employers = num(get('w2-employer-count'));
  const wages = num(get('w2-wages'));
  if ((employers !== null && employers > 0) || (wages !== null && wages > 0)) {
    out.push({
      document: 'W-2',
      because: employers !== null ? ['w2-employer-count'] : ['w2-wages'],
      from:
        employers !== null && employers > 1 ? `each of the ${employers} employers` : 'the employer',
      mandatory: true,
      arrivesBy: jan31,
    });
  }

  // A brokerage that only held produces no paperwork — the cruel case.
  const hasBrokerage = bool(get('brokerage-account')) === true;
  const sold =
    bool(get('sold-investments')) === true ||
    (num(get('realized-long-gains')) ?? 0) !== 0 ||
    (num(get('realized-short-gains')) ?? 0) !== 0;
  if (hasBrokerage && sold) {
    out.push({
      document: '1099-B',
      because: ['brokerage-account', 'sold-investments'],
      from: 'the brokerage',
      mandatory: true,
      arrivesBy: feb15,
    });
  }
  if (hasBrokerage && bool(get('received-dividends')) === true) {
    out.push({
      document: '1099-DIV',
      because: ['brokerage-account', 'received-dividends'],
      from: 'the brokerage',
      mandatory: true,
      arrivesBy: feb15,
    });
  }

  if (bool(get('earned-bank-interest')) === true) {
    out.push({
      document: '1099-INT',
      because: ['earned-bank-interest'],
      from: 'the bank (only sent for $10 or more of interest)',
      mandatory: false,
      arrivesBy: jan31,
    });
  }

  // The no-form path: below the year's threshold, nothing arrives and the
  // income is taxable anyway — that is a requirement, not an expectation.
  const thresholds = informationReturnThresholds(taxYear);
  const contract = num(get('contract-income'));
  if (contract !== null && thresholds !== null && contract >= thresholds.nec) {
    out.push({
      document: '1099-NEC',
      because: ['contract-income'],
      from: `each client that paid $${thresholds?.nec} or more`,
      mandatory: false, // the threshold is per payer; the total can clear it while no payer does
      arrivesBy: jan31,
    });
  }
  const platform = num(get('platform-income'));
  if (platform !== null && thresholds !== null && platform >= thresholds.k) {
    out.push({
      document: '1099-K',
      because: ['platform-income'],
      from: 'the payment platform (only above $20,000 AND 200 transactions)',
      mandatory: false, // the transaction prong is unknowable from dollars alone
      arrivesBy: jan31,
    });
  }

  if ((num(get('unemployment-income')) ?? 0) > 0) {
    out.push({
      document: '1099-G',
      because: ['unemployment-income'],
      from: 'the state unemployment office',
      mandatory: true,
      arrivesBy: jan31,
    });
  }

  if ((num(get('retirement-distribution')) ?? 0) > 0) {
    out.push({
      document: '1099-R',
      because: ['retirement-distribution'],
      from: 'the retirement plan or its custodian',
      mandatory: true,
      arrivesBy: jan31,
    });
  }

  if ((num(get('gambling-winnings')) ?? 0) > 0) {
    out.push({
      document: 'W-2G',
      because: ['gambling-winnings'],
      from: 'the sportsbook or casino (thresholds vary by game)',
      mandatory: false,
      arrivesBy: jan31,
    });
  }

  const studentMonths = num(get('full-time-student-months'));
  if (studentMonths !== null && studentMonths > 0 && bool(get('paid-tuition')) === true) {
    out.push({
      document: '1098-T',
      because: ['full-time-student-months', 'paid-tuition'],
      from: 'the school',
      mandatory: false, // schools miss these often enough that absence is a nudge, not an alarm
      arrivesBy: jan31,
    });
  }

  if (bool(get('paid-student-loan-interest')) === true) {
    out.push({
      document: '1098-E',
      because: ['paid-student-loan-interest'],
      from: 'the loan servicer (only sent for $600 or more of interest)',
      mandatory: false,
      arrivesBy: jan31,
    });
  }

  if (bool(get('marketplace-health-insurance')) === true) {
    out.push({
      document: '1095-A',
      because: ['marketplace-health-insurance'],
      from: 'the health insurance marketplace',
      mandatory: true, // the return cannot be completed without it (Form 8962)
      arrivesBy: jan31,
    });
  }

  if (bool(get('scholarship-income')) === true) {
    const residency = determineResidency(assertions, taxYear);
    if (residency.status === 'nonresident') {
      out.push({
        document: '1042-S',
        because: ['scholarship-income', 'visa-type'],
        from: 'the school (nonresident scholarship reporting)',
        mandatory: true,
        arrivesBy: mar15,
      });
    }
  }

  return out;
}

// ─── Required forms ────────────────────────────────────────────────

function requirement(form: FormId, because: FactId[], whyItApplies: string): FormRequirement {
  const entry = SCOPE.forms[form];
  return {
    form,
    because,
    supported: entry.supported,
    ifUnsupported: entry.supported ? null : { whyItApplies, whatItMeans: entry.whatItMeans },
  };
}

/**
 * Which forms the year requires, from facts and any arrived documents —
 * income drives requirements directly; documents corroborate and extend.
 */
export function requiredForms(
  assertions: FactAssertion[],
  docs: ArrivedDoc[],
  taxYear: number,
): FormRequirement[] {
  const set = factSet(assertions, taxYear);
  const get = (id: FactId) => factState(set, id);
  const out: FormRequirement[] = [];
  const year = filingYearData(taxYear);

  const residency = determineResidency(assertions, taxYear);

  if (residency.status === 'nonresident') {
    out.push(
      requirement(
        'form-1040-nr',
        residency.consumed,
        'Nonresident for tax purposes — the 1040-NR is the return, not the 1040.',
      ),
    );
  } else {
    out.push(requirement('form-1040', [], 'The year has income to report.'));
  }

  if (residency.form8843Required) {
    out.push(
      requirement(
        'form-8843',
        residency.consumed,
        'Every exempt-individual year owes this statement, income or none.',
      ),
    );
  }

  const contract = num(get('contract-income'));
  const platform = num(get('platform-income'));
  const gigIncome = (contract ?? 0) + (platform ?? 0);
  if (gigIncome > 0) {
    const because: FactId[] = [];
    if (contract !== null) because.push('contract-income');
    if (platform !== null) because.push('platform-income');
    out.push(
      requirement(
        'sch-c',
        because,
        `$${gigIncome} of self-employment income — with or without a form to show for it.`,
      ),
    );
    if (gigIncome >= 400) {
      out.push(
        requirement(
          'sch-se',
          because,
          'Self-employment income of $400 or more carries Social Security and Medicare tax.',
        ),
      );
    }
  }

  const soldViaDocs = docs.some((d) => d.kind === '1099-B');
  const sold =
    bool(get('sold-investments')) === true ||
    (num(get('realized-long-gains')) ?? 0) !== 0 ||
    (num(get('realized-short-gains')) ?? 0) !== 0 ||
    bool(get('digital-asset-activity')) === true ||
    soldViaDocs;
  if (sold) {
    const because: FactId[] = ['sold-investments'];
    out.push(requirement('form-8949', because, 'Investments were sold — each sale is listed.'));
    out.push(requirement('sch-d', because, 'The sale totals carry to the return.'));
  }

  if ((num(get('unemployment-income')) ?? 0) > 0) {
    out.push(
      requirement(
        'sch-1',
        ['unemployment-income'],
        'Unemployment compensation is taxable income with no line of its own on the 1040.',
      ),
    );
  }

  // The kiddie tax rides the dependency machinery, not a document.
  const dependency = determineDependency(assertions, taxYear);
  if (dependency.consequences.kiddieTaxExposed && year?.kiddieUnearnedThreshold !== undefined) {
    const unearned =
      (num(get('realized-long-gains')) ?? 0) + (num(get('realized-short-gains')) ?? 0);
    if (unearned > year.kiddieUnearnedThreshold) {
      out.push(
        requirement(
          'form-8615',
          ['birth-date', 'full-time-student-months', 'realized-long-gains'],
          `$${unearned} of investment income for a student under 24 — above the $${year.kiddieUnearnedThreshold} threshold, the parents' rate applies.`,
        ),
      );
    }
  }

  if (bool(get('marketplace-health-insurance')) === true || docs.some((d) => d.kind === '1095-A')) {
    out.push(
      requirement(
        'form-8962',
        ['marketplace-health-insurance'],
        'Marketplace insurance means the premium credit must be reconciled — filing without this form freezes the refund.',
      ),
    );
  }

  if ((num(get('retirement-distribution')) ?? 0) > 0 || docs.some((d) => d.kind === '1099-R')) {
    out.push(
      requirement(
        'form-5329',
        ['retirement-distribution'],
        'A retirement distribution before 59½ may carry the 10% additional tax — this form computes it, or claims the exception.',
      ),
    );
  }

  // States: the three in scope produce their requirement rows; anything else
  // is B3's treatment table until F-phase.
  const state = ((): string | null => {
    const s = get('state-of-residence');
    return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
  })();
  const stateForms: Record<string, FormId> = {
    CA: 'state-ca-540',
    NY: 'state-ny-it201',
    MA: 'state-ma-1',
  };
  const stateForm = state !== null ? stateForms[state] : undefined;
  if (stateForm) {
    out.push(requirement(stateForm, ['state-of-residence'], `Resident of ${state} for the year.`));
  }

  return out;
}
