import { cn } from '@a4/ui';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, resolveChartData } from '../../lib/chart-utils';
import type { ChartCardData, ChartSource, ChartType } from '../../lib/chart-utils';
import type { TableCardData } from '../../lib/table-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
];

export const ChartCardView = memo(
  function ChartCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);
    const items = useCanvasStore((s) => s.items);

    const [data, setData] = useState<ChartCardData>(() => {
      const d = item.data as ChartCardData | undefined;
      return {
        chartType: d?.chartType ?? 'bar',
        title: d?.title ?? '',
        source: d?.source,
        showLegend: d?.showLegend ?? true,
        showGrid: d?.showGrid ?? true,
      };
    });

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    const tableItems = items.filter((i) => i.type === 'table-card');

    const selectedTable = data.source?.tableItemId
      ? items.find((i) => i.id === data.source?.tableItemId)
      : undefined;
    const selectedTableData = selectedTable?.data as TableCardData | undefined;
    const columns = selectedTableData?.columns ?? [];

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as ChartCardData | undefined;
      setData({
        chartType: d?.chartType ?? 'bar',
        title: d?.title ?? '',
        source: d?.source,
        showLegend: d?.showLegend ?? true,
        showGrid: d?.showGrid ?? true,
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

    // Cleanup timers
    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<ChartCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const updateSource = (patch: Partial<ChartSource>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        source: {
          tableItemId: '',
          xColumnId: '',
          yColumnIds: [],
          ...prev.source,
          ...patch,
        },
      }));
    };

    const toggleYColumn = (columnId: string) => {
      dirtyRef.current = true;
      setData((prev) => {
        const current = prev.source?.yColumnIds ?? [];
        const next = current.includes(columnId)
          ? current.filter((id) => id !== columnId)
          : [...current, columnId];
        return {
          ...prev,
          source: {
            tableItemId: '',
            xColumnId: '',
            ...prev.source,
            yColumnIds: next,
          },
        };
      });
    };

    const { points, seriesNames } = resolveChartData(data, items);

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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="17" x2="9" y2="11" />
                <line x1="12" y1="17" x2="12" y2="8" />
                <line x1="15" y1="17" x2="15" y2="13" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Data visualization</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Title
            </label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. Monthly Revenue"
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Chart type */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Chart type
            </label>
            <div className="flex gap-1">
              {CHART_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ chartType: opt.value })}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-[13px] font-medium transition-colors',
                    data.chartType === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div className="space-y-3">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Data Source
            </label>
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
                      updateSource({
                        tableItemId: tableId,
                        xColumnId: firstCol?.id ?? '',
                        yColumnIds: [],
                      });
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

              {/* X-axis column picker */}
              {columns.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">X-axis</label>
                  <select
                    value={data.source?.xColumnId ?? ''}
                    onChange={(e) => updateSource({ xColumnId: e.target.value })}
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

              {/* Y-axis columns */}
              {columns.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Y-axis {data.chartType === 'pie' ? '(value)' : '(series)'}
                  </label>
                  {data.chartType === 'pie' ? (
                    <select
                      value={data.source?.yColumnIds?.[0] ?? ''}
                      onChange={(e) =>
                        updateSource({ yColumnIds: e.target.value ? [e.target.value] : [] })
                      }
                      className="w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="">Select a column...</option>
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {columns.map((col) => {
                        const checked = data.source?.yColumnIds?.includes(col.id) ?? false;
                        return (
                          <label key={col.id} className="flex items-center gap-1.5 cursor-pointer">
                            <button
                              type="button"
                              onClick={() => toggleYColumn(col.id)}
                              className={cn(
                                'flex size-4 items-center justify-center rounded border transition-colors',
                                checked
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-border bg-background',
                              )}
                            >
                              {checked && (
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
                            <span className="text-[12px] text-foreground">{col.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => update({ showLegend: !data.showLegend })}
                className={cn(
                  'flex size-4 items-center justify-center rounded border transition-colors',
                  data.showLegend
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background',
                )}
              >
                {data.showLegend && (
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
                Show legend
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => update({ showGrid: !data.showGrid })}
                className={cn(
                  'flex size-4 items-center justify-center rounded border transition-colors',
                  data.showGrid
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background',
                )}
              >
                {data.showGrid && (
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
                Show grid
              </span>
            </label>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border/60 bg-background p-4">
            <p className="text-[11px] text-muted-foreground mb-2">Preview</p>
            <div className="h-[240px]">
              {points.length > 0 && seriesNames.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {data.chartType === 'pie' ? (
                    <PieChart>
                      <Pie
                        data={points}
                        dataKey={seriesNames[0] ?? 'label'}
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        stroke="none"
                      >
                        {points.map((_, i) => (
                          <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-card)',
                          color: 'var(--color-foreground)',
                        }}
                      />
                      {data.showLegend && (
                        <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />
                      )}
                    </PieChart>
                  ) : data.chartType === 'line' ? (
                    <LineChart data={points}>
                      {data.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />}
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--color-foreground)' }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={40} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-card)',
                          color: 'var(--color-foreground)',
                        }}
                      />
                      {data.showLegend && (
                        <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />
                      )}
                      {seriesNames.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  ) : data.chartType === 'area' ? (
                    <AreaChart data={points}>
                      {data.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />}
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--color-foreground)' }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={40} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-card)',
                          color: 'var(--color-foreground)',
                        }}
                      />
                      {data.showLegend && (
                        <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />
                      )}
                      {seriesNames.map((name, i) => (
                        <Area
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  ) : (
                    <BarChart data={points}>
                      {data.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />}
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--color-foreground)' }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={40} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-card)',
                          color: 'var(--color-foreground)',
                        }}
                      />
                      {data.showLegend && (
                        <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />
                      )}
                      {seriesNames.map((name, i) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-[12px] text-muted-foreground/50">
                    Select a table and columns to preview
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
