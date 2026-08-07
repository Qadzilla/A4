// ─── New York fixtures (F2) ────────────────────────────────────────
// Arithmetic hand-computed in the notes against the 2025 IT-201-I
// schedules. Every figure is transcribed in ny-data.ts with its source.
//
// The four things this state exists to prove: the convenience rule
// reaching wages earned entirely outside New York, New York City as a
// second income tax that follows the address rather than the job,
// Yonkers in both directions, and statutory residency detected and
// handed over rather than half-computed.

import type { NewYorkStatus } from '../states/new-york';
import type { FilingFixture, FixtureFact } from './types';

export interface NewYorkExpected {
  status: NewYorkStatus;
  basis?: 'resident' | 'nonresident-convenience' | null;
  nyAgi?: number;
  standardDeduction?: number;
  taxableIncome?: number;
  /** Rounded to the dollar. */
  stateTax?: number;
  householdCredit?: number;
  nycTax?: number;
  nycSchoolTaxCredit?: number;
  yonkersResidentSurcharge?: number;
  yonkersNonresidentTax?: number;
  totalNewYorkTax?: number;
  tuitionEligible?: boolean | 'unknown';
  statutoryResidencyDetected?: boolean;
  refusalsContain?: string;
  notesContain?: string;
}

export interface NewYorkFixture extends FilingFixture<NewYorkExpected> {
  ctx: {
    federalAgi: number;
    filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';
    canBeClaimed: 'yes' | 'no' | 'unknown';
    residencyStatus: 'us-person' | 'resident' | 'nonresident' | 'dual-status' | 'unknown';
    stateOfResidence: string | null;
    wages: number;
  };
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

const inNY = (): FixtureFact[] => [{ factId: 'state-of-residence', value: str('NY') }];

const base = {
  filingStatus: 'single' as const,
  canBeClaimed: 'no' as const,
  residencyStatus: 'us-person' as const,
  stateOfResidence: 'NY' as string | null,
};

export const NEW_YORK_FIXTURES: NewYorkFixture[] = [
  {
    id: 'ny/resident-wage-year',
    source: {
      kind: 'authority',
      citation:
        '2025 IT-201-I New York State tax rate schedule, filing status ① and ③, plus the $8,000 standard deduction from tax.ny.gov.',
    },
    taxYear: 2025,
    facts: [...inNY(), { factId: 'w2-wages', value: num(42000) }],
    ctx: { ...base, federalAgi: 42000, wages: 42000 },
    expected: {
      status: 'computed',
      basis: 'resident',
      nyAgi: 42000,
      standardDeduction: 8000,
      taxableIncome: 34000,
      stateTax: 1705,
    },
    note: "Taxable 42,000 − 8,000 = 34,000. Schedule: 4% × 8,500 = 340; 4.5% × 3,200 = 144 (running 484 at 11,700, which the schedule itself prints); 5.25% × 2,200 = 115.50 (running 599.50 ≈ the schedule's 600 at 13,900); 5.5% × (34,000 − 13,900 = 20,100) = 1,105.50. Total 1,705. Above 28,000 of federal AGI no household credit applies.",
  },
  {
    id: 'ny/household-credit-at-low-income',
    source: {
      kind: 'authority',
      citation:
        '2025 IT-201-I household credit table 1 (single): federal AGI over $7,000 but not over $20,000 gives $45. Nobody claims it deliberately — it simply applies.',
    },
    taxYear: 2025,
    facts: [...inNY(), { factId: 'w2-wages', value: num(18000) }],
    ctx: { ...base, federalAgi: 18000, wages: 18000 },
    expected: {
      status: 'computed',
      householdCredit: 45,
      notesContain: 'household credit',
    },
  },
  {
    id: 'ny/convenience-rule-reaches-across-state-lines',
    source: {
      kind: 'authority',
      citation:
        "TSB-M-06(5)I: New York sources wages to the employer's office unless working elsewhere was the employer's necessity — so days worked outside New York are still New York wages.",
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('MA') },
      { factId: 'employer-state', value: str('NY') },
      { factId: 'w2-wages', value: num(65000) },
    ],
    ctx: { ...base, stateOfResidence: 'MA', federalAgi: 65000, wages: 65000 },
    expected: {
      status: 'computed',
      basis: 'nonresident-convenience',
      nyAgi: 65000,
      notesContain: 'convenience of the employer',
    },
    note: 'P5, finally computed: worked from Boston all year for a Manhattan company. New York taxes every dollar of those wages and always has. The note says so, names the credit the home state gives back, and does not pretend the rule is optional.',
  },
  {
    id: 'ny/convenience-with-zero-ny-days',
    source: {
      kind: 'adversarial',
      rationale:
        'The cruel case from the contract: someone who has never set foot in New York, working remotely for a New York employer, is still caught. A module that quietly required NY duty days would under-report the bill and the person would find out by letter.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('FL') },
      { factId: 'employer-state', value: str('NY') },
      { factId: 'days-present-ny', value: num(0) },
      { factId: 'w2-wages', value: num(50000) },
    ],
    ctx: { ...base, stateOfResidence: 'FL', federalAgi: 50000, wages: 50000 },
    expected: {
      status: 'computed',
      basis: 'nonresident-convenience',
      nyAgi: 50000,
      notesContain: 'taxes those wages anyway',
    },
    note: 'Zero days in the state, full New York tax. Florida has no income tax to credit it against either, so this one is a pure loss the person never saw coming.',
  },
  {
    id: 'ny/employer-necessity-is-a-position-not-a-number',
    source: {
      kind: 'authority',
      citation:
        'TSB-M-06(5)I: the employer-necessity escape from the convenience rule is narrow, factual and heavily contested — claiming it is a filing position rather than an arithmetic input.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('MA') },
      { factId: 'employer-state', value: str('NY') },
      { factId: 'work-outside-employer-necessity', value: bool(true) },
      { factId: 'w2-wages', value: num(65000) },
    ],
    ctx: { ...base, stateOfResidence: 'MA', federalAgi: 65000, wages: 65000 },
    expected: { status: 'refused', refusalsContain: 'filing position' },
    note: 'The fence that matters: asserting necessity does NOT quietly reduce the bill. Basis names the conservative number, says the contest is worth real money if the facts support it, and hands the position to a preparer.',
  },
  {
    id: 'ny/nyc-is-a-second-income-tax',
    source: {
      kind: 'authority',
      citation:
        '2025 IT-201-I New York City resident tax rate schedule (filing status ① and ③) plus the $63 NYC school tax credit for income at or under $250,000.',
    },
    taxYear: 2025,
    facts: [
      ...inNY(),
      { factId: 'months-in-nyc', value: num(12) },
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, federalAgi: 42000, wages: 42000 },
    expected: {
      status: 'computed',
      nycSchoolTaxCredit: 63,
      notesContain: 'second income tax',
    },
    note: 'On 34,000 of city taxable income: 3.078% × 12,000 = 369.36; 3.762% × 13,000 = 489.06; 3.819% × 9,000 = 343.71 → 1,202.13, less the $63 school credit. Living in Queens costs this; living in Hoboken does not.',
  },
  {
    id: 'ny/yonkers-resident-surcharge',
    source: {
      kind: 'authority',
      citation:
        '2025 IT-201-I Yonkers worksheet, line n: "Yonkers resident tax rate (16.75%)" applied to the net state tax.',
    },
    taxYear: 2025,
    facts: [
      ...inNY(),
      { factId: 'months-in-yonkers', value: num(12) },
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, federalAgi: 42000, wages: 42000 },
    expected: {
      status: 'computed',
      stateTax: 1705,
      yonkersResidentSurcharge: 286,
      notesContain: 'purely for the address',
    },
    note: '16.75% of the 1,705 state tax = 285.59. A surcharge for the address, on top of a tax already paid.',
  },
  {
    id: 'ny/yonkers-nonresident-earnings-tax',
    source: {
      kind: 'authority',
      citation:
        '2025 Form Y-203-I line 6: multiply Yonkers earnings by "the rate of 0.5% (.005)". Wages of $3,000 or less need no return at all.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('NY') },
      { factId: 'yonkers-wages', value: num(20000) },
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, federalAgi: 42000, wages: 42000 },
    expected: {
      status: 'computed',
      yonkersNonresidentTax: 100,
      notesContain: 'Form Y-203',
    },
    note: 'Working in Yonkers while living elsewhere in New York: 0.5% × 20,000 = $100.',
  },
  {
    id: 'ny/yonkers-under-the-filing-floor',
    source: {
      kind: 'authority',
      citation:
        'Form Y-203-I: no nonresident earnings return is required where total Yonkers wages for the year were $3,000 or less.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('NY') },
      { factId: 'yonkers-wages', value: num(2500) },
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, federalAgi: 42000, wages: 42000 },
    expected: { status: 'computed', yonkersNonresidentTax: 0, notesContain: "don't require" },
  },
  {
    id: 'ny/statutory-residency-detected-and-handed-over',
    source: {
      kind: 'authority',
      citation:
        'New York statutory residency: more than 183 days in the state plus a permanent place of abode makes a resident for tax purposes regardless of domicile — and two states may then both claim the year.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('NJ') },
      { factId: 'employer-state', value: str('NY') },
      { factId: 'days-present-ny', value: num(200) },
      { factId: 'ny-permanent-abode', value: bool(true) },
      { factId: 'w2-wages', value: num(60000) },
    ],
    ctx: { ...base, stateOfResidence: 'NJ', federalAgi: 60000, wages: 60000 },
    expected: {
      status: 'refused',
      statutoryResidencyDetected: true,
      refusalsContain: 'statutory resident',
    },
    note: "Detect, explain, refuse — the dual-resident credit computation is F4's, and computing one side of it and calling it the answer would be worse than saying so.",
  },
  {
    id: 'ny/college-tuition-credit-is-refundable',
    source: {
      kind: 'authority',
      citation:
        '2025 Form IT-272-I: the college tuition credit is limited to $400 per eligible undergraduate student, full-year residents only, and is refunded if it exceeds the tax.',
    },
    taxYear: 2025,
    facts: [
      ...inNY(),
      { factId: 'qualified-tuition-paid', value: num(6000) },
      { factId: 'w2-wages', value: num(20000) },
    ],
    ctx: { ...base, federalAgi: 20000, wages: 20000 },
    expected: {
      status: 'computed',
      tuitionEligible: true,
      notesContain: 'REFUNDABLE',
    },
    note: "New York's own oblivious money for students — it pays out even at zero tax, and the amount comes from the IT-272 worksheet rather than being invented here.",
  },
  {
    id: 'ny/dependent-loses-the-tuition-credit',
    source: {
      kind: 'authority',
      citation:
        "IT-272-I: a student claimed as a dependent on another person's New York return cannot take the credit — only the person claiming them can.",
    },
    taxYear: 2025,
    facts: [
      ...inNY(),
      { factId: 'qualified-tuition-paid', value: num(6000) },
      { factId: 'w2-wages', value: num(8000) },
    ],
    ctx: { ...base, canBeClaimed: 'yes', federalAgi: 8000, wages: 8000 },
    expected: {
      status: 'computed',
      tuitionEligible: false,
      standardDeduction: 3100,
    },
    note: "The claimable student takes New York's $3,100 dependent standard deduction and loses the tuition credit to whoever claims them.",
  },
  {
    id: 'ny/recapture-refuses-rather-than-understates',
    source: {
      kind: 'adversarial',
      rationale:
        'Above $107,650 New York claws back the benefit of its lower brackets through banded worksheets. Running the plain schedule would UNDERSTATE the bill — the one direction a tax tool must never be wrong in — so the module refuses instead.',
    },
    taxYear: 2025,
    facts: [...inNY(), { factId: 'w2-wages', value: num(150000) }],
    ctx: { ...base, federalAgi: 150000, wages: 150000 },
    expected: { status: 'refused', refusalsContain: 'understate' },
  },
  {
    id: 'ny/no-new-york-connection',
    source: {
      kind: 'adversarial',
      rationale:
        'Someone with neither New York residence nor a New York employer must produce nothing at all — the convenience rule reaches far, but not everywhere.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('TX') },
      { factId: 'employer-state', value: str('TX') },
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, stateOfResidence: 'TX', federalAgi: 42000, wages: 42000 },
    expected: { status: 'not-applicable' },
  },
];
