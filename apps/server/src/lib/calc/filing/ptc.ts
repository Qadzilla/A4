// ─── D3 · Premium tax credit reconciliation (Form 8962) ────────────
// The only form whose absence freezes a refund outright — not the
// difference, all of it. For a marketplace-insured freelancer this is the
// difference between a return and a letter.
//
// Authority: Form 8962 instructions and Pub 974; the TY2026 applicable
// percentage table transcribed from Rev. Proc. 2025-25 §3.01 itself; the
// TY2025 ARPA/IRA curve and Table 5 repayment caps verified 2026-08.
// The two years are structurally different law, and every difference
// lives in year-data (Doctrine 6, load-bearing):
//   TY2025 — 0% under 150% FPL, 8.5% from 400% with NO cliff, and
//            repayment capped by Table 5 below 400%.
//   TY2026 — the §36B curve returns, the 400% cliff returns, and the
//            repayment caps are REMOVED by statute (IRS FS-2025-10):
//            the mercy itself was year-gated.
//
// Reconciles month-wise from the 1095-A's table (C4 stored it with
// printed zeros distinct from blanks) — never from sums.
//
// Fences: no SLCSP lookup (a blank column B is a named handoff to the
// marketplace's lookup tool); no shared-policy allocation; no
// alternative calculations for year-of-marriage — named, refused.

import { type FactAssertion, type FactId, factSet, factState } from './facts';
import type { FilingStatus } from './filing-status';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

export interface PtcMonth {
  month: number; // 1–12
  premium: number | null;
  slcsp: number | null;
  aptc: number | null;
}

export type PtcStatus = 'reconciled' | 'missing-facts' | 'refused' | 'not-applicable';

export interface PtcDetermination {
  status: PtcStatus;
  /** Form 8962 line 5: floored to the whole percent. */
  fplPercent: number | null;
  applicablePercent: number | null;
  aptcTotal: number;
  ptcTotal: number;
  /** More credit than was advanced — refundable, into the refund. */
  additionalCredit: number;
  /** Advanced help exceeding the entitlement — Schedule 2 tax. */
  repayment: number;
  repaymentBeforeCap: number;
  /** The Table 5 cap that bounded it; null when no cap exists (TY2026, or ≥400% FPL). */
  capApplied: number | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface PtcContext {
  householdMagi: number | null;
  filingStatus: FilingStatus | 'unknown';
  taxYear: number;
}

const CITE =
  'Form 8962 instructions / Pub 974; TY2026 curve: Rev. Proc. 2025-25 §3.01; TY2026 cap removal: IRS FS-2025-10';

export function determinePtc(
  assertions: FactAssertion[],
  months: PtcMonth[],
  ctx: PtcContext,
): PtcDetermination {
  const set = factSet(assertions, ctx.taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];

  const finish = (
    partial: Partial<PtcDetermination> & { status: PtcStatus },
  ): PtcDetermination => ({
    fplPercent: null,
    applicablePercent: null,
    aptcTotal: 0,
    ptcTotal: 0,
    additionalCredit: 0,
    repayment: 0,
    repaymentBeforeCap: 0,
    capApplied: null,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'ptc/8962',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: ctx.taxYear },
        { label: 'Status', value: partial.status },
      ],
      notes,
    },
    consumed,
    ...partial,
  });

  const year = filingYearData(ctx.taxYear);
  if (year === null) {
    notes.push(`Figures for ${ctx.taxYear} aren't loaded — refusing to guess the curve.`);
    return finish({ status: 'missing-facts' });
  }

  const covered = months.filter(
    (m) => (m.premium !== null && m.premium > 0) || (m.aptc !== null && m.aptc > 0),
  );
  if (covered.length === 0) {
    return finish({ status: 'not-applicable' });
  }

  const aptcTotal = Math.round(covered.reduce((sum, m) => sum + (m.aptc ?? 0), 0));

  // ── The gates ──
  if (ctx.filingStatus === 'mfs') {
    return finish({
      status: 'refused',
      aptcTotal,
      refusals: [
        'Married filing separately generally cannot take the premium credit — the exception (domestic abuse or abandonment, checked on the form) is a preparer conversation, and Basis will not guess at it.',
      ],
    });
  }

  // v1 models a household of one — the demographic reality. A dependent of
  // their own changes household size and income; named, not fudged.
  const dependentMonths = factState(set, 'own-dependent-lived-with-months');
  consumed.push('own-dependent-lived-with-months');
  if (
    dependentMonths.status === 'known' &&
    dependentMonths.value.kind === 'number' &&
    dependentMonths.value.value > 0
  ) {
    return finish({
      status: 'refused',
      aptcTotal,
      refusals: [
        "A dependent changes the household's size and combined income, and the 8962 runs on both. Basis models the one-person household today — this needs a preparer or the next slice.",
      ],
    });
  }

  if (ctx.householdMagi === null) {
    return finish({
      status: 'missing-facts',
      aptcTotal,
      missingFacts: ['gross-income'],
    });
  }

  // Blank SLCSP with real coverage: the form can't compute without column
  // B, and Basis doesn't look plans up — the marketplace's tool does.
  const blankSlcsp = covered.filter((m) => m.slcsp === null);
  if (blankSlcsp.length > 0) {
    notes.push(
      `Column B (the second-lowest-cost silver plan) is blank for ${blankSlcsp.length} covered month(s). The marketplace's SLCSP lookup tool fills it from the ZIP code and household — Basis reports the blank rather than guessing a premium.`,
    );
    return finish({
      status: 'missing-facts',
      aptcTotal,
      missingFacts: ['marketplace-health-insurance'],
    });
  }

  // ── Form 8962 line 5: household income as % of FPL, floored ──
  const fpl = year.ptc.fplBase; // household of one
  const fplPercent = Math.floor((ctx.householdMagi / fpl) * 100);

  // Below 100%: generally not PTC-eligible. With APTC on the form, the
  // good-faith marketplace-estimate rule can preserve eligibility — a
  // genuine eligibility question, not arithmetic. Named, refused.
  if (fplPercent < 100) {
    if (aptcTotal > 0) {
      return finish({
        status: 'refused',
        fplPercent,
        aptcTotal,
        refusals: [
          `Household income landed under 100% of the poverty line (${fplPercent}%) with advance credit already paid. A good-faith marketplace estimate can preserve eligibility (8962 instructions, estimated-income rule) — whether it applies is a judgment Basis won't make. Without it, repayment applies${year.ptc.repaymentCaps === null ? ' uncapped' : ' up to the cap'}.`,
        ],
      });
    }
    notes.push(
      `Household income is under 100% of the poverty line — below the credit's floor, and nothing was advanced, so there is nothing to reconcile.`,
    );
    return finish({ status: 'reconciled', fplPercent, aptcTotal: 0 });
  }

  // ── The applicable percentage, from the year's own curve ──
  const overCliff = year.ptc.cliffAt400 && fplPercent > 400;
  let applicablePercent: number | null = null;
  if (!overCliff) {
    const band = year.ptc.curve.find((b) => fplPercent >= b.min && fplPercent < b.max);
    // The 300–400 band is inclusive of 400 in both years' tables.
    const effective =
      band ?? year.ptc.curve.find((b) => fplPercent === b.max && b.final === b.initial) ?? null;
    if (effective) {
      applicablePercent =
        effective.initial +
        ((effective.final - effective.initial) * (fplPercent - effective.min)) /
          (effective.max - effective.min || 1);
    } else {
      // Past the table with no cliff (TY2025 above 400%): the top rate holds.
      const top = year.ptc.curve[year.ptc.curve.length - 1];
      applicablePercent = top ? top.final : null;
    }
  }

  // ── Month-wise reconciliation, never from sums ──
  let ptcTotal = 0;
  if (!overCliff && applicablePercent !== null) {
    const monthlyContribution = (ctx.householdMagi * applicablePercent) / 100 / 12;
    for (const m of covered) {
      const premium = m.premium ?? 0;
      const slcsp = m.slcsp ?? 0;
      ptcTotal += Math.max(0, Math.min(premium, slcsp - monthlyContribution));
    }
    ptcTotal = Math.round(ptcTotal);
  } else {
    notes.push(
      `Household income is above 400% of the poverty line and TY${ctx.taxYear} has the cliff: no premium credit at any amount — every advanced dollar reconciles as repayment.`,
    );
  }

  // ── Net: more credit, or a clawback ──
  const net = ptcTotal - aptcTotal;
  if (net >= 0) {
    if (net > 0) {
      notes.push(
        `Income came in lower than the marketplace's estimate: $${net} more credit than was advanced — refundable, straight into the refund.`,
      );
    }
    return finish({
      status: 'reconciled',
      fplPercent,
      applicablePercent,
      aptcTotal,
      ptcTotal,
      additionalCredit: net,
    });
  }

  const repaymentBeforeCap = -net;
  let repayment = repaymentBeforeCap;
  let capApplied: number | null = null;
  if (year.ptc.repaymentCaps !== null && fplPercent < 400) {
    const tier = year.ptc.repaymentCaps.find((t) => fplPercent < t.belowFplPct);
    if (tier) {
      const cap = ctx.filingStatus === 'single' ? tier.single : tier.other;
      if (repaymentBeforeCap > cap) {
        repayment = cap;
        capApplied = cap;
        notes.push(
          `Income came in higher than the estimate, but the clawback is capped at $${cap} for this income level (8962 Table 5) — $${repaymentBeforeCap - cap} of the excess is forgiven.`,
        );
      }
    }
  } else if (year.ptc.repaymentCaps === null && repaymentBeforeCap > 0) {
    notes.push(
      `TY${ctx.taxYear} removed the repayment caps: the full $${repaymentBeforeCap} of excess advance credit is owed back, whatever the income level. The cap that would have softened this in 2025 no longer exists.`,
    );
  }

  return finish({
    status: 'reconciled',
    fplPercent,
    applicablePercent,
    aptcTotal,
    ptcTotal,
    repayment,
    repaymentBeforeCap,
    capApplied,
  });
}
