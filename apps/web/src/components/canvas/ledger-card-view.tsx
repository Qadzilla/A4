import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  LEDGER_CATEGORY_COLORS,
  computeLedgerTotals,
  computeNetBalance,
  computeRunningBalance,
} from '../../lib/ledger-utils';
import type { LedgerCardData, LedgerEntry, LedgerEntryType } from '../../lib/ledger-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { TransactionImportModal } from './transaction-import-modal';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'rounded-md border border-border bg-muted/20 px-1.5 py-1 pr-7 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] cursor-pointer';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function defaultData(): LedgerCardData {
  return { startingBalance: 0, currency: 'USD', notes: '' };
}

export const LedgerCardView = memo(
  function LedgerCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<LedgerCardData>(() => {
      const d = item.data as LedgerCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Filter state (view-only, not persisted)
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Import modal state
    const [importOpen, setImportOpen] = useState(false);

    // Rules panel state
    const [showRules, setShowRules] = useState(false);
    const [newRulePattern, setNewRulePattern] = useState('');
    const [newRuleCategoryId, setNewRuleCategoryId] = useState('');

    // New entry form state
    const [newEntry, setNewEntry] = useState({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount: '',
      type: 'expense' as LedgerEntryType,
      categoryId: '',
    });

    // Re-load view config when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as LedgerCardData | undefined;
      setViewConfig(d?.currency ? { ...defaultData(), ...d } : defaultData());
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

    const updateViewConfig = (patch: Partial<LedgerCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: transactions = [], isLoading: txLoading } = useQuery(
      trpc.financial.listTransactions.queryOptions({ workspaceId }),
    );
    const { data: categories = [], isLoading: catLoading } = useQuery(
      trpc.category.list.queryOptions({ workspaceId, context: 'ledger' }),
    );

    const isLoading = txLoading || catLoading;

    // ── tRPC mutations ──
    const txQueryKey = trpc.financial.listTransactions.queryKey();
    const summaryQueryKey = trpc.financial.getSummary.queryKey();
    const catQueryKey = trpc.category.list.queryKey();

    const invalidateTx = () => {
      queryClient.invalidateQueries({ queryKey: txQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createTx = useMutation(
      trpc.financial.createTransaction.mutationOptions({ onSuccess: invalidateTx }),
    );
    const updateTx = useMutation(
      trpc.financial.updateTransaction.mutationOptions({ onSuccess: invalidateTx }),
    );
    const deleteTx = useMutation(
      trpc.financial.deleteTransaction.mutationOptions({ onSuccess: invalidateTx }),
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

    // ── Categorization rules queries + mutations ──
    const { data: catRules = [] } = useQuery(
      trpc.categorizationRule.list.queryOptions({ workspaceId }),
    );
    const ruleQueryKey = trpc.categorizationRule.list.queryKey();

    const createRule = useMutation(
      trpc.categorizationRule.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ruleQueryKey }),
      }),
    );
    const deleteRule = useMutation(
      trpc.categorizationRule.delete.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ruleQueryKey }),
      }),
    );

    // ── Entry mutations ──
    const addEntry = () => {
      const amount = Number(newEntry.amount);
      if (!newEntry.description.trim() || !amount || amount <= 0) return;
      createTx.mutate({
        workspaceId,
        date: newEntry.date,
        description: newEntry.description.trim(),
        amount,
        type: newEntry.type,
        categoryId: newEntry.categoryId || null,
      });
      setNewEntry({
        date: new Date().toISOString().slice(0, 10),
        description: '',
        amount: '',
        type: 'expense',
        categoryId: '',
      });
    };

    const removeEntry = (id: string) => {
      deleteTx.mutate({ id });
    };

    const handleEntryBlur = (id: string, field: string, value: string | number) => {
      const existing = transactions.find((t) => t.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return; // no change
      updateTx.mutate({ id, data: { [field]: value } });
    };

    // ── Category mutations ──
    const addCategory = () => {
      const usedColors = new Set(categories.map((c: { color: string }) => c.color));
      const nextColor =
        LEDGER_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ?? LEDGER_CATEGORY_COLORS[0]!;
      createCat.mutate({
        workspaceId,
        name: 'Unnamed',
        color: nextColor,
        type: 'both',
        context: 'ledger',
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
      if (!name.trim()) return; // name is required (min 1)
      updateCat.mutate({ id, data: { name: name.trim() } });
    };

    const addRule = () => {
      if (!newRulePattern.trim() || !newRuleCategoryId) return;
      createRule.mutate({
        workspaceId,
        pattern: newRulePattern.trim(),
        categoryId: newRuleCategoryId,
      });
      setNewRulePattern('');
      setNewRuleCategoryId('');
    };

    // ── Computed values ──
    // Map DB transactions to LedgerEntry shape for utility functions
    const entries: LedgerEntry[] = useMemo(
      () =>
        transactions.map((t) => ({
          id: t.id,
          date: t.date,
          description: t.description,
          amount: Number(t.amount),
          type: t.type as LedgerEntryType,
          categoryId: t.categoryId ?? undefined,
          notes: t.notes ?? null,
        })),
      [transactions],
    );

    const { totalIncome, totalExpenses } = computeLedgerTotals(entries);
    const netBalance = computeNetBalance(viewConfig.startingBalance, entries);

    const sortedEntries = useMemo(
      () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
      [entries],
    );
    const runningBalances = useMemo(
      () => computeRunningBalance(viewConfig.startingBalance, entries),
      [viewConfig.startingBalance, entries],
    );

    const balanceMap = useMemo(() => {
      const map = new Map<string, number>();
      sortedEntries.forEach((e, i) => map.set(e.id, runningBalances[i]!));
      return map;
    }, [sortedEntries, runningBalances]);

    const displayEntries = useMemo(() => {
      let filtered = [...entries].sort((a, b) => b.date.localeCompare(a.date));
      if (typeFilter !== 'all') {
        filtered = filtered.filter((e) => e.type === typeFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((e) => (e.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [entries, typeFilter, categoryFilter]);

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading ledger...</p>
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
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Ledger</p>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus !== 'idle' && (
                <span className="text-[11px] text-muted-foreground">
                  {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowRules((v) => !v)}
                title="Categorization rules"
                className={cn(
                  'flex items-center justify-center size-8 rounded-lg transition-colors',
                  showRules
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import
              </button>
            </div>
          </div>

          {/* Starting balance + Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Starting Balance
              </label>
              <input
                type="number"
                step={0.01}
                value={viewConfig.startingBalance}
                onChange={(e) => updateViewConfig({ startingBalance: Number(e.target.value) || 0 })}
                className={cn(inputClass, 'font-mono tabular-nums', numberInputSpinner)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Currency
              </label>
              <select
                value={viewConfig.currency}
                onChange={(e) =>
                  updateViewConfig({ currency: e.target.value as SupportedCurrency })
                }
                className={selectClass}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.symbol} {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Categories management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              <button
                type="button"
                onClick={addCategory}
                disabled={createCat.isPending}
                className="flex items-center gap-1 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors disabled:opacity-50"
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
                {categories.map((cat: { id: string; name: string; color: string }) => (
                  <div key={cat.id} className="group flex items-center gap-2">
                    {/* Color picker */}
                    <div className="flex gap-1">
                      {LEDGER_CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleCategoryColorChange(cat.id, color)}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            cat.color === color
                              ? 'ring-2 ring-primary/20 shadow-sm scale-110 border-foreground'
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
                      className="flex-1 rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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

          {/* Add entry form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Entry
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
                  className={cn(inputClass, 'sm:w-[130px]')}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={newEntry.description}
                  onChange={(e) => setNewEntry((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Description"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'sm:w-[100px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNewEntry((p) => ({ ...p, type: 'income' }))}
                    className={cn(
                      'px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                      newEntry.type === 'income'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEntry((p) => ({ ...p, type: 'expense' }))}
                    className={cn(
                      'px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                      newEntry.type === 'expense'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    Expense
                  </button>
                </div>
              </div>
              {categories.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                  <select
                    value={newEntry.categoryId}
                    onChange={(e) => setNewEntry((p) => ({ ...p, categoryId: e.target.value }))}
                    className={cn(selectClass, 'sm:w-[120px]')}
                  >
                    <option value="">None</option>
                    {categories.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={addEntry}
                disabled={createTx.isPending}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-3 py-1 text-[12px] font-medium transition-colors capitalize',
                    typeFilter === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={cn(inlineSelectClass, 'w-auto')}
              >
                <option value="all">All categories</option>
                {categories.map((c: { id: string; name: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Unnamed'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Entry list */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Entries ({displayEntries.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[90px_1fr_100px_100px_100px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Date</span>
                <span>Description</span>
                <span>Category</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Balance</span>
                <span />
              </div>

              {displayEntries.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No entries
                  {typeFilter !== 'all' || categoryFilter !== 'all' ? ' match filter' : ' yet'}
                </div>
              ) : (
                displayEntries.map((entry) => {
                  const cat = categories.find((c: { id: string }) => c.id === entry.categoryId) as
                    | { id: string; name: string; color: string }
                    | undefined;
                  const balance = balanceMap.get(entry.id) ?? 0;
                  return (
                    <div
                      key={entry.id}
                      className="group grid grid-cols-1 sm:grid-cols-[90px_1fr_100px_100px_100px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                    >
                      <input
                        type="date"
                        defaultValue={entry.date}
                        onBlur={(e) => handleEntryBlur(entry.id, 'date', e.target.value)}
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[12px] text-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        defaultValue={entry.description}
                        onBlur={(e) => handleEntryBlur(entry.id, 'description', e.target.value)}
                        placeholder="Description"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                      <div className="flex items-center justify-end">
                        <span
                          className={cn(
                            'text-[13px] font-mono tabular-nums mr-1',
                            entry.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {entry.type === 'income' ? '+' : '-'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          defaultValue={entry.amount}
                          onBlur={(e) =>
                            handleEntryBlur(entry.id, 'amount', Number(e.target.value) || 0)
                          }
                          className={cn(
                            'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right focus:outline-none focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/50 transition-all font-mono tabular-nums w-[70px]',
                            numberInputSpinner,
                            entry.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        />
                      </div>
                      <span className="text-[13px] text-left sm:text-right text-muted-foreground font-mono tabular-nums py-1 pr-1">
                        {formatCurrency(balance, viewConfig.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Income
              </p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums mt-1">
                {formatCurrency(totalIncome, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Expenses
              </p>
              <p className="text-[16px] font-semibold text-red-600 dark:text-red-400 font-mono tabular-nums mt-1">
                {formatCurrency(totalExpenses, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Net Balance
              </p>
              <p
                className={cn(
                  'text-[16px] font-semibold font-mono tabular-nums mt-1',
                  netBalance >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(netBalance, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Entries</p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums mt-1">{entries.length}</p>
            </div>
          </div>

          {/* Categorization rules panel */}
          {showRules && (
            <div className="space-y-3 pt-4 border-t border-border/40">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categorization Rules
              </p>
              <p className="text-[11px] text-muted-foreground">
                Rules auto-assign categories to imported transactions when the description contains
                the pattern.
              </p>

              {catRules.length > 0 && (
                <div className="space-y-1.5">
                  {catRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="group flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5"
                    >
                      <span className="text-[12px] font-mono text-foreground flex-1 truncate">
                        {rule.pattern}
                      </span>
                      <span className="text-[11px] text-muted-foreground mx-1">&rarr;</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {rule.categoryColor && (
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: rule.categoryColor }}
                          />
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {rule.categoryName || 'Unknown'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteRule.mutate({ id: rule.id })}
                        className="flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0 opacity-0 group-hover:opacity-100"
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

              {/* Add rule form */}
              {categories.length > 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pattern</label>
                    <input
                      type="text"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      placeholder="e.g. starbucks"
                      className={inputClass}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addRule();
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                    <select
                      value={newRuleCategoryId}
                      onChange={(e) => setNewRuleCategoryId(e.target.value)}
                      className={cn(selectClass, 'sm:w-[140px]')}
                    >
                      <option value="">Select...</option>
                      {categories.map((c: { id: string; name: string }) => (
                        <option key={c.id} value={c.id}>
                          {c.name || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={addRule}
                    disabled={!newRulePattern.trim() || !newRuleCategoryId || createRule.isPending}
                    className="flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Add Rule
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={viewConfig.notes}
              onChange={(e) => updateViewConfig({ notes: e.target.value })}
              placeholder="Notes..."
              rows={3}
              className={cn(inputClass, 'resize-none py-2')}
            />
          </div>
        </div>

        {/* Import modal */}
        <TransactionImportModal
          open={importOpen}
          onOpenChange={setImportOpen}
          workspaceId={workspaceId}
        />
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId,
);
