import { cn } from '@a4/ui';
import { memo, useMemo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { computeRentVsBuy } from '../../lib/rent-vs-buy-utils';
import type { RentVsBuyCardData } from '../../lib/rent-vs-buy-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const RentVsBuyCardContent = memo(function RentVsBuyCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as RentVsBuyCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const analysisYears = data?.analysisYears ?? 10;
  const startDate = data?.startDate ?? '2026-03';
  const monthlyRent = data?.monthlyRent ?? 2000;
  const annualRentIncrease = data?.annualRentIncrease ?? 3;
  const monthlyRentersInsurance = data?.monthlyRentersInsurance ?? 30;
  const homePrice = data?.homePrice ?? 400000;
  const downPaymentPercent = data?.downPaymentPercent ?? 20;
  const loanTermYears = data?.loanTermYears ?? 30;
  const annualInterestRate = data?.annualInterestRate ?? 6.5;
  const annualPropertyTax = data?.annualPropertyTax ?? 3600;
  const annualHomeInsurance = data?.annualHomeInsurance ?? 1800;
  const annualMaintenancePercent = data?.annualMaintenancePercent ?? 1;
  const monthlyHOA = data?.monthlyHOA ?? 0;
  const pmiRatePercent = data?.pmiRatePercent ?? 0.5;
  const closingCostPercent = data?.closingCostPercent ?? 3;
  const sellingCostPercent = data?.sellingCostPercent ?? 6;
  const annualHomeAppreciation = data?.annualHomeAppreciation ?? 3;
  const annualInvestmentReturn = data?.annualInvestmentReturn ?? 7;
  const notes = data?.notes ?? '';

  const result = useMemo(
    () =>
      computeRentVsBuy({
        currency,
        analysisYears,
        startDate,
        monthlyRent,
        annualRentIncrease,
        monthlyRentersInsurance,
        homePrice,
        downPaymentPercent,
        loanTermYears,
        annualInterestRate,
        annualPropertyTax,
        annualHomeInsurance,
        annualMaintenancePercent,
        monthlyHOA,
        pmiRatePercent,
        closingCostPercent,
        sellingCostPercent,
        annualHomeAppreciation,
        annualInvestmentReturn,
        notes,
      }),
    [
      currency,
      analysisYears,
      startDate,
      monthlyRent,
      annualRentIncrease,
      monthlyRentersInsurance,
      homePrice,
      downPaymentPercent,
      loanTermYears,
      annualInterestRate,
      annualPropertyTax,
      annualHomeInsurance,
      annualMaintenancePercent,
      monthlyHOA,
      pmiRatePercent,
      closingCostPercent,
      sellingCostPercent,
      annualHomeAppreciation,
      annualInvestmentReturn,
      notes,
    ],
  );

  const absDiff = Math.abs(result.netDifference);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Rent vs Buy
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {analysisYears}yr
        </span>
      </div>

      {/* Split comparison body */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Two halves */}
        <div className="flex flex-1 min-h-0">
          {/* Rent half */}
          <div className="flex-1 flex flex-col items-center justify-center px-2 py-2 gap-1">
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Rent
            </span>
            <span className="text-[14px] font-mono tabular-nums font-bold text-foreground">
              ${compactFormatter.format(result.totalRentCost)}
            </span>
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              ${compactFormatter.format(monthlyRent)}/mo
            </span>
          </div>

          {/* Vertical divider */}
          <div className="border-r border-border/40" />

          {/* Buy half */}
          <div className="flex-1 flex flex-col items-center justify-center px-2 py-2 gap-1">
            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
              Buy
            </span>
            <span className="text-[14px] font-mono tabular-nums font-bold text-foreground">
              ${compactFormatter.format(result.totalBuyCost)}
            </span>
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              ${compactFormatter.format(result.initialMonthlyBuyCost)}/mo
            </span>
          </div>
        </div>

        {/* Recommendation banner */}
        <div
          className={cn(
            'px-3 py-2 text-center',
            result.recommendation === 'buy' && 'bg-green-500/10',
            result.recommendation === 'rent' && 'bg-blue-500/10',
            result.recommendation === 'neutral' && 'bg-muted/20',
          )}
        >
          <span
            className={cn(
              'text-[12px] font-semibold',
              result.recommendation === 'buy' && 'text-green-600 dark:text-green-400',
              result.recommendation === 'rent' && 'text-blue-600 dark:text-blue-400',
              result.recommendation === 'neutral' && 'text-muted-foreground',
            )}
          >
            {result.recommendation === 'buy'
              ? `Buy saves ${formatCurrency(absDiff, currency)}`
              : result.recommendation === 'rent'
                ? `Rent saves ${formatCurrency(absDiff, currency)}`
                : 'Roughly equal'}
          </span>
        </div>
      </div>
    </div>
  );
});
