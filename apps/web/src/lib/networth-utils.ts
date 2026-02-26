import type { SupportedCurrency } from './currency-utils';

export type NetWorthCategoryKind = 'asset' | 'liability';

export interface NetWorthCategory {
  id: string;
  name: string;
  kind: NetWorthCategoryKind;
  isDefault: boolean;
}

export interface NetWorthEntry {
  id: string;
  name: string;
  categoryId: string;
  value: number;
  notes: string;
}

export interface NetWorthCardData {
  currency: SupportedCurrency;
  notes: string;
}

export function createDefaultNetWorthData(): NetWorthCardData {
  return {
    currency: 'USD',
    notes: '',
  };
}

export interface NetWorthResult {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  byCategory: { categoryId: string; name: string; kind: NetWorthCategoryKind; total: number }[];
  assetBreakdown: { categoryId: string; name: string; total: number; pct: number }[];
  liabilityBreakdown: { categoryId: string; name: string; total: number; pct: number }[];
}

export function computeNetWorth(
  categories: NetWorthCategory[],
  entries: NetWorthEntry[],
): NetWorthResult {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const entry of entries) {
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.value);
  }

  let totalAssets = 0;
  let totalLiabilities = 0;
  const byCategory: NetWorthResult['byCategory'] = [];

  for (const [catId, total] of totals) {
    const cat = catMap.get(catId);
    if (!cat) continue;
    byCategory.push({ categoryId: catId, name: cat.name, kind: cat.kind, total });
    if (cat.kind === 'asset') {
      totalAssets += total;
    } else {
      totalLiabilities += total;
    }
  }

  const assetBreakdown: NetWorthResult['assetBreakdown'] = byCategory
    .filter((c) => c.kind === 'asset')
    .map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      total: c.total,
      pct: totalAssets > 0 ? (c.total / totalAssets) * 100 : 0,
    }));

  const liabilityBreakdown: NetWorthResult['liabilityBreakdown'] = byCategory
    .filter((c) => c.kind === 'liability')
    .map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      total: c.total,
      pct: totalLiabilities > 0 ? (c.total / totalLiabilities) * 100 : 0,
    }));

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    byCategory,
    assetBreakdown,
    liabilityBreakdown,
  };
}

export function getNetWorthHealthColor(netWorth: number): 'green' | 'red' {
  return netWorth >= 0 ? 'green' : 'red';
}
