import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import { computeRentVsBuy, createDefaultRentVsBuyData } from '../../lib/rent-vs-buy-utils';
import type { RentVsBuyCardData } from '../../lib/rent-vs-buy-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

function makeData(d: RentVsBuyCardData | undefined): RentVsBuyCardData {
  return d?.currency ? { ...createDefaultRentVsBuyData(), ...d } : createDefaultRentVsBuyData();
}

export const RentVsBuyCardView = memo(function RentVsBuyCardView({ item }: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<RentVsBuyCardData>(() =>
    makeData(item.data as RentVsBuyCardData | undefined),
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    setData(makeData(item.data as RentVsBuyCardData | undefined));
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

  const update = useCallback((patch: Partial<RentVsBuyCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = useMemo(() => computeRentVsBuy(data), [data]);
  const fmt = useCallback((n: number) => formatCurrency(n, data.currency), [data.currency]);

  const downPaymentDollars = (data.homePrice * data.downPaymentPercent) / 100;

  // Year-by-year grouping: take every 12th schedule row
  const yearlyRows = useMemo(() => {
    const rows: {
      year: number;
      rentCost: number;
      buyCost: number;
      investments: number;
      homeEquity: number;
      rentNet: number;
      buyNet: number;
    }[] = [];
    for (let i = 11; i < result.schedule.length; i += 12) {
      const row = result.schedule[i];
      if (!row) continue;
      const prevRow = i >= 12 ? (result.schedule[i - 12] ?? null) : null;
      rows.push({
        year: Math.floor(i / 12) + 1,
        rentCost: prevRow
          ? row.cumulativeRentCost - prevRow.cumulativeRentCost
          : row.cumulativeRentCost,
        buyCost: prevRow
          ? row.cumulativeBuyCost - prevRow.cumulativeBuyCost
          : row.cumulativeBuyCost,
        investments: row.investmentBalance,
        homeEquity: row.homeEquity,
        rentNet: row.rentNetPosition,
        buyNet: row.buyNetPosition,
      });
    }
    return rows;
  }, [result.schedule]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Settings strip */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Period
          <select
            value={data.analysisYears}
            onChange={(e) => update({ analysisYears: Number(e.target.value) })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {[3, 5, 7, 10, 15, 20, 25, 30].map((y) => (
              <option key={y} value={y}>
                {y} yr
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Start
          <input
            type="month"
            value={data.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Currency
          <select
            value={data.currency}
            onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
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
          {/* ── RENT ASSUMPTIONS ── */}
          <SectionHeader label="Rent Assumptions" />
          <FieldRow
            label="Monthly Rent"
            value={data.monthlyRent}
            onChange={(v) => update({ monthlyRent: v })}
          />
          <FieldRow
            label="Annual Rent Increase (%)"
            value={data.annualRentIncrease}
            onChange={(v) => update({ annualRentIncrease: v })}
            isPercent
          />
          <FieldRow
            label="Renter's Insurance ($/mo)"
            value={data.monthlyRentersInsurance}
            onChange={(v) => update({ monthlyRentersInsurance: v })}
          />

          {/* ── BUY ASSUMPTIONS ── */}
          <SectionHeader label="Buy Assumptions" />
          <FieldRow
            label="Home Price"
            value={data.homePrice}
            onChange={(v) => update({ homePrice: v })}
          />
          <div className="flex items-center hover:bg-muted/20 py-0.5 px-3">
            <span className="flex-1 text-[12px] text-foreground">Down Payment (%)</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono">
                {fmt(downPaymentDollars)}
              </span>
              <PercentInput
                value={data.downPaymentPercent}
                onChange={(v) => update({ downPaymentPercent: v })}
              />
            </div>
          </div>
          <div className="flex items-center hover:bg-muted/20 py-0.5 px-3">
            <span className="flex-1 text-[12px] text-foreground">Loan Term</span>
            <select
              value={data.loanTermYears}
              onChange={(e) => update({ loanTermYears: Number(e.target.value) })}
              className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
            >
              <option value={15}>15 yr</option>
              <option value={20}>20 yr</option>
              <option value={30}>30 yr</option>
            </select>
          </div>
          <FieldRow
            label="Interest Rate (%)"
            value={data.annualInterestRate}
            onChange={(v) => update({ annualInterestRate: v })}
            isPercent
          />
          <FieldRow
            label="Property Tax ($/yr)"
            value={data.annualPropertyTax}
            onChange={(v) => update({ annualPropertyTax: v })}
          />
          <FieldRow
            label="Home Insurance ($/yr)"
            value={data.annualHomeInsurance}
            onChange={(v) => update({ annualHomeInsurance: v })}
          />
          <FieldRow
            label="Maintenance (%/yr)"
            value={data.annualMaintenancePercent}
            onChange={(v) => update({ annualMaintenancePercent: v })}
            isPercent
          />
          <FieldRow
            label="HOA ($/mo)"
            value={data.monthlyHOA}
            onChange={(v) => update({ monthlyHOA: v })}
          />
          <div className="flex items-center hover:bg-muted/20 py-0.5 px-3">
            <span className="flex-1 text-[12px] text-foreground">
              PMI Rate (%)
              {data.downPaymentPercent >= 20 && (
                <span className="text-[10px] text-muted-foreground ml-1">N/A</span>
              )}
            </span>
            <PercentInput
              value={data.pmiRatePercent}
              onChange={(v) => update({ pmiRatePercent: v })}
            />
          </div>
          <FieldRow
            label="Closing Costs (%)"
            value={data.closingCostPercent}
            onChange={(v) => update({ closingCostPercent: v })}
            isPercent
          />
          <FieldRow
            label="Selling Costs (%)"
            value={data.sellingCostPercent}
            onChange={(v) => update({ sellingCostPercent: v })}
            isPercent
          />

          {/* ── MARKET ASSUMPTIONS ── */}
          <SectionHeader label="Market Assumptions" />
          <FieldRow
            label="Home Appreciation (%/yr)"
            value={data.annualHomeAppreciation}
            onChange={(v) => update({ annualHomeAppreciation: v })}
            isPercent
          />
          <FieldRow
            label="Investment Return (%/yr)"
            value={data.annualInvestmentReturn}
            onChange={(v) => update({ annualInvestmentReturn: v })}
            isPercent
          />

          {/* ── RESULTS ── */}
          <SectionHeader label="Results" />

          {/* Recommendation banner */}
          <div
            className={cn(
              'rounded-lg px-4 py-3 border',
              result.recommendation === 'buy' &&
                'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
              result.recommendation === 'rent' &&
                'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
              result.recommendation === 'neutral' && 'bg-muted/20 border-border/40',
            )}
          >
            <p
              className={cn(
                'text-[15px] font-bold',
                result.recommendation === 'buy' && 'text-green-700 dark:text-green-400',
                result.recommendation === 'rent' && 'text-blue-700 dark:text-blue-400',
                result.recommendation === 'neutral' && 'text-muted-foreground',
              )}
            >
              {result.recommendation === 'buy'
                ? `Buying saves ${fmt(Math.abs(result.netDifference))} over ${data.analysisYears} years`
                : result.recommendation === 'rent'
                  ? `Renting saves ${fmt(Math.abs(result.netDifference))} over ${data.analysisYears} years`
                  : `Roughly equal over ${data.analysisYears} years`}
            </p>
            {result.crossoverMonth !== null && (
              <p className="text-[12px] text-muted-foreground mt-1">
                Buying becomes favorable at month {result.crossoverMonth} ({result.crossoverDate})
              </p>
            )}
          </div>

          {/* Side-by-side comparison */}
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1 mt-2">
            <ComputedRow label="Total Rent Cost" value={fmt(result.totalRentCost)} />
            <ComputedRow
              label="Investment Balance"
              value={fmt(result.finalInvestmentBalance)}
              sub
            />
            <ComputedRow label="Rent Net Position" value={fmt(result.rentNetPosition)} />
            <div className="h-px bg-border/40 my-1" />
            <ComputedRow label="Total Buy Cost" value={fmt(result.totalBuyCost)} />
            <ComputedRow label="Final Home Value" value={fmt(result.finalHomeValue)} sub />
            <ComputedRow label="Final Home Equity" value={fmt(result.finalHomeEquity)} sub />
            <ComputedRow label="Buy Net Position" value={fmt(result.buyNetPosition)} />
          </div>

          {/* Metrics grid */}
          <div className="pt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricBox
                label="Crossover Month"
                value={result.crossoverMonth !== null ? `Month ${result.crossoverMonth}` : 'N/A'}
              />
              <MetricBox
                label="Net Difference"
                value={fmt(Math.abs(result.netDifference))}
                color={
                  result.recommendation === 'buy'
                    ? 'green'
                    : result.recommendation === 'rent'
                      ? 'blue'
                      : undefined
                }
              />
              <MetricBox label="Monthly Mortgage" value={fmt(result.monthlyMortgagePI)} />
            </div>
          </div>

          {/* ── YEAR-BY-YEAR TABLE ── */}
          <div className="pt-6">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 pb-2 w-full text-left"
              onClick={() => setShowSchedule((p) => !p)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={cn(
                  'size-3 text-muted-foreground transition-transform',
                  showSchedule && 'rotate-90',
                )}
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Year-by-Year Comparison
              </span>
            </button>

            {showSchedule && (
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/20 text-muted-foreground">
                      <th className="text-left py-1.5 px-2 font-medium">Year</th>
                      <th className="text-right py-1.5 px-2 font-medium">Rent Cost</th>
                      <th className="text-right py-1.5 px-2 font-medium">Buy Cost</th>
                      <th className="text-right py-1.5 px-2 font-medium">Investments</th>
                      <th className="text-right py-1.5 px-2 font-medium">Home Equity</th>
                      <th className="text-right py-1.5 px-2 font-medium">Rent Net</th>
                      <th className="text-right py-1.5 px-2 font-medium">Buy Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyRows.map((row) => (
                      <tr
                        key={row.year}
                        className={cn(
                          'border-t border-border/20 hover:bg-muted/10',
                          row.buyNet > row.rentNet && 'bg-green-50/30 dark:bg-green-950/10',
                        )}
                      >
                        <td className="py-1 px-2 font-medium">{row.year}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmt(row.rentCost)}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmt(row.buyCost)}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmt(row.investments)}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmt(row.homeEquity)}</td>
                        <td className="py-1 px-2 text-right font-mono">{fmt(row.rentNet)}</td>
                        <td
                          className={cn(
                            'py-1 px-2 text-right font-mono font-medium',
                            row.buyNet > row.rentNet
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-foreground',
                          )}
                        >
                          {fmt(row.buyNet)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notes */}
          <SectionHeader label="Notes" />
          <textarea
            value={data.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Add notes..."
            className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none"
            rows={3}
          />

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Actual costs vary based on market conditions, tax implications, and
            individual circumstances.
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
}: { label: string; value: string; color?: 'green' | 'blue' }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-bold mt-0.5',
          color === 'green' && 'text-green-600 dark:text-green-400',
          color === 'blue' && 'text-blue-600 dark:text-blue-400',
          !color && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
