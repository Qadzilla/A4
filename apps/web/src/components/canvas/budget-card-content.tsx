import { cn } from '@a4/ui';
import { memo } from 'react';
import {
  computeBudgetTotals,
  formatBudgetCurrency,
  formatBudgetPeriod,
  getBudgetHealthColor,
} from '../../lib/budget-utils';
import type { BudgetCardData } from '../../lib/budget-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

export const BudgetCardContent = memo(function BudgetCardContent({ item }: { item: CanvasItem }) {
  const items = useCanvasStore((s) => s.items);
  const data = item.data as BudgetCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const period = data?.period ?? {
    type: 'monthly' as const,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };
  const categories = data?.categories ?? [];
  const groups = data?.groups ?? [];

  const { totalBudgeted, totalActual, remaining, percent } = computeBudgetTotals(categories, items);
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
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} · {groups.length} group
          {groups.length === 1 ? '' : 's'}
        </span>
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
      </div>
    </div>
  );
});
