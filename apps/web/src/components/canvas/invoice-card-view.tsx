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
      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700',
  },
  {
    value: 'sent',
    label: 'Sent',
    color:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  },
  {
    value: 'paid',
    label: 'Paid',
    color:
      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800',
  },
  {
    value: 'overdue',
    label: 'Overdue',
    color:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  },
];

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

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
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-4 sm:px-8">
        <div className="w-full max-w-2xl space-y-8 bg-card border border-border/60 shadow-sm rounded-xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/5 border border-primary/10">
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
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Invoice</p>
            </div>
          </div>

          {/* Status pills */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
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
                      ? 'ring-2 ring-primary/20 border-primary/30 bg-primary/5 shadow-sm'
                      : 'opacity-60 hover:opacity-100',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Invoice #, Date, Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Invoice #
              </label>
              <input
                type="text"
                defaultValue={invoice.invoiceNumber}
                onBlur={(e) => handleFieldBlur('invoiceNumber', e.target.value)}
                className={cn(inputClass, 'font-mono text-[12px]')}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
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
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                From
              </p>
              <div className="space-y-2">
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
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Bill To
              </p>
              <div className="space-y-2">
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
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Line Items
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              <div className="hidden sm:grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                    className="group grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                  >
                    <input
                      type="text"
                      defaultValue={li.description}
                      onBlur={(e) => handleLineItemBlur(li.id, 'description', e.target.value)}
                      placeholder="Item description"
                      className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      min={0}
                      defaultValue={li.quantity}
                      onBlur={(e) =>
                        handleLineItemBlur(li.id, 'quantity', Number(e.target.value) || 0)
                      }
                      className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={li.unitPrice}
                      onBlur={(e) =>
                        handleLineItemBlur(li.id, 'unitPrice', Number(e.target.value) || 0)
                      }
                      className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-[13px] text-left sm:text-right text-muted-foreground font-mono tabular-nums py-1 pr-1">
                      {formatCurrency(amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      disabled={lineItems.length <= 1}
                      className="hidden sm:flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
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
              className="flex items-center gap-1.5 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors mt-2 px-1"
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
          <div className="flex sm:justify-end pt-4">
            <div className="w-full sm:w-64 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] font-medium text-muted-foreground">Subtotal</span>
                <span className="text-[13px] font-medium text-foreground font-mono tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground">Tax</span>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      defaultValue={invoice.taxRate}
                      onBlur={(e) =>
                        handleFieldBlur('taxRate', Number(e.target.value) || 0)
                      }
                      className="w-16 rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-[12px] text-right text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
                <span className="text-[13px] text-muted-foreground font-mono tabular-nums">
                  {formatCurrency(tax)}
                </span>
              </div>
              <div className="border-t border-border/60 pt-3 flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-foreground tracking-wide uppercase">
                  Total
                </span>
                <span className="text-[16px] font-semibold text-foreground font-mono tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              defaultValue={invoice.notes ?? ''}
              onBlur={(e) => handleFieldBlur('notes', e.target.value || null)}
              placeholder="Payment terms, bank details, thank you note..."
              rows={3}
              className={cn(inputClass, 'resize-none py-2')}
            />
          </div>

          {/* Export PDF */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 w-full sm:w-auto shadow-sm active:scale-[0.98]"
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
      </div>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.data === next.item.data &&
    prev.workspaceId === next.workspaceId,
);
