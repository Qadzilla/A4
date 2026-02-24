import { memo } from 'react';
import { cn } from '@a4/ui';
import type { CanvasItem } from '../../stores/canvas-store';
import { computeLoan, formatLoanCurrency } from '../../lib/loan-calculator-utils';
import type { LoanCalculatorData } from '../../lib/loan-calculator-utils';

export const LoanCalculatorCardContent = memo(function LoanCalculatorCardContent({ item }: { item: CanvasItem }) {
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

  // Interest ratio for visual bar
  const piTotal = result.loanAmount + result.totalInterest;
  const principalPct = piTotal > 0 ? (result.loanAmount / piTotal) * 100 : 100;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Loan Calculator
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {loanTermYears}yr · {annualInterestRate}%
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Monthly Payment</p>
          <p className="text-[20px] font-bold leading-tight text-foreground">
            {formatLoanCurrency(result.totalMonthlyPayment)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground">Loan Amount</p>
          <p className="text-[15px] font-semibold leading-tight text-foreground">
            {formatLoanCurrency(result.loanAmount)}
          </p>
        </div>

        {/* Principal vs Interest bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Principal</span>
            <span>Interest</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
            <div
              className="bg-primary/70 rounded-l-full"
              style={{ width: `${principalPct}%` }}
            />
            <div
              className="bg-orange-400/70 rounded-r-full"
              style={{ width: `${100 - principalPct}%` }}
            />
          </div>
        </div>

        {result.withExtra && (
          <p className={cn('text-[10px] font-medium text-green-600 dark:text-green-400')}>
            Save {formatLoanCurrency(result.withExtra.interestSaved)} · {result.withExtra.monthsSaved}mo earlier
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          Total Interest: {formatLoanCurrency(result.totalInterest)}
        </span>
      </div>
    </div>
  );
});
