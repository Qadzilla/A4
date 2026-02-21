import { memo } from 'react';
import { cn } from '@a4/ui';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { formatKpiValue, resolveKpiValue } from '../../lib/kpi-utils';
import type { KpiCardData, KpiColor, KpiTrend } from '../../lib/kpi-utils';

const colorBorderClasses: Record<KpiColor, string> = {
  green: 'border-l-green-500',
  red: 'border-l-red-500',
  blue: 'border-l-blue-500',
  amber: 'border-l-amber-500',
  default: 'border-l-transparent',
};

export const KpiCardContent = memo(function KpiCardContent({ item }: { item: CanvasItem }) {
  const items = useCanvasStore((s) => s.items);
  const data = item.data as KpiCardData | undefined;
  const label = data?.label ?? 'Metric';
  const format = data?.format ?? 'number';
  const trend = data?.trend as KpiTrend | undefined;
  const color = (data?.color ?? 'default') as KpiColor;

  const kpiData: KpiCardData = { label, value: data?.value ?? '0', format, trend, color, source: data?.source };
  const resolved = resolveKpiValue(kpiData, items);
  const formatted = formatKpiValue(resolved, format);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md border-l-4',
        colorBorderClasses[color],
      )}
    >
      {/* Header */}
      <div className="bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate block">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-[24px] font-bold text-foreground truncate">
          {formatted}
        </span>
      </div>

      {/* Trend footer */}
      {trend && (
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {trend.direction === 'up' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-green-500">
              <path d="m5 12 7-7 7 7" />
            </svg>
          ) : trend.direction === 'down' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-red-500">
              <path d="m19 12-7 7-7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted-foreground">
              <path d="M5 12h14" />
            </svg>
          )}
          <span
            className={cn(
              'text-[10px] font-medium',
              trend.direction === 'up' && 'text-green-500',
              trend.direction === 'down' && 'text-red-500',
              trend.direction === 'neutral' && 'text-muted-foreground',
            )}
          >
            {trend.value}
          </span>
          <span className="text-[10px] text-muted-foreground">{trend.period}</span>
        </div>
      )}
    </div>
  );
});
