// ─── D2 · The saver's credit (Form 8880, TY ≤ 2026) ────────────────
// Up to $1,000 for retirement contributions this audience is already
// making through work — and a credit in its final year: SECURE 2.0
// replaces it with the Saver's Match from TY2027, so this module is the
// codebase's clearest demonstration of Doctrine 6. A rule is
// rule(taxYear)(facts): for 2027 and later it returns not-applicable with
// the successor named, and models nothing about it.
//
// Authority: Form 8880 instructions. Tier tables verified 2026-08 —
// 50%/20%/10% of up to $2,000 contributed, by AGI and filing bucket
// (2026 from Notice 2025-67, in year-data). Disqualifiers: under 18,
// full-time student during any part of five months (the same five-month
// bar Pub 501 uses), or claimable as a dependent — the last two are A3's
// to know, which makes this the second-best dependency-fork demonstration
// after the AOTC.
//
// The April interplay is the finding: a deductible traditional-IRA
// contribution made before the filing deadline lowers AGI AND raises the
// contribution base — the one lever that still moves after December 31.
// It is priced as an option with dollars, never auto-claimed.

import type { DependencyDetermination } from './dependency';
import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { FilingStatus } from './filing-status';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

export const SAVERS_CONTRIBUTION_CAP = 2000;
export const SAVERS_STUDENT_MONTHS = 5;
/** The credit's last tax year — the Saver's Match takes over from 2027. */
export const SAVERS_FINAL_YEAR = 2026;

export type SaversStatus = 'available' | 'none' | 'ineligible' | 'missing-facts';

export interface SaversCreditDetermination {
  /** False for 2027+ (successor named) and for years with no data loaded. */
  applicable: boolean;
  successor: { name: 'savers-match'; note: string } | null;
  status: SaversStatus;
  /** Nonrefundable — the evaluation bounds it by remaining tax. */
  amount: number;
  rate: number | null;
  contributionBase: number;
  /** Testing-period distributions that reduced the base. */
  reductions: number;
  missingFacts: FactId[];
  reasons: string[];
  /**
   * The April lever, priced: a deductible traditional-IRA contribution of
   * this much would turn the credit into newCredit. An option with
   * dollars — never auto-claimed.
   */
  iraOption: {
    additionalContribution: number;
    newCredit: number;
    delta: number;
    note: string;
  } | null;
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface SaversContext {
  agi: number | null;
  filingStatus: FilingStatus | 'unknown';
  dependency: DependencyDetermination;
}

const CITE = 'Form 8880 instructions — retirement savings contributions credit';

export function determineSaversCredit(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: SaversContext,
): SaversCreditDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const read = (id: FactId, at = set): FactState => {
    if (!consumed.includes(id)) consumed.push(id);
    return factState(at, id);
  };
  const num = (id: FactId, at = set): number | null => {
    const s = read(id, at);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const isUnresolved = (id: FactId): boolean => {
    const s = factState(set, id);
    return s.status === 'unasserted' || s.status === 'unknown';
  };

  const notes: string[] = [];

  const finish = (
    partial: Partial<SaversCreditDetermination> & { status: SaversStatus },
  ): SaversCreditDetermination => ({
    applicable: true,
    successor: null,
    amount: 0,
    rate: null,
    contributionBase: 0,
    reductions: 0,
    missingFacts: [],
    reasons: [],
    iraOption: null,
    explanation: {
      ruleId: 'savers-credit/8880',
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

  // ── Doctrine 6, literally: the year selects the rule ──
  if (taxYear > SAVERS_FINAL_YEAR) {
    notes.push(
      `TY${taxYear}: the saver's credit no longer exists. SECURE 2.0 replaces it with the Saver's Match — paid into the retirement account rather than off the tax bill — and Form 8880 narrows to ABLE contributions. Basis names the successor and does not model it.`,
    );
    return finish({
      applicable: false,
      status: 'ineligible',
      successor: {
        name: 'savers-match',
        note: 'From 2027 the government matches up to $2,000 of retirement contributions directly into the account instead of crediting the return.',
      },
      reasons: ['The credit ended with tax year 2026.'],
    });
  }

  const year = filingYearData(taxYear);
  if (year === null) {
    notes.push(`Figures for ${taxYear} aren't loaded — refusing to guess the tiers.`);
    return finish({ applicable: false, status: 'missing-facts' });
  }

  // ── The three disqualifiers ──
  const birth = ((): string | null => {
    const s = read('birth-date');
    return s.status === 'known' && s.value.kind === 'date' ? s.value.value : null;
  })();
  if (birth === null) {
    return finish({ status: 'missing-facts', missingFacts: ['birth-date'] });
  }
  const age = taxYear - Number(birth.slice(0, 4));
  if (age < 18) {
    return finish({
      status: 'ineligible',
      reasons: ['The credit starts at age 18.'],
    });
  }

  const studentMonths = num('full-time-student-months');
  if (studentMonths !== null && studentMonths >= SAVERS_STUDENT_MONTHS) {
    return finish({
      status: 'ineligible',
      reasons: [
        'Full-time enrollment during any part of five months closes this credit for the year — it reopens the year the studying stops.',
      ],
    });
  }

  const missing: FactId[] = [];
  if (studentMonths === null && isUnresolved('full-time-student-months')) {
    missing.push('full-time-student-months');
  }
  if (ctx.dependency.canBeClaimed === 'yes') {
    return finish({
      status: 'ineligible',
      reasons: ["Claimable as a dependent — the credit isn't available, whoever files first."],
    });
  }
  if (ctx.dependency.canBeClaimed === 'unknown') {
    missing.push(...ctx.dependency.missingFacts);
  }
  if (missing.length > 0) {
    return finish({ status: 'missing-facts', missingFacts: [...new Set(missing)] });
  }

  if (ctx.agi === null) {
    return finish({ status: 'missing-facts', missingFacts: ['gross-income'] });
  }

  // ── Contributions and the testing-period reduction ──
  const contributions = (num('w2-retirement-contributions') ?? 0) + (num('ira-contributions') ?? 0);

  // Distributions taken out reduce what counts as contributed — this year
  // and the two before (the testing period runs through the filing
  // deadline). Rollovers never reduce.
  let reductions = 0;
  for (const y of [taxYear, taxYear - 1, taxYear - 2]) {
    const at = y === taxYear ? set : factSet(assertions, y);
    const dist = num('retirement-distribution', at) ?? 0;
    const rolled = num('retirement-rollover', at) ?? 0;
    reductions += Math.max(0, dist - rolled);
  }
  if (reductions > 0) {
    notes.push(
      `$${reductions} of retirement money taken out during the testing period reduces what counts as contributed — the credit rewards net saving, not round trips.`,
    );
  }

  const base = Math.max(0, Math.min(SAVERS_CONTRIBUTION_CAP, contributions - reductions));

  // ── The tier ──
  const bucket =
    ctx.filingStatus === 'mfj'
      ? year.saversCredit.mfj
      : ctx.filingStatus === 'hoh'
        ? year.saversCredit.hoh
        : year.saversCredit.other;
  const rateAt = (agi: number): number =>
    agi <= bucket.maxRate50
      ? 0.5
      : agi <= bucket.maxRate20
        ? 0.2
        : agi <= bucket.maxRate10
          ? 0.1
          : 0;

  const rate = rateAt(ctx.agi);
  const amount = Math.round(rate * base);

  // ── The April lever, priced ──
  // A deductible traditional-IRA contribution lowers AGI and raises the
  // base at once. Suggest the smallest amount that does the most: cross
  // into a better tier if one is within reach, and fill the $2,000 base.
  let iraOption: SaversCreditDetermination['iraOption'] = null;
  const REACH = 4000; // a boundary further than this isn't a suggestion, it's a fantasy
  const boundaries = [bucket.maxRate50, bucket.maxRate20, bucket.maxRate10];
  const crossable = boundaries
    .filter((b) => ctx.agi !== null && ctx.agi > b && ctx.agi - b <= REACH)
    .map((b) => (ctx.agi as number) - b);
  const tierStep = crossable.length > 0 ? Math.min(...crossable) : 0;
  const fillStep = Math.max(0, SAVERS_CONTRIBUTION_CAP - (contributions - reductions));
  const extra = Math.max(tierStep, fillStep > 0 && rate > 0 ? fillStep : tierStep);
  if (extra > 0) {
    const newAgi = ctx.agi - extra;
    const newBase = Math.max(
      0,
      Math.min(SAVERS_CONTRIBUTION_CAP, contributions + extra - reductions),
    );
    const newCredit = Math.round(rateAt(newAgi) * newBase);
    if (newCredit > amount) {
      iraOption = {
        additionalContribution: extra,
        newCredit,
        delta: newCredit - amount,
        note: `A deductible traditional-IRA contribution of $${extra} before the April filing deadline lowers AGI and raises the counted savings at once — the credit goes from $${amount} to $${newCredit}${taxYear === SAVERS_FINAL_YEAR ? ', and this is the last year the credit exists' : ''}. It also lowers taxable income on its own. An option with a price, not advice.`,
      };
    }
  }

  if (taxYear === SAVERS_FINAL_YEAR && (amount > 0 || iraOption !== null)) {
    notes.push(
      "TY2026 is the saver's credit's final year — from 2027 the Saver's Match pays into the account instead of off the return.",
    );
  }

  if (rate === 0) {
    return finish({
      status: 'ineligible',
      rate,
      contributionBase: base,
      reductions,
      reasons: [`AGI $${ctx.agi} sits above the credit's ceiling for this filing status.`],
      iraOption,
    });
  }
  if (base === 0) {
    return finish({
      status: 'none',
      rate,
      contributionBase: 0,
      reductions,
      reasons: ['No retirement contributions on file for the year — yet.'],
      iraOption,
    });
  }

  return finish({
    status: 'available',
    amount,
    rate,
    contributionBase: base,
    reductions,
    iraOption,
  });
}
