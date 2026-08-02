import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { holdings, taxProfiles } from '../db/schema';
import {
  computeQuarterlyPlan,
  computeTaxEstimate,
  createDefaultTaxEstimatorData,
} from '../lib/calc';
import type { TaxEstimatorData } from '../lib/calc';
import { kiddieGuard } from '../lib/calc/kiddie-guard';

/**
 * The year-round tax picture, shared by the tax tRPC router and Bip's
 * get_tax_picture tool: profile → deterministic estimate → quarterly
 * safe-harbor plan → unrealized-gains context from the portfolio.
 */

export async function loadTaxProfile(db: DB, userId: string, workspaceId: string) {
  const [row] = await db
    .select()
    .from(taxProfiles)
    .where(and(eq(taxProfiles.workspaceId, workspaceId), eq(taxProfiles.userId, userId)));
  return row ?? null;
}

/** Map a profile row (or nothing) onto estimator inputs. Losses net across buckets. */
export function toEstimatorData(row: Awaited<ReturnType<typeof loadTaxProfile>>): TaxEstimatorData {
  const base = createDefaultTaxEstimatorData();
  base.taxYear = 2026;
  if (!row) return base;
  return {
    ...base,
    taxYear: row.taxYear,
    filingStatus: row.filingStatus as TaxEstimatorData['filingStatus'],
    stateCode: row.stateCode,
    w2Wages: row.w2Wages,
    selfEmploymentIncome: row.selfEmploymentIncome,
    investmentIncome: row.investmentIncome,
    capitalGainsShort: Math.max(0, row.capitalGainsShort + Math.min(0, row.capitalGainsLong)),
    capitalGainsLong: Math.max(0, row.capitalGainsLong + Math.min(0, row.capitalGainsShort)),
    otherIncome: row.otherIncome,
    retirement401k: row.retirement401k,
    traditionalIRA: row.traditionalIRA,
    hsaContribution: row.hsaContribution,
    studentLoanInterest: row.studentLoanInterest,
    deductionType: row.deductionType as TaxEstimatorData['deductionType'],
    saltDeduction: row.saltDeduction,
    mortgageInterest: row.mortgageInterest,
    charitableGiving: row.charitableGiving,
    otherItemized: row.otherItemized,
    numDependentChildren: row.numDependentChildren,
    otherCredits: row.otherCredits,
    federalWithheld: row.federalWithheld,
    stateWithheld: row.stateWithheld,
    estimatedPayments: row.estimatedPayments,
  };
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function buildTaxPicture(db: DB, userId: string, workspaceId: string) {
  const profile = await loadTaxProfile(db, userId, workspaceId);
  const data = toEstimatorData(profile);
  const result = computeTaxEstimate(data);

  const quarterly = computeQuarterlyPlan({
    taxYear: data.taxYear,
    totalTax: result.totalTax,
    withheld: data.federalWithheld + data.stateWithheld,
    estimatedPaymentsMade: data.estimatedPayments,
    priorYearTax: profile?.priorYearTax ?? null,
    priorYearAgi: profile?.priorYearAgi ?? null,
    filingStatus: data.filingStatus,
  });

  // Unrealized context from the portfolio — only positions with a known
  // basis count; long/short split needs an acquisition date too.
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)));
  const now = Date.now();
  let unrealizedTotal = 0;
  let unrealizedLong = 0;
  let unrealizedShort = 0;
  let datedCount = 0;
  let basisKnownCount = 0;
  for (const h of rows) {
    if (h.costBasis === null || h.costBasis <= 0) continue;
    basisKnownCount += 1;
    const gain = h.value - h.costBasis;
    unrealizedTotal += gain;
    if (h.acquiredAt) {
      datedCount += 1;
      const heldMs = now - new Date(`${h.acquiredAt}T00:00:00Z`).getTime();
      if (heldMs >= ONE_YEAR_MS) unrealizedLong += gain;
      else unrealizedShort += gain;
    }
  }

  return {
    hasProfile: profile !== null,
    inputs: data,
    result,
    // B2: every consumer of ltcgZeroBracketRoom consults this before
    // presenting the window as usable.
    kiddie: kiddieGuard(
      {
        birthDate: profile?.birthDate ?? null,
        fullTimeStudent: profile?.fullTimeStudent ?? null,
      },
      data.taxYear,
    ),
    quarterly,
    unrealized: {
      total: basisKnownCount > 0 ? unrealizedTotal : null,
      longTerm: datedCount > 0 ? unrealizedLong : null,
      shortTerm: datedCount > 0 ? unrealizedShort : null,
      basisKnownCount,
      holdingCount: rows.length,
    },
  };
}
