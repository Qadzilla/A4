import { cn } from '@a4/ui';
import { memo, useEffect, useRef, useState } from 'react';
import { formatKpiValue, resolveKpiValue } from '../../lib/kpi-utils';
import type {
  KpiAggregation,
  KpiCardData,
  KpiColor,
  KpiFormat,
  KpiSource,
} from '../../lib/kpi-utils';
import type { TableCardData } from '../../lib/table-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const FORMAT_OPTIONS: { value: KpiFormat; label: string }[] = [
  { value: 'currency', label: '$' },
  { value: 'number', label: '#' },
  { value: 'percentage', label: '%' },
  { value: 'text', label: 'Aa' },
];

const COLOR_OPTIONS: { value: KpiColor; className: string }[] = [
  { value: 'default', className: 'bg-muted-foreground/30 border-muted-foreground/40' },
  { value: 'green', className: 'bg-green-500 border-green-600' },
  { value: 'red', className: 'bg-red-500 border-red-600' },
  { value: 'blue', className: 'bg-blue-500 border-blue-600' },
  { value: 'amber', className: 'bg-amber-500 border-amber-600' },
];

const AGGREGATION_OPTIONS: { value: KpiAggregation; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'latest', label: 'Latest' },
];

export const KpiCardView = memo(
  function KpiCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const items = useCanvasStore((s) => s.items);

    const [data, setData] = useState<KpiCardData>(() => {
      const d = item.data as KpiCardData | undefined;
      return {
        label: d?.label ?? 'Metric',
        value: d?.value ?? '0',
        format: d?.format ?? 'number',
        trend: d?.trend,
        color: d?.color,
        source: d?.source,
      };
    });
    const [showTrend, setShowTrend] = useState(!!data.trend);
    const [linked, setLinked] = useState(!!data.source);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    const tableItems = items.filter((i) => i.type === 'table-card');

    // Selected table's columns
    const selectedTable = data.source?.tableItemId
      ? items.find((i) => i.id === data.source?.tableItemId)
      : undefined;
    const selectedTableData = selectedTable?.data as TableCardData | undefined;
    const columns = selectedTableData?.columns ?? [];

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as KpiCardData | undefined;
      const loaded: KpiCardData = {
        label: d?.label ?? 'Metric',
        value: d?.value ?? '0',
        format: d?.format ?? 'number',
        trend: d?.trend,
        color: d?.color,
        source: d?.source,
      };
      setData(loaded);
      setShowTrend(!!loaded.trend);
      setLinked(!!loaded.source);
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        const toSave: KpiCardData = { ...data };
        if (!showTrend) {
          toSave.trend = undefined;
        }
        if (!linked) {
          toSave.source = undefined;
        }
        updateItemData(item.id, toSave as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [data, showTrend, linked, item.id, updateItemData]);

    // Cleanup timers
    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<KpiCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const updateSource = (patch: Partial<KpiSource>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        source: {
          tableItemId: '',
          columnId: '',
          aggregation: 'sum' as KpiAggregation,
          ...prev.source,
          ...patch,
        },
      }));
    };

    const updateTrend = (patch: Partial<NonNullable<KpiCardData['trend']>>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        trend: { value: '', period: '', direction: 'neutral' as const, ...prev.trend, ...patch },
      }));
    };

    const resolved = resolveKpiValue(data, items);
    const formatted = formatKpiValue(resolved, data.format);

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-lg space-y-6">
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
                <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                <path d="M12 12 8.5 8" />
                <circle cx="12" cy="12" r="1" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Single metric display</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Label
            </label>
            <input
              type="text"
              value={data.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="e.g. Net Worth"
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Value
            </label>
            <input
              type="text"
              value={linked ? resolved : data.value}
              onChange={(e) => update({ value: e.target.value })}
              readOnly={linked}
              placeholder="e.g. 1234.50"
              className={cn(
                'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] font-mono text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50',
                linked && 'opacity-60 cursor-not-allowed',
              )}
            />
          </div>

          {/* Data Source section */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  const next = !linked;
                  setLinked(next);
                  if (!next) {
                    // Unlinking — clear source
                    setData((prev) => ({ ...prev, source: undefined }));
                  } else if (!data.source) {
                    // Linking — init source with first table if available
                    const firstTable = tableItems[0];
                    const firstTableData = firstTable?.data as TableCardData | undefined;
                    const firstCol = firstTableData?.columns?.[0];
                    setData((prev) => ({
                      ...prev,
                      source: {
                        tableItemId: firstTable?.id ?? '',
                        columnId: firstCol?.id ?? '',
                        aggregation: 'sum',
                      },
                    }));
                  }
                }}
                className={cn(
                  'flex size-4 items-center justify-center rounded border transition-colors',
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
                    className="size-2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Link to table
              </span>
            </label>

            {linked && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
                {/* Table picker */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Table</label>
                  {tableItems.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/70 italic">
                      No tables on this canvas
                    </p>
                  ) : (
                    <select
                      value={data.source?.tableItemId ?? ''}
                      onChange={(e) => {
                        const tableId = e.target.value;
                        const table = items.find((i) => i.id === tableId);
                        const td = table?.data as TableCardData | undefined;
                        const firstCol = td?.columns?.[0];
                        updateSource({ tableItemId: tableId, columnId: firstCol?.id ?? '' });
                      }}
                      className="w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="">Select a table...</option>
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
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Column</label>
                    <select
                      value={data.source?.columnId ?? ''}
                      onChange={(e) => updateSource({ columnId: e.target.value })}
                      className="w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="">Select a column...</option>
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Aggregation picker */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Aggregation</label>
                  <div className="flex flex-wrap gap-1">
                    {AGGREGATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateSource({ aggregation: opt.value })}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors',
                          data.source?.aggregation === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Computed value preview */}
                {data.source?.tableItemId && data.source?.columnId && (
                  <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Computed</p>
                    <p className="text-[16px] font-bold text-foreground">{formatted}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Format selector */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Format
            </label>
            <div className="flex gap-1">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ format: opt.value })}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-[13px] font-medium transition-colors',
                    data.format === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border/60 bg-background p-4 text-center">
            <p className="text-[11px] text-muted-foreground mb-1">Preview</p>
            <p className="text-[24px] font-bold text-foreground">{formatted}</p>
          </div>

          {/* Trend section */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  setShowTrend((v) => !v);
                  if (!showTrend && !data.trend) {
                    setData((prev) => ({
                      ...prev,
                      trend: { value: '', period: '', direction: 'neutral' },
                    }));
                  }
                }}
                className={cn(
                  'flex size-4 items-center justify-center rounded border transition-colors',
                  showTrend
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background',
                )}
              >
                {showTrend && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Show trend indicator
              </span>
            </label>

            {showTrend && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-muted-foreground">Change</label>
                    <input
                      type="text"
                      value={data.trend?.value ?? ''}
                      onChange={(e) => updateTrend({ value: e.target.value })}
                      placeholder="+5.2"
                      className="w-full rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] font-mono text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-muted-foreground">Period</label>
                    <input
                      type="text"
                      value={data.trend?.period ?? ''}
                      onChange={(e) => updateTrend({ period: e.target.value })}
                      placeholder="vs last month"
                      className="w-full rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Direction</label>
                  <div className="flex gap-1">
                    {(['up', 'down', 'neutral'] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => updateTrend({ direction: dir })}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1 rounded-md border py-1.5 text-[12px] font-medium transition-colors',
                          data.trend?.direction === dir
                            ? dir === 'up'
                              ? 'border-green-500 bg-green-500/10 text-green-600'
                              : dir === 'down'
                                ? 'border-red-500 bg-red-500/10 text-red-600'
                                : 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {dir === 'up' && (
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
                            <path d="m5 12 7-7 7 7" />
                          </svg>
                        )}
                        {dir === 'down' && (
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
                            <path d="m19 12-7 7-7-7" />
                          </svg>
                        )}
                        {dir === 'neutral' && (
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
                            <path d="M5 12h14" />
                          </svg>
                        )}
                        {dir.charAt(0).toUpperCase() + dir.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Accent color
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ color: opt.value })}
                  className={cn(
                    'size-7 rounded-full border-2 transition-all',
                    opt.className,
                    data.color === opt.value || (!data.color && opt.value === 'default')
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'hover:scale-110',
                  )}
                  title={opt.value}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
