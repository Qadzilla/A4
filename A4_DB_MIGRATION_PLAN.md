# A4 — Canvas Data Migration Plan: JSON Blobs → Proper Database Tables

> **Last updated:** 2026-02-25
> **Goal:** Move all source-of-truth financial data from `canvasItems.data` JSON blobs into proper, queryable database tables. Canvas items become *views into the data* rather than *containers of the data*.

---

## Current Architecture

Every canvas item stores its entire state as a JSON string in the `canvasItems.data` column. The canvas save/load cycle works like this:

1. **Load:** `canvas.load` → SELECT all `canvasItems` rows → `JSON.parse(data)` → Zustand store
2. **Edit:** User edits a card → local state changes → `updateItemData(id, data)` → Zustand store updated
3. **Save:** Zustand `subscribe` fires → `canvas.save` → DELETE all + INSERT all (full replace per workspace)

This means every save serializes the *entire workspace* and replaces all rows. There are no individual item mutations — it's a full snapshot.

### Problems with this approach

| Problem | Impact |
|---|---|
| No cross-card queries | Can't ask "total expenses across all ledgers" |
| No cross-workspace queries | Can't compute global net worth |
| No relational integrity | A ledger entry can't reference an account |
| AI can't query efficiently | Must parse every card's JSON blob to answer questions |
| Delete card = lose data | Financial records vanish with the canvas item |
| Duplicate card = duplicate data | Two copies of the same transactions |
| No bank feed landing zone | Plaid transactions need a real table |
| Full-workspace save is wasteful | Editing one field re-serializes everything |

---

## Target Architecture

### Principle: Separate data from presentation

- **Database tables** own source-of-truth financial records (transactions, accounts, holdings, etc.)
- **Canvas items** remain as visual containers with position/size/type, but their `data` field stores only **view config** (filters, display preferences, which records to show)
- **tRPC routers** provide CRUD for each data type
- **Cards read from DB** via tRPC queries, scoped to workspace
- **Cards write to DB** via tRPC mutations (not `updateItemData`)
- **Auto-save** pattern changes: instead of debounced JSON blob writes, each field change triggers a specific mutation

### What changes for the canvas save/load cycle

The `canvas.save` mutation continues to save item position, size, type, name, and `data` (now just view config). But the financial records inside each card are saved independently via their own routers, not as part of the canvas snapshot.

---

## Classification of All 24 Canvas Item Types

### Category A — Migrate to DB (source-of-truth financial records)

These cards contain data that represents real financial records. Deleting the card should NOT delete the underlying data. Multiple cards can view the same data.

| # | Card Type | Current JSON Data | Target Table(s) |
|---|---|---|---|
| A1 | `ledger-card` | Entries (date, amount, type, category, description) | `transactions`, `categories` |
| A2 | `account-card` | Accounts (name, institution, type, balance, group) | `accounts`, `account_groups` |
| A3 | `portfolio-card` | Holdings (symbol, name, value, targetPct) | `holdings` |
| A4 | `invoice-card` | Invoice header + line items | `invoices`, `invoice_lines` |
| A5 | `subscription-card` | Subscriptions (name, amount, frequency, dates) | `subscriptions` |
| A6 | `receipt-card` | Receipts (date, merchant, amount, status, file link) | `receipts` |
| A7 | `debt-planner-card` | Debts (name, balance, APR, min payment) | `debts` |
| A8 | `budget-card` | Budget categories (name, budgeted, actual, group) | `budget_categories`, `budget_groups` |
| A9 | `networth-card` | Asset/liability entries (name, category, value) | `networth_entries`, `networth_categories` |

### Category B — Stay as JSON (calculators & report templates)

These cards are computation tools or report templates. Their data is inputs/outputs for calculations, not source-of-truth financial records. Eventually some may *read from* DB tables to auto-populate, but their config belongs with the canvas item.

| # | Card Type | JSON Data | Rationale |
|---|---|---|---|
| B1 | `tax-estimator-card` | Income inputs, deduction inputs, filing config | Calculator — inputs produce computed output |
| B2 | `loan-calculator-card` | Loan terms, rates, extra payments | Calculator — amortization schedule is derived |
| B3 | `projection-card` | Starting amount, growth rate, years | Calculator — projection schedule is derived |
| B4 | `breakeven-card` | Fixed costs, variable cost, price | Calculator — break-even point is derived |
| B5 | `depreciation-card` | Asset cost, salvage, life, method | Calculator — schedule is derived |
| B6 | `rent-vs-buy-card` | Rent/buy parameters, rates, costs | Calculator — comparison is derived |
| B7 | `pnl-card` | 12-month revenue/expense line items | Report template (future: auto-populate from transactions) |
| B8 | `balance-sheet-card` | Point-in-time asset/liability line items | Report template (future: auto-populate from accounts) |
| B9 | `cash-flow-card` | 12-month cash flow line items | Report template (future: auto-populate from transactions) |

### Category C — Stay as JSON (presentation & general purpose)

These cards are presentation, layout, or general-purpose tools with no financial record semantics.

| # | Card Type | JSON Data | Rationale |
|---|---|---|---|
| C1 | `a4-page` | BlockNote document content | Rich text document |
| C2 | `secret-card` | Encrypted credential data | Vault — already has its own encryption system |
| C3 | `note` | Plain text content | Sticky note |
| C4 | `table-card` | Columns + rows (generic grid) | General-purpose spreadsheet |
| C5 | `kpi-card` | Label, value, format, trend, source binding | Metric display widget |
| C6 | `chart-card` | Chart type, title, source binding | Visualization config |
| C7 | `file-card` | File reference (already uses `files` table) | Already DB-backed |
| C8 | `timer-card` | Target date, label, color | Countdown widget |
| C9 | `embed-card` | URL + title | External content embed |

---

## New Database Tables

### Shared tables

#### `categories`

Unified category system shared across ledger, receipt, subscription, and budget cards within a workspace.

```
categories
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── color: text NOT NULL
├── type: text NOT NULL ('income' | 'expense' | 'both')
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

**Migration note:** Currently each card type (ledger, receipt, subscription, budget) has its own independent `categories` array in JSON. These must be deduplicated and merged into one workspace-level category set.

---

### A1 — `ledger-card` → `transactions` table

#### Current JSON model

```typescript
interface LedgerCardData {
  startingBalance: number;
  currency: SupportedCurrency;
  categories: LedgerCategory[];     // → migrates to `categories` table
  entries: LedgerEntry[];            // → migrates to `transactions` table
  notes: string;
}

interface LedgerEntry {
  id: string;
  date: string;         // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId?: string;
  notes: string;
}
```

#### New table

```
transactions
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── date: text NOT NULL (YYYY-MM-DD)
├── description: text NOT NULL
├── amount: real NOT NULL
├── type: text NOT NULL ('income' | 'expense')
├── categoryId: text FK → categories.id (nullable)
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
financial.listTransactions(workspaceId, filters?)  → Transaction[]
financial.createTransaction(data)                   → Transaction
financial.updateTransaction(id, data)               → Transaction
financial.deleteTransaction(id)                     → void
financial.bulkCreateTransactions(data[])             → Transaction[]
financial.getSummary(workspaceId, dateRange?)        → { totalIncome, totalExpenses, net }
```

#### Card data after migration

```typescript
interface LedgerCardData {
  startingBalance: number;
  currency: SupportedCurrency;
  notes: string;
  // categories and entries are gone — read from DB via tRPC
  // Optional view config:
  filterCategoryId?: string;
  filterType?: 'income' | 'expense';
  filterDateRange?: { from: string; to: string };
}
```

#### UI changes

- Card uses `trpc.financial.listTransactions.useQuery({ workspaceId })` to fetch entries
- Add entry → `trpc.financial.createTransaction.useMutation()` + invalidate query
- Edit entry → `trpc.financial.updateTransaction.useMutation()` + invalidate query
- Delete entry → `trpc.financial.deleteTransaction.useMutation()` + invalidate query
- Category management → `trpc.categories.*` endpoints
- `startingBalance`, `currency`, `notes`, and view filters remain in `item.data` JSON (view config)

#### Migration steps

1. Create `transactions` table + `categories` table in schema
2. Create `financial` router with full CRUD (replace stub)
3. Create `categories` router
4. Write migration script: for each `ledger-card` canvas item, extract `entries` → INSERT into `transactions`, extract `categories` → INSERT into `categories`
5. Rewrite `ledger-card-view.tsx` to use tRPC queries/mutations
6. Rewrite `ledger-card-content.tsx` to use tRPC query for preview
7. Update `LedgerCardData` type to remove `entries` and `categories`
8. Test: verify existing data loads correctly, CRUD works, auto-save works

---

### A2 — `account-card` → `accounts` + `account_groups` tables

#### Current JSON model

```typescript
interface AccountCardData {
  currency: SupportedCurrency;
  groups: AccountGroup[];     // → migrates to `account_groups`
  accounts: Account[];        // → migrates to `accounts`
  notes: string;
}

interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;  // 'checking' | 'savings' | 'credit-card' | 'brokerage' | 'retirement' | 'loan' | 'mortgage' | 'crypto' | 'other'
  balance: number;
  groupId?: string;
  lastUpdated: string;
  notes: string;
}

interface AccountGroup {
  id: string;
  name: string;
  color: string;
}
```

#### New tables

```
accounts
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── institution: text NOT NULL
├── type: text NOT NULL (AccountType enum)
├── balance: real NOT NULL
├── groupId: text FK → account_groups.id (nullable)
├── lastUpdated: text (YYYY-MM-DD)
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)

account_groups
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── color: text NOT NULL
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
accounts.list(workspaceId)              → Account[]
accounts.create(data)                   → Account
accounts.update(id, data)              → Account
accounts.delete(id)                    → void
accounts.listGroups(workspaceId)       → AccountGroup[]
accounts.createGroup(data)             → AccountGroup
accounts.updateGroup(id, data)         → AccountGroup
accounts.deleteGroup(id)               → void
accounts.getSummary(workspaceId)       → { totalAssets, totalLiabilities, netWorth }
```

#### Card data after migration

```typescript
interface AccountCardData {
  currency: SupportedCurrency;
  notes: string;
  // accounts and groups are gone — read from DB
  filterType?: AccountType;
  filterGroupId?: string;
}
```

#### Migration steps

1. Create `accounts` + `account_groups` tables in schema
2. Create `accounts` router
3. Write migration script: extract accounts + groups from each `account-card`'s JSON
4. Rewrite card views to use tRPC
5. Update type, test

---

### A3 — `portfolio-card` → `holdings` table

#### Current JSON model

```typescript
interface PortfolioCardData {
  currency: SupportedCurrency;
  holdings: PortfolioHolding[];  // → migrates to `holdings`
  notes: string;
}

interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  value: number;
  targetPct: number;
}
```

#### New table

```
holdings
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── symbol: text NOT NULL
├── name: text NOT NULL
├── value: real NOT NULL
├── targetPct: real NOT NULL
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
holdings.list(workspaceId)       → Holding[]
holdings.create(data)            → Holding
holdings.update(id, data)        → Holding
holdings.delete(id)              → void
holdings.getSummary(workspaceId) → { totalValue, isBalanced, driftSummary }
```

#### Card data after migration

```typescript
interface PortfolioCardData {
  currency: SupportedCurrency;
  notes: string;
  // holdings gone — read from DB
}
```

---

### A4 — `invoice-card` → `invoices` + `invoice_lines` tables

#### Current JSON model

```typescript
interface InvoiceCardData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  from: InvoiceParty;      // { name, address, email }
  to: InvoiceParty;
  items: InvoiceLineItem[];  // → migrates to `invoice_lines`
  taxRate: number;
  notes: string;
  status: InvoiceStatus;     // 'draft' | 'sent' | 'paid' | 'overdue'
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}
```

#### New tables

```
invoices
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── invoiceNumber: text NOT NULL
├── date: text NOT NULL (YYYY-MM-DD)
├── dueDate: text NOT NULL (YYYY-MM-DD)
├── fromName: text NOT NULL
├── fromAddress: text
├── fromEmail: text
├── toName: text NOT NULL
├── toAddress: text
├── toEmail: text
├── taxRate: real NOT NULL DEFAULT 0
├── notes: text
├── status: text NOT NULL ('draft' | 'sent' | 'paid' | 'overdue')
├── canvasItemId: text FK → canvasItems.id (nullable, links back to the card that created it)
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)

invoice_lines
├── id: text PK (UUID)
├── invoiceId: text FK → invoices.id
├── description: text NOT NULL
├── quantity: real NOT NULL
├── unitPrice: real NOT NULL
├── sortOrder: integer NOT NULL
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
invoices.list(workspaceId, filters?)    → Invoice[]
invoices.get(id)                        → Invoice + lines
invoices.create(data + lines)           → Invoice
invoices.update(id, data)               → Invoice
invoices.delete(id)                     → void
invoices.updateLines(invoiceId, lines)  → InvoiceLine[]
invoices.getSummary(workspaceId)        → { totalOutstanding, totalPaid, overdueCount }
```

#### Card data after migration

```typescript
interface InvoiceCardData {
  invoiceId: string;  // FK to invoices table — this card displays one invoice
  // Everything else read from DB
}
```

**Note:** Unlike other cards where one card shows a list from DB, each invoice-card maps to exactly one invoice record. The card is a visual representation of that specific invoice.

---

### A5 — `subscription-card` → `subscriptions` table

#### Current JSON model

```typescript
interface SubscriptionCardData {
  currency: SupportedCurrency;
  categories: SubscriptionCategory[];  // → migrates to shared `categories` table
  subscriptions: Subscription[];        // → migrates to `subscriptions`
  notes: string;
}

interface Subscription {
  id: string;
  name: string;
  amount: number;
  frequency: SubscriptionFrequency;  // 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  startDate: string;
  nextBillingDate: string;
  categoryId?: string;
  status: SubscriptionStatus;  // 'active' | 'paused' | 'cancelled'
  notes: string;
}
```

#### New table

```
subscriptions
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── amount: real NOT NULL
├── frequency: text NOT NULL (SubscriptionFrequency)
├── startDate: text NOT NULL (YYYY-MM-DD)
├── nextBillingDate: text NOT NULL (YYYY-MM-DD)
├── categoryId: text FK → categories.id (nullable)
├── status: text NOT NULL ('active' | 'paused' | 'cancelled')
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
subscriptions.list(workspaceId)        → Subscription[]
subscriptions.create(data)             → Subscription
subscriptions.update(id, data)         → Subscription
subscriptions.delete(id)               → void
subscriptions.getSummary(workspaceId)  → { monthlyTotal, annualTotal, activeCount }
```

#### Card data after migration

```typescript
interface SubscriptionCardData {
  currency: SupportedCurrency;
  notes: string;
  // subscriptions and categories gone — read from DB
  filterStatus?: SubscriptionStatus;
  filterCategoryId?: string;
}
```

---

### A6 — `receipt-card` → `receipts` table

#### Current JSON model

```typescript
interface ReceiptCardData {
  currency: SupportedCurrency;
  categories: ReceiptCategory[];  // → migrates to shared `categories` table
  receipts: Receipt[];             // → migrates to `receipts`
  notes: string;
}

interface Receipt {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  tax: number;
  paymentMethod: PaymentMethod;  // 'cash' | 'card' | 'check' | 'transfer' | 'other'
  categoryId?: string;
  status: ReceiptStatus;  // 'pending' | 'reviewed' | 'reimbursed'
  linkedFileId?: string;
  notes: string;
}
```

#### New table

```
receipts
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── date: text NOT NULL (YYYY-MM-DD)
├── merchant: text NOT NULL
├── amount: real NOT NULL
├── tax: real NOT NULL DEFAULT 0
├── paymentMethod: text NOT NULL
├── categoryId: text FK → categories.id (nullable)
├── status: text NOT NULL ('pending' | 'reviewed' | 'reimbursed')
├── linkedFileId: text FK → files.id (nullable)
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
receipts.list(workspaceId, filters?)   → Receipt[]
receipts.create(data)                  → Receipt
receipts.update(id, data)              → Receipt
receipts.delete(id)                    → void
receipts.getSummary(workspaceId)       → { totalAmount, pendingCount, reviewedCount }
```

#### Card data after migration

```typescript
interface ReceiptCardData {
  currency: SupportedCurrency;
  notes: string;
  // receipts and categories gone — read from DB
  filterStatus?: ReceiptStatus;
  filterCategoryId?: string;
}
```

---

### A7 — `debt-planner-card` → `debts` table

#### Current JSON model

```typescript
interface DebtPlannerCardData {
  currency: SupportedCurrency;
  strategy: DebtStrategy;        // 'avalanche' | 'snowball'
  extraMonthlyBudget: number;
  startDate: string;
  debts: Debt[];                  // → migrates to `debts`
  notes: string;
}

interface Debt {
  id: string;
  name: string;
  balance: number;
  annualInterestRate: number;
  minimumPayment: number;
}
```

#### New table

```
debts
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── balance: real NOT NULL
├── annualInterestRate: real NOT NULL
├── minimumPayment: real NOT NULL
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
debts.list(workspaceId)       → Debt[]
debts.create(data)            → Debt
debts.update(id, data)        → Debt
debts.delete(id)              → void
debts.getSummary(workspaceId) → { totalBalance, totalMinPayment, highestAPR }
```

#### Card data after migration

```typescript
interface DebtPlannerCardData {
  currency: SupportedCurrency;
  strategy: DebtStrategy;
  extraMonthlyBudget: number;
  startDate: string;
  notes: string;
  // debts gone — read from DB. strategy/budget/startDate are planner config, not source data.
}
```

---

### A8 — `budget-card` → `budget_categories` + `budget_groups` tables

#### Current JSON model

```typescript
interface BudgetCardData {
  period: BudgetPeriod;
  currency: BudgetCurrency;
  groups: BudgetGroup[];           // → migrates to `budget_groups`
  categories: BudgetCategory[];    // → migrates to `budget_categories`
  notes: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  source?: BudgetCategorySource;  // table-card binding (stays as config)
  notes: string;
  groupId?: string;
}

interface BudgetGroup {
  id: string;
  name: string;
  color: string;
}
```

#### New tables

```
budget_groups
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── color: text NOT NULL
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)

budget_categories
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── budgeted: real NOT NULL
├── actual: real NOT NULL
├── groupId: text FK → budget_groups.id (nullable)
├── sourceConfig: text (JSON — table-card binding config, nullable)
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
budgets.listCategories(workspaceId)          → BudgetCategory[]
budgets.createCategory(data)                 → BudgetCategory
budgets.updateCategory(id, data)             → BudgetCategory
budgets.deleteCategory(id)                   → void
budgets.listGroups(workspaceId)              → BudgetGroup[]
budgets.createGroup(data)                    → BudgetGroup
budgets.updateGroup(id, data)                → BudgetGroup
budgets.deleteGroup(id)                      → void
budgets.getSummary(workspaceId)              → { totalBudgeted, totalActual, variance }
```

#### Card data after migration

```typescript
interface BudgetCardData {
  period: BudgetPeriod;
  currency: BudgetCurrency;
  notes: string;
  // groups and categories gone — read from DB
}
```

---

### A9 — `networth-card` → `networth_entries` + `networth_categories` tables

#### Current JSON model

```typescript
interface NetWorthCardData {
  currency: SupportedCurrency;
  categories: NetWorthCategory[];  // → migrates to `networth_categories`
  entries: NetWorthEntry[];         // → migrates to `networth_entries`
  notes: string;
}

interface NetWorthCategory {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  isDefault: boolean;
}

interface NetWorthEntry {
  id: string;
  name: string;
  categoryId: string;
  value: number;
  notes: string;
}
```

#### New tables

```
networth_categories
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── name: text NOT NULL
├── kind: text NOT NULL ('asset' | 'liability')
├── isDefault: integer (boolean) NOT NULL DEFAULT 0
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)

networth_entries
├── id: text PK (UUID)
├── workspaceId: text FK → workspaces.id
├── userId: text NOT NULL
├── categoryId: text FK → networth_categories.id
├── name: text NOT NULL
├── value: real NOT NULL
├── notes: text
├── createdAt: integer (timestamp)
└── updatedAt: integer (timestamp)
```

#### New tRPC endpoints

```
networth.listEntries(workspaceId)             → NetWorthEntry[]
networth.createEntry(data)                    → NetWorthEntry
networth.updateEntry(id, data)                → NetWorthEntry
networth.deleteEntry(id)                      → void
networth.listCategories(workspaceId)          → NetWorthCategory[]
networth.createCategory(data)                 → NetWorthCategory
networth.updateCategory(id, data)             → NetWorthCategory
networth.deleteCategory(id)                   → void
networth.getSummary(workspaceId)              → { totalAssets, totalLiabilities, netWorth }
```

#### Card data after migration

```typescript
interface NetWorthCardData {
  currency: SupportedCurrency;
  notes: string;
  // entries and categories gone — read from DB
}
```

---

## Migration Order & Dependencies

### Phase 1 — Foundation (no card changes yet)

| Step | Task | Rationale |
|---|---|---|
| 1.1 | Create `categories` table + router | Shared dependency for ledger, receipt, subscription, budget |
| 1.2 | Create `transactions` table + router | Highest-value table — everything builds on transactions |
| 1.3 | Create `accounts` + `account_groups` tables + router | Core financial data |

### Phase 2 — Migrate core cards

| Step | Task | Dependencies |
|---|---|---|
| 2.1 | Migrate `ledger-card` to `transactions` + `categories` | 1.1, 1.2 |
| 2.2 | Migrate `account-card` to `accounts` + `account_groups` | 1.3 |
| 2.3 | Migrate `receipt-card` to `receipts` + shared `categories` | 1.1 |

### Phase 3 — Migrate remaining financial cards

| Step | Task | Dependencies |
|---|---|---|
| 3.1 | Create `holdings` table + router, migrate `portfolio-card` | None |
| 3.2 | Create `invoices` + `invoice_lines` tables + router, migrate `invoice-card` | None |
| 3.3 | Create `subscriptions` table + router, migrate `subscription-card` | 1.1 (shared categories) |
| 3.4 | Create `debts` table + router, migrate `debt-planner-card` | None |
| 3.5 | Create `budget_categories` + `budget_groups` tables + router, migrate `budget-card` | None |
| 3.6 | Create `networth_entries` + `networth_categories` tables + router, migrate `networth-card` | None |

### Phase 4 — Data migration script

| Step | Task |
|---|---|
| 4.1 | Write migration script that reads all existing canvas items, extracts JSON data, and INSERTs into new tables |
| 4.2 | Update canvas item `data` fields to remove migrated records (keep only view config) |
| 4.3 | Run migration on existing databases |
| 4.4 | Verify data integrity (counts match, no data loss) |

### Phase 5 — AI pipeline (benefits from migration)

With proper tables in place, the AI can:
- Query transactions directly via SQL
- Aggregate across cards and workspaces
- Answer financial questions without parsing JSON blobs
- Create/modify records via tool use

---

## New Table Summary

| Table | Rows from | FK to |
|---|---|---|
| `categories` | ledger, receipt, subscription categories (merged) | workspaces |
| `transactions` | ledger entries | workspaces, categories |
| `accounts` | account-card accounts | workspaces, account_groups |
| `account_groups` | account-card groups | workspaces |
| `holdings` | portfolio-card holdings | workspaces |
| `invoices` | invoice-card header data | workspaces, canvasItems |
| `invoice_lines` | invoice-card line items | invoices |
| `subscriptions` | subscription-card entries | workspaces, categories |
| `receipts` | receipt-card entries | workspaces, categories, files |
| `debts` | debt-planner-card debts | workspaces |
| `budget_categories` | budget-card categories | workspaces, budget_groups |
| `budget_groups` | budget-card groups | workspaces |
| `networth_categories` | networth-card categories | workspaces |
| `networth_entries` | networth-card entries | workspaces, networth_categories |

**Total: 14 new tables** (currently 7 tables → will be 21 tables)

---

## Cards That Stay as JSON (no migration needed)

These cards require NO changes to the data layer. Their `item.data` JSON blob is the correct storage mechanism.

### Calculators (B1–B6)

| Card | Data stored | Why JSON is correct |
|---|---|---|
| `tax-estimator-card` | Income/deduction inputs, filing config | Calculator inputs — no one queries "all tax estimates" |
| `loan-calculator-card` | Loan terms, rates, payment config | Calculator inputs — amortization is derived |
| `projection-card` | Starting amount, growth rate, years | Calculator inputs — schedule is derived |
| `breakeven-card` | Fixed costs, variable cost, price per unit | Calculator inputs — break-even is derived |
| `depreciation-card` | Asset cost, salvage, life, method | Calculator inputs — schedule is derived |
| `rent-vs-buy-card` | Rent/buy parameters | Calculator inputs — comparison is derived |

### Report templates (B7–B9)

| Card | Data stored | Why JSON is correct (for now) |
|---|---|---|
| `pnl-card` | 12-month revenue/expense line items per section | Report template with manual values. Future: auto-populate from transactions table |
| `balance-sheet-card` | Point-in-time asset/liability/equity items | Report template. Future: auto-populate from accounts table |
| `cash-flow-card` | 12-month cash flow items per section | Report template. Future: auto-populate from transactions table |

### Presentation & general purpose (C1–C9)

| Card | Data stored | Why JSON is correct |
|---|---|---|
| `a4-page` | BlockNote document JSON | Rich text — no query need |
| `secret-card` | Encrypted credential | Vault system — already special |
| `note` | Plain text | Sticky note — no query need |
| `table-card` | Generic columns + rows | General-purpose grid — no financial semantics |
| `kpi-card` | Label, value, format, source binding | Display widget config |
| `chart-card` | Chart type, title, source binding | Visualization config |
| `file-card` | File reference | Already DB-backed via `files` table |
| `timer-card` | Target date, label, color | Countdown widget config |
| `embed-card` | URL + title | External embed config |

---

## Per-Card Migration Template

For each Category A card, the migration follows this exact pattern:

### 1. Schema

- Add new table(s) to `apps/server/src/db/schema.ts`
- Run `pnpm drizzle-kit generate` + `pnpm drizzle-kit push`

### 2. Router

- Create new router in `apps/server/src/trpc/routers/`
- Add to app router in `apps/server/src/trpc/router.ts`
- Endpoints: list, create, update, delete, getSummary
- All endpoints use `protectedProcedure` + workspace ownership verification

### 3. Shared schemas

- Add Zod schemas for input validation in `packages/shared-schemas/`

### 4. Client hooks

- Create custom hook (e.g., `useTransactions(workspaceId)`) that wraps tRPC queries
- Handle optimistic updates for responsive UI

### 5. Card view rewrite

- Replace `item.data` reads with tRPC query
- Replace `updateItemData` writes with tRPC mutations
- Keep view-config fields (currency, notes, filters) in `item.data`
- Remove `dirtyRef` / debounced auto-save pattern for DB-backed fields (mutations are immediate)
- Keep auto-save pattern for view-config fields only

### 6. Card content (canvas preview) rewrite

- Replace `item.data` reads with tRPC query (with staleTime for performance)
- Canvas preview must handle loading state gracefully

### 7. Data migration script

- Server-side script that reads existing `canvasItems.data` JSON
- Extracts records → INSERTs into new tables
- Updates `canvasItems.data` to remove migrated records
- Idempotent (safe to run multiple times)

### 8. Testing

- Verify existing data loads correctly after migration
- CRUD operations work
- Canvas preview reflects DB data
- Cross-card queries work (e.g., total expenses)
- Delete card does NOT delete underlying records
- Multiple cards can view same data
