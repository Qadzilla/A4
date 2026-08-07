// ─── F1 · California figures, by year ──────────────────────────────
// Every number here was transcribed from an FTB primary source on
// 2026-08-04, not from a summary:
//   brackets            2025 California Tax Rate Schedules (Schedules X/Y/Z)
//   standard deduction  2025 Form 540 instructions, Standard Deduction Chart
//   exemption credit    2025 Form 540 itself, line 7 ("X $153")
//   exemption AGI caps  2025 Form 540 instructions, line 32
//   renter's credit     ftb.ca.gov nonrefundable renter's credit page
//   CalEITC             ftb.ca.gov CalEITC eligibility page + 2025 FTB 3514
//                       booklet (the $4,814 investment ceiling is Step 2)
//
// ONLY 2025 is loaded. FTB had not published the 2026 indexed figures as
// of 2026-08-04 — the forms site carries rate schedules through 2025 and
// no further — so the module refuses 2026 by name rather than indexing
// them itself. That refusal is the point: a state module that guesses an
// inflation adjustment is worse than one that says "not published yet."
//
// Deliberately NOT modelled, with reasons:
//   excess SDI  — abolished. SB 951 removed the SDI taxable wage limit for
//                 2024 onward, so no employee can over-withhold across
//                 employers, and FTB retired the Form 540 line ("reserved
//                 for future use"). The contract asked for it; the law
//                 removed it first.
//   AMT, Behavioral Health Services Tax (1% over $1,000,000) — real, and
//                 nowhere near this product's audience. Named, not coded.

import type { TaxBracket } from '../../tax-data';

export interface CaliforniaYearData {
  /** Schedules X (single/MFS), Y (MFJ/QSS), Z (HoH). */
  brackets: { single: TaxBracket[]; mfj: TaxBracket[]; mfs: TaxBracket[]; hoh: TaxBracket[] };
  standardDeduction: { single: number; mfj: number; mfs: number; hoh: number };
  /** Floor for a claimable dependent's CA standard deduction. */
  dependentStdFloor: number;
  /** Per exemption, straight off the return's face. */
  exemptionCredit: number;
  /** Above this federal AGI the exemption credit phases; v1 names it. */
  exemptionCreditAgiLimit: { single: number; mfj: number; mfs: number; hoh: number };
  renterCredit: {
    single: number;
    joint: number;
    agiLimitSingle: number;
    agiLimitJoint: number;
    /** Months of California rent the credit requires. */
    monthsRequired: number;
  };
  calEitc: {
    minAge: number;
    maxEarnedIncome: number;
    /** Over this, the credit is gone outright — the cruel case. */
    investmentIncomeLimit: number;
    /** Maximum by qualifying-child count; the exact figure is a lookup. */
    maxCredit: { none: number; one: number; two: number; threeOrMore: number };
    /** Foster Youth Tax Credit, per qualifying taxpayer. */
    fytcPerTaxpayer: number;
  };
}

const CA_DATA: Record<number, CaliforniaYearData> = {
  2025: {
    brackets: {
      // Schedule X
      single: [
        { min: 0, max: 11079, rate: 0.01 },
        { min: 11079, max: 26264, rate: 0.02 },
        { min: 26264, max: 41452, rate: 0.04 },
        { min: 41452, max: 57542, rate: 0.06 },
        { min: 57542, max: 72724, rate: 0.08 },
        { min: 72724, max: 371479, rate: 0.093 },
        { min: 371479, max: 445771, rate: 0.103 },
        { min: 445771, max: 742953, rate: 0.113 },
        { min: 742953, max: Number.POSITIVE_INFINITY, rate: 0.123 },
      ],
      // Schedule Y
      mfj: [
        { min: 0, max: 22158, rate: 0.01 },
        { min: 22158, max: 52528, rate: 0.02 },
        { min: 52528, max: 82904, rate: 0.04 },
        { min: 82904, max: 115084, rate: 0.06 },
        { min: 115084, max: 145448, rate: 0.08 },
        { min: 145448, max: 742958, rate: 0.093 },
        { min: 742958, max: 891542, rate: 0.103 },
        { min: 891542, max: 1485906, rate: 0.113 },
        { min: 1485906, max: Number.POSITIVE_INFINITY, rate: 0.123 },
      ],
      // Schedule X again — MFS shares it.
      mfs: [
        { min: 0, max: 11079, rate: 0.01 },
        { min: 11079, max: 26264, rate: 0.02 },
        { min: 26264, max: 41452, rate: 0.04 },
        { min: 41452, max: 57542, rate: 0.06 },
        { min: 57542, max: 72724, rate: 0.08 },
        { min: 72724, max: 371479, rate: 0.093 },
        { min: 371479, max: 445771, rate: 0.103 },
        { min: 445771, max: 742953, rate: 0.113 },
        { min: 742953, max: Number.POSITIVE_INFINITY, rate: 0.123 },
      ],
      // Schedule Z
      hoh: [
        { min: 0, max: 22173, rate: 0.01 },
        { min: 22173, max: 52530, rate: 0.02 },
        { min: 52530, max: 67716, rate: 0.04 },
        { min: 67716, max: 83805, rate: 0.06 },
        { min: 83805, max: 98990, rate: 0.08 },
        { min: 98990, max: 505208, rate: 0.093 },
        { min: 505208, max: 606251, rate: 0.103 },
        { min: 606251, max: 1010417, rate: 0.113 },
        { min: 1010417, max: Number.POSITIVE_INFINITY, rate: 0.123 },
      ],
    },
    standardDeduction: { single: 5706, mfj: 11412, mfs: 5706, hoh: 11412 },
    dependentStdFloor: 1350,
    exemptionCredit: 153,
    exemptionCreditAgiLimit: { single: 252203, mfj: 504411, mfs: 252203, hoh: 378310 },
    renterCredit: {
      single: 60,
      joint: 120,
      agiLimitSingle: 53994,
      agiLimitJoint: 107987,
      monthsRequired: 6,
    },
    calEitc: {
      minAge: 18,
      maxEarnedIncome: 32900,
      investmentIncomeLimit: 4814,
      maxCredit: { none: 302, one: 2016, two: 3339, threeOrMore: 3756 },
      fytcPerTaxpayer: 1189,
    },
  },
};

/** Null means the year isn't published — callers refuse by name. */
export function californiaData(taxYear: number): CaliforniaYearData | null {
  return CA_DATA[taxYear] ?? null;
}
