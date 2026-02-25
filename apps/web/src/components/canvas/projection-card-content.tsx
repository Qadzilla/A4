import { memo } from 'react';
import { computeProjection, formatProjectionCurrency } from '../../lib/projection-utils';
import type { ProjectionCardData } from '../../lib/projection-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const ProjectionCardContent = memo(function ProjectionCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as ProjectionCardData | undefined;

  const d: ProjectionCardData = {
    startingAmount: data?.startingAmount ?? 10000,
    monthlyContribution: data?.monthlyContribution ?? 500,
    annualGrowthRate: data?.annualGrowthRate ?? 7,
    projectionYears: data?.projectionYears ?? 10,
    inflationRate: data?.inflationRate ?? 0,
    notes: data?.notes ?? '',
  };

  const result = computeProjection(d);

  // Stacked bar proportions
  const total = result.totalContributions + result.totalGrowth;
  const contribPct = total > 0 ? (result.totalContributions / total) * 100 : 100;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Projection
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {d.annualGrowthRate}% · {d.projectionYears}yr
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Final Balance</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatProjectionCurrency(result.finalBalance)}
          </p>
        </div>

        <div className="flex gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground">Contributions</p>
            <p className="text-[13px] font-semibold leading-tight text-blue-600 dark:text-blue-400">
              {formatProjectionCurrency(result.totalContributions)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Growth</p>
            <p className="text-[13px] font-semibold leading-tight text-green-600 dark:text-green-400">
              {formatProjectionCurrency(result.totalGrowth)}
            </p>
          </div>
        </div>

        {/* Stacked bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Contributions</span>
            <span>Growth</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
            <div className="bg-blue-500/70 rounded-l-full" style={{ width: `${contribPct}%` }} />
            <div
              className="bg-green-500/70 rounded-r-full"
              style={{ width: `${100 - contribPct}%` }}
            />
          </div>
        </div>

        {d.inflationRate > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Real value: {formatProjectionCurrency(result.realFinalBalance)}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          Monthly: {formatProjectionCurrency(d.monthlyContribution)}
        </span>
      </div>
    </div>
  );
});
