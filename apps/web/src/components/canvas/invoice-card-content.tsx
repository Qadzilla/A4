import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import {
  computeSubtotal,
  computeTax,
  computeTotal,
  formatCurrency,
} from '../../lib/invoice-utils';
import type { InvoiceCardData, InvoiceStatus } from '../../lib/invoice-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export const InvoiceCardContent = memo(function InvoiceCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const cardData = item.data as InvoiceCardData | undefined;
  const invoiceId = cardData?.invoiceId || '';

  const { data: invoice, isLoading: invLoading } = useQuery({
    ...trpc.invoice.get.queryOptions({ id: invoiceId }),
    enabled: !!invoiceId,
    staleTime: 60_000,
  });
  const { data: lineItems = [], isLoading: liLoading } = useQuery({
    ...trpc.invoice.listLineItems.queryOptions({ invoiceId }),
    enabled: !!invoiceId,
    staleTime: 60_000,
  });

  const isLoading = !invoiceId || invLoading || liLoading;

  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col bg-card overflow-hidden shadow-md">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div className="h-3 w-12 rounded bg-muted/40 animate-pulse" />
          <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
        </div>
        <div className="flex-1 flex items-end px-3 pb-2">
          <div className="h-6 w-24 rounded bg-muted/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const status = invoice.status as InvoiceStatus;
  const clientName = invoice.toName || 'No client';
  const dueDate = invoice.dueDate;

  const subtotal = computeSubtotal(
    lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
  );
  const tax = computeTax(subtotal, invoice.taxRate);
  const total = computeTotal(subtotal, tax);

  const isOverdue =
    status === 'overdue' || (status !== 'paid' && dueDate && new Date(dueDate) < new Date());

  return (
    <div className="flex h-full w-full flex-col bg-card overflow-hidden shadow-md">
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
        <span className="text-[10px] text-muted-foreground font-mono">
          {invoice.invoiceNumber}
        </span>
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
          {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}
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
