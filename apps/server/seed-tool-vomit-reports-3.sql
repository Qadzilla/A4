-- Seed realistic data into 6 empty cards in Tool Vomit workspace
-- Run: sqlite3 apps/server/a4.db < apps/server/seed-tool-vomit-reports-3.sql

----------------------------------------------------------------------
-- 1. P&L: "Sunrise Bakery P&L"
----------------------------------------------------------------------
UPDATE canvas_items
SET name = 'Sunrise Bakery P&L',
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
          "id": "sb-r1-retail",
          "name": "Retail Sales",
          "amounts": [25000, 26500, 28000, 30000, 32000, 34000, 35500, 36000, 37000, 38000, 39000, 40000]
        },
        {
          "id": "sb-r2-wholesale",
          "name": "Wholesale",
          "amounts": [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]
        },
        {
          "id": "sb-r3-catering",
          "name": "Catering",
          "amounts": [3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7000, 7500, 8000]
        }
      ]
    },
    {
      "id": "cogs",
      "lineItems": [
        {
          "id": "sb-c1-ingredients",
          "name": "Ingredients",
          "amounts": [10000, 10600, 11200, 12000, 12800, 13600, 14200, 14400, 14800, 15200, 15600, 16000]
        },
        {
          "id": "sb-c2-packaging",
          "name": "Packaging",
          "amounts": [1500, 1600, 1700, 1800, 1900, 2000, 2050, 2100, 2150, 2200, 2300, 2500]
        }
      ]
    },
    {
      "id": "opex",
      "lineItems": [
        {
          "id": "sb-o1-staff",
          "name": "Staff Wages",
          "amounts": [18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000]
        },
        {
          "id": "sb-o2-rent",
          "name": "Rent",
          "amounts": [3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500]
        },
        {
          "id": "sb-o3-utilities",
          "name": "Utilities",
          "amounts": [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800]
        },
        {
          "id": "sb-o4-marketing",
          "name": "Marketing",
          "amounts": [1500, 1600, 1700, 1800, 1900, 2000, 2100, 2100, 2200, 2300, 2300, 2500]
        }
      ]
    },
    {
      "id": "other",
      "lineItems": [
        {
          "id": "sb-x1-equip-rental",
          "name": "Equipment Rental",
          "amounts": [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]
        }
      ]
    },
    {
      "id": "tax",
      "lineItems": [
        {
          "id": "sb-t1-quarterly",
          "name": "Quarterly Estimates",
          "amounts": [0, 0, 2000, 0, 0, 2000, 0, 0, 2000, 0, 0, 2000]
        }
      ]
    }
  ]
}')
WHERE id = 'd91bf546-c6f6-4e8b-8455-9a4d775ea976';

----------------------------------------------------------------------
-- 2. Balance Sheet: "Sunrise Bakery Balance Sheet"
-- Assets = 131K, Liabilities = 34.3K, Equity = 96.7K → balanced
----------------------------------------------------------------------
UPDATE canvas_items
SET name = 'Sunrise Bakery Balance Sheet',
    data = json('{
  "asOfDate": "2025-12-31",
  "currency": "USD",
  "notes": "",
  "sections": [
    {
      "id": "current-assets",
      "lineItems": [
        { "id": "sb-ca1-checking", "name": "Business Checking", "value": 62000 },
        { "id": "sb-ca2-petty", "name": "Petty Cash", "value": 1500 },
        { "id": "sb-ca3-ar", "name": "Accounts Receivable", "value": 8000 },
        { "id": "sb-ca4-inventory", "name": "Ingredients Inventory", "value": 4500 }
      ]
    },
    {
      "id": "non-current-assets",
      "lineItems": [
        { "id": "sb-nca1-equip", "name": "Bakery Equipment", "value": 45000 },
        { "id": "sb-nca2-leasehold", "name": "Leasehold Improvements", "value": 22000 },
        { "id": "sb-nca3-depr", "name": "Accumulated Depreciation", "value": -12000 }
      ]
    },
    {
      "id": "current-liabilities",
      "lineItems": [
        { "id": "sb-cl1-ap", "name": "Accounts Payable", "value": 5500 },
        { "id": "sb-cl2-tax", "name": "Sales Tax Payable", "value": 2800 },
        { "id": "sb-cl3-loan", "name": "Short-term Loan", "value": 8000 }
      ]
    },
    {
      "id": "non-current-liabilities",
      "lineItems": [
        { "id": "sb-ncl1-equip", "name": "Equipment Financing", "value": 18000 }
      ]
    },
    {
      "id": "equity",
      "lineItems": [
        { "id": "sb-eq1-capital", "name": "Owner Capital", "value": 10000 },
        { "id": "sb-eq2-retained", "name": "Retained Earnings", "value": 86700 }
      ]
    }
  ]
}')
WHERE id = '434c84c0-b9ec-4204-9e30-1fcb67947c85';

----------------------------------------------------------------------
-- 3. Cash Flow: "Sunrise Bakery Cash Flow"
----------------------------------------------------------------------
UPDATE canvas_items
SET name = 'Sunrise Bakery Cash Flow',
    data = json('{
  "fiscalYearStart": 2025,
  "fiscalMonthStart": 1,
  "currency": "USD",
  "beginningCash": 35000,
  "notes": "",
  "sections": [
    {
      "id": "operating",
      "lineItems": [
        {
          "id": "sb-op1-receipts",
          "name": "Customer Receipts",
          "amounts": [25000, 26500, 28000, 30000, 32000, 34000, 35500, 36000, 37000, 38000, 39000, 40000]
        },
        {
          "id": "sb-op2-wages",
          "name": "Staff Wages",
          "amounts": [-18000, -18000, -18000, -18000, -18000, -18000, -18000, -18000, -18000, -18000, -18000, -18000]
        },
        {
          "id": "sb-op3-suppliers",
          "name": "Supplier Payments",
          "amounts": [-11500, -12200, -12900, -13800, -14700, -15600, -16250, -16500, -16950, -17400, -17900, -18500]
        },
        {
          "id": "sb-op4-rent",
          "name": "Rent",
          "amounts": [-3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500, -3500]
        },
        {
          "id": "sb-op5-utilities",
          "name": "Utilities",
          "amounts": [-800, -800, -800, -800, -800, -800, -800, -800, -800, -800, -800, -800]
        }
      ]
    },
    {
      "id": "investing",
      "lineItems": [
        {
          "id": "sb-inv1-equip",
          "name": "Equipment Purchase",
          "amounts": [0, 0, 0, -12000, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        {
          "id": "sb-inv2-leasehold",
          "name": "Leasehold Improvements",
          "amounts": [0, -8000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        }
      ]
    },
    {
      "id": "financing",
      "lineItems": [
        {
          "id": "sb-fin1-loan",
          "name": "Loan Repayments",
          "amounts": [-1500, -1500, -1500, -1500, -1500, -1500, -1500, -1500, -1500, -1500, -1500, -1500]
        },
        {
          "id": "sb-fin2-draw",
          "name": "Owner Draw",
          "amounts": [0, 0, 0, 0, 0, -5000, 0, 0, 0, 0, 0, -5000]
        }
      ]
    }
  ]
}')
WHERE id = 'bf0da0ef-8703-49c6-962d-dded58b41966';

----------------------------------------------------------------------
-- 4. Chart: "Founder Equity Split" — pie chart linked to A4 Table
----------------------------------------------------------------------
UPDATE canvas_items
SET name = 'Founder Equity Split',
    data = json('{
  "chartType": "pie",
  "title": "Founder Equity Split",
  "source": {
    "tableItemId": "b510e7c8-3b65-4287-a735-7609cb1a206a",
    "xColumnId": "1228b9bd-b07e-4953-933b-2e52c8b1b869",
    "yColumnIds": ["3da85291-7655-4c18-b8d6-b51f8ea45b52"]
  },
  "showLegend": true,
  "showGrid": true
}')
WHERE id = '66f2a47b-d20d-4bb8-b333-12e420f01bb4';

----------------------------------------------------------------------
-- 5. Invoice: "INV-2025-042" — web design project
--    Step A: Create invoice record
--    Step B: Create line items
--    Step C: Update canvas item to reference invoice
----------------------------------------------------------------------
INSERT INTO invoices (id, workspace_id, user_id, invoice_number, date, due_date,
  from_name, from_address, from_email,
  to_name, to_address, to_email,
  tax_rate, notes, status, created_at, updated_at)
VALUES (
  'inv-seed-042-design',
  '7f8581c0-4146-4919-abd6-2f91082de1d2',
  'dev-user-001',
  'INV-2025-042',
  '2025-11-15',
  '2025-12-15',
  'Acme Creative Studio',
  '456 Design Ave, Austin, TX 78701',
  'billing@acmecreative.com',
  'Sunrise Bakery',
  '123 Main St, Austin, TX 78702',
  'orders@sunrisebakery.com',
  8.25,
  'Net 30 — thank you for your business!',
  'sent',
  1731686400000,
  1731686400000
);

INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, sort_order, created_at, updated_at) VALUES
  ('inv-li-001', 'inv-seed-042-design', 'Website Redesign — 5-page responsive site', 1, 4500.00, 0, 1731686400000, 1731686400000),
  ('inv-li-002', 'inv-seed-042-design', 'Logo Design — 3 concepts + revisions', 1, 1200.00, 1, 1731686400000, 1731686400000),
  ('inv-li-003', 'inv-seed-042-design', 'Brand Guidelines Document', 1, 800.00, 2, 1731686400000, 1731686400000),
  ('inv-li-004', 'inv-seed-042-design', 'Social Media Templates (10 designs)', 10, 150.00, 3, 1731686400000, 1731686400000);

UPDATE canvas_items
SET name = 'INV-2025-042',
    data = json('{"invoiceId": "inv-seed-042-design"}')
WHERE id = '4c879d36-879c-4ac1-8559-7b4d522788d2';

----------------------------------------------------------------------
-- 6. Tax Estimator: "2025 Tax Estimate — Martinez Family"
--    Married filing jointly, W2 + side business + investments
----------------------------------------------------------------------
UPDATE canvas_items
SET name = '2025 Tax — Martinez Family',
    data = json('{
  "taxYear": 2025,
  "filingStatus": "mfj",
  "stateCode": "TX",
  "w2Wages": 145000,
  "selfEmploymentIncome": 38000,
  "investmentIncome": 12500,
  "otherIncome": 0,
  "retirement401k": 23500,
  "traditionalIRA": 0,
  "hsaContribution": 8300,
  "studentLoanInterest": 2500,
  "deductionType": "itemized",
  "saltDeduction": 10000,
  "mortgageInterest": 14200,
  "charitableGiving": 6800,
  "otherItemized": 1500,
  "numDependentChildren": 2,
  "otherCredits": 0,
  "federalWithheld": 22000,
  "stateWithheld": 0,
  "estimatedPayments": 8000,
  "notes": ""
}')
WHERE id = 'd380fc5e-fff6-4e12-8865-55f85266f4cf';
