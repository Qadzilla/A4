// ─── Saver's credit fixtures (D2) ──────────────────────────────────
// Tier tables from the Form 8880 instructions (2026 via Notice 2025-67,
// both years verified 2026-08): 50%/20%/10% of up to $2,000 by AGI and
// filing bucket. The cruel cases are the boundaries — one dollar over a
// tier is a different credit, with no rounding mercy — and the
// disqualifiers, which are A3's to know. TY2027 refuses by name: the
// Saver's Match is the successor, not a feature.

import type { SaversStatus } from '../savers-credit';
import type { FilingFixture, FixtureFact } from './types';

export interface SaversExpected {
  applicable?: boolean;
  status: SaversStatus;
  amount?: number;
  rate?: number | null;
  contributionBase?: number;
  reductions?: number;
  missingContains?: string[];
  iraOption?: { additionalContribution: number; newCredit: number; delta: number } | null;
  successor?: 'savers-match';
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

/** An independent 25-year-old worker, decisively nobody's dependent. */
const worker = (agi: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(true) },
  { factId: 'married', value: bool(false) },
  { factId: 'birth-date', value: date('2001-05-01') },
  { factId: 'full-time-student-months', value: num(0) },
  { factId: 'gross-income', value: num(agi) },
  { factId: 'w2-wages', value: num(agi) },
];

export const SAVERS_FIXTURES: FilingFixture<SaversExpected>[] = [
  {
    id: 'savers/fifty-percent-tier',
    source: {
      kind: 'authority',
      citation:
        'Form 8880 instructions, 2026 (Notice 2025-67): AGI up to $24,250 single → 50% of up to $2,000 contributed.',
    },
    taxYear: 2026,
    facts: [...worker(22000), { factId: 'w2-retirement-contributions', value: num(1500) }],
    expected: { status: 'available', amount: 750, rate: 0.5, contributionBase: 1500 },
    note: '$1,500 through a 401(k) the person already contributes to — $750 back, and almost nobody under 25 knows the credit exists.',
  },
  {
    id: 'savers/boundary-exact',
    source: {
      kind: 'authority',
      citation:
        'Form 8880, 2026 single: $24,250 is inside the 50% tier — the boundary belongs to the better rate.',
    },
    taxYear: 2026,
    facts: [...worker(24250), { factId: 'w2-retirement-contributions', value: num(2000) }],
    expected: { status: 'available', amount: 1000, rate: 0.5 },
  },
  {
    id: 'savers/one-dollar-over',
    source: {
      kind: 'adversarial',
      rationale:
        'The contract cruel case: AGI $24,251 — one dollar over the 50% tier — drops the rate to 20% with no rounding mercy, and the near-miss must surface as a priced IRA option: $1 of deductible traditional-IRA contribution buys the tier back.',
    },
    taxYear: 2026,
    facts: [...worker(24251), { factId: 'w2-retirement-contributions', value: num(2000) }],
    expected: {
      status: 'available',
      amount: 400,
      rate: 0.2,
      iraOption: { additionalContribution: 1, newCredit: 1000, delta: 600 },
    },
    note: 'One dollar of AGI is worth $600 of credit here — the sharpest cliff in the demographic’s tax picture, and the April lever prices it.',
  },
  {
    id: 'savers/over-the-ceiling',
    source: {
      kind: 'authority',
      citation: 'Form 8880, 2026 single: above $40,250 the credit is zero.',
    },
    taxYear: 2026,
    facts: [...worker(40251), { factId: 'w2-retirement-contributions', value: num(2000) }],
    expected: {
      status: 'ineligible',
      rate: 0,
      iraOption: { additionalContribution: 1, newCredit: 200, delta: 200 },
    },
    note: 'Even here the lever exists: $1 under the ceiling is a 10% credit on the full base.',
  },
  {
    id: 'savers/student-disqualified',
    source: {
      kind: 'authority',
      citation:
        'Form 8880 instructions: a full-time student during any part of five calendar months cannot take the credit.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2001-05-01') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'gross-income', value: num(15000) },
      { factId: 'w2-wages', value: num(15000) },
      { factId: 'w2-retirement-contributions', value: num(1000) },
    ],
    expected: { status: 'ineligible' },
  },
  {
    id: 'savers/student-unknown-is-the-fork',
    source: {
      kind: 'adversarial',
      rationale:
        'Enrollment was asked and shrugged at. The credit hangs on it, so the determination is missing-facts naming the months — the second-best dependency-adjacent fork after the AOTC.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2001-05-01') },
      { factId: 'full-time-student-months', value: { kind: 'unknown' } },
      { factId: 'gross-income', value: num(15000) },
      { factId: 'w2-wages', value: num(15000) },
      { factId: 'w2-retirement-contributions', value: num(1000) },
    ],
    expected: { status: 'missing-facts', missingContains: ['full-time-student-months'] },
  },
  {
    id: 'savers/dependent-disqualified',
    source: {
      kind: 'authority',
      citation: 'Form 8880 instructions: no credit for a taxpayer claimable as a dependent.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'gross-income', value: num(4000) },
      { factId: 'w2-wages', value: num(4000) },
      { factId: 'w2-retirement-contributions', value: num(500) },
    ],
    expected: { status: 'ineligible' },
    note: 'A 20-year-old earning $4,000 at home: qualifying-relative income test passes at this income, so the dependency stands and the credit closes.',
  },
  {
    id: 'savers/under-18',
    source: {
      kind: 'authority',
      citation: 'Form 8880 instructions: the credit starts at age 18.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2009-06-01') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'self-support-share-pct', value: num(80) },
      { factId: 'gross-income', value: num(12000) },
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'w2-retirement-contributions', value: num(800) },
    ],
    expected: { status: 'ineligible' },
  },
  {
    id: 'savers/distributions-reduce',
    source: {
      kind: 'authority',
      citation:
        'Form 8880 instructions: distributions received during the testing period reduce the contributions counted; rollovers do not.',
    },
    taxYear: 2026,
    facts: [
      ...worker(22000),
      { factId: 'w2-retirement-contributions', value: num(2000) },
      { factId: 'retirement-distribution', value: num(1500) },
      { factId: 'retirement-rollover', value: num(0) },
    ],
    expected: { status: 'available', amount: 250, contributionBase: 500, reductions: 1500 },
  },
  {
    id: 'savers/rollover-does-not-reduce',
    source: {
      kind: 'adversarial',
      rationale:
        'The same $1,500 leaving as a direct rollover is not a withdrawal — the base stays whole. C5’s code-G distinction carries straight through.',
    },
    taxYear: 2026,
    facts: [
      ...worker(22000),
      { factId: 'w2-retirement-contributions', value: num(2000) },
      { factId: 'retirement-distribution', value: num(1500) },
      { factId: 'retirement-rollover', value: num(1500) },
    ],
    expected: { status: 'available', amount: 1000, contributionBase: 2000, reductions: 0 },
  },
  {
    id: 'savers/prior-year-distribution-reduces',
    source: {
      kind: 'authority',
      citation:
        'Form 8880 instructions: the testing period spans the tax year and the two preceding years.',
    },
    taxYear: 2026,
    facts: [
      ...worker(22000),
      { factId: 'w2-retirement-contributions', value: num(2000) },
      { factId: 'retirement-distribution', taxYear: 2025, value: num(800) },
    ],
    expected: { status: 'available', amount: 600, contributionBase: 1200, reductions: 800 },
  },
  {
    id: 'savers/ira-and-w2-compose',
    source: {
      kind: 'authority',
      citation: 'Form 8880: elective deferrals and IRA contributions both count toward the $2,000.',
    },
    taxYear: 2026,
    facts: [
      ...worker(20000),
      { factId: 'w2-retirement-contributions', value: num(800) },
      { factId: 'ira-contributions', value: num(700) },
    ],
    expected: { status: 'available', amount: 750, contributionBase: 1500 },
  },
  {
    id: 'savers/nothing-contributed-yet',
    source: {
      kind: 'adversarial',
      rationale:
        'Eligible, nothing saved: the status is none, and the April lever prices the whole opportunity — $2,000 in, $1,000 back, in the credit’s final year.',
    },
    taxYear: 2026,
    facts: worker(20000),
    expected: {
      status: 'none',
      iraOption: { additionalContribution: 2000, newCredit: 1000, delta: 1000 },
    },
  },
  {
    id: 'savers/2027-refuses-by-name',
    source: {
      kind: 'authority',
      citation:
        "SECURE 2.0 §103: the saver's credit is replaced by the Saver's Match for taxable years beginning after 2026.",
    },
    taxYear: 2027,
    facts: [...worker(20000), { factId: 'w2-retirement-contributions', value: num(2000) }],
    expected: { applicable: false, status: 'ineligible', successor: 'savers-match' },
    note: 'Doctrine 6, literally: the year selects the rule, and 2027 selects a successor Basis names and does not model.',
  },
];
