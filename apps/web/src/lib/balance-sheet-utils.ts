import type { SupportedCurrency } from './currency-utils';
import { formatCurrency } from './currency-utils';

// ─── Types ──────────────────────────────────────────────────────────

export type BSSectionId =
  | 'current-assets'
  | 'non-current-assets'
  | 'current-liabilities'
  | 'non-current-liabilities'
  | 'equity';

export interface BSLineItem {
  id: string;
  name: string;
  value: number;
}

export interface BSSection {
  id: BSSectionId;
  lineItems: BSLineItem[];
}

export interface BSCardData {
  asOfDate: string; // ISO date string, e.g. "2025-12-31"
  currency: SupportedCurrency;
  sections: BSSection[];
  notes: string;
}

export interface BSComputedTotals {
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  liabilitiesPlusEquity: number;
  isBalanced: boolean;
  currentRatio: number;
  debtToEquity: number;
  debtToAssets: number;
  workingCapital: number;
  equityRatio: number;
}

// ─── Constants ──────────────────────────────────────────────────────

export const BS_SECTION_META: Record<
  BSSectionId,
  { label: string; group: 'assets' | 'liabilities' | 'equity' }
> = {
  'current-assets': { label: 'Current Assets', group: 'assets' },
  'non-current-assets': { label: 'Non-Current Assets', group: 'assets' },
  'current-liabilities': { label: 'Current Liabilities', group: 'liabilities' },
  'non-current-liabilities': { label: 'Non-Current Liabilities', group: 'liabilities' },
  equity: { label: 'Equity', group: 'equity' },
};

export const BS_SECTION_ORDER: BSSectionId[] = [
  'current-assets',
  'non-current-assets',
  'current-liabilities',
  'non-current-liabilities',
  'equity',
];

// ─── Helpers ────────────────────────────────────────────────────────

export function newBSLineItem(name = ''): BSLineItem {
  return { id: crypto.randomUUID(), name, value: 0 };
}

export function createDefaultBSData(): BSCardData {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return {
    asOfDate: `${yyyy}-${mm}-${dd}`,
    currency: 'USD',
    sections: BS_SECTION_ORDER.map((id) => ({
      id,
      lineItems: [newBSLineItem()],
    })),
    notes: '',
  };
}

function sumSection(sections: BSSection[], sectionId: BSSectionId): number {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return 0;
  return section.lineItems.reduce((sum, li) => sum + li.value, 0);
}

export function computeBSTotals(sections: BSSection[]): BSComputedTotals {
  const totalCurrentAssets = sumSection(sections, 'current-assets');
  const totalNonCurrentAssets = sumSection(sections, 'non-current-assets');
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiabilities = sumSection(sections, 'current-liabilities');
  const totalNonCurrentLiabilities = sumSection(sections, 'non-current-liabilities');
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

  const totalEquity = sumSection(sections, 'equity');
  const liabilitiesPlusEquity = totalLiabilities + totalEquity;

  // Use a small epsilon for floating-point comparison
  const isBalanced = Math.abs(totalAssets - liabilitiesPlusEquity) < 0.005;

  const currentRatio =
    totalCurrentLiabilities === 0 ? 0 : totalCurrentAssets / totalCurrentLiabilities;
  const debtToEquity = totalEquity === 0 ? 0 : totalLiabilities / totalEquity;
  const debtToAssets = totalAssets === 0 ? 0 : (totalLiabilities / totalAssets) * 100;
  const workingCapital = totalCurrentAssets - totalCurrentLiabilities;
  const equityRatio = totalAssets === 0 ? 0 : (totalEquity / totalAssets) * 100;

  return {
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalLiabilities,
    totalEquity,
    liabilitiesPlusEquity,
    isBalanced,
    currentRatio,
    debtToEquity,
    debtToAssets,
    workingCapital,
    equityRatio,
  };
}

export function formatRatio(value: number): string {
  if (value === 0) return '\u2014';
  return `${value.toFixed(1)}x`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatBSCurrency(value: number, currency: SupportedCurrency): string {
  return formatCurrency(value, currency);
}

export function formatAsOfDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
