import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { computeBreakeven, formatBreakevenCurrency } from '../../lib/breakeven-utils';
import type { BreakevenCardData } from '../../lib/breakeven-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

function makeData(d: BreakevenCardData | undefined): BreakevenCardData {
  return {
    fixedCosts: d?.fixedCosts ?? 5000,
    variableCostPerUnit: d?.variableCostPerUnit ?? 15,
    pricePerUnit: d?.pricePerUnit ?? 40,
    notes: d?.notes ?? '',
  };
}

export const BreakevenCardView = memo(function BreakevenCardView({ item }: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<BreakevenCardData>(() =>
    makeData(item.data as BreakevenCardData | undefined),
  );

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    setData(makeData(item.data as BreakevenCardData | undefined));
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

  const update = useCallback((patch: Partial<BreakevenCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = computeBreakeven(data);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 flex-wrap">
        <span className="text-[12px] text-muted-foreground">Break-Even Analysis</span>
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
          <SectionHeader label="Cost & Pricing" />
          <FieldRow
            label="Fixed Costs ($/mo)"
            value={data.fixedCosts}
            onChange={(v) => update({ fixedCosts: v })}
          />
          <FieldRow
            label="Variable Cost per Unit"
            value={data.variableCostPerUnit}
            onChange={(v) => update({ variableCostPerUnit: v })}
          />
          <FieldRow
            label="Price per Unit"
            value={data.pricePerUnit}
            onChange={(v) => update({ pricePerUnit: v })}
          />

          {/* ── RESULTS ── */}
          <SectionHeader label="Results" />
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1">
            <ComputedRow
              label="Contribution Margin"
              value={formatBreakevenCurrency(result.contributionMargin)}
            />
            <ComputedRow
              label="Margin %"
              value={`${result.contributionMarginPercent.toFixed(1)}%`}
              sub
            />
            <ComputedRow
              label="Break-Even Units"
              value={result.isViable ? result.breakEvenUnits.toLocaleString() : 'N/A'}
              sub
            />
            <ComputedRow
              label="Break-Even Revenue"
              value={result.isViable ? formatBreakevenCurrency(result.breakEvenRevenue) : 'N/A'}
              sub
            />
          </div>

          {!result.isViable && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 mt-2">
              <p className="text-[11px] text-destructive">
                Contribution margin is zero or negative. Price must exceed variable cost to break
                even.
              </p>
            </div>
          )}

          {/* ── METRICS ── */}
          <div className="pt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricBox
                label="Margin/Unit"
                value={formatBreakevenCurrency(result.contributionMargin)}
                color={result.contributionMargin > 0 ? 'green' : 'red'}
              />
              <MetricBox
                label="Break-Even Units"
                value={result.isViable ? result.breakEvenUnits.toLocaleString() : 'N/A'}
              />
              <MetricBox
                label="Break-Even Revenue"
                value={result.isViable ? formatBreakevenCurrency(result.breakEvenRevenue) : 'N/A'}
              />
            </div>
          </div>

          {/* ── SCHEDULE ── */}
          <div className="pt-6">
            <div className="px-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Profit/Loss Schedule
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/20 text-muted-foreground">
                    <th className="text-right py-1.5 px-2 font-medium">Units</th>
                    <th className="text-right py-1.5 px-2 font-medium">Revenue</th>
                    <th className="text-right py-1.5 px-2 font-medium">Total Costs</th>
                    <th className="text-right py-1.5 px-2 font-medium">Profit/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row) => (
                    <tr key={row.units} className="border-t border-border/20 hover:bg-muted/10">
                      <td className="py-1 px-2 text-right font-mono">
                        {row.units.toLocaleString()}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">
                        {formatBreakevenCurrency(row.revenue)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">
                        {formatBreakevenCurrency(row.totalCosts)}
                      </td>
                      <td
                        className={cn(
                          'py-1 px-2 text-right font-mono font-medium',
                          row.profitLoss >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {formatBreakevenCurrency(row.profitLoss)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Actual results may vary based on market conditions and operational
            factors.
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
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center hover:bg-muted/20 py-0.5 px-3">
      <span className="flex-1 text-[12px] text-foreground">{label}</span>
      <AmountInput value={value} onChange={onChange} />
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
