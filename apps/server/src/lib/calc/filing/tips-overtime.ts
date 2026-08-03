// ─── D7 · Tips & overtime deductions (Sch 1-A) + Form 4137 ─────────
// Brand-new law aimed square at this audience's jobs — and sunsetting
// after TY2028, so both the money and the window are findings.
//
// Authority (verified 2026-08 against the IRS OBBBA newsroom page and
// §§224/225 as implemented in Schedule 1-A): up to $25,000 of qualified
// tips (every filing status) and $12,500 / $25,000-joint of qualified
// overtime deduct BELOW the line — they stack on the standard deduction
// and never touch AGI, so no MAGI-based phaseout upstream moves. Both
// reduce $100 per $1,000 (or fraction) of MAGI over $150,000 ($300,000
// joint). Married must file JOINTLY to claim either. TY2025–2028 only,
// figures unindexed.
//
// The gates, each named:
//  - Tips only count from a job on Treasury's tipped-occupation list
//    (published under the act). The engine consumes the answer as a
//    fact; matching a job title to the list is intake's work. Unknown
//    computes NO deduction and prices the question — a yes is worth the
//    whole deduction.
//  - Overtime counts only the PREMIUM half — the extra 0.5 of
//    time-and-a-half required by FLSA §7, not the whole overtime check.
//    The fact is defined as the premium so intake and extraction must
//    honour the distinction; this module never divides a guess.
//  - Tips must be REPORTED somewhere — W-2, 1099, or Form 4137. Which
//    is the 4137 interaction: tips the employer never saw still owe the
//    employee's Social Security and Medicare (7.65%), computed here and
//    NOT year-gated — Form 4137 predates the deduction and outlives it.
//    Reporting the cash makes it deductible for income tax while the
//    FICA comes due: both sides of that trade are computed, neither is
//    hidden.
//  - Self-employment tips are already inside the Sch C totals (C2's
//    decomposition) — they qualify only up to the Schedule C's net
//    profit, and the income is never counted twice.
//
// The finding, verbatim from the contract: "Your tips are income-tax-
// free up to $25,000 — but Social Security still comes out, so the
// paycheck won't look like the headline said."

import { FEDERAL_TAX_DATA } from '../tax-data';
import { type FactAssertion, type FactId, factSet, factState } from './facts';
import type { FilingStatus } from './filing-status';
import type { RuleTrace } from './trace';
import { filingYearData } from './year-data';

export const TIPS_OVERTIME_FIRST_YEAR = 2025;
export const TIPS_OVERTIME_LAST_YEAR = 2028;
export const EMPLOYEE_FICA_RATE = 0.0765;

export type TipsOvertimeStatus = 'computed' | 'not-applicable' | 'refused' | 'none';

export interface TipsOvertimeDetermination {
  status: TipsOvertimeStatus;
  tips: {
    /** w2 + unreported + the capped SE portion — what the cap applies to. */
    qualified: number;
    afterCap: number;
    phaseoutReduction: number;
    allowed: number;
  };
  overtime: {
    premium: number;
    afterCap: number;
    phaseoutReduction: number;
    allowed: number;
  };
  /** The Sch 1-A line: both deductions together. */
  totalDeduction: number;
  /**
   * Form 4137 — the employee's Social Security and Medicare on tips the
   * employer never saw. NOT year-gated: the form predates the deduction.
   */
  form4137: { unreportedTips: number; ficaOwed: number } | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

export interface TipsOvertimeContext {
  /** MAGI for the phaseout — AGI is the working stand-in at this depth. */
  magi: number;
  filingStatus: FilingStatus | 'unknown';
  /** D4's net profit — the ceiling on self-employment tips. */
  seNetProfit: number;
  /** For the 4137 wage-base guard on the Social Security share. */
  w2Wages: number;
}

const CITE =
  'Schedule 1-A (OBBBA §§224/225, TY2025–2028); IRS OBBBA newsroom (verified 2026-08); Form 4137 instructions';

export function determineTipsOvertime(
  assertions: FactAssertion[],
  taxYear: number,
  ctx: TipsOvertimeContext,
): TipsOvertimeDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const bool = (id: FactId): boolean | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };

  const zeroLine = { qualified: 0, afterCap: 0, phaseoutReduction: 0, allowed: 0 };
  const finish = (
    partial: Partial<TipsOvertimeDetermination> & { status: TipsOvertimeStatus },
  ): TipsOvertimeDetermination => ({
    tips: { ...zeroLine },
    overtime: { premium: 0, afterCap: 0, phaseoutReduction: 0, allowed: 0 },
    totalDeduction: 0,
    form4137: null,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'tips-overtime/sch-1a',
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

  // ── Form 4137 first: it exists in every year, deduction or none ──
  const unreportedTips = num('unreported-tips') ?? 0;
  let form4137: TipsOvertimeDetermination['form4137'] = null;
  if (unreportedTips > 0) {
    const wageBase = FEDERAL_TAX_DATA[taxYear]?.ssWageBase ?? Number.POSITIVE_INFINITY;
    const ssPortion = Math.max(0, Math.min(unreportedTips, wageBase - ctx.w2Wages)) * 0.062;
    const medicarePortion = unreportedTips * 0.0145;
    form4137 = {
      unreportedTips,
      ficaOwed: ssPortion + medicarePortion,
    };
    notes.push(
      `$${unreportedTips} of tips the employer never saw: Form 4137 reports them, and the employee share of Social Security and Medicare — $${Math.round(form4137.ficaOwed)} — comes due with the return. Reporting them is not optional; it is also what makes them count for the tip deduction.`,
    );
  }

  const w2Tips = num('w2-tips') ?? 0;
  const seTipsRaw = num('se-tips-portion') ?? 0;
  const overtimePremium = num('overtime-premium-pay') ?? 0;
  const anyTips = w2Tips > 0 || unreportedTips > 0 || seTipsRaw > 0;

  if (!anyTips && overtimePremium <= 0) {
    return finish({ status: 'none', form4137 });
  }

  // ── The window: TY2025–2028, then the sunset — named, not silent ──
  if (taxYear < TIPS_OVERTIME_FIRST_YEAR || taxYear > TIPS_OVERTIME_LAST_YEAR) {
    notes.push(
      taxYear > TIPS_OVERTIME_LAST_YEAR
        ? `The tips and overtime deductions sunset after TY${TIPS_OVERTIME_LAST_YEAR} — for ${taxYear} the income is fully taxable again, as it was before 2025.`
        : `TY${taxYear} predates the tips and overtime deductions (they begin in ${TIPS_OVERTIME_FIRST_YEAR}) — the income is fully taxable.`,
    );
    return finish({ status: 'not-applicable', form4137 });
  }

  const year = filingYearData(taxYear);
  if (year === null) {
    notes.push(`Figures for ${taxYear} aren't loaded — refusing to guess the caps.`);
    return finish({ status: 'not-applicable', form4137 });
  }
  const law = year.tipsOvertime;

  // ── Married filing separately: the act requires a joint return ──
  if (ctx.filingStatus === 'mfs') {
    return finish({
      status: 'refused',
      form4137,
      refusals: [
        'Married taxpayers must file JOINTLY to claim the tips or overtime deduction — on a separate return both are $0 by statute. This is one of the filing-status election’s real prices, and it belongs in that comparison.',
      ],
    });
  }

  const joint = ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss';
  const magiStart = joint ? law.magiStartJoint : law.magiStart;
  const excess = Math.max(0, ctx.magi - magiStart);
  const reduction = Math.ceil(excess / 1000) * law.reductionPer1000;

  // ── Tips: the occupation gate, then the arithmetic ──
  const listed = bool('tipped-occupation-listed');
  let tips = { ...zeroLine };
  if (anyTips) {
    if (listed === false) {
      notes.push(
        "The job isn't on Treasury's tipped-occupation list, so the tips here don't qualify for the deduction — the list is the statute's own fence, not Basis's. The income stays taxable as normal.",
      );
    } else if (listed === null) {
      missing.push('tipped-occupation-listed');
      notes.push(
        "Whether the job is on Treasury's tipped-occupation list is unresolved — the tip deduction computes at $0 until it is. A yes is worth the whole deduction; the list covers the obvious cases (servers, bartenders, delivery drivers, barbers).",
      );
    } else {
      // SE tips exist only up to the Schedule C's own profit — a losing
      // year can't mint a deduction from receipts already netted away.
      const seTips = Math.min(seTipsRaw, Math.max(0, ctx.seNetProfit));
      if (seTipsRaw > seTips) {
        notes.push(
          `Only $${seTips} of the $${seTipsRaw} of self-employment tips qualify — the deduction cannot exceed the business's own net profit.`,
        );
      }
      const qualified = w2Tips + unreportedTips + seTips;
      const afterCap = Math.min(qualified, law.tipsCap);
      const allowed = Math.max(0, afterCap - reduction);
      tips = { qualified, afterCap, phaseoutReduction: Math.min(reduction, afterCap), allowed };
      if (qualified > law.tipsCap) {
        notes.push(
          `Tips above the $${law.tipsCap} cap stay taxable: $${qualified} received, $${afterCap} deductible.`,
        );
      }
      if (allowed > 0) {
        notes.push(
          `$${allowed} of tips deduct from taxable income (Schedule 1-A) — income tax only. Social Security and Medicare still come out of every tip dollar, so the paycheck won't look like the headline said.`,
        );
      }
    }
  }

  // ── Overtime: premium-only by definition, no occupation gate ──
  let overtime = { premium: 0, afterCap: 0, phaseoutReduction: 0, allowed: 0 };
  if (overtimePremium > 0) {
    const cap = joint ? law.overtimeCapJoint : law.overtimeCapSingle;
    const afterCap = Math.min(overtimePremium, cap);
    const allowed = Math.max(0, afterCap - reduction);
    overtime = {
      premium: overtimePremium,
      afterCap,
      phaseoutReduction: Math.min(reduction, afterCap),
      allowed,
    };
    notes.push(
      `$${allowed} of overtime premium deducts — only the extra half of time-and-a-half counts (the FLSA §7 premium), never the whole overtime check.`,
    );
  }

  if (reduction > 0 && (tips.afterCap > 0 || overtime.afterCap > 0)) {
    notes.push(
      `Income above $${magiStart} phases both deductions out: $${law.reductionPer1000} lost per $1,000 over, so $${reduction} comes off each.`,
    );
  }
  if (taxYear === TIPS_OVERTIME_LAST_YEAR) {
    notes.push(
      `TY${TIPS_OVERTIME_LAST_YEAR} is the deduction's final year — the sunset is written into the act.`,
    );
  }

  return finish({
    status: 'computed',
    tips,
    overtime,
    totalDeduction: tips.allowed + overtime.allowed,
    form4137,
    missingFacts: missing,
  });
}
