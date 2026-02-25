import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  DEFAULT_CATEGORIES,
  computeNetWorth,
  getNetWorthHealthColor,
} from '../../lib/networth-utils';
import type {
  NetWorthCardData,
  NetWorthCategory,
  NetWorthCategoryKind,
  NetWorthEntry,
} from '../../lib/networth-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

function defaultData(): NetWorthCardData {
  return {
    currency: 'USD',
    categories: [...DEFAULT_CATEGORIES],
    entries: [],
    notes: '',
  };
}

export const NetWorthCardView = memo(
  function NetWorthCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<NetWorthCardData>(() => {
      const d = item.data as NetWorthCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // New entry form
    const [newEntry, setNewEntry] = useState({ name: '', categoryId: '', value: '' });

    // New custom category form
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatKind, setNewCatKind] = useState<NetWorthCategoryKind>('asset');

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as NetWorthCardData | undefined;
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

    const update = (patch: Partial<NetWorthCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    // Entry mutations
    const addEntry = () => {
      const value = Number(newEntry.value);
      if (!newEntry.name.trim() || !newEntry.categoryId || Number.isNaN(value) || value < 0) return;
      const entry: NetWorthEntry = {
        id: crypto.randomUUID(),
        name: newEntry.name.trim(),
        categoryId: newEntry.categoryId,
        value,
        notes: '',
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, entries: [...prev.entries, entry] }));
      setNewEntry({ name: '', categoryId: '', value: '' });
    };

    const removeEntry = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
    };

    const updateEntry = (id: string, patch: Partial<NetWorthEntry>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    };

    // Category mutations
    const addCategory = () => {
      if (!newCatName.trim()) return;
      const cat: NetWorthCategory = {
        id: crypto.randomUUID(),
        name: newCatName.trim(),
        kind: newCatKind,
        isDefault: false,
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, categories: [...prev.categories, cat] }));
      setNewCatName('');
      setShowAddCategory(false);
    };

    const removeCategory = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== id),
        entries: prev.entries.filter((e) => e.categoryId !== id),
      }));
    };

    const renameCategory = (id: string, name: string) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, name } : c)),
      }));
    };

    // Computed
    const result = computeNetWorth(data);
    const healthColor = getNetWorthHealthColor(result.netWorth);

    const assetCategories = useMemo(
      () => data.categories.filter((c) => c.kind === 'asset'),
      [data.categories],
    );
    const liabilityCategories = useMemo(
      () => data.categories.filter((c) => c.kind === 'liability'),
      [data.categories],
    );

    // Group entries by section (asset/liability) then by category, sorted by value desc
    const groupedAssets = useMemo(() => {
      const assetEntries = data.entries.filter((e) => {
        const cat = data.categories.find((c) => c.id === e.categoryId);
        return cat?.kind === 'asset';
      });
      const groups = new Map<string, NetWorthEntry[]>();
      for (const e of assetEntries) {
        const arr = groups.get(e.categoryId) ?? [];
        arr.push(e);
        groups.set(e.categoryId, arr);
      }
      // Sort entries within each group by value desc
      for (const arr of groups.values()) {
        arr.sort((a, b) => b.value - a.value);
      }
      return groups;
    }, [data.entries, data.categories]);

    const groupedLiabilities = useMemo(() => {
      const liabEntries = data.entries.filter((e) => {
        const cat = data.categories.find((c) => c.id === e.categoryId);
        return cat?.kind === 'liability';
      });
      const groups = new Map<string, NetWorthEntry[]>();
      for (const e of liabEntries) {
        const arr = groups.get(e.categoryId) ?? [];
        arr.push(e);
        groups.set(e.categoryId, arr);
      }
      for (const arr of groups.values()) {
        arr.sort((a, b) => b.value - a.value);
      }
      return groups;
    }, [data.entries, data.categories]);

    const renderEntryGroup = (
      catId: string,
      entries: NetWorthEntry[],
      kind: NetWorthCategoryKind,
    ) => {
      const cat = data.categories.find((c) => c.id === catId);
      if (!cat) return null;
      const subtotal = entries.reduce((s, e) => s + e.value, 0);
      return (
        <div key={catId} className="space-y-1">
          <div className="flex items-center justify-between px-3 py-1 bg-muted/20 rounded-md">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {cat.name}
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                kind === 'asset'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {formatCurrency(subtotal, data.currency)}
            </span>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[1fr_140px_100px_32px] gap-2 px-3 py-1 items-center"
            >
              <input
                type="text"
                value={entry.name}
                onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                placeholder="Name"
                className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
              />
              <select
                value={entry.categoryId}
                onChange={(e) => updateEntry(entry.id, { categoryId: e.target.value })}
                className="border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
              >
                <optgroup label="Assets">
                  {assetCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Liabilities">
                  {liabilityCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={entry.value}
                onChange={(e) => updateEntry(entry.id, { value: Number(e.target.value) || 0 })}
                className={cn(
                  'border-0 bg-transparent text-[13px] text-right focus:outline-none tabular-nums w-full',
                  kind === 'asset'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              />
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
          ))}
        </div>
      );
    };

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
                <path d="M12 3v18" />
                <path d="M16 7l-8 0" />
                <path d="M18 12H6" />
                <path d="M16 17H8" />
                <circle cx="4" cy="7" r="1" />
                <circle cx="20" cy="17" r="1" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Net Worth</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Currency
            </label>
            <select
              value={data.currency}
              onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
              className={cn(inputClass, 'w-[200px]')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
                Categories
              </p>
              <button
                type="button"
                onClick={() => setShowAddCategory(true)}
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
                Add Custom
              </button>
            </div>

            {showAddCategory && (
              <div className="flex items-end gap-2 p-2 rounded-lg border border-border/60 bg-muted/10">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-muted-foreground">Name</label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Crypto"
                    className={inputClass}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCategory();
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Kind</label>
                  <select
                    value={newCatKind}
                    onChange={(e) => setNewCatKind(e.target.value as NetWorthCategoryKind)}
                    className={cn(inputClass, 'w-[110px]')}
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addCategory}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategory(false);
                    setNewCatName('');
                  }}
                  className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
            )}

            {/* Asset categories */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide px-1">
                Assets
              </p>
              {assetCategories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 px-1">
                  {cat.isDefault ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3 text-muted-foreground/40 shrink-0"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <span className="size-3 shrink-0" />
                  )}
                  {cat.isDefault ? (
                    <span className="text-[12px] text-muted-foreground flex-1">{cat.name}</span>
                  ) : (
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => renameCategory(cat.id, e.target.value)}
                      className="flex-1 border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
                    />
                  )}
                  {!cat.isDefault && (
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                  )}
                </div>
              ))}
            </div>

            {/* Liability categories */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide px-1">
                Liabilities
              </p>
              {liabilityCategories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 px-1">
                  {cat.isDefault ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3 text-muted-foreground/40 shrink-0"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <span className="size-3 shrink-0" />
                  )}
                  {cat.isDefault ? (
                    <span className="text-[12px] text-muted-foreground flex-1">{cat.name}</span>
                  ) : (
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => renameCategory(cat.id, e.target.value)}
                      className="flex-1 border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
                    />
                  )}
                  {!cat.isDefault && (
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add entry form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Entry
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newEntry.name}
                  onChange={(e) => setNewEntry((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Primary Residence"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Category</label>
                <select
                  value={newEntry.categoryId}
                  onChange={(e) => setNewEntry((p) => ({ ...p, categoryId: e.target.value }))}
                  className={cn(inputClass, 'w-[160px]')}
                >
                  <option value="">Select...</option>
                  <optgroup label="Assets">
                    {assetCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Liabilities">
                    {liabilityCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Value</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newEntry.value}
                  onChange={(e) => setNewEntry((p) => ({ ...p, value: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[110px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addEntry}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Entry list — Assets */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
              Assets ({data.entries.filter((e) => data.categories.find((c) => c.id === e.categoryId)?.kind === 'asset').length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {groupedAssets.size === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No assets yet
                </div>
              ) : (
                Array.from(groupedAssets.entries()).map(([catId, entries]) =>
                  renderEntryGroup(catId, entries, 'asset'),
                )
              )}
            </div>
          </div>

          {/* Entry list — Liabilities */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Liabilities ({data.entries.filter((e) => data.categories.find((c) => c.id === e.categoryId)?.kind === 'liability').length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {groupedLiabilities.size === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No liabilities yet
                </div>
              ) : (
                Array.from(groupedLiabilities.entries()).map(([catId, entries]) =>
                  renderEntryGroup(catId, entries, 'liability'),
                )
              )}
            </div>
          </div>

          {/* Summary footer */}
          <div className="grid grid-cols-4 gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Assets
              </p>
              <p className="text-[16px] font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatCurrency(result.totalAssets, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Liabilities
              </p>
              <p className="text-[16px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                {formatCurrency(result.totalLiabilities, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Net Worth</p>
              <p
                className={cn(
                  'text-[16px] font-bold tabular-nums',
                  healthColor === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(result.netWorth, data.currency)}
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
