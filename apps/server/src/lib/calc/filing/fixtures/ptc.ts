// ─── Premium tax credit fixtures (D3) ──────────────────────────────
// Every 2026 percentage below is transcribed from Rev. Proc. 2025-25
// §3.01 itself; the 2025 ARPA/IRA curve, the Table 5 caps and both FPLs
// were verified 2026-08. The paired fixtures are the point: the same
// person, the same months, run under the two years' law — because the
// difference between +$726 and −$626 is an act of Congress, not a fact
// about the person.
//
// Arithmetic is hand-computed in the notes so a reviewer can check the
// engine against the worksheet, not against itself.

import type { PtcStatus } from '../ptc';
import type { FilingFixture, FixtureFact } from './types';

export interface PtcExpected {
  status: PtcStatus;
  fplPercent?: number;
  ptcTotal?: number;
  aptcTotal?: number;
  additionalCredit?: number;
  repayment?: number;
  repaymentBeforeCap?: number;
  capApplied?: number | null;
  refusalsContain?: string;
  notesContain?: string;
}

export interface PtcFixture extends FilingFixture<PtcExpected> {
  months: Array<{
    month: number;
    premium: number | null;
    slcsp: number | null;
    aptc: number | null;
  }>;
  filingStatus?: 'single' | 'mfs' | 'mfj' | 'hoh';
}

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;

const magiFacts = (magi: number): FixtureFact[] => [
  { factId: 'gross-income', value: num(magi) },
  { factId: 'marketplace-health-insurance', value: bool(true) },
];

const twelve = (premium: number, slcsp: number | null, aptc: number) =>
  Array.from({ length: 12 }, (_, i) => ({ month: i + 1, premium, slcsp, aptc }));

export const PTC_FIXTURES: PtcFixture[] = [
  {
    id: 'ptc/2026-at-200pct-repays',
    source: {
      kind: 'authority',
      citation:
        'Rev. Proc. 2025-25 §3.01: at 200% FPL the 2026 applicable percentage is 6.60%. FPL (2025 guidelines) $15,650.',
    },
    taxYear: 2026,
    facts: magiFacts(31300),
    months: twelve(450, 420, 300),
    expected: {
      status: 'reconciled',
      fplPercent: 200,
      ptcTotal: 2974,
      aptcTotal: 3600,
      repayment: 626,
      repaymentBeforeCap: 626,
      capApplied: null,
    },
    note: '31,300 = exactly 2× FPL. Contribution 31,300 × 6.60% = 2,065.80 → 172.15/mo; PTC/mo = min(450, 420 − 172.15) = 247.85 → 2,974/yr against 3,600 advanced → 626 back, uncapped (the caps are gone in 2026).',
  },
  {
    id: 'ptc/2025-same-facts-gets-credit',
    source: {
      kind: 'authority',
      citation:
        'ARPA §9661 as extended by the IRA through 2025: 200–250% band runs 2%→4%. FPL (2024 guidelines) $15,060.',
    },
    taxYear: 2025,
    facts: magiFacts(31300),
    months: twelve(450, 420, 300),
    expected: {
      status: 'reconciled',
      fplPercent: 207,
      ptcTotal: 4326,
      aptcTotal: 3600,
      additionalCredit: 726,
      repayment: 0,
    },
    note: 'The same person, the same twelve months: 31,300/15,060 → 207% (floored). Applicable = 2 + 2×(207−200)/50 = 2.28% → 59.47/mo contribution → PTC 360.53/mo → 4,326/yr → $726 MORE credit. In 2026 identical facts owe $626 — the difference is an act of Congress.',
  },
  {
    id: 'ptc/2025-cap-is-the-mercy',
    source: {
      kind: 'authority',
      citation:
        '2025 Form 8962 Table 5 (verified): 300–<400% FPL caps repayment at $1,625 single / $3,250 other.',
    },
    taxYear: 2025,
    facts: magiFacts(45180),
    months: twelve(380, 300, 280),
    expected: {
      status: 'reconciled',
      fplPercent: 300,
      ptcTotal: 889,
      aptcTotal: 3360,
      repaymentBeforeCap: 2471,
      repayment: 1625,
      capApplied: 1625,
      notesContain: 'capped',
    },
    note: '45,180 = exactly 3× FPL → 6% → 225.90/mo; PTC 74.10/mo = 889/yr vs 3,360 advanced → owes 2,471, capped to 1,625 — $846 forgiven by Table 5.',
  },
  {
    id: 'ptc/2026-same-shape-uncapped',
    source: {
      kind: 'authority',
      citation:
        'IRS FS-2025-10: the repayment limitation is removed for taxable years beginning in 2026 — full repayment at any income.',
    },
    taxYear: 2026,
    facts: magiFacts(45180),
    months: twelve(380, 300, 280),
    expected: {
      status: 'reconciled',
      fplPercent: 288,
      ptcTotal: 0,
      aptcTotal: 3360,
      repayment: 3360,
      capApplied: null,
      notesContain: 'no longer exists',
    },
    note: '45,180/15,650 → 288%. Applicable = 8.44 + 1.52×(288−250)/50 = 9.5952% → 361.26/mo, above the 300 SLCSP → PTC 0 → the whole 3,360 comes back. The 2025 mercy (1,625 cap) is gone: same shape, +1,735 of law.',
  },
  {
    id: 'ptc/2025-above-400-no-cliff',
    source: {
      kind: 'authority',
      citation:
        'ARPA/IRA through 2025: above 400% FPL the applicable percentage holds at 8.5% — there is no cliff.',
    },
    taxYear: 2025,
    facts: magiFacts(65000),
    months: twelve(750, 700, 200),
    expected: {
      status: 'reconciled',
      fplPercent: 431,
      ptcTotal: 2875,
      aptcTotal: 2400,
      additionalCredit: 475,
    },
    note: '431% FPL and still subsidised: 8.5% → 460.42/mo; PTC min(750, 700−460.42) = 239.58/mo → 2,875/yr → $475 more than advanced.',
  },
  {
    id: 'ptc/2026-above-400-cliff',
    source: {
      kind: 'authority',
      citation:
        'For 2026 the 400%-of-FPL cliff returns: no premium credit at all above it (§36B as indexed by Rev. Proc. 2025-25).',
    },
    taxYear: 2026,
    facts: magiFacts(65000),
    months: twelve(750, 700, 200),
    expected: {
      status: 'reconciled',
      fplPercent: 415,
      ptcTotal: 0,
      aptcTotal: 2400,
      repayment: 2400,
      capApplied: null,
      notesContain: 'cliff',
    },
    note: 'The same 431%→415% person: one year they get $475 more; the next, every advanced dollar comes back. The cliff pair is why the curve lives in year-data.',
  },
  {
    id: 'ptc/below-100-with-aptc-refused',
    source: {
      kind: 'authority',
      citation:
        '8962 instructions: household income under 100% FPL is below the eligibility floor, but a good-faith marketplace estimate can preserve eligibility — a judgment, not arithmetic.',
    },
    taxYear: 2026,
    facts: magiFacts(12000),
    months: twelve(450, 420, 300),
    expected: {
      status: 'refused',
      fplPercent: 76,
      refusalsContain: 'good-faith',
    },
    note: 'The contract cruel case: the floor is an eligibility rule with an escape hatch, not a naive formula — Basis names it and refuses to guess.',
  },
  {
    id: 'ptc/below-100-nothing-advanced',
    source: {
      kind: 'adversarial',
      rationale:
        'Below the floor with no APTC: nothing to reconcile, and the engine must say so calmly rather than inventing a credit or a refusal.',
    },
    taxYear: 2026,
    facts: magiFacts(12000),
    months: twelve(450, 420, 0),
    expected: { status: 'reconciled', fplPercent: 76, additionalCredit: 0, repayment: 0 },
  },
  {
    id: 'ptc/mfs-refused',
    source: {
      kind: 'authority',
      citation:
        '8962 instructions: married filing separately generally cannot take the PTC; the domestic-abuse/abandonment exception is checked on the form.',
    },
    taxYear: 2026,
    facts: magiFacts(31300),
    filingStatus: 'mfs',
    months: twelve(450, 420, 300),
    expected: { status: 'refused', refusalsContain: 'separately' },
  },
  {
    id: 'ptc/blank-slcsp-is-a-handoff',
    source: {
      kind: 'authority',
      citation:
        "8962 instructions: a blank column B is filled from the marketplace's SLCSP lookup tool — the form cannot compute without it.",
    },
    taxYear: 2026,
    facts: magiFacts(31300),
    months: [
      ...Array.from({ length: 11 }, (_, i) => ({
        month: i + 1,
        premium: 450,
        slcsp: 420,
        aptc: 300,
      })),
      { month: 12, premium: 450, slcsp: null, aptc: 300 },
    ],
    expected: { status: 'missing-facts', notesContain: 'lookup' },
    note: 'The fence: Basis reports the blank and names the tool; it never guesses a silver-plan premium.',
  },
  {
    id: 'ptc/partial-year-month-wise',
    source: {
      kind: 'adversarial',
      rationale:
        'Six covered months must reconcile month-wise, not as annual sums scaled — the contract requires the monthly table, and this is the fixture that catches a sum-based shortcut.',
    },
    taxYear: 2026,
    facts: magiFacts(31300),
    months: Array.from({ length: 6 }, (_, i) => ({
      month: i + 1,
      premium: 450,
      slcsp: 420,
      aptc: 300,
    })),
    expected: {
      status: 'reconciled',
      ptcTotal: 1487,
      aptcTotal: 1800,
      repayment: 313,
    },
    note: '6 × 247.85 = 1,487 against 1,800 advanced — half a year of coverage, half a year of arithmetic.',
  },
  {
    id: 'ptc/own-dependent-refused',
    source: {
      kind: 'adversarial',
      rationale:
        'A dependent changes household size and household income, and v1 models the one-person household — named and refused, never fudged with the wrong FPL row.',
    },
    taxYear: 2026,
    facts: [...magiFacts(31300), { factId: 'own-dependent-lived-with-months', value: num(12) }],
    months: twelve(450, 420, 300),
    expected: { status: 'refused', refusalsContain: 'household' },
  },
];
