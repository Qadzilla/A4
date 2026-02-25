// ─── Rent vs Buy Calculator Utils ─────────────────────────────────
// Types, defaults, and month-by-month simulation comparing renting vs buying.

import type { SupportedCurrency } from './currency-utils';
import { formatCurrency } from './currency-utils';

// ─── Types ─────────────────────────────────────────────────────────

export interface RentVsBuyCardData {
  currency: SupportedCurrency;
  analysisYears: number; // 3–30
  startDate: string; // ISO month "2026-03"

  // Rent inputs
  monthlyRent: number;
  annualRentIncrease: number; // %/yr
  monthlyRentersInsurance: number;

  // Buy inputs
  homePrice: number;
  downPaymentPercent: number;
  loanTermYears: number; // 15, 20, 30
  annualInterestRate: number;
  annualPropertyTax: number; // $/yr
  annualHomeInsurance: number; // $/yr
  annualMaintenancePercent: number; // % of home value/yr
  monthlyHOA: number;
  pmiRatePercent: number;
  closingCostPercent: number; // % of home price at purchase
  sellingCostPercent: number; // % of home value at sale

  // Market assumptions
  annualHomeAppreciation: number; // %/yr
  annualInvestmentReturn: number; // %/yr

  notes: string;
}

export interface RentVsBuyMonth {
  month: number;
  date: string;
  rentPayment: number;
  cumulativeRentCost: number;
  investmentBalance: number;
  rentNetPosition: number;
  mortgagePayment: number;
  totalBuyPayment: number;
  homeValue: number;
  mortgageBalance: number;
  homeEquity: number;
  cumulativeBuyCost: number;
  buyNetPosition: number;
}

export interface RentVsBuyResult {
  schedule: RentVsBuyMonth[];
  totalRentCost: number;
  finalInvestmentBalance: number;
  rentNetPosition: number;
  totalBuyCost: number;
  finalHomeValue: number;
  finalHomeEquity: number;
  buyNetPosition: number;
  crossoverMonth: number | null;
  crossoverDate: string;
  recommendation: 'rent' | 'buy' | 'neutral';
  netDifference: number;
  monthlyMortgagePI: number;
  initialMonthlyBuyCost: number;
}

// ─── Defaults ──────────────────────────────────────────────────────

export function createDefaultRentVsBuyData(): RentVsBuyCardData {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    currency: 'USD',
    analysisYears: 10,
    startDate: `${now.getFullYear()}-${month}`,

    monthlyRent: 2000,
    annualRentIncrease: 3,
    monthlyRentersInsurance: 30,

    homePrice: 400000,
    downPaymentPercent: 20,
    loanTermYears: 30,
    annualInterestRate: 6.5,
    annualPropertyTax: 3600,
    annualHomeInsurance: 1800,
    annualMaintenancePercent: 1,
    monthlyHOA: 0,
    pmiRatePercent: 0.5,
    closingCostPercent: 3,
    sellingCostPercent: 6,

    annualHomeAppreciation: 3,
    annualInvestmentReturn: 7,

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

function computeMonthlyPI(principal: number, monthlyRate: number, numPayments: number): number {
  if (monthlyRate === 0) return numPayments > 0 ? principal / numPayments : 0;
  const factor = (1 + monthlyRate) ** numPayments;
  return (principal * (monthlyRate * factor)) / (factor - 1);
}

// ─── Computation ───────────────────────────────────────────────────

export function computeRentVsBuy(data: RentVsBuyCardData): RentVsBuyResult {
  const totalMonths = data.analysisYears * 12;

  if (totalMonths === 0) {
    return {
      schedule: [],
      totalRentCost: 0,
      finalInvestmentBalance: 0,
      rentNetPosition: 0,
      totalBuyCost: 0,
      finalHomeValue: data.homePrice,
      finalHomeEquity: 0,
      buyNetPosition: 0,
      crossoverMonth: null,
      crossoverDate: '',
      recommendation: 'neutral',
      netDifference: 0,
      monthlyMortgagePI: 0,
      initialMonthlyBuyCost: 0,
    };
  }

  // ── Buy setup ──
  const downPayment = (data.homePrice * data.downPaymentPercent) / 100;
  const closingCosts = (data.homePrice * data.closingCostPercent) / 100;
  const loanAmount = data.homePrice - downPayment;
  const monthlyRate = data.annualInterestRate / 100 / 12;
  const numPayments = data.loanTermYears * 12;
  const monthlyPI = computeMonthlyPI(loanAmount, monthlyRate, numPayments);
  const monthlyAppreciation = data.annualHomeAppreciation / 100 / 12;

  // ── Rent setup ──
  const initialInvestment = downPayment + closingCosts;
  const monthlyInvestReturn = data.annualInvestmentReturn / 100 / 12;

  const { year: startYear, month: startMonth } = parseStartDate(data.startDate);

  const schedule: RentVsBuyMonth[] = [];
  let cumulativeRentCost = 0;
  let investmentBalance = initialInvestment;
  let mortgageBalance = loanAmount;
  let homeValue = data.homePrice;
  let cumulativeBuyPayments = 0;
  let crossoverMonth: number | null = null;
  let crossoverDate = '';

  let curYear = startYear;
  let curMonth = startMonth;

  for (let i = 1; i <= totalMonths; i++) {
    // ── Rent track ──
    const completedYears = Math.floor((i - 1) / 12);
    const currentRent = data.monthlyRent * (1 + data.annualRentIncrease / 100) ** completedYears;
    const rentPayment = currentRent + data.monthlyRentersInsurance;
    cumulativeRentCost += rentPayment;

    // Grow investment before adding this month's "savings"
    investmentBalance *= 1 + monthlyInvestReturn;

    const rentNetPosition = investmentBalance - cumulativeRentCost;

    // ── Buy track ──
    // Mortgage P&I
    let interest = mortgageBalance * monthlyRate;
    let principal = monthlyPI - interest;
    if (principal > mortgageBalance) {
      principal = mortgageBalance;
      interest = mortgageBalance * monthlyRate;
    }
    if (mortgageBalance <= 0) {
      principal = 0;
      interest = 0;
    }
    mortgageBalance = Math.max(0, mortgageBalance - principal);

    // PMI: only if LTV > 80% based on appreciated home value
    const ltv = loanAmount > 0 ? mortgageBalance / homeValue : 0;
    const monthlyPMI =
      data.downPaymentPercent < 20 && ltv > 0.8
        ? (loanAmount * (data.pmiRatePercent / 100)) / 12
        : 0;

    const monthlyPropertyTax = data.annualPropertyTax / 12;
    const monthlyHomeInsurance = data.annualHomeInsurance / 12;
    const monthlyMaintenance = (homeValue * (data.annualMaintenancePercent / 100)) / 12;

    const mortgagePayment = principal + interest;
    const totalBuyPayment =
      mortgagePayment +
      monthlyPropertyTax +
      monthlyHomeInsurance +
      monthlyMaintenance +
      data.monthlyHOA +
      monthlyPMI;
    cumulativeBuyPayments += totalBuyPayment;

    // Appreciate home
    homeValue *= 1 + monthlyAppreciation;

    const homeEquity = homeValue - mortgageBalance;
    const sellingCosts = homeValue * (data.sellingCostPercent / 100);
    const totalBuyCost = downPayment + closingCosts + cumulativeBuyPayments;
    const buyNetPosition =
      homeValue -
      sellingCosts -
      mortgageBalance -
      (downPayment + closingCosts + cumulativeBuyPayments);

    // Crossover detection
    if (crossoverMonth === null && buyNetPosition > rentNetPosition) {
      crossoverMonth = i;
      crossoverDate = formatMonth(curYear, curMonth);
    }

    schedule.push({
      month: i,
      date: formatMonth(curYear, curMonth),
      rentPayment,
      cumulativeRentCost,
      investmentBalance,
      rentNetPosition,
      mortgagePayment,
      totalBuyPayment,
      homeValue,
      mortgageBalance,
      homeEquity,
      cumulativeBuyCost: totalBuyCost,
      buyNetPosition,
    });

    const next = advanceMonth(curYear, curMonth);
    curYear = next.year;
    curMonth = next.month;
  }

  // biome-ignore lint/style/noNonNullAssertion: totalMonths > 0 guaranteed above
  const last = schedule[schedule.length - 1]!;
  const netDifference = last.buyNetPosition - last.rentNetPosition;
  const recommendation: 'rent' | 'buy' | 'neutral' =
    Math.abs(netDifference) < 100 ? 'neutral' : netDifference > 0 ? 'buy' : 'rent';

  // Initial monthly buy cost (month 1 total buy payment)
  const initialMonthlyBuyCost = schedule[0]?.totalBuyPayment ?? 0;

  return {
    schedule,
    totalRentCost: last.cumulativeRentCost,
    finalInvestmentBalance: last.investmentBalance,
    rentNetPosition: last.rentNetPosition,
    totalBuyCost: last.cumulativeBuyCost,
    finalHomeValue: last.homeValue,
    finalHomeEquity: last.homeEquity,
    buyNetPosition: last.buyNetPosition,
    crossoverMonth,
    crossoverDate,
    recommendation,
    netDifference,
    monthlyMortgagePI: monthlyPI,
    initialMonthlyBuyCost,
  };
}

export function formatRentVsBuyCurrency(n: number, currency: SupportedCurrency = 'USD'): string {
  return formatCurrency(n, currency);
}
