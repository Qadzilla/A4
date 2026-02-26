import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import {
  formatBudgetCurrency,
  formatBudgetPeriod,
  getBudgetHealthColor,
} from '../../lib/budget-utils';
import type { BudgetCardData } from '../../lib/budget-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const BudgetCardContent = memo(function BudgetCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as BudgetCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const period = data?.period ?? {
    type: 'monthly' as const,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };

  const { data: summary, isLoading } = useQuery({
    ...trpc.budget.getSummary.queryOptions({ workspaceId: workspaceId! }),
    staleTime: 60_000,
  });

  const totalBudgeted = summary?.totalBudgeted ?? 0;
  const totalActual = summary?.totalActual ?? 0;
  const remaining = summary?.remaining ?? 0;
  const percent = summary?.percent ?? 0;
  const count = summary?.count ?? 0;

  const health = getBudgetHealthColor(percent);
  const periodLabel = formatBudgetPeriod(period);

  const barColor =
    health === 'green' ? 'bg-green-500' : health === 'yellow' ? 'bg-amber-500' : 'bg-red-500';

  const barPercent = Math.min(percent, 100);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Budget
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{periodLabel}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
            <div className="h-2 w-full rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <>
            {/* Total budgeted */}
            <div>
              <p className="text-[10px] text-muted-foreground">Total Budgeted</p>
              <p className="text-[20px] font-bold text-foreground leading-tight">
                {formatBudgetCurrency(totalBudgeted, currency)}
              </p>
            </div>

            {/* Spent + percent */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Spent: {formatBudgetCurrency(totalActual, currency)}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  health === 'green' && 'text-green-600 dark:text-green-400',
                  health === 'yellow' && 'text-amber-600 dark:text-amber-400',
                  health === 'red' && 'text-red-600 dark:text-red-400',
                )}
              >
                ({Math.round(percent)}%)
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barColor)}
                style={{ width: `${barPercent}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} categor${count === 1 ? 'y' : 'ies'}`}
        </span>
        {!isLoading && (
          <span
            className={cn(
              'text-[10px] font-medium',
              remaining >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatBudgetCurrency(remaining, currency)} remaining
          </span>
        )}
      </div>
    </div>
  );
});
