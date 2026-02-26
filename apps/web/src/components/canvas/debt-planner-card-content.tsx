import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { DebtPlannerCardData } from '../../lib/debt-planner-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const DebtPlannerCardContent = memo(function DebtPlannerCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as DebtPlannerCardData | undefined;
  const currency = data?.currency ?? 'USD';
  const strategy = data?.strategy ?? 'avalanche';

  const { data: summary, isLoading } = useQuery({
    ...trpc.debt.getSummary.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const totalBalance = summary?.totalBalance ?? 0;
  const count = summary?.count ?? 0;
  const highestAPR = summary?.highestAPR ?? 0;
  const totalMinPayment = summary?.totalMinPayment ?? 0;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Debt Planner
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} debt${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground">Total Debt</p>
            <p className="text-[20px] font-bold leading-tight text-red-600 dark:text-red-400">
              {formatCurrency(totalBalance, currency)}
            </p>

            {count > 0 ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Strategy: {strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}
                </p>
                {highestAPR > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Highest APR: {highestAPR.toFixed(1)}%
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">No debts added</p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {isLoading ? '...' : `$${compactFormatter.format(totalMinPayment)}/mo min`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} debt${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
});
