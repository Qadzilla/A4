import { cn } from '@a4/ui';
import { memo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { computeNetWorth, getNetWorthHealthColor } from '../../lib/networth-utils';
import type { NetWorthCardData } from '../../lib/networth-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const NetWorthCardContent = memo(function NetWorthCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as NetWorthCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const entries = data?.entries ?? [];
  const categories = data?.categories ?? [];

  const safeData: NetWorthCardData = {
    currency,
    categories,
    entries,
    notes: data?.notes ?? '',
  };

  const { totalAssets, totalLiabilities, netWorth } = computeNetWorth(safeData);
  const healthColor = getNetWorthHealthColor(netWorth);

  const assetCatCount = new Set(
    entries.filter((e) => categories.find((c) => c.id === e.categoryId)?.kind === 'asset').map((e) => e.categoryId),
  ).size;
  const liabCatCount = new Set(
    entries.filter((e) => categories.find((c) => c.id === e.categoryId)?.kind === 'liability').map((e) => e.categoryId),
  ).size;

  const total = totalAssets + totalLiabilities;
  const assetPct = total > 0 ? (totalAssets / total) * 100 : 50;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Net Worth
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        <p className="text-[10px] text-muted-foreground">Net Worth</p>
        <p
          className={cn(
            'text-[20px] font-bold leading-tight',
            healthColor === 'green'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {formatCurrency(netWorth, currency)}
        </p>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          +${compactFormatter.format(totalAssets)} assets &minus;$
          {compactFormatter.format(totalLiabilities)} liab
        </p>

        {/* Asset vs Liability bar */}
        <div className="mt-1">
          <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden flex">
            <div
              className="h-full bg-green-500 dark:bg-green-400 transition-all"
              style={{ width: `${assetPct}%` }}
            />
            <div
              className="h-full bg-red-500 dark:bg-red-400 transition-all"
              style={{ width: `${100 - assetPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-green-600 dark:text-green-400">
              Assets {Math.round(assetPct)}%
            </span>
            <span className="text-[9px] text-red-600 dark:text-red-400">
              Liab {Math.round(100 - assetPct)}%
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {assetCatCount} asset cat{assetCatCount === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {liabCatCount} liab cat{liabCatCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
});
