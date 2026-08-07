// ─── F3 · Massachusetts figures, by year ───────────────────────────
// Verified against mass.gov on 2026-08-04:
//   rates                 — mass.gov tax rates (also B1's source, 2026-08)
//   personal exemptions   — mass.gov "Personal Income Tax Exemptions"
//   NTS / LIC thresholds  — mass.gov "No Tax Status and Limited Income
//                           Credit"; married-filing-separately qualifies
//                           for neither, which the page states outright
//   LIC mechanics         — the Line 29 worksheet: tax is capped at 10%
//                           of the excess of MA AGI over the NTS limit
//   rental deduction      — 50% of rent paid, capped at $4,000
//   undergrad loan interest — deductible in full on Schedule Y, no
//                           phaseout, and it stacks with the federal
//                           deduction (different payments)
//
// NOT modelled, with reasons:
//   • The 4% surtax on very high income. It is indexed annually and the
//     2025 threshold could not be verified from mass.gov (the Form 1
//     instructions are PDF-only and the site blocks automated fetching),
//     so the module refuses above $1,000,000 rather than coding a
//     threshold from memory. It cannot bind this audience either way.
//   • MA's capital-loss netting ordering. The current authority is the
//     Schedule B and Schedule D instructions, which mass.gov would not
//     serve; the only ordering text obtainable was TIR 02-21, a 2002
//     transition release full of repealed rate classes. So losses are
//     REFUSED rather than netted by a guessed ordering — see
//     massachusetts.ts. B1's positive-only estimate therefore stays
//     alive; the contract said F3 would retire it, and F3 has not.

export interface MassachusettsYearData {
  /** Part B: wages and most ordinary income. */
  partBRate: number;
  /** Part A: interest and dividends. */
  interestDividendRate: number;
  /** Part A: short-term gains — the rate that beats most federal brackets. */
  shortTermRate: number;
  /** Part C: long-term gains. */
  longTermRate: number;
  personalExemption: { single: number; mfj: number; mfs: number; hoh: number };
  /** MA AGI at or under this owes nothing at all. MFS never qualifies. */
  noTaxStatus: { single: number; mfj: number; hoh: number; perDependent: number };
  /** Above NTS but under this, the tax is capped. MFS never qualifies. */
  limitedIncomeCredit: { single: number; mfj: number; hoh: number; perDependent: number };
  /** The LIC cap: this share of the excess over the NTS limit. */
  limitedIncomeCreditRate: number;
  rentalDeduction: { sharePct: number; cap: number };
  /** Above this the 4% surtax may apply and the module refuses. */
  surtaxRefusalFloor: number;
}

const MA_DATA: Record<number, MassachusettsYearData> = {
  2025: {
    partBRate: 0.05,
    interestDividendRate: 0.05,
    shortTermRate: 0.085,
    longTermRate: 0.05,
    personalExemption: { single: 4400, mfj: 8800, mfs: 4400, hoh: 6800 },
    noTaxStatus: { single: 8000, mfj: 16400, hoh: 14400, perDependent: 1000 },
    limitedIncomeCredit: { single: 14000, mfj: 28700, hoh: 25200, perDependent: 1750 },
    limitedIncomeCreditRate: 0.1,
    rentalDeduction: { sharePct: 0.5, cap: 4000 },
    surtaxRefusalFloor: 1000000,
  },
  2026: {
    // Rates are year-parameterised and unchanged for 2026 (B1 verified the
    // pair). The dollar figures below are 2025's and are NOT verified for
    // 2026 — massachusetts.ts refuses the year rather than using them.
    partBRate: 0.05,
    interestDividendRate: 0.05,
    shortTermRate: 0.085,
    longTermRate: 0.05,
    personalExemption: { single: 4400, mfj: 8800, mfs: 4400, hoh: 6800 },
    noTaxStatus: { single: 8000, mfj: 16400, hoh: 14400, perDependent: 1000 },
    limitedIncomeCredit: { single: 14000, mfj: 28700, hoh: 25200, perDependent: 1750 },
    limitedIncomeCreditRate: 0.1,
    rentalDeduction: { sharePct: 0.5, cap: 4000 },
    surtaxRefusalFloor: 1000000,
  },
};

/** Years whose dollar figures were verified against mass.gov. */
const VERIFIED_YEARS = new Set([2025]);

export function massachusettsData(taxYear: number): MassachusettsYearData | null {
  if (!VERIFIED_YEARS.has(taxYear)) return null;
  return MA_DATA[taxYear] ?? null;
}
