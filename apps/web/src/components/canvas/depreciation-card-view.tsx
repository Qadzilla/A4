import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  DEPRECIATION_METHODS,
  computeDepreciation,
  formatDepreciationCurrency,
} from '../../lib/depreciation-utils';
import type { DepreciationCardData, DepreciationMethod } from '../../lib/depreciation-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

function makeData(d: DepreciationCardData | undefined): DepreciationCardData {
  return {
    assetCost: d?.assetCost ?? 50000,
    salvageValue: d?.salvageValue ?? 5000,
    usefulLifeYears: d?.usefulLifeYears ?? 5,
    method: d?.method ?? 'straight-line',
    notes: d?.notes ?? '',
  };
}

export const DepreciationCardView = memo(function DepreciationCardView({
  item,
}: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<DepreciationCardData>(() =>
    makeData(item.data as DepreciationCardData | undefined),
  );

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    setData(makeData(item.data as DepreciationCardData | undefined));
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

  const update = useCallback((patch: Partial<DepreciationCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = computeDepreciation(data);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Method
          <select
            value={data.method}
            onChange={(e) => update({ method: e.target.value as DepreciationMethod })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {DEPRECIATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Life
          <select
            value={data.usefulLifeYears}
            onChange={(e) => update({ usefulLifeYears: Number(e.target.value) })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {[1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40, 50].map((y) => (
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
          <SectionHeader label="Asset Details" />
          <FieldRow
            label="Asset Cost"
            value={data.assetCost}
            onChange={(v) => update({ assetCost: v })}
          />
          <FieldRow
            label="Salvage Value"
            value={data.salvageValue}
            onChange={(v) => update({ salvageValue: v })}
          />
          <ComputedRow
            label="Depreciable Base"
            value={formatDepreciationCurrency(result.depreciableBase)}
          />

          {/* ── RESULTS ── */}
          <SectionHeader label="Results" />
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1">
            <ComputedRow
              label="Year 1 Depreciation"
              value={formatDepreciationCurrency(result.annualDepreciation)}
            />
            <ComputedRow
              label="Total Depreciation"
              value={formatDepreciationCurrency(result.totalDepreciation)}
              sub
            />
          </div>

          {/* ── METRICS ── */}
          <div className="pt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricBox
                label="Depreciable Base"
                value={formatDepreciationCurrency(result.depreciableBase)}
              />
              <MetricBox
                label="Year 1"
                value={formatDepreciationCurrency(result.annualDepreciation)}
              />
              <MetricBox
                label="Total Depreciation"
                value={formatDepreciationCurrency(result.totalDepreciation)}
              />
            </div>
          </div>

          {/* ── SCHEDULE ── */}
          <div className="pt-6">
            <div className="px-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Depreciation Schedule
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/20 text-muted-foreground">
                    <th className="text-left py-1.5 px-2 font-medium">Year</th>
                    <th className="text-right py-1.5 px-2 font-medium">Depreciation</th>
                    <th className="text-right py-1.5 px-2 font-medium">Accumulated</th>
                    <th className="text-right py-1.5 px-2 font-medium">Book Value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row) => (
                    <tr key={row.year} className="border-t border-border/20 hover:bg-muted/10">
                      <td className="py-1 px-2 text-muted-foreground">{row.year}</td>
                      <td className="py-1 px-2 text-right font-mono">
                        {formatDepreciationCurrency(row.depreciation)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-muted-foreground">
                        {formatDepreciationCurrency(row.accumulatedDepreciation)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono font-medium">
                        {formatDepreciationCurrency(row.bookValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Consult a tax professional for actual depreciation deductions.
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
}: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-[16px] font-bold mt-0.5 text-foreground">{value}</p>
    </div>
  );
}
