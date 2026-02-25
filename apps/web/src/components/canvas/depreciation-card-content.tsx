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

  // Book value consumed progress bar
  const consumedPct =
    d.assetCost > 0 ? (result.totalDepreciation / d.assetCost) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Depreciation
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {abbr} · {d.usefulLifeYears}yr
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Year 1 Depreciation</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatDepreciationCurrency(result.annualDepreciation)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">
            {formatDepreciationCurrency(d.assetCost)} → {formatDepreciationCurrency(d.salvageValue)} over{' '}
            {d.usefulLifeYears}yr
          </p>
        </div>

        {/* Book value consumed bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Depreciated</span>
            <span>Remaining</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
            <div
              className="bg-amber-500/70 rounded-l-full"
              style={{ width: `${consumedPct}%` }}
            />
            <div
              className="bg-primary/70 rounded-r-full"
              style={{ width: `${100 - consumedPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          Total: {formatDepreciationCurrency(result.totalDepreciation)}
        </span>
      </div>
    </div>
  );
});
