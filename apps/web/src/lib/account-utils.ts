import type { SupportedCurrency } from './currency-utils';

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit-card'
  | 'brokerage'
  | 'retirement'
  | 'loan'
  | 'mortgage'
  | 'crypto'
  | 'other';

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  balance: number;
  groupId?: string | null;
  lastUpdated: string; // YYYY-MM-DD
  notes: string | null;
}

export interface AccountCardData {
  currency: SupportedCurrency;
  notes: string;
}

export const ACCOUNT_GROUP_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit-card', label: 'Credit Card' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'loan', label: 'Loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
];

export const LIABILITY_TYPES: Set<AccountType> = new Set(['credit-card', 'loan', 'mortgage']);

export function createDefaultAccountData(): AccountCardData {
  return {
    currency: 'USD',
    notes: '',
  };
}

export function isLiability(type: AccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

export function computeAccountTotals(accounts: Account[]) {
  let totalAssets = 0;
  let totalLiabilities = 0;
  const byType: Partial<Record<AccountType, number>> = {};

  for (const acc of accounts) {
    byType[acc.type] = (byType[acc.type] ?? 0) + acc.balance;
    if (isLiability(acc.type)) {
      totalLiabilities += acc.balance;
    } else {
      totalAssets += acc.balance;
    }
  }

  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, byType };
}

export function getNetWorthHealthColor(netWorth: number): 'green' | 'red' {
  return netWorth >= 0 ? 'green' : 'red';
}
