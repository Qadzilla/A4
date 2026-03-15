// Canvas item defaults — server-side mirror of client-side values
// Source: apps/web/src/hooks/useCanvasDrop.ts, apps/web/src/stores/canvas-store.ts

export const ITEM_DEFAULTS: Record<string, { width: number; height: number }> = {
  'a4-page': { width: 565, height: 800 },
  'secret-card': { width: 320, height: 240 },
  note: { width: 260, height: 180 },
  'table-card': { width: 400, height: 300 },
  'kpi-card': { width: 240, height: 140 },
  'chart-card': { width: 480, height: 320 },
  'file-card': { width: 280, height: 200 },
  'timer-card': { width: 240, height: 140 },
  'invoice-card': { width: 320, height: 400 },
  'budget-card': { width: 320, height: 360 },
  'ledger-card': { width: 320, height: 360 },
  'receipt-card': { width: 320, height: 360 },
  'subscription-card': { width: 320, height: 360 },
  'account-card': { width: 320, height: 360 },
  'pnl-card': { width: 360, height: 280 },
  'balance-sheet-card': { width: 340, height: 280 },
  'cash-flow-card': { width: 360, height: 280 },
  'tax-estimator-card': { width: 320, height: 300 },
  'loan-calculator-card': { width: 340, height: 300 },
  'projection-card': { width: 340, height: 280 },
  'breakeven-card': { width: 320, height: 260 },
  'depreciation-card': { width: 340, height: 280 },
  'embed-card': { width: 480, height: 320 },
  'networth-card': { width: 340, height: 280 },
  'debt-planner-card': { width: 340, height: 300 },
  'rent-vs-buy-card': { width: 340, height: 300 },
  'portfolio-card': { width: 340, height: 280 },
  'header-card': { width: 300, height: 50 },
};

export const defaultNames: Record<string, string> = {
  'a4-page': 'Untitled Page',
  'secret-card': 'Untitled Credential',
  note: 'Untitled Note',
  'table-card': 'Untitled Table',
  'kpi-card': 'Untitled KPI',
  'chart-card': 'Untitled Chart',
  'file-card': 'Untitled File',
  'timer-card': 'Untitled Timer',
  'invoice-card': 'Untitled Invoice',
  'budget-card': 'Untitled Budget',
  'ledger-card': 'Untitled Ledger',
  'receipt-card': 'Untitled Receipts',
  'subscription-card': 'Untitled Subscriptions',
  'account-card': 'Untitled Accounts',
  'pnl-card': 'Untitled P&L',
  'balance-sheet-card': 'Untitled Balance Sheet',
  'cash-flow-card': 'Untitled Cash Flow',
  'tax-estimator-card': 'Untitled Tax Estimate',
  'loan-calculator-card': 'Untitled Loan Calculator',
  'projection-card': 'Untitled Projection',
  'breakeven-card': 'Untitled Break-Even',
  'depreciation-card': 'Untitled Depreciation',
  'embed-card': 'Untitled Embed',
  'networth-card': 'Net Worth',
  'debt-planner-card': 'Debt Paydown Planner',
  'rent-vs-buy-card': 'Rent vs Buy',
  'portfolio-card': 'Untitled Portfolio',
  'header-card': 'Header',
};

function emptyAmounts(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

export function createDefaultData(type: string): Record<string, unknown> | undefined {
  switch (type) {
    case 'kpi-card':
      return { label: 'Metric', value: '0', format: 'number' };

    case 'chart-card':
      return { chartType: 'bar', title: '', showLegend: true, showGrid: true };

    case 'invoice-card':
      return { invoiceId: '' };

    case 'ledger-card':
      return { startingBalance: 0, currency: 'USD', notes: '' };

    case 'receipt-card':
      return { currency: 'USD', notes: '' };

    case 'subscription-card':
      return { currency: 'USD', notes: '' };

    case 'account-card':
      return { currency: 'USD', notes: '' };

    case 'embed-card':
      return { url: '', title: '' };

    case 'networth-card':
      return { currency: 'USD', notes: '' };

    case 'portfolio-card':
      return { currency: 'USD', notes: '' };

    case 'projection-card':
      return {
        startingAmount: 10000,
        monthlyContribution: 500,
        annualGrowthRate: 7,
        projectionYears: 10,
        inflationRate: 0,
        notes: '',
      };

    case 'breakeven-card':
      return { fixedCosts: 5000, variableCostPerUnit: 15, pricePerUnit: 40, notes: '' };

    case 'depreciation-card':
      return {
        assetCost: 50000,
        salvageValue: 5000,
        usefulLifeYears: 5,
        method: 'straight-line',
        notes: '',
      };

    case 'tax-estimator-card':
      return {
        taxYear: 2025,
        filingStatus: 'single',
        stateCode: '',
        w2Wages: 0,
        selfEmploymentIncome: 0,
        investmentIncome: 0,
        otherIncome: 0,
        retirement401k: 0,
        traditionalIRA: 0,
        hsaContribution: 0,
        studentLoanInterest: 0,
        deductionType: 'standard',
        saltDeduction: 0,
        mortgageInterest: 0,
        charitableGiving: 0,
        otherItemized: 0,
        numDependentChildren: 0,
        otherCredits: 0,
        federalWithheld: 0,
        stateWithheld: 0,
        estimatedPayments: 0,
        notes: '',
      };

    case 'budget-card': {
      const now = new Date();
      return {
        period: { type: 'monthly', month: now.getMonth() + 1, year: now.getFullYear() },
        currency: 'USD',
        notes: '',
      };
    }

    case 'timer-card': {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return { targetDate: tomorrow.toISOString(), label: 'Deadline', color: '#3b82f6' };
    }

    case 'loan-calculator-card': {
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

    case 'debt-planner-card': {
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

    case 'rent-vs-buy-card': {
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

    case 'table-card': {
      const colA = { id: crypto.randomUUID(), name: 'Column A', type: 'text' };
      const colB = { id: crypto.randomUUID(), name: 'Column B', type: 'text' };
      const colC = { id: crypto.randomUUID(), name: 'Column C', type: 'text' };
      const columns = [colA, colB, colC];
      const rows = Array.from({ length: 3 }, () => ({
        id: crypto.randomUUID(),
        cells: { [colA.id]: '', [colB.id]: '', [colC.id]: '' },
      }));
      return { columns, rows };
    }

    case 'pnl-card': {
      const now = new Date();
      const sectionOrder = ['revenue', 'cogs', 'opex', 'other', 'tax'];
      return {
        fiscalYearStart: now.getFullYear(),
        fiscalMonthStart: 1,
        currency: 'USD',
        sections: sectionOrder.map((id) => ({
          id,
          lineItems: [{ id: crypto.randomUUID(), name: '', amounts: emptyAmounts() }],
        })),
        viewMode: 'table',
        notes: '',
      };
    }

    case 'balance-sheet-card': {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const sectionOrder = [
        'current-assets',
        'non-current-assets',
        'current-liabilities',
        'non-current-liabilities',
        'equity',
      ];
      return {
        asOfDate: `${yyyy}-${mm}-${dd}`,
        currency: 'USD',
        sections: sectionOrder.map((id) => ({
          id,
          lineItems: [{ id: crypto.randomUUID(), name: '', value: 0 }],
        })),
        notes: '',
      };
    }

    case 'cash-flow-card': {
      const now = new Date();
      const sectionOrder = ['operating', 'investing', 'financing'];
      return {
        fiscalYearStart: now.getFullYear(),
        fiscalMonthStart: 1,
        currency: 'USD',
        beginningCash: 0,
        sections: sectionOrder.map((id) => ({
          id,
          lineItems: [{ id: crypto.randomUUID(), name: '', amounts: emptyAmounts() }],
        })),
        notes: '',
      };
    }

    // Types with no default data
    case 'a4-page':
    case 'secret-card':
    case 'file-card':
    case 'header-card':
    case 'note':
      return undefined;

    default:
      return undefined;
  }
}
