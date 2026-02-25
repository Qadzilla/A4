import { cn } from '@a4/ui';
import { memo, useEffect, useRef, useState } from 'react';
import {
  computeSubtotal,
  computeTax,
  computeTotal,
  exportInvoicePdf,
  formatCurrency,
} from '../../lib/invoice-utils';
import type { InvoiceCardData, InvoiceLineItem, InvoiceStatus } from '../../lib/invoice-utils';
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

function defaultData(): InvoiceCardData {
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    invoiceNumber: 'INV-001',
    date: today.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    from: { name: '', address: '', email: '' },
    to: { name: '', address: '', email: '' },
    items: [{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }],
    taxRate: 0,
    notes: '',
    status: 'draft',
  };
}

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

export const InvoiceCardView = memo(
  function InvoiceCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<InvoiceCardData>(() => {
      const d = item.data as InvoiceCardData | undefined;
      return d?.invoiceNumber ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [isExporting, setIsExporting] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as InvoiceCardData | undefined;
      setData(d?.invoiceNumber ? { ...defaultData(), ...d } : defaultData());
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, data as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [data, item.id, updateItemData]);

    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<InvoiceCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const updateLineItem = (id: string, patch: Partial<InvoiceLineItem>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        items: prev.items.map((li) => (li.id === id ? { ...li, ...patch } : li)),
      }));
    };

    const addLineItem = () => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 },
        ],
      }));
    };

    const removeLineItem = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        items: prev.items.filter((li) => li.id !== id),
      }));
    };

    const handleExport = async () => {
      setIsExporting(true);
      try {
        await exportInvoicePdf(data, item.name);
      } finally {
        setIsExporting(false);
      }
    };

    const subtotal = computeSubtotal(data.items);
    const tax = computeTax(subtotal, data.taxRate);
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
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
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
                  onClick={() => update({ status: s.value })}
                  className={cn(
                    'px-3 py-1 rounded-full text-[12px] font-medium border transition-all',
                    s.color,
                    data.status === s.value
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
                value={data.invoiceNumber}
                onChange={(e) => update({ invoiceNumber: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Date
              </label>
              <input
                type="date"
                value={data.date}
                onChange={(e) => update({ date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Due Date
              </label>
              <input
                type="date"
                value={data.dueDate}
                onChange={(e) => update({ dueDate: e.target.value })}
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
                value={data.from.name}
                onChange={(e) => update({ from: { ...data.from, name: e.target.value } })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Address"
                value={data.from.address}
                onChange={(e) => update({ from: { ...data.from, address: e.target.value } })}
                className={inputClass}
              />
              <input
                type="email"
                placeholder="Email"
                value={data.from.email}
                onChange={(e) => update({ from: { ...data.from, email: e.target.value } })}
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
                value={data.to.name}
                onChange={(e) => update({ to: { ...data.to, name: e.target.value } })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Address"
                value={data.to.address}
                onChange={(e) => update({ to: { ...data.to, address: e.target.value } })}
                className={inputClass}
              />
              <input
                type="email"
                placeholder="Email"
                value={data.to.email}
                onChange={(e) => update({ to: { ...data.to, email: e.target.value } })}
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
              {/* Header row */}
              <div className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amount</span>
                <span />
              </div>

              {/* Rows */}
              {data.items.map((li) => {
                const amount = li.quantity * li.unitPrice;
                return (
                  <div
                    key={li.id}
                    className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                  >
                    <input
                      type="text"
                      value={li.description}
                      onChange={(e) => updateLineItem(li.id, { description: e.target.value })}
                      placeholder="Item description"
                      className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={li.quantity}
                      onChange={(e) =>
                        updateLineItem(li.id, { quantity: Number(e.target.value) || 0 })
                      }
                      className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={li.unitPrice}
                      onChange={(e) =>
                        updateLineItem(li.id, { unitPrice: Number(e.target.value) || 0 })
                      }
                      className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums"
                    />
                    <span className="text-[13px] text-right text-black/70 dark:text-zinc-300 tabular-nums">
                      {formatCurrency(amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      disabled={data.items.length <= 1}
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
                    value={data.taxRate}
                    onChange={(e) => update({ taxRate: Number(e.target.value) || 0 })}
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
              value={data.notes}
              onChange={(e) => update({ notes: e.target.value })}
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
  (prev, next) => prev.item.id === next.item.id,
);
