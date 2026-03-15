// ─── Depreciation Calculator Utils ────────────────────────────────
// Types, defaults, and deterministic computation for asset depreciation.

import { formatCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'double-declining' | 'sum-of-years';

export interface DepreciationCardData {
  assetCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  method: DepreciationMethod;
  notes: string;
}

export interface DepreciationRow {
  year: number;
  depreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
}

export interface DepreciationResult {
  depreciableBase: number;
  annualDepreciation: number; // straight-line equivalent / year 1 for others
  totalDepreciation: number;
  schedule: DepreciationRow[];
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultDepreciationData(): DepreciationCardData {
  return {
    assetCost: 50000,
    salvageValue: 5000,
    usefulLifeYears: 5,
    method: 'straight-line',
    notes: '',
  };
}

// ─── Method labels ─────────────────────────────────────────────────

export const DEPRECIATION_METHODS: { value: DepreciationMethod; label: string; abbr: string }[] = [
  { value: 'straight-line', label: 'Straight-Line', abbr: 'SL' },
  { value: 'declining-balance', label: 'Declining Balance', abbr: 'DB' },
  { value: 'double-declining', label: 'Double-Declining', abbr: 'DDB' },
  { value: 'sum-of-years', label: "Sum-of-Years' Digits", abbr: 'SYD' },
];

export function getMethodAbbr(method: DepreciationMethod): string {
  return DEPRECIATION_METHODS.find((m) => m.value === method)?.abbr ?? 'SL';
}

// ─── Computation ───────────────────────────────────────────────────

function computeStraightLine(cost: number, salvage: number, life: number): DepreciationRow[] {
  const annual = (cost - salvage) / life;
  const schedule: DepreciationRow[] = [];
  let accumulated = 0;

  for (let year = 1; year <= life; year++) {
    accumulated += annual;
    schedule.push({
      year,
      depreciation: annual,
      accumulatedDepreciation: accumulated,
      bookValue: cost - accumulated,
    });
  }
  return schedule;
}

function computeDecliningBalance(cost: number, salvage: number, life: number): DepreciationRow[] {
  const rate = 1 / life;
  const schedule: DepreciationRow[] = [];
  let bookValue = cost;
  let accumulated = 0;

  for (let year = 1; year <= life; year++) {
    let depreciation = bookValue * rate;
    // Floor at salvage value
    if (bookValue - depreciation < salvage) {
      depreciation = Math.max(0, bookValue - salvage);
    }
    accumulated += depreciation;
    bookValue -= depreciation;
    schedule.push({
      year,
      depreciation,
      accumulatedDepreciation: accumulated,
      bookValue,
    });
  }
  return schedule;
}

function computeDoubleDeclining(cost: number, salvage: number, life: number): DepreciationRow[] {
  const rate = 2 / life;
  const schedule: DepreciationRow[] = [];
  let bookValue = cost;
  let accumulated = 0;

  for (let year = 1; year <= life; year++) {
    const remainingLife = life - year + 1;
    const slDepreciation = (bookValue - salvage) / remainingLife;
    let depreciation = bookValue * rate;

    // Switch to straight-line when SL > DDB
    if (slDepreciation > depreciation) {
      depreciation = slDepreciation;
    }

    // Floor at salvage value
    if (bookValue - depreciation < salvage) {
      depreciation = Math.max(0, bookValue - salvage);
    }

    accumulated += depreciation;
    bookValue -= depreciation;
    schedule.push({
      year,
      depreciation,
      accumulatedDepreciation: accumulated,
      bookValue,
    });
  }
  return schedule;
}

function computeSumOfYears(cost: number, salvage: number, life: number): DepreciationRow[] {
  const depreciableBase = cost - salvage;
  const sumOfDigits = (life * (life + 1)) / 2;
  const schedule: DepreciationRow[] = [];
  let accumulated = 0;

  for (let year = 1; year <= life; year++) {
    const remainingLife = life - year + 1;
    const depreciation = (remainingLife / sumOfDigits) * depreciableBase;
    accumulated += depreciation;
    schedule.push({
      year,
      depreciation,
      accumulatedDepreciation: accumulated,
      bookValue: cost - accumulated,
    });
  }
  return schedule;
}

export function computeDepreciation(data: DepreciationCardData): DepreciationResult {
  const depreciableBase = data.assetCost - data.salvageValue;
  const life = Math.max(1, Math.round(data.usefulLifeYears));

  let schedule: DepreciationRow[];
  switch (data.method) {
    case 'declining-balance':
      schedule = computeDecliningBalance(data.assetCost, data.salvageValue, life);
      break;
    case 'double-declining':
      schedule = computeDoubleDeclining(data.assetCost, data.salvageValue, life);
      break;
    case 'sum-of-years':
      schedule = computeSumOfYears(data.assetCost, data.salvageValue, life);
      break;
    default:
      schedule = computeStraightLine(data.assetCost, data.salvageValue, life);
      break;
  }

  const totalDepreciation = schedule.reduce((sum, r) => sum + r.depreciation, 0);
  const annualDepreciation = schedule[0]?.depreciation ?? 0;

  return {
    depreciableBase,
    annualDepreciation,
    totalDepreciation,
    schedule,
  };
}

// ─── Formatting ────────────────────────────────────────────────────

export function formatDepreciationCurrency(n: number): string {
  return formatCurrency(n, 'USD');
}
