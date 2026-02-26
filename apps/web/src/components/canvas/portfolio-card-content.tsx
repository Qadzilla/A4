import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import { getDriftColor } from '../../lib/portfolio-utils';
import type { PortfolioCardData } from '../../lib/portfolio-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const PortfolioCardContent = memo(function PortfolioCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as PortfolioCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: summary, isLoading } = useQuery({
    ...trpc.holding.getSummary.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const totalValue = summary?.totalValue ?? 0;
  const holdingCount = summary?.holdingCount ?? 0;
  const isBalanced = summary?.isBalanced ?? true;
  const maxDrift = summary?.maxDrift ?? 0;
  const driftColor = getDriftColor(maxDrift);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Portfolio
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${holdingCount} holding${holdingCount === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : holdingCount === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-2">No holdings added</p>
        ) : (
          <>
            <p className="text-[20px] font-bold leading-tight text-foreground">
              {formatCurrency(totalValue, currency)}
            </p>

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
              {isBalanced ? 'Balanced' : `Max drift: ${maxDrift.toFixed(1)}%`}
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${holdingCount} holding${holdingCount === 1 ? '' : 's'}`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isBalanced ? 'Balanced' : 'Rebalance needed'}
        </span>
      </div>
    </div>
  );
});
