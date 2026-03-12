import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { PaymentMethod, ReceiptCardData, ReceiptStatus } from '../../lib/receipt-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'rounded-md border border-border bg-muted/20 px-1.5 py-1 pr-6 text-[11px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:12px_12px] bg-[position:right_4px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] cursor-pointer';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const STATUS_COLORS: Record<ReceiptStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  reviewed: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  reimbursed: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
};

function defaultViewConfig(): ReceiptCardData {
  return { currency: 'USD', notes: '' };
}

export const ReceiptCardView = memo(
  function ReceiptCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const getToken = useAuthToken();

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<ReceiptCardData>(() => {
      const d = item.data as ReceiptCardData | undefined;
      return d?.currency ? { ...defaultViewConfig(), ...d } : defaultViewConfig();
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

    // Re-load view config when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as ReceiptCardData | undefined;
      setViewConfig(d?.currency ? { ...defaultViewConfig(), ...d } : defaultViewConfig());
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save view config (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, viewConfig as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);
      return () => clearTimeout(saveTimerRef.current);
    }, [viewConfig, item.id, updateItemData]);

    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const updateView = (patch: Partial<ReceiptCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: receipts = [], isLoading: rcptLoading } = useQuery(
      trpc.receipt.list.queryOptions({ workspaceId }),
    );
    const { data: categories = [], isLoading: catLoading } = useQuery(
      trpc.category.list.queryOptions({ workspaceId, context: 'receipt' }),
    );

    const isLoading = rcptLoading || catLoading;

    // ── tRPC mutations ──
    const rcptQueryKey = trpc.receipt.list.queryKey();
    const summaryQueryKey = trpc.receipt.getSummary.queryKey();
    const catQueryKey = trpc.category.list.queryKey();

    const invalidateReceipts = () => {
      queryClient.invalidateQueries({ queryKey: rcptQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createReceipt = useMutation(
      trpc.receipt.create.mutationOptions({ onSuccess: invalidateReceipts }),
    );
    const updateReceipt = useMutation(
      trpc.receipt.update.mutationOptions({ onSuccess: invalidateReceipts }),
    );
    const deleteReceipt = useMutation(
      trpc.receipt.delete.mutationOptions({ onSuccess: invalidateReceipts }),
    );
    const createCat = useMutation(
      trpc.category.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: catQueryKey }),
      }),
    );
    const updateCat = useMutation(
      trpc.category.update.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: catQueryKey }),
      }),
    );
    const deleteCat = useMutation(
      trpc.category.delete.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: catQueryKey }),
      }),
    );

    // ── Receipt actions ──
    const addReceipt = () => {
      const amount = Number(newReceipt.amount);
      if (!newReceipt.merchant.trim() || !amount || amount <= 0) return;
      createReceipt.mutate({
        workspaceId,
        date: newReceipt.date,
        merchant: newReceipt.merchant.trim(),
        amount,
        tax: Number(newReceipt.tax) || 0,
        paymentMethod: newReceipt.paymentMethod,
        categoryId: newReceipt.categoryId || null,
        status: 'pending',
      });
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
      deleteReceipt.mutate({ id });
    };

    const handleReceiptBlur = (id: string, field: string, value: string | number) => {
      const existing = receipts.find((r) => r.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateReceipt.mutate({ id, data: { [field]: value } });
    };

    const handleStatusCycle = (id: string, currentStatus: ReceiptStatus) => {
      updateReceipt.mutate({ id, data: { status: cycleStatus(currentStatus) } });
    };

    // ── Category actions ──
    const addCategory = () => {
      const usedColors = new Set(categories.map((c: { color: string }) => c.color));
      const nextColor =
        RECEIPT_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ?? RECEIPT_CATEGORY_COLORS[0]!;
      createCat.mutate({
        workspaceId,
        name: 'Unnamed',
        color: nextColor,
        type: 'both',
        context: 'receipt',
      });
    };

    const removeCategory = (id: string) => {
      deleteCat.mutate({ id });
    };

    const handleCategoryColorChange = (id: string, color: string) => {
      updateCat.mutate({ id, data: { color } });
    };

    const handleCategoryNameBlur = (id: string, name: string) => {
      const existing = categories.find((c: { id: string }) => c.id === id);
      if (!existing || existing.name === name) return;
      if (!name.trim()) return;
      updateCat.mutate({ id, data: { name: name.trim() } });
    };

    // ── File upload handler ──
    const handleFileUpload = async (file: File) => {
      const receiptId = pendingReceiptIdRef.current;
      if (!receiptId) return;
      pendingReceiptIdRef.current = null;
      try {
        const result = await uploadFile(file, workspaceId, getToken);
        updateReceipt.mutate({ id: receiptId, data: { linkedFileId: result.fileId } });
      } catch {
        // silently fail — user can retry
      }
    };

    // ── Computed values ──
    const { totalAmount, totalTax, byStatus } = computeReceiptTotals(
      receipts.map((r) => ({
        ...r,
        notes: r.notes ?? '',
        categoryId: r.categoryId ?? undefined,
        linkedFileId: r.linkedFileId ?? undefined,
        paymentMethod: r.paymentMethod as PaymentMethod,
        status: r.status as ReceiptStatus,
      })),
    );

    const displayReceipts = useMemo(() => {
      let filtered = [...receipts].sort((a, b) => b.date.localeCompare(a.date));
      if (statusFilter !== 'all') {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((r) => (r.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [receipts, statusFilter, categoryFilter]);

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading receipts...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-4 sm:px-8">
        <div className="w-full max-w-3xl space-y-8 bg-card border border-border/60 shadow-sm rounded-xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 17.5v-11" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Receipts</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Currency
            </label>
            <select
              value={viewConfig.currency}
              onChange={(e) => updateView({ currency: e.target.value as SupportedCurrency })}
              className={cn(selectClass, 'w-48')}
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              <button
                type="button"
                onClick={addCategory}
                className="flex items-center gap-1 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors"
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

            {categories.length > 0 && (
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="group flex items-center gap-2">
                    <div className="flex gap-1">
                      {RECEIPT_CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleCategoryColorChange(cat.id, color)}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            cat.color === color
                              ? 'ring-2 ring-primary/20 shadow-sm scale-110'
                              : 'border-transparent hover:border-muted-foreground/40',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      defaultValue={cat.name}
                      onBlur={(e) => handleCategoryNameBlur(cat.id, e.target.value)}
                      placeholder="Category name"
                      className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
                ))}
              </div>
            )}
          </div>

          {/* Add receipt form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  className={cn(inputClass, 'w-[90px] font-mono', numberInputSpinner)}
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
                  className={cn(inputClass, 'w-[80px] font-mono', numberInputSpinner)}
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
                  className={cn(selectClass, 'w-[100px]')}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {categories.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    value={newReceipt.categoryId}
                    onChange={(e) => setNewReceipt((p) => ({ ...p, categoryId: e.target.value }))}
                    className={cn(selectClass, 'w-[120px]')}
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
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
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm active:scale-[0.98]"
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
            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={cn(selectClass, 'w-auto')}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
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
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Receipts ({displayReceipts.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[90px_1fr_90px_90px_80px_80px_90px_60px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                  const cat = categories.find((c) => c.id === receipt.categoryId);
                  const statusStyle = STATUS_COLORS[receipt.status as ReceiptStatus];
                  const hasEvidence = receipt.linkedFileId != null;
                  return (
                    <div
                      key={receipt.id}
                      className="group grid grid-cols-1 sm:grid-cols-[90px_1fr_90px_90px_80px_80px_90px_60px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                    >
                      <input
                        type="date"
                        defaultValue={receipt.date}
                        onBlur={(e) => handleReceiptBlur(receipt.id, 'date', e.target.value)}
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        defaultValue={receipt.merchant}
                        onBlur={(e) => handleReceiptBlur(receipt.id, 'merchant', e.target.value)}
                        placeholder="Merchant"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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
                        defaultValue={receipt.amount}
                        onBlur={(e) =>
                          handleReceiptBlur(receipt.id, 'amount', Number(e.target.value) || 0)
                        }
                        className={cn('rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50', numberInputSpinner)}
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        defaultValue={receipt.tax}
                        onBlur={(e) =>
                          handleReceiptBlur(receipt.id, 'tax', Number(e.target.value) || 0)
                        }
                        className={cn('rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[12px] text-left sm:text-right text-muted-foreground font-mono tabular-nums transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50', numberInputSpinner)}
                      />
                      <select
                        value={receipt.paymentMethod}
                        onChange={(e) =>
                          updateReceipt.mutate({
                            id: receipt.id,
                            data: { paymentMethod: e.target.value as 'cash' | 'card' | 'check' | 'transfer' | 'other' },
                          })
                        }
                        className={inlineSelectClass}
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
                          handleStatusCycle(receipt.id, receipt.status as ReceiptStatus)
                        }
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium capitalize transition-colors cursor-pointer border',
                          statusStyle.bg,
                          statusStyle.text,
                        )}
                      >
                        {receipt.status}
                      </button>
                      <div className="flex items-center justify-center">
                        {hasEvidence ? (
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
                        className="hidden sm:flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
                })
              )}
            </div>
          </div>

          {/* Summary footer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-background p-4">
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Amount
              </p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums">
                {formatCurrency(totalAmount, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Tax</p>
              <p className="text-[16px] font-semibold text-muted-foreground font-mono tabular-nums">
                {formatCurrency(totalTax, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Receipts</p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums">
                {receipts.length}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
              <div className="flex items-center gap-2 mt-0.5">
                {byStatus.pending > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                    {byStatus.pending}P
                  </span>
                )}
                {byStatus.reviewed > 0 && (
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono">
                    {byStatus.reviewed}R
                  </span>
                )}
                {byStatus.reimbursed > 0 && (
                  <span className="text-[11px] text-green-600 dark:text-green-400 font-mono">
                    {byStatus.reimbursed}D
                  </span>
                )}
                {receipts.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">&mdash;</span>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={viewConfig.notes}
              onChange={(e) => updateView({ notes: e.target.value })}
              placeholder="Notes..."
              rows={3}
              className={cn(inputClass, 'resize-none py-2')}
            />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId,
);
