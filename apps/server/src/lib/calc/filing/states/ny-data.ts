// ─── F2 · New York figures, by year — PARTIAL, NOT YET WIRED ───────
//
// STATUS: this file is transcription-complete for the rate schedules and
// nothing else. No module imports it yet, and New York is still
// unsupported in SCOPE. It exists so the primary-source transcription
// below is not repeated — everything here was read off tax.ny.gov's own
// tables on 2026-08-04, not from a summary.
//
// VERIFIED (safe to build on):
//   • NYS 2025 rate schedules, all three — 2025 IT-201-I instructions,
//     the "If line 38 is / The tax is" tables.
//   • NYC 2025 resident rate schedules, all three — same instructions,
//     the "If line 47 is" tables.
//   • NYS 2025 standard deductions — tax.ny.gov/pit/file/standard_deductions.
//   • NYC school tax credit RATE REDUCTION amount — same instructions.
//   • Yonkers resident surcharge: 16.75% of net state tax, confirmed off
//     the Yonkers worksheet itself ("n. Yonkers resident tax rate (16.75%)").
//
// STILL UNVERIFIED — do not code these from memory:
//   • Yonkers NONRESIDENT earnings tax rate (Form Y-203). Believed 0.5%
//     of Yonkers-source wages; NOT confirmed against Y-203.
//   • NYC school tax credit FIXED amount. The gates are confirmed
//     (no credit if claimable as a dependent, or income over $250,000);
//     the dollar amounts are not.
//   • College tuition credit / itemized deduction (Form IT-272) — the
//     contract's NY oblivious-money item. Nothing verified.
//   • The NY "tax computation" recapture for AGI over $107,650, which
//     claws back the benefit of the lower brackets. NY is unusual in
//     having this and a module without it OVERSTATES nobody but
//     UNDERSTATES higher earners. Must be built before NY ships.
//
// ALSO STILL OWED (logic, not figures):
//   • Convenience of the employer (TSB-M-06(5)I) — the reason F2 exists.
//     Needs registry facts for the employer's office state, days worked
//     outside NY, and the narrow employer-necessity escape.
//   • Statutory residency: 183 days + a permanent place of abode makes a
//     New York resident even while domiciled elsewhere. Detect, explain,
//     refuse the dual-resident computation (F4's).
//   • The evaluation's `state` field is typed to California alone; it
//     becomes a union when a second state lands.

import type { TaxBracket } from '../../tax-data';

export interface NewYorkYearData {
  /** IT-201-I: single/MFS, MFJ/QSS, HoH. */
  brackets: { single: TaxBracket[]; mfj: TaxBracket[]; mfs: TaxBracket[]; hoh: TaxBracket[] };
  /** NYC resident tax — a second income tax for living in a borough. */
  nycBrackets: { single: TaxBracket[]; mfj: TaxBracket[]; mfs: TaxBracket[]; hoh: TaxBracket[] };
  standardDeduction: { single: number; mfj: number; mfs: number; hoh: number };
  /** A claimable dependent filing single gets this instead. */
  dependentStandardDeduction: number;
  /** Yonkers residents pay this share of their net state tax, on top. */
  yonkersResidentSurchargeRate: number;
}

const NY_DATA: Record<number, NewYorkYearData> = {
  2025: {
    brackets: {
      // Filing status ① and ③
      single: [
        { min: 0, max: 8500, rate: 0.04 },
        { min: 8500, max: 11700, rate: 0.045 },
        { min: 11700, max: 13900, rate: 0.0525 },
        { min: 13900, max: 80650, rate: 0.055 },
        { min: 80650, max: 215400, rate: 0.06 },
        { min: 215400, max: 1077550, rate: 0.0685 },
        { min: 1077550, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
      // Filing status ② and ⑤
      mfj: [
        { min: 0, max: 17150, rate: 0.04 },
        { min: 17150, max: 23600, rate: 0.045 },
        { min: 23600, max: 27900, rate: 0.0525 },
        { min: 27900, max: 161550, rate: 0.055 },
        { min: 161550, max: 323200, rate: 0.06 },
        { min: 323200, max: 2155350, rate: 0.0685 },
        { min: 2155350, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
      mfs: [
        { min: 0, max: 8500, rate: 0.04 },
        { min: 8500, max: 11700, rate: 0.045 },
        { min: 11700, max: 13900, rate: 0.0525 },
        { min: 13900, max: 80650, rate: 0.055 },
        { min: 80650, max: 215400, rate: 0.06 },
        { min: 215400, max: 1077550, rate: 0.0685 },
        { min: 1077550, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
      // Filing status ④
      hoh: [
        { min: 0, max: 12800, rate: 0.04 },
        { min: 12800, max: 17650, rate: 0.045 },
        { min: 17650, max: 20900, rate: 0.0525 },
        { min: 20900, max: 107650, rate: 0.055 },
        { min: 107650, max: 269300, rate: 0.06 },
        { min: 269300, max: 1616450, rate: 0.0685 },
        { min: 1616450, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
    },
    nycBrackets: {
      single: [
        { min: 0, max: 12000, rate: 0.03078 },
        { min: 12000, max: 25000, rate: 0.03762 },
        { min: 25000, max: 50000, rate: 0.03819 },
        { min: 50000, max: Number.POSITIVE_INFINITY, rate: 0.03876 },
      ],
      mfj: [
        { min: 0, max: 21600, rate: 0.03078 },
        { min: 21600, max: 45000, rate: 0.03762 },
        { min: 45000, max: 90000, rate: 0.03819 },
        { min: 90000, max: Number.POSITIVE_INFINITY, rate: 0.03876 },
      ],
      mfs: [
        { min: 0, max: 12000, rate: 0.03078 },
        { min: 12000, max: 25000, rate: 0.03762 },
        { min: 25000, max: 50000, rate: 0.03819 },
        { min: 50000, max: Number.POSITIVE_INFINITY, rate: 0.03876 },
      ],
      hoh: [
        { min: 0, max: 14400, rate: 0.03078 },
        { min: 14400, max: 30000, rate: 0.03762 },
        { min: 30000, max: 60000, rate: 0.03819 },
        { min: 60000, max: Number.POSITIVE_INFINITY, rate: 0.03876 },
      ],
    },
    standardDeduction: { single: 8000, mfj: 16050, mfs: 8000, hoh: 11200 },
    dependentStandardDeduction: 3100,
    yonkersResidentSurchargeRate: 0.1675,
  },
};

/** Null means the year isn't loaded — callers refuse by name. */
export function newYorkData(taxYear: number): NewYorkYearData | null {
  return NY_DATA[taxYear] ?? null;
}
