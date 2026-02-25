import { cn } from '@a4/ui';
import { memo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import {
  computeLedgerTotals,
  computeNetBalance,
  getLedgerDateRange,
  getLedgerHealthColor,
} from '../../lib/ledger-utils';
import type { LedgerCardData } from '../../lib/ledger-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const LedgerCardContent = memo(function LedgerCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as LedgerCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const startingBalance = data?.startingBalance ?? 0;
  const entries = data?.entries ?? [];

  const { totalIncome, totalExpenses } = computeLedgerTotals(entries);
  const netBalance = computeNetBalance(startingBalance, entries);
  const health = getLedgerHealthColor(netBalance);
  const dateRange = getLedgerDateRange(entries);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Ledger
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{dateRange}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Net Balance</p>
          <p
            className={cn(
              'text-[20px] font-bold leading-tight',
              health === 'green'
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatCurrency(netBalance, currency)}
          </p>
        </div>

        {/* Income / Expense row */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-green-600 dark:text-green-400">
            +{formatCurrency(totalIncome, currency)}
          </span>
          <span className="text-[11px] text-red-600 dark:text-red-400">
            -{formatCurrency(totalExpenses, currency)}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Starting: {formatCurrency(startingBalance, currency)}
        </span>
      </div>
    </div>
  );
});
