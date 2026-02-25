// ─── Break-Even Calculator Utils ──────────────────────────────────
// Types, defaults, and deterministic computation for break-even analysis.

import { formatCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export interface BreakevenCardData {
  fixedCosts: number;
  variableCostPerUnit: number;
  pricePerUnit: number;
  notes: string;
}

export interface BreakevenRow {
  units: number;
  revenue: number;
  fixedCosts: number;
  variableCosts: number;
  totalCosts: number;
  profitLoss: number;
}

export interface BreakevenResult {
  contributionMargin: number;
  contributionMarginPercent: number;
  breakEvenUnits: number;
  breakEvenRevenue: number;
  isViable: boolean;
  schedule: BreakevenRow[];
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultBreakevenData(): BreakevenCardData {
  return {
    fixedCosts: 5000,
    variableCostPerUnit: 15,
    pricePerUnit: 40,
    notes: '',
  };
}

// ─── Computation ───────────────────────────────────────────────────

export function computeBreakeven(data: BreakevenCardData): BreakevenResult {
  const contributionMargin = data.pricePerUnit - data.variableCostPerUnit;
  const contributionMarginPercent =
    data.pricePerUnit > 0 ? (contributionMargin / data.pricePerUnit) * 100 : 0;

  const isViable = contributionMargin > 0;
  const breakEvenUnits = isViable ? Math.ceil(data.fixedCosts / contributionMargin) : Number.POSITIVE_INFINITY;
  const breakEvenRevenue = isViable ? breakEvenUnits * data.pricePerUnit : Number.POSITIVE_INFINITY;

  // Generate schedule: 10 rows from 0 to 2x break-even (or reasonable range if not viable)
  const maxUnits = isViable ? breakEvenUnits * 2 : 100;
  const step = Math.max(1, Math.floor(maxUnits / 10));
  const schedule: BreakevenRow[] = [];

  for (let i = 0; i <= 10; i++) {
    const units = i * step;
    const revenue = units * data.pricePerUnit;
    const variableCosts = units * data.variableCostPerUnit;
    const totalCosts = data.fixedCosts + variableCosts;
    const profitLoss = revenue - totalCosts;

    schedule.push({
      units,
      revenue,
      fixedCosts: data.fixedCosts,
      variableCosts,
      totalCosts,
      profitLoss,
    });
  }

  return {
    contributionMargin,
    contributionMarginPercent,
    breakEvenUnits,
    breakEvenRevenue,
    isViable,
    schedule,
  };
}

// ─── Formatting ────────────────────────────────────────────────────

export function formatBreakevenCurrency(n: number): string {
  return formatCurrency(n, 'USD');
}
