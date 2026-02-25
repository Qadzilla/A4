import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  LEDGER_CATEGORY_COLORS,
  computeLedgerTotals,
  computeNetBalance,
  computeRunningBalance,
} from '../../lib/ledger-utils';
import type {
  LedgerCardData,
  LedgerCategory,
  LedgerEntry,
  LedgerEntryType,
} from '../../lib/ledger-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

function defaultData(): LedgerCardData {
  return {
    startingBalance: 0,
    currency: 'USD',
    categories: [],
    entries: [],
    notes: '',
  };
}

export const LedgerCardView = memo(
  function LedgerCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<LedgerCardData>(() => {
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

    // New entry form state
    const [newEntry, setNewEntry] = useState({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount: '',
      type: 'expense' as LedgerEntryType,
      categoryId: '',
    });

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as LedgerCardData | undefined;
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

    const update = (patch: Partial<LedgerCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    // Entry mutations
    const addEntry = () => {
      const amount = Number(newEntry.amount);
      if (!newEntry.description.trim() || !amount || amount <= 0) return;
      const entry: LedgerEntry = {
        id: crypto.randomUUID(),
        date: newEntry.date,
        description: newEntry.description.trim(),
        amount,
        type: newEntry.type,
        categoryId: newEntry.categoryId || undefined,
        notes: '',
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, entries: [...prev.entries, entry] }));
      setNewEntry({
        date: new Date().toISOString().slice(0, 10),
        description: '',
        amount: '',
        type: 'expense',
        categoryId: '',
      });
    };

    const removeEntry = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
    };

    const updateEntry = (id: string, patch: Partial<LedgerEntry>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    };

    // Category mutations
    const addCategory = () => {
      const usedColors = new Set(data.categories.map((c) => c.color));
      const nextColor =
        LEDGER_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ?? LEDGER_CATEGORY_COLORS[0]!;
      const cat: LedgerCategory = {
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
        entries: prev.entries.map((e) =>
          e.categoryId === id ? { ...e, categoryId: undefined } : e,
        ),
      }));
    };

    const updateCategory = (id: string, patch: Partial<LedgerCategory>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    };

    // Computed values
    const { totalIncome, totalExpenses, net } = computeLedgerTotals(data.entries);
    const netBalance = computeNetBalance(data.startingBalance, data.entries);

    // Running balance is computed on ALL entries (sorted by date asc), regardless of filter
    const sortedEntries = useMemo(
      () => [...data.entries].sort((a, b) => a.date.localeCompare(b.date)),
      [data.entries],
    );
    const runningBalances = useMemo(
      () => computeRunningBalance(data.startingBalance, data.entries),
      [data.startingBalance, data.entries],
    );

    // Build a map from entry id → running balance (sorted entries aligned with runningBalances)
    const balanceMap = useMemo(() => {
      const map = new Map<string, number>();
      sortedEntries.forEach((e, i) => map.set(e.id, runningBalances[i]!));
      return map;
    }, [sortedEntries, runningBalances]);

    // Display entries: newest first, then filtered
    const displayEntries = useMemo(() => {
      let filtered = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));
      if (typeFilter !== 'all') {
        filtered = filtered.filter((e) => e.type === typeFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((e) => (e.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [data.entries, typeFilter, categoryFilter]);

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
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Ledger</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Starting balance + Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Starting Balance
              </label>
              <input
                type="number"
                step={0.01}
                value={data.startingBalance}
                onChange={(e) => update({ startingBalance: Number(e.target.value) || 0 })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Currency
              </label>
              <select
                value={data.currency}
                onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
                className={inputClass}
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
                    {/* Color picker */}
                    <div className="flex gap-1">
                      {LEDGER_CATEGORY_COLORS.map((color) => (
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

          {/* Add entry form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Entry
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
                  className={cn(inputClass, 'w-[130px]')}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">Description</label>
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
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[100px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Type</label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNewEntry((p) => ({ ...p, type: 'income' }))}
                    className={cn(
                      'px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                      newEntry.type === 'income'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
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
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    Expense
                  </button>
                </div>
              </div>
              {data.categories.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    value={newEntry.categoryId}
                    onChange={(e) => setNewEntry((p) => ({ ...p, categoryId: e.target.value }))}
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
                onClick={addEntry}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3">
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

          {/* Entry list */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Entries ({displayEntries.length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[90px_1fr_100px_100px_100px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                  const cat = data.categories.find((c) => c.id === entry.categoryId);
                  const balance = balanceMap.get(entry.id) ?? 0;
                  return (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[90px_1fr_100px_100px_100px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                    >
                      <input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                        className="border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={entry.description}
                        onChange={(e) => updateEntry(entry.id, { description: e.target.value })}
                        placeholder="Description"
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
                          <span className="text-[11px] text-muted-foreground/50">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end">
                        <span
                          className={cn(
                            'text-[13px] tabular-nums mr-1',
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
                          value={entry.amount}
                          onChange={(e) =>
                            updateEntry(entry.id, { amount: Number(e.target.value) || 0 })
                          }
                          className={cn(
                            'border-0 bg-transparent text-[13px] text-right focus:outline-none tabular-nums w-[70px]',
                            entry.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        />
                      </div>
                      <span className="text-[12px] text-right text-muted-foreground tabular-nums">
                        {formatCurrency(balance, data.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
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
                Total Income
              </p>
              <p className="text-[16px] font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatCurrency(totalIncome, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Expenses
              </p>
              <p className="text-[16px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                {formatCurrency(totalExpenses, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Net Balance
              </p>
              <p
                className={cn(
                  'text-[16px] font-bold tabular-nums',
                  netBalance >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(netBalance, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entries</p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {data.entries.length}
              </p>
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
  (prev, next) => prev.item.id === next.item.id,
);
