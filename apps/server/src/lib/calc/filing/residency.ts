// ─── A2 · Residency ────────────────────────────────────────────────
// The root fork: whether this is a 1040 year or a 1040-NR year — which
// selects the entire rule set that follows — and the finder of the FICA
// money for every F-1 whose employer withheld it wrongly.
//
// Authority: IRS Pub 519. The substantial presence test: at least 31 days
// present in the current year, and current-year days + 1/3 of the first
// preceding year's + 1/6 of the second preceding year's totalling at least
// 183. Days present as an exempt individual are excluded, and a student on
// an F, J, M or Q visa is an exempt individual until they have been one
// "for any part of more than 5 calendar years" — so a partial year consumes
// a whole one, and year six is when days start counting.
//
// The fence, from BASIS_FILING.md: no treaty benefits (E3), no income
// logic, and never a default to resident on missing facts — the absence of
// visa history is not evidence of citizenship; only an affirmative fact is.

import { type FactAssertion, type FactId, type FactState, factSet, factState } from './facts';
import type { RuleTrace } from './trace';

export type ResidencyStatus = 'us-person' | 'resident' | 'nonresident' | 'dual-status' | 'unknown';
export type ResidencyRule =
  | 'citizen'
  | 'green-card'
  | 'substantial-presence'
  | 'exempt-individual'
  | 'insufficient-facts';

export interface ResidencyDetermination {
  status: ResidencyStatus;
  rule: ResidencyRule;
  /** Calendar years of the F/J/M/Q five consumed through this year. */
  exemptYearsUsed: number;
  /** Every exempt-individual year owes Form 8843, income or none. */
  form8843Required: boolean;
  /**
   * Nonresident on a student visa: exempt from Social Security and Medicare
   * withholding on authorized work. E4 turns this flag into found money.
   */
  ficaExempt: boolean;
  /**
   * Pub 519 residency starting date, where the rule yields one: Jan 1 for a
   * full resident year, the first presence day for a dual-status straddle,
   * null when mid-year with no date on file. Absent on non-SPT paths.
   */
  residencyStartDate?: string | null;
  explanation: RuleTrace;
  /** What was consulted — the consumed list for a rule-sourced assertion. */
  consumed: FactId[];
}

/** Visa classes whose students are exempt individuals under Pub 519. */
const STUDENT_VISAS = new Set(['F', 'J', 'M', 'Q']);
/** "For any part of more than 5 calendar years" — year six is the flip. */
const EXEMPT_YEAR_LIMIT = 5;

const CITE_SPT = 'IRS Pub 519 — substantial presence test';
const CITE_EXEMPT = 'IRS Pub 519 — exempt individuals (students)';

/**
 * Determine residency for `taxYear` from the full assertion history — the
 * substantial presence test reaches two years back, so this reads more than
 * one year's fact set.
 */
export function determineResidency(
  assertions: FactAssertion[],
  taxYear: number,
): ResidencyDetermination {
  const consumed: FactId[] = [];
  const current = factSet(assertions, taxYear);

  const read = (id: FactId, set = current): FactState => {
    if (!consumed.includes(id)) consumed.push(id);
    return factState(set, id);
  };

  // A consulted fact in live disagreement stops the determination — readiness
  // surfaces the contradiction; nothing here picks a side.
  const contradicted: FactId[] = [];
  const value = <T>(state: FactState, id: FactId): T | null => {
    if (state.status === 'contradicted') {
      contradicted.push(id);
      return null;
    }
    if (state.status !== 'known') return null;
    // The registry guarantees the kind; the generic is the caller stating it.
    return (state.value as { value: unknown }).value as T;
  };

  const bool = (id: FactId): boolean | null => value<boolean>(read(id), id);
  const num = (id: FactId): number | null => value<number>(read(id), id);
  const str = (id: FactId): string | null => value<string>(read(id), id);

  // Every dead end routes through here, and a live contradiction outranks
  // whatever the caller was about to say: "we can't tell" is less useful than
  // "two of your sources disagree about X".
  const insufficient = (why: string, steps: RuleTrace['steps']): ResidencyDetermination => ({
    status: 'unknown',
    rule: 'insufficient-facts',
    exemptYearsUsed: 0,
    form8843Required: false,
    ficaExempt: false,
    explanation: {
      ruleId: 'residency/insufficient-facts',
      citation: CITE_SPT,
      steps:
        contradicted.length > 0
          ? [{ label: 'Contradicted facts', value: contradicted.join(', ') }, ...steps]
          : steps,
      notes:
        contradicted.length > 0
          ? [
              `Facts in live disagreement: ${contradicted.join(', ')}. Resolve the contradiction first.`,
              why,
            ]
          : [why],
    },
    consumed,
  });

  // ── Citizens and green-card holders decide immediately ──
  const citizen = bool('us-citizen');
  if (citizen === true) {
    return {
      status: 'us-person',
      rule: 'citizen',
      exemptYearsUsed: 0,
      form8843Required: false,
      ficaExempt: false,
      explanation: {
        ruleId: 'residency/citizen',
        citation: 'IRS Pub 519 — US citizens are taxed as US persons',
        steps: [{ label: 'US citizen', value: true }],
      },
      consumed,
    };
  }

  const greenCard = bool('green-card-holder');
  if (greenCard === true) {
    return {
      status: 'resident',
      rule: 'green-card',
      exemptYearsUsed: 0,
      form8843Required: false,
      ficaExempt: false,
      explanation: {
        ruleId: 'residency/green-card',
        citation: 'IRS Pub 519 — green card test',
        steps: [{ label: 'Lawful permanent resident', value: true }],
      },
      consumed,
    };
  }

  if (contradicted.length > 0) {
    return insufficient('Residency cannot be determined over disagreeing facts.', []);
  }

  // Citizenship unknown and no affirmative visa path is not "resident by
  // default" — it is not knowing.
  const visaType = str('visa-type');
  if (citizen === null && greenCard === null && visaType === null) {
    return insufficient(
      'Citizenship, green-card status and visa history are all unestablished — nothing here is evidence of anything.',
      [{ label: 'US citizen' }, { label: 'Green card' }, { label: 'Visa class' }],
    );
  }

  if (visaType === null) {
    return insufficient('Not a citizen or green-card holder, and no visa class on record.', [
      { label: 'US citizen', value: citizen ?? 'unknown' },
      { label: 'Green card', value: greenCard ?? 'unknown' },
      { label: 'Visa class' },
    ]);
  }

  // ── Outside the student classes, Basis refuses rather than guesses ──
  if (!STUDENT_VISAS.has(visaType)) {
    return insufficient(
      `Visa class '${visaType}' is outside what Basis determines (F, J, M, Q). The substantial presence test still governs — a preparer or the Pub 519 worksheet can run it.`,
      [{ label: 'Visa class', value: visaType }],
    );
  }

  const firstEntry = num('visa-first-entry-year');
  if (firstEntry === null) {
    return insufficient(
      'The exempt-individual clock runs on calendar years from first entry — the first entry year is needed.',
      [{ label: 'Visa class', value: visaType }, { label: 'First entry year' }],
    );
  }

  // ── The exempt-individual clock ──
  // A calendar year consumes one of the five if the person was present for
  // any part of it. A year with a known zero days-present consumed nothing;
  // an unrecorded year is assumed present, because the common case is a
  // student who arrived and stayed — the decidable path the contract prefers.
  let exemptYearsUsed = 0;
  const perYearDays = new Map<number, number | null>();
  for (let year = firstEntry; year <= taxYear; year++) {
    const set = year === taxYear ? current : factSet(assertions, year);
    const days = value<number>(read('days-present', set), 'days-present');
    perYearDays.set(year, days);
    if (days === 0) continue;
    exemptYearsUsed += 1;
  }

  const exemptThisYear = exemptYearsUsed <= EXEMPT_YEAR_LIMIT && perYearDays.get(taxYear) !== 0;

  if (exemptThisYear) {
    return {
      status: 'nonresident',
      rule: 'exempt-individual',
      exemptYearsUsed,
      form8843Required: true,
      ficaExempt: true,
      explanation: {
        ruleId: 'residency/exempt-individual',
        citation: CITE_EXEMPT,
        steps: [
          { label: 'Visa class', value: visaType },
          { label: 'First entry year', value: firstEntry },
          { label: 'Exempt calendar years used, this year included', value: exemptYearsUsed },
          { label: 'Limit before days start counting', value: EXEMPT_YEAR_LIMIT },
        ],
        notes: [
          'Days present as an exempt individual do not count toward the substantial presence test.',
          'Any part of a calendar year consumes a whole exempt year.',
          'Form 8843 is required for this year even with no income.',
          'A closer-connection extension past five years exists and is out of scope — a preparer question.',
        ],
      },
      consumed,
    };
  }

  // ── Substantial presence, with exempt years excluded ──
  const currentDays = perYearDays.get(taxYear) ?? null;
  if (currentDays === null) {
    return insufficient(
      'Past the exempt years, the substantial presence test needs this year’s days of presence.',
      [
        { label: 'Exempt years used', value: exemptYearsUsed },
        { label: `Days present ${taxYear}` },
      ],
    );
  }

  // A prior year contributes its weighted days only if it was not an exempt
  // year. Exempt years contribute zero by rule — which is why a year-six
  // student's test usually needs no prior-year counts at all.
  const weightedPrior = (offset: 1 | 2): number | null => {
    const year = taxYear - offset;
    if (year < firstEntry) return 0; // not present on this visa yet
    const wasExempt = yearWasExempt(year, firstEntry, perYearDays);
    if (wasExempt) return 0;
    const days = perYearDays.get(year) ?? null;
    if (days === null) return null; // genuinely needed and genuinely unknown
    return offset === 1 ? days / 3 : days / 6;
  };

  const prior1 = weightedPrior(1);
  const prior2 = weightedPrior(2);
  if (prior1 === null || prior2 === null) {
    return insufficient(
      'A preceding non-exempt year’s days are needed for the weighted total — this is a fact worth forking on if it stays unknown.',
      [
        { label: `Days present ${taxYear}`, value: currentDays },
        { label: `Days present ${taxYear - 1}`, value: prior1 === null ? 'unknown' : 'excluded' },
        { label: `Days present ${taxYear - 2}`, value: prior2 === null ? 'unknown' : 'excluded' },
      ],
    );
  }

  const weighted = currentDays + prior1 + prior2;
  const meets = currentDays >= 31 && weighted >= 183;

  const trace: RuleTrace = {
    ruleId: 'residency/substantial-presence',
    citation: CITE_SPT,
    steps: [
      { label: `Days present ${taxYear}`, value: currentDays },
      { label: 'At least 31 days this year', value: currentDays >= 31 },
      { label: `Plus 1/3 of ${taxYear - 1}`, value: round2(prior1) },
      { label: `Plus 1/6 of ${taxYear - 2}`, value: round2(prior2) },
      { label: 'Weighted total', value: round2(weighted) },
      { label: 'Meets 183', value: weighted >= 183 },
    ],
    notes: ['Days present in exempt-individual years are excluded from the count.'],
  };

  if (!meets) {
    return {
      status: 'nonresident',
      rule: 'substantial-presence',
      exemptYearsUsed,
      form8843Required: false,
      // Still a nonresident on a student visa — the FICA exemption follows
      // nonresident status, not the exempt-individual clock.
      ficaExempt: true,
      explanation: trace,
      consumed,
    };
  }

  // The test is met — now WHERE residency starts decides the year's shape
  // (Pub 519: under substantial presence, residency starts on the first day
  // of presence in the calendar year). A continuing student present from
  // January 1st is a full resident year. A mid-year return — the year-six
  // F-1 who spent the spring abroad — makes the year DUAL-STATUS: E5's
  // brief, not a return this engine computes. The first-presence-date fact
  // carries the boundary; unrecorded assumes January 1st, the continuing
  // case (the same decidable-path preference as the exempt clock).
  const firstPresence = value<string>(read('first-presence-date', current), 'first-presence-date');
  const midYearStart =
    (firstPresence !== null && firstPresence > `${taxYear}-01-01`) || firstEntry === taxYear;
  if (midYearStart) {
    return {
      status: 'dual-status',
      rule: 'substantial-presence',
      exemptYearsUsed,
      form8843Required: false,
      ficaExempt: false,
      residencyStartDate: firstPresence,
      explanation: {
        ...trace,
        notes: [
          ...(trace.notes ?? []),
          firstPresence !== null
            ? `Residency starts ${firstPresence} — the first day of presence this year — making the months before it a nonresident window and the year dual-status.`
            : 'First year of presence with the test met — residency starts mid-year, making this a dual-status year.',
        ],
      },
      consumed,
    };
  }

  return {
    status: 'resident',
    rule: 'substantial-presence',
    exemptYearsUsed,
    form8843Required: false,
    ficaExempt: false,
    residencyStartDate: `${taxYear}-01-01`,
    explanation: trace,
    consumed,
  };
}

function yearWasExempt(
  year: number,
  firstEntry: number,
  perYearDays: Map<number, number | null>,
): boolean {
  let used = 0;
  for (let y = firstEntry; y <= year; y++) {
    if (perYearDays.get(y) === 0) continue;
    used += 1;
  }
  return used <= EXEMPT_YEAR_LIMIT && perYearDays.get(year) !== 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
