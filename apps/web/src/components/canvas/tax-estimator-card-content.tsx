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

  const refundColor =
    result.refundOrOwed >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  const refundLabel = result.refundOrOwed >= 0 ? 'Refund Expected' : 'Amount Owed';
  const refundDisplay =
    result.refundOrOwed >= 0
      ? `+${formatTaxCurrency(result.refundOrOwed)}`
      : `-${formatTaxCurrency(Math.abs(result.refundOrOwed))}`;

  const stateLabel = stateCode || 'No state';
  const statusLabel = FILING_STATUS_LABELS[filingStatus];

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Tax Estimator
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {taxYear} · {statusLabel}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Estimated Tax</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatTaxCurrency(result.totalTax)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">{refundLabel}</p>
          <p className={cn('text-[15px] font-semibold leading-tight', refundColor)}>
            {refundDisplay}
          </p>
        </div>

        <p className="text-[11px] font-medium text-muted-foreground">
          Effective Rate: {formatTaxPercent(result.effectiveRate)}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">Federal + {stateLabel}</span>
      </div>
    </div>
  );
});
