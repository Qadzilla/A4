import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useRef, useState } from 'react';
import {
  computeSubtotal,
  computeTax,
  computeTotal,
  exportInvoicePdf,
  formatCurrency,
} from '../../lib/invoice-utils';
import type { InvoiceCardData, InvoiceStatus } from '../../lib/invoice-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const statuses: { value: InvoiceStatus; label: string; color: string }[] = [
  {
    value: 'draft',
    label: 'Draft',
    color:
      'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600',
  },
  {
    value: 'sent',
    label: 'Sent',
    color:
      'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  },
  {
    value: 'paid',
    label: 'Paid',
    color:
      'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300 dark:border-green-700',
  },
  {
    value: 'overdue',
    label: 'Overdue',
    color:
      'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300 dark:border-red-700',
  },
];

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

export const InvoiceCardView = memo(
  function InvoiceCardView({
    item,
    workspaceId,
  }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const cardData = item.data as InvoiceCardData | undefined;
    const invoiceId = cardData?.invoiceId || '';

    const [isExporting, setIsExporting] = useState(false);
    const creatingRef = useRef(false);

    // ── Create invoice in DB if not yet created ──
    const createInvoice = useMutation(
      trpc.invoice.create.mutationOptions({
        onSuccess: (result) => {
          updateItemData(item.id, { invoiceId: result.id } as unknown as Record<string, unknown>);
          queryClient.invalidateQueries({ queryKey: trpc.invoice.get.queryKey() });
          queryClient.invalidateQueries({ queryKey: trpc.invoice.listLineItems.queryKey() });
          queryClient.invalidateQueries({ queryKey: trpc.invoice.getSummary.queryKey() });
        },
      }),
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: one-time creation
    useEffect(() => {
      if (!invoiceId && !creatingRef.current) {
        creatingRef.current = true;
        const today = new Date();
        const due = new Date();
        due.setDate(due.getDate() + 30);
        createInvoice.mutate({
          workspaceId,
          invoiceNumber: 'INV-001',
          date: today.toISOString().slice(0, 10),
          dueDate: due.toISOString().slice(0, 10),
          taxRate: 0,
          status: 'draft',
        });
      }
    }, [invoiceId]);

    // ── Fetch invoice data ──
    const { data: invoice, isLoading: invLoading } = useQuery({
      ...trpc.invoice.get.queryOptions({ id: invoiceId }),
      enabled: !!invoiceId,
    });
    const { data: lineItems = [], isLoading: liLoading } = useQuery({
      ...trpc.invoice.listLineItems.queryOptions({ invoiceId }),
      enabled: !!invoiceId,
    });

    const isLoading = !invoiceId || invLoading || liLoading;

    // ── Mutations ──
    const invQueryKey = trpc.invoice.get.queryKey();
    const liQueryKey = trpc.invoice.listLineItems.queryKey();
    const summaryQueryKey = trpc.invoice.getSummary.queryKey();

    const invalidateInvoice = () => {
      queryClient.invalidateQueries({ queryKey: invQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };
    const invalidateLineItems = () => {
      queryClient.invalidateQueries({ queryKey: liQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const updateInvoice = useMutation(
      trpc.invoice.update.mutationOptions({ onSuccess: invalidateInvoice }),
    );
    const createLineItem = useMutation(
      trpc.invoice.createLineItem.mutationOptions({ onSuccess: invalidateLineItems }),
    );
    const updateLineItem = useMutation(
      trpc.invoice.updateLineItem.mutationOptions({ onSuccess: invalidateLineItems }),
    );
    const deleteLineItem = useMutation(
      trpc.invoice.deleteLineItem.mutationOptions({ onSuccess: invalidateLineItems }),
    );

    // ── Handlers ──
    const handleFieldBlur = (field: string, value: string | number | null) => {
      if (!invoiceId || !invoice) return;
      const current = invoice[field as keyof typeof invoice];
      if (current === value) return;
      updateInvoice.mutate({ id: invoiceId, data: { [field]: value } });
    };

    const handleStatusChange = (status: InvoiceStatus) => {
      if (!invoiceId) return;
      updateInvoice.mutate({ id: invoiceId, data: { status } });
    };

    const handleLineItemBlur = (id: string, field: string, value: string | number) => {
      const existing = lineItems.find((li) => li.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateLineItem.mutate({ id, data: { [field]: value } });
    };

    const addLineItem = () => {
      if (!invoiceId) return;
      createLineItem.mutate({
        invoiceId,
        description: '',
        quantity: 1,
        unitPrice: 0,
        sortOrder: lineItems.length,
      });
    };

    const removeLineItem = (id: string) => {
      deleteLineItem.mutate({ id });
    };

    const handleExport = async () => {
      if (!invoice) return;
      setIsExporting(true);
      try {
        await exportInvoicePdf(
          {
            invoiceNumber: invoice.invoiceNumber,
            date: invoice.date,
            dueDate: invoice.dueDate,
            from: {
              name: invoice.fromName ?? '',
              address: invoice.fromAddress ?? '',
              email: invoice.fromEmail ?? '',
            },
            to: {
              name: invoice.toName ?? '',
              address: invoice.toAddress ?? '',
              email: invoice.toEmail ?? '',
            },
            items: lineItems.map((li) => ({
              id: li.id,
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
            })),
            taxRate: invoice.taxRate,
            notes: invoice.notes ?? '',
            status: invoice.status as InvoiceStatus,
          },
          item.name,
        );
      } finally {
        setIsExporting(false);
      }
    };

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading invoice...</p>
          </div>
        </div>
      );
    }

    if (!invoice) return null;

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

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-primary"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Invoice</p>
            </div>
          </div>

          {/* Status pills */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Status
            </label>
            <div className="flex items-center gap-2">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleStatusChange(s.value)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[12px] font-medium border transition-all',
                    s.color,
                    invoice.status === s.value
                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                      : 'opacity-60 hover:opacity-100',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Invoice #, Date, Due Date */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Invoice #
              </label>
              <input
                type="text"
                defaultValue={invoice.invoiceNumber}
                onBlur={(e) => handleFieldBlur('invoiceNumber', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Date
              </label>
              <input
                type="date"
                defaultValue={invoice.date}
                onBlur={(e) => handleFieldBlur('date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Due Date
              </label>
              <input
                type="date"
                defaultValue={invoice.dueDate}
                onBlur={(e) => handleFieldBlur('dueDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
                From
              </p>
              <input
                type="text"
                placeholder="Name"
                defaultValue={invoice.fromName ?? ''}
                onBlur={(e) => handleFieldBlur('fromName', e.target.value || null)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Address"
                defaultValue={invoice.fromAddress ?? ''}
                onBlur={(e) => handleFieldBlur('fromAddress', e.target.value || null)}
                className={inputClass}
              />
              <input
                type="email"
                placeholder="Email"
                defaultValue={invoice.fromEmail ?? ''}
                onBlur={(e) => handleFieldBlur('fromEmail', e.target.value || null)}
                className={inputClass}
              />
            </div>
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
                Bill To
              </p>
              <input
                type="text"
                placeholder="Name"
                defaultValue={invoice.toName ?? ''}
                onBlur={(e) => handleFieldBlur('toName', e.target.value || null)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Address"
                defaultValue={invoice.toAddress ?? ''}
                onBlur={(e) => handleFieldBlur('toAddress', e.target.value || null)}
                className={inputClass}
              />
              <input
                type="email"
                placeholder="Email"
                defaultValue={invoice.toEmail ?? ''}
                onBlur={(e) => handleFieldBlur('toEmail', e.target.value || null)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Line Items
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amount</span>
                <span />
              </div>

              {lineItems.map((li) => {
                const amount = li.quantity * li.unitPrice;
                return (
                  <div
                    key={li.id}
                    className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                  >
                    <input
                      type="text"
                      defaultValue={li.description}
                      onBlur={(e) => handleLineItemBlur(li.id, 'description', e.target.value)}
                      placeholder="Item description"
                      className="rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-border hover:bg-muted/30 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      min={0}
                      defaultValue={li.quantity}
                      onBlur={(e) =>
                        handleLineItemBlur(li.id, 'quantity', Number(e.target.value) || 0)
                      }
                      className="rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] text-right text-black dark:text-zinc-100 tabular-nums hover:border-border hover:bg-muted/30 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={li.unitPrice}
                      onBlur={(e) =>
                        handleLineItemBlur(li.id, 'unitPrice', Number(e.target.value) || 0)
                      }
                      className="rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] text-right text-black dark:text-zinc-100 tabular-nums hover:border-border hover:bg-muted/30 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <span className="text-[13px] text-right text-black/70 dark:text-zinc-300 tabular-nums">
                      {formatCurrency(amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      disabled={lineItems.length <= 1}
                      className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add item
            </button>
          </div>

          {/* Tax + Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-black/70 dark:text-zinc-300">Subtotal</span>
                <span className="text-[13px] font-medium text-black dark:text-zinc-100 tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-black/70 dark:text-zinc-300">Tax</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    defaultValue={invoice.taxRate}
                    onBlur={(e) =>
                      handleFieldBlur('taxRate', Number(e.target.value) || 0)
                    }
                    className="w-16 rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-[12px] text-right text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50"
                  />
                  <span className="text-[12px] text-black/60 dark:text-zinc-400">%</span>
                </div>
                <span className="text-[13px] text-black/70 dark:text-zinc-300 tabular-nums">
                  {formatCurrency(tax)}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-black dark:text-zinc-100">
                  Total
                </span>
                <span className="text-[16px] font-bold text-black dark:text-zinc-100 tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Notes
            </label>
            <textarea
              defaultValue={invoice.notes ?? ''}
              onBlur={(e) => handleFieldBlur('notes', e.target.value || null)}
              placeholder="Payment terms, bank details, thank you note..."
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {/* Export PDF */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.data === next.item.data &&
    prev.workspaceId === next.workspaceId,
);
