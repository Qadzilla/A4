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

  const totalLineItems = sections.reduce((sum, s) => sum + s.lineItems.length, 0);

  const revenueColor =
    totals.annualNetRevenue >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  const incomeColor =
    totals.annualNetIncome >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  const marginColor =
    totals.netMarginPct >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          P&L Statement
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{fyLabel}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Net Revenue</p>
          <p className={cn('text-[20px] font-bold leading-tight', revenueColor)}>
            {formatPLCurrency(totals.annualNetRevenue, currency)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">Net Income</p>
          <p className={cn('text-[15px] font-semibold leading-tight', incomeColor)}>
            {formatPLCurrency(totals.annualNetIncome, currency)}
          </p>
        </div>

        <p className={cn('text-[11px] font-medium', marginColor)}>
          Net Margin: {formatMarginPct(totals.netMarginPct)}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {totalLineItems} line item{totalLineItems === 1 ? '' : 's'} · {sections.length} section
          {sections.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
});
