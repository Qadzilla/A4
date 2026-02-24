// ─── Loan/Mortgage Calculator Utils ────────────────────────────────
// Types, defaults, and deterministic computation for mortgage calculations.

import { formatCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export interface LoanCalculatorData {
  mode: 'mortgage';

  // Core loan inputs
  homePrice: number;
  downPaymentPercent: number;
  loanTermYears: number;
  annualInterestRate: number;
  startDate: string; // ISO month "2026-03"

  // Mortgage-specific
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHOA: number;
  pmiRatePercent: number;

  // Extra payments
  extraMonthlyPayment: number;

  notes: string;
}

export interface AmortizationRow {
  month: number;
  date: string; // "Mar 2026"
  payment: number; // PI only
  principal: number;
  interest: number;
  extraPayment: number;
  balance: number;
  pmi: number;
}

export interface LoanCalculatorResult {
  loanAmount: number;
  monthlyPI: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyPMI: number;
  monthlyHOA: number;
  totalMonthlyPayment: number;
  totalInterest: number;
  totalCost: number;
  payoffDate: string;
  schedule: AmortizationRow[];

  withExtra?: {
    totalInterest: number;
    payoffDate: string;
    interestSaved: number;
    monthsSaved: number;
  };
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultLoanCalculatorData(): LoanCalculatorData {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    mode: 'mortgage',
    homePrice: 400000,
    downPaymentPercent: 20,
    loanTermYears: 30,
    annualInterestRate: 6.5,
    startDate: `${now.getFullYear()}-${month}`,
    annualPropertyTax: 3600,
    annualInsurance: 1800,
    monthlyHOA: 0,
    pmiRatePercent: 0.5,
    extraMonthlyPayment: 0,
    notes: '',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseStartDate(startDate: string): { year: number; month: number } {
  const [y, m] = startDate.split('-').map(Number);
  return { year: y ?? 2026, month: (m ?? 1) - 1 }; // 0-indexed month
}

function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

function advanceMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

// ─── Computation ───────────────────────────────────────────────────

function computeMonthlyPI(principal: number, monthlyRate: number, numPayments: number): number {
  if (monthlyRate === 0) return principal / numPayments;
  const factor = Math.pow(1 + monthlyRate, numPayments);
  return principal * (monthlyRate * factor) / (factor - 1);
}

function generateSchedule(
  loanAmount: number,
  monthlyPI: number,
  monthlyRate: number,
  numPayments: number,
  extraMonthly: number,
  homePrice: number,
  pmiMonthly: number,
  startYear: number,
  startMonth: number,
): AmortizationRow[] {
  const schedule: AmortizationRow[] = [];
  let balance = loanAmount;
  let year = startYear;
  let month = startMonth;
  const ltvThreshold = homePrice * 0.80;

  for (let i = 1; i <= numPayments && balance > 0.01; i++) {
    const interest = balance * monthlyRate;
    let principal = monthlyPI - interest;
    let extra = extraMonthly;

    // Don't overpay
    if (principal + extra > balance) {
      if (principal >= balance) {
        principal = balance;
        extra = 0;
      } else {
        extra = balance - principal;
      }
    }

    balance = Math.max(0, balance - principal - extra);
    const pmi = balance > ltvThreshold ? pmiMonthly : 0;

    schedule.push({
      month: i,
      date: formatMonth(year, month),
      payment: principal + interest, // PI portion
      principal,
      interest,
      extraPayment: extra,
      balance,
      pmi,
    });

    const next = advanceMonth(year, month);
    year = next.year;
    month = next.month;

    if (balance <= 0) break;
  }

  return schedule;
}

export function computeLoan(data: LoanCalculatorData): LoanCalculatorResult {
  const loanAmount = data.homePrice - (data.homePrice * data.downPaymentPercent / 100);
  const monthlyRate = data.annualInterestRate / 100 / 12;
  const numPayments = data.loanTermYears * 12;

  const monthlyPI = computeMonthlyPI(loanAmount, monthlyRate, numPayments);
  const monthlyPropertyTax = data.annualPropertyTax / 12;
  const monthlyInsurance = data.annualInsurance / 12;

  // PMI: only if down payment < 20%
  const ltv = loanAmount / data.homePrice;
  const monthlyPMI = ltv > 0.80
    ? (loanAmount * (data.pmiRatePercent / 100)) / 12
    : 0;

  const monthlyHOA = data.monthlyHOA;
  const totalMonthlyPayment = monthlyPI + monthlyPropertyTax + monthlyInsurance + monthlyPMI + monthlyHOA;

  const { year: startYear, month: startMonth } = parseStartDate(data.startDate);

  // Base schedule (no extra payments)
  const baseSchedule = generateSchedule(
    loanAmount, monthlyPI, monthlyRate, numPayments, 0,
    data.homePrice, monthlyPMI, startYear, startMonth,
  );

  const totalInterest = baseSchedule.reduce((sum, r) => sum + r.interest, 0);
  const totalCost = loanAmount + totalInterest;
  const lastRow = baseSchedule[baseSchedule.length - 1];
  const payoffDate = lastRow?.date ?? '';

  // With extra payments
  let withExtra: LoanCalculatorResult['withExtra'];
  let schedule = baseSchedule;

  if (data.extraMonthlyPayment > 0) {
    const extraSchedule = generateSchedule(
      loanAmount, monthlyPI, monthlyRate, numPayments, data.extraMonthlyPayment,
      data.homePrice, monthlyPMI, startYear, startMonth,
    );
    const extraTotalInterest = extraSchedule.reduce((sum, r) => sum + r.interest, 0);
    const extraLastRow = extraSchedule[extraSchedule.length - 1];

    withExtra = {
      totalInterest: extraTotalInterest,
      payoffDate: extraLastRow?.date ?? '',
      interestSaved: totalInterest - extraTotalInterest,
      monthsSaved: baseSchedule.length - extraSchedule.length,
    };

    schedule = extraSchedule;
  }

  return {
    loanAmount,
    monthlyPI,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyPMI,
    monthlyHOA,
    totalMonthlyPayment,
    totalInterest,
    totalCost,
    payoffDate,
    schedule,
    withExtra,
  };
}

export function formatLoanCurrency(n: number): string {
  return formatCurrency(n, 'USD');
}
