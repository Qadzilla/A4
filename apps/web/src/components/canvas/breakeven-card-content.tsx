import { memo } from 'react';
import { computeBreakeven, formatBreakevenCurrency } from '../../lib/breakeven-utils';
import type { BreakevenCardData } from '../../lib/breakeven-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const BreakevenCardContent = memo(function BreakevenCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as BreakevenCardData | undefined;

  const d: BreakevenCardData = {
    fixedCosts: data?.fixedCosts ?? 5000,
    variableCostPerUnit: data?.variableCostPerUnit ?? 15,
    pricePerUnit: data?.pricePerUnit ?? 40,
    notes: data?.notes ?? '',
  };

  const result = computeBreakeven(d);

  // Fixed vs variable cost proportion bar
  const sampleUnits = result.isViable ? result.breakEvenUnits : 100;
  const fixedTotal = d.fixedCosts;
  const variableTotal = sampleUnits * d.variableCostPerUnit;
  const costTotal = fixedTotal + variableTotal;
  const fixedPct = costTotal > 0 ? (fixedTotal / costTotal) * 100 : 50;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Break-Even
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {result.contributionMarginPercent.toFixed(1)}% margin
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Break-Even Units</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {result.isViable ? result.breakEvenUnits.toLocaleString() : 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">Break-Even Revenue</p>
          <p className="text-[15px] font-semibold leading-tight text-foreground">
            {result.isViable ? formatBreakevenCurrency(result.breakEvenRevenue) : 'N/A'}
          </p>
        </div>

        {/* Fixed vs Variable cost bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Fixed</span>
            <span>Variable</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
            <div className="bg-orange-400/70 rounded-l-full" style={{ width: `${fixedPct}%` }} />
            <div className="bg-primary/70 rounded-r-full" style={{ width: `${100 - fixedPct}%` }} />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Margin/unit: {formatBreakevenCurrency(result.contributionMargin)}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          Fixed: {formatBreakevenCurrency(d.fixedCosts)}/mo
        </span>
      </div>
    </div>
  );
});
