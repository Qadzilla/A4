// ─── A1 · The fact model ───────────────────────────────────────────
// One vocabulary for everything the system knows about a person's year, so
// forty-one slices can compose instead of each inventing its own shape.
//
// Design constraints, from BASIS_FILING.md doctrine made concrete:
//  - Unknown is a value, never null. "We asked, they didn't know" (an
//    assertion with value unknown) is different from "never asked" (no
//    assertion), and both differ from "a document answered it."
//  - Provenance on every assertion: the person said it, a document said it,
//    or a rule derived it — and which one.
//  - Assertions are append-only. Change is supersession, never edit, so a
//    corrected document re-runs exactly what depended on it.
//  - Rules assert facts carrying what they consumed, which makes staleness
//    computable (`dependents`) rather than aspirational.
//  - Year-scoped by construction; facts that are true of a person rather
//    than of a year (a birth date, a visa's first entry) are declared
//    timeless in the registry and shared across years.
//
// Pure on purpose: no persistence, no clocks, no ids invented here — callers
// supply timestamps and assertion ids. And no tax logic of any kind; this
// module is the shape and the algebra, nothing else.

// ─── The registry ──────────────────────────────────────────────────
// The closed set of fact ids. A fact id not in this registry is a compile
// error, which is what keeps the AI's record_fact tool from inventing
// vocabulary. Entries are added by the slice that consumes them — this seed
// covers A2 (residency) and A3 (dependency/filing status), plus the derived
// facts those rules assert back.

export type FactValueKind = 'bool' | 'number' | 'string' | 'date';
export type FactScope = 'year' | 'timeless';

interface RegistryEntry {
  kind: FactValueKind;
  scope: FactScope;
  /** Only a rule may assert this — it is a determination recorded as a fact. */
  derived?: true;
  /** Describes the data, never the person ("months lived with parents", not
   *  "you lived with your parents"). Plain words; the term in brackets after
   *  where one exists. */
  label: string;
}

export const FACT_REGISTRY = {
  // Of the person, not of a year
  'birth-date': { kind: 'date', scope: 'timeless', label: 'Date of birth' },
  'us-citizen': { kind: 'bool', scope: 'timeless', label: 'US citizen' },
  'green-card-holder': {
    kind: 'bool',
    scope: 'timeless',
    label: 'Lawful permanent resident (green card)',
  },
  'visa-type': {
    kind: 'string',
    scope: 'timeless',
    label: 'Current US visa class (F, J, M, Q, or other)',
  },
  'visa-first-entry-year': {
    kind: 'number',
    scope: 'timeless',
    label: 'Calendar year of first US entry on that visa',
  },
  'citizenship-country': {
    kind: 'string',
    scope: 'timeless',
    label: 'Country of citizenship',
  },
  'aotc-years-used': {
    kind: 'number',
    scope: 'timeless',
    label:
      'Years the American Opportunity Credit was claimed in past filings (four lifetime years exist; old returns or the IRS transcript can say)',
  },

  // Of the year
  'days-present': {
    kind: 'number',
    scope: 'year',
    label: 'Days physically present in the US during the year',
  },
  'state-of-residence': {
    kind: 'string',
    scope: 'year',
    label: 'State lived in for most of the year',
  },
  'lived-with-parents-months': {
    kind: 'number',
    scope: 'year',
    label: 'Months of the year living with parents',
  },
  'full-time-student-months': {
    kind: 'number',
    scope: 'year',
    label: 'Months enrolled as a full-time student',
  },
  'self-support-share-pct': {
    kind: 'number',
    scope: 'year',
    label: 'Share of own living costs paid by the person themselves (percent)',
  },
  married: { kind: 'bool', scope: 'year', label: 'Married as of December 31' },
  'parents-claimed-me': {
    kind: 'bool',
    scope: 'year',
    label: 'A parent actually claimed the person on their own return',
  },
  'w2-employer-count': {
    kind: 'number',
    scope: 'year',
    label: 'Number of employers that paid wages during the year',
  },
  'w2-wages': {
    kind: 'number',
    scope: 'year',
    label: 'Wages paid through employers for the year (W-2 box 1 total)',
  },
  'w2-federal-withheld': {
    kind: 'number',
    scope: 'year',
    label: 'Federal income tax already taken out of pay (W-2 box 2 total)',
  },
  'w2-ss-tax-withheld': {
    kind: 'number',
    scope: 'year',
    label: 'Social Security tax taken out of pay (W-2 box 4 total)',
  },
  'w2-medicare-tax-withheld': {
    kind: 'number',
    scope: 'year',
    label: 'Medicare tax taken out of pay (W-2 box 6 total)',
  },
  'ira-contributions': {
    kind: 'number',
    scope: 'year',
    label:
      'Money put into a traditional or Roth IRA for the year (counts right up to the April filing deadline)',
  },
  'w2-retirement-contributions': {
    kind: 'number',
    scope: 'year',
    label: 'Retirement plan contributions through work (W-2 box 12 codes D, E, F, G, S, AA, BB)',
  },
  'w2-hsa-contributions': {
    kind: 'number',
    scope: 'year',
    label: 'Health savings account money through work (W-2 box 12 code W)',
  },
  'w2-state-tax-withheld': {
    kind: 'number',
    scope: 'year',
    label: 'State income tax taken out of pay (W-2 box 17 total)',
  },
  'w2-tips': {
    kind: 'number',
    scope: 'year',
    label: 'Tips reported through the employer for the year (W-2 box 7 social security tips)',
  },
  'unreported-tips': {
    kind: 'number',
    scope: 'year',
    label:
      'Tips never reported to the employer (cash the paperwork missed — Form 4137 reports them)',
  },
  'se-tips-portion': {
    kind: 'number',
    scope: 'year',
    label:
      'The tip portion of self-employment receipts (already inside the platform or contract totals — never counted twice)',
  },
  'overtime-premium-pay': {
    kind: 'number',
    scope: 'year',
    label:
      'The PREMIUM portion of overtime pay only — the extra half of time-and-a-half required by federal law, not the whole overtime check',
  },
  'tipped-occupation-listed': {
    kind: 'bool',
    scope: 'year',
    label:
      "The job appears on Treasury's list of occupations that customarily received tips before 2025",
  },
  'realized-long-gains': {
    kind: 'number',
    scope: 'year',
    label: 'Realized gains on things held over a year (long-term)',
  },
  'realized-short-gains': {
    kind: 'number',
    scope: 'year',
    label: 'Realized gains on things held under a year (short-term)',
  },
  'permanently-disabled': {
    kind: 'bool',
    scope: 'year',
    label: 'Permanently and totally disabled at any time during the year',
  },
  'months-away-at-school': {
    kind: 'number',
    scope: 'year',
    label:
      'Months living away from the family home for school (a temporary absence counts as time at home)',
  },
  'filing-jointly': {
    kind: 'bool',
    scope: 'year',
    label: 'Filing a joint return with a spouse for the year',
  },
  'joint-refund-only': {
    kind: 'bool',
    scope: 'year',
    label: 'The joint return exists only to get withheld tax back — neither spouse owes any tax',
  },
  'gross-income': {
    kind: 'number',
    scope: 'year',
    label: 'Gross income for the year, before anything is taken out',
  },
  'paid-over-half-home-costs': {
    kind: 'bool',
    scope: 'year',
    label: 'Paid more than half the cost of keeping up the home',
  },
  'own-dependent-lived-with-months': {
    kind: 'number',
    scope: 'year',
    label: "Months the person's own child or dependent lived with them",
  },
  'widowed-within-two-prior-years': {
    kind: 'bool',
    scope: 'year',
    label: 'Spouse died in one of the two preceding years, and no remarriage since',
  },

  // How money arrived — the facts A5 turns into document expectations.
  'brokerage-account': {
    kind: 'bool',
    scope: 'year',
    label: 'Held a brokerage or investment account during the year',
  },
  'sold-investments': {
    kind: 'bool',
    scope: 'year',
    label: 'Sold any investment during the year (holding alone produces no paperwork)',
  },
  'received-dividends': {
    kind: 'bool',
    scope: 'year',
    label: 'Received dividends during the year',
  },
  'earned-bank-interest': {
    kind: 'bool',
    scope: 'year',
    label: 'Earned interest on a bank or savings account',
  },
  'contract-income': {
    kind: 'number',
    scope: 'year',
    label: 'Money from freelance, contract or app work for the year (before expenses)',
  },
  'platform-income': {
    kind: 'number',
    scope: 'year',
    label: 'Gross receipts through payment apps or selling platforms for the year',
  },
  'nec-income': {
    kind: 'number',
    scope: 'year',
    label: 'Contract pay reported on 1099-NEC forms (total across payers)',
  },
  'platform-fees': {
    kind: 'number',
    scope: 'year',
    label: 'Fees and commissions the platform kept (included in gross, not income)',
  },
  'platform-refunds': {
    kind: 'number',
    scope: 'year',
    label: 'Refunds and chargebacks included in platform gross (not income)',
  },
  'personal-items-proceeds': {
    kind: 'number',
    scope: 'year',
    label: 'Personal belongings sold through platforms (a couch at a loss is not income)',
  },
  'interest-income': {
    kind: 'number',
    scope: 'year',
    label: 'Interest earned for the year (1099-INT box 1 total)',
  },
  'dividends-ordinary': {
    kind: 'number',
    scope: 'year',
    label: 'Total dividends for the year (1099-DIV box 1a — includes the qualified part)',
  },
  'dividends-qualified': {
    kind: 'number',
    scope: 'year',
    label: 'Qualified dividends (1099-DIV box 1b — taxed at the lower capital-gains rates)',
  },
  'qualified-tuition-paid': {
    kind: 'number',
    scope: 'year',
    label: 'Tuition and required fees paid to schools (1098-T box 1 total)',
  },
  'tuition-billed-legacy': {
    kind: 'number',
    scope: 'year',
    label: 'Tuition amounts billed (the retired 1098-T box 2 — some schools still print it)',
  },
  'scholarships-received': {
    kind: 'number',
    scope: 'year',
    label: 'Scholarships and grants the school processed (1098-T box 5 total)',
  },
  'student-loan-interest-paid': {
    kind: 'number',
    scope: 'year',
    label: 'Student loan interest paid for the year (1098-E box 1 total)',
  },
  'crypto-proceeds': {
    kind: 'number',
    scope: 'year',
    label: 'Money received selling or trading crypto (usually no form exists — self-reported)',
  },
  'crypto-cost-basis': {
    kind: 'number',
    scope: 'year',
    label: 'What the crypto that was sold originally cost',
  },
  'crypto-held-over-year': {
    kind: 'bool',
    scope: 'year',
    label: 'The crypto that was sold had been held for more than a year',
  },
  'business-miles': {
    kind: 'number',
    scope: 'year',
    label: 'Miles driven for the work itself (commuting to a regular job never counts)',
  },
  'business-phone-expense': {
    kind: 'number',
    scope: 'year',
    label: 'The work share of phone and data costs for the year, in dollars',
  },
  'business-supplies-expense': {
    kind: 'number',
    scope: 'year',
    label: 'Supplies bought for the work (bags, chargers, materials)',
  },
  'home-office-expense': {
    kind: 'number',
    scope: 'year',
    label: 'Home office costs claimed for the work (Basis names this one and hands it off)',
  },
  'other-business-expenses': {
    kind: 'number',
    scope: 'year',
    label: 'Other work expenses outside the simple set (named and handed off, never guessed)',
  },
  'payer-set-hours': {
    kind: 'bool',
    scope: 'year',
    label: 'The company set the work schedule, not the worker',
  },
  'payer-provided-equipment': {
    kind: 'bool',
    scope: 'year',
    label: "The work ran on the company's equipment and tools",
  },
  'payer-controlled-how': {
    kind: 'bool',
    scope: 'year',
    label: 'The company directed how the work was done, not just the result',
  },
  'same-payer-w2-and-1099': {
    kind: 'bool',
    scope: 'year',
    label: 'The same company issued both a W-2 and a 1099 for the year',
  },
  'nec-k-overlap': {
    kind: 'number',
    scope: 'year',
    label: 'Pay counted on both a 1099-NEC and a 1099-K (the same dollars, reported twice)',
  },
  'unemployment-income': {
    kind: 'number',
    scope: 'year',
    label: 'Unemployment compensation received during the year',
  },
  'retirement-distribution': {
    kind: 'number',
    scope: 'year',
    label: 'Money taken out of a retirement account during the year',
  },
  'gambling-winnings': {
    kind: 'number',
    scope: 'year',
    label: 'Gambling or betting winnings for the year',
  },
  'gambling-losses': {
    kind: 'number',
    scope: 'year',
    label: 'Gambling or betting losses for the year (only ever count if deductions are itemized)',
  },
  'retirement-distribution-taxable': {
    kind: 'number',
    scope: 'year',
    label: 'Taxable part of retirement money taken out (1099-R box 2a total)',
  },
  'retirement-early-distribution': {
    kind: 'number',
    scope: 'year',
    label: 'Retirement money taken out early — code 1, the 10% additional tax question (Form 5329)',
  },
  'retirement-rollover': {
    kind: 'number',
    scope: 'year',
    label: 'Retirement money moved directly to another plan (codes G/H) — not income at all',
  },
  'retirement-roth-distribution': {
    kind: 'number',
    scope: 'year',
    label: 'Money out of a Roth account (codes J/T/Q) — ordering rules not yet modelled',
  },
  'retirement-distribution-unclassified': {
    kind: 'number',
    scope: 'year',
    label: 'Retirement money taken out with no readable distribution code — treatment undecided',
  },
  'retirement-federal-withheld': {
    kind: 'number',
    scope: 'year',
    label: 'Federal tax already taken from retirement money (1099-R box 4 total)',
  },
  'degree-program': {
    kind: 'bool',
    scope: 'year',
    label: 'Enrolled in a program leading to a degree or recognised credential',
  },
  'enrolled-half-time': {
    kind: 'bool',
    scope: 'year',
    label: 'Enrolled at least half-time for at least one academic period',
  },
  'felony-drug-conviction': {
    kind: 'bool',
    scope: 'year',
    label:
      'A felony conviction for possessing or distributing a controlled substance, on record at year end (one credit asks; nothing else does)',
  },
  'scholarship-included-in-income': {
    kind: 'number',
    scope: 'year',
    label:
      'Scholarship money deliberately counted as taxable income to free up tuition for the education credit (a legal election)',
  },
  'education-credit-election': {
    kind: 'string',
    scope: 'year',
    label: 'Which education credit to take, where both are available (aotc, llc, or none)',
  },
  'early-distribution-from-ira': {
    kind: 'bool',
    scope: 'year',
    label: 'The early retirement money came out of an IRA (rather than a 401(k)-type plan)',
  },
  'retirement-early-ira-amount': {
    kind: 'number',
    scope: 'year',
    label: 'The part of the early retirement money that came out of IRAs specifically',
  },
  'medical-expenses-paid': {
    kind: 'number',
    scope: 'year',
    label: 'Unreimbursed medical and dental costs paid during the year',
  },
  'unemployed-twelve-weeks': {
    kind: 'bool',
    scope: 'year',
    label: 'Received unemployment for twelve straight weeks or more',
  },
  'health-premiums-paid-while-unemployed': {
    kind: 'number',
    scope: 'year',
    label: 'Health insurance premiums paid during that unemployment',
  },
  'bought-first-home': {
    kind: 'bool',
    scope: 'year',
    label: 'Bought a first home during the year',
  },
  'separated-from-service-at-55': {
    kind: 'bool',
    scope: 'year',
    label: 'Left that employer in or after the year of turning 55',
  },
  'state-refund-received': {
    kind: 'number',
    scope: 'year',
    label: "Last year's state tax refund received this year (1099-G box 2)",
  },
  'itemized-prior-year': {
    kind: 'bool',
    scope: 'year',
    label:
      "Deductions were itemized on last year's return (decides whether a state refund is taxable)",
  },
  'paid-tuition': {
    kind: 'bool',
    scope: 'year',
    label: 'Paid tuition or required fees to a school during the year',
  },
  'paid-student-loan-interest': {
    kind: 'bool',
    scope: 'year',
    label: 'Paid interest on a student loan during the year',
  },
  'marketplace-health-insurance': {
    kind: 'bool',
    scope: 'year',
    label: 'Health insurance bought through the marketplace (healthcare.gov or a state exchange)',
  },
  'scholarship-income': {
    kind: 'bool',
    scope: 'year',
    label: 'Received a scholarship, fellowship or stipend during the year',
  },
  'digital-asset-activity': {
    kind: 'bool',
    scope: 'year',
    label: 'Sold, traded or was paid in crypto or any digital asset during the year',
  },

  // Determinations recorded as facts — rule-sourced only. The rule that
  // asserts one carries what it consumed, which is what `dependents` walks.
  'residency-status': {
    kind: 'string',
    scope: 'year',
    derived: true,
    label: 'Residency for tax purposes (resident, nonresident, dual-status)',
  },
  'can-be-claimed': {
    kind: 'string',
    scope: 'year',
    derived: true,
    label: 'Whether someone is able to claim the person as a dependent',
  },
  'taxable-scholarship-income': {
    kind: 'number',
    scope: 'year',
    derived: true,
    label:
      'Scholarship money above tuition and required fees — taxable income almost nobody knows about',
  },
  'filing-status': {
    kind: 'string',
    scope: 'year',
    derived: true,
    label:
      'Filing status the facts support (single, joint, separate, head of household, surviving spouse)',
  },
} as const satisfies Record<string, RegistryEntry>;

export type FactId = keyof typeof FACT_REGISTRY;

export const FACT_IDS = Object.keys(FACT_REGISTRY) as FactId[];

export function isFactId(id: string): id is FactId {
  return id in FACT_REGISTRY;
}

// ─── Values ────────────────────────────────────────────────────────

export type KnownFactValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'date'; value: string }; // ISO yyyy-mm-dd, never a Date object

export type FactValue = KnownFactValue | { kind: 'unknown' };

/** The known-value shape a given fact id accepts, for compile-time safety. */
type ValueOfKind<K extends FactValueKind> = Extract<KnownFactValue, { kind: K }>;
export type KnownValueFor<I extends FactId> = ValueOfKind<(typeof FACT_REGISTRY)[I]['kind']>;

export function valuesEqual(a: FactValue, b: FactValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'unknown' || b.kind === 'unknown') return true;
  return a.value === b.value;
}

// ─── Assertions ────────────────────────────────────────────────────

export type FactSource =
  | { kind: 'person'; conversationId: string | null }
  | { kind: 'document'; fileId: string; field: string }
  | { kind: 'rule'; ruleId: string; consumed: FactId[] };

export interface FactAssertion {
  /** Identity of this assertion — what a later assertion supersedes by. */
  assertionId: string;
  factId: FactId;
  taxYear: number;
  value: FactValue;
  source: FactSource;
  /** ISO timestamp, supplied by the caller — this module has no clock. */
  assertedAt: string;
  /** The assertion this replaces, or null. Chains are followed. */
  supersedes: string | null;
}

export type AssertionInput<I extends FactId = FactId> = {
  assertionId: string;
  factId: I;
  taxYear: number;
  value: KnownValueFor<I> | { kind: 'unknown' };
  source: FactSource;
  assertedAt: string;
  supersedes?: string | null;
};

export type AssertionProblem =
  | { reason: 'unknown-fact-id'; suggestions: string[] }
  | { reason: 'wrong-value-kind'; expected: FactValueKind; got: string }
  | { reason: 'derived-fact-needs-rule-source' };

/**
 * Runtime validation for the untyped path (the AI's record_fact tool, HTTP
 * input). The rejection teaches: an unknown id comes back with the nearest
 * registry entries so the caller can correct itself.
 */
export function validateAssertion(
  input: Omit<AssertionInput, 'factId' | 'value'> & { factId: string; value: FactValue },
): { ok: true; assertion: FactAssertion } | { ok: false; problem: AssertionProblem } {
  if (!isFactId(input.factId)) {
    return {
      ok: false,
      problem: { reason: 'unknown-fact-id', suggestions: nearestFactIds(input.factId, 3) },
    };
  }
  // Widened: `derived` is optional, so narrow entries don't all carry it.
  const entry: RegistryEntry = FACT_REGISTRY[input.factId];
  if (input.value.kind !== 'unknown' && input.value.kind !== entry.kind) {
    return {
      ok: false,
      problem: { reason: 'wrong-value-kind', expected: entry.kind, got: input.value.kind },
    };
  }
  if (entry.derived && input.source.kind !== 'rule') {
    return { ok: false, problem: { reason: 'derived-fact-needs-rule-source' } };
  }
  return {
    ok: true,
    assertion: {
      assertionId: input.assertionId,
      factId: input.factId,
      taxYear: input.taxYear,
      value: input.value,
      source: input.source,
      assertedAt: input.assertedAt,
      supersedes: input.supersedes ?? null,
    },
  };
}

/** The typed path — compile-checked id and value kind; throws on the rest. */
export function makeAssertion<I extends FactId>(input: AssertionInput<I>): FactAssertion {
  const checked = validateAssertion(
    input as Omit<AssertionInput, 'factId' | 'value'> & {
      factId: string;
      value: FactValue;
    },
  );
  if (!checked.ok) {
    throw new Error(`invalid assertion for '${input.factId}': ${checked.problem.reason}`);
  }
  return checked.assertion;
}

/** Levenshtein over the registry, for rejections that teach. */
export function nearestFactIds(id: string, n: number): string[] {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0] as number;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j] as number;
        row[j] = Math.min(
          (row[j] as number) + 1,
          (row[j - 1] as number) + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        prev = tmp;
      }
    }
    return row[b.length] as number;
  };
  return [...FACT_IDS].sort((a, b) => distance(id, a) - distance(id, b)).slice(0, n);
}

// ─── The working view ──────────────────────────────────────────────

/**
 * Live = not superseded by anything. Chains resolve naturally: if a→b→c,
 * both a and b are referenced as superseded and only c survives.
 */
export function liveAssertions(all: FactAssertion[]): FactAssertion[] {
  const superseded = new Set<string>();
  for (const a of all) {
    if (a.supersedes !== null) superseded.add(a.supersedes);
  }
  return all.filter((a) => !superseded.has(a.assertionId));
}

/**
 * What the engine may compute from. The four states are the point:
 * unasserted (never asked) / unknown (asked, didn't know) / known /
 * contradicted (live assertions disagree — readiness surfaces it, nothing
 * here resolves it; resolution is a new assertion superseding one side).
 */
export type FactState =
  | { status: 'unasserted' }
  | { status: 'known'; value: KnownFactValue; assertions: FactAssertion[] }
  | { status: 'unknown'; assertions: FactAssertion[] }
  | { status: 'contradicted'; assertions: FactAssertion[] };

export interface FactSet {
  taxYear: number;
  byId: ReadonlyMap<FactId, FactState>;
}

const byRecency = (a: FactAssertion, b: FactAssertion) =>
  a.assertedAt === b.assertedAt
    ? a.assertionId.localeCompare(b.assertionId)
    : a.assertedAt.localeCompare(b.assertedAt);

export function factSet(all: FactAssertion[], taxYear: number): FactSet {
  const live = liveAssertions(all);
  const grouped = new Map<FactId, FactAssertion[]>();

  for (const a of live) {
    const entry = FACT_REGISTRY[a.factId];
    const relevant = entry.scope === 'timeless' ? true : a.taxYear === taxYear;
    if (!relevant) continue;
    const list = grouped.get(a.factId) ?? [];
    list.push(a);
    grouped.set(a.factId, list);
  }

  const byId = new Map<FactId, FactState>();
  for (const [id, assertions] of grouped) {
    assertions.sort(byRecency);
    const known = assertions.filter((a) => a.value.kind !== 'unknown');
    if (known.length === 0) {
      // Asked, not answered — distinct from never asked, on purpose.
      byId.set(id, { status: 'unknown', assertions });
      continue;
    }
    const first = known[0] as FactAssertion;
    const agree = known.every((a) => valuesEqual(a.value, first.value));
    if (!agree) {
      byId.set(id, { status: 'contradicted', assertions });
      continue;
    }
    // A known value beats a live asserted-unknown: the document answered
    // what the person couldn't. Corroboration (several sources, one value)
    // is a single known state carrying all its assertions.
    const latest = known[known.length - 1] as FactAssertion;
    byId.set(id, {
      status: 'known',
      value: latest.value as KnownFactValue,
      assertions,
    });
  }

  return { taxYear, byId };
}

export function factState(set: FactSet, id: FactId): FactState {
  return set.byId.get(id) ?? { status: 'unasserted' };
}

/** The live disagreements, for readiness to surface. */
export function contradictions(
  set: FactSet,
): Array<{ factId: FactId; assertions: FactAssertion[] }> {
  const out: Array<{ factId: FactId; assertions: FactAssertion[] }> = [];
  for (const [factId, state] of set.byId) {
    if (state.status === 'contradicted') out.push({ factId, assertions: state.assertions });
  }
  return out;
}

// ─── Staleness ─────────────────────────────────────────────────────

/**
 * Everything downstream of a fact, transitively, via rule provenance: a
 * rule-sourced assertion consumed facts, so a change to any of them makes
 * the rule's output stale. Returned in dependency order — a fact appears
 * before the facts derived from it — and deterministically.
 *
 * This is what makes Doctrine 8 mechanical: supersede a fact, call this,
 * re-run exactly these.
 */
export function dependents(all: FactAssertion[], factId: FactId): FactId[] {
  const edges = new Map<FactId, Set<FactId>>();
  for (const a of liveAssertions(all)) {
    if (a.source.kind !== 'rule') continue;
    for (const consumed of a.source.consumed) {
      const set = edges.get(consumed) ?? new Set<FactId>();
      set.add(a.factId);
      edges.set(consumed, set);
    }
  }

  const out: FactId[] = [];
  const seen = new Set<FactId>([factId]);
  let frontier: FactId[] = [factId];
  while (frontier.length > 0) {
    const next: FactId[] = [];
    for (const id of frontier) {
      for (const dep of [...(edges.get(id) ?? [])].sort()) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        out.push(dep);
        next.push(dep);
      }
    }
    frontier = next;
  }
  return out;
}
