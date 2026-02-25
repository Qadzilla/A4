import { cn } from '@a4/ui';
import { memo, useMemo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { computePortfolio, getDriftColor } from '../../lib/portfolio-utils';
import type { PortfolioCardData } from '../../lib/portfolio-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const SEGMENT_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-pink-500',
];

export const PortfolioCardContent = memo(function PortfolioCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as PortfolioCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const holdings = data?.holdings ?? [];

  const result = useMemo(
    () =>
      computePortfolio({
        currency,
        holdings,
        notes: '',
      }),
    [currency, holdings],
  );

  const { totalValue, isBalanced, rebalanceTrades, maxOverweight, maxUnderweight } = result;

  // Top 5 holdings by value for allocation bar
  const sortedHoldings = useMemo(
    () => [...holdings].sort((a, b) => b.value - a.value).slice(0, 5),
    [holdings],
  );

  const maxDrift = maxOverweight ? maxOverweight : maxUnderweight ? maxUnderweight : null;
  const maxDriftAbs = maxDrift ? Math.abs(maxDrift.driftPct) : 0;
  const driftColor = maxDrift ? getDriftColor(maxDrift.driftPct) : 'green';

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Portfolio
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {holdings.length} holding{holdings.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {holdings.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-2">No holdings added</p>
        ) : (
          <>
            <p className="text-[20px] font-bold leading-tight text-foreground">
              {formatCurrency(totalValue, currency)}
            </p>

            {/* Allocation bar */}
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
              {totalValue > 0 &&
                sortedHoldings.map((h, i) => {
                  const pct = (h.value / totalValue) * 100;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={h.id}
                      className={cn('h-full', SEGMENT_COLORS[i % SEGMENT_COLORS.length])}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              {totalValue > 0 && holdings.length > 5 && (
                <div className="h-full flex-1 bg-gray-400 dark:bg-gray-500" />
              )}
            </div>

            {/* Drift summary */}
            <p
              className={cn(
                'text-[11px]',
                driftColor === 'green'
                  ? 'text-green-600 dark:text-green-400'
                  : driftColor === 'yellow'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400',
              )}
            >
              {isBalanced
                ? 'Balanced'
                : `Max drift: ${maxDrift?.driftPct && maxDrift.driftPct > 0 ? '+' : ''}${maxDriftAbs.toFixed(1)}% (${maxDrift?.symbol})`}
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          Target: {result.targetTotal.toFixed(0)}%
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isBalanced
            ? 'Balanced'
            : `${rebalanceTrades.length} trade${rebalanceTrades.length === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
});
