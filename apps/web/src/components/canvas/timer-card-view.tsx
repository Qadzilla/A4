import { cn } from '@a4/ui';
import { memo, useEffect, useRef, useState } from 'react';
import { getTimeRemaining } from '../../lib/timer-utils';
import type { TimerCardData } from '../../lib/timer-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const COLOR_PRESETS = [
  { value: '#3b82f6', className: 'bg-blue-500 border-blue-600' },
  { value: '#22c55e', className: 'bg-green-500 border-green-600' },
  { value: '#ef4444', className: 'bg-red-500 border-red-600' },
  { value: '#f59e0b', className: 'bg-amber-500 border-amber-600' },
  { value: '#8b5cf6', className: 'bg-violet-500 border-violet-600' },
  { value: '#ec4899', className: 'bg-pink-500 border-pink-600' },
  { value: '#06b6d4', className: 'bg-cyan-500 border-cyan-600' },
  { value: '#64748b', className: 'bg-slate-500 border-slate-600' },
];

function toLocalDatetimeValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDatetimeValue(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

export const TimerCardView = memo(
  function TimerCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<TimerCardData>(() => {
      const d = item.data as TimerCardData | undefined;
      return {
        label: d?.label ?? 'Deadline',
        targetDate: d?.targetDate ?? '',
        color: d?.color ?? '#3b82f6',
      };
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Live countdown for preview
    const [remaining, setRemaining] = useState(() =>
      data.targetDate ? getTimeRemaining(data.targetDate) : null,
    );

    useEffect(() => {
      if (!data.targetDate) {
        setRemaining(null);
        return;
      }
      setRemaining(getTimeRemaining(data.targetDate));
      const id = setInterval(() => {
        setRemaining(getTimeRemaining(data.targetDate));
      }, 1000);
      return () => clearInterval(id);
    }, [data.targetDate]);

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as TimerCardData | undefined;
      const loaded: TimerCardData = {
        label: d?.label ?? 'Deadline',
        targetDate: d?.targetDate ?? '',
        color: d?.color ?? '#3b82f6',
      };
      setData(loaded);
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, data as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [data, item.id, updateItemData]);

    // Cleanup timers
    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<TimerCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const isPast = remaining?.isPast ?? false;

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-primary"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Countdown timer</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Label
            </label>
            <input
              type="text"
              value={data.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="e.g. Earnings Report"
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Target Date */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Target Date
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetimeValue(data.targetDate)}
              onChange={(e) => update({ targetDate: fromLocalDatetimeValue(e.target.value) })}
              className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Accent color
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ color: opt.value })}
                  className={cn(
                    'size-7 rounded-full border-2 transition-all',
                    opt.className,
                    data.color === opt.value
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'hover:scale-110',
                  )}
                  title={opt.value}
                />
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border/60 bg-background p-4 text-center space-y-1">
            <p className="text-[11px] text-muted-foreground">Preview</p>
            <div
              className="h-1 rounded-full mx-auto w-24"
              style={{ backgroundColor: isPast ? '#ef4444' : data.color }}
            />
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-2">
              {data.label || 'Deadline'}
            </p>
            {isPast ? (
              <p className="text-[24px] font-bold text-red-500">Expired</p>
            ) : remaining ? (
              <p className="text-[24px] font-bold text-foreground tabular-nums">
                {remaining.days}d {pad(remaining.hours)}h {pad(remaining.minutes)}m{' '}
                {pad(remaining.seconds)}s
              </p>
            ) : (
              <p className="text-[14px] text-muted-foreground">No date set</p>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
