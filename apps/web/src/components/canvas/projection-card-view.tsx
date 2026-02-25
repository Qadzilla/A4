import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { computeProjection, formatProjectionCurrency } from '../../lib/projection-utils';
import type { ProjectionCardData } from '../../lib/projection-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

function makeData(d: ProjectionCardData | undefined): ProjectionCardData {
  return {
    startingAmount: d?.startingAmount ?? 10000,
    monthlyContribution: d?.monthlyContribution ?? 500,
    annualGrowthRate: d?.annualGrowthRate ?? 7,
    projectionYears: d?.projectionYears ?? 10,
    inflationRate: d?.inflationRate ?? 0,
    notes: d?.notes ?? '',
  };
}

export const ProjectionCardView = memo(function ProjectionCardView({
  item,
}: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<ProjectionCardData>(() =>
    makeData(item.data as ProjectionCardData | undefined),
  );

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    setData(makeData(item.data as ProjectionCardData | undefined));
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

  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(savedIndicatorRef.current);
    };
  }, []);

  const update = useCallback((patch: Partial<ProjectionCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = computeProjection(data);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Years
          <select
            value={data.projectionYears}
            onChange={(e) => update({ projectionYears: Number(e.target.value) })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {[1, 3, 5, 10, 15, 20, 25, 30, 40, 50].map((y) => (
              <option key={y} value={y}>
                {y} yr
              </option>
            ))}
          </select>
        </label>

        <span
          className={cn(
            'ml-auto text-[10px] transition-opacity',
            saveStatus === 'idle' ? 'opacity-0' : 'opacity-100',
            saveStatus === 'saving'
              ? 'text-muted-foreground'
              : 'text-green-600 dark:text-green-400',
          )}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-1">
          {/* ── INPUTS ── */}
          <SectionHeader label="Projection Inputs" />
          <FieldRow
            label="Starting Amount"
            value={data.startingAmount}
            onChange={(v) => update({ startingAmount: v })}
          />
          <FieldRow
            label="Monthly Contribution"
            value={data.monthlyContribution}
            onChange={(v) => update({ monthlyContribution: v })}
          />
          <FieldRow
            label="Annual Growth Rate (%)"
            value={data.annualGrowthRate}
            onChange={(v) => update({ annualGrowthRate: v })}
            isPercent
          />
          <FieldRow
            label="Inflation Rate (%)"
            value={data.inflationRate}
            onChange={(v) => update({ inflationRate: v })}
            isPercent
          />

          {/* ── RESULTS ── */}
          <SectionHeader label="Results" />
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1">
            <ComputedRow label="Final Balance" value={formatProjectionCurrency(result.finalBalance)} />
            <ComputedRow
              label="Total Contributions"
              value={formatProjectionCurrency(result.totalContributions)}
              sub
            />
            <ComputedRow
              label="Total Growth"
              value={formatProjectionCurrency(result.totalGrowth)}
              sub
            />
            {data.inflationRate > 0 && (
              <ComputedRow
                label="Real Value (inflation-adjusted)"
                value={formatProjectionCurrency(result.realFinalBalance)}
                sub
              />
            )}
          </div>

          {/* ── METRICS ── */}
          <div className="pt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricBox label="Final Balance" value={formatProjectionCurrency(result.finalBalance)} />
              <MetricBox
                label="Total Contributions"
                value={formatProjectionCurrency(result.totalContributions)}
              />
              <MetricBox
                label="Total Growth"
                value={formatProjectionCurrency(result.totalGrowth)}
                color="green"
              />
            </div>
          </div>

          {/* ── SCHEDULE ── */}
          <div className="pt-6">
            <div className="px-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Year-by-Year Schedule
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/20 text-muted-foreground">
                    <th className="text-left py-1.5 px-2 font-medium">Year</th>
                    <th className="text-right py-1.5 px-2 font-medium">Contributions</th>
                    <th className="text-right py-1.5 px-2 font-medium">Growth</th>
                    <th className="text-right py-1.5 px-2 font-medium">Balance</th>
                    {data.inflationRate > 0 && (
                      <th className="text-right py-1.5 px-2 font-medium">Real Value</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row) => (
                    <tr key={row.year} className="border-t border-border/20 hover:bg-muted/10">
                      <td className="py-1 px-2 text-muted-foreground">{row.year}</td>
                      <td className="py-1 px-2 text-right font-mono">
                        {formatProjectionCurrency(row.contributionsThisYear)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-green-600 dark:text-green-400">
                        {formatProjectionCurrency(row.growthThisYear)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono font-medium">
                        {formatProjectionCurrency(row.nominalBalance)}
                      </td>
                      {data.inflationRate > 0 && (
                        <td className="py-1 px-2 text-right font-mono text-muted-foreground">
                          {formatProjectionCurrency(row.realBalance)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Actual returns may vary based on market conditions and investment choices.
          </p>
        </div>
      </div>
    </div>
  );
});

// ─── Local Components ──────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 pt-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  isPercent,
}: { label: string; value: number; onChange: (v: number) => void; isPercent?: boolean }) {
  return (
    <div className="flex items-center hover:bg-muted/20 py-0.5 px-3">
      <span className="flex-1 text-[12px] text-foreground">{label}</span>
      {isPercent ? (
        <PercentInput value={value} onChange={onChange} />
      ) : (
        <AmountInput value={value} onChange={onChange} />
      )}
    </div>
  );
}

function ComputedRow({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={cn('flex items-center py-1 px-3', !sub && 'border-t border-border/40')}>
      <span
        className={cn(
          'flex-1 text-[12px]',
          sub ? 'text-muted-foreground' : 'font-semibold text-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'w-40 text-right font-mono text-[12px]',
          sub ? 'text-muted-foreground' : 'font-semibold text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AmountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? text : value === 0 ? '' : value.toLocaleString('en-US')}
      onChange={(e) => {
        setText(e.target.value);
        const num = Number(e.target.value.replace(/,/g, ''));
        if (!Number.isNaN(num)) onChange(num);
      }}
      onFocus={(e) => {
        setFocused(true);
        setText(value === 0 ? '' : String(value));
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        const num = Number(text.replace(/,/g, ''));
        if (!Number.isNaN(num)) onChange(num);
      }}
      className="w-40 text-right font-mono text-[13px] text-foreground bg-transparent border border-transparent rounded px-1 py-0.5 outline-none hover:border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
    />
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? text : value === 0 ? '' : `${value}`}
      onChange={(e) => {
        setText(e.target.value);
        const num = Number(e.target.value);
        if (!Number.isNaN(num) && num >= 0 && num <= 100) onChange(num);
      }}
      onFocus={(e) => {
        setFocused(true);
        setText(value === 0 ? '' : String(value));
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        const num = Number(text);
        if (!Number.isNaN(num) && num >= 0 && num <= 100) onChange(num);
      }}
      className="w-20 text-right font-mono text-[13px] text-foreground bg-transparent border border-transparent rounded px-1 py-0.5 outline-none hover:border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
    />
  );
}

function MetricBox({
  label,
  value,
  color,
}: { label: string; value: string; color?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-bold mt-0.5',
          color === 'green' && 'text-green-600 dark:text-green-400',
          color === 'red' && 'text-red-600 dark:text-red-400',
          !color && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
