import type { SupportedCurrency } from './currency-utils';

export type LedgerEntryType = 'income' | 'expense';

export interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // always positive
  type: LedgerEntryType;
  categoryId?: string | null;
  notes: string | null;
}

/** View config only — entries and categories live in DB via tRPC. */
export interface LedgerCardData {
  startingBalance: number;
  currency: SupportedCurrency;
  notes: string;
}

export const LEDGER_CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function createDefaultLedgerData(): LedgerCardData {
  return { startingBalance: 0, currency: 'USD', notes: '' };
}

export function computeLedgerTotals(entries: LedgerEntry[]) {
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const e of entries) {
    if (e.type === 'income') totalIncome += e.amount;
    else totalExpenses += e.amount;
  }
  return { totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

/** Returns a running balance array aligned with entries sorted by date ascending. */
export function computeRunningBalance(startingBalance: number, entries: LedgerEntry[]): number[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let balance = startingBalance;
  return sorted.map((e) => {
    balance += e.type === 'income' ? e.amount : -e.amount;
    return balance;
  });
}

export function computeNetBalance(startingBalance: number, entries: LedgerEntry[]): number {
  const { net } = computeLedgerTotals(entries);
  return startingBalance + net;
}

export function getLedgerHealthColor(net: number): 'green' | 'red' {
  return net >= 0 ? 'green' : 'red';
}

export function getLedgerDateRange(entries: LedgerEntry[]): string {
  if (entries.length === 0) return 'No entries';
  const dates = entries.map((e) => e.date).sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const fmt = (d: string) => {
    const date = new Date(`${d}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (first === last) return fmt(first);
  return `${fmt(first)} \u2013 ${fmt(last)}`;
}
