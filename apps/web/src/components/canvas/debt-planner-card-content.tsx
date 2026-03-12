import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { DebtPlannerCardData } from '../../lib/debt-planner-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

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
  const totalMinPayment = summary?.totalMinPayment ?? 0;

  // Build mini debt bars from summary (we only have aggregate data)
  // Show total as single bar
  const hasDebts = count > 0;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header with strategy pill */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Debt Planner
        </span>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
          {strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : hasDebts ? (
          <>
            {/* Total debt large */}
            <div>
              <span className="text-[10px] text-muted-foreground">Total Debt</span>
              <p className="text-[20px] font-mono tabular-nums font-bold text-red-600 dark:text-red-400 leading-tight">
                {formatCurrency(totalBalance, currency)}
              </p>
            </div>

            {/* Debt bar stack visualization */}
            <div className="space-y-1">
              {/* Show proportional bars for debt count */}
              {Array.from({ length: Math.min(count, 3) }, (_, i) => {
                const width = 100 - i * 20;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="h-2.5 bg-red-500/50 rounded-sm"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                );
              })}
              {count > 3 && (
                <span className="text-[9px] text-muted-foreground/60">
                  +{count - 3} more
                </span>
              )}
            </div>

            {/* Min payment */}
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-muted-foreground">Min Payment</span>
              <span className="text-[12px] font-mono tabular-nums font-medium text-foreground">
                {formatCurrency(totalMinPayment, currency)}/mo
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[12px] text-muted-foreground">No debts added</span>
          </div>
        )}
      </div>
    </div>
  );
});
