// ─── The personas, as end-to-end fixtures (A7) ─────────────────────
// The eight people from BASIS_FILING.md Part IV, run through the whole
// Phase A stack: facts → residency → dependency → forms → expectations →
// verdict. Most run with their documents absent, because that IS the
// expected state of a real year in progress — the corpus records what the
// engine honestly says today, and notes where a later slice will say more.

import type { Readiness } from '../readiness';
import type { ArrivedDoc, DocumentKind, FormId } from '../requirements';
import type { FilingFixture, FixtureFact } from './types';

export interface PersonaYearExpected {
  verdict: Readiness['verdict'];
  /** Asserted through evaluateYear, where named. */
  residency?: string;
  canBeClaimed?: 'yes' | 'no' | 'unknown';
  formsRequired?: FormId[];
  formsAbsent?: FormId[];
  outOfScopeInclude?: FormId[];
  expectationsInclude?: DocumentKind[];
  /** The no-form path: true asserts the expectation list is exactly empty. */
  expectationsEmpty?: boolean;
  /** Blocker ids that must be present. */
  blockersInclude?: string[];
}

export interface PersonaFixture extends FilingFixture<Record<number, PersonaYearExpected>> {
  /** Documents on file when the persona is assessed. */
  docs: ArrivedDoc[];
  /** The calendar day the assessment runs on — lateness is a fact. */
  today: string;
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

const single = (year?: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(true) },
  { factId: 'married', value: bool(false), taxYear: year },
];

export const PERSONA_FIXTURES: PersonaFixture[] = [
  {
    id: 'persona/p1-first-paycheck',
    source: { kind: 'persona', persona: 'P1' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [{ kind: 'W-2', fileId: 'p1-w2' }],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2003-04-15') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(42000) },
      { factId: 'w2-employer-count', value: num(1) },
      { factId: 'w2-wages', value: num(42000) },
    ],
    expected: {
      2026: {
        verdict: 'ready',
        residency: 'us-person',
        canBeClaimed: 'no',
        formsRequired: ['form-1040'],
        expectationsInclude: ['W-2'],
      },
    },
    note: 'The simplest possible year, and the whole stack agrees: one W-2, on file, everything decided, ready. The finding is the refund-or-owe picture — withholding facts arrive with C1.',
  },
  {
    id: 'persona/p2-dependent-with-a-robinhood',
    source: { kind: 'persona', persona: 'P2' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(3) },
      { factId: 'months-away-at-school', value: num(9) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'gross-income', value: num(11100) },
      { factId: 'w2-wages', value: num(8000) },
      { factId: 'brokerage-account', value: bool(true) },
      { factId: 'sold-investments', value: bool(true) },
      { factId: 'realized-long-gains', value: num(3100) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        canBeClaimed: 'yes',
        formsRequired: ['form-8949', 'sch-d', 'form-8615'],
        outOfScopeInclude: ['form-8615'],
        expectationsInclude: ['W-2', '1099-B'],
      },
    },
    note: 'The persona B2 exists for: claimable, and the 0% window is mostly not theirs — $3,100 of gains sits above the $2,700 kiddie threshold, so Form 8615 is required and honestly refused until its slice.',
  },
  {
    id: 'persona/p3-f1-junior',
    source: { kind: 'persona', persona: 'P3' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [],
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'green-card-holder', value: bool(false) },
      { factId: 'visa-type', value: str('F') },
      { factId: 'visa-first-entry-year', value: num(2024) },
      { factId: 'citizenship-country', value: str('IN') },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2004-08-20') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'scholarship-income', value: bool(true) },
      { factId: 'w2-wages', value: num(12000) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        residency: 'nonresident',
        canBeClaimed: 'no',
        formsRequired: ['form-1040-nr', 'form-8843'],
        formsAbsent: ['form-1040'],
        expectationsInclude: ['W-2', '1042-S'],
      },
    },
    note: 'The root fork selecting the form set: third calendar year on an F visa, so nonresident — the 1040-NR and the 8843, never the 1040. The FICA-withheld-in-error finding needs the W-2 box 4 fact, which arrives with C1 and pays out at E4. India treaty standard deduction lands at E3.',
  },
  {
    id: 'persona/p4-two-apps-and-a-bike',
    source: { kind: 'persona', persona: 'P4' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2004-01-10') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(2700) },
      { factId: 'contract-income', value: num(1800) },
      { factId: 'platform-income', value: num(900) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        expectationsEmpty: true,
        formsRequired: ['sch-c', 'sch-se'],
        outOfScopeInclude: ['sch-c', 'sch-se'],
      },
    },
    note: "Doctrine 4's proof, end to end: $1,800 under the NEC threshold and $900 under the K threshold, so no paper will ever arrive — the expectation list is exactly empty — and Schedule C and SE are required anyway. The Depop-couch-at-a-loss decomposition (gross is not income) is C2's refinement; the liability itself waits on D4 mapping self-employment income into the estimator.",
  },
  {
    id: 'persona/p5-boston-remote',
    source: { kind: 'persona', persona: 'P5' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [
      { kind: 'W-2', fileId: 'p5-w2' },
      { kind: '1099-B', fileId: 'p5-1099b' },
    ],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2002-05-05') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(67000) },
      { factId: 'state-of-residence', value: str('MA') },
      { factId: 'w2-employer-count', value: num(1) },
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'brokerage-account', value: bool(true) },
      { factId: 'sold-investments', value: bool(true) },
      { factId: 'realized-short-gains', value: num(2000) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        formsRequired: ['form-1040', 'form-8949', 'sch-d', 'state-ma-1'],
        outOfScopeInclude: ['state-ma-1'],
        expectationsInclude: ['W-2', '1099-B'],
      },
    },
    note: "Blocked on the Massachusetts return until F3 — where the 8.5% short-term class and the netting rules live. The other half of this persona, New York's convenience-of-the-employer rule, needs an employer-location fact the registry gains at F2; its absence here is the traceability marker.",
  },
  {
    id: 'persona/p6-parlay-and-a-401k',
    source: { kind: 'persona', persona: 'P6' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2003-09-09') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(60000) },
      { factId: 'w2-employer-count', value: num(1) },
      { factId: 'w2-wages', value: num(45000) },
      { factId: 'gambling-winnings', value: num(6000) },
      { factId: 'retirement-distribution', value: num(9000) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        formsRequired: ['form-5329'],
        outOfScopeInclude: ['form-5329'],
        expectationsInclude: ['W-2', 'W-2G', '1099-R'],
        blockersInclude: ['doc:1099-R'],
      },
    },
    note: "The W-2G expectation is not mandatory (thresholds vary by game), so its absence past due asks for a look without blocking; the 1099-R is mandatory and does block. The two findings — losses only offset wins if you itemize, and the 20% withheld doesn't cover the penalty — arrive with C5's losses fact and D6's arithmetic.",
  },
  {
    id: 'persona/p7-marketplace-freelancer',
    source: { kind: 'persona', persona: 'P7' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [],
    facts: [
      ...single(),
      { factId: 'birth-date', value: date('2002-02-02') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(38000) },
      { factId: 'contract-income', value: num(38000) },
      { factId: 'marketplace-health-insurance', value: bool(true) },
    ],
    expected: {
      2026: {
        verdict: 'blocked',
        formsRequired: ['form-8962', 'sch-c', 'sch-se'],
        outOfScopeInclude: ['form-8962'],
        expectationsInclude: ['1095-A'],
        blockersInclude: ['form:form-8962', 'doc:1095-A'],
      },
    },
    note: 'The blocking archetype: the 1095-A is mandatory (the return cannot finish without it) and the 8962 refusal names the refund freeze. D3 turns the block into a reconciliation.',
  },
  {
    id: 'persona/p8-three-years-behind',
    source: { kind: 'persona', persona: 'P8' },
    taxYear: 2026,
    today: '2027-03-01',
    docs: [{ kind: 'W-2', fileId: 'p8-w2-2026', taxYear: 2026 }],
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'birth-date', value: date('2001-01-20') },
      // 2026
      { factId: 'married', value: bool(false) },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'gross-income', value: num(42000) },
      { factId: 'w2-employer-count', value: num(1) },
      { factId: 'w2-wages', value: num(42000) },
      // 2025
      { factId: 'married', taxYear: 2025, value: bool(false) },
      { factId: 'full-time-student-months', taxYear: 2025, value: num(0) },
      { factId: 'gross-income', taxYear: 2025, value: num(30000) },
      { factId: 'w2-employer-count', taxYear: 2025, value: num(1) },
      { factId: 'w2-wages', taxYear: 2025, value: num(30000) },
      // 2024 — a year whose data isn't loaded
      { factId: 'married', taxYear: 2024, value: bool(false) },
      { factId: 'w2-wages', taxYear: 2024, value: num(18000) },
      { factId: 'gross-income', taxYear: 2024, value: num(18000) },
    ],
    expected: {
      2026: { verdict: 'ready' },
      2025: { verdict: 'blocked', blockersInclude: ['doc:W-2'] },
      2024: { verdict: 'blocked', blockersInclude: ['computation:year-data'] },
    },
    note: "Three years, three verdicts, independently: the current year is ready, 2025 is one long-overdue W-2 away (the transcript step is the action), and 2024 refuses by name because its rules aren't loaded — never borrowed from another year. The forfeit-clock urgency and the transcript-as-document-source land at H4.",
  },
];
