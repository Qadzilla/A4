// ─── H4 · Prior unfiled years ──────────────────────────────────────
// P8's fear, dismantled. The person who hasn't filed in three years
// believes they are in trouble. Usually the opposite is true: they were
// owed money in every one of those years, the clock to claim it is
// running out one year at a time, and the documents they think they
// lost are sitting in an IRS transcript they can pull this afternoon.
//
// Authority (verified 2026-08-07, irs.gov "Filing past due tax returns"):
//   "If you are due a refund for withholding or estimated taxes, you
//     must file your return to claim it within 3 years of the return
//     due date." — note DUE DATE. This is NOT H2's clock: an amendment
//     runs three years from when the return was FILED, and a year never
//     filed has no filing date to run from. Conflating the two would
//     hand people months they don't have.
//   "The same rule applies to a right to claim tax credits such as the
//     Earned Income Credit." — the credits die with the refund.
//   Getting the paperwork back: Form 4506-T with the box on line 8, or
//     the Wage & Income transcript online.
//   No penalty on a refund year — not as a slogan but as arithmetic:
//     the failure-to-file penalty is "5% of the tax due (less any tax
//     paid on time and available credits)". With nothing due there is
//     nothing for the percentage to run on. That is why it is safe to
//     say plainly.
//
// The framing has to flip per year and not per person. Someone with two
// refund years and one owing year needs to hear both things about the
// right years — telling them "no penalty, relax" across the board would
// be wrong about the year that matters most.

import type { YearEvaluation } from './evaluation';
import { yearRulesLoaded } from './year-data';

export type YearSupport = 'supported' | 'rules-not-loaded';
export type ForfeitStatus = 'open' | 'closing-soon' | 'forfeited';

export interface PriorYear {
  taxYear: number;
  support: YearSupport;
  /** Present exactly when unsupported — the refusal that names itself. */
  refusal: string | null;
  /** Three years from the return's due date. */
  forfeitDate: string;
  daysRemaining: number;
  status: ForfeitStatus;
  estimate: {
    direction: 'refund' | 'owed' | 'nothing';
    amount: number;
    /** Set only on a refund year. */
    noPenaltyNote: string | null;
    /** Set only on a year that owes. */
    owedNote: string | null;
  } | null;
  /** How much is actually on file for the year, so the estimate is read right. */
  factsOnFile: number;
  documentsOnFile: number;
}

export interface PriorYearsReview {
  years: PriorYear[];
  headline: string;
  transcript: { how: string; why: string };
  notes: string[];
}

const DAY_MS = 86_400_000;
const CLOSING_SOON_DAYS = 120;

const money = (n: number): string => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export interface PriorYearInput {
  taxYear: number;
  /** Null when the year cannot be evaluated at all. */
  evaluation: YearEvaluation | null;
  factsOnFile: number;
  documentsOnFile: number;
}

export function reviewPriorYears(years: PriorYearInput[], today: Date): PriorYearsReview {
  const reviewed = years.map((y) => assess(y, today));

  // Oldest-expiring first — the ordering IS the advice. A forfeited year
  // sinks to the bottom: there is nothing left to do about it, and
  // leading with it would bury the ones still worth money.
  reviewed.sort((a, b) => {
    const aDead = a.status === 'forfeited';
    const bDead = b.status === 'forfeited';
    if (aDead !== bDead) return aDead ? 1 : -1;
    return a.forfeitDate.localeCompare(b.forfeitDate);
  });

  return {
    years: reviewed,
    headline: headlineFor(reviewed),
    transcript: {
      how: 'Form 4506-T with the box on line 8 ticked, or the Wage & Income transcript through an IRS online account.',
      why: "It lists every form anyone reported to the IRS about you for that year — W-2s, 1099s, the lot. You do not need to find your old paperwork, and you do not need to ask an employer you'd rather not contact.",
    },
    notes: notesFor(reviewed),
  };
}

function assess(input: PriorYearInput, today: Date): PriorYear {
  const { taxYear } = input;
  const dueDate = `${taxYear + 1}-04-15`;
  // Three years from the DUE date. Not from filing — there was no filing.
  const forfeitDate = `${taxYear + 4}-04-15`;
  const msRemaining = new Date(`${forfeitDate}T23:59:59Z`).getTime() - today.getTime();
  const daysRemaining = Math.floor(msRemaining / DAY_MS);
  const status: ForfeitStatus =
    msRemaining < 0 ? 'forfeited' : daysRemaining <= CLOSING_SOON_DAYS ? 'closing-soon' : 'open';

  const base = {
    taxYear,
    forfeitDate,
    daysRemaining,
    status,
    factsOnFile: input.factsOnFile,
    documentsOnFile: input.documentsOnFile,
  };

  if (!yearRulesLoaded(taxYear)) {
    return {
      ...base,
      support: 'rules-not-loaded',
      refusal: `Basis cannot compute ${taxYear}. That year's rate schedules, deduction amounts and limits are not loaded, and running it on another year's numbers would produce a figure that looks right and isn't. The return still needs filing — with a preparer, or with software that covers that year — and everything below about the deadline and the transcript applies to it either way.`,
      estimate: null,
    };
  }

  const liability = input.evaluation?.liability ?? null;
  if (liability === null) {
    return { ...base, support: 'supported', refusal: null, estimate: null };
  }

  const owed = liability.refundOrOwed;
  const direction = Math.round(owed) === 0 ? 'nothing' : owed < 0 ? 'refund' : 'owed';

  return {
    ...base,
    support: 'supported',
    refusal: null,
    estimate: {
      direction,
      amount: Math.abs(owed),
      // Only on a refund year. Saying it on a year that owes would be
      // the most expensive sentence in the product.
      noPenaltyNote:
        direction === 'refund'
          ? `Filing this one late costs nothing. The late-filing penalty is a percentage of the tax due, and nothing is due — the only thing at risk is the ${money(owed)} itself, which stops being claimable on ${forfeitDate}.`
          : null,
      owedNote:
        direction === 'owed'
          ? `This year owes ${money(owed)}, so the late-filing penalty does apply and it has been running since ${dueDate} — 5% of what is unpaid for each month, up to 25%, plus 0.5% a month for the late payment. It stops growing the day the return goes in, which is why this one is worth doing first even though its deadline is not the nearest.`
          : null,
    },
  };
}

function headlineFor(years: PriorYear[]): string {
  if (years.length === 0) return 'No prior years are outstanding.';

  const refunds = years.filter(
    (y) => y.estimate?.direction === 'refund' && y.status !== 'forfeited',
  );
  const soonest = years.find((y) => y.status !== 'forfeited');
  const forfeited = years.filter((y) => y.status === 'forfeited');
  const owing = years.filter((y) => y.estimate?.direction === 'owed');

  const parts: string[] = [];

  if (refunds.length > 0) {
    const total = refunds.reduce((sum, y) => sum + (y.estimate?.amount ?? 0), 0);
    parts.push(
      refunds.length === 1
        ? `${refunds[0]?.taxYear} looks like a refund of about ${money(total)}.`
        : `${refunds.length} of these years look like refunds — about ${money(total)} between them.`,
    );
  }
  if (soonest !== undefined) {
    parts.push(
      soonest.daysRemaining <= CLOSING_SOON_DAYS
        ? `${soonest.taxYear} expires on ${soonest.forfeitDate}, in ${soonest.daysRemaining} days, so it goes first.`
        : `${soonest.taxYear} expires first, on ${soonest.forfeitDate}.`,
    );
  }
  if (owing.length > 0) {
    parts.push(
      `${owing.map((y) => y.taxYear).join(' and ')} owes rather than refunds, and the penalty on that one is still growing.`,
    );
  }
  if (forfeited.length > 0) {
    parts.push(
      `${forfeited.map((y) => y.taxYear).join(', ')} passed the three-year line — any refund from ${forfeited.length === 1 ? 'that year' : 'those years'} is gone.`,
    );
  }
  return parts.join(' ');
}

function notesFor(years: PriorYear[]): string[] {
  const notes: string[] = [];

  if (years.some((y) => y.estimate?.direction === 'refund')) {
    notes.push(
      'Credits go with the refund. The Earned Income Credit and the education credits are claimed on the return, so a year past its three-year line loses those too — often more than the withholding itself.',
    );
  }
  if (years.some((y) => y.estimate?.direction === 'owed')) {
    notes.push(
      'For a year that owes, both a payment plan and penalty relief exist. Basis names them and does not advise on either — which one applies, and whether it is worth asking for, is a conversation with the IRS or with someone who does this for a living.',
    );
  }
  if (years.some((y) => y.support === 'rules-not-loaded')) {
    notes.push(
      'A year Basis cannot compute is still a year worth filing. The deadline, the transcript and the no-penalty-on-a-refund rule apply to it exactly the same — the only missing piece is the arithmetic.',
    );
  }
  notes.push(
    'Basis does not read a transcript automatically yet, so figures from one go in by hand. Getting it is still the fastest way to find out what a year actually contained.',
  );
  return notes;
}
