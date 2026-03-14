import { cn } from '@a4/ui';
import { memo } from 'react';
import { FILING_STATUS_LABELS } from '../../lib/tax-data';
import {
  computeTaxEstimate,
  formatTaxCurrency,
  formatTaxPercent,
} from '../../lib/tax-estimator-utils';
import type { TaxEstimatorData } from '../../lib/tax-estimator-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const TaxEstimatorCardContent = memo(function TaxEstimatorCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as TaxEstimatorData | undefined;

  const taxYear = data?.taxYear ?? 2025;
  const filingStatus = data?.filingStatus ?? 'single';
  const stateCode = data?.stateCode ?? '';

  const result = computeTaxEstimate({
    taxYear,
    filingStatus,
    stateCode,
    w2Wages: data?.w2Wages ?? 0,
    selfEmploymentIncome: data?.selfEmploymentIncome ?? 0,
    investmentIncome: data?.investmentIncome ?? 0,
    otherIncome: data?.otherIncome ?? 0,
    retirement401k: data?.retirement401k ?? 0,
    traditionalIRA: data?.traditionalIRA ?? 0,
    hsaContribution: data?.hsaContribution ?? 0,
    studentLoanInterest: data?.studentLoanInterest ?? 0,
    deductionType: data?.deductionType ?? 'standard',
    saltDeduction: data?.saltDeduction ?? 0,
    mortgageInterest: data?.mortgageInterest ?? 0,
    charitableGiving: data?.charitableGiving ?? 0,
    otherItemized: data?.otherItemized ?? 0,
    numDependentChildren: data?.numDependentChildren ?? 0,
    otherCredits: data?.otherCredits ?? 0,
    federalWithheld: data?.federalWithheld ?? 0,
    stateWithheld: data?.stateWithheld ?? 0,
    estimatedPayments: data?.estimatedPayments ?? 0,
    notes: data?.notes ?? '',
  });

  const isRefund = result.refundOrOwed >= 0;

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Header with year + status pill */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {taxYear}
        </span>
        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
          {FILING_STATUS_LABELS[filingStatus]}
        </span>
      </div>

      {/* Receipt-style body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        {/* Gross Income */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-muted-foreground">Gross Income</span>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            {formatTaxCurrency(result.grossIncome)}
          </span>
        </div>

        {/* Adjustments */}
        {result.adjustments > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-muted-foreground/70">Adjustments</span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              −{formatTaxCurrency(result.adjustments)}
            </span>
          </div>
        )}

        {/* Taxable Income */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-muted-foreground">Taxable Income</span>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            {formatTaxCurrency(result.taxableIncome)}
          </span>
        </div>

        {/* Dashed separator */}
        <div className="border-t border-dashed border-border/50 my-0.5" />

        {/* Federal Tax */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-muted-foreground">Federal Tax</span>
          <span className="text-[11px] font-mono tabular-nums text-foreground">
            {formatTaxCurrency(result.federalTax)}
          </span>
        </div>

        {/* State Tax */}
        {result.stateTax > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-muted-foreground">State Tax ({stateCode})</span>
            <span className="text-[11px] font-mono tabular-nums text-foreground">
              {formatTaxCurrency(result.stateTax)}
            </span>
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-border/40 my-0.5" />

        {/* Total Tax Due */}
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-foreground">Total Tax</span>
          <span className="text-[15px] font-mono tabular-nums font-bold text-foreground">
            {formatTaxCurrency(result.totalTax)}
          </span>
        </div>
      </div>

      {/* Footer: effective rate + refund/owed */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/10">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {formatTaxPercent(result.effectiveRate)} eff. rate
        </span>
        <span
          className={cn(
            'text-[10px] font-mono tabular-nums font-semibold',
            isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {isRefund ? `Refund ${formatTaxCurrency(result.refundOrOwed)}` : `Owe ${formatTaxCurrency(Math.abs(result.refundOrOwed))}`}
        </span>
      </div>
    </div>
  );
});
