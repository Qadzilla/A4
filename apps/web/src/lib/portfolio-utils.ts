import type { SupportedCurrency } from './currency-utils';

export interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  value: number;
  targetPct: number;
}

export interface PortfolioCardData {
  currency: SupportedCurrency;
  holdings: PortfolioHolding[];
  notes: string;
}

export interface HoldingAnalysis {
  id: string;
  symbol: string;
  name: string;
  value: number;
  targetPct: number;
  actualPct: number;
  driftPct: number;
  driftValue: number;
}

export interface RebalanceTrade {
  symbol: string;
  name: string;
  action: 'buy' | 'sell';
  amount: number;
}

export interface PortfolioResult {
  totalValue: number;
  targetTotal: number;
  holdings: HoldingAnalysis[];
  maxOverweight: HoldingAnalysis | null;
  maxUnderweight: HoldingAnalysis | null;
  rebalanceTrades: RebalanceTrade[];
  isBalanced: boolean;
  driftThreshold: number;
}

const DRIFT_THRESHOLD = 1.0;

export function createDefaultPortfolioData(): PortfolioCardData {
  return {
    currency: 'USD',
    holdings: [],
    notes: '',
  };
}

export function computePortfolio(data: PortfolioCardData): PortfolioResult {
  const { holdings } = data;

  if (holdings.length === 0) {
    return {
      totalValue: 0,
      targetTotal: 0,
      holdings: [],
      maxOverweight: null,
      maxUnderweight: null,
      rebalanceTrades: [],
      isBalanced: true,
      driftThreshold: DRIFT_THRESHOLD,
    };
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const targetTotal = holdings.reduce((sum, h) => sum + h.targetPct, 0);

  const analyzed: HoldingAnalysis[] = holdings.map((h) => {
    const actualPct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    const driftPct = actualPct - h.targetPct;
    const driftValue = totalValue > 0 ? (h.targetPct / 100) * totalValue - h.value : 0;
    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      value: h.value,
      targetPct: h.targetPct,
      actualPct,
      driftPct,
      driftValue,
    };
  });

  let maxOverweight: HoldingAnalysis | null = null;
  let maxUnderweight: HoldingAnalysis | null = null;

  for (const h of analyzed) {
    if (h.driftPct > 0 && (!maxOverweight || h.driftPct > maxOverweight.driftPct)) {
      maxOverweight = h;
    }
    if (h.driftPct < 0 && (!maxUnderweight || h.driftPct < maxUnderweight.driftPct)) {
      maxUnderweight = h;
    }
  }

  const rebalanceTrades: RebalanceTrade[] = analyzed
    .filter((h) => Math.abs(h.driftPct) > DRIFT_THRESHOLD)
    .sort((a, b) => Math.abs(b.driftValue) - Math.abs(a.driftValue))
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      action: h.driftValue > 0 ? 'buy' : 'sell',
      amount: Math.abs(h.driftValue),
    }));

  const isBalanced = analyzed.every((h) => Math.abs(h.driftPct) <= DRIFT_THRESHOLD);

  return {
    totalValue,
    targetTotal,
    holdings: analyzed,
    maxOverweight,
    maxUnderweight,
    rebalanceTrades,
    isBalanced,
    driftThreshold: DRIFT_THRESHOLD,
  };
}

export function getDriftColor(driftPct: number): 'green' | 'yellow' | 'red' {
  const abs = Math.abs(driftPct);
  if (abs <= 1.0) return 'green';
  if (abs <= 3.0) return 'yellow';
  return 'red';
}
