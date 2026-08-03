// ─── Education fixtures (D1) ───────────────────────────────────────
// Credit arithmetic and phaseouts from the Form 8863 instructions and
// Pub 970 (verified 2026-08): AOTC = 100% of the first $2,000 of
// qualified expenses + 25% of the next $2,000, 40% refundable; LLC = 20%
// of up to $10,000, nonrefundable; both phase out $80k–$90k single.
// Student-loan interest: IRC §221, $2,500 cap, 2026 single phaseout
// $85k–$100k. The adversarial cases carry the dependency traps: the
// credit belongs to whoever can claim the student, the refundable slice
// closes under 24, and the 24th birthday opens everything from inside a
// December.

import type { CreditStatus } from '../education';
import type { FilingFixture, FixtureFact } from './types';

export interface EducationExpected {
  aotc?: { status: CreditStatus; amount?: number; refundable?: number };
  llc?: { status: CreditStatus; amount?: number };
  sli?: { status: 'available' | 'denied' | 'missing-facts' | 'none'; allowed?: number };
  aotcMissingContains?: string[];
  electionSuggested?: number;
  electionGain?: number;
  /** Checked through the evaluation — the election's income side is real. */
  agi?: number;
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

/** An independent 25-year-old student — every gate open, nothing blocked. */
const independent: FixtureFact[] = [
  { factId: 'us-citizen', value: bool(true) },
  { factId: 'married', value: bool(false) },
  { factId: 'birth-date', value: date('2001-05-01') },
  { factId: 'gross-income', value: num(30000) },
  { factId: 'w2-wages', value: num(30000) },
  { factId: 'full-time-student-months', value: num(9) },
  { factId: 'degree-program', value: bool(true) },
  { factId: 'enrolled-half-time', value: bool(true) },
  { factId: 'aotc-years-used', value: num(0) },
  { factId: 'felony-drug-conviction', value: bool(false) },
];

export const EDUCATION_FIXTURES: FilingFixture<EducationExpected>[] = [
  {
    id: 'education/aotc-full-arithmetic',
    source: {
      kind: 'authority',
      citation:
        'Form 8863 instructions: 100% of the first $2,000 of qualified expenses + 25% of the next $2,000 = $2,500; 40% refundable.',
    },
    taxYear: 2026,
    facts: [...independent, { factId: 'qualified-tuition-paid', value: num(4000) }],
    expected: {
      aotc: { status: 'available', amount: 2500, refundable: 1000 },
      llc: { status: 'available', amount: 800 },
    },
    note: 'Both credits priced side by side — 2500 vs 800 — and the engine states the exclusivity without picking.',
  },
  {
    id: 'education/refundable-closed-under-24',
    source: {
      kind: 'authority',
      citation:
        'Form 8863 line 7: filers under 24 meeting the support conditions cannot take the refundable portion — the credit offsets tax but cannot pay past zero.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'gross-income', value: num(12000) },
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(2) },
      { factId: 'months-away-at-school', value: num(10) },
      { factId: 'self-support-share-pct', value: num(60) },
      { factId: 'degree-program', value: bool(true) },
      { factId: 'enrolled-half-time', value: bool(true) },
      { factId: 'aotc-years-used', value: num(1) },
      { factId: 'felony-drug-conviction', value: bool(false) },
      { factId: 'qualified-tuition-paid', value: num(4000) },
    ],
    expected: { aotc: { status: 'available', amount: 2500, refundable: 0 } },
    note: 'Independent through loans (60% self-support), so the credit is theirs — but A3’s kiddie-exposure flag is exactly the line-7 test, and the refundable slice closes.',
  },
  {
    id: 'education/age-24-frees-the-credit',
    source: {
      kind: 'adversarial',
      rationale:
        'The contract cruel case: born December 2002, age 24 at year end. A3’s age test already ended the dependency from inside that December — so the credit belongs to the student, even though the parents still paid for everything. Eligibility follows the determination; this module never recomputes age.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2002-12-15') },
      { factId: 'gross-income', value: num(8000) },
      { factId: 'w2-wages', value: num(8000) },
      { factId: 'full-time-student-months', value: num(12) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(10) },
      { factId: 'degree-program', value: bool(true) },
      { factId: 'enrolled-half-time', value: bool(true) },
      { factId: 'aotc-years-used', value: num(2) },
      { factId: 'felony-drug-conviction', value: bool(false) },
      { factId: 'qualified-tuition-paid', value: num(4000) },
    ],
    expected: { aotc: { status: 'available', amount: 2500, refundable: 1000 } },
  },
  {
    id: 'education/dependents-credit-is-the-parents',
    source: {
      kind: 'adversarial',
      rationale:
        'P2’s shape: claimable as a dependent, so the credit is the parents’ to take — blocked here with the why, never silently dropped.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(3) },
      { factId: 'months-away-at-school', value: num(9) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'w2-wages', value: num(8000) },
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'degree-program', value: bool(true) },
      { factId: 'enrolled-half-time', value: bool(true) },
    ],
    expected: {
      aotc: { status: 'blocked' },
      llc: { status: 'blocked' },
      sli: { status: 'denied' },
    },
  },
  {
    id: 'education/unknown-dependency-is-the-fork',
    source: {
      kind: 'adversarial',
      rationale:
        'Support was asked and shrugged at. Who owns the credit is undecided, so the determination is missing-facts naming the support share — the same fact A4 prices, the canonical fork.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: { kind: 'unknown' } },
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'degree-program', value: bool(true) },
      { factId: 'enrolled-half-time', value: bool(true) },
      { factId: 'aotc-years-used', value: num(0) },
      { factId: 'felony-drug-conviction', value: bool(false) },
    ],
    expected: {
      aotc: { status: 'missing-facts' },
      aotcMissingContains: ['self-support-share-pct'],
    },
  },
  {
    id: 'education/four-lifetime-years',
    source: {
      kind: 'authority',
      citation:
        'Form 8863 instructions: the AOTC is available for four tax years per student, lifetime. The LLC has no year limit.',
    },
    taxYear: 2026,
    facts: [
      ...independent.filter((f) => f.factId !== 'aotc-years-used'),
      { factId: 'aotc-years-used', value: num(4) },
      { factId: 'qualified-tuition-paid', value: num(4000) },
    ],
    expected: {
      aotc: { status: 'ineligible' },
      llc: { status: 'available', amount: 800 },
    },
    note: 'The fifth year of school still gets the LLC — smaller, but not nothing.',
  },
  {
    id: 'education/double-dip-guard',
    source: {
      kind: 'authority',
      citation:
        'Pub 970: qualified expenses are reduced by tax-free scholarships — the same dollars cannot fund both a tax-free scholarship and a credit.',
    },
    taxYear: 2026,
    facts: [
      ...independent,
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'scholarships-received', value: num(3000) },
    ],
    expected: {
      aotc: { status: 'available', amount: 1000, refundable: 400 },
      llc: { status: 'available', amount: 200 },
    },
    note: '$4,000 paid minus $3,000 sheltered leaves $1,000 of creditable expense.',
  },
  {
    id: 'education/scholarship-election-priced',
    source: {
      kind: 'authority',
      citation:
        'Pub 970 (and the 8863 instructions): a student may include scholarship in income to free the same dollars of tuition for the credit — a legal election, laid out with both sides.',
    },
    taxYear: 2026,
    facts: [
      ...independent,
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'scholarships-received', value: num(4000) },
    ],
    expected: {
      aotc: { status: 'available', amount: 0 },
      electionSuggested: 4000,
      electionGain: 2500,
    },
    note: 'Fully sheltered → $0 of credit. Electing $4,000 into income frees the full base — $2,500 of credit against the tax on $4,000. The engine prices it; the person elects.',
  },
  {
    id: 'education/scholarship-election-made',
    source: {
      kind: 'adversarial',
      rationale:
        'The election asserted: $2,000 counted into income. The credit side must see $2,000 of freed expense and the income side must be real — AGI rises by the same $2,000 through the evaluation.',
    },
    taxYear: 2026,
    facts: [
      ...independent,
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'scholarships-received', value: num(4000) },
      { factId: 'scholarship-included-in-income', value: num(2000) },
    ],
    expected: {
      aotc: { status: 'available', amount: 2000, refundable: 800 },
      agi: 32000,
    },
  },
  {
    id: 'education/mfs-gets-neither',
    source: {
      kind: 'authority',
      citation:
        'Form 8863 instructions / IRC §221: married filing separately may take neither education credit nor the student-loan interest deduction.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(true) },
      { factId: 'filing-jointly', value: bool(false) },
      { factId: 'birth-date', value: date('2001-05-01') },
      { factId: 'gross-income', value: num(30000) },
      { factId: 'w2-wages', value: num(30000) },
      { factId: 'qualified-tuition-paid', value: num(4000) },
      { factId: 'degree-program', value: bool(true) },
      { factId: 'enrolled-half-time', value: bool(true) },
      { factId: 'student-loan-interest-paid', value: num(900) },
    ],
    expected: {
      aotc: { status: 'blocked' },
      llc: { status: 'blocked' },
      sli: { status: 'denied' },
    },
  },
  {
    id: 'education/nonresident-blocked',
    source: {
      kind: 'authority',
      citation:
        'Pub 970: nonresident aliens generally cannot claim the education credits — the 1040-NR runs different rules.',
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
      { factId: 'qualified-tuition-paid', value: num(12000) },
      { factId: 'degree-program', value: bool(true) },
    ],
    expected: {
      aotc: { status: 'blocked' },
      llc: { status: 'blocked' },
      sli: { status: 'denied' },
    },
    note: 'P3 pays real tuition and gets neither credit — the E1 explanation, not a silent zero.',
  },
  {
    id: 'education/sli-above-the-line',
    source: {
      kind: 'authority',
      citation:
        'IRC §221 / Topic 456: up to $2,500 of student-loan interest deducts without itemizing.',
    },
    taxYear: 2026,
    facts: [
      ...independent,
      { factId: 'paid-student-loan-interest', value: bool(true) },
      { factId: 'student-loan-interest-paid', value: num(900) },
    ],
    expected: { sli: { status: 'available', allowed: 900 }, agi: 29100 },
    note: 'The deduction lands in AGI through the evaluation — 30,000 of wages becomes 29,100.',
  },
  {
    id: 'education/sli-phaseout-midband',
    source: {
      kind: 'authority',
      citation:
        'IRC §221 phaseout, 2026 single: $85,000–$100,000. At $92,500 the band is half gone.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2001-05-01') },
      { factId: 'gross-income', value: num(92500) },
      { factId: 'w2-wages', value: num(92500) },
      { factId: 'full-time-student-months', value: num(0) },
      { factId: 'student-loan-interest-paid', value: num(2400) },
    ],
    expected: { sli: { status: 'available', allowed: 1200 } },
    note: 'min(2400, 2500) × (100000−92500)/15000 = 1,200 — and MAGI is measured before the deduction itself.',
  },
  {
    id: 'education/sli-dependent-denied',
    source: {
      kind: 'authority',
      citation: 'IRC §221: no deduction for a taxpayer claimable as a dependent.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'full-time-student-months', value: num(9) },
      { factId: 'lived-with-parents-months', value: num(12) },
      { factId: 'self-support-share-pct', value: num(20) },
      { factId: 'student-loan-interest-paid', value: num(900) },
    ],
    expected: { sli: { status: 'denied' } },
  },
];
