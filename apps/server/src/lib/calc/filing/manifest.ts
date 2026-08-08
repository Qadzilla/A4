// ─── H1 · The manifest ─────────────────────────────────────────────
// What the whole engine is for. Forty-odd slices decided things about a
// year; this is the single document that says what they decided, where
// every number came from, and what is still open — the thing a person
// takes to free software or a preparer and finishes in an evening.
//
// Three properties carry it.
//
// It is a VIEW, never a second computation. Every amount is read off
// the evaluation or a determination that already ran. That is the G4
// lesson made structural: a manifest that recomputed its own totals
// would eventually disagree with the meter on the same screen, and the
// person would have no way to know which one was lying.
//
// Every line carries its ancestry. `provenance` names the rule, its
// citation, and the facts underneath with the source of each — so
// "$42,000" resolves to "your W-2 said so" or "you told us on March 3rd"
// without anyone having to trust the number. Doctrine 5's payoff, and
// the reason the fact model has carried provenance since A1.
//
// It renders when the year is NOT ready. Readiness gates the framing —
// "not ready: two things" — never the visibility. A manifest that hid
// itself until everything was perfect would be useless in precisely the
// situation people need it: the night before, with one form missing.

import { claimClock } from './amendment';
import type { YearEvaluation } from './evaluation';
import { evaluateYear } from './evaluation';
import {
  FACT_REGISTRY,
  type FactAssertion,
  type FactId,
  type FactValue,
  factSet,
  factState,
} from './facts';
import { INTAKE_QUESTIONS } from './intake';
import type { Blocker, Readiness } from './readiness';
import { assessReadiness } from './readiness';
import type { ArrivedDoc, FormId, FormRequirement } from './requirements';

// ─── Provenance ────────────────────────────────────────────────────

export interface FactRef {
  factId: FactId;
  /** What it was asked as, in life language — not the schema label. */
  label: string;
  value: FactValue;
  origin: 'person' | 'document' | 'rule';
  /** The file that said it, when a document did — the tappable end. */
  fileId: string | null;
  assertionId: string;
}

export interface Provenance {
  /** The rule that produced the amount, where a rule did. */
  ruleId: string | null;
  citation: string | null;
  /** Every fact the amount rests on. All resolvable; no dangling refs. */
  facts: FactRef[];
  /** One plain sentence: how this number came to be. */
  how: string;
}

export interface ManifestLine {
  /** '1040:11' — the form and its real line number. */
  id: string;
  form: FormId;
  line: string;
  label: string;
  amount: number;
  provenance: Provenance;
}

export interface ManifestForm {
  form: FormId;
  label: string;
  lines: ManifestLine[];
}

// ─── The sections beyond the forms ─────────────────────────────────

export interface OpenQuestion {
  factId: FactId;
  question: string;
  /** What A4 says the answer is worth. Null when it can't be priced yet. */
  worth: number | null;
  unlocksSomething: boolean;
}

export interface OutsideTheReturn {
  id: string;
  label: string;
  /** Null when the amount depends on a choice the person hasn't made. */
  amount: number | null;
  detail: string;
  action: string;
}

export interface CalendarEntry {
  date: string;
  what: string;
  detail: string;
}

export interface Manifest {
  taxYear: number;
  /** ISO timestamp the caller supplies — this module has no clock. */
  builtAt: string;
  verdict: Readiness['verdict'];
  /** On top when present. Never a reason to hide the rest. */
  blockers: Blocker[];
  forms: ManifestForm[];
  openQuestions: OpenQuestion[];
  /** Kiddie guard, estimate framing, corrected-form season. */
  cautions: string[];
  outOfScope: FormRequirement[];
  /** Money the return itself will never show — E4's refund, the IRA door. */
  outsideTheReturn: OutsideTheReturn[];
  calendar: CalendarEntry[];
  whereToFile: {
    /** Null when income isn't known well enough to say. */
    freeFileLikely: boolean | null;
    options: Array<{ name: string; detail: string; url: string | null }>;
    /** What to have in front of you. */
    carry: string[];
  };
  /** The one line: what this year came to, and what is still open. */
  headline: string;
}

const FORM_LABEL: Partial<Record<FormId, string>> = {
  'form-1040': 'Form 1040 — the federal return',
  'form-1040-nr': 'Form 1040-NR — the nonresident return',
  'sch-1': 'Schedule 1 — additional income and adjustments',
  'sch-1-a': 'Schedule 1-A — the tips and overtime deductions',
  'sch-c': 'Schedule C — profit or loss from the work',
  'sch-se': 'Schedule SE — self-employment tax',
  'sch-d': 'Schedule D — capital gains and losses',
  'form-8949': 'Form 8949 — every sale, listed',
  'form-4137': 'Form 4137 — Social Security and Medicare on unreported tips',
  'form-5329': 'Form 5329 — the additional tax on early retirement money',
  'form-8863': 'Form 8863 — education credits',
  'form-8880': "Form 8880 — the saver's credit",
  'form-8962': 'Form 8962 — premium tax credit',
  'form-8843': 'Form 8843 — the exempt-individual statement',
  'form-8615': "Form 8615 — tax on a child's unearned income",
  'state-ca-540': 'California Form 540',
  'state-ny-it201': 'New York Form IT-201',
  'state-ma-1': 'Massachusetts Form 1',
};

/** What a fact was asked as. G1 already fenced these; schema labels are a fallback. */
const ASKED_AS = new Map(INTAKE_QUESTIONS.map((q) => [q.factId, q.prompt]));
const nameFor = (factId: FactId): string =>
  ASKED_AS.get(factId) ?? FACT_REGISTRY[factId].label.replace(/\s*\([^)]*\)\s*$/, '');

export interface ManifestInput {
  assertions: FactAssertion[];
  docs: ArrivedDoc[];
  taxYear: number;
  /** Injectable, as everywhere else in this engine. */
  today: Date;
  /**
   * When this year's return was filed, where it has been. Moves the
   * refund-claim clock: a late filing extends it, an early one does not
   * shorten it (§6513(a)).
   */
  filedAt?: string | null;
  extras?: Parameters<typeof evaluateYear>[2];
}

export function buildManifest(input: ManifestInput): Manifest {
  const { assertions, docs, taxYear, today } = input;
  const evaluation = evaluateYear(assertions, taxYear, input.extras);
  const readiness = assessReadiness(assertions, docs, taxYear, today, input.extras);
  const set = factSet(assertions, taxYear);

  /** Resolve a fact to its live assertion, or drop it. No dangling refs. */
  const ref = (factId: FactId): FactRef | null => {
    const state = factState(set, factId);
    if (state.status === 'unasserted') return null;
    const latest = state.assertions[state.assertions.length - 1];
    if (latest === undefined) return null;
    return {
      factId,
      label: nameFor(factId),
      value: state.status === 'known' ? state.value : { kind: 'unknown' },
      origin: latest.source.kind,
      fileId: latest.source.kind === 'document' ? latest.source.fileId : null,
      assertionId: latest.assertionId,
    };
  };
  const refs = (ids: FactId[]): FactRef[] => ids.map(ref).filter((r): r is FactRef => r !== null);

  const forms = buildForms(evaluation, refs);

  return {
    taxYear,
    builtAt: today.toISOString(),
    verdict: readiness.verdict,
    blockers: readiness.blockers,
    forms,
    openQuestions: readiness.unknowns
      .filter((u) => u.delta > 0 || u.blockedDiffers)
      .map((u) => ({
        factId: u.at,
        question: nameFor(u.at),
        worth: u.priceable ? u.delta : null,
        unlocksSomething: u.blockedDiffers,
      })),
    cautions: cautionsFor(evaluation, taxYear, today),
    outOfScope: readiness.outOfScope,
    outsideTheReturn: outsideTheReturn(readiness, evaluation),
    calendar: calendarFor(taxYear, today, input.filedAt ?? null),
    whereToFile: whereToFile(evaluation),
    headline: headlineFor(evaluation, readiness, forms, taxYear),
  };
}

// ─── The forms ─────────────────────────────────────────────────────

function buildForms(
  evaluation: YearEvaluation,
  refs: (ids: FactId[]) => FactRef[],
): ManifestForm[] {
  const { liability, inputs } = evaluation;
  if (liability === null || inputs === null) return [];

  const nonresident = evaluation.nonresident !== null;
  const form: FormId = nonresident ? 'form-1040-nr' : 'form-1040';
  const lines: ManifestLine[] = [];

  const push = (
    line: string,
    label: string,
    amount: number,
    provenance: Provenance,
    on: FormId = form,
  ) => {
    lines.push({ id: `${lineFormKey(on)}:${line}`, form: on, line, label, amount, provenance });
  };

  const trace = evaluation.filingStatus.explanation;

  // ── Income ──
  if (inputs.w2Wages !== 0) {
    push('1z', 'Wages, salaries, tips', inputs.w2Wages, {
      ruleId: null,
      citation: 'Form 1040 line 1z',
      facts: refs(['w2-wages', 'w2-employer-count']),
      how: 'Box 1 of every W-2 for the year, added together.',
    });
  }
  if (inputs.investmentIncome !== 0) {
    push('2b', 'Taxable interest and ordinary dividends', inputs.investmentIncome, {
      ruleId: null,
      citation: 'Form 1040 lines 2b and 3b',
      facts: refs(['interest-income', 'dividends-ordinary', 'dividends-qualified']),
      how: 'Interest plus the ordinary part of dividends — the qualified part is taxed with capital gains instead.',
    });
  }
  const gains = inputs.capitalGainsShort + inputs.capitalGainsLong;
  if (gains !== 0) {
    push('7', 'Capital gain or loss', gains, {
      ruleId: evaluation.capitalGains?.explanation.ruleId ?? null,
      citation: evaluation.capitalGains?.explanation.citation ?? 'Form 1040 line 7',
      facts: refs(['realized-short-gains', 'realized-long-gains', 'crypto-proceeds']),
      how: 'Net of every sale, split short-term from long-term, from Schedule D.',
    });
  }
  if (inputs.selfEmploymentIncome !== 0) {
    push('8', 'Additional income (Schedule 1)', inputs.selfEmploymentIncome + inputs.otherIncome, {
      ruleId: evaluation.se?.explanation.ruleId ?? null,
      citation: evaluation.se?.explanation.citation ?? 'Schedule 1',
      facts: refs(['contract-income', 'platform-income', 'unreported-tips', 'unemployment-income']),
      how: 'Everything that is income but not wages: the work you did for yourself, and the rest.',
    });
  } else if (inputs.otherIncome !== 0) {
    push('8', 'Additional income (Schedule 1)', inputs.otherIncome, {
      ruleId: null,
      citation: 'Schedule 1',
      facts: refs([
        'unreported-tips',
        'unemployment-income',
        'gambling-winnings',
        'retirement-distribution-taxable',
        'scholarship-included-in-income',
        'state-refund-received',
      ]),
      how: 'Income that is not wages and not investment: tips off the books, unemployment, retirement money, and the rest.',
    });
  }

  // ── The spine: the five lines the external tools also print ──
  push('11', 'Adjusted gross income', liability.agi, {
    ruleId: null,
    citation: 'Form 1040 line 11',
    facts: [],
    how: 'Everything above, less the adjustments allowed before the deduction.',
  });
  push('12', 'Standard or itemized deduction', liability.deduction, {
    ruleId: evaluation.dependency.explanation.ruleId,
    citation: evaluation.dependency.explanation.citation,
    facts: refs(['self-support-share-pct', 'lived-with-parents-months', 'parents-claimed-me']),
    how:
      evaluation.dependency.canBeClaimed === 'yes'
        ? 'The dependent limit applies: the deduction is the larger of the floor or earned income plus the add-on, never above the regular amount.'
        : 'The standard deduction for this filing status.',
  });
  if (liability.tipsOvertimeDeduction !== 0) {
    push('13b', 'Tips and overtime deductions (Schedule 1-A)', liability.tipsOvertimeDeduction, {
      ruleId: evaluation.tipsOvertime?.explanation.ruleId ?? null,
      citation: evaluation.tipsOvertime?.explanation.citation ?? 'Schedule 1-A',
      facts: refs([
        'w2-tips',
        'unreported-tips',
        'overtime-premium-pay',
        'tipped-occupation-listed',
      ]),
      how: 'Stacks on top of the deduction above and never touches AGI — so nothing upstream shifts.',
    });
  }
  push('15', 'Taxable income', liability.taxableIncome, {
    ruleId: null,
    citation: 'Form 1040 line 15',
    facts: [],
    how: 'Adjusted gross income less every deduction above. Zero if that goes negative.',
  });
  push('16', 'Tax', liability.incomeTax, {
    ruleId: trace.ruleId,
    citation: trace.citation,
    facts: refs(['married', 'filing-jointly', 'own-dependent-lived-with-months']),
    how: 'The rate schedule for this filing status, with long-term gains and qualified dividends taken at their own lower rates first.',
  });

  // ── Other taxes ──
  const otherTaxes =
    liability.selfEmploymentTax +
    liability.form4137Tax +
    liability.earlyWithdrawalPenalty +
    liability.ptcRepayment;
  if (otherTaxes !== 0) {
    // Name what is actually IN the number rather than everything that
    // could be. A line that lists four possible components when one
    // applies is a line nobody can check — and checking is the entire
    // promise of this page.
    const parts: string[] = [];
    if (liability.selfEmploymentTax !== 0) {
      parts.push(
        `self-employment tax of ${dollars(liability.selfEmploymentTax)} — the Social Security and Medicare nobody withheld from work you did for yourself`,
      );
    }
    if (liability.form4137Tax !== 0) {
      parts.push(
        `${dollars(liability.form4137Tax)} of Social Security and Medicare on tips the employer never saw`,
      );
    }
    if (liability.earlyWithdrawalPenalty !== 0) {
      parts.push(
        `${dollars(liability.earlyWithdrawalPenalty)} of additional tax on retirement money taken out early`,
      );
    }
    if (liability.ptcRepayment !== 0) {
      parts.push(
        `${dollars(liability.ptcRepayment)} of health-insurance credit paid forward and owed back`,
      );
    }
    push('23', 'Other taxes (Schedule 2)', otherTaxes, {
      ruleId: evaluation.se?.explanation.ruleId ?? null,
      citation: 'Schedule 2, Part II',
      facts: refs(['contract-income', 'unreported-tips', 'retirement-early-distribution']),
      how: `Tax that is not income tax: ${parts.join('; ')}.`,
    });
  }
  const credits = liability.educationCredit + liability.saversCredit;
  if (credits !== 0) {
    push('21', 'Credits', credits, {
      ruleId: evaluation.education?.explanation.ruleId ?? null,
      citation: evaluation.education?.explanation.citation ?? 'Schedule 3',
      facts: refs(['qualified-tuition-paid', 'ira-contributions', 'w2-retirement-contributions']),
      how: 'Credits reduce the tax itself, not the income it is charged on.',
    });
  }

  // `federalTax`, NOT `totalTax`. The estimator's totalTax includes the
  // Social Security and Medicare taken through payroll, which is real
  // money and is not a line on this return — the 1040 never sees it. The
  // A8 recording caught this one: it read $3,213 high, which is exactly
  // 7.65% of the wages.
  push('24', 'Total tax', liability.federalTax, {
    ruleId: null,
    citation: 'Form 1040 line 24',
    facts: [],
    how: 'Everything the return itself owes for the year, before anything already paid. Social Security and Medicare taken from your pay are real money but are not part of this figure.',
  });
  push('25a', 'Federal income tax withheld', liability.federalWithheld, {
    ruleId: null,
    citation: 'Form 1040 line 25a',
    facts: refs(['w2-federal-withheld', 'retirement-federal-withheld']),
    how: 'What already came out of your pay and any retirement money.',
  });

  const owed = liability.refundOrOwed;
  if (owed <= 0) {
    push('34', 'Amount overpaid — your refund', Math.abs(owed), {
      ruleId: null,
      citation: 'Form 1040 line 34',
      facts: [],
      how: 'Paid in more than the year came to. This comes back.',
    });
  } else {
    push('37', 'Amount you owe', owed, {
      ruleId: null,
      citation: 'Form 1040 line 37',
      facts: [],
      how: 'The year came to more than was paid in. This is due with the return.',
    });
  }

  const out: ManifestForm[] = [{ form, label: FORM_LABEL[form] ?? String(form), lines }];

  // ── The state return ──
  const state = evaluation.state;
  if (state !== null && state.status === 'computed') {
    const stateForm: FormId =
      state.stateCode === 'CA'
        ? 'state-ca-540'
        : state.stateCode === 'NY'
          ? 'state-ny-it201'
          : 'state-ma-1';
    // Each state names its own total; there is no shared field, and
    // inventing one here would be a fourth opinion about what "the state
    // tax" means.
    const amount =
      state.stateCode === 'CA'
        ? state.taxAfterCredits
        : state.stateCode === 'NY'
          ? state.totalNewYorkTax
          : state.totalMassachusettsTax;
    out.push({
      form: stateForm,
      label: FORM_LABEL[stateForm] ?? String(stateForm),
      lines: [
        {
          id: `${lineFormKey(stateForm)}:total`,
          form: stateForm,
          line: 'total',
          label: `Total ${state.stateCode} tax`,
          amount,
          provenance: {
            ruleId: state.explanation.ruleId,
            citation: state.explanation.citation,
            facts: refs(['state-of-residence', 'employer-state', 'state-move-date']),
            how: "The state's own rules, on its own income — never a percentage of the federal number.",
          },
        },
      ],
    });
  }

  return out;
}

const dollars = (n: number): string => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/** '1040:11' rather than 'form-1040:11' — how the recordings read. */
function lineFormKey(form: FormId): string {
  return form.replace(/^form-/, '').replace(/^state-/, '');
}

// ─── The sections ──────────────────────────────────────────────────

function cautionsFor(evaluation: YearEvaluation, taxYear: number, today: Date): string[] {
  const out: string[] = [
    'Every figure here is computed from what you told us and what your documents said. It is a worked estimate to check and file with, not a filed return.',
  ];
  // A corrected 1099 in March is the ordinary case, not an anomaly.
  const march = new Date(`${taxYear + 1}-03-31T23:59:59Z`);
  if (today.getTime() <= march.getTime()) {
    out.push(
      'Brokers routinely issue corrected 1099s into March. If one arrives after you file, the numbers below change and the return can be amended.',
    );
  }
  for (const note of evaluation.notes) {
    if (note.length > 0) out.push(note);
  }
  return out;
}

function outsideTheReturn(readiness: Readiness, evaluation: YearEvaluation): OutsideTheReturn[] {
  const out: OutsideTheReturn[] = [];

  // E4's finding: FICA withheld from an exempt year is recoverable and
  // appears nowhere on the return. The single best number in the product
  // for the people it applies to, and it would be invisible without this.
  for (const line of readiness.lines) {
    if (line.id !== 'finding:fica-refund') continue;
    out.push({
      id: 'fica-refund',
      label: 'Social Security and Medicare withheld in error',
      amount: null,
      detail: line.detail,
      action: line.action ?? 'Ask the employer first; the paper claim is the fallback.',
    });
  }

  // The door that is still open after the year ended.
  if (evaluation.liability !== null && evaluation.savers !== null) {
    out.push({
      id: 'ira-until-april',
      label: 'Retirement contributions are still open',
      amount: null,
      detail:
        'Money put into an IRA counts for last year right up to the filing deadline — the one decision on this page you can still change after the year is over.',
      action: "Check what an added contribution does to the saver's credit before the deadline.",
    });
  }

  if (evaluation.liability !== null && evaluation.liability.ltcgZeroBracketRoom > 0) {
    out.push({
      id: 'ltcg-window',
      label: 'Long-term gains taxed at 0% federal',
      amount: Math.round(evaluation.liability.ltcgZeroBracketRoom),
      detail:
        'Long-term gains up to this much fall in the 0% federal bracket. It is a fact about NEXT year as much as this one — the window resets annually and does not carry forward.',
      action:
        'Nothing to do on this return. Worth knowing before selling anything held over a year.',
    });
  }

  return out;
}

function calendarFor(taxYear: number, today: Date, filedAt: string | null): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  // April 15 of the following year, without pretending to know which
  // weekends and DC holidays push it. The engine holds no deadline
  // calendar, and a date invented here would be exactly the kind of
  // uncited figure G3 forbids the model from stating.
  const filingDeadline = `${taxYear + 1}-04-15`;

  out.push({
    date: filingDeadline,
    what: 'The return is due',
    detail:
      'An extension moves this date for the paperwork and not for the money — anything owed is still due today.',
  });
  out.push({
    date: filingDeadline,
    what: 'Last day to add to an IRA for this year',
    detail: 'The deadline itself, not the extended one. An extension does not move it.',
  });
  // H2 owns this one: the clock depends on when the return actually
  // went in, and hardcoding three-years-from-the-deadline here would be
  // wrong for anyone who filed late — in the direction of telling them
  // the money is gone while it isn't.
  const clock = claimClock(taxYear, filedAt, today);
  out.push({
    date: clock.deadline,
    what: 'A refund for this year stops being claimable',
    detail: `${clock.note} After that date an unclaimed refund becomes the Treasury's, and nothing gives it back.`,
  });

  return out.filter(
    (e) => new Date(`${e.date}T23:59:59Z`).getTime() >= today.getTime() - 86_400_000,
  );
}

function whereToFile(evaluation: YearEvaluation): Manifest['whereToFile'] {
  const agi = evaluation.liability?.agi ?? null;
  return {
    // The IRS Free File income ceiling moves every year, so this reports a
    // likelihood and points at the page rather than stating the figure —
    // a number written here would have no citation and no year.
    freeFileLikely: agi === null ? null : agi < 84_000,
    options: [
      {
        name: 'IRS Free File',
        detail:
          'Free guided filing through the IRS for incomes under a ceiling that changes each year. The page states the current one.',
        url: 'https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free',
      },
      {
        name: 'IRS Direct File',
        detail: 'The IRS’s own free filing tool, where your state and situation are covered.',
        url: 'https://directfile.irs.gov',
      },
      {
        name: 'A preparer',
        detail:
          'Worth the money when something on this page is marked out of scope, or when a determination was refused rather than computed.',
        url: null,
      },
    ],
    carry: [
      'This page, printed or open beside you.',
      'Every document listed above, in the order the lines use them.',
      'Last year’s return, if one exists — it answers questions the software will ask.',
      'A bank account number, if you want the refund paid directly.',
    ],
  };
}

function headlineFor(
  evaluation: YearEvaluation,
  readiness: Readiness,
  forms: ManifestForm[],
  taxYear: number,
): string {
  if (forms.length === 0) {
    return `${taxYear} cannot be totalled yet — ${readiness.blockers.length > 0 ? (readiness.blockers[0]?.reason ?? 'something is blocking it') : 'not enough is known'}`;
  }
  const owed = evaluation.liability?.refundOrOwed ?? 0;
  const money =
    owed <= 0
      ? `a refund of $${Math.abs(Math.round(owed)).toLocaleString('en-US')}`
      : `$${Math.round(owed).toLocaleString('en-US')} still to pay`;

  if (readiness.blockers.length > 0) {
    return `${taxYear} comes to ${money} on what is known — with ${readiness.blockers.length} thing${readiness.blockers.length === 1 ? '' : 's'} still in the way.`;
  }
  return `${taxYear} comes to ${money}, with everything the year needs on file.`;
}
