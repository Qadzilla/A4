// ─── Dependency fixtures (A3) ──────────────────────────────────────
// Authority fixtures quote Pub 501's rule statements as fetched and
// transcribed (2026-08); adversarial fixtures carry their reasoning. The
// P2 persona lives here in fact form — the dependent student with a
// brokerage is the person this determination most often decides.

import type { DependencyTestId } from '../dependency';
import type { FilingFixture, FixtureFact } from './types';

export interface DependencyExpected {
  canBeClaimed: 'yes' | 'no' | 'unknown';
  as?: 'qualifying-child' | 'qualifying-relative' | null;
  failedContains?: DependencyTestId[];
  missingContains?: string[];
  kiddieTaxExposed?: boolean;
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

/** A citizen, unmarried — the shared preamble most cases start from. */
const base: FixtureFact[] = [
  { factId: 'us-citizen', value: bool(true) },
  { factId: 'married', value: bool(false) },
];

export const DEPENDENCY_FIXTURES: FilingFixture<DependencyExpected>[] = [
  {
    id: 'dependency/student-away-at-college',
    source: {
      kind: 'authority',
      citation:
        'Pub 501: "under age 24 if a student" at year end; full-time "during some part of each of five calendar months"; temporary absence for education counts as living at home; "the child did not provide more than half of their own support".',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(3) },
      { factId: 'months-away-at-school', value: num(9) },
      { factId: 'self-support-share-pct', value: num(20) },
    ],
    expected: { canBeClaimed: 'yes', as: 'qualifying-child', kiddieTaxExposed: true },
    note: 'P2 in fact form: 20, at college most of the year, parents carrying the costs. The school months count as home — three months physically home does not break residency.',
  },
  {
    id: 'dependency/age-24-in-december',
    source: {
      kind: 'adversarial',
      rationale:
        'The contract cruel case: born December 2002, so age at end of 2026 is 24 — "under age 24" is measured at year end and fails even though most of the year was spent at 23. Enrollment no longer helps.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2002-12-15') },
      { factId: 'full-time-student-months', value: num(12) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(10) },
      { factId: 'gross-income', value: num(8000) },
    ],
    expected: {
      canBeClaimed: 'no',
      failedContains: ['qc/age', 'qr/gross-income'],
      kiddieTaxExposed: false,
    },
    note: 'The qualifying-relative fallback dies on the income test — $8,000 is not less than the limit.',
  },
  {
    id: 'dependency/loans-are-self-support',
    source: {
      kind: 'adversarial',
      rationale:
        'The contract cruel case: 60% of own support paid via student loans the person is liable for. Loans count as self-support, so the child provided more than half — qualifying child fails on support, and the parent cannot have provided more than half either.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2005-06-01') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(2) },
      { factId: 'months-away-at-school', value: num(10) },
      { factId: 'self-support-share-pct', value: num(60) },
      { factId: 'gross-income', value: num(3000) },
    ],
    expected: {
      canBeClaimed: 'no',
      failedContains: ['qc/support', 'qr/support'],
      kiddieTaxExposed: true,
    },
    note: 'Independence and Form 8615 coexist: nobody can claim them, and the kiddie tax can still reach their investment income — loans are not earned income, so the earned-income escape is not established.',
  },
  {
    id: 'dependency/joint-return-refund-only',
    source: {
      kind: 'authority',
      citation:
        'Pub 501: "No joint return test if the only reason the child files a joint return is to claim a refund."',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(true) },
      { factId: 'filing-jointly', value: bool(true) },
      { factId: 'joint-refund-only', value: bool(true) },
      { factId: 'birth-date', value: date('2007-02-01') },
      { factId: 'full-time-student-months', value: num(8) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(15) },
    ],
    expected: { canBeClaimed: 'yes', as: 'qualifying-child' },
  },
  {
    id: 'dependency/joint-return-real',
    source: {
      kind: 'adversarial',
      rationale:
        'The same marriage with a real joint return — tax owed, not refund-only. The exception evaporates and the joint-return test fails both dependent paths.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(true) },
      { factId: 'filing-jointly', value: bool(true) },
      { factId: 'joint-refund-only', value: bool(false) },
      { factId: 'birth-date', value: date('2007-02-01') },
      { factId: 'full-time-student-months', value: num(8) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(15) },
    ],
    expected: { canBeClaimed: 'no', failedContains: ['joint-return'] },
  },
  {
    id: 'dependency/five-months-is-a-student',
    source: {
      kind: 'authority',
      citation:
        'Pub 501: a student is enrolled full-time "during some part of each of five calendar months during the year".',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2004-09-01') },
      { factId: 'full-time-student-months', value: num(5) },
      { factId: 'lived-with-parents-months', value: num(4) },
      { factId: 'months-away-at-school', value: num(5) },
      { factId: 'self-support-share-pct', value: num(30) },
    ],
    expected: { canBeClaimed: 'yes', as: 'qualifying-child' },
    note: 'Exactly five months — a spring semester is enough. At 22 with four months, the age test would fail instead.',
  },
  {
    id: 'dependency/four-months-is-not',
    source: {
      kind: 'adversarial',
      rationale:
        'One month under the line: four months of enrollment at 22 fails the student arm of the age test, and the income backstop fails qualifying-relative — the pair with the five-months fixture brackets the boundary.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2004-09-01') },
      { factId: 'full-time-student-months', value: num(4) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(30) },
      { factId: 'gross-income', value: num(6000) },
    ],
    expected: { canBeClaimed: 'no', failedContains: ['qc/age', 'qr/gross-income'] },
  },
  {
    id: 'dependency/nonresident-cannot-be-claimed',
    source: {
      kind: 'authority',
      citation:
        'Pub 501: a dependent must be a US citizen, national, or resident alien of the US, Canada, or Mexico.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'married', value: bool(false) },
      {
        factId: 'residency-status',
        value: str('nonresident'),
        rule: { ruleId: 'residency/exempt-individual', consumed: ['visa-type'] },
      },
      { factId: 'birth-date', value: date('2005-01-20') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(0) },
      { factId: 'self-support-share-pct', value: num(10) },
    ],
    expected: { canBeClaimed: 'no', failedContains: ['citizen-or-resident'] },
    note: 'P3’s shape: an F-1 nonresident cannot be anyone’s dependent under US rules, however fully the parents support them. Consumes A2’s derived fact — the dependents() chain in action.',
  },
  {
    id: 'dependency/unknown-support-is-the-fork',
    source: {
      kind: 'adversarial',
      rationale:
        'Everything passes except support, which was asked and shrugged at. The determination must be unknown with self-support-share-pct named — this is the fact A4 prices, the canonical fork.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: { kind: 'unknown' } },
    ],
    expected: { canBeClaimed: 'unknown', missingContains: ['self-support-share-pct'] },
  },
  {
    id: 'dependency/qr-income-boundary-fails-at-limit',
    source: {
      kind: 'authority',
      citation:
        'Pub 501 (2025: $5,200; 2026: $5,300): the gross-income test is "less than" — income equal to the limit fails it.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2000-04-01') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'gross-income', value: num(5300) },
    ],
    expected: { canBeClaimed: 'no', failedContains: ['qc/age', 'qr/gross-income'] },
  },
  {
    id: 'dependency/qr-income-boundary-passes-under-limit',
    source: {
      kind: 'adversarial',
      rationale:
        'One dollar under the limit flips it: a 26-year-old with $5,299 of gross income, fully supported at home, is claimable as a qualifying relative — the boundary pair proves the comparison is strict.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'birth-date', value: date('2000-04-01') },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'gross-income', value: num(5299) },
    ],
    expected: { canBeClaimed: 'yes', as: 'qualifying-relative', kiddieTaxExposed: false },
  },
];
