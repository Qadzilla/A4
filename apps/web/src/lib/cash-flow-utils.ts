import { type SupportedCurrency, formatCurrency } from './currency-utils';
import { MONTH_OPTIONS, getFiscalMonthHeaders, getFiscalYearLabel } from './pnl-utils';

// Re-export shared helpers for convenience
export { getFiscalMonthHeaders, getFiscalYearLabel, MONTH_OPTIONS };

// ─── Types ──────────────────────────────────────────────────────────

export type CFSectionId = 'operating' | 'investing' | 'financing';

export interface CFLineItem {
  id: string;
  name: string;
  amounts: number[]; // 12 values, SIGNED: +inflow, -outflow
}

export interface CFSection {
  id: CFSectionId;
  lineItems: CFLineItem[];
}

export interface CFCardData {
  fiscalYearStart: number;
  fiscalMonthStart: number; // 1-12
  currency: SupportedCurrency;
  beginningCash: number; // starting cash balance for month 0
  sections: CFSection[];
  notes: string;
}

export interface CFComputedTotals {
  operatingCF: number[]; // 12 monthly totals
  investingCF: number[];
  financingCF: number[];
  netCashFlow: number[]; // operating + investing + financing per month
  beginningCash: number[]; // rolling: [0]=data.beginningCash, [n]=endingCash[n-1]
  endingCash: number[]; // beginningCash[m] + netCashFlow[m]
  // Annual sums
  annualOperatingCF: number;
  annualInvestingCF: number;
  annualFinancingCF: number;
  annualNetCashFlow: number;
  finalEndingCash: number; // endingCash[11]
  // Derived metrics
  burnRate: number; // avg monthly net CF (only meaningful if negative)
  cashRunway: number; // finalEndingCash / |burnRate| in months (0 if not burning)
}

// ─── Constants ──────────────────────────────────────────────────────

export const CF_SECTION_META: Record<CFSectionId, { label: string; subtotalLabel: string }> = {
  operating: { label: 'Operating Activities', subtotalLabel: 'Cash from Operations' },
  investing: { label: 'Investing Activities', subtotalLabel: 'Cash from Investing' },
  financing: { label: 'Financing Activities', subtotalLabel: 'Cash from Financing' },
};

export const CF_SECTION_ORDER: CFSectionId[] = ['operating', 'investing', 'financing'];

// ─── Helpers ────────────────────────────────────────────────────────

function emptyAmounts(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

export function newCFLineItem(name = ''): CFLineItem {
  return { id: crypto.randomUUID(), name, amounts: emptyAmounts() };
}

export function createDefaultCFData(): CFCardData {
  const now = new Date();
  return {
    fiscalYearStart: now.getFullYear(),
    fiscalMonthStart: 1,
    currency: 'USD',
    beginningCash: 0,
    sections: CF_SECTION_ORDER.map((id) => ({
      id,
      lineItems: [newCFLineItem()],
    })),
    notes: '',
  };
}

export function computeCFTotals(beginningCash: number, sections: CFSection[]): CFComputedTotals {
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  const operatingCF = emptyAmounts();
  const investingCF = emptyAmounts();
  const financingCF = emptyAmounts();
  const netCashFlow = emptyAmounts();
  const beginningCashArr = emptyAmounts();
  const endingCash = emptyAmounts();

  for (let m = 0; m < 12; m++) {
    const op = sectionMap.get('operating');
    const inv = sectionMap.get('investing');
    const fin = sectionMap.get('financing');

    operatingCF[m] = op ? op.lineItems.reduce((sum, li) => sum + li.amounts[m]!, 0) : 0;
    investingCF[m] = inv ? inv.lineItems.reduce((sum, li) => sum + li.amounts[m]!, 0) : 0;
    financingCF[m] = fin ? fin.lineItems.reduce((sum, li) => sum + li.amounts[m]!, 0) : 0;

    netCashFlow[m] = operatingCF[m]! + investingCF[m]! + financingCF[m]!;
    beginningCashArr[m] = m === 0 ? beginningCash : endingCash[m - 1]!;
    endingCash[m] = beginningCashArr[m]! + netCashFlow[m]!;
  }

  const sum12 = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const annualOperatingCF = sum12(operatingCF);
  const annualInvestingCF = sum12(investingCF);
  const annualFinancingCF = sum12(financingCF);
  const annualNetCashFlow = sum12(netCashFlow);
  const finalEndingCash = endingCash[11]!;

  // Burn rate: avg monthly net CF (only meaningful if negative)
  const avgMonthlyNetCF = annualNetCashFlow / 12;
  const burnRate = avgMonthlyNetCF < 0 ? avgMonthlyNetCF : 0;
  const cashRunway = burnRate < 0 && finalEndingCash > 0 ? finalEndingCash / Math.abs(burnRate) : 0;

  return {
    operatingCF,
    investingCF,
    financingCF,
    netCashFlow,
    beginningCash: beginningCashArr,
    endingCash,
    annualOperatingCF,
    annualInvestingCF,
    annualFinancingCF,
    annualNetCashFlow,
    finalEndingCash,
    burnRate,
    cashRunway,
  };
}

export function formatCFCurrency(value: number, currency: SupportedCurrency): string {
  return formatCurrency(value, currency);
}

export function sumLineItemAnnual(item: CFLineItem): number {
  return item.amounts.reduce((a, b) => a + b, 0);
}
