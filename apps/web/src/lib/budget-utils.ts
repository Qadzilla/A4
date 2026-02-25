import type { CanvasItem } from '../stores/canvas-store';
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  formatCurrency as formatCurrencyShared,
} from './currency-utils';
import type { TableCardData } from './table-utils';

export type BudgetPeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface BudgetPeriod {
  type: BudgetPeriodType;
  month?: number;
  quarter?: number;
  year: number;
  startDate?: string;
  endDate?: string;
}

export type BudgetAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';

export interface BudgetCategorySource {
  tableItemId: string;
  columnId: string;
  aggregation: BudgetAggregation;
}

export interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  source?: BudgetCategorySource;
  notes: string;
  groupId?: string;
}

export interface BudgetGroup {
  id: string;
  name: string;
  color: string;
}

export type BudgetCurrency = SupportedCurrency;

export interface BudgetCardData {
  period: BudgetPeriod;
  currency: BudgetCurrency;
  groups: BudgetGroup[];
  categories: BudgetCategory[];
  notes: string;
}

export const BUDGET_GROUP_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export const BUDGET_CURRENCIES = SUPPORTED_CURRENCIES;

export function createDefaultBudgetData(): BudgetCardData {
  const now = new Date();
  const groupId = crypto.randomUUID();
  return {
    period: {
      type: 'monthly' as const,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
    currency: 'USD' as const,
    groups: [{ id: groupId, name: 'General', color: BUDGET_GROUP_COLORS[0]! }],
    categories: [
      {
        id: crypto.randomUUID(),
        name: '',
        budgeted: 0,
        actual: 0,
        notes: '',
        groupId,
      },
    ],
    notes: '',
  };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatBudgetPeriod(period: BudgetPeriod): string {
  switch (period.type) {
    case 'monthly':
      return `${MONTH_NAMES[(period.month ?? 1) - 1]} ${period.year}`;
    case 'quarterly':
      return `Q${period.quarter ?? 1} ${period.year}`;
    case 'yearly':
      return `${period.year}`;
    case 'custom': {
      if (!period.startDate || !period.endDate) return `${period.year}`;
      const fmt = (d: string) => {
        const date = new Date(`${d}T00:00:00`);
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      };
      return `${fmt(period.startDate)} \u2013 ${fmt(period.endDate)}`;
    }
    default:
      return `${period.year}`;
  }
}

export function resolveCategoryActual(category: BudgetCategory, items: CanvasItem[]): number {
  if (!category.source) return category.actual;

  const tableItem = items.find((i) => i.id === category.source?.tableItemId);
  if (!tableItem || tableItem.type !== 'table-card') return category.actual;

  const tableData = tableItem.data as TableCardData | undefined;
  if (!tableData?.columns || !tableData.rows) return category.actual;

  const column = tableData.columns.find((c) => c.id === category.source?.columnId);
  if (!column) return category.actual;

  const values = tableData.rows
    .map((row) => Number(row.cells[column.id]))
    .filter((n) => !Number.isNaN(n));

  if (values.length === 0 && category.source.aggregation !== 'count') return category.actual;

  switch (category.source.aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'count':
      return tableData.rows.length;
    case 'latest': {
      const lastRow = tableData.rows[tableData.rows.length - 1];
      const v = Number(lastRow?.cells[column.id]);
      return Number.isNaN(v) ? category.actual : v;
    }
    default:
      return category.actual;
  }
}

export function computeCategoryRemaining(budgeted: number, actual: number): number {
  return budgeted - actual;
}

export function computeCategoryPercent(budgeted: number, actual: number): number {
  if (budgeted === 0) return actual === 0 ? 0 : 100;
  return (actual / budgeted) * 100;
}

export function computeBudgetTotals(categories: BudgetCategory[], items: CanvasItem[]) {
  let totalBudgeted = 0;
  let totalActual = 0;
  for (const cat of categories) {
    totalBudgeted += cat.budgeted;
    totalActual += resolveCategoryActual(cat, items);
  }
  return {
    totalBudgeted,
    totalActual,
    remaining: computeCategoryRemaining(totalBudgeted, totalActual),
    percent: computeCategoryPercent(totalBudgeted, totalActual),
  };
}

export function formatBudgetCurrency(value: number, currency: BudgetCurrency): string {
  return formatCurrencyShared(value, currency);
}

export function getBudgetHealthColor(percent: number): string {
  if (percent > 100) return 'red';
  if (percent >= 80) return 'yellow';
  return 'green';
}
