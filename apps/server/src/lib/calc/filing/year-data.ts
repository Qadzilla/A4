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
}

const FILING_YEAR_DATA: Record<number, FilingYearData> = {
  2025: { qrGrossIncomeLimit: 5200 },
  2026: { qrGrossIncomeLimit: 5300 },
};

/** Null means the year isn't loaded — callers refuse by name, never guess. */
export function filingYearData(taxYear: number): FilingYearData | null {
  return FILING_YEAR_DATA[taxYear] ?? null;
}
