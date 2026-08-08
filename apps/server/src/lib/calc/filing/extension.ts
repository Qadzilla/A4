// ─── H3 · Extensions ───────────────────────────────────────────────
// The form people file in fear and misunderstand completely. An
// extension moves the paperwork six months and the money zero days,
// and the entire value of this slice is computing the payment that
// should ride along with it.
//
// Authority (verified 2026-08-07):
//   Form 4868 / irs.gov — "The extension is only for filing your
//     return." Pay what you owe by the April date regardless.
//   Failure to FILE — 5% of the tax due for each month or partial
//     month, to a maximum of 25%. More than 60 days late, a minimum
//     applies: $525 for due dates after 2025-12-31, $510 for due dates
//     in 2025 (or 100% of the underpayment, whichever is less).
//   Failure to PAY — 0.5% per month or partial month, maximum 25%.
//   Both in one month — the file penalty is reduced by the pay penalty,
//     so it is 4.5% + 0.5%, never 5.5%. That detail is why the
//     extension matters so much: it removes the 5% limb and leaves the
//     0.5% one, a tenfold difference.
//   CA (ftb.ca.gov) — "No application is required for an extension to
//     file." Automatic six months. Pay by April 15; FTB 3519 to pay by
//     post.
//   NY (tax.ny.gov) — Form IT-370, an automatic six-month extension.
//     If you owe, the payment is due by the original date.
//   MA (mass.gov, TIR 16-10) — automatic and formless, but ONLY if at
//     least 80% of the total tax is paid by the due date. Below that
//     the extension is null and void, and the late-FILING penalties
//     come back. That is the single most consequential extension rule
//     in the three states, and it turns on a number nobody knows they
//     need.
//
// The payment estimate is A4's machinery pointed at a different
// question. Pricing an unknown asks what knowing is worth; this asks
// what NOT knowing might cost, and answers with the expensive branch of
// every open question at once. That is deliberately not the likely
// year — it is the ceiling, and paying the ceiling makes the penalty
// arithmetic below vanish in every direction.

import { type YearEvaluation, evaluateYear } from './evaluation';
import type { FactAssertion, FactId, KnownFactValue } from './facts';
import { factSet, factState, makeAssertion } from './facts';
import { fork } from './forks';
import { INTAKE_QUESTIONS } from './intake';

export type ExtensionStatus =
  /** The year is ready, or the deadline has gone. Nothing to offer. */
  | 'not-needed'
  /** Not ready, deadline ahead — the extension is the move. */
  | 'recommended'
  /** The date has passed. An extension can no longer be filed for it. */
  | 'deadline-passed';

export interface AssumedWorst {
  factId: FactId;
  question: string;
  /** The value the estimate assumes, because it is the expensive one. */
  assumed: KnownFactValue;
  /** What assuming it costs, against the year on known facts alone. */
  costsIfTrue: number;
}

export interface ExtensionPayment {
  /** Send this. The most the year plausibly comes to, less what is paid. */
  amount: number;
  /** What the year comes to on what is actually known. */
  onKnownFacts: number;
  /** The ceiling itself, before withholding. */
  conservativeTotal: number;
  assumedWorst: AssumedWorst[];
  note: string;
}

export interface StateExtensionNote {
  stateCode: 'CA' | 'NY' | 'MA';
  /** Null when the state asks for no form at all. */
  form: string | null;
  automatic: boolean;
  detail: string;
  /** The condition that makes the extension real, where one exists. */
  condition: string | null;
}

export interface PenaltyExposure {
  /** The amount the penalties would run on. */
  unpaid: number;
  failureToFileMonthly: number;
  failureToPayMonthly: number;
  /** What one month of each costs on `unpaid`, in dollars. */
  oneMonthWithoutExtension: number;
  oneMonthWithExtension: number;
  minimumIfOver60Days: number;
  note: string;
}

export interface ExtensionAdvice {
  taxYear: number;
  status: ExtensionStatus;
  deadline: string;
  extendedDeadline: string;
  daysUntilDeadline: number;
  form: 'form-4868';
  payment: ExtensionPayment | null;
  states: StateExtensionNote[];
  exposure: PenaltyExposure | null;
  notes: string[];
}

const DAY_MS = 86_400_000;
const FAILURE_TO_FILE_MONTHLY = 0.05;
const FAILURE_TO_PAY_MONTHLY = 0.005;

/**
 * The minimum failure-to-file penalty once a return is more than 60
 * days late — or 100% of the underpayment if that is less. Keyed by the
 * year the return was DUE, per Doctrine 6: a rule, parameterised, not a
 * constant that silently ages.
 */
const MINIMUM_LATE_FILING: Record<number, number> = {
  2025: 510,
  2026: 525,
};

const money = (n: number): string => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const ASKED_AS = new Map(INTAKE_QUESTIONS.map((q) => [q.factId, q.prompt]));

export interface ExtensionInput {
  assertions: FactAssertion[];
  taxYear: number;
  today: Date;
  /** A6's verdict. The offer only makes sense when the year isn't ready. */
  ready: boolean;
  /** The state the year is filed in, when one is known. */
  stateCode: string | null;
  extras?: Parameters<typeof evaluateYear>[2];
}

export function extensionAdvice(input: ExtensionInput): ExtensionAdvice {
  const { assertions, taxYear, today } = input;
  const deadline = `${taxYear + 1}-04-15`;
  const extendedDeadline = `${taxYear + 1}-10-15`;
  const daysUntilDeadline = Math.floor(
    (new Date(`${deadline}T23:59:59Z`).getTime() - today.getTime()) / DAY_MS,
  );

  const notes: string[] = [];
  const base: Omit<ExtensionAdvice, 'status' | 'payment' | 'exposure'> = {
    taxYear,
    deadline,
    extendedDeadline,
    daysUntilDeadline,
    form: 'form-4868',
    states: stateNotes(input.stateCode, deadline, extendedDeadline),
    notes,
  };

  if (daysUntilDeadline < 0) {
    notes.push(
      `The ${deadline} deadline has passed, so an extension is no longer available for ${taxYear}. Filing now stops the late-filing penalty growing — it runs per month until the return is in.`,
    );
    return { ...base, status: 'deadline-passed', payment: null, exposure: null };
  }

  // A ready year needs no extension, and offering one anyway is the
  // nag that teaches people to ignore the page.
  if (input.ready) {
    return { ...base, status: 'not-needed', payment: null, exposure: null };
  }

  const known = evaluateYear(assertions, taxYear, input.extras);
  const conservative = conservativeYear(assertions, taxYear, input.extras);

  // A year the engine cannot evaluate has no ceiling to offer, and
  // `?? 0` would have quietly presented ZERO as "the most you plausibly
  // owe" — the most dangerous possible number to be wrong about here.
  // The extension itself is still worth filing; it costs nothing and
  // removes the larger penalty either way.
  if (conservative.evaluation.liability === null) {
    notes.push(
      'File the extension regardless — it is free, it takes minutes, and it removes the late-filing penalty whatever the year turns out to be.',
    );
    notes.push(
      `What cannot be worked out yet is how much to send with it: ${blockedReason(conservative.evaluation)} Until that is settled there is no honest ceiling to give you, and a figure invented here would be the worst kind of wrong — the kind that looks like an answer.`,
    );
    return { ...base, status: 'recommended', payment: null, exposure: null };
  }

  const withheld = known.liability?.federalWithheld ?? 0;
  const onKnownFacts = known.liability?.federalTax ?? conservative.evaluation.liability.federalTax;
  const conservativeTotal = conservative.evaluation.liability.federalTax;
  const amount = Math.max(0, conservativeTotal - withheld);

  notes.push(
    'An extension buys six months to file and no extra time at all to pay. The figure below is the most this year plausibly comes to — sending it means nothing accrues in either direction, and anything overpaid comes back with the return.',
  );

  if (conservative.assumedWorst.length > 0) {
    notes.push(
      `It assumes every open question lands the expensive way at once, which is unlikely — that is what makes it safe rather than accurate. On what is actually known the year comes to ${money(onKnownFacts)}.`,
    );
  }

  return {
    ...base,
    status: 'recommended',
    payment: {
      amount,
      onKnownFacts: Math.max(0, onKnownFacts - withheld),
      conservativeTotal,
      assumedWorst: conservative.assumedWorst,
      note:
        conservative.assumedWorst.length === 0
          ? 'Nothing about this year is open in a way that could increase the tax, so this is simply what it comes to.'
          : `The gap between ${money(Math.max(0, onKnownFacts - withheld))} and ${money(amount)} is what the open questions could cost.`,
    },
    exposure: exposureFor(amount, taxYear),
  };
}

/** Why a year cannot be totalled, in the words the engine already used. */
function blockedReason(evaluation: YearEvaluation): string {
  const note = evaluation.notes.find((n) => n.length > 0);
  if (note !== undefined) return note;
  const blocked = evaluation.blocked[0];
  return blocked !== undefined
    ? `the year cannot be totalled while ${blocked} is unresolved.`
    : 'not enough of the year is known yet.';
}

// ─── The conservative branch ───────────────────────────────────────

export interface ConservativeYear {
  evaluation: YearEvaluation;
  assumedWorst: AssumedWorst[];
}

/**
 * The year with every open question landing the expensive way.
 *
 * Built one fact at a time — for each forkable unknown, evaluate both
 * branches with everything else as asserted, keep whichever costs more,
 * then run the whole year ONCE with all the expensive answers in place.
 * The per-fact step is a single-fact fork, which is A4's fence; the
 * final evaluation is not a fork at all but a hypothetical year, and it
 * is never shown as a price or a prediction.
 *
 * The property this guarantees, and which the test pins: the result is
 * at least as large as the worst branch of every individual fork. A
 * ceiling that some single unknown could exceed would not be a ceiling.
 */
export function conservativeYear(
  assertions: FactAssertion[],
  taxYear: number,
  extras?: Parameters<typeof evaluateYear>[2],
): ConservativeYear {
  const baseline = evaluateYear(assertions, taxYear, extras).liability?.federalTax ?? 0;
  const set = factSet(assertions, taxYear);

  const assumedWorst: AssumedWorst[] = [];
  const hypothetical: FactAssertion[] = [];
  let n = 0;

  for (const question of INTAKE_QUESTIONS) {
    const state = factState(set, question.factId);
    if (state.status === 'known' || state.status === 'contradicted') continue;

    const result = fork(assertions, taxYear, question.factId);
    if (!result.ok) continue;

    let worstValue: KnownFactValue | null = null;
    let worstTax = baseline;
    for (const branch of result.branches) {
      const tax = branch.evaluation.liability?.federalTax ?? null;
      if (tax === null) continue;
      if (tax > worstTax) {
        worstTax = tax;
        worstValue = branch.assumed;
      }
    }
    if (worstValue === null) continue;

    assumedWorst.push({
      factId: question.factId,
      question: ASKED_AS.get(question.factId) ?? question.prompt,
      assumed: worstValue,
      costsIfTrue: worstTax - baseline,
    });
    hypothetical.push(
      makeAssertion({
        assertionId: `conservative-${++n}`,
        factId: question.factId,
        taxYear,
        value: worstValue,
        // A rule asserted this, and it consumed nothing — it is a
        // hypothesis, and it is never persisted.
        source: { kind: 'rule', ruleId: 'extension/conservative-branch', consumed: [] },
        assertedAt: '9999-12-31T00:00:00Z',
        supersedes: null,
      } as Parameters<typeof makeAssertion>[0]),
    );
  }

  return {
    evaluation: evaluateYear([...assertions, ...hypothetical], taxYear, extras),
    assumedWorst: assumedWorst.sort((a, b) => b.costsIfTrue - a.costsIfTrue),
  };
}

// ─── The states ────────────────────────────────────────────────────

function stateNotes(
  stateCode: string | null,
  deadline: string,
  extendedDeadline: string,
): StateExtensionNote[] {
  if (stateCode === 'CA') {
    return [
      {
        stateCode: 'CA',
        form: null,
        automatic: true,
        detail: `California asks for nothing — the six months to ${extendedDeadline} are automatic. What is not automatic is the money: pay what you owe by ${deadline}, using FTB 3519 if you are paying by post.`,
        condition: null,
      },
    ];
  }
  if (stateCode === 'NY') {
    return [
      {
        stateCode: 'NY',
        form: 'IT-370',
        automatic: true,
        detail: `New York wants its own form. IT-370 gives an automatic six months to ${extendedDeadline}, and if you owe, that payment is due by ${deadline} — the federal 4868 does not cover New York.`,
        condition: null,
      },
    ];
  }
  if (stateCode === 'MA') {
    return [
      {
        stateCode: 'MA',
        form: null,
        automatic: true,
        detail: `Massachusetts asks for no form either, but its extension has a condition attached that the other two don't.`,
        // The rule nobody knows they need, and the reason the payment
        // estimate above is not optional in Massachusetts.
        condition: `At least 80% of the total Massachusetts tax has to be paid by ${deadline}. Below that the extension is void — not reduced, void — and the late-filing penalties apply as though it had never existed.`,
      },
    ];
  }
  return [];
}

// ─── What the estimate avoids ──────────────────────────────────────

function exposureFor(unpaid: number, taxYear: number): PenaltyExposure {
  const minimum = MINIMUM_LATE_FILING[taxYear + 1] ?? null;
  const withoutExtension = unpaid * FAILURE_TO_FILE_MONTHLY;
  const withExtension = unpaid * FAILURE_TO_PAY_MONTHLY;

  return {
    unpaid,
    failureToFileMonthly: FAILURE_TO_FILE_MONTHLY,
    failureToPayMonthly: FAILURE_TO_PAY_MONTHLY,
    oneMonthWithoutExtension: withoutExtension,
    oneMonthWithExtension: withExtension,
    minimumIfOver60Days: minimum ?? 0,
    note:
      unpaid <= 0
        ? 'With nothing owed there is nothing for a late-payment penalty to run on. The extension still matters for the filing side.'
        : `Late filing runs at 5% of what is unpaid per month, late payment at 0.5% — on ${money(unpaid)} that is ${money(withoutExtension)} a month against ${money(withExtension)}. Both cap at 25%, and in any month where both apply the filing penalty is reduced by the payment one, so it is never 5.5%. The extension removes the larger limb entirely.${
            minimum !== null
              ? ` A return more than 60 days late also carries a minimum of ${money(minimum)}, or the full underpayment if that is smaller.`
              : ''
          }`,
  };
}
