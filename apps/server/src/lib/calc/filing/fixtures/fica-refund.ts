// ─── FICA refund fixtures (E4) ─────────────────────────────────────
// The found money, pinned: it fires exactly when A2 says the year was
// FICA-exempt AND the W-2 shows boxes 4/6 withheld; it vanishes for the
// year-six resident; it refuses on known-unauthorized work (the cruel
// case — the exemption rides the word "authorized"); and each W-2 year
// carries its own three-year claim-window deadline.

import type { FicaRefundStatus } from '../fica-refund';
import type { FilingFixture, FixtureFact } from './types';

export interface FicaRefundExpected {
  status: FicaRefundStatus;
  total?: number;
  claimWindowEnds?: string | null;
  documentsContain?: string;
  letterContain?: string;
  refusalsContain?: string;
  notesContain?: string;
  missingFactsContain?: string;
}

export type FicaRefundFixture = FilingFixture<FicaRefundExpected>;

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

const exemptStudent = (entryYear: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(false) },
  { factId: 'green-card-holder', value: bool(false) },
  { factId: 'visa-type', value: str('F') },
  { factId: 'visa-first-entry-year', value: num(entryYear) },
  { factId: 'full-time-student-months', value: num(9) },
];

export const FICA_REFUND_FIXTURES: FicaRefundFixture[] = [
  {
    id: 'fica/p3-found-money',
    source: { kind: 'persona', persona: 'P3' },
    taxYear: 2026,
    facts: [
      ...exemptStudent(2024),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'w2-ss-tax-withheld', value: num(744) },
      { factId: 'w2-medicare-tax-withheld', value: num(174) },
      { factId: 'work-authorized', value: bool(true) },
    ],
    expected: {
      status: 'found',
      total: 918,
      claimWindowEnds: '2030-04-15',
      documentsContain: 'I-20',
      letterContain: '3121(b)(19)',
    },
    note: 'The finding verbatim: $918 taken in error, recoverable in full, employer first, then 843+8316 on paper. The payroll office withheld 7.65% of $12,000 exactly — the error is that mechanical. The document list includes the 8843s E2 chases: the paper trails connect.',
  },
  {
    id: 'fica/zero-box-4-nothing',
    source: {
      kind: 'adversarial',
      rationale:
        'An exempt year whose employer got payroll RIGHT (boxes 4/6 empty) must produce none — a found-money line with $0 in it teaches people to ignore the real ones.',
    },
    taxYear: 2026,
    facts: [...exemptStudent(2024), { factId: 'w2-wages', value: num(12000) }],
    expected: { status: 'none' },
  },
  {
    id: 'fica/year-six-resident-owes-it',
    source: {
      kind: 'adversarial',
      rationale:
        'The year-six F-1 is a resident and owes FICA like anyone else — the finding must vanish for that year, not linger as phantom found money on tax that is genuinely due.',
    },
    taxYear: 2026,
    facts: [
      ...exemptStudent(2021),
      { factId: 'days-present', value: num(330) },
      { factId: 'w2-wages', value: num(30000) },
      { factId: 'w2-ss-tax-withheld', value: num(1860) },
      { factId: 'w2-medicare-tax-withheld', value: num(435) },
    ],
    expected: { status: 'none' },
  },
  {
    id: 'fica/claim-window-runs-per-year',
    source: {
      kind: 'authority',
      citation:
        'Form 843 instructions / §6511: a refund claim files within 3 years of the return due date — a TY2025 W-2 has until April 15, 2029; each year carries its own clock.',
    },
    taxYear: 2025,
    facts: [
      ...exemptStudent(2024),
      { factId: 'w2-ss-tax-withheld', value: num(500) },
      { factId: 'w2-medicare-tax-withheld', value: num(117) },
      { factId: 'work-authorized', value: bool(true) },
    ],
    expected: {
      status: 'found',
      total: 617,
      claimWindowEnds: '2029-04-15',
    },
    note: 'The same person one fixture up has until 2030 for their 2026 W-2 and until 2029 for this one — the deadline is a property of the W-2 year, and a P8-style catch-up must show each clock separately.',
  },
  {
    id: 'fica/unauthorized-work-refused',
    source: {
      kind: 'adversarial',
      rationale:
        'The cruel case from the contract: the exemption rides AUTHORIZED employment. Known-unauthorized work raises immigration questions far bigger than a refund — detect the question, refuse the guess, and never dangle found money over it.',
    },
    taxYear: 2026,
    facts: [
      ...exemptStudent(2024),
      { factId: 'w2-ss-tax-withheld', value: num(744) },
      { factId: 'w2-medicare-tax-withheld', value: num(174) },
      { factId: 'work-authorized', value: bool(false) },
    ],
    expected: {
      status: 'refused',
      refusalsContain: 'lawyer',
    },
  },
  {
    id: 'fica/authorization-unknown-assumed',
    source: {
      kind: 'adversarial',
      rationale:
        'Unasserted authorization must fire WITH the assumption stated: on-campus work — the overwhelming case — is authorized by definition, so silence blocking the finding would bury real money, while silence hiding the assumption would be a guess. The note carries it; the missing fact prices it.',
    },
    taxYear: 2026,
    facts: [
      ...exemptStudent(2024),
      { factId: 'w2-ss-tax-withheld', value: num(744) },
      { factId: 'w2-medicare-tax-withheld', value: num(174) },
    ],
    expected: {
      status: 'found',
      total: 918,
      missingFactsContain: 'work-authorized',
      notesContain: 'assumes',
    },
  },
  {
    id: 'fica/citizen-owes-fica',
    source: {
      kind: 'adversarial',
      rationale:
        'A citizen with boxes 4/6 withheld owes exactly that FICA — no finding exists, and a module that fires on withholding alone (without the exemption) would promise everyone free money.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'w2-wages', value: num(30000) },
      { factId: 'w2-ss-tax-withheld', value: num(1860) },
      { factId: 'w2-medicare-tax-withheld', value: num(435) },
    ],
    expected: { status: 'none' },
  },
];
