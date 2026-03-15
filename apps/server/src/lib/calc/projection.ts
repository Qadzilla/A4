// ─── Projection Calculator Utils ──────────────────────────────────
// Types, defaults, and deterministic computation for investment/growth projections.

import { formatCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export interface ProjectionCardData {
  startingAmount: number;
  monthlyContribution: number;
  annualGrowthRate: number;
  projectionYears: number;
  inflationRate: number;
  notes: string;
}

export interface ProjectionRow {
  year: number;
  contributionsThisYear: number;
  growthThisYear: number;
  nominalBalance: number;
  realBalance: number;
}

export interface ProjectionResult {
  totalContributions: number;
  totalGrowth: number;
  finalBalance: number;
  realFinalBalance: number;
  schedule: ProjectionRow[];
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultProjectionData(): ProjectionCardData {
  return {
    startingAmount: 10000,
    monthlyContribution: 500,
    annualGrowthRate: 7,
    projectionYears: 10,
    inflationRate: 0,
    notes: '',
  };
}

// ─── Computation ───────────────────────────────────────────────────

export function computeProjection(data: ProjectionCardData): ProjectionResult {
  const monthlyRate = data.annualGrowthRate / 100 / 12;
  const monthlyInflation = data.inflationRate / 100 / 12;
  const schedule: ProjectionRow[] = [];

  let balance = data.startingAmount;
  let totalContributions = data.startingAmount;
  let realBalance = data.startingAmount;
  let monthCount = 0;

  for (let year = 1; year <= data.projectionYears; year++) {
    let contributionsThisYear = 0;
    let growthThisYear = 0;

    for (let m = 0; m < 12; m++) {
      monthCount++;
      balance += data.monthlyContribution;
      contributionsThisYear += data.monthlyContribution;

      const growth = balance * monthlyRate;
      growthThisYear += growth;
      balance += growth;

      // Track inflation-adjusted balance
      if (data.inflationRate > 0) {
        realBalance = balance / (1 + monthlyInflation) ** monthCount;
      } else {
        realBalance = balance;
      }
    }

    totalContributions += contributionsThisYear;

    schedule.push({
      year,
      contributionsThisYear,
      growthThisYear,
      nominalBalance: balance,
      realBalance,
    });
  }

  const totalGrowth = balance - totalContributions;

  return {
    totalContributions,
    totalGrowth,
    finalBalance: balance,
    realFinalBalance: realBalance,
    schedule,
  };
}

// ─── Formatting ────────────────────────────────────────────────────

export function formatProjectionCurrency(n: number): string {
  return formatCurrency(n, 'USD');
}
