import { cn } from '@a4/ui';
import { memo } from 'react';
import { formatKpiValue, resolveKpiValue } from '../../lib/kpi-utils';
import type { KpiCardData, KpiColor, KpiTrend } from '../../lib/kpi-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const colorBorderClasses: Record<KpiColor, string> = {
  green: 'border-l-green-500',
  red: 'border-l-red-500',
  blue: 'border-l-blue-500',
  amber: 'border-l-amber-500',
  default: 'border-l-transparent',
};

// Decorative sparkline paths based on trend direction
const SPARKLINE_PATHS: Record<string, string> = {
  up: 'M0,28 C10,26 20,22 35,18 C50,14 65,8 80,5 C95,2 110,1 120,0',
  down: 'M0,0 C10,2 20,5 35,10 C50,14 65,20 80,24 C95,26 110,27 120,28',
  neutral: 'M0,14 C10,12 25,16 40,13 C55,10 70,16 85,14 C100,12 110,15 120,14',
};

export const KpiCardContent = memo(function KpiCardContent({ item }: { item: CanvasItem }) {
  const items = useCanvasStore((s) => s.items);
  const data = item.data as KpiCardData | undefined;
  const label = data?.label ?? 'Metric';
  const format = data?.format ?? 'number';
  const trend = data?.trend as KpiTrend | undefined;
  const color = (data?.color ?? 'default') as KpiColor;

  const kpiData: KpiCardData = {
    label,
    value: data?.value ?? '0',
    format,
    trend,
    color,
    source: data?.source,
  };
  const resolved = resolveKpiValue(kpiData, items);
  const formatted = formatKpiValue(resolved, format);

  const sparklinePath = SPARKLINE_PATHS[trend?.direction ?? 'neutral'];

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md border-l-4',
        colorBorderClasses[color],
      )}
    >
      {/* Header */}
      <div className="px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate block">
          {label}
        </span>
      </div>

      {/* Value with sparkline behind */}
      <div className="relative flex-1 flex items-center justify-center px-3">
        {/* Sparkline background */}
        {trend && (
          <svg
            viewBox="0 0 120 28"
            className="absolute inset-x-3 bottom-1 h-[28px] opacity-[0.12]"
            preserveAspectRatio="none"
          >
            <path
              d={sparklinePath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn(
                trend.direction === 'up' && 'text-green-500',
                trend.direction === 'down' && 'text-red-500',
                trend.direction === 'neutral' && 'text-muted-foreground',
              )}
            />
          </svg>
        )}
        <span className="relative text-[24px] font-bold text-foreground font-mono tabular-nums truncate">
          {formatted}
        </span>
      </div>

      {/* Trend footer */}
      {trend && (
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {trend.direction === 'up' ? (
            <svg viewBox="0 0 16 16" fill="none" className="size-3 text-green-500">
              <path d="M8 13V3m0 0L4 7m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : trend.direction === 'down' ? (
            <svg viewBox="0 0 16 16" fill="none" className="size-3 text-red-500">
              <path d="M8 3v10m0 0l4-4m-4 4L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" className="size-3 text-muted-foreground">
              <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
