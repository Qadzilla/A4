import { memo, useEffect, useState } from 'react';
import { getTimeRemaining } from '../../lib/timer-utils';
import type { TimerCardData } from '../../lib/timer-utils';
import type { CanvasItem } from '../../stores/canvas-store';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const TimerCardContent = memo(function TimerCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as TimerCardData | undefined;
  const label = data?.label ?? 'Deadline';
  const color = data?.color ?? '#3b82f6';
  const targetDate = data?.targetDate ?? '';

  const [remaining, setRemaining] = useState(() =>
    targetDate ? getTimeRemaining(targetDate) : null,
  );

  useEffect(() => {
    if (!targetDate) return;
    setRemaining(getTimeRemaining(targetDate));
    const id = setInterval(() => {
      setRemaining(getTimeRemaining(targetDate));
    }, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const isPast = remaining?.isPast ?? false;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md">
      {/* Colored accent bar */}
      <div className="h-1 shrink-0" style={{ backgroundColor: isPast ? '#ef4444' : color }} />

      {/* Label */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate block">
          {label}
        </span>
      </div>

      {/* Countdown */}
      <div className="flex-1 flex items-center justify-center px-3 pb-2">
        {isPast ? (
          <span className="text-[18px] font-bold text-red-500">Expired</span>
        ) : remaining ? (
          <span className="text-[18px] font-bold text-foreground tabular-nums">
            {remaining.days}d {pad(remaining.hours)}h {pad(remaining.minutes)}m{' '}
            {pad(remaining.seconds)}s
          </span>
        ) : (
          <span className="text-[14px] text-muted-foreground">No date set</span>
        )}
      </div>
    </div>
  );
});
