// ─── Year data for the filing engine ───────────────────────────────
// Doctrine 6's enforcement arm: a determination is rule(taxYear)(facts),
// and a year whose data isn't loaded refuses by name instead of running on
// another year's numbers. Prior-year support (H4) stands on this table
// keeping its history.
//
// Every figure here carries its source; nothing is written from memory.

export interface FilingYearData {
  /**
   * Qualifying-relative gross income test: income must be LESS THAN this —
   * equal fails. Source: IRS Pub 501 (2025 edition: $5,200); 2026 figure
   * $5,300 per the inflation adjustment. Verified 2026-08.
   */
  qrGrossIncomeLimit: number;
  /**
   * A dependent's standard deduction: the greater of the floor or earned
   * income plus the add-on, capped at the regular standard deduction.
   * Source: Topic 551 / Pub 501 figures — 2026 floor $1,350 + $450, floor
   * unchanged from 2025. Verified 2026-08.
   */
  dependentStdFloor: number;
  dependentStdAddon: number;
  /**
   * Form 8615 (kiddie tax) unearned-income threshold — above this, a
   * covered child's unearned income is taxed at the parents' rate.
   * Source: Form 8615 instructions; 2026 $2,700 verified 2026-08. The 2025
   * figure is deliberately absent until verified — a missing field refuses
   * by name rather than guessing.
   */
  kiddieUnearnedThreshold?: number;
}

const FILING_YEAR_DATA: Record<number, FilingYearData> = {
  2025: { qrGrossIncomeLimit: 5200, dependentStdFloor: 1350, dependentStdAddon: 450 },
  2026: {
    qrGrossIncomeLimit: 5300,
    dependentStdFloor: 1350,
    dependentStdAddon: 450,
    kiddieUnearnedThreshold: 2700,
  },
};

/** Null means the year isn't loaded — callers refuse by name, never guess. */
export function filingYearData(taxYear: number): FilingYearData | null {
  return FILING_YEAR_DATA[taxYear] ?? null;
}
