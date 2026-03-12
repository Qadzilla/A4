import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useMemo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import { computePortfolio, getDriftColor } from '../../lib/portfolio-utils';
import type { PortfolioCardData } from '../../lib/portfolio-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const ALLOCATION_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

export const PortfolioCardContent = memo(function PortfolioCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as PortfolioCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: holdings, isLoading } = useQuery({
    ...trpc.holding.list.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const holdingList = holdings ?? [];
  const count = holdingList.length;

  const analysis = useMemo(() => computePortfolio(holdingList), [holdingList]);
  const sorted = useMemo(
    () => [...analysis.holdings].sort((a, b) => b.value - a.value),
    [analysis.holdings],
  );
  const topHoldings = sorted.slice(0, 3);
  const maxDrift = analysis.maxOverweight
    ? Math.max(
        Math.abs(analysis.maxOverweight.driftPct),
        Math.abs(analysis.maxUnderweight?.driftPct ?? 0),
      )
    : 0;
  const driftColor = getDriftColor(maxDrift);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Portfolio
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} holding${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : count === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No holdings added</p>
        ) : (
          <>
            {/* Stacked allocation bar */}
            <div className="h-3 w-full rounded-full overflow-hidden flex">
              {sorted.map((h, i) => (
                <div
                  key={h.id}
                  className="h-full transition-all"
                  style={{
                    width: `${h.actualPct}%`,
                    backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                  }}
                />
              ))}
            </div>

            {/* Top holdings */}
            <div className="flex flex-col gap-1">
              {topHoldings.map((h, i) => (
                <div key={h.id} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor:
                        ALLOCATION_COLORS[sorted.indexOf(h) % ALLOCATION_COLORS.length],
                    }}
                  />
                  <span className="text-[10px] font-mono font-semibold text-foreground shrink-0">
                    {h.symbol}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {h.actualPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-foreground ml-auto shrink-0">
                    {formatCurrency(h.value, currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total + drift badge */}
            <div className="mt-auto pt-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold font-mono tabular-nums text-foreground">
                {formatCurrency(analysis.totalValue, currency)}
              </span>
              <span
                className={cn(
                  'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                  driftColor === 'green' && 'bg-green-500/15 text-green-600 dark:text-green-400',
                  driftColor === 'yellow' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                  driftColor === 'red' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                )}
              >
                {analysis.isBalanced ? 'Balanced' : `${maxDrift.toFixed(1)}% drift`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
