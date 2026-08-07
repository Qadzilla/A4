// ─── F2 · New York figures, by year ────────────────────────────────
// Every number below was read off tax.ny.gov's own tables on
// 2026-08-04, not from a summary:
//   brackets, NYC brackets, household credits, NYC school tax credit,
//   Yonkers resident surcharge  — 2025 IT-201-I instructions
//   standard deductions          — tax.ny.gov/pit/file/standard_deductions
//   Yonkers nonresident rate     — 2025 Form Y-203-I, line 6 ("the rate
//                                  of 0.5% (.005)") and its $3,000
//                                  no-filing floor
//   college tuition credit       — 2025 Form IT-272-I ($400 per eligible
//                                  student, refundable, undergraduate
//                                  only, full-year residents only)
//
// Deliberately NOT modelled, with reasons:
//   The AGI-over-$107,650 tax computation. New York claws back the
//   benefit of its lower brackets through roughly ten banded worksheets
//   (IT-201-I "Tax computation worksheets 1–10"), each phasing a
//   flat-rate figure in over a $50,000 span. Above that threshold the
//   module REFUSES by name rather than computing the plain schedule,
//   which would understate the bill. Nobody in this product's audience
//   is near it; a silent understatement for the ones who are would be
//   the worst kind of wrong.
//
//   Household credits are carried for SINGLE filers only (tables 1 and
//   4). The joint/HoH tables vary by dependent count, which this
//   audience does not have; a joint filer simply gets no household
//   credit computed rather than a guessed one.

import type { TaxBracket } from '../../tax-data';

export interface NewYorkYearData {
  /** IT-201-I: single/MFS, MFJ/QSS, HoH. */
  brackets: { single: TaxBracket[]; mfj: TaxBracket[]; mfs: TaxBracket[]; hoh: TaxBracket[] };
  /** NYC resident tax — a second income tax for living in a borough. */
  nycBrackets: { single: TaxBracket[]; mfj: TaxBracket[]; mfs: TaxBracket[]; hoh: TaxBracket[] };
  standardDeduction: { single: number; mfj: number; mfs: number; hoh: number };
  /** A claimable dependent filing single gets this instead. */
  dependentStandardDeduction: number;
  /** Over this NY AGI the banded recapture worksheets apply — we refuse. */
  recaptureThreshold: number;
  /** Yonkers residents pay this share of their net state tax, on top. */
  yonkersResidentSurchargeRate: number;
  yonkersNonresident: { rate: number; noFilingFloor: number };
  nycSchoolTaxCredit: { single: number; joint: number; incomeLimit: number };
  /** IT-272: per eligible student, refundable. The exact figure is the
   *  form's worksheet, so only eligibility and the cap live here. */
  collegeTuitionCredit: { maxPerStudent: number; expenseCap: number };
  /** IT-201-I household credit table 1 — single filers, by federal AGI. */
  householdCreditSingle: Array<{ upTo: number; credit: number }>;
  /** IT-201-I NYC household credit table 4 — single filers. */
  nycHouseholdCreditSingle: Array<{ upTo: number; credit: number }>;
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
    recaptureThreshold: 107650,
    yonkersResidentSurchargeRate: 0.1675,
    yonkersNonresident: { rate: 0.005, noFilingFloor: 3000 },
    nycSchoolTaxCredit: { single: 63, joint: 125, incomeLimit: 250000 },
    collegeTuitionCredit: { maxPerStudent: 400, expenseCap: 10000 },
    householdCreditSingle: [
      { upTo: 5000, credit: 75 },
      { upTo: 6000, credit: 60 },
      { upTo: 7000, credit: 50 },
      { upTo: 20000, credit: 45 },
      { upTo: 25000, credit: 40 },
      { upTo: 28000, credit: 20 },
    ],
    nycHouseholdCreditSingle: [
      { upTo: 10000, credit: 15 },
      { upTo: 12500, credit: 10 },
    ],
  },
};

/** Null means the year isn't loaded — callers refuse by name. */
export function newYorkData(taxYear: number): NewYorkYearData | null {
  return NY_DATA[taxYear] ?? null;
}
