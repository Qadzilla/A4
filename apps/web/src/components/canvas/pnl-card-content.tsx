import { cn } from '@a4/ui';
import { memo } from 'react';
import {
  computePLTotals,
  formatMarginPct,
  formatPLCurrency,
  getFiscalYearLabel,
} from '../../lib/pnl-utils';
import type { PLCardData } from '../../lib/pnl-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const PnlCardContent = memo(function PnlCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as PLCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const year = data?.fiscalYearStart ?? new Date().getFullYear();
  const monthStart = data?.fiscalMonthStart ?? 1;
  const sections = data?.sections ?? [];

  const totals = computePLTotals(sections);
  const fyLabel = getFiscalYearLabel(year, monthStart);

  const incomePositive = totals.annualNetIncome >= 0;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          P&L
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{fyLabel}</span>
      </div>

      {/* Waterfall rows */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {/* Revenue */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 border-l-[3px] border-green-500/70">
          <span className="text-[10px] text-muted-foreground flex-1">Revenue</span>
          <span className="text-[13px] font-mono tabular-nums font-semibold text-foreground">
            {formatPLCurrency(totals.annualNetRevenue, currency)}
          </span>
        </div>

        {/* Expenses */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 border-l-[3px] border-red-500/70">
          <span className="text-[10px] text-muted-foreground flex-1">Expenses</span>
          <span className="text-[13px] font-mono tabular-nums font-semibold text-foreground">
            {formatPLCurrency(totals.annualOpex + (totals.annualNetRevenue - totals.annualGrossProfit), currency)}
          </span>
        </div>

        {/* Separator */}
        <div className="border-t border-border/40 my-0.5" />

        {/* Net Income */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5',
            incomePositive ? 'bg-green-500/5' : 'bg-red-500/5',
          )}
        >
          <span className="text-[10px] font-medium text-muted-foreground flex-1">Net Income</span>
          <span
            className={cn(
              'text-[15px] font-mono tabular-nums font-bold',
              incomePositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatPLCurrency(totals.annualNetIncome, currency)}
          </span>
        </div>
      </div>

      {/* Net margin badge */}
      <div className="flex justify-end px-3 pb-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-mono tabular-nums font-medium',
            totals.netMarginPct >= 0
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400',
          )}
        >
          {formatMarginPct(totals.netMarginPct)} margin
        </span>
      </div>
    </div>
  );
});
