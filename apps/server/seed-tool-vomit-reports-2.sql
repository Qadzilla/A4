-- Seed realistic data into 3 report cards in Tool Vomit workspace
-- Run: sqlite3 apps/server/a4.db < apps/server/seed-tool-vomit-reports-2.sql

-- P&L: "Acme Corp P&L"
-- FY2025, Jan start, USD, table view
-- Revenue: Product Sales ($80K→$130K/mo growth), Consulting ($15K flat)
-- COGS: Materials ($24K→$39K), Shipping ($4K→$6.5K)
-- OpEx: Salaries ($45K flat), Marketing ($8K→$15K), Rent ($6K flat), Insurance ($2K flat)
-- Other: Interest Income ($200/mo)
-- Tax: Quarterly estimates ($5K in Mar/Jun/Sep/Dec)
UPDATE canvas_items
SET name = 'Acme Corp P&L',
    data = json('{
  "fiscalYearStart": 2025,
  "fiscalMonthStart": 1,
  "currency": "USD",
  "viewMode": "table",
  "notes": "",
  "sections": [
    {
      "id": "revenue",
      "lineItems": [
        {
          "id": "r1-product-sales",
          "name": "Product Sales",
          "amounts": [80000, 84000, 88000, 92500, 97000, 101000, 105500, 110000, 114500, 119500, 124500, 130000]
        },
        {
          "id": "r2-consulting",
          "name": "Consulting",
          "amounts": [15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000]
        }
      ]
    },
    {
      "id": "cogs",
      "lineItems": [
        {
          "id": "c1-materials",
          "name": "Materials",
          "amounts": [24000, 25200, 26400, 27750, 29100, 30300, 31650, 33000, 34350, 35850, 37350, 39000]
        },
        {
          "id": "c2-shipping",
          "name": "Shipping",
          "amounts": [4000, 4200, 4400, 4625, 4850, 5050, 5275, 5500, 5725, 5975, 6225, 6500]
        }
      ]
    },
    {
      "id": "opex",
      "lineItems": [
        {
          "id": "o1-salaries",
          "name": "Salaries & Benefits",
          "amounts": [45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000]
        },
        {
          "id": "o2-marketing",
          "name": "Marketing",
          "amounts": [8000, 8600, 9200, 9900, 10500, 11100, 11800, 12400, 13000, 13700, 14300, 15000]
        },
        {
          "id": "o3-rent",
          "name": "Rent",
          "amounts": [6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000]
        },
        {
          "id": "o4-insurance",
          "name": "Insurance",
          "amounts": [2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]
        }
      ]
    },
    {
      "id": "other",
      "lineItems": [
        {
          "id": "x1-interest-income",
          "name": "Interest Income",
          "amounts": [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
          "isIncome": true
        }
      ]
    },
    {
      "id": "tax",
      "lineItems": [
        {
          "id": "t1-quarterly-est",
          "name": "Quarterly Estimates",
          "amounts": [0, 0, 5000, 0, 0, 5000, 0, 0, 5000, 0, 0, 5000]
        }
      ]
    }
  ]
}')
WHERE id = 'd91bf546-c6f6-4e8b-8455-9a4d775ea976';

-- Balance Sheet: "Acme Corp Balance Sheet"
-- As of 2025-12-31, USD
-- Current Assets: Checking $185K, Savings $75K, AR $42K, Inventory $28K
-- Non-Current: Property $320K, Equipment $85K, Accum Depr -$45K
-- Current Liabilities: AP $31K, Credit Line $12K, Payroll Tax $8.5K
-- Non-Current Liabilities: Mortgage $245K, Equipment Loan $35K
-- Equity: Common Stock $1K, Retained Earnings $358.5K
UPDATE canvas_items
SET name = 'Acme Corp Balance Sheet',
    data = json('{
  "asOfDate": "2025-12-31",
  "currency": "USD",
  "notes": "",
  "sections": [
    {
      "id": "current-assets",
      "lineItems": [
        { "id": "ca1-checking", "name": "Checking Account", "value": 185000 },
        { "id": "ca2-savings", "name": "Savings Account", "value": 75000 },
        { "id": "ca3-ar", "name": "Accounts Receivable", "value": 42000 },
        { "id": "ca4-inventory", "name": "Inventory", "value": 28000 }
      ]
    },
    {
      "id": "non-current-assets",
      "lineItems": [
        { "id": "nca1-property", "name": "Property", "value": 320000 },
        { "id": "nca2-equipment", "name": "Equipment", "value": 85000 },
        { "id": "nca3-depr", "name": "Accumulated Depreciation", "value": -45000 }
      ]
    },
    {
      "id": "current-liabilities",
      "lineItems": [
        { "id": "cl1-ap", "name": "Accounts Payable", "value": 31000 },
        { "id": "cl2-credit", "name": "Credit Line", "value": 12000 },
        { "id": "cl3-payroll", "name": "Payroll Tax Payable", "value": 8500 }
      ]
    },
    {
      "id": "non-current-liabilities",
      "lineItems": [
        { "id": "ncl1-mortgage", "name": "Mortgage", "value": 245000 },
        { "id": "ncl2-equip-loan", "name": "Equipment Loan", "value": 35000 }
      ]
    },
    {
      "id": "equity",
      "lineItems": [
        { "id": "eq1-stock", "name": "Common Stock", "value": 1000 },
        { "id": "eq2-retained", "name": "Retained Earnings", "value": 357500 }
      ]
    }
  ]
}')
WHERE id = '434c84c0-b9ec-4204-9e30-1fcb67947c85';

-- Cash Flow: "Acme Corp Cash Flow"
-- FY2025, Jan start, USD, beginning cash $120K
-- Operating: Customer Receipts ($80K→$130K), Payroll (-$45K), Suppliers (-$28K→-$45.5K), Rent (-$6K)
-- Investing: Equipment (-$40K in Mar), Property Improvement (-$15K in Jul)
-- Financing: Loan Repayments (-$3.5K/mo), Owner Distribution (-$10K in Jun/Dec)
UPDATE canvas_items
SET name = 'Acme Corp Cash Flow',
    data = json('{
  "fiscalYearStart": 2025,
  "fiscalMonthStart": 1,
  "currency": "USD",
  "beginningCash": 120000,
  "notes": "",
  "sections": [
    {
      "id": "operating",
      "lineItems": [
        {
          "id": "op1-receipts",
          "name": "Customer Receipts",
          "amounts": [80000, 84000, 88000, 92500, 97000, 101000, 105500, 110000, 114500, 119500, 124500, 130000]
        },
        {
          "id": "op2-payroll",
          "name": "Payroll",
          "amounts": [-45000, -45000, -45000, -45000, -45000, -45000, -45000, -45000, -45000, -45000, -45000, -45000]
        },
        {
          "id": "op3-suppliers",
          "name": "Supplier Payments",
          "amounts": [-28000, -29400, -30800, -32375, -33950, -35350, -36925, -38500, -40075, -41825, -43575, -45500]
        },
        {
          "id": "op4-rent",
          "name": "Rent",
          "amounts": [-6000, -6000, -6000, -6000, -6000, -6000, -6000, -6000, -6000, -6000, -6000, -6000]
        }
      ]
    },
    {
      "id": "investing",
      "lineItems": [
        {
          "id": "inv1-equipment",
          "name": "Equipment Purchase",
          "amounts": [0, 0, -40000, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        {
          "id": "inv2-property",
          "name": "Property Improvement",
          "amounts": [0, 0, 0, 0, 0, 0, -15000, 0, 0, 0, 0, 0]
        }
      ]
    },
    {
      "id": "financing",
      "lineItems": [
        {
          "id": "fin1-loan",
          "name": "Loan Repayments",
          "amounts": [-3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500]
        },
        {
          "id": "fin2-dist",
          "name": "Owner Distribution",
          "amounts": [0, 0, 0, 0, 0, -10000, 0, 0, 0, 0, 0, -10000]
        }
      ]
    }
  ]
}')
WHERE id = 'bf0da0ef-8703-49c6-962d-dded58b41966';

-- Tax Estimator: "Acme Corp 2025 Tax Estimate"
-- MFJ, California, W2 + self-employment + investment income
UPDATE canvas_items
SET name = 'Acme Corp 2025 Tax Estimate',
    data = json('{
  "taxYear": 2025,
  "filingStatus": "mfj",
  "stateCode": "CA",
  "w2Wages": 145000,
  "selfEmploymentIncome": 62000,
  "investmentIncome": 18500,
  "otherIncome": 0,
  "retirement401k": 23500,
  "traditionalIRA": 7000,
  "hsaContribution": 8300,
  "studentLoanInterest": 0,
  "deductionType": "itemized",
  "saltDeduction": 10000,
  "mortgageInterest": 14200,
  "charitableGiving": 5800,
  "otherItemized": 0,
  "numDependentChildren": 2,
  "otherCredits": 0,
  "federalWithheld": 28000,
  "stateWithheld": 9500,
  "estimatedPayments": 12000,
  "notes": ""
}')
WHERE id = 'd380fc5e-fff6-4e12-8865-55f85266f4cf';
