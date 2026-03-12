import { memo } from 'react';
import { computeLoan, formatLoanCurrency } from '../../lib/loan-calculator-utils';
import type { LoanCalculatorData } from '../../lib/loan-calculator-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const LoanCalculatorCardContent = memo(function LoanCalculatorCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as LoanCalculatorData | undefined;

  const homePrice = data?.homePrice ?? 400000;
  const downPaymentPercent = data?.downPaymentPercent ?? 20;
  const loanTermYears = data?.loanTermYears ?? 30;
  const annualInterestRate = data?.annualInterestRate ?? 6.5;

  const result = computeLoan({
    mode: 'mortgage',
    homePrice,
    downPaymentPercent,
    loanTermYears,
    annualInterestRate,
    startDate: data?.startDate ?? '2026-03',
    annualPropertyTax: data?.annualPropertyTax ?? 3600,
    annualInsurance: data?.annualInsurance ?? 1800,
    monthlyHOA: data?.monthlyHOA ?? 0,
    pmiRatePercent: data?.pmiRatePercent ?? 0.5,
    extraMonthlyPayment: data?.extraMonthlyPayment ?? 0,
    notes: data?.notes ?? '',
  });

  // Donut ring segments
  const piTotal = result.loanAmount + result.totalInterest;
  const principalFraction = piTotal > 0 ? result.loanAmount / piTotal : 1;
  const circumference = 2 * Math.PI * 32;
  const principalDash = principalFraction * circumference;
  const interestDash = (1 - principalFraction) * circumference;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Thin header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Loan
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {loanTermYears}yr · {annualInterestRate}%
        </span>
      </div>

      {/* Body with donut */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2 gap-1.5">
        {/* SVG donut ring */}
        <div className="relative">
          <svg viewBox="0 0 80 80" className="size-[72px] -rotate-90">
            {/* Principal segment */}
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              strokeWidth="10"
              className="text-primary"
              stroke="currentColor"
              strokeDasharray={`${principalDash} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Interest segment */}
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              strokeWidth="10"
              className="text-orange-400"
              stroke="currentColor"
              strokeDasharray={`${interestDash} ${circumference}`}
              strokeDashoffset={-principalDash}
              strokeLinecap="round"
            />
          </svg>
          {/* Monthly payment centered in ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-mono tabular-nums font-bold text-foreground">
              {formatLoanCurrency(result.totalMonthlyPayment)}
            </span>
          </div>
        </div>

        <span className="text-[9px] text-muted-foreground">per month</span>

        {/* Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" />
            <span className="text-[9px] text-muted-foreground font-mono tabular-nums">
              {formatLoanCurrency(result.loanAmount)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-orange-400" />
            <span className="text-[9px] text-muted-foreground font-mono tabular-nums">
              {formatLoanCurrency(result.totalInterest)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/10">
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          Total: {formatLoanCurrency(result.totalCost)}
        </span>
      </div>
    </div>
  );
});
