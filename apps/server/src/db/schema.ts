import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  thumbnail: text('thumbnail'),
  type: text('type').notNull().default('workspace'),
  parentId: text('parent_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
});

// Cached daily/historical bars from Polygon.io
export const marketBars = sqliteTable(
  'market_bars',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    timespan: text('timespan').notNull(),
    multiplier: integer('multiplier').notNull(),
    timestamp: integer('timestamp').notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: real('volume').notNull(),
    vwap: real('vwap'),
    transactions: integer('transactions'),
    cachedAt: integer('cached_at').notNull(),
  },
  (table) => [
    uniqueIndex('market_bars_unique').on(
      table.symbol,
      table.timespan,
      table.multiplier,
      table.timestamp,
    ),
  ],
);

// Canvas items persisted per workspace
export const canvasItems = sqliteTable('canvas_items', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  zIndex: integer('z_index').notNull(),
  data: text('data'), // JSON string
});

// Canvas connections between items
export const canvasConnections = sqliteTable('canvas_connections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fromItemId: text('from_item_id').notNull(),
  fromAnchor: text('from_anchor').notNull(),
  toItemId: text('to_item_id').notNull(),
  toAnchor: text('to_anchor').notNull(),
});

// Per-user vault config (salt + encrypted verification token)
export const vaultConfig = sqliteTable('vault_config', {
  userId: text('user_id').primaryKey(),
  salt: text('salt').notNull(),
  verificationCiphertext: text('verification_ciphertext').notNull(),
  verificationIV: text('verification_iv').notNull(),
});

// Uploaded files metadata
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  extension: text('extension').notNull(),
  storagePath: text('storage_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Shared categories for financial cards (ledger, receipt, subscription, budget)
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  type: text('type').notNull(), // 'income' | 'expense' | 'both'
  context: text('context').notNull().default('ledger'), // 'ledger' | 'receipt' | 'subscription'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Financial transactions (unified ledger entries)
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull(), // 'income' | 'expense'
  categoryId: text('category_id'), // FK to categories.id (nullable)
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Account groups (color-coded groupings for accounts)
export const accountGroups = sqliteTable('account_groups', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Financial accounts (checking, savings, credit card, etc.)
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  institution: text('institution').notNull(),
  type: text('type').notNull(), // AccountType enum
  balance: real('balance').notNull(),
  groupId: text('group_id'), // FK to account_groups.id (nullable)
  lastUpdated: text('last_updated'), // YYYY-MM-DD
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Cached ticker metadata from Polygon.io
export const tickerDetails = sqliteTable('ticker_details', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  market: text('market').notNull(),
  type: text('type'),
  currencyName: text('currency_name'),
  active: integer('active', { mode: 'boolean' }).default(true),
  logoUrl: text('logo_url'),
  cachedAt: integer('cached_at').notNull(),
});

// Workspace-level receipt entries
export const receipts = sqliteTable('receipts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  merchant: text('merchant').notNull(),
  amount: real('amount').notNull(), // total incl. tax
  tax: real('tax').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'cash'|'card'|'check'|'transfer'|'other'
  categoryId: text('category_id'), // FK to categories
  status: text('status').notNull(), // 'pending'|'reviewed'|'reimbursed'
  linkedFileId: text('linked_file_id'), // FK to files
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Workspace-level subscription entries
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  frequency: text('frequency').notNull(), // 'weekly'|'biweekly'|'monthly'|'quarterly'|'annual'
  startDate: text('start_date').notNull(), // YYYY-MM-DD
  nextBillingDate: text('next_billing_date').notNull(), // YYYY-MM-DD
  categoryId: text('category_id'), // FK to categories
  status: text('status').notNull(), // 'active'|'paused'|'cancelled'
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One row per invoice card
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  dueDate: text('due_date').notNull(), // YYYY-MM-DD
  fromName: text('from_name'),
  fromAddress: text('from_address'),
  fromEmail: text('from_email'),
  toName: text('to_name'),
  toAddress: text('to_address'),
  toEmail: text('to_email'),
  taxRate: real('tax_rate').notNull(),
  notes: text('notes'),
  status: text('status').notNull(), // 'draft'|'sent'|'paid'|'overdue'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Invoice line items (N:1 to invoices)
export const invoiceLineItems = sqliteTable('invoice_line_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(), // FK to invoices
  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Workspace-level budget groups
export const budgetGroups = sqliteTable('budget_groups', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Workspace-level budget line items
export const budgetCategories = sqliteTable('budget_categories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  budgeted: real('budgeted').notNull(),
  actual: real('actual').notNull(),
  source: text('source'), // JSON string for { tableItemId, columnId, aggregation }
  notes: text('notes'),
  groupId: text('group_id'), // FK to budget_groups
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Portfolio holdings (workspace-level)
export const holdings = sqliteTable('holdings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  value: real('value').notNull(),
  targetPct: real('target_pct').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Debt planner debts (workspace-level)
export const debts = sqliteTable('debts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  balance: real('balance').notNull(),
  annualInterestRate: real('annual_interest_rate').notNull(),
  minimumPayment: real('minimum_payment').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Net worth categories (workspace-level)
export const networthCategories = sqliteTable('networth_categories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'asset' | 'liability'
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Net worth entries (workspace-level)
export const networthEntries = sqliteTable('networth_entries', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  categoryId: text('category_id').notNull(), // FK to networth_categories
  value: real('value').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
