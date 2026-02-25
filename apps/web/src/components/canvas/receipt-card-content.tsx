import { cn } from '@a4/ui';
import { memo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { computeReceiptTotals, getReceiptDateRange } from '../../lib/receipt-utils';
import type { ReceiptCardData } from '../../lib/receipt-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const ReceiptCardContent = memo(function ReceiptCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as ReceiptCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const receipts = data?.receipts ?? [];
  const categories = data?.categories ?? [];

  const { totalAmount, byStatus } = computeReceiptTotals(receipts);
  const dateRange = getReceiptDateRange(receipts);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Receipts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">{dateRange}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Total</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatCurrency(totalAmount, currency)}
          </p>
        </div>

        {/* Status counts */}
        <div className="flex items-center gap-3">
          {byStatus.pending > 0 && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              {byStatus.pending} pending
            </span>
          )}
          {byStatus.reviewed > 0 && (
            <span className="text-[11px] text-blue-600 dark:text-blue-400">
              {byStatus.reviewed} reviewed
            </span>
          )}
          {byStatus.reimbursed > 0 && (
            <span className="text-[11px] text-green-600 dark:text-green-400">
              {byStatus.reimbursed} reimbursed
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {receipts.length} receipt{receipts.length === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
        </span>
      </div>
    </div>
  );
});
