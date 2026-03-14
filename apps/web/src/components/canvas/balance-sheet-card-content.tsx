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
  const assetCount = sections
    .filter((s) => s.id === 'current-assets' || s.id === 'non-current-assets')
    .reduce((sum, s) => sum + s.lineItems.length, 0);
  const liabCount = sections
    .filter((s) => s.id === 'current-liabilities' || s.id === 'non-current-liabilities')
    .reduce((sum, s) => sum + s.lineItems.length, 0);

  const equityPositive = totals.totalEquity >= 0;

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Balance Sheet
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {formatAsOfDate(asOfDate)}
        </span>
      </div>

      {/* Accounting equation blocks */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {/* Assets */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 border-l-[3px] border-blue-500/70">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground">Assets</span>
            {assetCount > 0 && (
              <span className="text-[9px] text-muted-foreground/60 ml-1">({assetCount})</span>
            )}
          </div>
          <span className="text-[13px] font-mono tabular-nums font-semibold text-foreground">
            {formatBSCurrency(totals.totalAssets, currency)}
          </span>
        </div>

        {/* Liabilities */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 border-l-[3px] border-red-500/70">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground">Liabilities</span>
            {liabCount > 0 && (
              <span className="text-[9px] text-muted-foreground/60 ml-1">({liabCount})</span>
            )}
          </div>
          <span className="text-[13px] font-mono tabular-nums font-semibold text-foreground">
            {formatBSCurrency(totals.totalLiabilities, currency)}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40 my-0.5" />

        {/* Equity */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">Equity</span>
            {totals.isBalanced ? (
              <svg className="size-3 text-green-500" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="size-3 text-amber-500" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l6.5 12H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 7v2.5M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <span
            className={cn(
              'text-[15px] font-mono tabular-nums font-bold',
              equityPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatBSCurrency(totals.totalEquity, currency)}
          </span>
        </div>
      </div>
    </div>
  );
});
