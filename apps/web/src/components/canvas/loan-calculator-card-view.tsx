import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { computeLoan, formatLoanCurrency } from '../../lib/loan-calculator-utils';
import type { AmortizationRow, LoanCalculatorData } from '../../lib/loan-calculator-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const selectClass =
  'rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-7 cursor-pointer';

function makeData(d: LoanCalculatorData | undefined): LoanCalculatorData {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    mode: 'mortgage',
    homePrice: d?.homePrice ?? 400000,
    downPaymentPercent: d?.downPaymentPercent ?? 20,
    loanTermYears: d?.loanTermYears ?? 30,
    annualInterestRate: d?.annualInterestRate ?? 6.5,
    startDate: d?.startDate ?? `${now.getFullYear()}-${month}`,
    annualPropertyTax: d?.annualPropertyTax ?? 3600,
    annualInsurance: d?.annualInsurance ?? 1800,
    monthlyHOA: d?.monthlyHOA ?? 0,
    pmiRatePercent: d?.pmiRatePercent ?? 0.5,
    extraMonthlyPayment: d?.extraMonthlyPayment ?? 0,
    notes: d?.notes ?? '',
  };
}

export const LoanCalculatorCardView = memo(function LoanCalculatorCardView({
  item,
}: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<LoanCalculatorData>(() =>
    makeData(item.data as LoanCalculatorData | undefined),
  );

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);
  const [scheduleView, setScheduleView] = useState<'monthly' | 'yearly'>('yearly');

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    setData(makeData(item.data as LoanCalculatorData | undefined));
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

  const update = useCallback((patch: Partial<LoanCalculatorData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = computeLoan(data);
  const downPaymentDollars = (data.homePrice * data.downPaymentPercent) / 100;

  // Group schedule by year for yearly view
  const yearlyGroups = groupByYear(result.schedule);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/30">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-2.5 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Term
          <select
            value={data.loanTermYears}
            onChange={(e) => update({ loanTermYears: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={15}>15 yr</option>
            <option value={20}>20 yr</option>
            <option value={30}>30 yr</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Start
          <input
            type="month"
            value={data.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
        </label>

        {saveStatus !== 'idle' && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-1">
          {/* ── LOAN DETAILS ── */}
          <SectionHeader label="Loan Details" />
          <FieldRow
            label="Home Price"
            value={data.homePrice}
            onChange={(v) => update({ homePrice: v })}
          />
          <div className="flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
            <span className="flex-1 text-[12px] text-foreground">Down Payment (%)</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                {formatLoanCurrency(downPaymentDollars)}
              </span>
              <PercentInput
                value={data.downPaymentPercent}
                onChange={(v) => update({ downPaymentPercent: v })}
              />
            </div>
          </div>
          <FieldRow
            label="Interest Rate (%)"
            value={data.annualInterestRate}
            onChange={(v) => update({ annualInterestRate: v })}
            isPercent
          />
          <ComputedRow label="Loan Amount" value={formatLoanCurrency(result.loanAmount)} />

          {/* ── MONTHLY COSTS ── */}
          <SectionHeader label="Monthly Costs" />
          <FieldRow
            label="Property Tax ($/yr)"
            value={data.annualPropertyTax}
            onChange={(v) => update({ annualPropertyTax: v })}
          />
          <FieldRow
            label="Insurance ($/yr)"
            value={data.annualInsurance}
            onChange={(v) => update({ annualInsurance: v })}
          />
          <FieldRow
            label="HOA ($/mo)"
            value={data.monthlyHOA}
            onChange={(v) => update({ monthlyHOA: v })}
          />
          <div className="flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
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

          {/* ── EXTRA PAYMENTS ── */}
          <SectionHeader label="Extra Payments" />
          <FieldRow
            label="Extra Monthly Payment"
            value={data.extraMonthlyPayment}
            onChange={(v) => update({ extraMonthlyPayment: v })}
          />

          {/* ── PAYMENT BREAKDOWN ── */}
          <SectionHeader label="Payment Breakdown" />
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1">
            <ComputedRow
              label="Principal & Interest"
              value={formatLoanCurrency(result.monthlyPI)}
            />
            <ComputedRow
              label="Property Tax"
              value={formatLoanCurrency(result.monthlyPropertyTax)}
              sub
            />
            <ComputedRow
              label="Insurance"
              value={formatLoanCurrency(result.monthlyInsurance)}
              sub
            />
            {result.monthlyPMI > 0 && (
              <ComputedRow label="PMI" value={formatLoanCurrency(result.monthlyPMI)} sub />
            )}
            {result.monthlyHOA > 0 && (
              <ComputedRow label="HOA" value={formatLoanCurrency(result.monthlyHOA)} sub />
            )}
          </div>

          <div className="flex items-center border-t-2 border-foreground/20 py-2.5 px-3 mt-2">
            <span className="flex-1 text-[13px] font-bold text-foreground uppercase tracking-wide">
              Monthly Payment
            </span>
            <span className="font-mono tabular-nums text-[16px] font-semibold text-foreground">
              {formatLoanCurrency(result.totalMonthlyPayment)}
            </span>
          </div>

          {/* ── PAYMENT BREAKDOWN BAR ── */}
          <PaymentBar result={result} />

          {/* ── METRICS ── */}
          <div className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricBox label="Total Interest" value={formatLoanCurrency(result.totalInterest)} />
              <MetricBox label="Total Cost" value={formatLoanCurrency(result.totalCost)} />
              <MetricBox label="Payoff Date" value={result.payoffDate} />
              {result.withExtra && (
                <>
                  <MetricBox
                    label="Interest Saved"
                    value={formatLoanCurrency(result.withExtra.interestSaved)}
                    color="green"
                  />
                  <MetricBox
                    label="Months Saved"
                    value={String(result.withExtra.monthsSaved)}
                    color="green"
                  />
                  <MetricBox label="New Payoff" value={result.withExtra.payoffDate} color="green" />
                </>
              )}
            </div>
          </div>

          {/* ── AMORTIZATION SCHEDULE ── */}
          <div className="pt-8">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Amortization Schedule
              </span>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  className={cn(
                    'px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    scheduleView === 'yearly'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40',
                  )}
                  onClick={() => setScheduleView('yearly')}
                >
                  Yearly
                </button>
                <button
                  type="button"
                  className={cn(
                    'px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    scheduleView === 'monthly'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40',
                  )}
                  onClick={() => setScheduleView('monthly')}
                >
                  Monthly
                </button>
              </div>
            </div>

            {scheduleView === 'monthly' ? (
              <MonthlyTable schedule={result.schedule} />
            ) : (
              <YearlyTable groups={yearlyGroups} />
            )}
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Actual payments may vary based on lender terms, escrow adjustments, and
            other factors.
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
    <div className="flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
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
          'w-40 text-right font-mono tabular-nums text-[12px]',
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
      className="w-40 text-right font-mono tabular-nums text-[13px] text-foreground border border-border bg-muted/20 rounded-md px-1 py-0.5 outline-none focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/30 transition-all"
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
      className="w-20 text-right font-mono tabular-nums text-[13px] text-foreground border border-border bg-muted/20 rounded-md px-1 py-0.5 outline-none focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/30 transition-all"
    />
  );
}

function MetricBox({
  label,
  value,
  color,
}: { label: string; value: string; color?: 'green' | 'red' }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-semibold font-mono tabular-nums mt-1',
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

function PaymentBar({ result }: { result: ReturnType<typeof computeLoan> }) {
  const total = result.totalMonthlyPayment;
  if (total === 0) return null;

  const segments = [
    { label: 'P&I', value: result.monthlyPI, color: 'bg-primary/70' },
    { label: 'Tax', value: result.monthlyPropertyTax, color: 'bg-blue-400/70' },
    { label: 'Ins', value: result.monthlyInsurance, color: 'bg-amber-400/70' },
    ...(result.monthlyPMI > 0
      ? [{ label: 'PMI', value: result.monthlyPMI, color: 'bg-red-400/70' }]
      : []),
    ...(result.monthlyHOA > 0
      ? [{ label: 'HOA', value: result.monthlyHOA, color: 'bg-purple-400/70' }]
      : []),
  ];

  return (
    <div className="px-3 pt-2 space-y-1.5">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={seg.color}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={cn('size-2 rounded-full', seg.color)} />
            <span className="text-[10px] text-muted-foreground">
              {seg.label}: {formatLoanCurrency(seg.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Amortization Tables ───────────────────────────────────────────

interface YearGroup {
  year: string;
  rows: AmortizationRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalExtra: number;
  totalPMI: number;
  endBalance: number;
}

function groupByYear(schedule: AmortizationRow[]): YearGroup[] {
  const groups: Map<string, AmortizationRow[]> = new Map();
  for (const row of schedule) {
    const year = row.date.split(' ')[1] ?? '';
    const existing = groups.get(year);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(year, [row]);
    }
  }

  return Array.from(groups.entries()).map(([year, rows]) => ({
    year,
    rows,
    totalPrincipal: rows.reduce((s, r) => s + r.principal, 0),
    totalInterest: rows.reduce((s, r) => s + r.interest, 0),
    totalExtra: rows.reduce((s, r) => s + r.extraPayment, 0),
    totalPMI: rows.reduce((s, r) => s + r.pmi, 0),
    endBalance: rows[rows.length - 1]?.balance ?? 0,
  }));
}

function MonthlyTable({ schedule }: { schedule: AmortizationRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <th className="text-left py-2 px-2">#</th>
            <th className="text-left py-2 px-2">Date</th>
            <th className="text-right py-2 px-2">Payment</th>
            <th className="text-right py-2 px-2">Principal</th>
            <th className="text-right py-2 px-2">Interest</th>
            <th className="text-right py-2 px-2">Extra</th>
            <th className="text-right py-2 px-2">PMI</th>
            <th className="text-right py-2 px-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.month} className="border-t border-border/40 transition-colors hover:bg-muted/20">
              <td className="py-1 px-2 text-muted-foreground">{row.month}</td>
              <td className="py-1 px-2 text-foreground">{row.date}</td>
              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{formatLoanCurrency(row.payment)}</td>
              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">
                {formatLoanCurrency(row.principal)}
              </td>
              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{formatLoanCurrency(row.interest)}</td>
              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">
                {row.extraPayment > 0 ? formatLoanCurrency(row.extraPayment) : ''}
              </td>
              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">
                {row.pmi > 0 ? formatLoanCurrency(row.pmi) : ''}
              </td>
              <td className="py-1 px-2 text-right font-mono tabular-nums font-medium text-foreground">
                {formatLoanCurrency(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearlyTable({ groups }: { groups: YearGroup[] }) {
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const toggleYear = (year: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            <th className="text-left py-2 px-2">Year</th>
            <th className="text-right py-2 px-2">Principal</th>
            <th className="text-right py-2 px-2">Interest</th>
            <th className="text-right py-2 px-2">Extra</th>
            <th className="text-right py-2 px-2">PMI</th>
            <th className="text-right py-2 px-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isExpanded = expandedYears.has(g.year);
            return (
              <YearRow
                key={g.year}
                group={g}
                isExpanded={isExpanded}
                onToggle={() => toggleYear(g.year)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function YearRow({
  group,
  isExpanded,
  onToggle,
}: { group: YearGroup; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-t border-border/40 transition-colors hover:bg-muted/20 cursor-pointer font-medium"
        onClick={onToggle}
      >
        <td className="py-1.5 px-2 text-foreground">
          <span className="inline-flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90',
              )}
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            {group.year}
          </span>
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums text-foreground">
          {formatLoanCurrency(group.totalPrincipal)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums text-foreground">
          {formatLoanCurrency(group.totalInterest)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums text-foreground">
          {group.totalExtra > 0 ? formatLoanCurrency(group.totalExtra) : ''}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums text-foreground">
          {group.totalPMI > 0 ? formatLoanCurrency(group.totalPMI) : ''}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold text-foreground">
          {formatLoanCurrency(group.endBalance)}
        </td>
      </tr>
      {isExpanded &&
        group.rows.map((row) => (
          <tr
            key={row.month}
            className="border-t border-border/20 bg-muted/5 text-muted-foreground"
          >
            <td className="py-0.5 px-2 pl-6">{row.date}</td>
            <td className="py-0.5 px-2 text-right font-mono tabular-nums">
              {formatLoanCurrency(row.principal)}
            </td>
            <td className="py-0.5 px-2 text-right font-mono tabular-nums">{formatLoanCurrency(row.interest)}</td>
            <td className="py-0.5 px-2 text-right font-mono tabular-nums">
              {row.extraPayment > 0 ? formatLoanCurrency(row.extraPayment) : ''}
            </td>
            <td className="py-0.5 px-2 text-right font-mono tabular-nums">
              {row.pmi > 0 ? formatLoanCurrency(row.pmi) : ''}
            </td>
            <td className="py-0.5 px-2 text-right font-mono tabular-nums">{formatLoanCurrency(row.balance)}</td>
          </tr>
        ))}
    </>
  );
}
