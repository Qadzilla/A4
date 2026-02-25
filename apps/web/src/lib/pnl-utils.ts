import { type SupportedCurrency, formatCurrency } from './currency-utils';

// ─── Types ──────────────────────────────────────────────────────────

export type PLSectionId = 'revenue' | 'cogs' | 'opex' | 'other' | 'tax';

export interface PLLineItem {
  id: string;
  name: string;
  amounts: number[]; // 12 values, index 0 = fiscal start month
  isIncome?: boolean; // only for 'other' section
}

export interface PLSection {
  id: PLSectionId;
  lineItems: PLLineItem[];
}

export interface PLCardData {
  fiscalYearStart: number;
  fiscalMonthStart: number; // 1-12 (1=Jan)
  currency: SupportedCurrency;
  sections: PLSection[];
  viewMode: 'table' | 'waterfall';
  notes: string;
}

export interface PLComputedTotals {
  netRevenue: number[];
  totalCogs: number[];
  grossProfit: number[];
  totalOpex: number[];
  operatingIncome: number[];
  netOther: number[];
  preTaxIncome: number[];
  totalTax: number[];
  netIncome: number[];
  annualNetRevenue: number;
  annualGrossProfit: number;
  annualOpex: number;
  annualOperatingIncome: number;
  annualNetIncome: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  netMarginPct: number;
}

export interface WaterfallDataPoint {
  label: string;
  start: number;
  value: number;
  total: number;
  color: string;
  isSubtotal: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────

export const PL_SECTION_META: Record<
  PLSectionId,
  { label: string; subtotalLabel: string; sign: 1 | -1 }
> = {
  revenue: { label: 'Revenue', subtotalLabel: 'Net Revenue', sign: 1 },
  cogs: { label: 'Cost of Goods Sold', subtotalLabel: 'Total COGS', sign: -1 },
  opex: { label: 'Operating Expenses', subtotalLabel: 'Total OpEx', sign: -1 },
  other: { label: 'Other Income / Expenses', subtotalLabel: 'Net Other', sign: 1 },
  tax: { label: 'Income Tax', subtotalLabel: 'Total Tax', sign: -1 },
};

export const PL_SECTION_ORDER: PLSectionId[] = ['revenue', 'cogs', 'opex', 'other', 'tax'];

export const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_LABELS_FULL = [
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

export const MONTH_OPTIONS = MONTH_LABELS_FULL.map((label, i) => ({ value: i + 1, label }));

// ─── Helpers ────────────────────────────────────────────────────────

function emptyAmounts(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

function createLineItem(name = ''): PLLineItem {
  return { id: crypto.randomUUID(), name, amounts: emptyAmounts() };
}

export function createDefaultPnlData(): PLCardData {
  const now = new Date();
  return {
    fiscalYearStart: now.getFullYear(),
    fiscalMonthStart: 1,
    currency: 'USD',
    sections: PL_SECTION_ORDER.map((id) => ({
      id,
      lineItems: [createLineItem()],
    })),
    viewMode: 'table',
    notes: '',
  };
}

export function getFiscalMonthLabels(fiscalMonthStart: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIdx = (fiscalMonthStart - 1 + i) % 12;
    labels.push(MONTH_LABELS_SHORT[monthIdx]!);
  }
  return labels;
}

export function getFiscalMonthHeaders(year: number, monthStart: number): string[] {
  const headers: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIdx = (monthStart - 1 + i) % 12;
    const y = monthIdx < monthStart - 1 ? year + 1 : year;
    headers.push(`${MONTH_LABELS_SHORT[monthIdx]} ${y}`);
  }
  return headers;
}

export function getFiscalYearLabel(year: number, monthStart: number): string {
  if (monthStart === 1) return `FY ${year} (Jan\u2013Dec)`;
  const startLabel = MONTH_LABELS_SHORT[monthStart - 1]!;
  const endIdx = (monthStart - 2 + 12) % 12;
  const endLabel = MONTH_LABELS_SHORT[endIdx]!;
  return `FY ${year}/${year + 1} (${startLabel}\u2013${endLabel})`;
}

export function sumLineItemAnnual(item: PLLineItem): number {
  return item.amounts.reduce((a, b) => a + b, 0);
}

function sumSectionMonth(section: PLSection, monthIdx: number, sectionId: PLSectionId): number {
  return section.lineItems.reduce((sum, li) => {
    if (sectionId === 'other') {
      return sum + (li.isIncome ? li.amounts[monthIdx]! : -li.amounts[monthIdx]!);
    }
    return sum + li.amounts[monthIdx]!;
  }, 0);
}

export function computePLTotals(sections: PLSection[]): PLComputedTotals {
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  const netRevenue = emptyAmounts();
  const totalCogs = emptyAmounts();
  const grossProfit = emptyAmounts();
  const totalOpex = emptyAmounts();
  const operatingIncome = emptyAmounts();
  const netOther = emptyAmounts();
  const preTaxIncome = emptyAmounts();
  const totalTax = emptyAmounts();
  const netIncome = emptyAmounts();

  for (let m = 0; m < 12; m++) {
    const rev = sectionMap.get('revenue');
    const cogs = sectionMap.get('cogs');
    const opex = sectionMap.get('opex');
    const other = sectionMap.get('other');
    const tax = sectionMap.get('tax');

    netRevenue[m] = rev ? sumSectionMonth(rev, m, 'revenue') : 0;
    totalCogs[m] = cogs ? sumSectionMonth(cogs, m, 'cogs') : 0;
    grossProfit[m] = netRevenue[m]! - totalCogs[m]!;
    totalOpex[m] = opex ? sumSectionMonth(opex, m, 'opex') : 0;
    operatingIncome[m] = grossProfit[m]! - totalOpex[m]!;
    netOther[m] = other ? sumSectionMonth(other, m, 'other') : 0;
    preTaxIncome[m] = operatingIncome[m]! + netOther[m]!;
    totalTax[m] = tax ? sumSectionMonth(tax, m, 'tax') : 0;
    netIncome[m] = preTaxIncome[m]! - totalTax[m]!;
  }

  const sum12 = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const annualNetRevenue = sum12(netRevenue);
  const annualGrossProfit = sum12(grossProfit);
  const annualOpex = sum12(totalOpex);
  const annualOperatingIncome = sum12(operatingIncome);
  const annualNetIncome = sum12(netIncome);

  const pct = (v: number) => (annualNetRevenue === 0 ? 0 : (v / annualNetRevenue) * 100);

  return {
    netRevenue,
    totalCogs,
    grossProfit,
    totalOpex,
    operatingIncome,
    netOther,
    preTaxIncome,
    totalTax,
    netIncome,
    annualNetRevenue,
    annualGrossProfit,
    annualOpex,
    annualOperatingIncome,
    annualNetIncome,
    grossMarginPct: pct(annualGrossProfit),
    operatingMarginPct: pct(annualOperatingIncome),
    netMarginPct: pct(annualNetIncome),
  };
}

export function formatMarginPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function formatPLCurrency(value: number, currency: SupportedCurrency): string {
  return formatCurrency(value, currency);
}

// ─── Waterfall ──────────────────────────────────────────────────────

const WATERFALL_GREEN = '#22c55e';
const WATERFALL_RED = '#ef4444';
const WATERFALL_GRAY = '#6b7280';

export function buildWaterfallData(totals: PLComputedTotals): WaterfallDataPoint[] {
  const points: WaterfallDataPoint[] = [];
  let running = 0;

  // 1. Net Revenue (subtotal)
  running = totals.annualNetRevenue;
  points.push({
    label: 'Net Revenue',
    start: 0,
    value: running,
    total: running,
    color: WATERFALL_GRAY,
    isSubtotal: true,
  });

  // 2. -COGS (drops from Net Revenue to Gross Profit)
  const annualCogs = totals.totalCogs.reduce((a, b) => a + b, 0);
  points.push({
    label: 'COGS',
    start: running - annualCogs,
    value: annualCogs,
    total: totals.annualGrossProfit,
    color: WATERFALL_RED,
    isSubtotal: false,
  });
  running = totals.annualGrossProfit;

  // 3. Gross Profit (subtotal)
  points.push({
    label: 'Gross Profit',
    start: 0,
    value: running,
    total: running,
    color: WATERFALL_GRAY,
    isSubtotal: true,
  });

  // 4. -OpEx
  const opexVal = totals.annualOpex;
  points.push({
    label: 'OpEx',
    start: running - opexVal,
    value: opexVal,
    total: totals.annualOperatingIncome,
    color: WATERFALL_RED,
    isSubtotal: false,
  });
  running = totals.annualOperatingIncome;

  // 5. EBIT (subtotal)
  points.push({
    label: 'EBIT',
    start: 0,
    value: running,
    total: running,
    color: WATERFALL_GRAY,
    isSubtotal: true,
  });

  // 6. ±Other
  const annualOther = totals.netOther.reduce((a, b) => a + b, 0);
  const otherColor = annualOther >= 0 ? WATERFALL_GREEN : WATERFALL_RED;
  if (annualOther >= 0) {
    points.push({
      label: 'Other',
      start: running,
      value: annualOther,
      total: running + annualOther,
      color: otherColor,
      isSubtotal: false,
    });
  } else {
    points.push({
      label: 'Other',
      start: running + annualOther,
      value: -annualOther,
      total: running + annualOther,
      color: otherColor,
      isSubtotal: false,
    });
  }
  running += annualOther;

  // 7. Pre-Tax Income (subtotal)
  points.push({
    label: 'Pre-Tax',
    start: 0,
    value: running,
    total: running,
    color: WATERFALL_GRAY,
    isSubtotal: true,
  });

  // 8. -Tax
  const annualTax = totals.totalTax.reduce((a, b) => a + b, 0);
  points.push({
    label: 'Tax',
    start: running - annualTax,
    value: annualTax,
    total: running - annualTax,
    color: WATERFALL_RED,
    isSubtotal: false,
  });
  running -= annualTax;

  // 9. Net Income (subtotal)
  points.push({
    label: 'Net Income',
    start: 0,
    value: running,
    total: running,
    color: WATERFALL_GRAY,
    isSubtotal: true,
  });

  return points;
}

export function newLineItem(name = ''): PLLineItem {
  return createLineItem(name);
}
