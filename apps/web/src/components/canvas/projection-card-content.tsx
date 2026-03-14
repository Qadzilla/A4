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

  // Build SVG curve from schedule
  const schedule = result.schedule;
  const lastRow = schedule[schedule.length - 1];
  const maxBalance = lastRow ? lastRow.nominalBalance : 1;
  const width = 200;
  const height = 60;
  const padding = 2;

  let pathD = '';
  let areaD = '';
  if (schedule.length > 1) {
    const points = schedule.map((row, i) => ({
      x: padding + (i / (schedule.length - 1)) * (width - padding * 2),
      y: padding + (1 - row.nominalBalance / maxBalance) * (height - padding * 2),
    }));

    const first = points[0]!;
    const last = points[points.length - 1]!;

    // Build smooth curve
    pathD = `M${first.x},${first.y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const cpx = (prev.x + curr.x) / 2;
      pathD += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
    areaD = `${pathD} L${last.x},${height} L${first.x},${height} Z`;
  }

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Projection
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {d.annualGrowthRate}% · {d.projectionYears}yr
        </span>
      </div>

      {/* Body with growth curve */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {/* SVG area chart */}
        {schedule.length > 1 && (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[52px]" preserveAspectRatio="none">
            <path d={areaD} className="fill-primary/10" />
            <path d={pathD} className="stroke-primary" fill="none" strokeWidth="1.5" />
          </svg>
        )}

        {/* Start → End values */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {formatProjectionCurrency(d.startingAmount)}
          </span>
          <span className="text-[16px] font-mono tabular-nums font-bold text-foreground">
            {formatProjectionCurrency(result.finalBalance)}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/10">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatProjectionCurrency(d.monthlyContribution)}/mo
        </span>
        <span className="text-[10px] font-mono tabular-nums text-green-600 dark:text-green-400">
          +{formatProjectionCurrency(result.totalGrowth)} growth
        </span>
      </div>
    </div>
  );
});
