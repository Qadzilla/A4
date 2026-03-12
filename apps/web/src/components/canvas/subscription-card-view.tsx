import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  SUBSCRIPTION_CATEGORY_COLORS,
  SUBSCRIPTION_FREQUENCIES,
  computeNextBillingDate,
  computeSubscriptionTotals,
  cycleSubscriptionStatus,
} from '../../lib/subscription-utils';
import type {
  SubscriptionCardData,
  SubscriptionFrequency,
  SubscriptionStatus,
} from '../../lib/subscription-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'rounded-md border border-border bg-muted/20 px-1.5 py-1 pr-6 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:12px_12px] bg-[position:right_4px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] cursor-pointer';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function defaultViewConfig(): SubscriptionCardData {
  return { currency: 'USD', notes: '' };
}

const statusStyles: Record<SubscriptionStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
};

export const SubscriptionCardView = memo(
  function SubscriptionCardView({
    item,
    workspaceId,
  }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<SubscriptionCardData>(() => {
      const d = item.data as SubscriptionCardData | undefined;
      return d?.currency ? { ...defaultViewConfig(), ...d } : defaultViewConfig();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Filter state
    const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // New subscription form
    const [newSub, setNewSub] = useState({
      name: '',
      amount: '',
      frequency: 'monthly' as SubscriptionFrequency,
      startDate: new Date().toISOString().slice(0, 10),
      categoryId: '',
    });

    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as SubscriptionCardData | undefined;
      setViewConfig(d?.currency ? { ...defaultViewConfig(), ...d } : defaultViewConfig());
      dirtyRef.current = false;
    }, [item.id]);

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

    const updateView = (patch: Partial<SubscriptionCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: subs = [], isLoading: subsLoading } = useQuery(
      trpc.subscription.list.queryOptions({ workspaceId }),
    );
    const { data: categories = [], isLoading: catLoading } = useQuery(
      trpc.category.list.queryOptions({ workspaceId, context: 'subscription' }),
    );

    const isLoading = subsLoading || catLoading;

    // ── tRPC mutations ──
    const subQueryKey = trpc.subscription.list.queryKey();
    const summaryQueryKey = trpc.subscription.getSummary.queryKey();
    const catQueryKey = trpc.category.list.queryKey();

    const invalidateSubs = () => {
      queryClient.invalidateQueries({ queryKey: subQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createSub = useMutation(
      trpc.subscription.create.mutationOptions({ onSuccess: invalidateSubs }),
    );
    const updateSub = useMutation(
      trpc.subscription.update.mutationOptions({ onSuccess: invalidateSubs }),
    );
    const deleteSub = useMutation(
      trpc.subscription.delete.mutationOptions({ onSuccess: invalidateSubs }),
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

    // ── Subscription actions ──
    const addSubscription = () => {
      const amount = Number(newSub.amount);
      if (!newSub.name.trim() || !amount || amount <= 0) return;
      createSub.mutate({
        workspaceId,
        name: newSub.name.trim(),
        amount,
        frequency: newSub.frequency,
        startDate: newSub.startDate,
        nextBillingDate: computeNextBillingDate(newSub.startDate, newSub.frequency),
        categoryId: newSub.categoryId || null,
        status: 'active',
      });
      setNewSub({
        name: '',
        amount: '',
        frequency: 'monthly',
        startDate: new Date().toISOString().slice(0, 10),
        categoryId: '',
      });
    };

    const removeSubscription = (id: string) => {
      deleteSub.mutate({ id });
    };

    const handleSubBlur = (id: string, field: string, value: string | number) => {
      const existing = subs.find((s) => s.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;

      const data: Record<string, string | number> = { [field]: value };

      // Recompute nextBillingDate when frequency or startDate changes
      if (field === 'frequency' || field === 'startDate') {
        const startDate = field === 'startDate' ? (value as string) : existing.startDate;
        const frequency = field === 'frequency' ? (value as string) : existing.frequency;
        data.nextBillingDate = computeNextBillingDate(
          startDate,
          frequency as SubscriptionFrequency,
        );
      }

      updateSub.mutate({ id, data });
    };

    const handleStatusCycle = (id: string, currentStatus: SubscriptionStatus) => {
      updateSub.mutate({ id, data: { status: cycleSubscriptionStatus(currentStatus) } });
    };

    // ── Category actions ──
    const addCategory = () => {
      const usedColors = new Set(categories.map((c: { color: string }) => c.color));
      const nextColor =
        SUBSCRIPTION_CATEGORY_COLORS.find((c) => !usedColors.has(c)) ??
        SUBSCRIPTION_CATEGORY_COLORS[0]!;
      createCat.mutate({
        workspaceId,
        name: 'Unnamed',
        color: nextColor,
        type: 'both',
        context: 'subscription',
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

    // ── Computed values ──
    const { monthlyCost, annualCost, byStatus } = computeSubscriptionTotals(
      subs.map((s) => ({
        ...s,
        notes: s.notes ?? '',
        categoryId: s.categoryId ?? undefined,
        frequency: s.frequency as SubscriptionFrequency,
        status: s.status as SubscriptionStatus,
      })),
    );

    const displaySubscriptions = useMemo(() => {
      let filtered = [...subs].sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));
      if (statusFilter !== 'all') {
        filtered = filtered.filter((s) => s.status === statusFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((s) => (s.categoryId ?? '') === categoryFilter);
      }
      return filtered;
    }, [subs, statusFilter, categoryFilter]);

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading subscriptions...</p>
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
                <path d="M17 2.1l4 4-4 4" />
                <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4" />
                <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Subscriptions</p>
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
              onChange={(e) => updateView({ currency: e.target.value as SupportedCurrency })}
              className={cn(selectClass, 'w-[200px]')}
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
                      {SUBSCRIPTION_CATEGORY_COLORS.map((color) => (
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

          {/* Add subscription form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Subscription
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px] space-y-1">
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
                  className={cn(inputClass, 'w-[90px] font-mono', numberInputSpinner)}
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
                  className={cn(selectClass, 'w-[110px]')}
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
              {categories.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    value={newSub.categoryId}
                    onChange={(e) => setNewSub((p) => ({ ...p, categoryId: e.target.value }))}
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
                onClick={addSubscription}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm active:scale-[0.98]"
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

          {/* Subscription list */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Subscriptions ({displaySubscriptions.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              <div className="hidden sm:grid grid-cols-[1fr_90px_100px_100px_90px_80px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                  const cat = categories.find((c) => c.id === sub.categoryId);
                  return (
                    <div
                      key={sub.id}
                      className="group grid grid-cols-1 sm:grid-cols-[1fr_90px_100px_100px_90px_80px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                    >
                      <input
                        type="text"
                        defaultValue={sub.name}
                        onBlur={(e) => handleSubBlur(sub.id, 'name', e.target.value)}
                        placeholder="Name"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        defaultValue={sub.amount}
                        onBlur={(e) =>
                          handleSubBlur(sub.id, 'amount', Number(e.target.value) || 0)
                        }
                        className={cn('rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50', numberInputSpinner)}
                      />
                      <select
                        value={sub.frequency}
                        onChange={(e) => handleSubBlur(sub.id, 'frequency', e.target.value)}
                        className={inlineSelectClass}
                      >
                        {SUBSCRIPTION_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        defaultValue={sub.nextBillingDate}
                        onBlur={(e) =>
                          handleSubBlur(sub.id, 'nextBillingDate', e.target.value)
                        }
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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
                          handleStatusCycle(sub.id, sub.status as SubscriptionStatus)
                        }
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium capitalize transition-colors cursor-pointer border',
                          statusStyles[sub.status as SubscriptionStatus],
                        )}
                      >
                        {sub.status}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubscription(sub.id)}
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
                Monthly Cost
              </p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums">
                {formatCurrency(monthlyCost, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Annual Cost
              </p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums">
                {formatCurrency(annualCost, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums">
                {byStatus.active}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums">{subs.length}</p>
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
