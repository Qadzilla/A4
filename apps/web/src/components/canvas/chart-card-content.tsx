import { memo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  PieChart,
  Line,
  Bar,
  Area,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { resolveChartData, CHART_COLORS } from '../../lib/chart-utils';
import type { ChartCardData } from '../../lib/chart-utils';

export const ChartCardContent = memo(function ChartCardContent({ item }: { item: CanvasItem }) {
  const items = useCanvasStore((s) => s.items);
  const data = item.data as ChartCardData | undefined;

  if (!data) {
    return <EmptyPlaceholder />;
  }

  const { points, seriesNames } = resolveChartData(data, items);

  if (points.length === 0 || seriesNames.length === 0) {
    return <EmptyPlaceholder title={data.title} />;
  }

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md">
      {data.title && (
        <div className="bg-muted/30 px-3 py-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate block">
            {data.title}
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0 p-2">
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
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
              />
              {data.showLegend && <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />}
            </PieChart>
          ) : data.chartType === 'line' ? (
            <LineChart data={points}>
              {data.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />}
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={35} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
              />
              {data.showLegend && <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />}
              {seriesNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          ) : data.chartType === 'area' ? (
            <AreaChart data={points}>
              {data.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />}
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={35} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
              />
              {data.showLegend && <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />}
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
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} width={35} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
              />
              {data.showLegend && <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-foreground)' }} />}
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
      </div>
    </div>
  );
});

function EmptyPlaceholder({ title }: { title?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-border/60 bg-card shadow-md gap-2">
      {title && (
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8 text-muted-foreground/30"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="17" x2="9" y2="11" />
        <line x1="12" y1="17" x2="12" y2="8" />
        <line x1="15" y1="17" x2="15" y2="13" />
      </svg>
      <span className="text-[11px] text-muted-foreground/50">Link a table</span>
    </div>
  );
}
