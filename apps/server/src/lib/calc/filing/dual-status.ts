// ─── E5 · Dual-status years — the brief ────────────────────────────
// Arrival and departure years are genuinely specialist returns, and the
// contract is the best refusal in the product: detection plus a brief
// that makes the preparer conversation twenty minutes instead of two
// hours. The brief is the product — no dual-status return computation,
// ever (the fence, verbatim).
//
// Authority: Pub 519, dual-status chapter.
//
// What the brief holds is everything Basis already knows, organised:
//  - The residency start date and WHICH test set it (Pub 519: under
//    substantial presence, residency starts on the first day of
//    presence in the calendar year — A2 computes it; this module only
//    arranges it).
//  - The two windows, with the year's income facts listed against
//    them. The facts are ANNUAL totals — Basis cannot split a W-2 at a
//    June boundary and does not pretend to. Each line says so, which
//    makes "bring the pay stubs around the boundary date" the
//    preparer's first ask instead of their first discovery.
//  - The restrictions that will apply, so none of them lands as a
//    surprise in the meeting: no standard deduction, no joint return,
//    the statement requirement.
//  - The forms the preparer will file, by name.
//
// The cruel case lives in A2, not here: a December-arrival F-1 is
// exempt from day one — the exemption DEFERS the residency question
// entirely, so that year is nonresident, never dual-status. This
// module trusts A2's detection the same way E1 does.

import { FACT_REGISTRY, type FactAssertion, type FactId, factSet, factState } from './facts';
import { determineResidency } from './residency';
import type { RuleTrace } from './trace';

export interface DualStatusIncomeLine {
  factId: FactId;
  label: string;
  /** The annual total as asserted — the split is the preparer's work. */
  annualAmount: number;
}

export interface DualStatusBrief {
  /** Pub 519 first-day-of-presence rule; null when no date is on file. */
  residencyStart: string | null;
  testThatSetIt: string;
  /** Null exactly when residencyStart is — no invented boundary. */
  windows: {
    nonresident: { from: string; to: string };
    resident: { from: string; to: string };
  } | null;
  /** Annual income facts, listed for the split the preparer will make. */
  income: DualStatusIncomeLine[];
  restrictions: string[];
  forms: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'IRS Pub 519 — dual-status aliens (the chapter, whole)';

/** The income facts worth listing against the windows, when present. */
const INCOME_FACTS: FactId[] = [
  'w2-wages',
  'taxable-scholarship-income',
  'interest-income',
  'dividends-ordinary',
  'realized-short-gains',
  'realized-long-gains',
  'unemployment-income',
  'contract-income',
  'platform-income',
];

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Null when the year is not dual-status — the brief exists exactly when
 * A2 detects the straddle, and never otherwise.
 */
export function determineDualStatusBrief(
  assertions: FactAssertion[],
  taxYear: number,
): DualStatusBrief | null {
  const residency = determineResidency(assertions, taxYear);
  if (residency.status !== 'dual-status') return null;

  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [...residency.consumed];
  const notes: string[] = [];

  const income: DualStatusIncomeLine[] = [];
  for (const id of INCOME_FACTS) {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    if (s.status === 'known' && s.value.kind === 'number' && s.value.value > 0) {
      income.push({ factId: id, label: FACT_REGISTRY[id].label, annualAmount: s.value.value });
    }
  }
  if (income.length > 0) {
    notes.push(
      'Every amount below is the ANNUAL total as asserted — splitting each at the boundary date is the return preparation itself. Pay stubs and statements from the weeks around the boundary are the first thing to bring.',
    );
  }

  const start = residency.residencyStartDate ?? null;
  const windows =
    start !== null
      ? {
          nonresident: { from: `${taxYear}-01-01`, to: dayBefore(start) },
          resident: { from: start, to: `${taxYear}-12-31` },
        }
      : null;
  if (windows === null) {
    notes.push(
      'The first day of US presence this year is not on file — it IS the boundary between the two returns, and pinning it (passport stamps, the I-94 travel history) is the first fact to bring.',
    );
  }

  notes.push(
    'This split year is genuinely worth a professional — the brief above is everything already known, organised so that meeting is twenty minutes instead of two hours.',
  );

  return {
    residencyStart: start,
    testThatSetIt:
      'Substantial presence — residency starts on the first day of presence in the calendar year (Pub 519).',
    windows,
    income,
    restrictions: [
      'No standard deduction in either window — the dual-status year itemizes or takes nothing.',
      'No joint return, and no head-of-household — the shapes are single or married-filing-separately (a §6013 election could change this and is a preparer decision).',
      'The return carries a statement: Form 1040 for the resident window marked "Dual-Status Return", with Form 1040-NR attached as the statement for the nonresident window.',
      'Several credits are unavailable or limited in a dual-status year (education credits and the EITC among them) — the preparer will confirm which survive.',
    ],
    forms: [
      'Form 1040, marked "Dual-Status Return" (the resident window)',
      'Form 1040-NR, attached as "Dual-Status Statement" (the nonresident window)',
    ],
    explanation: {
      ruleId: 'dual-status/brief',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Residency starts', value: start ?? 'not on file' },
      ],
      notes,
    },
    consumed,
  };
}
