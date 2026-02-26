import type { SupportedCurrency } from './currency-utils';

export type ReceiptStatus = 'pending' | 'reviewed' | 'reimbursed';
export type PaymentMethod = 'cash' | 'card' | 'check' | 'transfer' | 'other';

export interface Receipt {
  id: string;
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number; // total including tax
  tax: number;
  paymentMethod: PaymentMethod;
  categoryId?: string | null;
  status: ReceiptStatus;
  linkedFileId?: string | null; // reference to uploaded file (fileId from file-utils)
  notes: string | null;
}

/** View config stored in item.data — actual receipts/categories live in DB */
export interface ReceiptCardData {
  currency: SupportedCurrency;
  notes: string;
}

export const RECEIPT_CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'check', label: 'Check' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Other' },
];

export const RECEIPT_STATUSES: { value: ReceiptStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'amber' },
  { value: 'reviewed', label: 'Reviewed', color: 'blue' },
  { value: 'reimbursed', label: 'Reimbursed', color: 'green' },
];

export function createDefaultReceiptData(): ReceiptCardData {
  return {
    currency: 'USD',
    notes: '',
  };
}

export function computeReceiptTotals(receipts: Receipt[]) {
  let totalAmount = 0;
  let totalTax = 0;
  const byStatus = { pending: 0, reviewed: 0, reimbursed: 0 };
  for (const r of receipts) {
    totalAmount += r.amount;
    totalTax += r.tax;
    byStatus[r.status]++;
  }
  return { totalAmount, totalTax, byStatus };
}

export function getReceiptDateRange(receipts: Receipt[]): string {
  if (receipts.length === 0) return 'No receipts';
  const dates = receipts.map((r) => r.date).sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const fmt = (d: string) => {
    const date = new Date(`${d}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (first === last) return fmt(first);
  return `${fmt(first)} \u2013 ${fmt(last)}`;
}

export function getStatusColor(status: ReceiptStatus): 'amber' | 'blue' | 'green' {
  if (status === 'pending') return 'amber';
  if (status === 'reviewed') return 'blue';
  return 'green';
}

export function cycleStatus(status: ReceiptStatus): ReceiptStatus {
  if (status === 'pending') return 'reviewed';
  if (status === 'reviewed') return 'reimbursed';
  return 'pending';
}
