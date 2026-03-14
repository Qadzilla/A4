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

  // Bar proportions for fixed vs variable at breakeven
  const sampleUnits = result.isViable ? result.breakEvenUnits : 100;
  const fixedTotal = d.fixedCosts;
  const variableTotal = sampleUnits * d.variableCostPerUnit;
  const costTotal = fixedTotal + variableTotal;
  const fixedPct = costTotal > 0 ? (fixedTotal / costTotal) * 100 : 50;
  // Breakeven marker position on the revenue bar
  const revenueAtBE = result.isViable ? result.breakEvenRevenue : 0;
  const maxRevenue = revenueAtBE * 1.5 || 1;
  const markerPct = (revenueAtBE / maxRevenue) * 100;

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Break-Even
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {result.contributionMarginPercent.toFixed(1)}% margin
        </span>
      </div>

      {/* Body centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2 gap-1.5">
        {/* Large breakeven units */}
        <span className="text-[24px] font-mono tabular-nums font-bold text-foreground leading-tight">
          {result.isViable ? result.breakEvenUnits.toLocaleString() : 'N/A'}
        </span>
        <span className="text-[10px] text-muted-foreground">units to break even</span>

        {/* Breakeven revenue */}
        <span className="text-[13px] font-mono tabular-nums font-medium text-foreground">
          {result.isViable ? formatBreakevenCurrency(result.breakEvenRevenue) : '—'}
        </span>

        {/* Horizontal bar with marker */}
        {result.isViable && (
          <div className="w-full mt-1">
            <div className="relative h-3 rounded-full overflow-hidden bg-muted/20">
              <div
                className="absolute inset-y-0 left-0 bg-orange-400/50 rounded-l-full"
                style={{ width: `${fixedPct}%` }}
              />
              <div
                className="absolute inset-y-0 bg-primary/50 rounded-r-full"
                style={{ left: `${fixedPct}%`, width: `${100 - fixedPct}%` }}
              />
              {/* Breakeven marker line */}
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/80"
                style={{ left: `${Math.min(markerPct, 98)}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-muted-foreground/60">
              <span>Fixed</span>
              <span>Variable</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/10">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          ${d.pricePerUnit}/unit
        </span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatBreakevenCurrency(result.contributionMargin)}/unit margin
        </span>
      </div>
    </div>
  );
});
