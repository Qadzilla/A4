// ─── Massachusetts fixtures (F3) ───────────────────────────────────
// Arithmetic hand-computed in the notes against mass.gov's published
// rates, exemptions and NTS/LIC thresholds. Figures live in ma-data.ts
// with their sources.
//
// What this state exists to prove: the 8.5% short-term class that beats
// most federal brackets at this income, and three mercies students hit
// constantly and almost never claim — No Tax Status, the Limited Income
// Credit, and deductions for rent and undergraduate loan interest that
// are more generous than anything federal.

import type { MassachusettsStatus } from '../states/massachusetts';
import type { FilingFixture, FixtureFact } from './types';

export interface MassachusettsExpected {
  status: MassachusettsStatus;
  partBTaxable?: number;
  personalExemption?: number;
  rentalDeduction?: number;
  studentLoanDeduction?: number;
  massachusettsAgi?: number;
  /** Rounded to the dollar. */
  taxBeforeMercies?: number;
  noTaxStatus?: boolean;
  limitedIncomeCredit?: number;
  totalMassachusettsTax?: number;
  missingFactsContain?: string;
  refusalsContain?: string;
  notesContain?: string;
}

export interface MassachusettsFixture extends FilingFixture<MassachusettsExpected> {
  ctx: {
    filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';
    stateOfResidence: string | null;
    seNetProfit: number;
  };
}

const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

const inMA = (): FixtureFact[] => [{ factId: 'state-of-residence', value: str('MA') }];

const base = { filingStatus: 'single' as const, stateOfResidence: 'MA', seNetProfit: 0 };

export const MASSACHUSETTS_FIXTURES: MassachusettsFixture[] = [
  {
    id: 'ma/wage-year-computes',
    source: {
      kind: 'authority',
      citation:
        'mass.gov: Part B income is taxed at 5%, and the single personal exemption is $4,400 (Form 1 line 2a).',
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(65000) }],
    ctx: base,
    expected: {
      status: 'computed',
      personalExemption: 4400,
      partBTaxable: 60600,
      taxBeforeMercies: 3030,
      totalMassachusettsTax: 3030,
    },
    note: '65,000 − 4,400 exemption = 60,600 of Part B income at 5% = $3,030. Well over both mercy thresholds, so neither applies.',
  },
  {
    id: 'ma/short-term-beats-the-federal-bracket',
    source: {
      kind: 'authority',
      citation:
        'mass.gov tax rates: Massachusetts taxes Part A short-term capital gains at 8.5%, against 5% on wages — higher than the federal bracket most of this audience is in.',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'realized-short-gains', value: num(2000) },
    ],
    ctx: base,
    expected: {
      status: 'computed',
      taxBeforeMercies: 3200,
      notesContain: 'higher than the 5% it charges on wages',
    },
    note: "P5's $2,000 of short-term gain: 8.5% = $170 of Massachusetts tax on top of the $3,030 on wages. At a 12% federal bracket the state takes almost as much as the IRS does on that sale.",
  },
  {
    id: 'ma/no-tax-status-is-zero-not-less',
    source: {
      kind: 'authority',
      citation:
        'mass.gov No Tax Status: a single filer whose Massachusetts AGI does not exceed $8,000 owes no Massachusetts income tax at all, but still files.',
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(7500) }],
    ctx: base,
    expected: {
      status: 'computed',
      noTaxStatus: true,
      totalMassachusettsTax: 0,
      notesContain: 'Not reduced: zero',
    },
    note: 'The finding students never hear: under the floor the state tax is zero, and filing is purely how the withholding comes back.',
  },
  {
    id: 'ma/limited-income-credit-caps-the-tax',
    source: {
      kind: 'authority',
      citation:
        'Form 1 Line 29 worksheet: above No Tax Status but under $14,000 (single), the tax is capped at 10% of the excess of Massachusetts AGI over the $8,000 No Tax Status limit.',
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(10000) }],
    ctx: base,
    expected: {
      status: 'computed',
      noTaxStatus: false,
      limitedIncomeCredit: 80,
      totalMassachusettsTax: 200,
      notesContain: 'Limited Income Credit',
    },
    note: 'MA AGI 10,000 — over the $8,000 floor, under the $14,000 ceiling. Regular tax: (10,000 − 4,400) × 5% = $280. The cap is 10% × (10,000 − 8,000) = $200, which is lower, so the credit takes $80 off and the tax is $200.',
  },
  {
    id: 'ma/limited-income-credit-does-not-always-bite',
    source: {
      kind: 'adversarial',
      rationale:
        'The credit only helps where the 10%-of-excess cap falls BELOW the regular tax, which stops being true around $11,600 of income. A module that applied the cap unconditionally would OVERCHARGE everyone in the upper half of the band — this fixture pins that the engine compares rather than assumes.',
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(12000) }],
    ctx: base,
    expected: {
      status: 'computed',
      noTaxStatus: false,
      limitedIncomeCredit: 0,
      totalMassachusettsTax: 380,
    },
    note: 'MA AGI 12,000. Regular tax: (12,000 − 4,400) × 5% = $380. The cap is 10% × (12,000 − 8,000) = $400 — HIGHER than the tax, so it does not apply and the tax stays $380. The two LIC fixtures bracket the crossover at $11,600.',
  },
  {
    id: 'ma/rental-deduction-is-half-the-rent',
    source: {
      kind: 'authority',
      citation:
        'mass.gov: a Massachusetts renter may deduct 50% of rent paid on a principal residence, capped at $4,000.',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'rent-paid-massachusetts', value: num(24000) },
    ],
    ctx: base,
    expected: {
      status: 'computed',
      rentalDeduction: 4000,
      partBTaxable: 56600,
      notesContain: 'Half your rent deducts',
    },
    note: '$24,000 of rent → half is 12,000, capped at 4,000. Worth $200 of tax at the 5% rate, for a lease you already signed.',
  },
  {
    id: 'ma/rent-unasked-is-priced',
    source: {
      kind: 'adversarial',
      rationale:
        "Nobody volunteers their rent to a tax product. An unasserted rent fact must surface as a named missing fact with the money attached — this is the same oblivious-money pattern as California's renter credit.",
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(65000) }],
    ctx: base,
    expected: {
      status: 'computed',
      missingFactsContain: 'rent-paid-massachusetts',
      notesContain: 'worth asking',
    },
  },
  {
    id: 'ma/undergrad-loan-interest-in-full',
    source: {
      kind: 'authority',
      citation:
        'mass.gov education deductions: Massachusetts allows a deduction for undergraduate student-loan interest with no ceiling and no phaseout, and it may be claimed alongside the federal deduction on different payments.',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'student-loan-interest-paid', value: num(3200) },
    ],
    ctx: base,
    expected: {
      status: 'computed',
      studentLoanDeduction: 3200,
      notesContain: 'no $2,500 ceiling',
    },
    note: 'The federal deduction stops at $2,500 and phases out entirely at higher incomes. Massachusetts deducts the whole $3,200 regardless — state generosity nobody advertises.',
  },
  {
    id: 'ma/losses-refuse-rather-than-overstate',
    source: {
      kind: 'adversarial',
      rationale:
        'SUPERSEDED, kept as the record. This fixture pinned F3 REFUSING a year with capital losses, because Massachusetts nets them in an order that had not been transcribed — mass.gov blocks automated fetching and the Schedule B and D instructions were unreachable across three slices. Refusing was the right call: the ordering stated in that refusal turned out to be backwards. The statute (M.G.L. c. 62 § 2(c)) settled it, so the same facts now compute. Superseded by ma/short-term-loss-reaches-long-term-gains.',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'realized-short-gains', value: num(-3000) },
      { factId: 'realized-long-gains', value: num(5000) },
    ],
    ctx: base,
    expected: { status: 'computed' },
    note: 'The assertion this fixture makes has changed — from "refuses" to "computes" — which is the one kind of change the ledger exists to make visible. It is kept rather than deleted so that the reason the engine once refused stays readable.',
  },
  {
    id: 'ma/short-term-loss-reaches-long-term-gains',
    source: {
      kind: 'authority',
      citation:
        'M.G.L. c. 62 § 2(c)(2)(a): a Part A net capital loss goes first against Part A interest and dividends, capped by ¶(4), and "any remaining excess … shall be applied against capital gains included in Part C gross income."',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(65000) },
      { factId: 'realized-short-gains', value: num(-3000) },
      { factId: 'realized-long-gains', value: num(5000) },
    ],
    ctx: base,
    expected: { status: 'computed' },
    note: "F3's cruel case, now computed rather than refused. The $3,000 short-term loss has no interest or dividends to reach — the statute's first stop is empty here — so all of it lands on the $5,000 of long-term gain, leaving $2,000 taxable at 5%. Nothing carries forward. The empty first stop is the point: the $2,000 allowance is a ceiling on what CAN be applied, not an amount that gets applied.",
  },
  {
    id: 'ma/long-term-loss-takes-the-8.5-percent-gain-first',
    source: {
      kind: 'authority',
      citation:
        'M.G.L. c. 62 § 2(c)(2)(b): a Part C net capital loss "shall be applied against capital gains included in Part A gross income" FIRST, and only the excess reaches interest and dividends.',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(40000) },
      { factId: 'interest-income', value: num(3000) },
      { factId: 'realized-short-gains', value: num(4000) },
      { factId: 'realized-long-gains', value: num(-5000) },
    ],
    ctx: base,
    expected: { status: 'computed' },
    note: "The fixture that proves the ordering is worth money. The $5,000 long-term loss goes against the $4,000 of SHORT-TERM gain first — the class Massachusetts taxes at 8.5% — leaving $1,000, which then comes off interest and dividends: $3,000 - $1,000 = $2,000 taxable at 5%, or $100. Reverse the two steps and $2,000 would go to interest (the cap), leaving $3,000 of loss to absorb only $3,000 of the short-term gain: $1,000 of short-term left at 8.5% plus $1,000 of interest at 5% = $135. The statute's order is $35 cheaper, and a guessed order would have charged it.",
  },
  {
    id: 'ma/the-two-thousand-cap-and-what-survives-it',
    source: {
      kind: 'authority',
      citation:
        'M.G.L. c. 62 § 2(c)(4): "not more than an aggregate amount of $2,000 in Part A capital loss and Part C capital loss shall be applied against any interest and dividends included in Part A gross income."',
    },
    taxYear: 2025,
    facts: [
      ...inMA(),
      { factId: 'w2-wages', value: num(40000) },
      { factId: 'interest-income', value: num(5000) },
      { factId: 'realized-short-gains', value: num(-4000) },
    ],
    ctx: base,
    expected: { status: 'computed', notesContain: 'the federal figure is $3,000' },
    note: 'The cap, and the surprise inside it. $2,000 of the $4,000 loss comes off the $5,000 of interest, leaving $3,000 taxable; there are no long-term gains for the remainder to reach, so $2,000 carries forward as a Part A loss. The cap is $2,000 where the federal one is $3,000 — an asymmetry nobody expects, which is why the note says it out loud.',
  },
  {
    id: 'ma/mfs-gets-neither-mercy',
    source: {
      kind: 'authority',
      citation:
        'mass.gov: "Married filing separate taxpayers don\'t qualify for either NTS or LIC." A real price of the filing-status election.',
    },
    taxYear: 2025,
    facts: [...inMA(), { factId: 'w2-wages', value: num(7500) }],
    ctx: { ...base, filingStatus: 'mfs' },
    expected: {
      status: 'computed',
      noTaxStatus: false,
      notesContain: 'qualifies for neither',
    },
    note: 'The same $7,500 that is tax-free for a single filer is taxable filing separately — the election costs the whole mercy.',
  },
  {
    id: 'ma/2026-not-verified-refuses',
    source: {
      kind: 'adversarial',
      rationale:
        "Massachusetts sets the exemption and mercy thresholds annually. Only the year confirmed against mass.gov is loaded; carrying 2025's figures forward on the assumption nothing moved is exactly the guess this engine refuses to make.",
    },
    taxYear: 2026,
    facts: [...inMA(), { factId: 'w2-wages', value: num(65000) }],
    ctx: base,
    expected: { status: 'refused', refusalsContain: "aren't verified" },
  },
  {
    id: 'ma/not-a-massachusetts-year',
    source: {
      kind: 'adversarial',
      rationale:
        'A resident of anywhere else must produce nothing at all from the Massachusetts module.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('NH') },
      { factId: 'w2-wages', value: num(65000) },
    ],
    ctx: { ...base, stateOfResidence: 'NH' },
    expected: { status: 'not-applicable' },
  },
];
