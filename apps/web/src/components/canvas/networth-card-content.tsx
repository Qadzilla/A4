import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import { getNetWorthHealthColor } from '../../lib/networth-utils';
import type { NetWorthCardData } from '../../lib/networth-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const NetWorthCardContent = memo(function NetWorthCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as NetWorthCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: summary, isLoading } = useQuery({
    ...trpc.networth.getSummary.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const totalAssets = summary?.totalAssets ?? 0;
  const totalLiabilities = summary?.totalLiabilities ?? 0;
  const netWorth = summary?.netWorth ?? 0;
  const entryCount = summary?.entryCount ?? 0;
  const healthColor = getNetWorthHealthColor(netWorth);

  const total = totalAssets + totalLiabilities;
  const assetPct = total > 0 ? (totalAssets / total) * 100 : 50;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Net Worth
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-7 w-32 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
          </div>
        ) : entryCount === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No entries yet</p>
        ) : (
          <>
            {/* Large net worth number */}
            <p
              className={cn(
                'text-[22px] font-bold font-mono tabular-nums leading-tight',
                healthColor === 'green'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {formatCurrency(netWorth, currency)}
            </p>

            {/* Thick ratio bar */}
            <div className="h-3 w-full rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 dark:bg-green-400 transition-all"
                style={{ width: `${assetPct}%` }}
              />
              <div
                className="h-full bg-red-500 dark:bg-red-400 transition-all"
                style={{ width: `${100 - assetPct}%` }}
              />
            </div>

            {/* Assets / Liabilities below bar */}
            <div className="flex justify-between">
              <span className="text-[10px] font-mono tabular-nums text-green-600 dark:text-green-400">
                {formatCurrency(totalAssets, currency)} ({Math.round(assetPct)}%)
              </span>
              <span className="text-[10px] font-mono tabular-nums text-red-600 dark:text-red-400">
                {formatCurrency(totalLiabilities, currency)} ({Math.round(100 - assetPct)}%)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
