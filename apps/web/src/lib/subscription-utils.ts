import type { SupportedCurrency } from './currency-utils';

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  frequency: SubscriptionFrequency;
  startDate: string; // YYYY-MM-DD
  nextBillingDate: string; // YYYY-MM-DD (auto-computed, overridable)
  categoryId?: string | null;
  status: SubscriptionStatus;
  notes: string | null;
}

/** View config stored in item.data — actual subscriptions/categories live in DB */
export interface SubscriptionCardData {
  currency: SupportedCurrency;
  notes: string;
}

export const SUBSCRIPTION_CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export const SUBSCRIPTION_FREQUENCIES: { value: SubscriptionFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

export const SUBSCRIPTION_STATUSES: { value: SubscriptionStatus; label: string; color: string }[] =
  [
    { value: 'active', label: 'Active', color: 'green' },
    { value: 'paused', label: 'Paused', color: 'amber' },
    { value: 'cancelled', label: 'Cancelled', color: 'red' },
  ];

export function createDefaultSubscriptionData(): SubscriptionCardData {
  return {
    currency: 'USD',
    notes: '',
  };
}

export function computeMonthlyAmount(amount: number, frequency: SubscriptionFrequency): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
  }
}

export function computeSubscriptionTotals(subscriptions: Subscription[]) {
  let monthlyCost = 0;
  const byStatus = { active: 0, paused: 0, cancelled: 0 };

  for (const sub of subscriptions) {
    byStatus[sub.status]++;
    if (sub.status === 'active') {
      monthlyCost += computeMonthlyAmount(sub.amount, sub.frequency);
    }
  }

  return { monthlyCost, annualCost: monthlyCost * 12, byStatus };
}

/** Compute the next future billing date by incrementing from startDate until past today. */
export function computeNextBillingDate(
  startDate: string,
  frequency: SubscriptionFrequency,
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return startDate;

  // Keep advancing until we reach a future date
  while (date < today) {
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly': {
        const day = date.getDate();
        date.setMonth(date.getMonth() + 1);
        // Clamp to end of month if original day overflowed
        if (date.getDate() < day) date.setDate(0);
        break;
      }
      case 'quarterly': {
        const day = date.getDate();
        date.setMonth(date.getMonth() + 3);
        if (date.getDate() < day) date.setDate(0);
        break;
      }
      case 'annual': {
        const day = date.getDate();
        date.setFullYear(date.getFullYear() + 1);
        if (date.getDate() < day) date.setDate(0);
        break;
      }
    }
  }

  return date.toISOString().slice(0, 10);
}

export function getSubscriptionStatusColor(status: SubscriptionStatus): 'green' | 'amber' | 'red' {
  switch (status) {
    case 'active':
      return 'green';
    case 'paused':
      return 'amber';
    case 'cancelled':
      return 'red';
  }
}

export function cycleSubscriptionStatus(status: SubscriptionStatus): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'paused';
    case 'paused':
      return 'cancelled';
    case 'cancelled':
      return 'active';
  }
}
