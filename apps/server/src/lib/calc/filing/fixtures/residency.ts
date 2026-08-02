// ─── Residency fixtures (A2) ───────────────────────────────────────
// The authority example is the IRS's own, transcribed with its arithmetic
// intact; the subject is adapted to an F-1 past the exempt years so the
// weighted math is exercised inside Basis's supported visa classes (the
// adaptation is stated in the note — the numbers are verbatim).

import type { ResidencyRule, ResidencyStatus } from '../residency';
import type { FilingFixture, FixtureFact } from './types';

export interface ResidencyExpected {
  status: ResidencyStatus;
  rule: ResidencyRule;
  exemptYearsUsed?: number;
  form8843Required?: boolean;
  ficaExempt?: boolean;
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

/** The standing preamble for a non-citizen on a student visa. */
const student = (firstEntry: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(false) },
  { factId: 'green-card-holder', value: bool(false) },
  { factId: 'visa-type', value: str('F') },
  { factId: 'visa-first-entry-year', value: num(firstEntry) },
];

export const RESIDENCY_FIXTURES: FilingFixture<ResidencyExpected>[] = [
  {
    id: 'residency/pub519-spt-120-days',
    source: {
      kind: 'authority',
      citation:
        'IRS, Substantial Presence Test (Pub 519): present 120 days in each of the current and two preceding years → 120 + 40 + 20 = 180 < 183 → "you are not considered a resident under the substantial presence test".',
    },
    taxYear: 2025,
    facts: [
      ...student(2018),
      { factId: 'days-present', taxYear: 2023, value: num(120) },
      { factId: 'days-present', taxYear: 2024, value: num(120) },
      { factId: 'days-present', taxYear: 2025, value: num(120) },
    ],
    expected: { status: 'nonresident', rule: 'substantial-presence', ficaExempt: true },
    note: 'Subject adapted to an F-1 first entering 2018: 2018–2022 are the five exempt years, so 2023–2025 days all count and the IRS arithmetic runs verbatim. Presence in 2018–2022 is unstated on purpose — exempt years contribute nothing.',
  },
  {
    id: 'residency/pub519-spt-183-boundary',
    source: {
      kind: 'adversarial',
      rationale:
        'The same shape at 122 days each: 122 + 40⅔ + 20⅓ = 183 exactly. The test is "at least 183" — the boundary must flip to resident, and fractions must not be rounded before comparing.',
    },
    taxYear: 2025,
    facts: [
      ...student(2018),
      { factId: 'days-present', taxYear: 2023, value: num(122) },
      { factId: 'days-present', taxYear: 2024, value: num(122) },
      { factId: 'days-present', taxYear: 2025, value: num(122) },
    ],
    expected: { status: 'resident', rule: 'substantial-presence', ficaExempt: false },
  },
  {
    id: 'residency/december-arrival-consumes-whole-year',
    source: {
      kind: 'adversarial',
      rationale:
        'The contract cruel case: arriving December 28th consumes a whole exempt year — the five-year clock runs on calendar years, not months. Four days of presence must read as one full year used.',
    },
    taxYear: 2026,
    facts: [...student(2026), { factId: 'days-present', taxYear: 2026, value: num(4) }],
    expected: {
      status: 'nonresident',
      rule: 'exempt-individual',
      exemptYearsUsed: 1,
      form8843Required: true,
      ficaExempt: true,
    },
  },
  {
    id: 'residency/year-six-flips-resident',
    source: {
      kind: 'adversarial',
      rationale:
        'First entry 2021 makes 2026 the sixth calendar year: exemption exhausted, days count, 340 ≥ 183. A continuing student is present from January 1st, so the year is fully resident — not dual-status.',
    },
    taxYear: 2026,
    facts: [...student(2021), { factId: 'days-present', taxYear: 2026, value: num(340) }],
    expected: {
      status: 'resident',
      rule: 'substantial-presence',
      exemptYearsUsed: 6,
      form8843Required: false,
      ficaExempt: false,
    },
    note: 'Prior-year day counts are deliberately absent: years one through five were exempt and contribute zero, so the test decides on this year alone — the decidable path.',
  },
  {
    id: 'residency/year-six-under-183-still-nonresident',
    source: {
      kind: 'adversarial',
      rationale:
        'Year six with only 150 days: the test fails, the student stays a nonresident — and keeps the FICA exemption, which follows nonresident status, not the exempt-individual clock. Form 8843 is no longer required, because they are no longer an exempt individual.',
    },
    taxYear: 2026,
    facts: [...student(2021), { factId: 'days-present', taxYear: 2026, value: num(150) }],
    expected: {
      status: 'nonresident',
      rule: 'substantial-presence',
      form8843Required: false,
      ficaExempt: true,
    },
  },
  {
    id: 'residency/absent-year-preserves-exemption',
    source: {
      kind: 'adversarial',
      rationale:
        'A year with known-zero presence consumes no exempt year — "for any part of" requires presence. First entry 2022 with all of 2024 abroad leaves 2026 as the fifth consumed year, still exempt.',
    },
    taxYear: 2026,
    facts: [...student(2022), { factId: 'days-present', taxYear: 2024, value: num(0) }],
    expected: {
      status: 'nonresident',
      rule: 'exempt-individual',
      exemptYearsUsed: 4,
      form8843Required: true,
      ficaExempt: true,
    },
  },
  {
    id: 'residency/citizen',
    source: {
      kind: 'authority',
      citation: 'Pub 519 — a US citizen is a US person; no presence test applies.',
    },
    taxYear: 2026,
    facts: [{ factId: 'us-citizen', value: bool(true) }],
    expected: { status: 'us-person', rule: 'citizen' },
  },
  {
    id: 'residency/green-card',
    source: {
      kind: 'authority',
      citation: 'Pub 519 — green card test: a lawful permanent resident is a resident alien.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'green-card-holder', value: bool(true) },
    ],
    expected: { status: 'resident', rule: 'green-card' },
  },
  {
    id: 'residency/no-facts-is-not-resident',
    source: {
      kind: 'adversarial',
      rationale:
        'The fence made a fixture: with nothing established, the answer is unknown — the absence of visa history is not evidence of citizenship, and a default to resident here would be the module lying.',
    },
    taxYear: 2026,
    facts: [],
    expected: { status: 'unknown', rule: 'insufficient-facts' },
  },
  {
    id: 'residency/non-student-visa-refused',
    source: {
      kind: 'adversarial',
      rationale:
        'An H-1B is decidable under the substantial presence test but outside Basis’s supported classes — the contract says refuse with explanation, never guess. Doctrine 7 in one fixture.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'green-card-holder', value: bool(false) },
      { factId: 'visa-type', value: str('H') },
      { factId: 'days-present', taxYear: 2026, value: num(365) },
    ],
    expected: { status: 'unknown', rule: 'insufficient-facts' },
    note: '365 days of presence is planted so a naive implementation that runs the test anyway would answer resident — the refusal must win over the arithmetic.',
  },
  {
    id: 'residency/student-without-entry-year',
    source: {
      kind: 'adversarial',
      rationale:
        'An F visa with no first-entry year: the exempt clock cannot be counted, so the determination is insufficient-facts naming the missing fact — not a guess in either direction.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'green-card-holder', value: bool(false) },
      { factId: 'visa-type', value: str('F') },
    ],
    expected: { status: 'unknown', rule: 'insufficient-facts' },
  },
];
