// ─── H5 · Next year's lever ────────────────────────────────────────
// The only form here that changes the future. Everything else in this
// engine describes a year that already happened; the W-4 is where this
// year's outcome becomes next year's paycheck.
//
// The whole slice exists because the usual advice is obsolete. "Claim
// fewer allowances" has been wrong since 2020 — allowances do not exist
// on the form any more. What exists are dollar boxes, and this module
// computes the number that goes in one.
//
// Authority (Form W-4 (2026), read directly, 2026-08-07):
//   Step 3 — "If your total income will be $200,000 or less ($400,000
//     or less if married filing jointly)". Qualifying children under 17
//     × $2,200, other dependents × $500, PLUS other credits. Page 2:
//     "Including these credits will increase your paycheck and reduce
//     the amount of any refund you may receive." An annual dollar
//     amount, subtracted from annual withholding.
//   Step 4(a) — "the total of your other estimated income for the year
//     ... You shouldn't include income from any jobs or
//     SELF-EMPLOYMENT." That exclusion matters: 4(a) is the wrong line
//     for a side gig, and the obvious-looking answer is the wrong one.
//     "If you prefer to pay estimated tax rather than having tax on
//     other income withheld from your paycheck, see Form 1040-ES."
//   Step 4(b) — deductions beyond the basic standard deduction:
//     "qualified tips, overtime compensation, and passenger vehicle
//     loan interest; student loan interest; IRAs; and seniors."
//   Step 4(c) — "any additional tax you want withheld from your pay
//     each PAY PERIOD ... will reduce your paycheck and will either
//     increase your refund or reduce any amount of tax that you owe."
//   Self-employment (page 2) — "If you want to pay these taxes through
//     withholding from your wages, use the estimator at
//     www.irs.gov/W4App to figure the amount to have withheld."
//
// The divisor is REMAINING pay periods, never the year's total. Someone
// fixing their withholding in September has fourteen paychecks left,
// not twenty-six, and dividing by twenty-six leaves them short by half.

import type { FilingStatus } from './filing-status';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Step 3 is unavailable above these — the form says so on its face. */
const STEP_3_INCOME_LIMIT = 200_000;
const STEP_3_INCOME_LIMIT_JOINT = 400_000;

export interface W4Line {
  step: '3' | '4(a)' | '4(b)' | '4(c)';
  label: string;
  amount: number;
  /** 4(c) is per pay period; every other line is an annual figure. */
  basis: 'annual' | 'per-pay-period';
  /** Plain words: what this box does to a paycheck. */
  how: string;
  citation: string;
}

export interface Instrument {
  id: 'w4-extra-withholding' | 'quarterly-estimates';
  label: string;
  /** What each payment is. */
  each: number;
  occurrences: number;
  rhythm: string;
  total: number;
  note: string;
}

export type WithholdingDirection = 'under-withheld' | 'over-withheld' | 'on-target';

export interface W4Advice {
  /** The year the new W-4 affects. */
  forTaxYear: number;
  /** The completed year it was computed from. */
  basedOn: number;
  direction: WithholdingDirection;
  /** Signed: positive owed at filing, negative refunded. */
  gap: number;
  payFrequency: PayFrequency;
  periodsPerYear: number;
  remainingPayPeriods: number;
  lines: W4Line[];
  /** Both ways to hit the same target, priced. Never one recommended. */
  instruments: Instrument[];
  /** The refund-as-a-choice framing. Both directions, no verb. */
  framing: string[];
  notes: string[];
}

const money = (n: number): string => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/**
 * Pay periods left in the year, counted from today.
 *
 * The cruel case the contract names: someone changing jobs in September
 * has a fraction of the year left, and dividing the shortfall by the
 * full twenty-six leaves them owing half of it again next April.
 */
export function remainingPayPeriods(frequency: PayFrequency, today: Date, taxYear: number): number {
  const periods = PERIODS_PER_YEAR[frequency];
  const start = new Date(`${taxYear}-01-01T00:00:00Z`).getTime();
  const end = new Date(`${taxYear}-12-31T23:59:59Z`).getTime();
  const now = today.getTime();

  if (now <= start) return periods;
  if (now >= end) return 0;
  const fractionLeft = (end - now) / (end - start);
  // Floor: a partial period is one you cannot withhold from twice.
  return Math.max(1, Math.floor(periods * fractionLeft));
}

export interface W4Input {
  /** The completed year's outcome. */
  basedOn: number;
  /** Signed: positive owed, negative refunded. */
  gap: number;
  /** Total income, for Step 3's ceiling. */
  income: number;
  filingStatus: FilingStatus;
  /** Self-employment profit, which 4(a) explicitly excludes. */
  selfEmploymentIncome: number;
  payFrequency: PayFrequency;
  today: Date;
  /** The safe-harbor target from quarterly.ts, when one applies. */
  safeHarborShortfall: number | null;
}

export function w4Advice(input: W4Input): W4Advice {
  const forTaxYear = input.basedOn + 1;
  const periodsPerYear = PERIODS_PER_YEAR[input.payFrequency];
  const remaining = remainingPayPeriods(input.payFrequency, input.today, forTaxYear);

  const direction: WithholdingDirection =
    Math.round(input.gap) === 0 ? 'on-target' : input.gap > 0 ? 'under-withheld' : 'over-withheld';

  const lines: W4Line[] = [];
  const instruments: Instrument[] = [];
  const notes: string[] = [];

  // ── Under-withheld: the clean case ──
  if (direction === 'under-withheld') {
    const perPeriod = Math.ceil(input.gap / Math.max(1, remaining));
    lines.push({
      step: '4(c)',
      label: 'Extra withholding',
      amount: perPeriod,
      basis: 'per-pay-period',
      how: `${money(input.gap)} spread over the ${remaining} paychecks left this year. Your employer takes this on top of the usual amount, every time you are paid.`,
      citation: 'Form W-4, Step 4(c)',
    });

    // The side-gig case, and the trap in it: 4(a) looks like the box for
    // "money from elsewhere" and explicitly is not, for this kind.
    if (input.selfEmploymentIncome > 0) {
      notes.push(
        'The freelance money does not go in Step 4(a). That box is for income like interest and dividends, and the form says outright it "shouldn\'t include income from any jobs or self-employment" — so the way to cover it through your job is Step 4(c) above.',
      );
      notes.push(
        "Self-employment income owes both income tax and self-employment tax. The IRS's own estimator at irs.gov/W4App is what works out the withholding figure that covers both, and it is worth ten minutes.",
      );
    } else if (input.gap > 0 && input.selfEmploymentIncome === 0) {
      lines.push({
        step: '4(a)',
        label: 'Other income (not from jobs)',
        amount: 0,
        basis: 'annual',
        how: 'Only if income arrives with no withholding on it at all — interest, dividends, retirement money. Leave it empty otherwise; Step 4(c) above already covers the gap.',
        citation: 'Form W-4, Step 4(a)',
      });
    }

    // Two instruments, same target, different rhythm. Neither preferred.
    instruments.push({
      id: 'w4-extra-withholding',
      label: 'Take it out of your paycheck',
      each: perPeriod,
      occurrences: remaining,
      rhythm: `${money(perPeriod)} per paycheck, ${remaining} times`,
      total: perPeriod * remaining,
      note: 'One form to your employer and nothing else to remember. Money withheld counts as paid evenly across the year regardless of when it came out, which is what keeps the underpayment penalty away.',
    });
    if (input.safeHarborShortfall !== null && input.safeHarborShortfall > 0) {
      const quarterly = Math.ceil(input.safeHarborShortfall / 4);
      instruments.push({
        id: 'quarterly-estimates',
        label: 'Send it yourself, four times a year',
        each: quarterly,
        occurrences: 4,
        rhythm: `${money(quarterly)} four times, in April, June, September and January`,
        total: quarterly * 4,
        note: 'Your paycheck stays whole and you send the money directly. It has to land by each deadline — a quarter paid late is a quarter that counts late, even if the year totals correctly.',
      });
    }
  }

  // ── Over-withheld: the honest version, which is not a number ──
  if (direction === 'over-withheld') {
    const perPeriod = Math.round(Math.abs(input.gap) / periodsPerYear);
    const limit =
      input.filingStatus === 'mfj' || input.filingStatus === 'qss'
        ? STEP_3_INCOME_LIMIT_JOINT
        : STEP_3_INCOME_LIMIT;

    if (input.income <= limit) {
      lines.push({
        step: '3',
        label: 'Claim Dependent and Other Credits',
        amount: Math.abs(input.gap),
        basis: 'annual',
        how: `Step 3 is an annual dollar figure and it comes straight off what is withheld, so ${money(input.gap)} here is roughly ${money(perPeriod)} more in each paycheck. It is only for credits you are actually entitled to — dependents, education, foreign tax — so this is the figure to aim at, not a number to write in regardless.`,
        citation: 'Form W-4, Step 3',
      });
    } else {
      notes.push(
        `Step 3 is closed above ${money(limit)} of income for this filing status — the form says so on its face — so the lever for an over-withheld year here is Step 4(b), or the estimator.`,
      );
    }

    lines.push({
      step: '4(b)',
      label: 'Deductions',
      amount: 0,
      basis: 'annual',
      how: "The other legitimate way down. It covers deductions beyond the standard one — student loan interest, money into an IRA, qualified tips and overtime — worked out on the form's own Deductions Worksheet.",
      citation: 'Form W-4, Step 4(b) and its Deductions Worksheet',
    });

    // The part most tools skip, and the part that is actually true.
    notes.push(
      'If neither of those describes you, the over-withholding is coming from something already on your current W-4 rather than something missing — most often Step 2 being ticked for a second job that ended, or a filing status that has changed. The estimator at irs.gov/W4App reads your latest payslip and says which.',
    );
  }

  if (direction === 'on-target') {
    notes.push(
      'Last year came out within a dollar. Whatever is on your W-4 is doing its job — nothing needs changing unless your life did.',
    );
  }

  return {
    forTaxYear,
    basedOn: input.basedOn,
    direction,
    gap: input.gap,
    payFrequency: input.payFrequency,
    periodsPerYear,
    remainingPayPeriods: remaining,
    lines,
    instruments,
    framing: framingFor(direction, input.gap, periodsPerYear),
    notes,
  };
}

/**
 * Both directions, stated, neither recommended.
 *
 * A refund is a choice that was made by default rather than on purpose,
 * and the job here is to make it a choice — not to imply the person got
 * it wrong. Plenty of people want the forced saving and are right to.
 * G3's sweep applies: no "should", no "smart", no "better".
 */
function framingFor(
  direction: WithholdingDirection,
  gap: number,
  periodsPerYear: number,
): string[] {
  if (direction === 'over-withheld') {
    const perPeriod = Math.round(Math.abs(gap) / periodsPerYear);
    return [
      `A refund is money that was already yours. ${money(gap)} came out of your pay across the year and sat with the Treasury, earning you nothing, until you asked for it back.`,
      `Changed, that is about ${money(perPeriod)} more in every paycheck instead of ${money(gap)} once in the spring.`,
      'Left alone, it is a way of saving that happens whether or not you feel like saving, and arrives as a lump sum when it might be most useful. That is a real reason to keep it.',
      'Both are ordinary. The figures are above; the choice is yours.',
    ];
  }
  if (direction === 'under-withheld') {
    const perPeriod = Math.round(Math.abs(gap) / periodsPerYear);
    return [
      `${money(gap)} was due in April that had not come out of your pay. Spread forward, that is roughly ${money(perPeriod)} a paycheck.`,
      'Paid through the year, April stops being an event. Left as it is, the bill arrives at once — and if it grows past a threshold, an underpayment penalty attaches to it.',
      'Both figures are above.',
    ];
  }
  return [];
}
