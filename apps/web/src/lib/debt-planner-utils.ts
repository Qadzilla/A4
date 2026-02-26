// ─── Debt Paydown Planner Utils ──────────────────────────────────────
// Types, defaults, and dual-track simulation (strategy vs baseline).

import type { SupportedCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export type DebtStrategy = 'avalanche' | 'snowball';

export interface Debt {
  id: string;
  name: string;
  balance: number;
  annualInterestRate: number;
  minimumPayment: number;
}

export interface DebtPlannerCardData {
  currency: SupportedCurrency;
  strategy: DebtStrategy;
  extraMonthlyBudget: number;
  startDate: string; // ISO month "2026-03"
  notes: string;
}

export interface DebtPayoffResult {
  debtId: string;
  name: string;
  payoffMonth: number;
  totalInterest: number;
  totalPaid: number;
}

export interface DebtScheduleMonth {
  month: number;
  date: string;
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  totalBalance: number;
  debtsRemaining: number;
  debtsPaidOff: string[];
}

export interface DebtPaydownResult {
  debtResults: DebtPayoffResult[];
  schedule: DebtScheduleMonth[];
  totalMonths: number;
  debtFreeDate: string;
  totalInterest: number;
  totalPaid: number;
  baselineMonths: number;
  baselineTotalInterest: number;
  monthsSaved: number;
  interestSaved: number;
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultDebtPlannerData(): DebtPlannerCardData {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    currency: 'USD',
    strategy: 'avalanche',
    extraMonthlyBudget: 0,
    startDate: `${now.getFullYear()}-${month}`,
    notes: '',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseStartDate(startDate: string): { year: number; month: number } {
  const [y, m] = startDate.split('-').map(Number);
  return { year: y ?? 2026, month: (m ?? 1) - 1 };
}

function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

function advanceMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

// ─── Simulation ────────────────────────────────────────────────────

interface DebtState {
  id: string;
  name: string;
  balance: number;
  monthlyRate: number;
  minPayment: number;
  active: boolean;
  totalInterest: number;
  totalPaid: number;
  payoffMonth: number;
}

function selectTargetDebt(debts: DebtState[], strategy: DebtStrategy): DebtState | undefined {
  const active = debts.filter((d) => d.active);
  if (active.length === 0) return undefined;
  if (strategy === 'avalanche') {
    return active.reduce((best, d) => (d.monthlyRate > best.monthlyRate ? d : best));
  }
  // snowball: smallest balance
  return active.reduce((best, d) => (d.balance < best.balance ? d : best));
}

function runSimulation(
  debts: Debt[],
  strategy: DebtStrategy,
  extraBudget: number,
  startYear: number,
  startMonth: number,
): {
  results: DebtPayoffResult[];
  schedule: DebtScheduleMonth[];
  totalMonths: number;
  debtFreeDate: string;
  totalInterest: number;
  totalPaid: number;
} {
  if (debts.length === 0) {
    return {
      results: [],
      schedule: [],
      totalMonths: 0,
      debtFreeDate: formatMonth(startYear, startMonth),
      totalInterest: 0,
      totalPaid: 0,
    };
  }

  const state: DebtState[] = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.balance,
    monthlyRate: d.annualInterestRate / 100 / 12,
    minPayment: d.minimumPayment,
    active: d.balance > 0.01,
    totalInterest: 0,
    totalPaid: 0,
    payoffMonth: 0,
  }));

  let availableExtra = extraBudget;
  const schedule: DebtScheduleMonth[] = [];
  let year = startYear;
  let month = startMonth;
  const MAX_MONTHS = 600;

  for (let m = 1; m <= MAX_MONTHS; m++) {
    const activeDebts = state.filter((d) => d.active);
    if (activeDebts.length === 0) break;

    let monthPayment = 0;
    let monthInterest = 0;
    let monthPrincipal = 0;
    const paidOff: string[] = [];

    // Step a: pay minimums on all active debts
    for (const d of activeDebts) {
      const interest = d.balance * d.monthlyRate;
      d.totalInterest += interest;
      const minPay = Math.min(d.minPayment, d.balance + interest);
      const principal = Math.min(minPay - interest, d.balance);
      const actualPrincipal = Math.max(0, principal);
      d.balance = Math.max(0, d.balance - actualPrincipal);
      d.totalPaid += minPay;
      monthPayment += minPay;
      monthInterest += interest;
      monthPrincipal += actualPrincipal;
    }

    // Step b: allocate extra to target debt
    let remaining = availableExtra;
    while (remaining > 0.01) {
      const target = selectTargetDebt(state, strategy);
      if (!target) break;
      const extraPay = Math.min(remaining, target.balance);
      target.balance = Math.max(0, target.balance - extraPay);
      target.totalPaid += extraPay;
      monthPayment += extraPay;
      monthPrincipal += extraPay;
      remaining -= extraPay;
      // If target just paid off, loop again to apply remainder to next target
      if (target.balance <= 0.01) {
        target.balance = 0;
        target.active = false;
        target.payoffMonth = m;
        paidOff.push(target.id);
        availableExtra += target.minPayment; // snowball effect
      } else {
        break;
      }
    }

    // Step c: check for debts paid off by minimum payment alone
    for (const d of state) {
      if (d.active && d.balance <= 0.01) {
        d.balance = 0;
        d.active = false;
        d.payoffMonth = m;
        if (!paidOff.includes(d.id)) {
          paidOff.push(d.id);
          availableExtra += d.minPayment;
        }
      }
    }

    const totalBalance = state.reduce((s, d) => s + d.balance, 0);
    const debtsRemaining = state.filter((d) => d.active).length;

    schedule.push({
      month: m,
      date: formatMonth(year, month),
      totalPayment: monthPayment,
      totalInterest: monthInterest,
      totalPrincipal: monthPrincipal,
      totalBalance,
      debtsRemaining,
      debtsPaidOff: paidOff,
    });

    if (debtsRemaining === 0) break;

    const next = advanceMonth(year, month);
    year = next.year;
    month = next.month;
  }

  const totalInterest = state.reduce((s, d) => s + d.totalInterest, 0);
  const totalPaid = state.reduce((s, d) => s + d.totalPaid, 0);
  const lastRow = schedule[schedule.length - 1];

  return {
    results: state.map((d) => ({
      debtId: d.id,
      name: d.name,
      payoffMonth: d.payoffMonth,
      totalInterest: d.totalInterest,
      totalPaid: d.totalPaid,
    })),
    schedule,
    totalMonths: schedule.length,
    debtFreeDate: lastRow?.date ?? formatMonth(startYear, startMonth),
    totalInterest,
    totalPaid,
  };
}

// ─── Public API ────────────────────────────────────────────────────

export function simulateDebtPaydown(
  config: Pick<DebtPlannerCardData, 'strategy' | 'extraMonthlyBudget' | 'startDate'>,
  debts: Debt[],
): DebtPaydownResult {
  const { year, month } = parseStartDate(config.startDate);

  // Strategy run (with extra budget)
  const main = runSimulation(debts, config.strategy, config.extraMonthlyBudget, year, month);

  // Baseline run (minimums only, no extra)
  const baseline = runSimulation(debts, config.strategy, 0, year, month);

  return {
    debtResults: main.results,
    schedule: main.schedule,
    totalMonths: main.totalMonths,
    debtFreeDate: main.debtFreeDate,
    totalInterest: main.totalInterest,
    totalPaid: main.totalPaid,
    baselineMonths: baseline.totalMonths,
    baselineTotalInterest: baseline.totalInterest,
    monthsSaved: baseline.totalMonths - main.totalMonths,
    interestSaved: baseline.totalInterest - main.totalInterest,
  };
}
