import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  computeNetWorth,
  createDefaultNetWorthData,
  getNetWorthHealthColor,
} from '../../lib/networth-utils';
import type {
  NetWorthCardData,
  NetWorthCategory,
  NetWorthCategoryKind,
  NetWorthEntry,
} from '../../lib/networth-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'rounded-md border border-border bg-muted/20 px-1.5 py-1 pr-7 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] cursor-pointer';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export const NetWorthCardView = memo(
  function NetWorthCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<NetWorthCardData>(() => {
      const d = item.data as NetWorthCardData | undefined;
      return d?.currency ? { ...createDefaultNetWorthData(), ...d } : createDefaultNetWorthData();
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
      setViewConfig(
        d?.currency ? { ...createDefaultNetWorthData(), ...d } : createDefaultNetWorthData(),
      );
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

    const updateConfig = (patch: Partial<NetWorthCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: dbCategories = [], isLoading: catLoading } = useQuery(
      trpc.networth.listCategories.queryOptions({ workspaceId }),
    );
    const { data: dbEntries = [], isLoading: entryLoading } = useQuery(
      trpc.networth.listEntries.queryOptions({ workspaceId }),
    );

    const isLoading = catLoading || entryLoading;

    // ── Seed defaults on mount if empty ──
    const seedDefaults = useMutation(
      trpc.networth.seedDefaults.mutationOptions({
        onSuccess: (result) => {
          if (result.seeded) {
            queryClient.invalidateQueries({ queryKey: catQueryKey });
          }
        },
      }),
    );
    const seededRef = useRef(false);

    useEffect(() => {
      if (!catLoading && dbCategories.length === 0 && !seededRef.current) {
        seededRef.current = true;
        seedDefaults.mutate({ workspaceId });
      }
    }, [catLoading, dbCategories.length, workspaceId, seedDefaults]);

    // ── tRPC mutations ──
    const catQueryKey = trpc.networth.listCategories.queryKey();
    const entryQueryKey = trpc.networth.listEntries.queryKey();
    const summaryQueryKey = trpc.networth.getSummary.queryKey();

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: catQueryKey });
      queryClient.invalidateQueries({ queryKey: entryQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const invalidateEntries = () => {
      queryClient.invalidateQueries({ queryKey: entryQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createCategory = useMutation(
      trpc.networth.createCategory.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: catQueryKey }),
      }),
    );
    const updateCategory = useMutation(
      trpc.networth.updateCategory.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: catQueryKey }),
      }),
    );
    const deleteCategory = useMutation(
      trpc.networth.deleteCategory.mutationOptions({ onSuccess: invalidateAll }),
    );
    const createEntry = useMutation(
      trpc.networth.createEntry.mutationOptions({ onSuccess: invalidateEntries }),
    );
    const updateEntry = useMutation(
      trpc.networth.updateEntry.mutationOptions({ onSuccess: invalidateEntries }),
    );
    const deleteEntry = useMutation(
      trpc.networth.deleteEntry.mutationOptions({ onSuccess: invalidateEntries }),
    );

    // ── Entry mutations ──
    const addEntry = () => {
      const value = Number(newEntry.value);
      if (!newEntry.name.trim() || !newEntry.categoryId || Number.isNaN(value) || value < 0) return;
      createEntry.mutate({
        workspaceId,
        name: newEntry.name.trim(),
        categoryId: newEntry.categoryId,
        value,
      });
      setNewEntry({ name: '', categoryId: '', value: '' });
    };

    const removeEntry = (id: string) => {
      deleteEntry.mutate({ id });
    };

    const handleEntryBlur = (id: string, field: string, value: string | number) => {
      const existing = dbEntries.find((e) => e.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateEntry.mutate({ id, data: { [field]: value } });
    };

    // ── Category mutations ──
    const addCategory = () => {
      if (!newCatName.trim()) return;
      createCategory.mutate({
        workspaceId,
        name: newCatName.trim(),
        kind: newCatKind,
      });
      setNewCatName('');
      setShowAddCategory(false);
    };

    const removeCategory = (id: string) => {
      deleteCategory.mutate({ id });
    };

    const handleCategoryNameBlur = (id: string, name: string) => {
      const existing = dbCategories.find((c) => c.id === id);
      if (!existing || existing.name === name) return;
      updateCategory.mutate({ id, data: { name: name.trim() || existing.name } });
    };

    // ── Map DB data to local types ──
    const categories: NetWorthCategory[] = useMemo(
      () =>
        dbCategories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind as NetWorthCategoryKind,
          isDefault: !!c.isDefault,
        })),
      [dbCategories],
    );

    const entries: NetWorthEntry[] = useMemo(
      () =>
        dbEntries.map((e) => ({
          id: e.id,
          name: e.name,
          categoryId: e.categoryId,
          value: e.value,
          notes: e.notes ?? '',
        })),
      [dbEntries],
    );

    // ── Computed ──
    const result = computeNetWorth(categories, entries);
    const healthColor = getNetWorthHealthColor(result.netWorth);

    const assetCategories = useMemo(
      () => categories.filter((c) => c.kind === 'asset'),
      [categories],
    );
    const liabilityCategories = useMemo(
      () => categories.filter((c) => c.kind === 'liability'),
      [categories],
    );

    // Group entries by section (asset/liability) then by category
    const groupedAssets = useMemo(() => {
      const assetEntries = entries.filter((e) => {
        const cat = categories.find((c) => c.id === e.categoryId);
        return cat?.kind === 'asset';
      });
      const groups = new Map<string, NetWorthEntry[]>();
      for (const e of assetEntries) {
        const arr = groups.get(e.categoryId) ?? [];
        arr.push(e);
        groups.set(e.categoryId, arr);
      }
      for (const arr of groups.values()) {
        arr.sort((a, b) => b.value - a.value);
      }
      return groups;
    }, [entries, categories]);

    const groupedLiabilities = useMemo(() => {
      const liabEntries = entries.filter((e) => {
        const cat = categories.find((c) => c.id === e.categoryId);
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
    }, [entries, categories]);

    const renderEntryGroup = (
      catId: string,
      groupEntries: NetWorthEntry[],
      kind: NetWorthCategoryKind,
    ) => {
      const cat = categories.find((c) => c.id === catId);
      if (!cat) return null;
      const subtotal = groupEntries.reduce((s, e) => s + e.value, 0);
      return (
        <div key={catId} className="space-y-1">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 rounded-md">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {cat.name}
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold font-mono tabular-nums',
                kind === 'asset'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {formatCurrency(subtotal, viewConfig.currency)}
            </span>
          </div>
          {groupEntries.map((entry) => (
            <div
              key={entry.id}
              className="group grid grid-cols-1 sm:grid-cols-[1fr_140px_100px_32px] gap-2 px-3 py-2 items-center transition-colors hover:bg-muted/20"
            >
              <input
                type="text"
                defaultValue={entry.name}
                onBlur={(e) => handleEntryBlur(entry.id, 'name', e.target.value)}
                placeholder="Name"
                className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <select
                defaultValue={entry.categoryId}
                onChange={(e) => handleEntryBlur(entry.id, 'categoryId', e.target.value)}
                className={cn(inlineSelectClass, 'w-full')}
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
                defaultValue={entry.value}
                onBlur={(e) => handleEntryBlur(entry.id, 'value', Number(e.target.value) || 0)}
                className={cn(
                  'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                  numberInputSpinner,
                  kind === 'asset'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              />
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
          ))}
        </div>
      );
    };

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading net worth...</p>
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
                <path d="M12 3v18" />
                <path d="M16 7l-8 0" />
                <path d="M18 12H6" />
                <path d="M16 17H8" />
                <circle cx="4" cy="7" r="1" />
                <circle cx="20" cy="17" r="1" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Net Worth</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Currency
            </label>
            <select
              value={viewConfig.currency}
              onChange={(e) => updateConfig({ currency: e.target.value as SupportedCurrency })}
              className={cn(selectClass, 'w-full sm:w-[200px]')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              <button
                type="button"
                onClick={() => setShowAddCategory(true)}
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
                Add Custom
              </button>
            </div>

            {showAddCategory && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 p-3 rounded-lg border border-border/60 bg-muted/10">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
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
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Kind</label>
                  <select
                    value={newCatKind}
                    onChange={(e) => setNewCatKind(e.target.value as NetWorthCategoryKind)}
                    className={cn(selectClass, 'sm:w-[110px]')}
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addCategory}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
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
                    className="size-3.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Asset categories */}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider px-1">
                Assets
              </p>
              {assetCategories.map((cat) => (
                <div key={cat.id} className="group flex items-center gap-2 px-1">
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
                      defaultValue={cat.name}
                      onBlur={(e) => handleCategoryNameBlur(cat.id, e.target.value)}
                      className="flex-1 rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                  )}
                  {!cat.isDefault && (
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-5 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider px-1">
                Liabilities
              </p>
              {liabilityCategories.map((cat) => (
                <div key={cat.id} className="group flex items-center gap-2 px-1">
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
                      defaultValue={cat.name}
                      onBlur={(e) => handleCategoryNameBlur(cat.id, e.target.value)}
                      className="flex-1 rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                  )}
                  {!cat.isDefault && (
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="flex items-center justify-center size-5 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Entry
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
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
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                <select
                  value={newEntry.categoryId}
                  onChange={(e) => setNewEntry((p) => ({ ...p, categoryId: e.target.value }))}
                  className={cn(selectClass, 'sm:w-[160px]')}
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
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Value</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newEntry.value}
                  onChange={(e) => setNewEntry((p) => ({ ...p, value: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'sm:w-[110px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addEntry();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addEntry}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Entry list — Assets */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
              Assets (
              {
                entries.filter(
                  (e) => categories.find((c) => c.id === e.categoryId)?.kind === 'asset',
                ).length
              }
              )
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {groupedAssets.size === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No assets yet
                </div>
              ) : (
                Array.from(groupedAssets.entries()).map(([catId, catEntries]) =>
                  renderEntryGroup(catId, catEntries, 'asset'),
                )
              )}
            </div>
          </div>

          {/* Entry list — Liabilities */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Liabilities (
              {
                entries.filter(
                  (e) => categories.find((c) => c.id === e.categoryId)?.kind === 'liability',
                ).length
              }
              )
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {groupedLiabilities.size === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No liabilities yet
                </div>
              ) : (
                Array.from(groupedLiabilities.entries()).map(([catId, catEntries]) =>
                  renderEntryGroup(catId, catEntries, 'liability'),
                )
              )}
            </div>
          </div>

          {/* Summary footer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Assets
              </p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums mt-1">
                {formatCurrency(result.totalAssets, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Liabilities
              </p>
              <p className="text-[16px] font-semibold text-red-600 dark:text-red-400 font-mono tabular-nums mt-1">
                {formatCurrency(result.totalLiabilities, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Net Worth</p>
              <p
                className={cn(
                  'text-[16px] font-semibold font-mono tabular-nums mt-1',
                  healthColor === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(result.netWorth, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Entries</p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums mt-1">{entries.length}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={viewConfig.notes}
              onChange={(e) => updateConfig({ notes: e.target.value })}
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
