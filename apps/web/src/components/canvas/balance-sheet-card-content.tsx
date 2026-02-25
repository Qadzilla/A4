import { cn } from '@a4/ui';
import { memo } from 'react';
import { computeBSTotals, formatAsOfDate, formatBSCurrency } from '../../lib/balance-sheet-utils';
import type { BSCardData } from '../../lib/balance-sheet-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const BalanceSheetCardContent = memo(function BalanceSheetCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as BSCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const asOfDate = data?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const sections = data?.sections ?? [];

  const totals = computeBSTotals(sections);
  const totalLineItems = sections.reduce((sum, s) => sum + s.lineItems.length, 0);

  const equityColor =
    totals.totalEquity >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Balance Sheet
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          As of {formatAsOfDate(asOfDate)}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Total Assets</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatBSCurrency(totals.totalAssets, currency)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">Net Worth / Equity</p>
          <p className={cn('text-[15px] font-semibold leading-tight', equityColor)}>
            {formatBSCurrency(totals.totalEquity, currency)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {totals.isBalanced ? (
            <>
              <span className="size-2 rounded-full bg-green-500" />
              <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                Balanced
              </span>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Unbalanced
              </span>
            </>
          )}
        </div>
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
