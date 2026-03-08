-- ============================================================
-- Seed: Tool Vomit workspace — YC-themed "Luminar AI" data
-- Workspace: 7f8581c0-4146-4919-abd6-2f91082de1d2
-- User:      dev-user-001
-- ============================================================

-- Common values
-- WS  = 7f8581c0-4146-4919-abd6-2f91082de1d2
-- UID = dev-user-001
-- TS  = 1772236800000 (approx 2026-02-28)

BEGIN TRANSACTION;

-- ============================================================
-- STEP 1: Rename 5 canvas items
-- ============================================================
UPDATE canvas_items SET name = 'Portfolio Card'        WHERE id = '585c8e72-a3e0-48be-b8ca-c12d76d3e088';
UPDATE canvas_items SET name = 'Breakeven Card'        WHERE id = '45c03326-1fad-42c5-b4ff-6ff6261fd5d3';
UPDATE canvas_items SET name = 'Depreciation Card'     WHERE id = '5300ecfa-9bff-40c1-ac5d-77733ad1a060';
UPDATE canvas_items SET name = 'Loan Calculator Card'  WHERE id = '1dce24ee-9088-4635-9b2e-49a7f8badc74';
UPDATE canvas_items SET name = 'Projection Card'       WHERE id = 'e131992b-4c5e-45d5-ac1c-3e14d2fede46';

-- ============================================================
-- STEP 2: Clear existing financial data (children first for FK safety)
-- ============================================================
DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2');
DELETE FROM budget_categories  WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM networth_entries    WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM accounts           WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM invoices           WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM budget_groups      WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM networth_categories WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM account_groups     WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM transactions       WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM subscriptions      WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM holdings           WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM debts              WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';
DELETE FROM receipts           WHERE workspace_id = '7f8581c0-4146-4919-abd6-2f91082de1d2';

-- ============================================================
-- STEP 3: Insert YC-themed data
-- ============================================================

-- ---- Budget Groups ----
INSERT INTO budget_groups (id, workspace_id, user_id, name, color, created_at, updated_at) VALUES
  ('bg-infra-0001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Infrastructure', '#3b82f6', 1772236800000, 1772236800000),
  ('bg-people-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'People',         '#22c55e', 1772236800000, 1772236800000),
  ('bg-growth-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Growth',         '#f59e0b', 1772236800000, 1772236800000);

-- ---- Budget Categories ----
INSERT INTO budget_categories (id, workspace_id, user_id, name, budgeted, actual, source, notes, group_id, created_at, updated_at) VALUES
  ('bc-aws-00001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'AWS',              12000, 10845, NULL, NULL, 'bg-infra-0001-0000-000000000001', 1772236800000, 1772236800000),
  ('bc-vercel-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Vercel',            200,   200, NULL, NULL, 'bg-infra-0001-0000-000000000001', 1772236800000, 1772236800000),
  ('bc-db-0000003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Database',           500,   475, NULL, NULL, 'bg-infra-0001-0000-000000000001', 1772236800000, 1772236800000),
  ('bc-salary-004-0000-000000000004', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Eng Salaries',     60000, 60000, NULL, NULL, 'bg-people-002-0000-000000000002', 1772236800000, 1772236800000),
  ('bc-contra-005-0000-000000000005', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Contractors',       8000,  5400, NULL, NULL, 'bg-people-002-0000-000000000002', 1772236800000, 1772236800000),
  ('bc-mktg-0006-0000-000000000006', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Marketing',         5000,  3200, NULL, NULL, 'bg-growth-003-0000-000000000003', 1772236800000, 1772236800000),
  ('bc-demo-0007-0000-000000000007', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Demo Day Prep',     2000,  1800, NULL, NULL, 'bg-growth-003-0000-000000000003', 1772236800000, 1772236800000);

-- ---- Transactions (Ledger) ----
INSERT INTO transactions (id, workspace_id, user_id, date, description, amount, type, category_id, notes, created_at, updated_at) VALUES
  ('tx-safe-0001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-01', 'YC SAFE Investment',           500000,  'income',  NULL, NULL, 1772236800000, 1772236800000),
  ('tx-aws-00002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-03', 'AWS February Bill',              10845,  'expense', NULL, NULL, 1772236800000, 1772236800000),
  ('tx-payrl-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-05', 'Mercury Payroll',                60000,  'expense', NULL, NULL, 1772236800000, 1772236800000),
  ('tx-strip-004-0000-000000000004', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-10', 'Stripe SaaS Revenue',            18500,  'income',  NULL, NULL, 1772236800000, 1772236800000),
  ('tx-dinnr-005-0000-000000000005', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-14', 'Team Dinner — Demo Day',           425,  'expense', NULL, NULL, 1772236800000, 1772236800000),
  ('tx-legal-006-0000-000000000006', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-20', 'Legal Fees (SAFE docs)',           3500,  'expense', NULL, NULL, 1772236800000, 1772236800000),
  ('tx-acme-0007-0000-000000000007', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-25', 'Customer Payment — Acme',          7200,  'income',  NULL, NULL, 1772236800000, 1772236800000);

-- ---- Subscriptions ----
INSERT INTO subscriptions (id, workspace_id, user_id, name, amount, frequency, start_date, next_billing_date, category_id, status, notes, created_at, updated_at) VALUES
  ('sub-aws-0001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'AWS',         12000,  'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000),
  ('sub-vrcl-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Vercel Pro',    200,  'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000),
  ('sub-gh-00003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'GitHub Team',   168,  'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000),
  ('sub-linr-004-0000-000000000004', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Linear',         80,  'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000),
  ('sub-slck-005-0000-000000000005', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Slack Pro',    87.50, 'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000),
  ('sub-fgma-006-0000-000000000006', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Figma',          75,  'monthly', '2026-01-01', '2026-03-01', NULL, 'active', NULL, 1772236800000, 1772236800000);

-- ---- Account Groups ----
INSERT INTO account_groups (id, workspace_id, user_id, name, color, created_at, updated_at) VALUES
  ('ag-ops-00001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Operations', '#3b82f6', 1772236800000, 1772236800000),
  ('ag-tres-0002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Treasury',   '#22c55e', 1772236800000, 1772236800000);

-- ---- Accounts ----
INSERT INTO accounts (id, workspace_id, user_id, name, institution, type, balance, group_id, last_updated, notes, created_at, updated_at) VALUES
  ('acc-chk-0001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Mercury Checking', 'Mercury', 'checking', 342800, 'ag-ops-00001-0000-000000000001', '2026-02-28', NULL, 1772236800000, 1772236800000),
  ('acc-sav-0002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Mercury Savings',  'Mercury', 'savings',  150000, 'ag-tres-0002-0000-000000000002', '2026-02-28', NULL, 1772236800000, 1772236800000),
  ('acc-brx-0003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Brex Credit',      'Brex',    'credit',    8450, 'ag-ops-00001-0000-000000000001', '2026-02-28', NULL, 1772236800000, 1772236800000);

-- ---- Holdings (Portfolio) ----
INSERT INTO holdings (id, workspace_id, user_id, symbol, name, value, target_pct, created_at, updated_at) VALUES
  ('hld-vgsh-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'VGSH', 'Vanguard Short-Term Treasury', 50000, 50, 1772236800000, 1772236800000),
  ('hld-bil-0002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'BIL',  'SPDR 1-3 Month T-Bill',       30000, 30, 1772236800000, 1772236800000),
  ('hld-scho-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'SCHO', 'Schwab Short-Term Treasury',   20000, 20, 1772236800000, 1772236800000);

-- ---- Debts ----
INSERT INTO debts (id, workspace_id, user_id, name, balance, annual_interest_rate, minimum_payment, created_at, updated_at) VALUES
  ('dbt-brex-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Brex Line of Credit',   8450,   0,    8450, 1772236800000, 1772236800000),
  ('dbt-equp-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Equipment Financing',  24000,   5.9,  2100, 1772236800000, 1772236800000),
  ('dbt-note-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Convertible Note',    150000,   0,       0, 1772236800000, 1772236800000);

-- ---- Net Worth Categories ----
INSERT INTO networth_categories (id, workspace_id, user_id, name, kind, is_default, created_at, updated_at) VALUES
  ('nwc-cash-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Cash & Banking',     'asset',     0, 1772236800000, 1772236800000),
  ('nwc-invt-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Investments',        'asset',     0, 1772236800000, 1772236800000),
  ('nwc-equp-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Equipment',          'asset',     0, 1772236800000, 1772236800000),
  ('nwc-cred-004-0000-000000000004', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Credit Lines',       'liability', 0, 1772236800000, 1772236800000),
  ('nwc-eqln-005-0000-000000000005', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Equipment Loans',    'liability', 0, 1772236800000, 1772236800000),
  ('nwc-conv-006-0000-000000000006', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Convertible Notes',  'liability', 0, 1772236800000, 1772236800000);

-- ---- Net Worth Entries ----
INSERT INTO networth_entries (id, workspace_id, user_id, name, category_id, value, notes, created_at, updated_at) VALUES
  ('nwe-mchk-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Mercury Checking',    'nwc-cash-001-0000-000000000001', 342800, NULL, 1772236800000, 1772236800000),
  ('nwe-msav-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Mercury Savings',     'nwc-cash-001-0000-000000000001', 150000, NULL, 1772236800000, 1772236800000),
  ('nwe-etfs-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Treasury ETFs',       'nwc-invt-002-0000-000000000002', 100000, NULL, 1772236800000, 1772236800000),
  ('nwe-hw-00004-0000-000000000004', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Servers & Hardware',  'nwc-equp-003-0000-000000000003',  35000, NULL, 1772236800000, 1772236800000),
  ('nwe-brex-005-0000-000000000005', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Brex',               'nwc-cred-004-0000-000000000004',   8450, NULL, 1772236800000, 1772236800000),
  ('nwe-hfin-006-0000-000000000006', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'Hardware Financing',  'nwc-eqln-005-0000-000000000005',  24000, NULL, 1772236800000, 1772236800000),
  ('nwe-safe-007-0000-000000000007', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', 'YC SAFE',            'nwc-conv-006-0000-000000000006', 150000, NULL, 1772236800000, 1772236800000);

-- ---- Invoice ----
INSERT INTO invoices (id, workspace_id, user_id, invoice_number, date, due_date, from_name, from_address, from_email, to_name, to_address, to_email, tax_rate, notes, status, created_at, updated_at) VALUES
  ('inv-acme-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001',
   'INV-001', '2026-02-01', '2026-03-01',
   'Luminar AI', '335 Pioneer Way, Mountain View, CA 94041', 'billing@luminar.ai',
   'Acme Corp', '100 Market St, San Francisco, CA 94105', 'ap@acme.com',
   0, NULL, 'sent',
   1772236800000, 1772236800000);

-- ---- Invoice Line Items ----
INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, sort_order, created_at, updated_at) VALUES
  ('ili-lic-0001-0000-000000000001', 'inv-acme-001-0000-000000000001', 'Luminar Pro — Monthly License', 1, 7200, 0, 1772236800000, 1772236800000),
  ('ili-api-0002-0000-000000000002', 'inv-acme-001-0000-000000000001', 'API Overage (50k calls)',       1, 1250, 1, 1772236800000, 1772236800000);

-- ---- Receipts ----
INSERT INTO receipts (id, workspace_id, user_id, date, merchant, amount, tax, payment_method, category_id, status, linked_file_id, notes, created_at, updated_at) VALUES
  ('rcp-nobu-001-0000-000000000001', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-14', 'Nobu — Team Dinner (Demo Day)',    425,    0, 'card', NULL, 'reviewed', NULL, NULL, 1772236800000, 1772236800000),
  ('rcp-conf-002-0000-000000000002', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-10', 'AI Summit — Conference Tickets',  1200,    0, 'card', NULL, 'pending',  NULL, NULL, 1772236800000, 1772236800000),
  ('rcp-amzn-003-0000-000000000003', '7f8581c0-4146-4919-abd6-2f91082de1d2', 'dev-user-001', '2026-02-05', 'Amazon — Office Supplies',       342.18,  0, 'card', NULL, 'reviewed', NULL, NULL, 1772236800000, 1772236800000);

-- ============================================================
-- STEP 4: Update canvas item JSON data for calculator cards + invoice link
-- ============================================================

-- Breakeven Card
UPDATE canvas_items SET data = '{"fixedCosts":85000,"variableCostPerUnit":12,"pricePerUnit":299,"notes":"Monthly SaaS breakeven — Luminar AI"}'
  WHERE id = '45c03326-1fad-42c5-b4ff-6ff6261fd5d3';

-- Depreciation Card
UPDATE canvas_items SET data = '{"assetCost":35000,"salvageValue":3500,"usefulLifeYears":3,"method":"straight-line","notes":"Servers & dev hardware — Luminar AI"}'
  WHERE id = '5300ecfa-9bff-40c1-ac5d-77733ad1a060';

-- Loan Calculator Card
UPDATE canvas_items SET data = '{"mode":"mortgage","homePrice":1200000,"downPaymentPercent":20,"loanTermYears":30,"annualInterestRate":6.5,"startDate":"2026-03","annualPropertyTax":14400,"annualInsurance":3600,"monthlyHOA":650,"pmiRatePercent":0.5,"extraMonthlyPayment":0,"notes":"SF office condo — Luminar AI HQ"}'
  WHERE id = '1dce24ee-9088-4635-9b2e-49a7f8badc74';

-- Projection Card
UPDATE canvas_items SET data = '{"startingAmount":500000,"monthlyContribution":25700,"annualGrowthRate":15,"projectionYears":3,"inflationRate":3,"notes":"Post-SAFE runway projection — Luminar AI"}'
  WHERE id = 'e131992b-4c5e-45d5-ac1c-3e14d2fede46';

-- Rent vs Buy Card (merge into existing JSON — update specific fields)
UPDATE canvas_items SET data = '{"currency":"USD","analysisYears":10,"startDate":"2026-02","monthlyRent":8500,"annualRentIncrease":5,"monthlyRentersInsurance":30,"homePrice":1200000,"downPaymentPercent":20,"loanTermYears":30,"annualInterestRate":6.5,"annualPropertyTax":14400,"annualHomeInsurance":1800,"annualMaintenancePercent":1,"monthlyHOA":650,"pmiRatePercent":0.5,"closingCostPercent":3,"sellingCostPercent":6,"annualHomeAppreciation":3,"annualInvestmentReturn":7,"notes":"SF office space — rent WeWork vs buy condo"}'
  WHERE id = 'b15fc97d-bf97-4d8e-82f5-308bf14e9cf6';

-- Invoice Card — update invoiceId to point to new invoice
UPDATE canvas_items SET data = '{"invoiceId":"inv-acme-001-0000-000000000001"}'
  WHERE id = '57a1b814-445b-45ef-a266-c25e00cead88';

COMMIT;
