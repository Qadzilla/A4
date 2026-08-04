// ─── E4 · FICA refund detection (Forms 843 + 8316) ─────────────────
// The single best found-money in the product: Social Security and
// Medicare withheld from an exempt student's paycheck that was never
// owed, sitting with the Treasury until asked for. Employers get this
// wrong constantly, nobody tells the student, and the money is real —
// box 4 plus box 6 of the very W-2 already on file.
//
// Authority: Pub 519 (student FICA exemption — IRC §3121(b)(19));
// Form 843 and Form 8316 instructions.
//
// The shape of the recovery, exactly as the person will walk it:
//   1. The employer first — the IRS requires asking them before filing,
//      and the letter's contents are outlined here so that step costs
//      ten minutes, not a research project.
//   2. If the employer refuses, is defunct, or doesn't answer: the
//      843 + 8316 package. Form 8316 EXISTS to document the refusal.
//      The document checklist is listed in full (the prior-year 8843s
//      E2 chased are part of it — the paper trails connect).
//   3. The reality: 3–6 months, paper, no e-file. And the clock: a
//      refund claim runs 3 years from the return's due date — for each
//      W-2's year, its own deadline, computed here.
//
// A2 decides WHO: residency.ficaExempt (nonresident on a student visa,
// authorized work). The cruel case rides that word "authorized" — the
// exemption covers authorized employment (on-campus, CPT, OPT), and a
// known-unauthorized arrangement refuses the guess by name. Unasserted
// authorization fires with the assumption stated, because on-campus
// work — the overwhelming case — is authorized by definition.
//
// Fences: no 843/8316 PDF generation (H-phase, same posture as the
// manifest-before-PDFs decision); a dual-status year names the partial
// year for a preparer rather than pro-rating months v1 can't see.

import { type FactAssertion, type FactId, factSet, factState } from './facts';
import { determineResidency } from './residency';
import type { RuleTrace } from './trace';

export type FicaRefundStatus = 'found' | 'none' | 'refused';

export interface FicaRefundFinding {
  status: FicaRefundStatus;
  taxYear: number;
  ssWithheld: number;
  medicareWithheld: number;
  /** The found money: box 4 + box 6, recoverable in full. */
  total: number;
  /** Step 1 — what the letter to the employer says. */
  employerLetter: string[];
  /** Step 2 — the package, when the employer refuses or is gone. */
  packageForms: string[];
  packageDocuments: string[];
  /** ISO date the claim window closes: 3 years from the return due date. */
  claimWindowEnds: string | null;
  /** The 3–6 month paper reality, in words. */
  expectation: string | null;
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE =
  'Pub 519 (student FICA exemption, IRC §3121(b)(19)); Form 843 / Form 8316 instructions';

export function determineFicaRefund(
  assertions: FactAssertion[],
  taxYear: number,
): FicaRefundFinding {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const boolFact = (id: FactId): boolean | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };

  const finish = (
    partial: Partial<FicaRefundFinding> & { status: FicaRefundStatus },
  ): FicaRefundFinding => ({
    taxYear,
    ssWithheld: 0,
    medicareWithheld: 0,
    total: 0,
    employerLetter: [],
    packageForms: [],
    packageDocuments: [],
    claimWindowEnds: null,
    expectation: null,
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'fica-refund/843-8316',
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

  const ss = num('w2-ss-tax-withheld') ?? 0;
  const medicare = num('w2-medicare-tax-withheld') ?? 0;
  const total = ss + medicare;

  // Zero withheld: nothing to find — the payroll department got it right.
  if (total <= 0) {
    return finish({ status: 'none' });
  }

  const residency = determineResidency(assertions, taxYear);

  // The dual-status partial year: only the exempt months' withholding
  // qualifies, and v1 cannot see months — named for a preparer, never
  // pro-rated on a guess.
  if (residency.status === 'dual-status') {
    return finish({
      status: 'refused',
      ssWithheld: ss,
      medicareWithheld: medicare,
      total,
      refusals: [
        `$${Math.round(total)} of Social Security and Medicare was withheld in a dual-status year — only the exempt months' share is recoverable, and splitting a year into months is preparer work v1 does not attempt. The finding is named so the conversation is cheap; nothing is pro-rated on a guess.`,
      ],
    });
  }

  // The exemption belongs to the exempt-student year. A resident year —
  // including the year-six flip — owes FICA like anyone else, and the
  // finding must vanish rather than linger.
  if (!residency.ficaExempt) {
    return finish({ status: 'none', ssWithheld: ss, medicareWithheld: medicare, total });
  }

  // The cruel case: the exemption rides AUTHORIZED employment. A known
  // unauthorized arrangement refuses the guess — the person has a bigger
  // question than a refund, and pretending otherwise would be advice.
  const authorized = boolFact('work-authorized');
  if (authorized === false) {
    return finish({
      status: 'refused',
      ssWithheld: ss,
      medicareWithheld: medicare,
      total,
      refusals: [
        'The student FICA exemption covers AUTHORIZED employment (on-campus work, CPT, OPT). Work that was not authorized raises immigration questions far bigger than a tax refund, and the refund analysis itself changes — a lawyer-and-preparer conversation, named rather than guessed at.',
      ],
    });
  }
  const missing: FactId[] = [];
  if (authorized === null) {
    missing.push('work-authorized');
    notes.push(
      'The refund path assumes the work was authorized — on-campus jobs and CPT/OPT are, by definition, and that is the overwhelming case. If any of it was not, the analysis changes; the question is worth answering.',
    );
  }

  // The clock: a refund claim runs 3 years from the return's due date.
  // For this W-2's year, that is April 15 three years after its filing
  // season — each year carries its own deadline.
  const claimWindowEnds = `${taxYear + 4}-04-15`;

  notes.push(
    `$${Math.round(total)} of Social Security and Medicare tax was withheld in error — an exempt student on authorized work owes neither (Pub 519, IRC §3121(b)(19)). It is recoverable in full, and the claim window for this year closes ${claimWindowEnds}.`,
  );

  return finish({
    status: 'found',
    ssWithheld: ss,
    medicareWithheld: medicare,
    total,
    employerLetter: [
      `Request a refund of $${Math.round(total)} of Social Security and Medicare tax withheld in error during ${taxYear}.`,
      'State the exemption: a nonresident student on an F/J/M/Q visa performing authorized work is exempt from FICA under IRC §3121(b)(19) (Pub 519).',
      'Include the visa class and the exempt calendar years, and offer copies of the visa and I-20/DS-2019.',
      'Ask for a corrected W-2c if they refund, and for a written statement if they will not — that statement is what Form 8316 documents.',
    ],
    packageForms: ['Form 843 (the claim itself)', 'Form 8316 (the employer-refusal record)'],
    packageDocuments: [
      `The ${taxYear} W-2 (boxes 4 and 6 are the claim)`,
      'The visa page of the passport',
      'The I-94 arrival record',
      'The I-20 (F visa) or DS-2019 (J visa)',
      "The employer's refusal statement, or a note that they never answered — Form 8316 exists to capture exactly this",
      `The ${taxYear} Form 8843 (and prior years' — the exempt-status paper trail E2 tracks is part of this claim's evidence)`,
    ],
    claimWindowEnds,
    expectation:
      'The package files on paper — no e-file exists for it — and the IRS takes roughly 3 to 6 months. Slow, but it is real money already counted.',
    missingFacts: missing,
  });
}
