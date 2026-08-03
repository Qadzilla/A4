// ─── Penalty fixtures (D6) ─────────────────────────────────────────
// The 5329 exception matrix, from the form's own instructions (codes
// verified 2026-08): education (08), first home (09) and unemployed
// health premiums (07) are IRA-only; the age-55 separation rule (01) is
// employer-plans-only; medical above 7.5% of AGI (05) and disability (03)
// work in both pockets. The adversarial cases carry the asymmetry and the
// never-auto-claimed rule.

import type { ExceptionStatus } from '../penalty';
import type { FilingFixture, FixtureFact } from './types';

export interface PenaltyExpected {
  penalty: number;
  /** exception id → the status the matrix demands. */
  statuses?: Record<string, ExceptionStatus>;
  /** exception id → priced savings. */
  savings?: Record<string, number>;
  refusalCount?: number;
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

const base: FixtureFact[] = [
  { factId: 'us-citizen', value: bool(true) },
  { factId: 'married', value: bool(false) },
  { factId: 'retirement-early-distribution', value: num(9000) },
];

export const PENALTY_FIXTURES: FilingFixture<PenaltyExpected>[] = [
  {
    id: 'penalty/education-kills-it-for-an-ira',
    source: {
      kind: 'authority',
      citation:
        'Form 5329 instructions, exception 08: IRA distributions made for higher-education expenses — IRAs only.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'early-distribution-from-ira', value: bool(true) },
      { factId: 'qualified-tuition-paid', value: num(2000) },
    ],
    expected: {
      penalty: 900,
      statuses: { 'higher-education': 'available' },
      savings: { 'higher-education': 200 },
    },
    note: 'The penalty stays 900 — an available exception is a priced option, never auto-claimed.',
  },
  {
    id: 'penalty/education-does-nothing-for-a-401k',
    source: {
      kind: 'adversarial',
      rationale:
        'The pocket asymmetry as a finding: identical education expenses against an employer-plan cashout. Exception 08 never reaches a 401(k) — same money, different pocket, $200 of savings gone.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'early-distribution-from-ira', value: bool(false) },
      { factId: 'qualified-tuition-paid', value: num(2000) },
    ],
    expected: {
      penalty: 900,
      statuses: { 'higher-education': 'wrong-pocket', 'age-55-separation': 'missing-facts' },
    },
  },
  {
    id: 'penalty/unknown-pocket-is-the-fork',
    source: {
      kind: 'adversarial',
      rationale:
        'Nobody asked which pocket. Every pocket-restricted exception must read missing-facts naming early-distribution-from-ira — the asymmetry is what makes finding out worth real money.',
    },
    taxYear: 2026,
    facts: [...base, { factId: 'qualified-tuition-paid', value: num(2000) }],
    expected: {
      penalty: 900,
      statuses: {
        'higher-education': 'missing-facts',
        'first-home': 'missing-facts',
        'age-55-separation': 'missing-facts',
      },
    },
  },
  {
    id: 'penalty/first-home-caps-at-ten-thousand',
    source: {
      kind: 'authority',
      citation:
        'Form 5329 instructions, exception 09: IRA distributions to buy a first home, up to $10,000.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
      { factId: 'retirement-early-distribution', value: num(15000) },
      { factId: 'early-distribution-from-ira', value: bool(true) },
      { factId: 'bought-first-home', value: bool(true) },
    ],
    expected: {
      penalty: 1500,
      statuses: { 'first-home': 'available' },
      savings: { 'first-home': 1000 },
    },
    note: 'Fifteen thousand out, but the exception shelters only the first ten — savings cap at $1,000.',
  },
  {
    id: 'penalty/medical-floor-runs-on-agi',
    source: {
      kind: 'authority',
      citation:
        'Form 5329 instructions, exception 05: unreimbursed medical expenses above 7.5% of AGI — both pockets.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'early-distribution-from-ira', value: bool(false) },
      { factId: 'medical-expenses-paid', value: num(5000) },
      { factId: 'w2-wages', value: num(40000) },
    ],
    expected: {
      penalty: 900,
      statuses: { medical: 'available' },
      savings: { medical: 200 },
    },
    note: 'AGI 40,000 → floor 3,000 → 2,000 of excess shelters $200. Works against an employer plan — the medical exception has no pocket.',
  },
  {
    id: 'penalty/age-55-never-helps-an-ira',
    source: {
      kind: 'authority',
      citation:
        'Form 5329 instructions, exception 01: separation from service in or after the year of reaching 55 — qualified plans only, never IRAs.',
    },
    taxYear: 2026,
    facts: [
      ...base,
      { factId: 'early-distribution-from-ira', value: bool(true) },
      { factId: 'separated-from-service-at-55', value: bool(true) },
    ],
    expected: {
      penalty: 900,
      statuses: { 'age-55-separation': 'wrong-pocket', 'higher-education': 'missing-facts' },
    },
    note: 'The asymmetry’s mirror: the one exception that only ever works for employer plans.',
  },
  {
    id: 'penalty/roth-refuses-instead-of-over-penalising',
    source: {
      kind: 'adversarial',
      rationale:
        'A Roth code-J distribution beside the early money. Roth ordering (contributions first, free) is a named C5 gap — the penalty base must exclude the Roth dollars and the refusal must say why, per-bucket and never pooled.',
    },
    taxYear: 2026,
    facts: [...base, { factId: 'retirement-roth-distribution', value: num(3000) }],
    expected: { penalty: 900, refusalCount: 1 },
  },
];
