import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { ReceiptCardData } from '../../lib/receipt-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const ReceiptCardContent = memo(function ReceiptCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as ReceiptCardData | undefined;

  const currency = data?.currency ?? 'USD';

  const { data: summary, isLoading } = useQuery({
    ...trpc.receipt.getSummary.queryOptions({ workspaceId: workspaceId! }),
    staleTime: 60_000,
  });

  const totalAmount = summary?.totalAmount ?? 0;
  const count = summary?.count ?? 0;
  const byStatus = summary?.byStatus ?? { pending: 0, reviewed: 0, reimbursed: 0 };

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Receipts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} receipt${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} receipt${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
});
