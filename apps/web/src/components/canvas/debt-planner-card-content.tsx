import { cn } from '@a4/ui';
import { memo, useMemo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { simulateDebtPaydown } from '../../lib/debt-planner-utils';
import type { DebtPlannerCardData } from '../../lib/debt-planner-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const DebtPlannerCardContent = memo(function DebtPlannerCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as DebtPlannerCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const strategy = data?.strategy ?? 'avalanche';
  const extraMonthlyBudget = data?.extraMonthlyBudget ?? 0;
  const debts = data?.debts ?? [];

  const startDate = data?.startDate ?? '2026-01';
  const notes = data?.notes ?? '';

  const result = useMemo(
    () =>
      simulateDebtPaydown({
        currency,
        strategy,
        extraMonthlyBudget,
        startDate,
        debts,
        notes,
      }),
    [currency, strategy, extraMonthlyBudget, startDate, debts, notes],
  );

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const totalMinPayments = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const totalMonthly = totalMinPayments + extraMonthlyBudget;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Debt Planner
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {debts.length} debt{debts.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        <p className="text-[10px] text-muted-foreground">Total Debt</p>
        <p className="text-[20px] font-bold leading-tight text-red-600 dark:text-red-400">
          {formatCurrency(totalDebt, currency)}
        </p>

        {debts.length > 0 ? (
          <>
            <p className="text-[13px] text-muted-foreground">
              Debt-free in {result.totalMonths} month{result.totalMonths === 1 ? '' : 's'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Strategy: {strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}
            </p>
            {result.interestSaved > 0 && (
              <p className="text-[11px] font-medium text-green-600 dark:text-green-400">
                Saves {formatCurrency(result.interestSaved, currency)} vs minimum
              </p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">No debts added</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ${compactFormatter.format(totalMonthly)}/mo total
        </span>
        {extraMonthlyBudget > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ${compactFormatter.format(extraMonthlyBudget)} extra
          </span>
        )}
      </div>
    </div>
  );
});
