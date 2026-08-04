// ─── Dual-status fixtures (E5) ─────────────────────────────────────
// The straddle, pinned from both sides: a year-six return from abroad
// with a mid-year first-presence date IS dual-status (Pub 519's
// first-day-of-presence rule), while the continuing student, the
// mid-five-years student, and the December arrival are NOT — the
// exemption defers the residency question entirely, and the detector
// must know the difference. The brief itself is pinned too: annual
// income lines that say they are annual, the restrictions, the forms.

import type { ResidencyStatus } from '../residency';
import type { FilingFixture, FixtureFact } from './types';

export interface DualStatusExpected {
  residencyStatus: ResidencyStatus;
  hasBrief: boolean;
  residencyStart?: string | null;
  nonresidentWindowTo?: string;
  incomeContains?: string;
  restrictionsContain?: string;
  formsContain?: string;
  notesContain?: string;
}

export type DualStatusFixture = FilingFixture<DualStatusExpected>;

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

const f1 = (entryYear: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(false) },
  { factId: 'green-card-holder', value: bool(false) },
  { factId: 'visa-type', value: str('F') },
  { factId: 'visa-first-entry-year', value: num(entryYear) },
  { factId: 'full-time-student-months', value: num(9) },
];

export const DUAL_STATUS_FIXTURES: DualStatusFixture[] = [
  {
    id: 'ds/arrival-straddle-detected',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: under the substantial presence test, residency begins on the first day of presence in the calendar year — a mid-year return in the first non-exempt year splits it into nonresident and resident windows.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2021), // 2021–2025 consumed the five exempt years
      { factId: 'days-present', value: num(200) },
      { factId: 'first-presence-date', value: date('2026-06-01') },
      { factId: 'w2-wages', value: num(30000) },
    ],
    expected: {
      residencyStatus: 'dual-status',
      hasBrief: true,
      residencyStart: '2026-06-01',
      nonresidentWindowTo: '2026-05-31',
      incomeContains: 'w2-wages',
      restrictionsContain: 'standard deduction',
      formsContain: 'Dual-Status Return',
    },
    note: 'The year-six F-1 who spent the spring abroad: 200 days from June 1 meet the test, residency starts June 1, and January–May is a nonresident window. The brief carries the boundary, the annual income to split at it, and the restrictions — the twenty-minute meeting.',
  },
  {
    id: 'ds/continuing-student-full-resident',
    source: {
      kind: 'adversarial',
      rationale:
        'The same year six present from January 1st is a FULL resident year, not dual-status — the boundary is the first presence day, and January 1st means there is no straddle to brief.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2021),
      { factId: 'days-present', value: num(330) },
      { factId: 'first-presence-date', value: date('2026-01-01') },
    ],
    expected: {
      residencyStatus: 'resident',
      hasBrief: false,
    },
  },
  {
    id: 'ds/no-date-defaults-continuing',
    source: {
      kind: 'adversarial',
      rationale:
        'An unrecorded first-presence date assumes January 1st — the continuing student who never left is the overwhelming case, and the exempt clock already makes the same decidable-path assumption. The date fact exists exactly to say otherwise.',
    },
    taxYear: 2026,
    facts: [...f1(2021), { factId: 'days-present', value: num(330) }],
    expected: {
      residencyStatus: 'resident',
      hasBrief: false,
    },
  },
  {
    id: 'ds/mid-five-years-not-triggered',
    source: {
      kind: 'adversarial',
      rationale:
        'A mid-five-years student back from summer abroad has a mid-year presence date too — and is still simply an exempt nonresident. The straddle needs the exemption EXHAUSTED; a presence date alone must never trigger the brief.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2024),
      { factId: 'days-present', value: num(120) },
      { factId: 'first-presence-date', value: date('2026-08-20') },
    ],
    expected: {
      residencyStatus: 'nonresident',
      hasBrief: false,
    },
  },
  {
    id: 'ds/december-arrival-cruel-case',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: an exempt individual’s days never start the substantial presence clock — a December-arrival F-1 is exempt from day one, so the year is a plain nonresident year (owing its 8843), NOT dual-status. The exemption defers the residency question entirely.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2026),
      { factId: 'days-present', value: num(20) },
      { factId: 'first-presence-date', value: date('2026-12-05') },
    ],
    expected: {
      residencyStatus: 'nonresident',
      hasBrief: false,
    },
    note: 'The cruel case from the contract, verbatim: the detector must know that a first-year December arrival with a mid-year date is nothing like the year-six June return with the same shape of facts.',
  },
  {
    id: 'ds/brief-says-annual-means-annual',
    source: {
      kind: 'adversarial',
      rationale:
        'Basis cannot split a W-2 at a June boundary and must not pretend to: every income line in the brief is the annual total, the brief says so in words, and the pay-stubs-around-the-boundary ask is stated — the preparer’s first discovery made into the first instruction.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2021),
      { factId: 'days-present', value: num(200) },
      { factId: 'first-presence-date', value: date('2026-06-01') },
      { factId: 'w2-wages', value: num(30000) },
      { factId: 'interest-income', value: num(150) },
    ],
    expected: {
      residencyStatus: 'dual-status',
      hasBrief: true,
      notesContain: 'ANNUAL',
    },
  },
];
