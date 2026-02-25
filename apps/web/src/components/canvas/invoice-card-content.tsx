import { cn } from '@a4/ui';
import { memo } from 'react';
import { computeSubtotal, computeTax, computeTotal, formatCurrency } from '../../lib/invoice-utils';
import type { InvoiceCardData, InvoiceStatus } from '../../lib/invoice-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export const InvoiceCardContent = memo(function InvoiceCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as InvoiceCardData | undefined;
  const status: InvoiceStatus = data?.status ?? 'draft';
  const invoiceNumber = data?.invoiceNumber ?? 'INV-001';
  const clientName = data?.to?.name || 'No client';
  const lineItemCount = data?.items?.length ?? 0;
  const dueDate = data?.dueDate ?? '';

  const subtotal = computeSubtotal(data?.items ?? []);
  const tax = computeTax(subtotal, data?.taxRate ?? 0);
  const total = computeTotal(subtotal, tax);

  const isOverdue =
    status === 'overdue' || (status !== 'paid' && dueDate && new Date(dueDate) < new Date());

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span
          className={cn(
            'text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full',
            statusColors[status],
          )}
        >
          {status}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">{invoiceNumber}</span>
      </div>

      {/* Invoice label */}
      <div className="px-3 pb-1">
        <span className="text-[11px] font-bold text-foreground tracking-wide">INVOICE</span>
      </div>

      {/* Client */}
      <div className="px-3 pb-1">
        <span className="text-[10px] text-muted-foreground">Bill To:</span>
        <p className="text-[11px] text-foreground font-medium truncate">{clientName}</p>
      </div>

      {/* Line items count */}
      <div className="px-3 pb-1">
        <span className="text-[10px] text-muted-foreground">
          {lineItemCount} {lineItemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Total */}
      <div className="flex-1 flex items-end px-3 pb-2">
        <div className="w-full">
          <p className="text-[18px] font-bold text-foreground tabular-nums">
            {formatCurrency(total)}
          </p>
          {dueDate && (
            <p
              className={cn(
                'text-[10px]',
                isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground',
              )}
            >
              Due {dueDate}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
