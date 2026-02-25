import { cn } from '@a4/ui';
import { memo, useEffect, useRef, useState } from 'react';
import {
  BUDGET_CURRENCIES,
  BUDGET_GROUP_COLORS,
  computeBudgetTotals,
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
  BudgetGroup,
  BudgetPeriod,
  BudgetPeriodType,
} from '../../lib/budget-utils';
import type { TableCardData } from '../../lib/table-utils';
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

export const BudgetCardView = memo(
  function BudgetCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const items = useCanvasStore((s) => s.items);

    const [data, setData] = useState<BudgetCardData>(() => {
      const d = item.data as BudgetCardData | undefined;
      const now = new Date();
      return {
        period: d?.period ?? {
          type: 'monthly',
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
        currency: d?.currency ?? 'USD',
        groups: d?.groups ?? [],
        categories: d?.categories ?? [],
        notes: d?.notes ?? '',
      };
    });

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    const tableItems = items.filter((i) => i.type === 'table-card');

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as BudgetCardData | undefined;
      const now = new Date();
      setData({
        period: d?.period ?? {
          type: 'monthly',
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
        currency: d?.currency ?? 'USD',
        groups: d?.groups ?? [],
        categories: d?.categories ?? [],
        notes: d?.notes ?? '',
      });
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

    const markDirty = () => {
      dirtyRef.current = true;
    };

    const updatePeriod = (patch: Partial<BudgetPeriod>) => {
      markDirty();
      setData((prev) => ({ ...prev, period: { ...prev.period, ...patch } }));
    };

    const updateCategory = (catId: string, patch: Partial<BudgetCategory>) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === catId ? { ...c, ...patch } : c)),
      }));
    };

    const updateCategorySource = (catId: string, patch: Partial<BudgetCategorySource>) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === catId
            ? {
                ...c,
                source: {
                  tableItemId: '',
                  columnId: '',
                  aggregation: 'sum' as BudgetAggregation,
                  ...c.source,
                  ...patch,
                },
              }
            : c,
        ),
      }));
    };

    const addCategory = (groupId?: string) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        categories: [
          ...prev.categories,
          { id: crypto.randomUUID(), name: '', budgeted: 0, actual: 0, notes: '', groupId },
        ],
      }));
    };

    const removeCategory = (catId: string) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== catId),
      }));
    };

    const addGroup = () => {
      markDirty();
      const usedColors = new Set(data.groups.map((g) => g.color));
      const color = BUDGET_GROUP_COLORS.find((c) => !usedColors.has(c)) ?? BUDGET_GROUP_COLORS[0]!;
      setData((prev) => ({
        ...prev,
        groups: [...prev.groups, { id: crypto.randomUUID(), name: '', color }],
      }));
    };

    const updateGroup = (groupId: string, patch: Partial<BudgetGroup>) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
      }));
    };

    const removeGroup = (groupId: string) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
        categories: prev.categories.map((c) =>
          c.groupId === groupId ? { ...c, groupId: undefined } : c,
        ),
      }));
    };

    const toggleCategoryLinked = (catId: string) => {
      markDirty();
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => {
          if (c.id !== catId) return c;
          if (c.source) return { ...c, source: undefined };
          const firstTable = tableItems[0];
          const firstTableData = firstTable?.data as TableCardData | undefined;
          const firstCol = firstTableData?.columns?.[0];
          return {
            ...c,
            source: {
              tableItemId: firstTable?.id ?? '',
              columnId: firstCol?.id ?? '',
              aggregation: 'sum' as BudgetAggregation,
            },
          };
        }),
      }));
    };

    const totals = computeBudgetTotals(data.categories, items);

    // Group categories by group
    const groupedCategories = new Map<string | undefined, BudgetCategory[]>();
    for (const cat of data.categories) {
      const key = cat.groupId;
      if (!groupedCategories.has(key)) groupedCategories.set(key, []);
      groupedCategories.get(key)?.push(cat);
    }

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
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">
                {formatBudgetPeriod(data.period)}
              </p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Period selector */}
          <div className="space-y-3">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
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
                    data.period.type === pt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            {/* Conditional period inputs */}
            <div className="flex gap-2">
              {data.period.type === 'monthly' && (
                <select
                  value={data.period.month ?? 1}
                  onChange={(e) => updatePeriod({ month: Number(e.target.value) })}
                  className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              {data.period.type === 'quarterly' && (
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => updatePeriod({ quarter: q })}
                      className={cn(
                        'flex-1 rounded-md border py-1.5 text-[12px] font-medium transition-colors',
                        data.period.quarter === q
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      Q{q}
                    </button>
                  ))}
                </div>
              )}
              {data.period.type === 'custom' && (
                <>
                  <input
                    type="date"
                    value={data.period.startDate ?? ''}
                    onChange={(e) => updatePeriod({ startDate: e.target.value })}
                    className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                  />
                  <input
                    type="date"
                    value={data.period.endDate ?? ''}
                    onChange={(e) => updatePeriod({ endDate: e.target.value })}
                    className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                  />
                </>
              )}
              {(data.period.type === 'monthly' ||
                data.period.type === 'quarterly' ||
                data.period.type === 'yearly') && (
                <input
                  type="number"
                  value={data.period.year}
                  onChange={(e) => updatePeriod({ year: Number(e.target.value) })}
                  className="w-24 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                />
              )}
            </div>
          </div>

          {/* Currency selector */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Currency
            </label>
            <select
              value={data.currency}
              onChange={(e) => {
                markDirty();
                setData((prev) => ({ ...prev, currency: e.target.value as BudgetCurrency }));
              }}
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Groups
              </label>
              <button
                type="button"
                onClick={addGroup}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                + Add group
              </button>
            </div>
            {data.groups.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/70 italic">No groups yet</p>
            ) : (
              <div className="space-y-2">
                {data.groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-background p-2"
                  >
                    {/* Color picker */}
                    <div className="flex gap-1">
                      {BUDGET_GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateGroup(group.id, { color })}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            group.color === color
                              ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                              : 'hover:scale-110',
                          )}
                          style={{ backgroundColor: color, borderColor: color }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                      placeholder="Group name"
                      className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="p-1 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Categories
            </label>

            {/* Grouped categories */}
            {data.groups.map((group) => {
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
                      currency={data.currency}
                      items={items}
                      tableItems={tableItems}
                      onUpdate={(patch) => updateCategory(cat.id, patch)}
                      onUpdateSource={(patch) => updateCategorySource(cat.id, patch)}
                      onToggleLinked={() => toggleCategoryLinked(cat.id)}
                      onRemove={() => removeCategory(cat.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addCategory(group.id)}
                    className="text-[11px] font-medium text-primary hover:underline ml-3"
                  >
                    + Add category
                  </button>
                </div>
              );
            })}

            {/* Ungrouped categories */}
            {(() => {
              const ungrouped = groupedCategories.get(undefined) ?? [];
              if (ungrouped.length === 0 && data.groups.length > 0) return null;
              return (
                <div className="space-y-2">
                  {data.groups.length > 0 && (
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
                      currency={data.currency}
                      items={items}
                      tableItems={tableItems}
                      onUpdate={(patch) => updateCategory(cat.id, patch)}
                      onUpdateSource={(patch) => updateCategorySource(cat.id, patch)}
                      onToggleLinked={() => toggleCategoryLinked(cat.id)}
                      onRemove={() => removeCategory(cat.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addCategory(undefined)}
                    className="text-[11px] font-medium text-primary hover:underline ml-3"
                  >
                    + Add category
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border/60 bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Total Budgeted</span>
              <span className="text-[14px] font-bold text-foreground">
                {formatBudgetCurrency(totals.totalBudgeted, data.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Total Actual</span>
              <span className="text-[14px] font-bold text-foreground">
                {formatBudgetCurrency(totals.totalActual, data.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Remaining</span>
              <span
                className={cn(
                  'text-[14px] font-bold',
                  totals.remaining >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatBudgetCurrency(totals.remaining, data.currency)}
              </span>
            </div>
            <ProgressBar percent={totals.percent} />
            <p
              className={cn(
                'text-[11px] font-medium text-right',
                getBudgetHealthColor(totals.percent) === 'green' &&
                  'text-green-600 dark:text-green-400',
                getBudgetHealthColor(totals.percent) === 'yellow' &&
                  'text-amber-600 dark:text-amber-400',
                getBudgetHealthColor(totals.percent) === 'red' && 'text-red-600 dark:text-red-400',
              )}
            >
              {Math.round(totals.percent)}% spent
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Notes
            </label>
            <textarea
              value={data.notes}
              onChange={(e) => {
                markDirty();
                setData((prev) => ({ ...prev, notes: e.target.value }));
              }}
              placeholder="Budget notes..."
              rows={3}
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);

/* ---- Category row sub-component ---- */

interface CategoryRowProps {
  category: BudgetCategory;
  currency: BudgetCurrency;
  items: CanvasItem[];
  tableItems: CanvasItem[];
  onUpdate: (patch: Partial<BudgetCategory>) => void;
  onUpdateSource: (patch: Partial<BudgetCategorySource>) => void;
  onToggleLinked: () => void;
  onRemove: () => void;
}

function CategoryRow({
  category,
  currency,
  items,
  tableItems,
  onUpdate,
  onUpdateSource,
  onToggleLinked,
  onRemove,
}: CategoryRowProps) {
  const linked = !!category.source;
  const resolvedActual = resolveCategoryActual(category, items);
  const remaining = computeCategoryRemaining(category.budgeted, resolvedActual);
  const percent = computeCategoryPercent(category.budgeted, resolvedActual);
  const health = getBudgetHealthColor(percent);

  // Columns for the selected table
  const selectedTable = category.source?.tableItemId
    ? items.find((i) => i.id === category.source?.tableItemId)
    : undefined;
  const selectedTableData = selectedTable?.data as TableCardData | undefined;
  const columns = selectedTableData?.columns ?? [];

  return (
    <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
      {/* Name + Budgeted + Delete */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={category.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Category name"
          className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
        />
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Budget:</span>
          <input
            type="number"
            value={category.budgeted || ''}
            onChange={(e) => onUpdate({ budgeted: Number(e.target.value) || 0 })}
            placeholder="0"
            className="w-24 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] font-mono text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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

      {/* Source toggle + actual */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <button
            type="button"
            onClick={onToggleLinked}
            className={cn(
              'flex size-3.5 items-center justify-center rounded border transition-colors',
              linked ? 'border-primary bg-primary text-white' : 'border-border bg-background',
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
              value={category.actual || ''}
              onChange={(e) => onUpdate({ actual: Number(e.target.value) || 0 })}
              placeholder="0"
              className="w-24 rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] font-mono text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">
            {formatBudgetCurrency(resolvedActual, currency)} /{' '}
            {formatBudgetCurrency(category.budgeted, currency)}
          </span>
          <span
            className={cn(
              'font-medium',
              health === 'green' && 'text-green-600 dark:text-green-400',
              health === 'yellow' && 'text-amber-600 dark:text-amber-400',
              health === 'red' && 'text-red-600 dark:text-red-400',
            )}
          >
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar percent={percent} />

      {/* Linked source pickers */}
      {linked && (
        <div className="space-y-2 rounded-md border border-border/40 bg-muted/10 p-2">
          <div className="flex gap-2">
            {/* Table picker */}
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
                  className="w-full rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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

            {/* Column picker */}
            {columns.length > 0 && (
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-muted-foreground">Column</label>
                <select
                  value={category.source?.columnId ?? ''}
                  onChange={(e) => onUpdateSource({ columnId: e.target.value })}
                  className="w-full rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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

          {/* Aggregation picker */}
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
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolved value */}
          {category.source?.tableItemId && category.source?.columnId && (
            <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-center">
              <p className="text-[10px] text-muted-foreground">
                Resolved:{' '}
                <span className="font-bold text-foreground">
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
