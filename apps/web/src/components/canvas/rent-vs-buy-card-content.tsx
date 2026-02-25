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

  // Cost comparison bar proportions
  const rentTotal = result.totalRentCost;
  const buyTotal = result.totalBuyCost;
  const maxCost = Math.max(rentTotal, buyTotal, 1);
  const rentPct = (rentTotal / maxCost) * 100;
  const buyPct = (buyTotal / maxCost) * 100;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Rent vs Buy
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {analysisYears}yr analysis
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1.5">
        {/* Recommendation headline */}
        <p
          className={cn(
            'text-[15px] font-bold leading-tight',
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
        </p>

        {/* Crossover info */}
        {result.crossoverMonth !== null ? (
          <p className="text-[11px] text-muted-foreground">
            Crossover at month {result.crossoverMonth}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {result.recommendation === 'rent' ? 'No crossover in period' : ''}
          </p>
        )}

        {/* Cost comparison bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Rent</span>
            <span>Buy</span>
          </div>
          <div className="flex gap-0.5 h-2">
            <div className="bg-blue-400/70 rounded-l-full" style={{ width: `${rentPct}%` }} />
            <div className="bg-green-400/70 rounded-r-full" style={{ width: `${buyPct}%` }} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Rent: ${compactFormatter.format(monthlyRent)}/mo
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Buy: ${compactFormatter.format(result.initialMonthlyBuyCost)}/mo
        </span>
      </div>
    </div>
  );
});
