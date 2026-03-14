import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useMemo } from 'react';
import { useParams } from 'react-router';
import {
  computeCategoryPercent,
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

  const { data: categories, isLoading: loadingCats } = useQuery({
    ...trpc.budget.listCategories.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const { data: groups, isLoading: loadingGroups } = useQuery({
    ...trpc.budget.listGroups.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const isLoading = loadingCats || loadingGroups;
  const catList = categories ?? [];
  const groupMap = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);

  const sorted = useMemo(() => [...catList].sort((a, b) => b.actual - a.actual), [catList]);
  const topCategories = sorted.slice(0, 3);

  const totalBudgeted = catList.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = catList.reduce((s, c) => s + c.actual, 0);
  const percent = computeCategoryPercent(totalBudgeted, totalActual);
  const remaining = totalBudgeted - totalActual;
  const health = getBudgetHealthColor(percent);
  const periodLabel = formatBudgetPeriod(period);

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Budget
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{periodLabel}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-1.5 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-1.5 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
            <div className="h-1.5 w-3/4 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : catList.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No categories yet</p>
        ) : (
          <>
            {/* Top 3 categories with progress bars */}
            <div className="flex flex-col gap-1.5">
              {topCategories.map((cat) => {
                const catPct = computeCategoryPercent(cat.budgeted, cat.actual);
                const catHealth = getBudgetHealthColor(catPct);
                const barPct = Math.min(catPct, 100);
                const group = cat.groupId ? groupMap.get(cat.groupId) : null;

                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-1 min-w-0">
                      {/* Group color dot */}
                      <span
                        className="shrink-0 rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: group?.color ?? '#94a3b8',
                        }}
                      />
                      <span className="text-[10px] text-foreground truncate flex-1 min-w-0">
                        {cat.name}
                      </span>
                      <span className="text-[9px] font-mono tabular-nums text-muted-foreground shrink-0">
                        {formatBudgetCurrency(cat.actual, currency)} /{' '}
                        {formatBudgetCurrency(cat.budgeted, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden mt-0.5">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          catHealth === 'green' && 'bg-green-500',
                          catHealth === 'yellow' && 'bg-amber-500',
                          catHealth === 'red' && 'bg-red-500',
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overall spent pill + remaining */}
            <div className="mt-auto pt-1 flex items-center justify-between">
              <span
                className={cn(
                  'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                  health === 'green' && 'bg-green-500/15 text-green-600 dark:text-green-400',
                  health === 'yellow' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                  health === 'red' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                )}
              >
                {Math.round(percent)}% spent
              </span>
              <span
                className={cn(
                  'text-[10px] font-mono tabular-nums',
                  remaining >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatBudgetCurrency(remaining, currency)} left
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
