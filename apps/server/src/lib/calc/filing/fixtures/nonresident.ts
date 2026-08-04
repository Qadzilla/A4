// ─── Nonresident fixtures (E1) ─────────────────────────────────────
// The other return, pinned where the polarity flips: no standard
// deduction (taxed from the first dollar), exempt §871(i) bank interest
// (the pleasant finding), state tax as the itemized deduction that
// matters, scholarship as ECI at graduated rates — and a named refusal
// for every stream whose FDAP/ECI classification E1 does not attempt.
// The elections (§6013(g)/(h) joint treatment) refuse by name. The cruel
// case runs in the wiring tests: an F-1 in year six is a RESIDENT and
// must get none of this — the flip is A2's, and E1 trusts it.

import type { NonresidentDetermination } from '../nonresident';
import type { FilingFixture } from './types';

export interface NonresidentExpected {
  status: NonresidentDetermination['status'];
  filingStatus?: 'single' | 'mfs';
  wages?: number;
  taxableScholarship?: number;
  exemptInterest?: number;
  itemizedStateTax?: number;
  federalWithheld?: number;
  outOfScopeContain?: string;
  refusalsContain?: string;
  notesContain?: string;
}

export type NonresidentFixture = FilingFixture<NonresidentExpected>;

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

const single = () => [{ factId: 'married' as const, value: bool(false) }];

export const NONRESIDENT_FIXTURES: NonresidentFixture[] = [
  {
    id: 'nr/p3-wage-year',
    source: { kind: 'persona', persona: 'P3' },
    taxYear: 2026,
    facts: [...single(), { factId: 'w2-wages', value: num(12000) }],
    expected: {
      status: 'computed',
      filingStatus: 'single',
      wages: 12000,
      notesContain: 'standard deduction',
    },
    note: 'The shape itself: $12,000 of campus wages are ECI at the graduated rates with NO standard deduction in front — the same money a resident shelters entirely is taxed from the first dollar here.',
  },
  {
    id: 'nr/exempt-interest-finding',
    source: {
      kind: 'authority',
      citation:
        'IRC §871(i) / Pub 519: interest on deposits with US banks paid to a nonresident alien is exempt from US tax — it does not enter the return at all.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'interest-income', value: num(300) },
    ],
    expected: {
      status: 'computed',
      wages: 12000,
      exemptInterest: 300,
      notesContain: '§871(i)',
    },
    note: "The pleasant finding: the savings-account interest a resident pays ordinary rates on isn't US-taxable for a nonresident at all. $300 comes OUT of the return.",
  },
  {
    id: 'nr/scholarship-is-eci',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: a nonresident student’s taxable scholarship (amounts beyond qualified tuition) is treated as effectively connected income, taxed at the graduated rates; 1042-S box 7a withholding credits against it.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      // Derived fact: rule-sourced only, exactly as C4's planner asserts it.
      {
        factId: 'taxable-scholarship-income',
        value: num(5000),
        rule: { ruleId: 'c4/taxable-scholarship', consumed: [] },
      },
      { factId: 'scholarship-federal-withheld', value: num(700) },
    ],
    expected: {
      status: 'computed',
      taxableScholarship: 5000,
      federalWithheld: 700,
      notesContain: 'graduated rates',
    },
    note: 'The routing the acceptance demands: the SAME taxable-scholarship fact C4 stores rides the resident return as other income behind a standard deduction — here it is ECI with nothing in front of it, and the 14% the school withheld on the 1042-S credits back.',
  },
  {
    id: 'nr/state-tax-itemizes',
    source: {
      kind: 'authority',
      citation:
        '1040-NR instructions (Schedule A): state and local income taxes are deductible on the nonresident return — the standard deduction is not available to nonresidents (India treaty excepted, E3).',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(30000) },
      { factId: 'w2-state-tax-withheld', value: num(1500) },
    ],
    expected: {
      status: 'computed',
      wages: 30000,
      itemizedStateTax: 1500,
      notesContain: 'itemizes',
    },
    note: 'The one deduction that matters on this return: $1,500 of state withholding itemizes where no standard deduction exists.',
  },
  {
    id: 'nr/married-files-separately',
    source: {
      kind: 'authority',
      citation:
        '1040-NR instructions: a married nonresident generally cannot file jointly — the return is married-filing-separately shaped, using the MFS rate column.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'married', value: bool(true) },
      { factId: 'w2-wages', value: num(20000) },
    ],
    expected: {
      status: 'computed',
      filingStatus: 'mfs',
      notesContain: 'separately',
    },
  },
  {
    id: 'nr/joint-election-refused',
    source: {
      kind: 'authority',
      citation:
        'IRC §6013(g)/(h): a nonresident spouse can elect to be treated as a US resident for the whole year — an election with multi-year consequences that changes which law applies to every dollar. Named and refused, never assumed.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'married', value: bool(true) },
      { factId: 'filing-jointly', value: bool(true) },
      { factId: 'w2-wages', value: num(20000) },
    ],
    expected: {
      status: 'refused',
      refusalsContain: '6013',
    },
  },
  {
    id: 'nr/married-unknown-refused',
    source: {
      kind: 'adversarial',
      rationale:
        'Single-or-MFS is the whole shape decision on a 1040-NR; computing either on a guess would be a default in disguise. Unresolved marriage refuses with the reason, and the fork prices the answer.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-wages', value: num(12000) }],
    expected: {
      status: 'refused',
      refusalsContain: 'unresolved',
    },
  },
  {
    id: 'nr/dividends-are-fdap-refused',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: US-source dividends to a nonresident are FDAP income under a 30%-or-treaty withholding regime — classification E1 names and does not attempt.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'dividends-ordinary', value: num(400) },
    ],
    expected: {
      status: 'refused',
      outOfScopeContain: 'dividends-ordinary',
      refusalsContain: 'FDAP',
    },
  },
  {
    id: 'nr/gains-turn-on-presence-refused',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: capital gains of a nonresident turn on the 183-day presence test and source rules (and exempt-individual days complicate both) — out of E1’s scope by name.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'realized-short-gains', value: num(800) },
    ],
    expected: {
      status: 'refused',
      outOfScopeContain: 'realized-short-gains',
      refusalsContain: 'presence days',
    },
  },
  {
    id: 'nr/gig-work-refused',
    source: {
      kind: 'adversarial',
      rationale:
        'Nonresident self-employment raises work-authorization and ECI questions no engine should answer casually — an F-1 with DoorDash income has a bigger problem than a Schedule C, and the refusal must not paper over it.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'contract-income', value: num(5000) },
    ],
    expected: {
      status: 'refused',
      outOfScopeContain: 'contract-income',
      refusalsContain: 'work-authorization',
    },
  },
  {
    id: 'nr/marketplace-refused',
    source: {
      kind: 'authority',
      citation:
        '8962 instructions / Pub 974: premium-tax-credit eligibility generally requires being a resident taxpayer — a nonresident year with marketplace coverage is a preparer conversation.',
    },
    taxYear: 2026,
    facts: [
      ...single(),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'marketplace-health-insurance', value: bool(true) },
    ],
    expected: {
      status: 'refused',
      refusalsContain: 'resident status',
    },
  },
  {
    id: 'nr/credits-explained-not-hidden',
    source: {
      kind: 'authority',
      citation:
        'Form 8863 and Form 8880 instructions: nonresident aliens (not electing resident treatment) cannot take the education credits or the saver’s credit — the explanation belongs on the return, not behind a missing button.',
    },
    taxYear: 2026,
    facts: [...single(), { factId: 'w2-wages', value: num(12000) }],
    expected: {
      status: 'computed',
      notesContain: 'closed to nonresident returns',
    },
    note: 'A nonresident Googling "American Opportunity Credit" deserves the real answer. The determination says why the credits are absent, every time, in words.',
  },
];
