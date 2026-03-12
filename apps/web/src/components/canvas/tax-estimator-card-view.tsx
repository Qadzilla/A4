import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FEDERAL_TAX_DATA,
  FILING_STATUS_OPTIONS,
  STATE_OPTIONS,
  TAX_YEAR_OPTIONS,
} from '../../lib/tax-data';
import type { TaxFilingStatus } from '../../lib/tax-data';
import {
  computeTaxEstimate,
  formatTaxCurrency,
  formatTaxPercent,
} from '../../lib/tax-estimator-utils';
import type { TaxEstimatorData } from '../../lib/tax-estimator-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const selectClass =
  'rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-7 cursor-pointer';

export const TaxEstimatorCardView = memo(function TaxEstimatorCardView({
  item,
}: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<TaxEstimatorData>(() => {
    const d = item.data as TaxEstimatorData | undefined;
    return {
      taxYear: d?.taxYear ?? 2025,
      filingStatus: d?.filingStatus ?? 'single',
      stateCode: d?.stateCode ?? '',
      w2Wages: d?.w2Wages ?? 0,
      selfEmploymentIncome: d?.selfEmploymentIncome ?? 0,
      investmentIncome: d?.investmentIncome ?? 0,
      otherIncome: d?.otherIncome ?? 0,
      retirement401k: d?.retirement401k ?? 0,
      traditionalIRA: d?.traditionalIRA ?? 0,
      hsaContribution: d?.hsaContribution ?? 0,
      studentLoanInterest: d?.studentLoanInterest ?? 0,
      deductionType: d?.deductionType ?? 'standard',
      saltDeduction: d?.saltDeduction ?? 0,
      mortgageInterest: d?.mortgageInterest ?? 0,
      charitableGiving: d?.charitableGiving ?? 0,
      otherItemized: d?.otherItemized ?? 0,
      numDependentChildren: d?.numDependentChildren ?? 0,
      otherCredits: d?.otherCredits ?? 0,
      federalWithheld: d?.federalWithheld ?? 0,
      stateWithheld: d?.stateWithheld ?? 0,
      estimatedPayments: d?.estimatedPayments ?? 0,
      notes: d?.notes ?? '',
    };
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    const d = item.data as TaxEstimatorData | undefined;
    setData({
      taxYear: d?.taxYear ?? 2025,
      filingStatus: d?.filingStatus ?? 'single',
      stateCode: d?.stateCode ?? '',
      w2Wages: d?.w2Wages ?? 0,
      selfEmploymentIncome: d?.selfEmploymentIncome ?? 0,
      investmentIncome: d?.investmentIncome ?? 0,
      otherIncome: d?.otherIncome ?? 0,
      retirement401k: d?.retirement401k ?? 0,
      traditionalIRA: d?.traditionalIRA ?? 0,
      hsaContribution: d?.hsaContribution ?? 0,
      studentLoanInterest: d?.studentLoanInterest ?? 0,
      deductionType: d?.deductionType ?? 'standard',
      saltDeduction: d?.saltDeduction ?? 0,
      mortgageInterest: d?.mortgageInterest ?? 0,
      charitableGiving: d?.charitableGiving ?? 0,
      otherItemized: d?.otherItemized ?? 0,
      numDependentChildren: d?.numDependentChildren ?? 0,
      otherCredits: d?.otherCredits ?? 0,
      federalWithheld: d?.federalWithheld ?? 0,
      stateWithheld: d?.stateWithheld ?? 0,
      estimatedPayments: d?.estimatedPayments ?? 0,
      notes: d?.notes ?? '',
    });
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

  const update = useCallback((patch: Partial<TaxEstimatorData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = computeTaxEstimate(data);
  const fed = FEDERAL_TAX_DATA[data.taxYear] ?? FEDERAL_TAX_DATA[2025]!;
  const standardDeduction = fed.standardDeduction[data.filingStatus];

  const ficaTotal = result.socialSecurityTax + result.medicareTax + result.additionalMedicareTax;

  const refundColor =
    result.refundOrOwed >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/30">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-2.5 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Tax Year
          <select
            value={data.taxYear}
            onChange={(e) => update({ taxYear: Number(e.target.value) })}
            className={selectClass}
          >
            {TAX_YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Filing Status
          <select
            value={data.filingStatus}
            onChange={(e) => update({ filingStatus: e.target.value as TaxFilingStatus })}
            className={selectClass}
          >
            {FILING_STATUS_OPTIONS.map((fs) => (
              <option key={fs.value} value={fs.value}>
                {fs.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          State
          <select
            value={data.stateCode}
            onChange={(e) => update({ stateCode: e.target.value })}
            className={selectClass}
          >
            {STATE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
          {/* ── INCOME ── */}
          <SectionHeader label="Income" />
          <FieldRow
            label="W-2 Wages"
            value={data.w2Wages}
            onChange={(v) => update({ w2Wages: v })}
          />
          <FieldRow
            label="Self-Employment Income"
            value={data.selfEmploymentIncome}
            onChange={(v) => update({ selfEmploymentIncome: v })}
          />
          <FieldRow
            label="Investment Income"
            value={data.investmentIncome}
            onChange={(v) => update({ investmentIncome: v })}
          />
          <FieldRow
            label="Other Income"
            value={data.otherIncome}
            onChange={(v) => update({ otherIncome: v })}
          />
          <ComputedRow label="Gross Income" value={formatTaxCurrency(result.grossIncome)} />

          {/* ── ADJUSTMENTS ── */}
          <SectionHeader label="Adjustments to Income" />
          <FieldRow
            label="401(k) Contributions"
            value={data.retirement401k}
            onChange={(v) => update({ retirement401k: v })}
          />
          <FieldRow
            label="Traditional IRA"
            value={data.traditionalIRA}
            onChange={(v) => update({ traditionalIRA: v })}
          />
          <FieldRow
            label="HSA Contributions"
            value={data.hsaContribution}
            onChange={(v) => update({ hsaContribution: v })}
          />
          <FieldRow
            label="Student Loan Interest"
            value={data.studentLoanInterest}
            onChange={(v) => update({ studentLoanInterest: v })}
          />
          <ComputedRow label="SE Tax Deduction" value={formatTaxCurrency(result.seDeduction)} sub />
          <ComputedRow label="Adjusted Gross Income" value={formatTaxCurrency(result.agi)} />

          {/* ── DEDUCTIONS ── */}
          <SectionHeader label="Deductions" />
          <div className="flex items-center gap-4 py-1.5 px-3">
            <label className="flex items-center gap-1.5 text-[12px] text-foreground cursor-pointer">
              <input
                type="radio"
                name="deductionType"
                checked={data.deductionType === 'standard'}
                onChange={() => update({ deductionType: 'standard' })}
                className="accent-primary"
              />
              Standard ({formatTaxCurrency(standardDeduction)})
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-foreground cursor-pointer">
              <input
                type="radio"
                name="deductionType"
                checked={data.deductionType === 'itemized'}
                onChange={() => update({ deductionType: 'itemized' })}
                className="accent-primary"
              />
              Itemized
            </label>
          </div>

          {data.deductionType === 'itemized' && (
            <>
              <FieldRow
                label="State & Local (SALT, max $10K)"
                value={data.saltDeduction}
                onChange={(v) => update({ saltDeduction: v })}
              />
              <FieldRow
                label="Mortgage Interest"
                value={data.mortgageInterest}
                onChange={(v) => update({ mortgageInterest: v })}
              />
              <FieldRow
                label="Charitable Giving"
                value={data.charitableGiving}
                onChange={(v) => update({ charitableGiving: v })}
              />
              <FieldRow
                label="Other Itemized"
                value={data.otherItemized}
                onChange={(v) => update({ otherItemized: v })}
              />
            </>
          )}
          <ComputedRow label="Taxable Income" value={formatTaxCurrency(result.taxableIncome)} />

          {/* ── TAX CALCULATION ── */}
          <SectionHeader label="Tax Calculation" />
          <div className="rounded-lg bg-muted/10 border border-border/30 py-1">
            <ComputedRow label="Federal Income Tax" value={formatTaxCurrency(result.federalTax)} />
            <ComputedRow
              label="Social Security Tax"
              value={formatTaxCurrency(result.socialSecurityTax)}
            />
            <ComputedRow label="Medicare Tax" value={formatTaxCurrency(result.medicareTax)} />
            {result.additionalMedicareTax > 0 && (
              <ComputedRow
                label="Additional Medicare Tax"
                value={formatTaxCurrency(result.additionalMedicareTax)}
              />
            )}
            {result.selfEmploymentTax > 0 && (
              <ComputedRow
                label="Self-Employment Tax"
                value={formatTaxCurrency(result.selfEmploymentTax)}
              />
            )}
            {data.stateCode && (
              <ComputedRow label="State Income Tax" value={formatTaxCurrency(result.stateTax)} />
            )}
          </div>
          <ComputedRow
            label="Total Tax Before Credits"
            value={formatTaxCurrency(
              result.federalTax +
                result.socialSecurityTax +
                result.medicareTax +
                result.additionalMedicareTax +
                result.selfEmploymentTax +
                result.stateTax,
            )}
          />

          {/* ── CREDITS ── */}
          <SectionHeader label="Credits" />
          <div className="flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
            <span className="flex-1 text-[12px] text-foreground">
              Child Tax Credit ({data.numDependentChildren}{' '}
              {data.numDependentChildren === 1 ? 'child' : 'children'})
            </span>
            <select
              value={data.numDependentChildren}
              onChange={(e) => update({ numDependentChildren: Number(e.target.value) })}
              className={cn(selectClass, 'w-16 text-right font-mono mr-1')}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="w-32 text-right font-mono tabular-nums text-[12px] text-muted-foreground">
              -{formatTaxCurrency(result.childTaxCredit)}
            </span>
          </div>
          <FieldRow
            label="Other Credits"
            value={data.otherCredits}
            onChange={(v) => update({ otherCredits: v })}
          />
          <ComputedRow label="Tax After Credits" value={formatTaxCurrency(result.totalTax)} />

          {/* ── WITHHOLDING & PAYMENTS ── */}
          <SectionHeader label="Withholding & Payments" />
          <FieldRow
            label="Federal Tax Withheld"
            value={data.federalWithheld}
            onChange={(v) => update({ federalWithheld: v })}
          />
          <FieldRow
            label="State Tax Withheld"
            value={data.stateWithheld}
            onChange={(v) => update({ stateWithheld: v })}
          />
          <FieldRow
            label="Estimated Payments"
            value={data.estimatedPayments}
            onChange={(v) => update({ estimatedPayments: v })}
          />
          <ComputedRow label="Total Payments" value={formatTaxCurrency(result.totalPayments)} />

          {/* ── REFUND / OWED ── */}
          <div className="flex items-center border-t-2 border-foreground/20 py-2.5 px-3 mt-2">
            <span className="flex-1 text-[13px] font-bold text-foreground uppercase tracking-wide">
              {result.refundOrOwed >= 0 ? 'Refund' : 'Amount Owed'}
            </span>
            <span className={cn('font-mono tabular-nums text-[16px] font-semibold', refundColor)}>
              {result.refundOrOwed >= 0 ? '+' : '-'}
              {formatTaxCurrency(Math.abs(result.refundOrOwed))}
            </span>
          </div>

          {/* ── METRICS ── */}
          <div className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricBox label="Effective Rate" value={formatTaxPercent(result.effectiveRate)} />
              <MetricBox
                label="Marginal Fed"
                value={formatTaxPercent(result.marginalFederalRate)}
              />
              <MetricBox
                label="Marginal State"
                value={data.stateCode ? formatTaxPercent(result.marginalStateRate) : '\u2014'}
              />
              <MetricBox label="Total Tax" value={formatTaxCurrency(result.totalTax)} />
              <MetricBox label="FICA" value={formatTaxCurrency(ficaTotal)} />
              <MetricBox
                label={result.refundOrOwed >= 0 ? 'Refund' : 'Owed'}
                value={`${result.refundOrOwed >= 0 ? '+' : '-'}${formatTaxCurrency(Math.abs(result.refundOrOwed))}`}
                color={result.refundOrOwed >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 pt-4 pb-2 text-center">
            Estimate only. Does not include AMT, local/city taxes, or multi-state scenarios. Consult
            a tax professional.
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
    <div className="flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
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
          sub ? 'text-muted-foreground italic' : 'font-semibold text-foreground',
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
