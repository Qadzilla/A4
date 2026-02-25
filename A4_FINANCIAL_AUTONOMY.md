# A4 — Master Checklist: Full DIY Financial Autonomy (US baseline)

> **Last updated:** 2026-02-24
> Zero fluff. Extremely detailed. Personal + small business + freelancing. Taxes (strategy + filing). Investing (design + execution). Insurance/risk. Real estate. Equity comp. Crypto. Legal/estate. No outsourcing.

Use this as your **operating checklist**. If you complete and maintain every item, you've basically built the personal + micro-business version of a CFO + controller + tax preparer + compliance + wealth manager + risk manager.

This file also tracks the **A4 platform toolkit** — what's built, what's needed, and how each feature maps to financial autonomy capabilities.

---

## A4 Platform Toolkit (development tracker)

### Data layer

| Item | Status | Supports |
|---|---|---|
| `workspaces` table + full CRUD router | Built | All — top-level container |
| `canvas_items` table + save/load router | Built | All — canvas persistence |
| `canvas_connections` table | Built | Canvas — item relationships |
| `vault_config` table + setup/verify router | Built | 0.1 — secrets & credentials |
| `market_bars` + `ticker_details` tables + market data router | Built | 4 — investing, market tracking |
| Transactions table + `financial` router | **Not built** | 1, 2, 7 — cash flow, banking, bookkeeping |
| Categories table (income/expense taxonomy) | **Not built** | 1.2, 7.2 — categorization |
| Conversations + messages tables + `chat` router | **Not built** | AI chat persistence (future) |
| User profiles table + `user` router | **Not built** | 0 — user settings, preferences |
| `folder` router (real implementation) | **Not built** | 0.2 — document organization |
| `billing` router | **Not built** | A4 platform billing |

### Canvas item types

| Type | Status | Supports |
|---|---|---|
| `a4-page` — rich-text BlockNote document | Built | All — documents, templates, notes |
| `secret-card` — AES-256-GCM encrypted vault card | Built | 0.1 — credentials, API keys, PINs |
| `note` — inline-editable sticky note (auto-resize) | Built | All — quick annotations |
| `chart-card` — Recharts visualization (pie, bar, line, area) | Built | 1, 4, 7 — net worth, portfolio, P&L |
| `table-card` — structured data grid / spreadsheet | Built | 1.1, 3.2, 7.2 — balance sheet, debt schedule, ledger |
| `file-card` — uploaded document (PDF/CSV/Excel preview) | Built | 0.2, 6.2 — document storage, tax folders |
| `kpi-card` — single-value metric with trend indicator | Built | 1, 2, 7 — net worth, burn rate, revenue |
| `timer-card` — countdown / deadline tracker | Built | 0.3, 6 — tax deadlines, renewal dates |
| `invoice-card` — invoice creator (line items, totals, client info, PDF export) | Built | 7.1 — invoicing, accounts receivable |
| `budget-card` — budget planner (categories, groups, table-card binding, actual vs planned) | Built | 1.3 — budgeting, spending control |
| `receipt-card` — receipt capture, categorization, evidence linking | Built | 13 — audit readiness, expense evidence |
| `ledger-card` — income/expense tracker with categories, running balance, filters | Built | 1.2, 7.2 — cash flow, bookkeeping |
| `account-card` — account balance overview (bank, brokerage, card summaries) | Built | 2 — treasury, cash management |
| `subscription-card` — recurring bills / subscriptions tracker | Built | 1.3 — subscription registry, renewal alerts |
| `pnl-card` — P&L / income statement (12-month multi-step, waterfall chart) | Built | 7.2 — monthly/quarterly P&L, business financials |
| `balance-sheet-card` — balance sheet (assets, liabilities, equity; single-column point-in-time) | Built | 1.1 — net worth, asset/liability snapshot |
| `cash-flow-card` — cash flow statement (12-month indirect method, 3 GAAP sections, rolling cash balance, burn rate/runway) | Built | 1.2 — cash flow, burn rate, treasury |
| `tax-estimator-card` — US federal + state income tax estimator (2025/2026, all filing statuses, all 50 states + DC, FICA/SE, credits, withholding) | Built | 6.2 — tax projection, estimated taxes, withholding true-up |

### Financial instruments & tools

| Tool | Status | Supports |
|---|---|---|
| File upload + document parsing (CSV/Excel → table-card, PDF text extraction) | Built (local) | 0.2, 1, 2, 7 — data ingestion, bank data, bookkeeping |
| Transaction import (CSV/Excel parsing) | **Not built** | 1, 2, 7 — bank data, bookkeeping |
| Transaction categorization engine | **Not built** | 1.2, 7.2 — expense categories |
| Net worth calculator (assets − liabilities) | **Not built** | 1.1 — balance sheet |
| Cash flow summary generator | **Not built** | 1.2 — income vs spending |
| Budget vs actual comparison | Built (budget-card) | 1.3 — budget model |
| Debt amortization calculator | **Not built** | 3.2 — paydown planner |
| Tax projection model | Built (tax-estimator-card) | 6.2 — estimated taxes |
| Portfolio allocation tracker | **Not built** | 4.2, 4.3 — drift, rebalancing |
| Rent vs buy model | **Not built** | 8 — real estate analysis |
| Depreciation schedule calculator | **Not built** | 7, 8 — business/rental assets |
| Invoice generator (line items, tax, totals, PDF export) | Built (invoice-card) | 7.1 — billing clients, A/R |
| P&L / income statement generator | Built (pnl-card) | 7.2 — monthly/quarterly financials |
| Balance sheet generator | Built (balance-sheet-card) | 1.1 — assets vs liabilities snapshot |
| Cash flow statement generator | Built (cash-flow-card) | 1.2 — cash flow, burn rate, treasury |
| Financial projections / forecasting model | **Not built** | 4, 7 — revenue/expense forecasting |
| Break-even analysis calculator | **Not built** | 7 — business viability |
| Loan / mortgage calculator (amortization schedule) | **Not built** | 3.2, 8 — debt planning |
| Tax form templates (W-2, 1099, Schedule C) | **Not built** | 6.3 — filing readiness |
| Expense categorization engine (receipt → category) | Partial (receipt-card has manual categorization) | 1.2, 13 — audit-ready expense tracking |
| Income/expense ledger with categorization | Built (ledger-card) | 1.2, 7.2 — cash flow, bookkeeping |
| Recurring bills / subscription tracker | Built (subscription-card) | 1.3 — autopay registry, renewal alerts |
| Account balances dashboard (all accounts, one view) | Built (account-card) | 2 — treasury overview |

### Document & file features

| Feature | Status | Supports |
|---|---|---|
| BlockNote rich-text editor | Built | All — documents, templates |
| Canvas preview rendering | Built | All — document cards on canvas |
| File upload pipeline (local disk storage) | Built | 0.2 — document vault |
| PDF viewer / parser | Built (file-card preview + text extraction) | 6.3, 13 — tax docs, contracts |
| CSV/Excel import + preview | Built (file-card preview + table extraction) | 1, 7 — transaction data |
| Document search | **Not built** | 0.2 — find across workspaces |
| Template library (pre-built documents) | **Not built** | 15 — all template types |

### Integrations

| Integration | Status | Supports |
|---|---|---|
| Polygon.io (market data + WebSocket) | Built | 4 — investing, real-time quotes |
| Plaid (bank feeds) | **Not built** | 2 — automated bank reconciliation |
| Stripe (A4 billing) | **Not built** | A4 platform |
| QuickBooks / Xero (accounting sync) | **Not built** | 7 — bookkeeping import/export |
| IRS e-file API or tax software export | **Not built** | 6.3 — tax filing |

### AI pipeline

| Feature | Status | Supports |
|---|---|---|
| Claude chat (workspace-scoped) | **Not built** | All — ask questions about your data |
| Streaming responses (SSE) | **Not built** | Chat UX |
| RAG (document embedding + vector search) | **Not built** | Context injection from uploaded docs |
| Tool use (Claude calling A4 tools) | **Not built** | All — AI creates charts, runs calcs, fetches data |
| Conversation persistence | **Not built** | Chat history |

---

## 0) Build the "control system" (required foundation)

### 0.1 Identity, access, and security (financial ops security)

- [x] Passphrase per session for encryption and sensitive information
- [ ] Turn on **2FA** for banks, brokerages, email, payroll, crypto exchanges, cloud storage.
- [ ] Create an **Account Inventory**: every account, institution, purpose, login email, 2FA method, beneficiary, last reviewed date.
- [ ] Set **credit freezes** with all 3 bureaus (and record PINs/steps to temporarily lift).
- [ ] Create an "Incident Plan":
    - [ ] If card stolen: steps, numbers, lock procedures
    - [ ] If identity theft: bureaus, FTC report, bank contacts
    - [ ] If device lost: remote wipe, password reset, account lock
- [ ] Establish **file retention rules** (what you keep and for how long; default: keep tax returns + supporting docs at least 7 years; keep entity formation docs permanently).

### 0.2 Documentation and storage (the single source of truth)

- [ ] Create one **Master Finance Vault** (cloud + local backup).
- [ ] Standardize naming: `YYYY-MM Institution - DocType - Notes.pdf`
- [ ] Maintain a **Master Index** (what exists, where it is, last updated).

### 0.3 Your "calendar of finance" (so nothing is missed)

- [ ] Weekly money admin block
- [ ] Month-end close
- [ ] Quarter close + estimated taxes
- [ ] Annual tax season workflow
- [ ] Annual insurance review
- [ ] Annual retirement contributions check
- [ ] Annual legal/estate review
- [ ] Subscription renewal dates and annual fees dates

---

## 1) Personal financial statements (you are your own CFO)

### 1.1 Balance sheet (net worth)

- [ ] Track all **assets** (cash, investments, retirement, HSA, 529, real estate equity, vehicles optional, business equity, crypto).
- [ ] Track all **liabilities** (credit cards, student loans, auto loans, mortgage, personal loans, tax owed).
- [ ] Update net worth **monthly**.
- [ ] Rules/thresholds:
    - [ ] If **cash runway < 3 months** → pause aggressive investing/debt acceleration and rebuild liquidity.
    - [ ] If **consumer debt APR > expected return** → prioritize payoff (unless special constraints).

**Template needed:** Net Worth Tracker + Asset/Liability Register.

### 1.2 Cash flow statement (income → spending → savings)

- [ ] Categorize income: W-2, 1099, business revenue, interest/dividends, capital gains, rental.
- [ ] Categorize spending: fixed, variable, annual/irregular, business vs personal.
- [ ] Calculate monthly:
    - [ ] Savings rate
    - [ ] Burn rate
    - [ ] "True discretionary" spending
- [ ] Rules/thresholds:
    - [ ] If savings rate drops **>5 percentage points** for 2 months → trigger full expense audit.
    - [ ] If spending in any category exceeds plan by **>10%** → freeze discretionary until corrected.

**Template needed:** Cash Flow + Category Ledger + Monthly Close Sheet.

### 1.3 Budget operating model (control, not vibes)

- [ ] Define:
    - [ ] Minimum monthly obligations
    - [ ] Variable caps
    - [ ] Sinking funds (annual/irregular)
- [ ] Automate:
    - [ ] Bills autopay
    - [ ] Savings/investing autopull after payday
- [ ] Maintain a **Subscription and recurring payments registry**.

**Template needed:** Budget + Sinking Funds Register + Subscription Tracker.

---

## 2) Banking and cash management (treasury function)

- [ ] Maintain:
    - [ ] Checking for operations
    - [ ] HYSA/MMF/T-bills ladder for reserves
    - [ ] Separate accounts for business cash (if business exists)
- [ ] Monthly bank reconciliation:
    - [ ] Match statement balances to your ledger
    - [ ] Spot fraud/duplicate charges
- [ ] Optimize float:
    - [ ] Keep only required checking buffer
    - [ ] Move excess into higher-yield cash equivalents
- [ ] Rules/thresholds:
    - [ ] Overdraft risk = unacceptable → maintain buffer + alerts.
    - [ ] Any unexpected transaction → investigate within 24 hours.

**Templates needed:** Cash Position Report + Reconciliation Checklist.

---

## 3) Credit and debt (you are your own underwriter)

### 3.1 Credit profile management

- [ ] Track: credit score range, utilization, inquiries, open accounts, due dates.
- [ ] Set autopay for statement balance for every card.
- [ ] Quarterly review credit reports for errors.

Rules/thresholds:

- [ ] Utilization target: **<10% ideal**, **<30% max**.
- [ ] Never carry revolving interest unless emergency.

**Template needed:** Credit Card Register + Due Date Calendar + Credit Report Log.

### 3.2 Debt paydown system

- [ ] Build a full debt schedule: balance, APR, min payment, term, type, servicer.
- [ ] Choose method: avalanche (math) or snowball (behavior).
- [ ] Maintain payoff timeline and interest saved.

Rules/thresholds:

- [ ] Any debt APR above your "risk-free + margin" threshold is priority.
- [ ] Never miss a payment (autopay + reminders).

**Template needed:** Debt Amortization + Paydown Planner.

---

## 4) Investing (design + execution + governance)

### 4.1 Investing constitution (policy before products)

- [ ] Write your **Investment Policy Statement (IPS)**:
    - [ ] Goal(s): wealth, house, retirement, etc.
    - [ ] Time horizons
    - [ ] Risk tolerance + max drawdown you can handle
    - [ ] Target asset allocation
    - [ ] Rebalancing rules
    - [ ] Allowed assets and banned assets
    - [ ] Behavior rules ("what I do during crashes")
- [ ] Separate money into **time buckets**:
    - [ ] 0-3 years: capital preservation
    - [ ] 3-7 years: balanced
    - [ ] 7+ years: growth

### 4.2 Portfolio construction (the actual build)

- [ ] Decide asset classes: US equities, international, bonds, cash equivalents, alternatives (optional).
- [ ] Choose implementation: broad index funds/ETFs, factor tilt (optional), individual stocks (optional).
- [ ] Evaluate each holding:
    - [ ] Role in portfolio
    - [ ] Expense ratio / trading costs
    - [ ] Tax efficiency (taxable vs retirement)
- [ ] Define contributions plan:
    - [ ] Amount
    - [ ] Frequency
    - [ ] Where first (match → HSA → IRA → taxable, depending on your strategy)

### 4.3 Execution + tracking

- [ ] Track:
    - [ ] Holdings
    - [ ] Contributions
    - [ ] Performance vs benchmark
    - [ ] Allocation drift
- [ ] Rebalance when:
    - [ ] Any asset class drifts **>5% absolute** from target OR **annually**, whichever comes first.
- [ ] Tax-aware investing:
    - [ ] Asset location strategy (what goes in taxable vs retirement)
    - [ ] Tax-loss harvesting rules (if applicable)
    - [ ] Capital gains management

**Templates needed:** IPS Doc + Portfolio Tracker + Allocation/Rebalance Sheet + Contribution Plan.

---

## 5) Retirement + benefits optimization (full DIY)

- [ ] Track and optimize:
    - [ ] 401(k)/403(b)/457 contributions
    - [ ] IRA (Roth vs Traditional decision)
    - [ ] HSA (if eligible) as medical + investment vehicle
- [ ] Confirm:
    - [ ] Employer match captured (never leave money)
    - [ ] Vesting schedules understood
- [ ] Annual:
    - [ ] Update contribution targets
    - [ ] Review fund fees
    - [ ] Update beneficiaries

Rules/thresholds:

- [ ] If match exists → contribute at least enough to get full match.
- [ ] If taxable income is high, plan Roth vs Traditional intentionally (tax bracket logic).

**Templates needed:** Retirement Contributions Tracker + Projection Sheet + Benefits Summary Sheet.

---

## 6) Taxes (strategy + compliance + filing) — personal + business

### 6.1 Tax knowledge map (required concepts you must master)

- [ ] Filing status, dependents, AGI, taxable income
- [ ] Standard vs itemized deductions
- [ ] Credits vs deductions
- [ ] Payroll withholding basics (W-2)
- [ ] Self-employment tax and business deductions (1099)
- [ ] Depreciation basics (if assets/real estate)
- [ ] Capital gains (short vs long), wash sale rule
- [ ] State/local taxes and residency rules (baseline US)
- [ ] Estimated quarterly taxes

### 6.2 Your year-round tax system (not "April panic")

- [ ] Maintain a **Tax Year Folder**:
    - [ ] Income forms
    - [ ] Deduction/credit receipts
    - [ ] Investment tax forms
    - [ ] Crypto transaction exports
    - [ ] Business expense evidence
- [ ] Run tax projection:
    - [ ] Mid-year
    - [ ] Year-end
- [ ] Control withholding/estimated payments:
    - [ ] Calculate expected liability
    - [ ] Compare to payments made
    - [ ] Adjust W-4 or quarterly estimates

Rules/thresholds:

- [ ] If you have 1099/business income: assume quarterly estimated taxes required.
- [ ] If projection shows underpayment risk → adjust immediately (don't wait).

### 6.3 Filing readiness checklist

- [ ] Personal filing package:
    - [ ] W-2s
    - [ ] 1099s (INT/DIV/B/NEC/etc.)
    - [ ] Retirement contributions forms
    - [ ] HSA forms
    - [ ] Education forms (if any)
    - [ ] Charitable receipts
    - [ ] Mortgage interest/property tax statements (if applicable)
- [ ] Business filing package (if applicable):
    - [ ] Revenue totals by source
    - [ ] Expense ledger categorized
    - [ ] Mileage log (if used)
    - [ ] Home office evidence (if used)
    - [ ] Asset purchases list (for depreciation)
    - [ ] 1099s you must issue (if you paid contractors)
- [ ] Recordkeeping:
    - [ ] Save final returns + all supporting docs
    - [ ] Keep audit trail (how you calculated numbers)

**Templates needed:** Tax Projection Model + Deduction Evidence Log + Business P&L + Estimated Tax Calculator + 1099 Contractor Log.

---

## 7) Small business + freelancing operations (controller + compliance)

### 7.1 Structure and separation

- [ ] Separate:
    - [ ] Business bank account
    - [ ] Business card (optional but clean)
- [ ] Decide entity structure (baseline checklist item even if you choose sole prop):
    - [ ] Understand sole prop vs LLC vs S-corp basics
    - [ ] Track state registrations and renewal requirements
- [ ] Maintain:
    - [ ] Invoicing system
    - [ ] Contract templates
    - [ ] Client CRM basics (who owes you, when)

### 7.2 Bookkeeping (monthly close like a real company)

- [ ] Maintain chart of accounts:
    - [ ] Revenue categories
    - [ ] Expense categories
    - [ ] Owner draws/contributions
- [ ] Monthly close:
    - [ ] Reconcile bank
    - [ ] Reconcile card
    - [ ] Categorize expenses
    - [ ] Generate P&L + cash flow summary
- [ ] Accounts receivable:
    - [ ] Track invoices sent, paid, overdue
    - [ ] Collection workflow

Rules/thresholds:

- [ ] Any business expense without receipt/evidence is "at risk."
- [ ] If client concentration > 50% revenue → risk flag (income stability).

**Templates needed:** Business Ledger + P&L Template + Invoice Tracker + Client/Contract Log.

---

## 8) Real estate (renting, buying, owning, renting out)

- [ ] Rent vs buy analysis model:
    - [ ] All-in cost of ownership
    - [ ] Opportunity cost of down payment
    - [ ] Maintenance/insurance/taxes
- [ ] Mortgage literacy:
    - [ ] APR, points, amortization, escrow
    - [ ] Refinance break-even model
- [ ] Owning operations:
    - [ ] Maintenance schedule and reserve fund
    - [ ] Document retention: closing docs, deeds, insurance, repairs
- [ ] If rental property:
    - [ ] Tenant screening checklist
    - [ ] Lease template control
    - [ ] Rent ledger
    - [ ] Repair expense tracking
    - [ ] Depreciation tracking
    - [ ] Separate bank account recommended

Rules/thresholds:

- [ ] Do not buy if monthly payment relies on perfect conditions (stress test rates + job loss).
- [ ] Maintain a home repair reserve.

**Templates needed:** Rent vs Buy Model + Mortgage Amortization + Property Expense Tracker + Rental Ledger.

---

## 9) Insurance and risk management (risk officer)

### 9.1 Coverage map (what can ruin you)

- [ ] Health: deductible, out-of-pocket max, HSA eligibility
- [ ] Auto: liability limits high enough for your risk profile
- [ ] Renters/Home: replacement cost coverage
- [ ] Disability: protects income (core)
- [ ] Life: if anyone depends on you or you have obligations
- [ ] Umbrella: if assets/income risk is large

### 9.2 Annual policy audit

- [ ] Coverage adequate?
- [ ] Deductibles optimized?
- [ ] Premium increases explained?
- [ ] Compare quotes periodically (DIY shopping)

Rules/thresholds:

- [ ] Insure catastrophic risk, self-insure small predictable risk.
- [ ] If you have dependents, disability/life become non-optional.

**Templates needed:** Insurance Policy Register + Coverage Map + Renewal Calendar.

---

## 10) Equity compensation (RSUs/options/ESPP) (DIY comp finance)

- [ ] Identify comp types:
    - [ ] RSUs (vesting + taxation)
    - [ ] ISOs/NSOs (exercise decisions)
    - [ ] ESPP (discount + holding periods)
- [ ] Build a vesting calendar with expected tax impact.
- [ ] Decide a policy:
    - [ ] Sell immediately vs hold
    - [ ] Max concentration limits (single stock risk)
- [ ] Track:
    - [ ] Grants, vest dates, FMV, shares
    - [ ] Cost basis
    - [ ] Tax withholding shortfalls

Rules/thresholds:

- [ ] Any single-company exposure above your threshold = concentration risk.
- [ ] Don't guess taxes on options/RSUs, compute and reserve cash.

**Templates needed:** Equity Comp Tracker + Vesting Calendar + Concentration Risk Sheet.

---

## 11) Crypto (full tracking + taxes)

- [ ] Maintain full transaction history:
    - [ ] Buys/sells
    - [ ] Transfers between wallets/exchanges
    - [ ] Staking rewards/airdrops
- [ ] Track cost basis lots (FIFO/HIFO depending on method you choose and can support).
- [ ] Identify taxable events:
    - [ ] Trades, sales, spending, rewards income
- [ ] Reconcile exchange exports vs wallet reality.

Rules/thresholds:

- [ ] If you can't fully reconcile transactions, your tax filing is at risk.
- [ ] Keep a "proof folder" of exports and wallet addresses.

**Templates needed:** Crypto Transaction Ledger + Cost Basis Tracker + Taxable Events Summary.

---

## 12) Legal + estate planning (no gaps)

- [ ] Beneficiaries set on:
    - [ ] Retirement accounts
    - [ ] Brokerages
    - [ ] Bank accounts where allowed
    - [ ] Life insurance
- [ ] Core documents (US baseline):
    - [ ] Will
    - [ ] Durable power of attorney
    - [ ] Healthcare proxy + directive
- [ ] "In case of emergency" package:
    - [ ] Account inventory
    - [ ] Where documents are stored
    - [ ] Key contacts
    - [ ] Instructions for bills, business continuity

Rules/thresholds:

- [ ] If you have assets + dependents, estate docs become urgent.
- [ ] Review annually or after any major life change.

**Templates needed:** Estate Checklist + Emergency Dossier + Beneficiary Audit Sheet.

---

## 13) Compliance and audit readiness (operate like you could be audited)

- [ ] For personal:
    - [ ] Every deduction has evidence
    - [ ] Maintain clear categorization
- [ ] For business:
    - [ ] Receipts stored and linked to ledger entries
    - [ ] Contracts stored for income proof
    - [ ] Mileage logs consistent (if claimed)
- [ ] Keep:
    - [ ] Year-end packages (personal + business)
    - [ ] Change log of major decisions (why you did what you did)

Rules/thresholds:

- [ ] If you can't defend it in writing with evidence, don't claim it.

**Templates needed:** Evidence Register + Year-End Close Binder Checklist.

---

## 14) The operating cadence (do this forever)

### Weekly (ops control)

- [ ] Review balances + alerts
- [ ] Categorize transactions
- [ ] Check upcoming bills/invoices
- [ ] Verify autopays ran
- [ ] Business: invoice follow-ups

### Monthly (close the books)

- [ ] Reconcile all accounts
- [ ] Update net worth
- [ ] Update cash flow and budget vs actual
- [ ] Business: produce P&L and cash summary
- [ ] Invest scheduled contributions
- [ ] Update sinking funds

### Quarterly (strategy + tax control)

- [ ] Tax projection refresh
- [ ] Pay estimated taxes (if applicable)
- [ ] Review portfolio drift and rebalance if triggers hit
- [ ] Review insurance changes and quotes (as needed)
- [ ] Business: deeper margin + client concentration review

### Annual (full audit + redesign)

- [ ] Full financial review and goal reset
- [ ] IPS review and contribution increases
- [ ] Tax season package assembly and filing
- [ ] Retirement contribution limit check
- [ ] Beneficiary + estate doc review
- [ ] Big purchases planning update

---

## 15) Template list (what you need, grouped)

Each template becomes a pre-built `a4-page` in the **Template Library**. Templates that need structured data also require `table-card`, `chart-card`, or `kpi-card` items.

### Personal

- Net Worth Tracker — `a4-page` + `table-card` (assets/liabilities) + `kpi-card` (net worth) + `chart-card` (trend line)
- Cash Flow + Budget + Sinking Funds — `a4-page` + `table-card` (ledger) + `chart-card` (income vs spending)
- Subscription and Recurring Bills Register — `table-card`
- Account Inventory + Beneficiaries Log — `a4-page` + `table-card`
- Debt Schedule + Paydown Planner — `table-card` + `chart-card` (payoff timeline)
- Emergency Fund Ladder — `kpi-card` (months runway) + `table-card` (accounts)
- Annual Review Checklist — `a4-page`

### Investing

- Investment Policy Statement (IPS) — `a4-page`
- Portfolio Holdings + Allocation Tracker — `table-card` + `chart-card` (pie allocation) + Polygon.io integration
- Rebalancing Trigger Sheet — `table-card` + `kpi-card` (drift %)
- Contribution Plan — `table-card` + `timer-card` (next contribution date)
- Taxable Account Cost Basis Tracker — `table-card`

### Taxes

- Tax Year Document Checklist + Folder Index — `a4-page` + folder system
- Tax Projection Model — `table-card` + `kpi-card` (estimated liability)
- Withholding/Estimated Tax True-Up Sheet — `table-card` + `timer-card` (quarterly deadlines)
- Deduction Evidence Log — `table-card` + `file-card` (receipt attachments)
- Capital Gains / Loss Tracker — `table-card` + Polygon.io integration
- Business tax package checklist — `a4-page`

### Business/Freelance

- Chart of Accounts — `table-card`
- Transaction Ledger (bookkeeping) — `table-card` + CSV import + Plaid integration
- Monthly Close Checklist — `a4-page`
- P&L Template — `table-card` + `chart-card` (revenue vs expenses) + `kpi-card` (net income)
- Invoice Tracker + A/R Aging — `table-card` + `timer-card` (overdue alerts)
- Contractor Payments + 1099 Issuance Tracker — `table-card`
- Asset Purchases + Depreciation Register — `table-card`

### Real Estate

- Rent vs Buy Model — `a4-page` + `table-card` (comparison) + `chart-card` (breakeven)
- Mortgage Amortization + Refi Break-Even — `table-card` + `chart-card`
- Property Expense + Maintenance Tracker — `table-card` + `timer-card` (maintenance schedule)
- Rental Income/Expense Ledger — `table-card` + `chart-card` (cash flow)

### Insurance/Risk

- Insurance Policy Register — `table-card` + `file-card` (policy PDFs)
- Coverage Map + Renewal Calendar — `a4-page` + `timer-card` (renewal dates)

### Equity Comp

- Grant/Vesting Tracker — `table-card` + `timer-card` (vest dates) + Polygon.io integration
- Tax Withholding Shortfall Tracker — `table-card` + `kpi-card`
- Concentration Risk Sheet — `chart-card` (pie chart) + `kpi-card` (% exposure)

### Crypto

- Transaction Ledger + Cost Basis Lots — `table-card`
- Taxable Events Summary — `table-card` + `kpi-card` (total gains/losses)

### Legal/Estate

- Estate Document Checklist — `a4-page`
- Emergency Dossier ("If I'm unavailable") — `a4-page` + `secret-card` (encrypted access info)
- Beneficiary Audit Sheet — `table-card`
