-- ============================================================
-- Seed: Tool Vomit workspace — Reports & Tax cards
-- Luminar AI — YC W27 batch
-- ============================================================

BEGIN TRANSACTION;

-- ============================================================
-- STEP 1: Rename 4 canvas items
-- ============================================================
UPDATE canvas_items SET name = 'P&L Card'             WHERE id = 'd91bf546-c6f6-4e8b-8455-9a4d775ea976';
UPDATE canvas_items SET name = 'Balance Sheet Card'    WHERE id = '434c84c0-b9ec-4204-9e30-1fcb67947c85';
UPDATE canvas_items SET name = 'Cash Flow Card'        WHERE id = 'bf0da0ef-8703-49c6-962d-dded58b41966';
UPDATE canvas_items SET name = 'Tax Estimator Card'    WHERE id = 'd380fc5e-fff6-4e12-8865-55f85266f4cf';

-- ============================================================
-- STEP 2: P&L Card — Luminar AI FY2026
-- ============================================================
-- Revenue: SaaS Subscriptions (hockey-stick ~18% MoM), API Usage, Professional Services
-- COGS: Cloud Infrastructure, API Provider Costs
-- OpEx: Eng Salaries, Contractors, Marketing, Office, Legal
-- Other: Interest Income (declining as treasury depletes)
-- Tax: CA Franchise Tax in Apr

UPDATE canvas_items SET data = '{
  "fiscalYearStart": 2026,
  "fiscalMonthStart": 1,
  "currency": "USD",
  "viewMode": "table",
  "sections": [
    {
      "id": "revenue",
      "lineItems": [
        { "id": "pl-rev-saas", "name": "SaaS Subscriptions", "amounts": [15000, 18500, 22000, 26000, 31000, 37000, 44000, 52000, 61000, 72000, 85000, 100000] },
        { "id": "pl-rev-api", "name": "API Usage Revenue", "amounts": [2000, 2500, 3000, 3800, 4500, 5500, 6500, 7800, 9200, 11000, 13000, 15500] },
        { "id": "pl-rev-svc", "name": "Professional Services", "amounts": [0, 0, 5000, 5000, 7500, 7500, 10000, 10000, 10000, 12500, 12500, 15000] }
      ]
    },
    {
      "id": "cogs",
      "lineItems": [
        { "id": "pl-cog-cloud", "name": "Cloud Infrastructure", "amounts": [10845, 11200, 11800, 12500, 13500, 14800, 16200, 18000, 20000, 22500, 25000, 28000] },
        { "id": "pl-cog-api", "name": "API Provider Costs", "amounts": [1500, 1800, 2100, 2500, 3000, 3600, 4200, 5000, 5800, 6800, 8000, 9500] }
      ]
    },
    {
      "id": "opex",
      "lineItems": [
        { "id": "pl-opx-sal", "name": "Engineering Salaries", "amounts": [60000, 60000, 60000, 60000, 65000, 65000, 65000, 65000, 70000, 70000, 70000, 70000] },
        { "id": "pl-opx-con", "name": "Contractors", "amounts": [5400, 6000, 6500, 7000, 7500, 8000, 8000, 8500, 9000, 9000, 9500, 10000] },
        { "id": "pl-opx-mkt", "name": "Marketing & Growth", "amounts": [3200, 4000, 5000, 6000, 7500, 9000, 11000, 13000, 15000, 18000, 21000, 25000] },
        { "id": "pl-opx-adm", "name": "Office & Admin", "amounts": [2000, 2000, 2000, 2000, 2500, 2500, 2500, 2500, 3000, 3000, 3000, 3000] },
        { "id": "pl-opx-leg", "name": "Legal & Compliance", "amounts": [3500, 1000, 1000, 1500, 1000, 1000, 2000, 1000, 1000, 1500, 1000, 2000] }
      ]
    },
    {
      "id": "other",
      "lineItems": [
        { "id": "pl-oth-int", "name": "Interest Income", "amounts": [500, 500, 500, 450, 450, 400, 400, 350, 350, 300, 300, 250] }
      ]
    },
    {
      "id": "tax",
      "lineItems": [
        { "id": "pl-tax-ca", "name": "CA Franchise Tax", "amounts": [0, 0, 0, 800, 0, 0, 0, 0, 0, 0, 0, 0] }
      ]
    }
  ],
  "notes": "Luminar AI — FY2026 Profit & Loss. SaaS revenue growing ~18% MoM post-YC launch."
}'
WHERE id = 'd91bf546-c6f6-4e8b-8455-9a4d775ea976';

-- ============================================================
-- STEP 3: Balance Sheet Card — as of 2026-02-28
-- ============================================================
-- Assets: Cash $492.8K, AR $28.5K, Prepaid $4.2K, ETFs $100K, Equipment $35K, Accum Depr -$5.8K
-- Liabilities: AP $15.2K, Brex $8.45K, Accrued $12K, Equipment Loan $24K, SAFE $150K
-- Equity: Common Stock $100, SAFE Proceeds $500K, Retained Earnings -$55,083

UPDATE canvas_items SET data = '{
  "asOfDate": "2026-02-28",
  "currency": "USD",
  "sections": [
    {
      "id": "current-assets",
      "lineItems": [
        { "id": "bs-ca-chk", "name": "Cash — Mercury Checking", "value": 342800 },
        { "id": "bs-ca-sav", "name": "Cash — Mercury Savings", "value": 150000 },
        { "id": "bs-ca-ar", "name": "Accounts Receivable", "value": 28500 },
        { "id": "bs-ca-pre", "name": "Prepaid Expenses", "value": 4200 }
      ]
    },
    {
      "id": "non-current-assets",
      "lineItems": [
        { "id": "bs-nca-etf", "name": "Treasury ETFs (VGSH/BIL/SCHO)", "value": 100000 },
        { "id": "bs-nca-eqp", "name": "Equipment & Hardware", "value": 35000 },
        { "id": "bs-nca-dep", "name": "Accumulated Depreciation", "value": -5833 }
      ]
    },
    {
      "id": "current-liabilities",
      "lineItems": [
        { "id": "bs-cl-ap", "name": "Accounts Payable", "value": 15200 },
        { "id": "bs-cl-brx", "name": "Brex Line of Credit", "value": 8450 },
        { "id": "bs-cl-acc", "name": "Accrued Expenses", "value": 12000 }
      ]
    },
    {
      "id": "non-current-liabilities",
      "lineItems": [
        { "id": "bs-ncl-eqf", "name": "Equipment Financing", "value": 24000 },
        { "id": "bs-ncl-safe", "name": "Convertible Note (SAFE)", "value": 150000 }
      ]
    },
    {
      "id": "equity",
      "lineItems": [
        { "id": "bs-eq-cs", "name": "Common Stock", "value": 100 },
        { "id": "bs-eq-apic", "name": "SAFE Proceeds", "value": 500000 },
        { "id": "bs-eq-re", "name": "Retained Earnings", "value": -55083 }
      ]
    }
  ],
  "notes": "Luminar AI — Balance Sheet as of Feb 28, 2026. Total assets $654,667 | Total liabilities $209,650 | Equity $445,017."
}'
WHERE id = '434c84c0-b9ec-4204-9e30-1fcb67947c85';

-- ============================================================
-- STEP 4: Cash Flow Card — FY2026
-- ============================================================
-- Operating: Customer receipts, payroll, vendors, office
-- Investing: Treasury ETF purchases, equipment
-- Financing: SAFE proceeds, loan repayments

UPDATE canvas_items SET data = '{
  "fiscalYearStart": 2026,
  "fiscalMonthStart": 1,
  "currency": "USD",
  "beginningCash": 25000,
  "sections": [
    {
      "id": "operating",
      "lineItems": [
        { "id": "cf-op-rev", "name": "Customer Receipts", "amounts": [15000, 18500, 22000, 26000, 31000, 37000, 44000, 52000, 61000, 72000, 85000, 100000] },
        { "id": "cf-op-pay", "name": "Payroll", "amounts": [-60000, -60000, -60000, -60000, -65000, -65000, -65000, -65000, -70000, -70000, -70000, -70000] },
        { "id": "cf-op-vnd", "name": "Vendors & Suppliers", "amounts": [-15745, -16200, -17100, -18200, -19800, -21600, -23600, -26000, -28800, -32100, -35500, -39500] },
        { "id": "cf-op-adm", "name": "Office & Admin", "amounts": [-2000, -2000, -2000, -2000, -2500, -2500, -2500, -2500, -3000, -3000, -3000, -3000] }
      ]
    },
    {
      "id": "investing",
      "lineItems": [
        { "id": "cf-inv-etf", "name": "Treasury ETF Purchases", "amounts": [-100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { "id": "cf-inv-eqp", "name": "Equipment Purchases", "amounts": [-35000, 0, 0, 0, -5000, 0, 0, 0, -5000, 0, 0, 0] }
      ]
    },
    {
      "id": "financing",
      "lineItems": [
        { "id": "cf-fin-safe", "name": "SAFE Proceeds", "amounts": [500000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { "id": "cf-fin-loan", "name": "Loan Repayments", "amounts": [-2100, -2100, -2100, -2100, -2100, -2100, -2100, -2100, -2100, -2100, -2100, -2100] }
      ]
    }
  ],
  "notes": "Luminar AI — FY2026 Cash Flow Statement. Beginning cash $25K (pre-SAFE). SAFE infusion of $500K in Jan."
}'
WHERE id = 'bf0da0ef-8703-49c6-962d-dded58b41966';

-- ============================================================
-- STEP 5: Tax Estimator Card — Founder personal taxes (2025)
-- ============================================================

UPDATE canvas_items SET data = '{
  "taxYear": 2025,
  "filingStatus": "single",
  "stateCode": "CA",
  "w2Wages": 120000,
  "selfEmploymentIncome": 0,
  "investmentIncome": 3200,
  "otherIncome": 0,
  "retirement401k": 23500,
  "traditionalIRA": 0,
  "hsaContribution": 4150,
  "studentLoanInterest": 2500,
  "deductionType": "standard",
  "saltDeduction": 0,
  "mortgageInterest": 0,
  "charitableGiving": 0,
  "otherItemized": 0,
  "numDependentChildren": 0,
  "otherCredits": 0,
  "federalWithheld": 22000,
  "stateWithheld": 8500,
  "estimatedPayments": 0,
  "notes": "Founder personal taxes — YC W27 batch year. $120K salary + $3.2K treasury ETF interest."
}'
WHERE id = 'd380fc5e-fff6-4e12-8865-55f85266f4cf';

COMMIT;
