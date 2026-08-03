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
  /**
   * Education credits (Form 8863): both the AOTC and LLC phase out over the
   * same MAGI band — statutory, not indexed. Verified 2026-08 for both
   * years: $80,000–$90,000 single / $160,000–$180,000 joint. MFS gets
   * neither credit at all.
   */
  educationCreditPhaseout: {
    startSingle: number;
    endSingle: number;
    startMfj: number;
    endMfj: number;
  };
  /**
   * Student-loan interest (IRC §221): $2,500 cap, denied to MFS and to
   * anyone claimable as a dependent. Phaseouts verified 2026-08 —
   * 2025: $85k–$100k single, $170k–$200k joint;
   * 2026: $85k–$100k single, $175k–$205k joint.
   */
  studentLoanInterest: {
    max: number;
    startSingle: number;
    endSingle: number;
    startMfj: number;
    endMfj: number;
  };
  /**
   * Saver's credit (Form 8880) AGI tiers — 50%/20%/10% of up to $2,000
   * contributed, by filing bucket. 2025 verified 2026-08; 2026 from
   * Notice 2025-67 (verified 2026-08). The credit's last year is TY2026:
   * SECURE 2.0 replaces it with the Saver's Match, and the module refuses
   * 2027+ by name rather than modelling the successor.
   */
  saversCredit: {
    other: { maxRate50: number; maxRate20: number; maxRate10: number };
    hoh: { maxRate50: number; maxRate20: number; maxRate10: number };
    mfj: { maxRate50: number; maxRate20: number; maxRate10: number };
  };
  /**
   * Premium tax credit (Form 8962). Structurally different across the
   * boundary, which is why every piece lives here:
   *  - TY2025: the ARPA/IRA curve (0% under 150% FPL, 8.5% from 400% up,
   *    NO cliff) and the Table 5 repayment caps (8962 instructions,
   *    verified 2026-08). FPL = 2024 HHS guidelines: $15,060 + $5,380.
   *  - TY2026: the §36B curve from Rev. Proc. 2025-25 §3.01 (transcribed
   *    from the primary source), the 400% cliff returns, and the
   *    repayment caps are REMOVED by statute (IRS FS-2025-10) — the
   *    mercy itself was year-gated. FPL = 2025 guidelines: $15,650 +
   *    $5,500.
   */
  ptc: {
    fplBase: number;
    fplPerAdditional: number;
    /** Bands in % of FPL; linear interpolation between initial and final. */
    curve: Array<{ min: number; max: number; initial: number; final: number }>;
    /** True: no credit at all above 400% FPL. */
    cliffAt400: boolean;
    /** Null: caps removed — full repayment at any income. */
    repaymentCaps: Array<{ belowFplPct: number; single: number; other: number }> | null;
  };
  /**
   * 1099-NEC issuance threshold. $600 through TY2025; OBBBA raises it to
   * $2,000 for TY2026 (indexed after). Verified 2026-08. Below it, contract
   * income arrives with no form — and is taxable anyway.
   */
  necThreshold: number;
  /**
   * 1099-K: OBBBA reverted to $20,000 AND >200 transactions, retroactive to
   * 2022 (IRS FAQ, verified 2026-08). The transaction prong is rarely
   * knowable from a dollar fact alone, so expectations built on this are
   * never marked mandatory.
   */
  kThreshold: number;
}

const FILING_YEAR_DATA: Record<number, FilingYearData> = {
  2025: {
    qrGrossIncomeLimit: 5200,
    dependentStdFloor: 1350,
    dependentStdAddon: 450,
    necThreshold: 600,
    kThreshold: 20000,
    educationCreditPhaseout: {
      startSingle: 80000,
      endSingle: 90000,
      startMfj: 160000,
      endMfj: 180000,
    },
    studentLoanInterest: {
      max: 2500,
      startSingle: 85000,
      endSingle: 100000,
      startMfj: 170000,
      endMfj: 200000,
    },
    saversCredit: {
      other: { maxRate50: 23750, maxRate20: 25500, maxRate10: 39500 },
      hoh: { maxRate50: 35625, maxRate20: 38250, maxRate10: 59250 },
      mfj: { maxRate50: 47500, maxRate20: 51000, maxRate10: 79000 },
    },
    ptc: {
      fplBase: 15060,
      fplPerAdditional: 5380,
      curve: [
        { min: 0, max: 150, initial: 0, final: 0 },
        { min: 150, max: 200, initial: 0, final: 2 },
        { min: 200, max: 250, initial: 2, final: 4 },
        { min: 250, max: 300, initial: 4, final: 6 },
        { min: 300, max: 400, initial: 6, final: 8.5 },
        { min: 400, max: Number.POSITIVE_INFINITY, initial: 8.5, final: 8.5 },
      ],
      cliffAt400: false,
      repaymentCaps: [
        { belowFplPct: 200, single: 375, other: 750 },
        { belowFplPct: 300, single: 975, other: 1950 },
        { belowFplPct: 400, single: 1625, other: 3250 },
      ],
    },
  },
  2026: {
    qrGrossIncomeLimit: 5300,
    dependentStdFloor: 1350,
    dependentStdAddon: 450,
    kiddieUnearnedThreshold: 2700,
    necThreshold: 2000,
    kThreshold: 20000,
    educationCreditPhaseout: {
      startSingle: 80000,
      endSingle: 90000,
      startMfj: 160000,
      endMfj: 180000,
    },
    studentLoanInterest: {
      max: 2500,
      startSingle: 85000,
      endSingle: 100000,
      startMfj: 175000,
      endMfj: 205000,
    },
    saversCredit: {
      other: { maxRate50: 24250, maxRate20: 26250, maxRate10: 40250 },
      hoh: { maxRate50: 36375, maxRate20: 39375, maxRate10: 60375 },
      mfj: { maxRate50: 48500, maxRate20: 52500, maxRate10: 80500 },
    },
    ptc: {
      fplBase: 15650,
      fplPerAdditional: 5500,
      curve: [
        { min: 0, max: 133, initial: 2.1, final: 2.1 },
        { min: 133, max: 150, initial: 3.14, final: 4.19 },
        { min: 150, max: 200, initial: 4.19, final: 6.6 },
        { min: 200, max: 250, initial: 6.6, final: 8.44 },
        { min: 250, max: 300, initial: 8.44, final: 9.96 },
        { min: 300, max: 400, initial: 9.96, final: 9.96 },
      ],
      cliffAt400: true,
      repaymentCaps: null,
    },
  },
};

/** Null means the year isn't loaded — callers refuse by name, never guess. */
export function filingYearData(taxYear: number): FilingYearData | null {
  return FILING_YEAR_DATA[taxYear] ?? null;
}

/**
 * 1099-NEC / 1099-K issuance thresholds, kept for every year prior-year
 * support can reach (H4): OBBBA made the $20,000/200 K threshold
 * retroactive to 2022, and the NEC threshold was $600 through TY2025
 * before OBBBA's $2,000 — both verified 2026-08. A year outside this
 * table refuses by name like everything else.
 */
const INFORMATION_RETURN_THRESHOLDS: Record<number, { nec: number; k: number }> = {
  2022: { nec: 600, k: 20000 },
  2023: { nec: 600, k: 20000 },
  2024: { nec: 600, k: 20000 },
  2025: { nec: 600, k: 20000 },
  2026: { nec: 2000, k: 20000 },
};

export function informationReturnThresholds(taxYear: number): { nec: number; k: number } | null {
  return INFORMATION_RETURN_THRESHOLDS[taxYear] ?? null;
}
