import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { buildWorkspaceContext, SYSTEM_PREAMBLE } from '../services/ai-context';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      thumbnail TEXT,
      type TEXT NOT NULL DEFAULT 'workspace',
      parent_id TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE canvas_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      z_index INTEGER NOT NULL,
      data TEXT
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      institution TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL,
      group_id TEXT,
      last_updated TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE budget_groups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE budget_categories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      budgeted REAL NOT NULL,
      actual REAL NOT NULL,
      source TEXT,
      notes TEXT,
      group_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE networth_categories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE networth_entries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      value REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      next_billing_date TEXT NOT NULL,
      category_id TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      from_name TEXT,
      from_address TEXT,
      from_email TEXT,
      to_name TEXT,
      to_address TEXT,
      to_email TEXT,
      tax_rate REAL NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE invoice_line_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE debts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      balance REAL NOT NULL,
      annual_interest_rate REAL NOT NULL,
      minimum_payment REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE holdings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      target_pct REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

const NOW = Date.now();

function insertWorkspace(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; userId: string; type: string }> = {}) {
  const { id = 'ws-1', name = 'Personal Finance 2026', userId = 'user-1', type = 'workspace' } = overrides;
  return db.insert(schema.workspaces).values({ id, name, userId, type, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertAccount(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; institution: string; type: string; balance: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Checking', institution = 'Chase', type = 'checking', balance = 1000, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.accounts).values({ id, name, institution, type, balance, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertBudgetCategory(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; budgeted: number; actual: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Groceries', budgeted = 500, actual = 400, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.budgetCategories).values({ id, name, budgeted, actual, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertNetworthCategory(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; kind: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Cash', kind = 'asset', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.networthCategories).values({ id, name, kind, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertNetworthEntry(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; categoryId: string; value: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Savings Account', categoryId = 'cat-1', value = 10000, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.networthEntries).values({ id, name, categoryId, value, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertSubscription(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; amount: number; frequency: string; status: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Netflix', amount = 15.99, frequency = 'monthly', status = 'active', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.subscriptions).values({ id, name, amount, frequency, status, workspaceId, userId, startDate: '2026-01-01', nextBillingDate: '2026-04-01', createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertInvoice(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; status: string; taxRate: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), status = 'paid', taxRate = 10, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.invoices).values({ id, invoiceNumber: `INV-${id.slice(0, 4)}`, date: '2026-01-15', dueDate: '2026-02-15', taxRate, status, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertLineItem(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; invoiceId: string; description: string; quantity: number; unitPrice: number }> = {}) {
  const { id = crypto.randomUUID(), invoiceId = 'inv-1', description = 'Service', quantity = 1, unitPrice = 1000 } = overrides;
  return db.insert(schema.invoiceLineItems).values({ id, invoiceId, description, quantity, unitPrice, sortOrder: 0, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertDebt(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; balance: number; annualInterestRate: number; minimumPayment: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Student Loan', balance = 45000, annualInterestRate = 6.8, minimumPayment = 450, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.debts).values({ id, name, balance, annualInterestRate, minimumPayment, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertHolding(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; symbol: string; name: string; value: number; targetPct: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), symbol = 'AAPL', name = 'Apple Inc', value = 5200, targetPct = 15, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.holdings).values({ id, symbol, name, value, targetPct, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertCanvasItem(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; type: string; name: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), type = 'note', name = 'My Note', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.canvasItems).values({ id, type, name, workspaceId, userId, x: 0, y: 0, width: 300, height: 200, zIndex: 1 });
}

describe('buildWorkspaceContext', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('includes system prompt preamble', async () => {
    await insertWorkspace(db);
    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain(SYSTEM_PREAMBLE);
    expect(result).toContain('NEVER fabricate financial data');
  });

  it('includes workspace metadata', async () => {
    await insertWorkspace(db, { name: 'My Business', type: 'workspace' });
    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('## Workspace: "My Business"');
    expect(result).toContain('Type: workspace');
  });

  it('includes account balances with total', async () => {
    await insertWorkspace(db);
    await insertAccount(db, { name: 'Chase Checking', balance: 8430 });
    await insertAccount(db, { name: 'Ally HYSA', balance: 25000 });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('### Accounts (2 total, $33,430.00 combined)');
    expect(result).toContain('Chase Checking: $8,430.00');
    expect(result).toContain('Ally HYSA: $25,000.00');
  });

  it('includes budget summary with over-budget categories', async () => {
    await insertWorkspace(db);
    await insertBudgetCategory(db, { name: 'Groceries', budgeted: 500, actual: 400 });
    await insertBudgetCategory(db, { name: 'Dining', budgeted: 200, actual: 380 });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('### Budget (2 categories)');
    expect(result).toContain('Planned: $700.00');
    expect(result).toContain('Actual: $780.00');
    expect(result).toContain('Over budget: Dining ($380.00/$200.00)');
  });

  it('includes net worth breakdown', async () => {
    await insertWorkspace(db);
    const assetCatId = 'nw-asset-1';
    const liabCatId = 'nw-liab-1';
    await insertNetworthCategory(db, { id: assetCatId, name: 'Cash', kind: 'asset' });
    await insertNetworthCategory(db, { id: liabCatId, name: 'Mortgage', kind: 'liability' });
    await insertNetworthEntry(db, { categoryId: assetCatId, value: 198000 });
    await insertNetworthEntry(db, { categoryId: liabCatId, value: 55500 });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('### Net Worth: $142,500.00');
    expect(result).toContain('Assets: $198,000.00');
    expect(result).toContain('Liabilities: $55,500.00');
  });

  it('omits empty sections', async () => {
    await insertWorkspace(db);
    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).not.toContain('### Accounts');
    expect(result).not.toContain('### Budget');
    expect(result).not.toContain('### Net Worth');
    expect(result).not.toContain('### Subscriptions');
    expect(result).not.toContain('### Invoices');
    expect(result).not.toContain('### Debts');
    expect(result).not.toContain('### Portfolio');
    expect(result).not.toContain('### Canvas Items');
    // Should still have preamble and workspace header
    expect(result).toContain(SYSTEM_PREAMBLE);
    expect(result).toContain('## Workspace:');
  });

  it('includes canvas item summary by type', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { type: 'budget-card', name: 'Monthly Budget' });
    await insertCanvasItem(db, { type: 'account-card', name: 'Bank Accounts' });
    await insertCanvasItem(db, { type: 'note', name: 'My Notes' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('### Canvas Items (3 items)');
    expect(result).toContain('budget-card: "Monthly Budget"');
    expect(result).toContain('account-card: "Bank Accounts"');
  });

  it('handles workspace with no data gracefully', async () => {
    await insertWorkspace(db);
    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    // Should return preamble + workspace header only, no data sections
    expect(result).toContain(SYSTEM_PREAMBLE);
    expect(result).toContain('## Workspace: "Personal Finance 2026"');
    // No data sections in workspace context (after "## Current workspace context")
    const contextPart = result.split('## Current workspace context')[1] ?? '';
    const sectionCount = (contextPart.match(/^### /gm) ?? []).length;
    expect(sectionCount).toBe(0);
  });

  it('scopes all queries to userId', async () => {
    await insertWorkspace(db);
    await insertWorkspace(db, { id: 'ws-2', userId: 'user-2' });

    // Insert data for user-2
    await insertAccount(db, { name: 'Other User Account', balance: 99999, workspaceId: 'ws-1', userId: 'user-2' });
    await insertAccount(db, { name: 'My Account', balance: 500, workspaceId: 'ws-1', userId: 'user-1' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('My Account');
    expect(result).not.toContain('Other User Account');
    expect(result).not.toContain('$99,999');
  });

  it('formats currency values correctly', async () => {
    await insertWorkspace(db);
    await insertAccount(db, { name: 'Big Account', balance: 1234567.89 });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    expect(result).toContain('$1,234,567.89');
  });

  it('throws when workspace not found', async () => {
    await expect(buildWorkspaceContext(db, 'user-1', 'ws-nonexistent')).rejects.toThrow(
      'Workspace ws-nonexistent not found for user user-1',
    );
  });
});

describe('SYSTEM_PREAMBLE — tool guidelines', () => {
  it('includes tool usage guidelines section', () => {
    expect(SYSTEM_PREAMBLE).toContain('## Tool usage guidelines');
  });

  it('mentions when to use tools vs workspace summary', () => {
    expect(SYSTEM_PREAMBLE).toContain('answer directly from this context');
    expect(SYSTEM_PREAMBLE).toContain('detailed');
  });

  it('includes canvas creation best practices', () => {
    expect(SYSTEM_PREAMBLE).toContain('descriptive name based on conversation context');
  });

  it('includes calculation guidelines', () => {
    expect(SYSTEM_PREAMBLE).toContain('Show key results inline');
  });

  it('includes restriction about not deleting items', () => {
    expect(SYSTEM_PREAMBLE).toContain('cannot delete canvas items');
  });

  it('includes restriction about vault-encrypted data', () => {
    expect(SYSTEM_PREAMBLE).toContain('vault-encrypted data');
  });

  it('system prompt stays under token budget for typical workspace', async () => {
    const db = createTestDb();
    await insertWorkspace(db);

    // Insert moderate workspace data: 5 accounts, 3 budget categories, 2 subscriptions
    await insertAccount(db, { name: 'Chase Checking', balance: 8430 });
    await insertAccount(db, { name: 'Ally HYSA', balance: 25000 });
    await insertAccount(db, { name: 'Vanguard Brokerage', balance: 42000 });
    await insertAccount(db, { name: 'Amex Credit Card', balance: -1200 });
    await insertAccount(db, { name: 'Wells Fargo Savings', balance: 15000 });

    await insertBudgetCategory(db, { name: 'Groceries', budgeted: 500, actual: 420 });
    await insertBudgetCategory(db, { name: 'Dining', budgeted: 200, actual: 180 });
    await insertBudgetCategory(db, { name: 'Transportation', budgeted: 300, actual: 275 });

    await insertSubscription(db, { name: 'Netflix', amount: 15.99 });
    await insertSubscription(db, { name: 'Spotify', amount: 9.99 });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');
    // ~4000 tokens ≈ 16000 chars
    expect(result.length).toBeLessThan(16000);
  });
});
