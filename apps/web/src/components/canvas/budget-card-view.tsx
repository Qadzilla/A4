import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useRef, useState } from 'react';
import {
  BUDGET_CURRENCIES,
  BUDGET_GROUP_COLORS,
  computeCategoryPercent,
  computeCategoryRemaining,
  formatBudgetCurrency,
  formatBudgetPeriod,
  getBudgetHealthColor,
  resolveCategoryActual,
} from '../../lib/budget-utils';
import type {
  BudgetAggregation,
  BudgetCardData,
  BudgetCategory,
  BudgetCategorySource,
  BudgetCurrency,
  BudgetPeriod,
  BudgetPeriodType,
} from '../../lib/budget-utils';
import type { TableCardData } from '../../lib/table-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const AGGREGATION_OPTIONS: { value: BudgetAggregation; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'latest', label: 'Latest' },
];

const PERIOD_TYPES: { value: BudgetPeriodType; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2 py-1 pr-7 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")]';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function ProgressBar({ percent }: { percent: number }) {
  const health = getBudgetHealthColor(percent);
  const barColor =
    health === 'green' ? 'bg-green-500' : health === 'yellow' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', barColor)}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function defaultViewConfig(): BudgetCardData {
  const now = new Date();
  return {
    period: { type: 'monthly', month: now.getMonth() + 1, year: now.getFullYear() },
    currency: 'USD',
    notes: '',
  };
}

export const BudgetCardView = memo(
  function BudgetCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const canvasItems = useCanvasStore((s) => s.items);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<BudgetCardData>(() => {
      const d = item.data as BudgetCardData | undefined;
      return d?.period ? { ...defaultViewConfig(), ...d } : defaultViewConfig();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    const tableItems = canvasItems.filter((i) => i.type === 'table-card');

    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as BudgetCardData | undefined;
      setViewConfig(d?.period ? { ...defaultViewConfig(), ...d } : defaultViewConfig());
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

    const markDirty = () => {
      dirtyRef.current = true;
    };

    const updatePeriod = (patch: Partial<BudgetPeriod>) => {
      markDirty();
      setViewConfig((prev) => ({ ...prev, period: { ...prev.period, ...patch } }));
    };

    // ── tRPC queries ──
    const { data: dbCategories = [], isLoading: catLoading } = useQuery(
      trpc.budget.listCategories.queryOptions({ workspaceId }),
    );
    const { data: dbGroups = [], isLoading: grpLoading } = useQuery(
      trpc.budget.listGroups.queryOptions({ workspaceId }),
    );

    const isLoading = catLoading || grpLoading;

    // ── tRPC mutations ──
    const catQueryKey = trpc.budget.listCategories.queryKey();
    const grpQueryKey = trpc.budget.listGroups.queryKey();
    const summaryQueryKey = trpc.budget.getSummary.queryKey();

    const invalidateCats = () => {
      queryClient.invalidateQueries({ queryKey: catQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };
    const invalidateGroups = () => {
      queryClient.invalidateQueries({ queryKey: grpQueryKey });
      queryClient.invalidateQueries({ queryKey: catQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createCat = useMutation(
      trpc.budget.createCategory.mutationOptions({ onSuccess: invalidateCats }),
    );
    const updateCat = useMutation(
      trpc.budget.updateCategory.mutationOptions({ onSuccess: invalidateCats }),
    );
    const deleteCat = useMutation(
      trpc.budget.deleteCategory.mutationOptions({ onSuccess: invalidateCats }),
    );
    const createGrp = useMutation(
      trpc.budget.createGroup.mutationOptions({ onSuccess: invalidateGroups }),
    );
    const updateGrp = useMutation(
      trpc.budget.updateGroup.mutationOptions({ onSuccess: invalidateGroups }),
    );
    const deleteGrp = useMutation(
      trpc.budget.deleteGroup.mutationOptions({ onSuccess: invalidateGroups }),
    );

    // ── Category actions ──
    const addCategory = (groupId?: string) => {
      createCat.mutate({
        workspaceId,
        name: '',
        budgeted: 0,
        actual: 0,
        groupId: groupId ?? null,
      });
    };

    const removeCategory = (id: string) => {
      deleteCat.mutate({ id });
    };

    const handleCategoryFieldBlur = (id: string, field: string, value: string | number | null) => {
      const existing = dbCategories.find((c) => c.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateCat.mutate({ id, data: { [field]: value } });
    };

    const updateCategorySource = (catId: string, patch: Partial<BudgetCategorySource>) => {
      const existing = dbCategories.find((c) => c.id === catId);
      if (!existing) return;
      const currentSource: BudgetCategorySource = existing.source
        ? JSON.parse(existing.source)
        : { tableItemId: '', columnId: '', aggregation: 'sum' as BudgetAggregation };
      const newSource = { ...currentSource, ...patch };
      updateCat.mutate({ id: catId, data: { source: JSON.stringify(newSource) } });
    };

    const toggleCategoryLinked = (catId: string) => {
      const existing = dbCategories.find((c) => c.id === catId);
      if (!existing) return;
      if (existing.source) {
        updateCat.mutate({ id: catId, data: { source: null } });
      } else {
        const firstTable = tableItems[0];
        const firstTableData = firstTable?.data as TableCardData | undefined;
        const firstCol = firstTableData?.columns?.[0];
        const source: BudgetCategorySource = {
          tableItemId: firstTable?.id ?? '',
          columnId: firstCol?.id ?? '',
          aggregation: 'sum',
        };
        updateCat.mutate({ id: catId, data: { source: JSON.stringify(source) } });
      }
    };

    // ── Group actions ──
    const addGroup = () => {
      const usedColors = new Set(dbGroups.map((g) => g.color));
      const color = BUDGET_GROUP_COLORS.find((c) => !usedColors.has(c)) ?? BUDGET_GROUP_COLORS[0]!;
      createGrp.mutate({ workspaceId, name: '', color });
    };

    const handleGroupNameBlur = (id: string, name: string) => {
      const existing = dbGroups.find((g) => g.id === id);
      if (!existing || existing.name === name) return;
      updateGrp.mutate({ id, data: { name } });
    };

    const handleGroupColorChange = (id: string, color: string) => {
      updateGrp.mutate({ id, data: { color } });
    };

    const removeGroup = (id: string) => {
      deleteGrp.mutate({ id });
    };

    // ── Compute totals (with resolved actuals from table bindings) ──
    const budgetCats: BudgetCategory[] = dbCategories.map((c) => ({
      id: c.id,
      name: c.name,
      budgeted: c.budgeted,
      actual: c.actual,
      source: c.source ? JSON.parse(c.source) : undefined,
      notes: c.notes ?? '',
      groupId: c.groupId ?? undefined,
    }));

    let totalBudgeted = 0;
    let totalActual = 0;
    for (const cat of budgetCats) {
      totalBudgeted += cat.budgeted;
      totalActual += resolveCategoryActual(cat, canvasItems);
    }
    const remaining = totalBudgeted - totalActual;
    const percent =
      totalBudgeted === 0 ? (totalActual === 0 ? 0 : 100) : (totalActual / totalBudgeted) * 100;

    // Group categories by group
    const groupedCategories = new Map<string | undefined, BudgetCategory[]>();
    for (const cat of budgetCats) {
      const key = cat.groupId;
      if (!groupedCategories.has(key)) groupedCategories.set(key, []);
      groupedCategories.get(key)?.push(cat);
    }

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading budget...</p>
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
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                {item.name}
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                {formatBudgetPeriod(viewConfig.period)}
              </p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Period selector */}
          <div className="space-y-3">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Period
            </label>
            <div className="flex gap-1">
              {PERIOD_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => updatePeriod({ type: pt.value })}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-[12px] font-medium transition-colors',
                    viewConfig.period.type === pt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {pt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {viewConfig.period.type === 'monthly' && (
                <select
                  value={viewConfig.period.month ?? 1}
                  onChange={(e) => updatePeriod({ month: Number(e.target.value) })}
                  className={cn(selectClass, 'flex-1')}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              {viewConfig.period.type === 'quarterly' && (
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => updatePeriod({ quarter: q })}
                      className={cn(
                        'flex-1 rounded-md border py-1.5 text-[12px] font-medium transition-colors',
                        viewConfig.period.quarter === q
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      Q{q}
                    </button>
                  ))}
                </div>
              )}
              {viewConfig.period.type === 'custom' && (
                <>
                  <input
                    type="date"
                    value={viewConfig.period.startDate ?? ''}
                    onChange={(e) => updatePeriod({ startDate: e.target.value })}
                    className={cn(inputClass, 'flex-1')}
                  />
                  <input
                    type="date"
                    value={viewConfig.period.endDate ?? ''}
                    onChange={(e) => updatePeriod({ endDate: e.target.value })}
                    className={cn(inputClass, 'flex-1')}
                  />
                </>
              )}
              {(viewConfig.period.type === 'monthly' ||
                viewConfig.period.type === 'quarterly' ||
                viewConfig.period.type === 'yearly') && (
                <input
                  type="number"
                  value={viewConfig.period.year}
                  onChange={(e) => updatePeriod({ year: Number(e.target.value) })}
                  className={cn(inputClass, 'w-24', numberInputSpinner)}
                />
              )}
            </div>
          </div>

          {/* Currency selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Currency
            </label>
            <select
              value={viewConfig.currency}
              onChange={(e) => {
                markDirty();
                setViewConfig((prev) => ({ ...prev, currency: e.target.value as BudgetCurrency }));
              }}
              className={selectClass}
            >
              {BUDGET_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} — {c.label} ({c.value})
                </option>
              ))}
            </select>
          </div>

          {/* Groups management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Groups
              </label>
              <button
                type="button"
                onClick={addGroup}
                className="flex items-center gap-1.5 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors"
              >
                + Add group
              </button>
            </div>
            {dbGroups.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/70 italic">No groups yet</p>
            ) : (
              <div className="space-y-2">
                {dbGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-background p-2"
                  >
                    <div className="flex gap-1">
                      {BUDGET_GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleGroupColorChange(group.id, color)}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            group.color === color
                              ? 'ring-2 ring-primary/20 shadow-sm scale-110'
                              : 'hover:scale-110',
                          )}
                          style={{ backgroundColor: color, borderColor: color }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      defaultValue={group.name}
                      onBlur={(e) => handleGroupNameBlur(group.id, e.target.value)}
                      placeholder="Group name"
                      className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="p-1 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete group (categories move to ungrouped)"
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories table */}
          <div className="space-y-3">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Categories
            </label>

            {dbGroups.map((group) => {
              const cats = groupedCategories.get(group.id) ?? [];
              return (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-1 h-5 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="text-[12px] font-semibold text-foreground">
                      {group.name || 'Unnamed group'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({cats.length})</span>
                  </div>
                  {cats.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      currency={viewConfig.currency}
                      items={canvasItems}
                      tableItems={tableItems}
                      onFieldBlur={handleCategoryFieldBlur}
                      onUpdateSource={(patch) => updateCategorySource(cat.id, patch)}
                      onToggleLinked={() => toggleCategoryLinked(cat.id)}
                      onRemove={() => removeCategory(cat.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addCategory(group.id)}
                    className="flex items-center gap-1.5 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors ml-3"
                  >
                    + Add category
                  </button>
                </div>
              );
            })}

            {/* Ungrouped categories */}
            {(() => {
              const ungrouped = groupedCategories.get(undefined) ?? [];
              if (ungrouped.length === 0 && dbGroups.length > 0) return null;
              return (
                <div className="space-y-2">
                  {dbGroups.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-5 rounded-full bg-muted-foreground/30" />
                      <span className="text-[12px] font-semibold text-muted-foreground">
                        Ungrouped
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({ungrouped.length})
                      </span>
                    </div>
                  )}
                  {ungrouped.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      currency={viewConfig.currency}
                      items={canvasItems}
                      tableItems={tableItems}
                      onFieldBlur={handleCategoryFieldBlur}
                      onUpdateSource={(patch) => updateCategorySource(cat.id, patch)}
                      onToggleLinked={() => toggleCategoryLinked(cat.id)}
                      onRemove={() => removeCategory(cat.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addCategory(undefined)}
                    className="flex items-center gap-1.5 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors ml-3"
                  >
                    + Add category
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border/60 bg-background p-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-medium text-muted-foreground">Total Budgeted</span>
              <span className="text-[14px] font-semibold text-foreground font-mono tabular-nums">
                {formatBudgetCurrency(totalBudgeted, viewConfig.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-medium text-muted-foreground">Total Actual</span>
              <span className="text-[14px] font-semibold text-foreground font-mono tabular-nums">
                {formatBudgetCurrency(totalActual, viewConfig.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-medium text-muted-foreground">Remaining</span>
              <span
                className={cn(
                  'text-[14px] font-semibold font-mono tabular-nums',
                  remaining >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatBudgetCurrency(remaining, viewConfig.currency)}
              </span>
            </div>
            <ProgressBar percent={percent} />
            <p
              className={cn(
                'text-[11px] font-medium text-right font-mono',
                getBudgetHealthColor(percent) === 'green' && 'text-green-600 dark:text-green-400',
                getBudgetHealthColor(percent) === 'yellow' && 'text-amber-600 dark:text-amber-400',
                getBudgetHealthColor(percent) === 'red' && 'text-red-600 dark:text-red-400',
              )}
            >
              {Math.round(percent)}% spent
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={viewConfig.notes}
              onChange={(e) => {
                markDirty();
                setViewConfig((prev) => ({ ...prev, notes: e.target.value }));
              }}
              placeholder="Budget notes..."
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

/* ---- Category row sub-component ---- */

interface CategoryRowProps {
  category: BudgetCategory;
  currency: BudgetCurrency;
  items: CanvasItem[];
  tableItems: CanvasItem[];
  onFieldBlur: (id: string, field: string, value: string | number | null) => void;
  onUpdateSource: (patch: Partial<BudgetCategorySource>) => void;
  onToggleLinked: () => void;
  onRemove: () => void;
}

function CategoryRow({
  category,
  currency,
  items,
  tableItems,
  onFieldBlur,
  onUpdateSource,
  onToggleLinked,
  onRemove,
}: CategoryRowProps) {
  const linked = !!category.source;
  const resolvedActual = resolveCategoryActual(category, items);
  const remaining = computeCategoryRemaining(category.budgeted, resolvedActual);
  const percent = computeCategoryPercent(category.budgeted, resolvedActual);
  const health = getBudgetHealthColor(percent);

  const selectedTable = category.source?.tableItemId
    ? items.find((i) => i.id === category.source?.tableItemId)
    : undefined;
  const selectedTableData = selectedTable?.data as TableCardData | undefined;
  const columns = selectedTableData?.columns ?? [];

  return (
    <div className="group rounded-lg border border-border/60 bg-background p-3 space-y-2 transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-2">
        <input
          type="text"
          defaultValue={category.name}
          onBlur={(e) => onFieldBlur(category.id, 'name', e.target.value)}
          placeholder="Category name"
          className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
        />
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Budget:</span>
          <input
            type="number"
            defaultValue={category.budgeted || ''}
            onBlur={(e) => onFieldBlur(category.id, 'budgeted', Number(e.target.value) || 0)}
            placeholder="0"
            className={cn(
              'w-24 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] font-mono text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50',
              numberInputSpinner,
            )}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <button
            type="button"
            onClick={onToggleLinked}
            className={cn(
              'flex size-3.5 items-center justify-center rounded border transition-colors',
              linked ? 'border-primary bg-primary text-white' : 'border-border bg-muted/20',
            )}
          >
            {linked && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          <span className="text-[11px] text-muted-foreground">Linked</span>
        </label>

        {!linked && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Actual:</span>
            <input
              type="number"
              defaultValue={category.actual || ''}
              onBlur={(e) => onFieldBlur(category.id, 'actual', Number(e.target.value) || 0)}
              placeholder="0"
              className={cn(
                'w-24 rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] font-mono text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50',
                numberInputSpinner,
              )}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground font-mono tabular-nums">
            {formatBudgetCurrency(resolvedActual, currency)} /{' '}
            {formatBudgetCurrency(category.budgeted, currency)}
          </span>
          <span
            className={cn(
              'font-medium font-mono',
              health === 'green' && 'text-green-600 dark:text-green-400',
              health === 'yellow' && 'text-amber-600 dark:text-amber-400',
              health === 'red' && 'text-red-600 dark:text-red-400',
            )}
          >
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      <ProgressBar percent={percent} />

      {linked && (
        <div className="space-y-2 rounded-md border border-border/40 bg-muted/10 p-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-muted-foreground">Table</label>
              {tableItems.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70 italic">
                  No tables on this canvas
                </p>
              ) : (
                <select
                  value={category.source?.tableItemId ?? ''}
                  onChange={(e) => {
                    const tableId = e.target.value;
                    const table = items.find((i) => i.id === tableId);
                    const td = table?.data as TableCardData | undefined;
                    const firstCol = td?.columns?.[0];
                    onUpdateSource({ tableItemId: tableId, columnId: firstCol?.id ?? '' });
                  }}
                  className={inlineSelectClass}
                >
                  <option value="">Select table...</option>
                  {tableItems.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {columns.length > 0 && (
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-muted-foreground">Column</label>
                <select
                  value={category.source?.columnId ?? ''}
                  onChange={(e) => onUpdateSource({ columnId: e.target.value })}
                  className={inlineSelectClass}
                >
                  <option value="">Select column...</option>
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Aggregation</label>
            <div className="flex flex-wrap gap-1">
              {AGGREGATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateSource({ aggregation: opt.value })}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                    category.source?.aggregation === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {category.source?.tableItemId && category.source?.columnId && (
            <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-center">
              <p className="text-[10px] text-muted-foreground">
                Resolved:{' '}
                <span className="font-semibold text-foreground font-mono">
                  {formatBudgetCurrency(resolvedActual, currency)}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
