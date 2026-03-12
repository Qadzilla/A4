import { memo } from 'react';
import {
  computeDepreciation,
  formatDepreciationCurrency,
  getMethodAbbr,
} from '../../lib/depreciation-utils';
import type { DepreciationCardData } from '../../lib/depreciation-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const DepreciationCardContent = memo(function DepreciationCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as DepreciationCardData | undefined;

  const d: DepreciationCardData = {
    assetCost: data?.assetCost ?? 50000,
    salvageValue: data?.salvageValue ?? 5000,
    usefulLifeYears: data?.usefulLifeYears ?? 5,
    method: data?.method ?? 'straight-line',
    notes: data?.notes ?? '',
  };

  const result = computeDepreciation(d);
  const abbr = getMethodAbbr(d.method);

  // Sample up to 5 bars from schedule for the step chart
  const schedule = result.schedule;
  const maxBars = 5;
  let bars: { year: number; bookValue: number }[] = [];
  if (schedule.length <= maxBars) {
    bars = schedule.map((r) => ({ year: r.year, bookValue: r.bookValue }));
  } else {
    // Sample evenly
    for (let i = 0; i < maxBars; i++) {
      const idx = Math.round((i / (maxBars - 1)) * (schedule.length - 1));
      const row = schedule[idx]!;
      bars.push({ year: row.year, bookValue: row.bookValue });
    }
  }
  const maxBookValue = d.assetCost || 1;
  const barHeight = 40; // px

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {abbr}
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {d.usefulLifeYears}yr life
        </span>
      </div>

      {/* Body with declining bars */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {/* Asset cost */}
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {formatDepreciationCurrency(d.assetCost)} cost
        </span>

        {/* Declining step bars */}
        <div className="flex items-end gap-1" style={{ height: `${barHeight}px` }}>
          {bars.map((bar) => (
            <div
              key={bar.year}
              className="flex-1 bg-primary/50 rounded-t-sm min-h-[2px]"
              style={{ height: `${Math.max((bar.bookValue / maxBookValue) * barHeight, 2)}px` }}
            />
          ))}
        </div>

        {/* Year labels */}
        <div className="flex gap-1">
          {bars.map((bar) => (
            <span key={bar.year} className="flex-1 text-center text-[8px] text-muted-foreground/60">
              Y{bar.year}
            </span>
          ))}
        </div>

        {/* Current book value (end of life) */}
        <div className="text-center">
          <span className="text-[16px] font-mono tabular-nums font-bold text-foreground">
            {formatDepreciationCurrency(d.salvageValue)}
          </span>
          <span className="text-[9px] text-muted-foreground ml-1">salvage</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/10">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          Total: {formatDepreciationCurrency(result.totalDepreciation)}
        </span>
      </div>
    </div>
  );
});
