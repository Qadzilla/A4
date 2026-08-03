// ─── Self-employment fixtures (D4) ─────────────────────────────────
// The SE arithmetic is statutory and hand-computed in every note: net
// profit × 0.9235, 12.4% Social Security up to the wage base less W-2
// wages, 2.9% Medicare on all of it. The $400 floor is measured on NET
// EARNINGS (after the 0.9235), not net profit — the boundary pair below
// exists because that distinction is exactly where a naive engine slips.
// Mileage rates verified 2026-08: 70¢ for 2025; 2026 splits (72.5¢
// Jan–Jun per Notice 2026-10, 76¢ from July 1 per IR-2025-128) and the
// engine floors at the January rate, named.

import type { SelfEmploymentStatus } from '../self-employment';
import type { FilingFixture, FixtureFact } from './types';

export interface SelfEmploymentExpected {
  status: SelfEmploymentStatus;
  grossReceipts?: number;
  mileageExpense?: number;
  totalExpenses?: number;
  netProfit?: number;
  seTaxApplies?: boolean;
  /** Rounded to the dollar — the notes carry the exact arithmetic. */
  seTax?: number;
  leansEmployee?: boolean;
  employeeShare?: number;
  delta?: number;
  missingFactsContain?: string;
  refusalsContain?: string;
  notesContain?: string;
}

export type SelfEmploymentFixture = FilingFixture<SelfEmploymentExpected>;

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

/** Expenses pinned to zero so a fixture's arithmetic is about one thing. */
const noExpenses = (): FixtureFact[] => [
  { factId: 'business-miles', value: num(0) },
  { factId: 'business-phone-expense', value: num(0) },
];

export const SELF_EMPLOYMENT_FIXTURES: SelfEmploymentFixture[] = [
  {
    id: 'se/p4-the-fifteen-three-surprise',
    source: { kind: 'persona', persona: 'P4' },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(1800) },
      { factId: 'platform-income', value: num(900) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      grossReceipts: 2700,
      netProfit: 2700,
      seTaxApplies: true,
      seTax: 381,
      notesContain: 'no one withheld',
    },
    note: 'P4 whole: 1,800 + 900 = 2,700 net. Net earnings 2,700 × 0.9235 = 2,493.45 ≥ 400 → SE tax 2,493.45 × 15.3% = 381.50. Under the standard deduction there is no income tax at all — the whole bill is the 15.3% nobody mentioned.',
  },
  {
    id: 'se/floor-measured-on-net-earnings',
    source: {
      kind: 'authority',
      citation:
        'Schedule SE instructions: no SE tax unless net earnings from self-employment (net profit × 92.35%) are $400 or more. $433 × 0.9235 = $399.87 — under.',
    },
    taxYear: 2026,
    facts: [{ factId: 'contract-income', value: num(433) }, ...noExpenses()],
    expected: {
      status: 'computed',
      netProfit: 433,
      seTaxApplies: false,
      seTax: 0,
      notesContain: '$400 floor',
    },
    note: 'The boundary case a net-profit test gets wrong: $433 of profit looks over $400, but the floor runs on net earnings — 399.87, under. Income tax still applies; SE tax lawfully does not.',
  },
  {
    id: 'se/one-dollar-over-the-floor',
    source: {
      kind: 'authority',
      citation:
        'Schedule SE instructions, same rule from the other side: $434 × 0.9235 = $400.80 ≥ $400 — the tax applies from the first dollar of net earnings, not just the excess.',
    },
    taxYear: 2026,
    facts: [{ factId: 'contract-income', value: num(434) }, ...noExpenses()],
    expected: {
      status: 'computed',
      netProfit: 434,
      seTaxApplies: true,
      seTax: 61,
    },
    note: 'One dollar of profit — 434 vs 433 — is $61 of tax: 400.80 × 15.3% = 61.32. Not a marginal dollar; the whole base becomes taxable at once.',
  },
  {
    id: 'se/mileage-2026-floor-rate',
    source: {
      kind: 'authority',
      citation:
        'Notice 2026-10: 72.5¢/mile Jan–Jun 2026; IR-2025-128: 76¢/mile from July 1. One annual miles fact → the engine floors at 72.5¢ and says so.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(5000) },
      { factId: 'business-miles', value: num(2000) },
      { factId: 'business-phone-expense', value: num(0) },
    ],
    expected: {
      status: 'computed',
      mileageExpense: 1450,
      netProfit: 3550,
      seTax: 502,
      notesContain: '76¢',
    },
    note: '2,000 mi × 72.5¢ = 1,450 → net 3,550 → earnings 3,278.43 → tax 501.60. The split-year note rides along: a July-heavy driver deducts more than shown, never less.',
  },
  {
    id: 'se/mileage-2025-single-rate',
    source: {
      kind: 'authority',
      citation: 'Notice 2025-5: the 2025 standard mileage rate is 70¢/mile, one rate all year.',
    },
    taxYear: 2025,
    facts: [
      { factId: 'contract-income', value: num(5000) },
      { factId: 'business-miles', value: num(2000) },
      { factId: 'business-phone-expense', value: num(0) },
    ],
    expected: {
      status: 'computed',
      mileageExpense: 1400,
      netProfit: 3600,
    },
    note: 'The same 2,000 miles are worth $1,400 in 2025 and $1,450 in 2026 — the rate lives in year-data because it moves (Doctrine 6).',
  },
  {
    id: 'se/platform-decomposition-nets',
    source: { kind: 'persona', persona: 'P4' },
    taxYear: 2026,
    facts: [
      { factId: 'platform-income', value: num(2300) },
      { factId: 'platform-refunds', value: num(100) },
      { factId: 'personal-items-proceeds', value: num(900) },
      { factId: 'platform-fees', value: num(300) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      grossReceipts: 1300,
      totalExpenses: 300,
      netProfit: 1000,
      seTax: 141,
    },
    note: "C2's decomposition finally cashes out: 2,300 gross − 100 refunds − 900 Depop couch = 1,300 of business receipts; fees of 300 deduct → net 1,000 → 923.50 × 15.3% = 141.30. The 1099-K's box 1a was never income.",
  },
  {
    id: 'se/nec-k-overlap-never-double-counts',
    source: {
      kind: 'authority',
      citation:
        'Schedule C instructions on statutory double-reporting: the same pay can appear on both a 1099-NEC and a 1099-K; it is reported once. C2 stores the overlap as its own fact.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(5000) },
      { factId: 'platform-income', value: num(3000) },
      { factId: 'nec-k-overlap', value: num(2000) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      grossReceipts: 6000,
      netProfit: 6000,
    },
    note: '5,000 + 3,000 − 2,000 overlap = 6,000, not 8,000 — the same dollars reported by two forms are still the same dollars.',
  },
  {
    id: 'se/wage-base-offset',
    source: {
      kind: 'authority',
      citation:
        'Schedule SE line 8–10: W-2 Social Security wages reduce the SE base subject to the 12.4%; the 2.9% Medicare has no cap. 2026 wage base $181,200 (verified in tax-data).',
    },
    taxYear: 2026,
    facts: [
      { factId: 'w2-wages', value: num(175000) },
      { factId: 'contract-income', value: num(20000) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      netProfit: 20000,
      seTax: 1304,
    },
    note: 'Earnings 18,470; SS room = 181,200 − 175,000 = 6,200 → 6,200 × 12.4% = 768.80; Medicare 18,470 × 2.9% = 535.63 → 1,304.43. A day-job salary quietly shrinks the 12.4% — an engine without the offset overcharges by $1,521.',
  },
  {
    id: 'se/home-office-refuses-by-name',
    source: {
      kind: 'adversarial',
      rationale:
        'A claimed expense outside the simple set must refuse the whole Schedule C — computing around it would silently overstate the tax, which is worse than not computing. The refusal names the expense and the exit.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(30000) },
      { factId: 'home-office-expense', value: num(2400) },
    ],
    expected: {
      status: 'refused',
      refusalsContain: 'home office',
    },
  },
  {
    id: 'se/other-expenses-refuse-too',
    source: {
      kind: 'adversarial',
      rationale:
        "The catch-all fact exists so 'I also spent money on X' has somewhere honest to land — and landing there stops the computation rather than dropping X on the floor.",
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(30000) },
      { factId: 'other-business-expenses', value: num(1800) },
    ],
    expected: {
      status: 'refused',
      refusalsContain: 'outside the simple set',
    },
  },
  {
    id: 'se/unknown-miles-price-not-silence',
    source: {
      kind: 'adversarial',
      rationale:
        'Unclaimed ≠ refused: expenses nobody has asserted compute at zero (the conservative floor) and surface as missing facts, so the fork can price what the mileage log is worth. Refusing here would block P4 on a question they may answer with "none".',
    },
    taxYear: 2026,
    facts: [{ factId: 'contract-income', value: num(2700) }],
    expected: {
      status: 'computed',
      netProfit: 2700,
      seTax: 381,
      missingFactsContain: 'business-miles',
      notesContain: 'compute at zero',
    },
  },
  {
    id: 'se/misclassification-two-signals-lean',
    source: {
      kind: 'authority',
      citation:
        'Form 8919 / SS-8 common-law factors (behavioral control): set hours, employer equipment, direction of how the work is done. 8919 computes the employee share — 6.2% + 1.45% on the FULL compensation, no 0.9235 factor.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(20000) },
      { factId: 'payer-set-hours', value: bool(true) },
      { factId: 'payer-provided-equipment', value: bool(true) },
      { factId: 'payer-controlled-how', value: bool(false) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      leansEmployee: true,
      seTax: 2826,
      employeeShare: 1530,
      delta: 1296,
      notesContain: 'SS-8',
    },
    note: 'As-is: 18,470 × 15.3% = 2,825.91. As employee: 20,000 × 7.65% = 1,530 (note: the full 20,000 — the 0.9235 factor is SE-only). Both are priced, $1,296 apart; the SS-8 reality (the IRS contacts the company) is in the note, and the engine recommends neither.',
  },
  {
    id: 'se/misclassification-one-signal-does-not',
    source: {
      kind: 'adversarial',
      rationale:
        'One control fact alone (set hours) matches plenty of genuine contracting — shift-based gig work most of all. Leaning employee on one signal would cry wolf on the entire delivery economy.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(20000) },
      { factId: 'payer-set-hours', value: bool(true) },
      { factId: 'payer-provided-equipment', value: bool(false) },
      { factId: 'payer-controlled-how', value: bool(false) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      leansEmployee: false,
    },
  },
  {
    id: 'se/same-payer-alone-leans',
    source: {
      kind: 'authority',
      citation:
        "Form 8919 reason code H: the firm issued both a W-2 and a 1099 for what was substantially the same work — 8919's own listed reason, sufficient on its own.",
    },
    taxYear: 2026,
    facts: [
      { factId: 'contract-income', value: num(8000) },
      { factId: 'same-payer-w2-and-1099', value: bool(true) },
      ...noExpenses(),
    ],
    expected: {
      status: 'computed',
      leansEmployee: true,
      notesContain: 'both a W-2 and a 1099',
    },
    note: 'The reclassified-on-paper case: same desk, same manager, suddenly a "contractor". The document pattern alone is one of the 8919\'s enumerated reasons, so it leans without any control question answered.',
  },
  {
    id: 'se/no-income-is-none',
    source: {
      kind: 'adversarial',
      rationale:
        'A year with no self-employment facts must return none — not zero-dollar noise in every W-2 year, and no phantom missing-facts asking an office worker about mileage.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-wages', value: num(42000) }],
    expected: { status: 'none' },
  },
];
