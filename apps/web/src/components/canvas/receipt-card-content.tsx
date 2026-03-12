import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { Receipt, ReceiptCardData } from '../../lib/receipt-utils';
import { computeReceiptTotals, getStatusColor } from '../../lib/receipt-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const STATUS_DOT_COLORS: Record<ReturnType<typeof getStatusColor>, string> = {
  amber: 'rgb(217 119 6)',
  blue: 'rgb(37 99 235)',
  green: 'rgb(22 163 74)',
};

export const ReceiptCardContent = memo(function ReceiptCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as ReceiptCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: receipts, isLoading } = useQuery({
    ...trpc.receipt.list.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const receiptList = (receipts ?? []) as Receipt[];
  const count = receiptList.length;
  const topReceipts = receiptList.slice(0, 3);
  const totals = computeReceiptTotals(receiptList);
  const pendingCount = receiptList.filter((r) => r.status === 'pending').length;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Receipts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} receipt${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : count === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No receipts added</p>
        ) : (
          <>
            {/* Top 3 recent receipts */}
            <div className="flex flex-col gap-1">
              {topReceipts.map((receipt) => (
                <div key={receipt.id} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_DOT_COLORS[getStatusColor(receipt.status)] }}
                  />
                  <span className="text-[10px] text-foreground truncate flex-1 min-w-0">
                    {receipt.merchant || 'Unknown'}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-foreground shrink-0">
                    {formatCurrency(receipt.amount, currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div className="mt-auto pt-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold font-mono tabular-nums text-foreground">
                {formatCurrency(totals.totalAmount, currency)}
              </span>
              {pendingCount > 0 ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  {pendingCount} pending
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  All reviewed
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
