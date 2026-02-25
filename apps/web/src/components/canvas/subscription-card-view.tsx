import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  SUBSCRIPTION_CATEGORY_COLORS,
  SUBSCRIPTION_FREQUENCIES,
  computeNextBillingDate,
  computeSubscriptionTotals,
  cycleSubscriptionStatus,
  getSubscriptionStatusColor,
} from '../../lib/subscription-utils';
import type {
  Subscription,
  SubscriptionCardData,
  SubscriptionCategory,
  SubscriptionFrequency,
  SubscriptionStatus,
} from '../../lib/subscription-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

function defaultData(): SubscriptionCardData {
  return {
    currency: 'USD',
    categories: [],
    subscriptions: [],
    notes: '',
  };
}

const statusStyles: Record<SubscriptionStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export const SubscriptionCardView = memo(
  function SubscriptionCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<SubscriptionCardData>(() => {
      const d = item.data as SubscriptionCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Filter state (view-only, not persisted)
    const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // New subscription form state
    const [newSub, setNewSub] = useState({
      name: '',
      amount: '',
      frequency: 'monthly' as SubscriptionFrequency,
      startDate: new Date().toISOString().slice(0, 10),
      categoryId: '',
    });

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as SubscriptionCardData | undefined;
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

    const update = (patch: Partial<SubscriptionCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    // Subscription mutations
    const addSubscription = () => {
      const amount = Number(newSub.amount);
      if (!newSub.name.trim() || !amount || amount <= 0) return;
      const sub: Subscription = {
        id: crypto.randomUUID(),
        name: newSub.name.trim(),
        amount,
        frequency: newSub.frequency,
        startDate: newSub.startDate,
        nextBillingDate: computeNextBillingDate(newSub.startDate, newSub.frequency),
        categoryId: newSub.categoryId || undefined,
        status: 'active',
        notes: '',
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, subscriptions: [...prev.subscriptions, sub] }));
      setNewSub({
        name: '',
        amount: '',
        frequency: 'monthly',
        startDate: new Date().toISOString().slice(0, 10),
        categoryId: '',
      });
    };

    const removeSubscription = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((s) => s.id !== id),
      }));
    };

    const updateSubscription = (id: string, patch: Partial<Subscription>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...s, ...patch };
          // Recompute nextBillingDate when frequency or startDate changes
          if (patch.frequency || patch.startDate) {
            updated.nextBillingDate = computeNextBillingDate(updated.startDate, updated.frequency);
          }
          return updated;
        }),
      }));
    };

    // Category mutations
    const addCategory = () => {
      const usedColors = new Set(data.categories.map((c) => c.color));
      const nextColor =
        SUBSCRIPTION_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ??
        SUBSCRIPTION_CATEGORY_COLORS[0]!;
      const cat: SubscriptionCategory = {
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
        subscriptions: prev.subscriptions.map((s) =>
          s.categoryId === id ? { ...s, categoryId: undefined } : s,
        ),
      }));
    };

    const updateCategory = (id: string, patch: Partial<SubscriptionCategory>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    };

    // Computed values
    const { monthlyCost, annualCost, byStatus } = computeSubscriptionTotals(data.subscriptions);

    // Display subscriptions: sorted by nextBillingDate asc, then filtered
    const displaySubscriptions = useMemo(() => {
      let filtered = [...data.subscriptions].sort((a, b) =>
        a.nextBillingDate.localeCompare(b.nextBillingDate),
      );
      if (statusFilter !== 'all') {
        filtered = filtered.filter((s) => s.status === statusFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((s) => (s.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [data.subscriptions, statusFilter, categoryFilter]);

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
                <path d="M17 2.1l4 4-4 4" />
                <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4" />
                <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Subscriptions</p>
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
                      {SUBSCRIPTION_CATEGORY_COLORS.map((color) => (
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

          {/* Add subscription form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Subscription
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newSub.name}
                  onChange={(e) => setNewSub((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Netflix"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addSubscription();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newSub.amount}
                  onChange={(e) => setNewSub((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[90px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addSubscription();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Frequency</label>
                <select
                  value={newSub.frequency}
                  onChange={(e) =>
                    setNewSub((p) => ({ ...p, frequency: e.target.value as SubscriptionFrequency }))
                  }
                  className={cn(inputClass, 'w-[110px]')}
                >
                  {SUBSCRIPTION_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Start Date</label>
                <input
                  type="date"
                  value={newSub.startDate}
                  onChange={(e) => setNewSub((p) => ({ ...p, startDate: e.target.value }))}
                  className={cn(inputClass, 'w-[130px]')}
                />
              </div>
              {data.categories.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    value={newSub.categoryId}
                    onChange={(e) => setNewSub((p) => ({ ...p, categoryId: e.target.value }))}
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
                onClick={addSubscription}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['all', 'active', 'paused', 'cancelled'] as const).map((s) => (
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

          {/* Subscription list */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Subscriptions ({displaySubscriptions.length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_90px_100px_100px_90px_80px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Name</span>
                <span className="text-right">Amount</span>
                <span>Frequency</span>
                <span>Next Billing</span>
                <span>Category</span>
                <span>Status</span>
                <span />
              </div>

              {displaySubscriptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No subscriptions
                  {statusFilter !== 'all' || categoryFilter !== 'all' ? ' match filter' : ' yet'}
                </div>
              ) : (
                displaySubscriptions.map((sub) => {
                  const cat = data.categories.find((c) => c.id === sub.categoryId);
                  return (
                    <div
                      key={sub.id}
                      className="grid grid-cols-[1fr_90px_100px_100px_90px_80px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                    >
                      <input
                        type="text"
                        value={sub.name}
                        onChange={(e) => updateSubscription(sub.id, { name: e.target.value })}
                        placeholder="Name"
                        className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={sub.amount}
                        onChange={(e) =>
                          updateSubscription(sub.id, { amount: Number(e.target.value) || 0 })
                        }
                        className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                      />
                      <select
                        value={sub.frequency}
                        onChange={(e) =>
                          updateSubscription(sub.id, {
                            frequency: e.target.value as SubscriptionFrequency,
                          })
                        }
                        className="border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
                      >
                        {SUBSCRIPTION_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={sub.nextBillingDate}
                        onChange={(e) =>
                          updateSubscription(sub.id, { nextBillingDate: e.target.value })
                        }
                        className="border-0 bg-transparent text-[12px] text-black dark:text-zinc-100 focus:outline-none"
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
                      <button
                        type="button"
                        onClick={() =>
                          updateSubscription(sub.id, {
                            status: cycleSubscriptionStatus(sub.status),
                          })
                        }
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium capitalize transition-colors cursor-pointer',
                          statusStyles[sub.status],
                        )}
                      >
                        {sub.status}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubscription(sub.id)}
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
                Monthly Cost
              </p>
              <p className="text-[16px] font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatCurrency(monthlyCost, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Annual Cost
              </p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {formatCurrency(annualCost, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</p>
              <p className="text-[16px] font-bold text-green-600 dark:text-green-400 tabular-nums">
                {byStatus.active}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {data.subscriptions.length}
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
