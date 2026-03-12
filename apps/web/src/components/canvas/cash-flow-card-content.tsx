import { cn } from '@a4/ui';
import { memo } from 'react';
import { computeCFTotals, formatCFCurrency, getFiscalYearLabel } from '../../lib/cash-flow-utils';
import type { CFCardData } from '../../lib/cash-flow-utils';
import type { CanvasItem } from '../../stores/canvas-store';

function ArrowIcon({ direction, className }: { direction: 'up' | 'down'; className?: string }) {
  return (
    <svg className={cn('size-3.5 shrink-0', className)} viewBox="0 0 16 16" fill="none">
      {direction === 'up' ? (
        <path d="M8 13V3m0 0L4 7m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M8 3v10m0 0l4-4m-4 4L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export const CashFlowCardContent = memo(function CashFlowCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as CFCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const year = data?.fiscalYearStart ?? new Date().getFullYear();
  const monthStart = data?.fiscalMonthStart ?? 1;
  const beginningCash = data?.beginningCash ?? 0;
  const sections = data?.sections ?? [];

  const totals = computeCFTotals(beginningCash, sections);
  const fyLabel = getFiscalYearLabel(year, monthStart);

  const netPositive = totals.annualNetCashFlow >= 0;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Cash Flow
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{fyLabel}</span>
      </div>

      {/* Flow rows */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        {/* Operating */}
        <div className="flex items-center gap-1.5 px-1 py-1">
          <ArrowIcon
            direction={totals.annualOperatingCF >= 0 ? 'up' : 'down'}
            className={totals.annualOperatingCF >= 0 ? 'text-green-500' : 'text-red-500'}
          />
          <span className="text-[10px] text-muted-foreground flex-1">Operating</span>
          <span className="text-[12px] font-mono tabular-nums font-medium text-foreground">
            {formatCFCurrency(totals.annualOperatingCF, currency)}
          </span>
        </div>

        {/* Investing */}
        <div className="flex items-center gap-1.5 px-1 py-1">
          <ArrowIcon
            direction={totals.annualInvestingCF >= 0 ? 'up' : 'down'}
            className={totals.annualInvestingCF >= 0 ? 'text-green-500' : 'text-red-500'}
          />
          <span className="text-[10px] text-muted-foreground flex-1">Investing</span>
          <span className="text-[12px] font-mono tabular-nums font-medium text-foreground">
            {formatCFCurrency(totals.annualInvestingCF, currency)}
          </span>
        </div>

        {/* Financing */}
        <div className="flex items-center gap-1.5 px-1 py-1">
          <ArrowIcon
            direction={totals.annualFinancingCF >= 0 ? 'up' : 'down'}
            className={totals.annualFinancingCF >= 0 ? 'text-green-500' : 'text-red-500'}
          />
          <span className="text-[10px] text-muted-foreground flex-1">Financing</span>
          <span className="text-[12px] font-mono tabular-nums font-medium text-foreground">
            {formatCFCurrency(totals.annualFinancingCF, currency)}
          </span>
        </div>

        {/* Separator */}
        <div className="border-t border-border/40 my-0.5" />

        {/* Net Change */}
        <div className="flex items-center gap-1.5 px-1 py-1">
          <span className="text-[10px] font-medium text-muted-foreground flex-1">Net Change</span>
          <span
            className={cn(
              'text-[16px] font-mono tabular-nums font-bold',
              netPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatCFCurrency(totals.annualNetCashFlow, currency)}
          </span>
        </div>

        {/* Ending cash */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[9px] text-muted-foreground/70 flex-1">Ending Cash</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {formatCFCurrency(totals.finalEndingCash, currency)}
          </span>
        </div>
      </div>
    </div>
  );
});
