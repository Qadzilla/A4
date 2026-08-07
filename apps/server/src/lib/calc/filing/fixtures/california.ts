// ─── California fixtures (F1) ──────────────────────────────────────
// Arithmetic hand-computed in the notes against the 2025 schedules so a
// reviewer checks the engine against FTB, not against itself. Every
// figure is transcribed in ca-data.ts with its source named.
//
// The three things this state exists to prove: the 0% federal window is
// federal only (California charges its ordinary rate on every dollar of
// it), the HSA add-back nobody expects, and two credits — a renter's
// credit that costs nothing but knowing, and a CalEITC that pays
// childless workers at 18 and then vanishes over a few thousand dollars
// of investment income.

import type { CaliforniaStatus, RenterCreditStatus } from '../states/california';
import type { FilingFixture, FixtureFact } from './types';

export interface CaliforniaExpected {
  status: CaliforniaStatus;
  caAgi?: number;
  hsaAddBack?: number;
  standardDeduction?: number;
  taxableIncome?: number;
  /** Rounded to the dollar; the notes carry the exact arithmetic. */
  taxBeforeCredits?: number;
  exemptionCredit?: number;
  taxAfterCredits?: number;
  taxOnCapitalGains?: number;
  renterStatus?: RenterCreditStatus;
  renterAmount?: number;
  calEitcEligible?: boolean | 'unknown';
  calEitcMax?: number;
  refusalsContain?: string;
  notesContain?: string;
}

export interface CaliforniaFixture extends FilingFixture<CaliforniaExpected> {
  /** The federal side the state module consumes. */
  ctx: {
    federalAgi: number;
    filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';
    canBeClaimed: 'yes' | 'no' | 'unknown';
    residencyStatus: 'us-person' | 'resident' | 'nonresident' | 'dual-status' | 'unknown';
    earnedIncome: number;
    investmentIncome: number;
    capitalGains: number;
  };
}

const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;
const date = (v: string) => ({ kind: 'date', value: v }) as const;

const inCA = (): FixtureFact[] => [{ factId: 'state-of-residence', value: str('CA') }];
const adult = (): FixtureFact[] => [{ factId: 'birth-date', value: date('2000-05-05') }];

const base = {
  filingStatus: 'single' as const,
  canBeClaimed: 'no' as const,
  residencyStatus: 'us-person' as const,
  investmentIncome: 0,
  capitalGains: 0,
};

export const CALIFORNIA_FIXTURES: CaliforniaFixture[] = [
  {
    id: 'ca/wage-year-computes',
    source: {
      kind: 'authority',
      citation:
        '2025 California Tax Rate Schedule X, standard deduction chart and Form 540 line 7 exemption credit — a plain wage year through California’s own arithmetic.',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(42000) }],
    ctx: { ...base, federalAgi: 42000, earnedIncome: 42000 },
    expected: {
      status: 'computed',
      caAgi: 42000,
      standardDeduction: 5706,
      taxableIncome: 36294,
      taxBeforeCredits: 816,
      exemptionCredit: 153,
      taxAfterCredits: 663,
    },
    note: 'Taxable 42,000 − 5,706 = 36,294. Schedule X: 1% × 11,079 = 110.79, plus 2% × 15,185 = 303.70, which is the 414.49 the schedule itself prints at the 26,264 boundary — then 4% × (36,294 − 26,264) = 401.20. Total 815.69, less the $153 exemption credit = 662.69. Rounded: 816 and 663.',
  },
  {
    id: 'ca/no-zero-window-here',
    source: {
      kind: 'authority',
      citation:
        'FTB: California has no preferential capital-gains rate — gains are ordinary income (B3’s treatment table, formalised into liability).',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(20000) }],
    ctx: {
      ...base,
      federalAgi: 25000,
      earnedIncome: 20000,
      investmentIncome: 5000,
      capitalGains: 5000,
    },
    expected: {
      status: 'computed',
      caAgi: 25000,
      notesContain: 'no 0% window',
    },
    note: 'The whole point of the state module: $5,000 of long-term gain that costs nothing federally inside the 0% bracket still runs through California’s ordinary schedule. The engine reports exactly what those gains cost here.',
  },
  {
    id: 'ca/hsa-add-back',
    source: {
      kind: 'authority',
      citation:
        'Schedule CA (540) line 13: federal law allows an HSA deduction, California law does not conform — the amount adds back to California income.',
    },
    taxYear: 2025,
    facts: [
      ...inCA(),
      ...adult(),
      { factId: 'w2-wages', value: num(40000) },
      { factId: 'w2-hsa-contributions', value: num(2000) },
    ],
    ctx: { ...base, federalAgi: 40000, earnedIncome: 40000 },
    expected: {
      status: 'computed',
      hsaAddBack: 2000,
      caAgi: 42000,
      notesContain: 'only two states',
    },
    note: 'The code-W money that vanished from federal box 1 is taxable in California — so CA income is 2,000 higher than federal AGI, and nobody warns you.',
  },
  {
    id: 'ca/renters-credit-claimed',
    source: {
      kind: 'authority',
      citation:
        "ftb.ca.gov nonrefundable renter's credit: $60 single, California income at or under $53,994, rent paid at least half the year.",
    },
    taxYear: 2025,
    facts: [
      ...inCA(),
      ...adult(),
      { factId: 'w2-wages', value: num(42000) },
      { factId: 'rent-months-california', value: num(12) },
    ],
    ctx: { ...base, federalAgi: 42000, earnedIncome: 42000 },
    expected: {
      status: 'computed',
      renterStatus: 'claimed',
      renterAmount: 60,
      notesContain: "renter's credit applies",
    },
    note: 'Costs nothing but knowing it exists — no receipts, no schedule, one checkbox on the 540.',
  },
  {
    id: 'ca/renters-credit-income-gate',
    source: {
      kind: 'adversarial',
      rationale:
        'The credit has a hard income ceiling; a year over it must report the gate by name rather than silently omitting the credit, so the person knows why it is absent.',
    },
    taxYear: 2025,
    facts: [
      ...inCA(),
      ...adult(),
      { factId: 'w2-wages', value: num(70000) },
      { factId: 'rent-months-california', value: num(12) },
    ],
    ctx: { ...base, federalAgi: 70000, earnedIncome: 70000 },
    expected: { status: 'computed', renterStatus: 'income-too-high', renterAmount: 0 },
  },
  {
    id: 'ca/renters-credit-unasked-is-priced',
    source: {
      kind: 'adversarial',
      rationale:
        'Most users never volunteer that they rent. An unasserted rent fact must surface as a named missing fact with the money attached — silence here is exactly the oblivious money the state module exists to find.',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(42000) }],
    ctx: { ...base, federalAgi: 42000, earnedIncome: 42000 },
    expected: {
      status: 'computed',
      renterStatus: 'unknown',
      notesContain: 'worth asking',
    },
  },
  {
    id: 'ca/caleitc-pays-childless-young-workers',
    source: {
      kind: 'authority',
      citation:
        'ftb.ca.gov CalEITC eligibility: at least 18 years old OR a qualifying child; earned income $1–$32,900; 2025 maximum with no children $302.',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(18000) }],
    ctx: { ...base, federalAgi: 18000, earnedIncome: 18000 },
    expected: {
      status: 'computed',
      calEitcEligible: true,
      calEitcMax: 302,
      notesContain: 'from age 18',
    },
    note: 'The deliberate state choice: California pays childless workers the federal credit largely ignores at this age.',
  },
  {
    id: 'ca/caleitc-investment-ceiling-is-a-cliff',
    source: {
      kind: 'authority',
      citation:
        '2025 FTB 3514 booklet, Step 2: investment income over $4,814 — "Stop here, you cannot take the credit." Not reduced; ended.',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(18000) }],
    ctx: {
      ...base,
      federalAgi: 23000,
      earnedIncome: 18000,
      investmentIncome: 5000,
      capitalGains: 5000,
    },
    expected: {
      status: 'computed',
      calEitcEligible: false,
      calEitcMax: 0,
      notesContain: 'not reduced, ended',
    },
    note: 'The cruel case from the contract: a brokerage year kills the credit outright. $5,000 of gains costs the entire CalEITC — and the engine has to check it, because nothing else will.',
  },
  {
    id: 'ca/dependent-loses-both-credits',
    source: {
      kind: 'authority',
      citation:
        "ftb.ca.gov: the renter's credit is closed to someone living with a person who can claim them; CalEITC is closed to anyone eligible to be claimed as a dependent without a qualifying child of their own.",
    },
    taxYear: 2025,
    facts: [
      ...inCA(),
      { factId: 'birth-date', value: date('2006-03-10') },
      { factId: 'w2-wages', value: num(8000) },
      { factId: 'rent-months-california', value: num(12) },
    ],
    ctx: { ...base, canBeClaimed: 'yes', federalAgi: 8000, earnedIncome: 8000 },
    expected: {
      status: 'computed',
      renterStatus: 'lived-with-someone-who-can-claim-you',
      calEitcEligible: false,
      standardDeduction: 1350,
    },
    note: 'The claimable student loses the renter’s credit, loses CalEITC, and takes California’s dependent standard-deduction floor — three consequences of one household fact.',
  },
  {
    id: 'ca/2026-not-published-refuses',
    source: {
      kind: 'adversarial',
      rationale:
        'FTB indexes California’s figures annually and had not published 2026 when this shipped. Indexing them here would be a guess with a dollar sign on it — the module refuses the year by name, which is the whole Doctrine 6 posture applied to a state.',
    },
    taxYear: 2026,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(42000) }],
    ctx: { ...base, federalAgi: 42000, earnedIncome: 42000 },
    expected: { status: 'refused', refusalsContain: "aren't published yet" },
  },
  {
    id: 'ca/nonresident-alien-routes-to-540nr',
    source: {
      kind: 'authority',
      citation:
        'California has no nonresident-alien concept: federal 1040-NR status does not carry over, and the year files a 540NR with allocation — F4’s work, named here.',
    },
    taxYear: 2025,
    facts: [...inCA(), ...adult(), { factId: 'w2-wages', value: num(12000) }],
    ctx: { ...base, residencyStatus: 'nonresident', federalAgi: 12000, earnedIncome: 12000 },
    expected: { status: 'refused', refusalsContain: '540NR' },
  },
  {
    id: 'ca/not-a-californian',
    source: {
      kind: 'adversarial',
      rationale:
        'A Texan must produce nothing at all from the California module — a state determination that fires for everyone is worse than none.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'state-of-residence', value: str('TX') },
      ...adult(),
      { factId: 'w2-wages', value: num(42000) },
    ],
    ctx: { ...base, federalAgi: 42000, earnedIncome: 42000 },
    expected: { status: 'not-applicable' },
  },
];
