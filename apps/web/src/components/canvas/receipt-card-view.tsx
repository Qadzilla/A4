import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthToken } from '../../hooks/useAuthToken';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import { getFileUrl, uploadFile } from '../../lib/file-utils';
import {
  PAYMENT_METHODS,
  RECEIPT_CATEGORY_COLORS,
  computeReceiptTotals,
  cycleStatus,
} from '../../lib/receipt-utils';
import type {
  PaymentMethod,
  Receipt,
  ReceiptCardData,
  ReceiptCategory,
  ReceiptStatus,
} from '../../lib/receipt-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const STATUS_COLORS: Record<ReceiptStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300' },
  reviewed: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  reimbursed: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
};

function defaultData(): ReceiptCardData {
  return {
    currency: 'USD',
    categories: [],
    receipts: [],
    notes: '',
  };
}

export const ReceiptCardView = memo(
  function ReceiptCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const getToken = useAuthToken();

    const [data, setData] = useState<ReceiptCardData>(() => {
      const d = item.data as ReceiptCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Filter state (view-only, not persisted)
    const [statusFilter, setStatusFilter] = useState<'all' | ReceiptStatus>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // File upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingReceiptIdRef = useRef<string | null>(null);

    // New receipt form state
    const [newReceipt, setNewReceipt] = useState({
      date: new Date().toISOString().slice(0, 10),
      merchant: '',
      amount: '',
      tax: '',
      paymentMethod: 'card' as PaymentMethod,
      categoryId: '',
    });

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as ReceiptCardData | undefined;
      setData(d?.currency ? { ...defaultData(), ...d } : defaultData());
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

    const update = (patch: Partial<ReceiptCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    // Receipt mutations
    const addReceipt = () => {
      const amount = Number(newReceipt.amount);
      if (!newReceipt.merchant.trim() || !amount || amount <= 0) return;
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        date: newReceipt.date,
        merchant: newReceipt.merchant.trim(),
        amount,
        tax: Number(newReceipt.tax) || 0,
        paymentMethod: newReceipt.paymentMethod,
        categoryId: newReceipt.categoryId || undefined,
        status: 'pending',
        notes: '',
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, receipts: [...prev.receipts, receipt] }));
      setNewReceipt({
        date: new Date().toISOString().slice(0, 10),
        merchant: '',
        amount: '',
        tax: '',
        paymentMethod: 'card',
        categoryId: '',
      });
    };

    const removeReceipt = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, receipts: prev.receipts.filter((r) => r.id !== id) }));
    };

    const updateReceipt = (id: string, patch: Partial<Receipt>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        receipts: prev.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));
    };

    // Category mutations
    const addCategory = () => {
      const usedColors = new Set(data.categories.map((c) => c.color));
      const nextColor =
        RECEIPT_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ?? RECEIPT_CATEGORY_COLORS[0]!;
      const cat: ReceiptCategory = {
        id: crypto.randomUUID(),
        name: '',
        color: nextColor,
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, categories: [...prev.categories, cat] }));
    };

    const removeCategory = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== id),
        receipts: prev.receipts.map((r) =>
          r.categoryId === id ? { ...r, categoryId: undefined } : r,
        ),
      }));
    };

    const updateCategory = (id: string, patch: Partial<ReceiptCategory>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    };

    // File upload handler
    const handleFileUpload = async (file: File) => {
      const receiptId = pendingReceiptIdRef.current;
      if (!receiptId) return;
      pendingReceiptIdRef.current = null;
      try {
        const result = await uploadFile(file, workspaceId, getToken);
        updateReceipt(receiptId, { linkedFileId: result.fileId });
      } catch {
        // silently fail — user can retry
      }
    };

    // Computed values
    const { totalAmount, totalTax, byStatus } = computeReceiptTotals(data.receipts);

    // Display receipts: newest first, then filtered
    const displayReceipts = useMemo(() => {
      let filtered = [...data.receipts].sort((a, b) => b.date.localeCompare(a.date));
      if (statusFilter !== 'all') {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((r) => (r.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [data.receipts, statusFilter, categoryFilter]);

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-3xl space-y-6">
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
                <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 17.5v-11" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Receipts</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency selector */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Currency
            </label>
            <select
              value={data.currency}
              onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
              className={cn(inputClass, 'w-48')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Categories management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
                Categories
              </p>
              <button
                type="button"
                onClick={addCategory}
                className="flex items-center gap-1 text-[12px] text-primary hover:text-primary/80 font-medium transition-colors"
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
                Add
              </button>
            </div>

            {data.categories.length > 0 && (
              <div className="space-y-2">
                {data.categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {RECEIPT_CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateCategory(cat.id, { color })}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            cat.color === color
                              ? 'border-foreground scale-110'
                              : 'border-transparent hover:border-muted-foreground/40',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                      placeholder="Category name"
                      className="flex-1 border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                ))}
              </div>
            )}
          </div>

          {/* Add receipt form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Receipt
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={newReceipt.date}
                  onChange={(e) => setNewReceipt((p) => ({ ...p, date: e.target.value }))}
                  className={cn(inputClass, 'w-[130px]')}
                />
              </div>
              <div className="flex-1 min-w-[120px] space-y-1">
                <label className="text-[11px] text-muted-foreground">Merchant</label>
                <input
                  type="text"
                  value={newReceipt.merchant}
                  onChange={(e) => setNewReceipt((p) => ({ ...p, merchant: e.target.value }))}
                  placeholder="Merchant"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addReceipt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newReceipt.amount}
                  onChange={(e) => setNewReceipt((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[90px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addReceipt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Tax</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newReceipt.tax}
                  onChange={(e) => setNewReceipt((p) => ({ ...p, tax: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[80px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addReceipt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Payment</label>
                <select
                  value={newReceipt.paymentMethod}
                  onChange={(e) =>
                    setNewReceipt((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethod }))
                  }
                  className={cn(inputClass, 'w-[100px]')}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {data.categories.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    value={newReceipt.categoryId}
                    onChange={(e) => setNewReceipt((p) => ({ ...p, categoryId: e.target.value }))}
                    className={cn(inputClass, 'w-[120px]')}
                  >
                    <option value="">None</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={addReceipt}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'pending', 'reviewed', 'reimbursed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1 text-[12px] font-medium transition-colors capitalize',
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {data.categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={cn(inputClass, 'w-auto')}
              >
                <option value="all">All categories</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Unnamed'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Hidden file input for evidence upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* Receipt list */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Receipts ({displayReceipts.length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[90px_1fr_90px_90px_80px_80px_90px_60px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Date</span>
                <span>Merchant</span>
                <span>Category</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Tax</span>
                <span>Payment</span>
                <span>Status</span>
                <span>Evidence</span>
                <span />
              </div>

              {displayReceipts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No receipts
                  {statusFilter !== 'all' || categoryFilter !== 'all' ? ' match filter' : ' yet'}
                </div>
              ) : (
                displayReceipts.map((receipt) => {
                  const cat = data.categories.find((c) => c.id === receipt.categoryId);
                  const statusStyle = STATUS_COLORS[receipt.status];
                  const isImage = receipt.linkedFileId != null;
                  return (
                    <div
                      key={receipt.id}
                      className="grid grid-cols-[90px_1fr_90px_90px_80px_80px_90px_60px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                    >
                      <input
                        type="date"
                        value={receipt.date}
                        onChange={(e) => updateReceipt(receipt.id, { date: e.target.value })}
                        className="border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={receipt.merchant}
                        onChange={(e) => updateReceipt(receipt.id, { merchant: e.target.value })}
                        placeholder="Merchant"
                        className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1.5 min-w-0">
                        {cat ? (
                          <>
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-[11px] text-muted-foreground truncate">
                              {cat.name || 'Unnamed'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">&mdash;</span>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receipt.amount}
                        onChange={(e) =>
                          updateReceipt(receipt.id, { amount: Number(e.target.value) || 0 })
                        }
                        className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receipt.tax}
                        onChange={(e) =>
                          updateReceipt(receipt.id, { tax: Number(e.target.value) || 0 })
                        }
                        className="border-0 bg-transparent text-[12px] text-right text-muted-foreground focus:outline-none tabular-nums w-full"
                      />
                      <select
                        value={receipt.paymentMethod}
                        onChange={(e) =>
                          updateReceipt(receipt.id, {
                            paymentMethod: e.target.value as PaymentMethod,
                          })
                        }
                        className="border-0 bg-transparent text-[11px] text-muted-foreground focus:outline-none cursor-pointer"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          updateReceipt(receipt.id, { status: cycleStatus(receipt.status) })
                        }
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium capitalize transition-colors cursor-pointer',
                          statusStyle.bg,
                          statusStyle.text,
                        )}
                      >
                        {receipt.status}
                      </button>
                      <div className="flex items-center justify-center">
                        {isImage ? (
                          <img
                            src={getFileUrl(receipt.linkedFileId!)}
                            alt="Evidence"
                            className="size-8 rounded object-cover border border-border/40"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              pendingReceiptIdRef.current = receipt.id;
                              fileInputRef.current?.click();
                            }}
                            className="flex items-center justify-center size-8 rounded border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                            title="Attach evidence"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-3.5"
                            >
                              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReceipt(receipt.id)}
                        className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                })
              )}
            </div>
          </div>

          {/* Summary footer */}
          <div className="grid grid-cols-4 gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Amount
              </p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {formatCurrency(totalAmount, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Tax</p>
              <p className="text-[16px] font-bold text-muted-foreground tabular-nums">
                {formatCurrency(totalTax, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Receipts</p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {data.receipts.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
              <div className="flex items-center gap-2 mt-0.5">
                {byStatus.pending > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    {byStatus.pending}P
                  </span>
                )}
                {byStatus.reviewed > 0 && (
                  <span className="text-[11px] text-blue-600 dark:text-blue-400">
                    {byStatus.reviewed}R
                  </span>
                )}
                {byStatus.reimbursed > 0 && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">
                    {byStatus.reimbursed}D
                  </span>
                )}
                {data.receipts.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">&mdash;</span>
                )}
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
              placeholder="Notes..."
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId,
);
