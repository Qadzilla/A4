// ─── Tips & overtime fixtures (D7) ─────────────────────────────────
// Figures verified 2026-08 against the IRS OBBBA newsroom page: tips
// capped $25,000 (every status), overtime $12,500/$25,000-joint, both
// reduced $100 per $1,000 (or fraction) of MAGI over $150,000/$300,000-
// joint, married must file jointly, TY2025–2028 only, unindexed. The
// 4137 arithmetic (7.65% employee share, wage-base guard on the 6.2%)
// is not year-gated — the form predates the deduction and outlives it.

import type { FilingStatus } from '../filing-status';
import type { TipsOvertimeStatus } from '../tips-overtime';
import type { FilingFixture } from './types';

export interface TipsOvertimeExpected {
  status: TipsOvertimeStatus;
  tipsQualified?: number;
  tipsAllowed?: number;
  overtimeAllowed?: number;
  totalDeduction?: number;
  fica4137?: number;
  missingFactsContain?: string;
  refusalsContain?: string;
  notesContain?: string;
}

export interface TipsOvertimeFixture extends FilingFixture<TipsOvertimeExpected> {
  ctx: { magi: number; filingStatus?: FilingStatus; seNetProfit?: number };
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

const listed = { factId: 'tipped-occupation-listed' as const, value: bool(true) };

export const TIPS_OVERTIME_FIXTURES: TipsOvertimeFixture[] = [
  {
    id: 'to/p1-server-the-headline-and-the-catch',
    source: { kind: 'persona', persona: 'P1' },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 18000 },
    expected: {
      status: 'computed',
      tipsQualified: 7000,
      tipsAllowed: 7000,
      totalDeduction: 7000,
      notesContain: 'headline',
    },
    note: 'The tipped variant of P1: $18k wages + $7k reported tips. All $7,000 deducts from income tax — and the note carries the catch: Social Security and Medicare still came out of every tip dollar, so the paycheck never matched the campaign slogan.',
  },
  {
    id: 'to/tips-cap-at-25000',
    source: {
      kind: 'authority',
      citation:
        'IRS OBBBA newsroom: the tips deduction is capped at $25,000 annually — one cap, every filing status, not doubled for joint filers.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(30000) }, listed],
    ctx: { magi: 48000 },
    expected: {
      status: 'computed',
      tipsQualified: 30000,
      tipsAllowed: 25000,
      notesContain: 'cap',
    },
  },
  {
    id: 'to/overtime-premium-only',
    source: {
      kind: 'authority',
      citation:
        'IRS OBBBA newsroom: qualified overtime is the pay EXCEEDING the regular rate required by FLSA §7 — the premium half of time-and-a-half, never the whole check. The fact is defined as the premium; the engine divides nothing.',
    },
    taxYear: 2026,
    facts: [{ factId: 'overtime-premium-pay', value: num(4000) }],
    ctx: { magi: 52000 },
    expected: {
      status: 'computed',
      overtimeAllowed: 4000,
      totalDeduction: 4000,
      notesContain: 'extra half',
    },
    note: '$12,000 of time-and-a-half contains $4,000 of premium — the fact carries the premium, asserted from the paystub breakdown, and only it deducts.',
  },
  {
    id: 'to/overtime-cap-single',
    source: {
      kind: 'authority',
      citation: 'IRS OBBBA newsroom: overtime deduction capped at $12,500 for single filers.',
    },
    taxYear: 2026,
    facts: [{ factId: 'overtime-premium-pay', value: num(13000) }],
    ctx: { magi: 90000 },
    expected: { status: 'computed', overtimeAllowed: 12500 },
  },
  {
    id: 'to/overtime-cap-joint',
    source: {
      kind: 'authority',
      citation: 'IRS OBBBA newsroom: overtime deduction capped at $25,000 for joint filers.',
    },
    taxYear: 2026,
    facts: [{ factId: 'overtime-premium-pay', value: num(26000) }],
    ctx: { magi: 120000, filingStatus: 'mfj' },
    expected: { status: 'computed', overtimeAllowed: 25000 },
  },
  {
    id: 'to/phaseout-fraction-counts',
    source: {
      kind: 'authority',
      citation:
        '§224: reduced $100 for each $1,000 OR FRACTION THEREOF of MAGI over $150,000 — one dollar over costs a full $100.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 150001 },
    expected: { status: 'computed', tipsAllowed: 6900, notesContain: 'phases' },
    note: 'MAGI 150,001: the excess is $1, the reduction is $100 — ceil, not floor, straight from the statute.',
  },
  {
    id: 'to/phaseout-both-deductions',
    source: {
      kind: 'authority',
      citation:
        '§§224/225 share the phaseout: each deduction is reduced by the same $100-per-$1,000 amount separately — $10,000 over means $1,000 off the tips AND $1,000 off the overtime.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'w2-tips', value: num(30000) },
      { factId: 'overtime-premium-pay', value: num(5000) },
      listed,
    ],
    ctx: { magi: 160000 },
    expected: {
      status: 'computed',
      tipsAllowed: 24000,
      overtimeAllowed: 4000,
      totalDeduction: 28000,
    },
    note: 'Tips: capped 25,000 − 1,000 = 24,000. Overtime: 5,000 − 1,000 = 4,000. The reduction hits each line in full, not the pair once.',
  },
  {
    id: 'to/phaseout-extinguishes',
    source: {
      kind: 'adversarial',
      rationale:
        'At $400,000 MAGI the reduction is $25,000 — the tips deduction must reach exactly zero, never negative, and the engine must not resurrect it via the overtime line.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(25000) }, listed],
    ctx: { magi: 400000 },
    expected: { status: 'computed', tipsAllowed: 0, totalDeduction: 0 },
  },
  {
    id: 'to/mfs-refused-by-statute',
    source: {
      kind: 'authority',
      citation:
        'IRS OBBBA newsroom: taxpayers must file jointly if married to claim either deduction — on a separate return both are $0.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 40000, filingStatus: 'mfs' },
    expected: { status: 'refused', refusalsContain: 'JOINTLY' },
    note: "Another real price on the joint-or-separate election — the fork that compares the two returns should carry this line's disappearance.",
  },
  {
    id: 'to/occupation-unlisted-tips-die-overtime-lives',
    source: {
      kind: 'authority',
      citation:
        "§224: tips qualify only in occupations on Treasury's customarily-tipped list. The list gates TIPS ONLY — the overtime deduction has no occupation test.",
    },
    taxYear: 2026,
    facts: [
      { factId: 'w2-tips', value: num(5000) },
      { factId: 'tipped-occupation-listed', value: bool(false) },
      { factId: 'overtime-premium-pay', value: num(3000) },
    ],
    ctx: { magi: 60000 },
    expected: {
      status: 'computed',
      tipsAllowed: 0,
      overtimeAllowed: 3000,
      notesContain: "Treasury's tipped-occupation list",
    },
  },
  {
    id: 'to/occupation-unknown-is-priced',
    source: {
      kind: 'adversarial',
      rationale:
        'An unresolved occupation gate must compute $0 and surface the question — silently granting the deduction assumes the answer; silently denying it hides money. The missing fact makes the fork price a yes.',
    },
    taxYear: 2026,
    facts: [{ factId: 'w2-tips', value: num(7000) }],
    ctx: { magi: 18000 },
    expected: {
      status: 'computed',
      tipsAllowed: 0,
      missingFactsContain: 'tipped-occupation-listed',
      notesContain: 'unresolved',
    },
  },
  {
    id: 'to/4137-fica-still-applies',
    source: {
      kind: 'authority',
      citation:
        'Form 4137: unreported tips owe the employee share — 6.2% Social Security (wage-base guarded) + 1.45% Medicare. Reporting them is also what makes them qualified for the §224 deduction: the two forms interact.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'w2-wages', value: num(18000) },
      { factId: 'unreported-tips', value: num(3000) },
      listed,
    ],
    ctx: { magi: 21000 },
    expected: {
      status: 'computed',
      tipsQualified: 3000,
      tipsAllowed: 3000,
      fica4137: 229.5,
      notesContain: 'never saw',
    },
    note: 'The trade, both sides computed: reporting $3,000 of cash tips costs $229.50 of FICA (3,000 × 7.65%) and unlocks a $3,000 income-tax deduction. Neither side is hidden.',
  },
  {
    id: 'to/se-tips-capped-at-profit',
    source: {
      kind: 'authority',
      citation:
        "§224 for self-employed individuals: the deduction cannot exceed the net income of the trade or business the tips came from — a losing Schedule C can't mint a tips deduction.",
    },
    taxYear: 2026,
    facts: [{ factId: 'se-tips-portion', value: num(4000) }, listed],
    ctx: { magi: 2700, seNetProfit: 2700 },
    expected: {
      status: 'computed',
      tipsQualified: 2700,
      tipsAllowed: 2700,
      notesContain: 'net profit',
    },
    note: "P4's cruel case: the tips are already INSIDE the platform totals (C2's decomposition keeps them from counting twice as income), and the deduction stops at the business's own $2,700 of profit.",
  },
  {
    id: 'to/2024-predates',
    source: {
      kind: 'authority',
      citation:
        'OBBBA: the deductions apply to taxable years 2025 through 2028. TY2024 tips are ordinary taxable income, full stop.',
    },
    taxYear: 2024,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 18000 },
    expected: { status: 'not-applicable', notesContain: 'begin in 2025' },
  },
  {
    id: 'to/2029-sunset',
    source: {
      kind: 'authority',
      citation:
        'OBBBA: both deductions sunset after TY2028 — in 2029 the income is fully taxable again unless Congress acts. The window itself is the finding.',
    },
    taxYear: 2029,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 18000 },
    expected: { status: 'not-applicable', notesContain: 'sunset' },
  },
  {
    id: 'to/2028-inside-window-awaits-figures',
    source: {
      kind: 'adversarial',
      rationale:
        "TY2028 is inside the statute's window but its year-data hasn't shipped — the engine must refuse to guess the caps rather than assume they carried, exactly like every other year-data gate.",
    },
    taxYear: 2028,
    facts: [{ factId: 'w2-tips', value: num(7000) }, listed],
    ctx: { magi: 18000 },
    expected: { status: 'not-applicable', notesContain: "aren't loaded" },
  },
];
