import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { executeTool, safeExecuteTool, getToolDefinitions } from '../services/ai-tools';
import type { ToolContext } from '../services/ai-tools';

const mockSearchDocuments = vi.hoisted(() => vi.fn());
vi.mock('../services/vector-search', () => ({
  searchDocuments: mockSearchDocuments,
}));

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
    CREATE TABLE receipts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL NOT NULL,
      payment_method TEXT NOT NULL,
      category_id TEXT,
      status TEXT NOT NULL,
      linked_file_id TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE market_bars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timespan TEXT NOT NULL,
      multiplier INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      vwap REAL,
      transactions INTEGER,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE canvas_connections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_item_id TEXT NOT NULL,
      from_anchor TEXT NOT NULL,
      to_item_id TEXT NOT NULL,
      to_anchor TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

const NOW = Date.now();
type TestDb = ReturnType<typeof createTestDb>;

function insertWorkspace(db: TestDb, overrides: Partial<{ id: string; name: string; userId: string; type: string }> = {}) {
  const { id = 'ws-1', name = 'Test Workspace', userId = 'user-1', type = 'workspace' } = overrides;
  return db.insert(schema.workspaces).values({ id, name, userId, type, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertAccount(db: TestDb, overrides: Partial<{ id: string; name: string; institution: string; type: string; balance: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Checking', institution = 'Chase', type = 'checking', balance = 1000, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.accounts).values({ id, name, institution, type, balance, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertBudgetCategory(db: TestDb, overrides: Partial<{ id: string; name: string; budgeted: number; actual: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Groceries', budgeted = 500, actual = 400, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.budgetCategories).values({ id, name, budgeted, actual, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertSubscription(db: TestDb, overrides: Partial<{ id: string; name: string; amount: number; frequency: string; status: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Netflix', amount = 15.99, frequency = 'monthly', status = 'active', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.subscriptions).values({ id, name, amount, frequency, status, workspaceId, userId, startDate: '2026-01-01', nextBillingDate: '2026-04-01', createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertInvoice(db: TestDb, overrides: Partial<{ id: string; status: string; taxRate: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), status = 'paid', taxRate = 10, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.invoices).values({ id, invoiceNumber: `INV-${id.slice(0, 4)}`, date: '2026-01-15', dueDate: '2026-02-15', taxRate, status, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertLineItem(db: TestDb, overrides: Partial<{ id: string; invoiceId: string; description: string; quantity: number; unitPrice: number }> = {}) {
  const { id = crypto.randomUUID(), invoiceId = 'inv-1', description = 'Service', quantity = 1, unitPrice = 1000 } = overrides;
  return db.insert(schema.invoiceLineItems).values({ id, invoiceId, description, quantity, unitPrice, sortOrder: 0, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertDebt(db: TestDb, overrides: Partial<{ id: string; name: string; balance: number; annualInterestRate: number; minimumPayment: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Student Loan', balance = 45000, annualInterestRate = 6.8, minimumPayment = 450, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.debts).values({ id, name, balance, annualInterestRate, minimumPayment, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertHolding(db: TestDb, overrides: Partial<{ id: string; symbol: string; name: string; value: number; targetPct: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), symbol = 'AAPL', name = 'Apple Inc', value = 5200, targetPct = 15, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.holdings).values({ id, symbol, name, value, targetPct, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertNetworthCategory(db: TestDb, overrides: Partial<{ id: string; name: string; kind: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Cash', kind = 'asset', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.networthCategories).values({ id, name, kind, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertNetworthEntry(db: TestDb, overrides: Partial<{ id: string; name: string; categoryId: string; value: number; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), name = 'Savings', categoryId = 'cat-1', value = 10000, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.networthEntries).values({ id, name, categoryId, value, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertCanvasItem(db: TestDb, overrides: Partial<{ id: string; type: string; name: string; data: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), type = 'note', name = 'My Note', data, workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.canvasItems).values({ id, type, name, workspaceId, userId, x: 0, y: 0, width: 300, height: 200, zIndex: 1, data });
}

function insertReceipt(db: TestDb, overrides: Partial<{ id: string; merchant: string; amount: number; date: string; paymentMethod: string; status: string; workspaceId: string; userId: string }> = {}) {
  const { id = crypto.randomUUID(), merchant = 'Starbucks', amount = 5.75, date = '2026-03-01', paymentMethod = 'card', status = 'pending', workspaceId = 'ws-1', userId = 'user-1' } = overrides;
  return db.insert(schema.receipts).values({ id, merchant, amount, date, paymentMethod, status, tax: 0, workspaceId, userId, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertMarketBar(db: TestDb, overrides: Partial<{ symbol: string; timespan: string; timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = {}) {
  const { symbol = 'AAPL', timespan = 'day', timestamp = 1709251200, open = 180, high = 185, low = 179, close = 183, volume = 50000000 } = overrides;
  return db.insert(schema.marketBars).values({ symbol, timespan, multiplier: 1, timestamp, open, high, low, close, volume, cachedAt: NOW });
}

function ctx(db: TestDb, overrides: Partial<ToolContext> = {}): ToolContext {
  return { db: db as unknown as ToolContext['db'], userId: 'user-1', workspaceId: 'ws-1', ...overrides };
}

describe('tool registry', () => {
  it('getToolDefinitions returns 17 tools with unique names', () => {
    const defs = getToolDefinitions();
    expect(defs).toHaveLength(39);
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(39);
  });

  it('executeTool throws for unknown tool name', async () => {
    const db = createTestDb();
    await expect(executeTool('nonexistent_tool', {}, ctx(db))).rejects.toThrow('Unknown tool: nonexistent_tool');
  });
});

describe('get_workspace_summary', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns workspace info and data counts', async () => {
    await insertWorkspace(db, { name: 'My Finance' });
    await insertAccount(db, { name: 'Checking', balance: 1000 });
    await insertAccount(db, { name: 'Savings', balance: 5000 });
    await insertBudgetCategory(db);
    await insertCanvasItem(db);

    const result = await executeTool('get_workspace_summary', {}, ctx(db));
    expect(result.name).toBe('My Finance');
    expect(result.type).toBe('workspace');
    expect(result.counts).toEqual({
      accounts: 2,
      budgetCategories: 1,
      subscriptions: 0,
      invoices: 0,
      debts: 0,
      holdings: 0,
      networthCategories: 0,
      canvasItems: 1,
    });
  });
});

describe('get_canvas_items', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns all canvas items', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', type: 'note', name: 'Note 1' });
    await insertCanvasItem(db, { id: 'ci-2', type: 'budget-card', name: 'Budget' });

    const result = await executeTool('get_canvas_items', {}, ctx(db));
    expect(result.items).toHaveLength(2);
  });

  it('filters by type', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', type: 'note', name: 'Note 1' });
    await insertCanvasItem(db, { id: 'ci-2', type: 'budget-card', name: 'Budget' });

    const result = await executeTool('get_canvas_items', { type: 'note' }, ctx(db));
    expect(result.items).toHaveLength(1);
    expect((result.items as Array<{ type: string }>)[0]!.type).toBe('note');
  });
});

describe('get_item_data', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns parsed data for a canvas item', async () => {
    await insertWorkspace(db);
    const data = JSON.stringify({ title: 'Hello', rows: [1, 2, 3] });
    await insertCanvasItem(db, { id: 'ci-1', type: 'table-card', name: 'My Table', data });

    const result = await executeTool('get_item_data', { itemId: 'ci-1' }, ctx(db));
    expect(result.id).toBe('ci-1');
    expect(result.type).toBe('table-card');
    expect(result.name).toBe('My Table');
    expect(result.data).toEqual({ title: 'Hello', rows: [1, 2, 3] });
  });

  it('returns error for item not in workspace', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-other', workspaceId: 'ws-other', userId: 'user-other' });

    const result = await executeTool('get_item_data', { itemId: 'ci-other' }, ctx(db));
    expect(result.error).toBe('Item not found');
  });
});

describe('get_accounts', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns all accounts with balances', async () => {
    await insertWorkspace(db);
    await insertAccount(db, { id: 'a-1', name: 'Checking', type: 'checking', balance: 5000 });
    await insertAccount(db, { id: 'a-2', name: 'Savings', type: 'savings', balance: 20000 });

    const result = await executeTool('get_accounts', {}, ctx(db));
    expect(result.accounts).toHaveLength(2);
    const accts = result.accounts as Array<{ name: string; balance: number }>;
    expect(accts.find((a) => a.name === 'Checking')?.balance).toBe(5000);
  });

  it('filters by type', async () => {
    await insertWorkspace(db);
    await insertAccount(db, { id: 'a-1', type: 'checking', balance: 5000 });
    await insertAccount(db, { id: 'a-2', type: 'savings', balance: 20000 });

    const result = await executeTool('get_accounts', { type: 'savings' }, ctx(db));
    expect(result.accounts).toHaveLength(1);
    expect((result.accounts as Array<{ type: string }>)[0]!.type).toBe('savings');
  });
});

describe('get_budget', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns budget categories with amounts', async () => {
    await insertWorkspace(db);
    await insertBudgetCategory(db, { id: 'bc-1', name: 'Groceries', budgeted: 500, actual: 420 });
    await insertBudgetCategory(db, { id: 'bc-2', name: 'Dining', budgeted: 200, actual: 180 });

    const result = await executeTool('get_budget', {}, ctx(db));
    expect(result.categories).toHaveLength(2);
    const cats = result.categories as Array<{ name: string; budgeted: number; actual: number }>;
    expect(cats.find((c) => c.name === 'Groceries')?.budgeted).toBe(500);
    expect(cats.find((c) => c.name === 'Groceries')?.actual).toBe(420);
  });
});

describe('get_invoices', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns invoices with computed totals', async () => {
    await insertWorkspace(db);
    await insertInvoice(db, { id: 'inv-1', status: 'paid', taxRate: 10 });
    await insertLineItem(db, { invoiceId: 'inv-1', quantity: 2, unitPrice: 500 });
    await insertLineItem(db, { invoiceId: 'inv-1', quantity: 1, unitPrice: 200 });

    const result = await executeTool('get_invoices', {}, ctx(db));
    const invs = result.invoices as Array<{ subtotal: number; total: number; lineItems: unknown[] }>;
    expect(invs).toHaveLength(1);
    expect(invs[0]!.subtotal).toBe(1200); // 2*500 + 1*200
    expect(invs[0]!.total).toBeCloseTo(1320); // 1200 * 1.10
    expect(invs[0]!.lineItems).toHaveLength(2);
  });

  it('filters by status', async () => {
    await insertWorkspace(db);
    await insertInvoice(db, { id: 'inv-1', status: 'paid' });
    await insertInvoice(db, { id: 'inv-2', status: 'draft' });

    const result = await executeTool('get_invoices', { status: 'draft' }, ctx(db));
    expect(result.invoices).toHaveLength(1);
    expect((result.invoices as Array<{ id: string }>)[0]!.id).toBe('inv-2');
  });
});

describe('get_receipts', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns receipts in workspace', async () => {
    await insertWorkspace(db);
    await insertReceipt(db, { id: 'r-1', merchant: 'Starbucks', amount: 5.75 });
    await insertReceipt(db, { id: 'r-2', merchant: 'Amazon', amount: 42.99 });

    const result = await executeTool('get_receipts', {}, ctx(db));
    const rcpts = result.receipts as Array<{ merchant: string; amount: number }>;
    expect(rcpts).toHaveLength(2);
    expect(rcpts.find((r) => r.merchant === 'Starbucks')?.amount).toBe(5.75);
  });
});

describe('get_subscriptions', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns subscriptions', async () => {
    await insertWorkspace(db);
    await insertSubscription(db, { id: 's-1', name: 'Netflix', amount: 15.99, status: 'active' });
    await insertSubscription(db, { id: 's-2', name: 'Spotify', amount: 9.99, status: 'paused' });

    const result = await executeTool('get_subscriptions', {}, ctx(db));
    expect(result.subscriptions).toHaveLength(2);

    const filtered = await executeTool('get_subscriptions', { status: 'active' }, ctx(db));
    expect(filtered.subscriptions).toHaveLength(1);
    expect((filtered.subscriptions as Array<{ name: string }>)[0]!.name).toBe('Netflix');
  });
});

describe('get_holdings', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns portfolio holdings', async () => {
    await insertWorkspace(db);
    await insertHolding(db, { id: 'h-1', symbol: 'AAPL', value: 5200, targetPct: 15 });
    await insertHolding(db, { id: 'h-2', symbol: 'GOOGL', value: 8300, targetPct: 25 });

    const result = await executeTool('get_holdings', {}, ctx(db));
    const hlds = result.holdings as Array<{ symbol: string; value: number }>;
    expect(hlds).toHaveLength(2);
    // Ordered by value desc
    expect(hlds[0]!.symbol).toBe('GOOGL');
    expect(hlds[1]!.symbol).toBe('AAPL');
  });
});

describe('get_debts', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns debts with interest rates', async () => {
    await insertWorkspace(db);
    await insertDebt(db, { id: 'd-1', name: 'Student Loan', balance: 45000, annualInterestRate: 6.8, minimumPayment: 450 });
    await insertDebt(db, { id: 'd-2', name: 'Car Loan', balance: 18000, annualInterestRate: 4.5, minimumPayment: 350 });

    const result = await executeTool('get_debts', {}, ctx(db));
    const dts = result.debts as Array<{ name: string; balance: number; annualInterestRate: number }>;
    expect(dts).toHaveLength(2);
    // Ordered by balance desc
    expect(dts[0]!.name).toBe('Student Loan');
    expect(dts[0]!.annualInterestRate).toBe(6.8);
  });
});

describe('get_networth', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns net worth breakdown', async () => {
    await insertWorkspace(db);
    await insertNetworthCategory(db, { id: 'nw-a', name: 'Cash', kind: 'asset' });
    await insertNetworthCategory(db, { id: 'nw-l', name: 'Mortgage', kind: 'liability' });
    await insertNetworthEntry(db, { categoryId: 'nw-a', name: 'Savings', value: 50000 });
    await insertNetworthEntry(db, { categoryId: 'nw-a', name: 'Checking', value: 10000 });
    await insertNetworthEntry(db, { categoryId: 'nw-l', name: 'Home Loan', value: 200000 });

    const result = await executeTool('get_networth', {}, ctx(db));
    expect(result.totalAssets).toBe(60000);
    expect(result.totalLiabilities).toBe(200000);
    expect(result.netWorth).toBe(-140000);
    const cats = result.categories as Array<{ name: string; entries: unknown[] }>;
    expect(cats).toHaveLength(2);
    expect(cats.find((c) => c.name === 'Cash')?.entries).toHaveLength(2);
  });
});

describe('get_market_data', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('returns cached bars for symbol', async () => {
    await insertMarketBar(db, { symbol: 'AAPL', timestamp: 1000, close: 183 });
    await insertMarketBar(db, { symbol: 'AAPL', timestamp: 2000, close: 185 });
    await insertMarketBar(db, { symbol: 'GOOGL', timestamp: 1000, close: 140 });

    const result = await executeTool('get_market_data', { symbol: 'AAPL' }, ctx(db));
    expect(result.symbol).toBe('AAPL');
    expect(result.bars).toHaveLength(2);
  });

  it('returns empty array for unknown symbol', async () => {
    const result = await executeTool('get_market_data', { symbol: 'ZZZZ' }, ctx(db));
    expect(result.symbol).toBe('ZZZZ');
    expect(result.bars).toHaveLength(0);
  });
});

describe('create_canvas_item', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('creates a budget-card with defaults', async () => {
    await insertWorkspace(db);
    const result = await executeTool('create_canvas_item', { type: 'budget-card' }, ctx(db));
    expect(result.type).toBe('budget-card');
    expect(result.name).toBe('Untitled Budget');
    expect(result.width).toBe(320);
    expect(result.height).toBe(360);
    expect(result._canvasUpdate).toBe(true);
    expect(result.data).toBeTruthy();
    expect((result.data as Record<string, unknown>).currency).toBe('USD');
  });

  it('creates item with custom name and data', async () => {
    await insertWorkspace(db);
    const result = await executeTool('create_canvas_item', { type: 'kpi-card', name: 'Revenue', data: { label: 'Revenue', value: '50000', format: 'currency' } }, ctx(db));
    expect(result.name).toBe('Revenue');
    expect((result.data as Record<string, unknown>).label).toBe('Revenue');
    expect((result.data as Record<string, unknown>).value).toBe('50000');
    expect((result.data as Record<string, unknown>).format).toBe('currency');
  });

  it('auto-positions below existing items', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-existing' });

    const result = await executeTool('create_canvas_item', { type: 'note' }, ctx(db));
    // Existing item at y=0, height=200, so new item should be at y=240 (200+40 gap)
    expect(result.y).toBe(240);
    expect(result.x).toBe(100);
  });

  it('rejects invalid item type', async () => {
    await insertWorkspace(db);
    const result = await executeTool('create_canvas_item', { type: 'nonexistent-card' }, ctx(db));
    expect(result.error).toContain('Invalid item type');
    expect(result.error).toContain('nonexistent-card');
  });

  it('assigns incrementing zIndex', async () => {
    await insertWorkspace(db);
    const r1 = await executeTool('create_canvas_item', { type: 'note' }, ctx(db));
    expect(r1.zIndex).toBe(1);

    const r2 = await executeTool('create_canvas_item', { type: 'note' }, ctx(db));
    expect(r2.zIndex).toBe(2);
  });
});

describe('update_canvas_item', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('updates item name', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', name: 'Old Name' });

    const result = await executeTool('update_canvas_item', { itemId: 'ci-1', name: 'New Name' }, ctx(db));
    expect(result.name).toBe('New Name');
    expect(result._canvasUpdate).toBe(true);
  });

  it('updates item data (full replacement)', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', data: JSON.stringify({ old: true }) });

    const newData = { label: 'Revenue', value: '100' };
    const result = await executeTool('update_canvas_item', { itemId: 'ci-1', data: newData }, ctx(db));
    expect(result.data).toEqual(newData);
    expect(result._canvasUpdate).toBe(true);
  });

  it('returns error for item not in workspace', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-other', workspaceId: 'ws-other', userId: 'user-other' });

    const result = await executeTool('update_canvas_item', { itemId: 'ci-other' }, ctx(db));
    expect(result.error).toBe('Item not found');
  });
});

describe('create_connection', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('creates a connection between two items', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', name: 'Item 1' });
    await insertCanvasItem(db, { id: 'ci-2', name: 'Item 2' });

    const result = await executeTool('create_connection', {
      fromItemId: 'ci-1', fromAnchor: 'right',
      toItemId: 'ci-2', toAnchor: 'left',
    }, ctx(db));

    expect(result.fromItemId).toBe('ci-1');
    expect(result.toItemId).toBe('ci-2');
    expect(result.fromAnchor).toBe('right');
    expect(result.toAnchor).toBe('left');
    expect(result._canvasUpdate).toBe(true);
    expect(result.id).toBeTruthy();
  });

  it('rejects self-connection', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1' });

    const result = await executeTool('create_connection', {
      fromItemId: 'ci-1', fromAnchor: 'right',
      toItemId: 'ci-1', toAnchor: 'left',
    }, ctx(db));

    expect(result.error).toContain('Cannot connect an item to itself');
  });
});

describe('position_items', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('repositions multiple items', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1' });
    await insertCanvasItem(db, { id: 'ci-2' });

    const result = await executeTool('position_items', {
      positions: [
        { itemId: 'ci-1', x: 500, y: 600 },
        { itemId: 'ci-2', x: 800, y: 100 },
      ],
    }, ctx(db));

    expect(result.updated).toBe(2);
    expect(result._canvasUpdate).toBe(true);
  });

  it('returns zero for items not in workspace', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-other', workspaceId: 'ws-other', userId: 'user-other' });

    const result = await executeTool('position_items', {
      positions: [{ itemId: 'ci-other', x: 500, y: 600 }],
    }, ctx(db));

    expect(result.updated).toBe(0);
  });
});

describe('delete_canvas_item', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('always returns an error message', async () => {
    await insertWorkspace(db);
    const result = await executeTool('delete_canvas_item', { itemId: 'ci-1' }, ctx(db));
    expect(result.error).toContain('manual confirmation');
  });

  it('never deletes (verify item still exists in DB)', async () => {
    await insertWorkspace(db);
    await insertCanvasItem(db, { id: 'ci-1', name: 'Keep Me' });

    await executeTool('delete_canvas_item', { itemId: 'ci-1' }, ctx(db));

    // Verify item still exists
    const check = await executeTool('get_item_data', { itemId: 'ci-1' }, ctx(db));
    expect(check.id).toBe('ci-1');
    expect(check.name).toBe('Keep Me');
  });
});

// ─── Calculation Tool Tests ──────────────────────────────────────────

describe('calculate_tax', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes federal tax for single filer', async () => {
    const result = await executeTool('calculate_tax', {
      w2Wages: 75000,
      filingStatus: 'single',
      stateCode: 'CA',
    }, ctx(db));

    expect(result.grossIncome).toBe(75000);
    expect(result.federalTax).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
    expect(result.stateTax).toBeGreaterThan(0);
  });
});

describe('calculate_loan', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes monthly payment for 30-year mortgage', async () => {
    const result = await executeTool('calculate_loan', {
      homePrice: 400000,
      downPaymentPercent: 20,
      annualInterestRate: 6.5,
      loanTermYears: 30,
    }, ctx(db));

    expect(result.monthlyPI).toBeGreaterThan(0);
    expect(result.scheduleTruncated).toBe(true);
    expect(result.scheduleTotalRows).toBe(360);
    expect((result.schedule as unknown[]).length).toBe(24);
  });
});

describe('calculate_projection', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('projects investment growth', async () => {
    const result = await executeTool('calculate_projection', {
      startingAmount: 10000,
      monthlyContribution: 500,
      annualGrowthRate: 7,
      projectionYears: 10,
    }, ctx(db));

    expect(result.finalBalance).toBeGreaterThan(result.totalContributions as number);
    expect((result.schedule as unknown[]).length).toBe(10);
  });
});

describe('calculate_breakeven', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes breakeven point', async () => {
    const result = await executeTool('calculate_breakeven', {
      fixedCosts: 5000,
      variableCostPerUnit: 15,
      pricePerUnit: 40,
    }, ctx(db));

    expect(result.breakEvenUnits).toBe(200);
    expect(result.contributionMargin).toBe(25);
    expect(result.isViable).toBe(true);
  });
});

describe('calculate_depreciation', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes straight-line depreciation', async () => {
    const result = await executeTool('calculate_depreciation', {
      assetCost: 50000,
      salvageValue: 5000,
      usefulLifeYears: 5,
      method: 'straight-line',
    }, ctx(db));

    expect(result.annualDepreciation).toBe(9000);
    expect((result.schedule as unknown[]).length).toBe(5);
    expect(result.depreciableBase).toBe(45000);
  });
});

describe('calculate_rent_vs_buy', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes comparison with yearly snapshots', async () => {
    const result = await executeTool('calculate_rent_vs_buy', {
      monthlyRent: 2000,
      homePrice: 400000,
    }, ctx(db));

    const snapshots = result.yearlySnapshots as unknown[];
    expect(snapshots.length).toBeGreaterThan(0);
    expect(['rent', 'buy', 'neutral']).toContain(result.recommendation);
    expect(result.finalHomeValue).toBeGreaterThan(0);
  });
});

describe('calculate_debt_payoff', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('computes avalanche strategy', async () => {
    const result = await executeTool('calculate_debt_payoff', {
      strategy: 'avalanche',
      extraMonthlyBudget: 200,
      debts: [
        { name: 'CC', balance: 5000, annualInterestRate: 18, minimumPayment: 100 },
      ],
    }, ctx(db));

    expect(result.totalMonths).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect((result.debtResults as unknown[]).length).toBe(1);
  });
});

// ─── safeExecuteTool — Safety Guardrails ─────────────────────────────

describe('safeExecuteTool — input validation', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('rejects empty tool name', async () => {
    const result = await safeExecuteTool('', {}, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toBe('Invalid tool name');
  });

  it('rejects non-object input', async () => {
    const result = await safeExecuteTool('get_workspace_summary', 'not an object' as unknown as Record<string, unknown>, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toContain('Invalid tool input');
  });

  it('rejects invalid UUID for itemId', async () => {
    await insertWorkspace(db);
    const result = await safeExecuteTool('get_item_data', { itemId: 'not-a-uuid' }, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toContain('Invalid itemId');
  });

  it('rejects invalid type for create_canvas_item', async () => {
    await insertWorkspace(db);
    const result = await safeExecuteTool('create_canvas_item', { type: 'not-real' }, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toContain('Invalid item type');
  });
});

describe('safeExecuteTool — error handling', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('catches executor errors and returns isError', async () => {
    const result = await safeExecuteTool('nonexistent_tool', {}, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toBe('Internal error executing tool. Please try again or use a different approach.');
  });

  it('does not expose stack traces or internal details', async () => {
    const result = await safeExecuteTool('nonexistent_tool', {}, ctx(db));
    const errorStr = JSON.stringify(result.result);
    expect(errorStr).not.toContain('Unknown tool');
    expect(errorStr).not.toContain('.ts');
    expect(errorStr).not.toContain('.js');
    expect(errorStr).not.toContain('at ');
  });
});

describe('safeExecuteTool — vault data filtering', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('redacts encrypted data from tool results', async () => {
    await insertWorkspace(db);
    const longBase64 = 'A'.repeat(250);
    const vaultData = JSON.stringify({ name: 'My Secret', ciphertext: 'abc123encrypted', iv: 'xyz789iv', payload: longBase64 });
    const itemId = crypto.randomUUID();
    await insertCanvasItem(db, { id: itemId, type: 'secret-card', name: 'Secret', data: vaultData });

    const result = await safeExecuteTool('get_item_data', { itemId }, ctx(db));
    expect(result.isError).toBe(false);
    const data = (result.result.data as Record<string, unknown>);
    expect(data.ciphertext).toBe('[encrypted — not accessible via AI]');
    expect(data.iv).toBe('[encrypted — not accessible via AI]');
    expect(data.payload).toBe('[encrypted — not accessible via AI]');
    expect(data.name).toBe('My Secret');
  });

  it('does not redact normal data', async () => {
    await insertWorkspace(db);
    const normalData = JSON.stringify({ name: 'Checking', balance: 5000 });
    const itemId = crypto.randomUUID();
    await insertCanvasItem(db, { id: itemId, type: 'account-card', name: 'Account', data: normalData });

    const result = await safeExecuteTool('get_item_data', { itemId }, ctx(db));
    expect(result.isError).toBe(false);
    const data = (result.result.data as Record<string, unknown>);
    expect(data.name).toBe('Checking');
    expect(data.balance).toBe(5000);
  });
});

describe('safeExecuteTool — logging', () => {
  let db: TestDb;
  beforeEach(() => { db = createTestDb(); });

  it('logs tool execution start and completion', async () => {
    await insertWorkspace(db);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await safeExecuteTool('get_workspace_summary', {}, ctx(db));

    expect(logSpy).toHaveBeenCalledWith('[AI Tool] Executing:', 'get_workspace_summary', expect.any(Object));
    expect(logSpy).toHaveBeenCalledWith('[AI Tool]', 'get_workspace_summary', 'completed in', expect.stringMatching(/\d+ms/));

    logSpy.mockRestore();
  });

  it('logs tool execution errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await safeExecuteTool('nonexistent_tool', {}, ctx(db));

    expect(errorSpy).toHaveBeenCalledWith('[AI Tool]', 'nonexistent_tool', 'failed in', expect.stringMatching(/\d+ms/), expect.any(Object));

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('search_documents', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
    mockSearchDocuments.mockReset();
  });

  it('tool is registered in definitions', () => {
    const defs = getToolDefinitions();
    const tool = defs.find((d) => d.name === 'search_documents');
    expect(tool).toBeDefined();
    expect(tool!.input_schema.required).toContain('query');
  });

  it('returns formatted results with fileName, content, and score', async () => {
    mockSearchDocuments.mockResolvedValue([
      { chunkId: 'c1', fileId: 'f1', fileName: 'report.pdf', content: 'Revenue was $1.2M', chunkIndex: 0, score: 0.9537 },
      { chunkId: 'c2', fileId: 'f1', fileName: 'report.pdf', content: 'Expenses totaled $800K', chunkIndex: 1, score: 0.8214 },
    ]);

    const result = await executeTool('search_documents', { query: 'revenue' }, ctx(db));
    expect(result.results).toHaveLength(2);
    const results = result.results as any[];
    expect(results[0].fileName).toBe('report.pdf');
    expect(results[0].content).toBe('Revenue was $1.2M');
    expect(results[0].score).toBe(0.954); // rounded to 3dp
    expect(results[1].score).toBe(0.821);
  });

  it('returns message when no results', async () => {
    mockSearchDocuments.mockResolvedValue([]);

    const result = await executeTool('search_documents', { query: 'nothing here' }, ctx(db));
    expect(result.results).toEqual([]);
    expect(result.message).toContain('No matching documents');
  });

  it('handles embedding API errors gracefully', async () => {
    mockSearchDocuments.mockRejectedValue(new Error('OPENAI_API_KEY is not set'));

    const result = await executeTool('search_documents', { query: 'test' }, ctx(db));
    expect(result.results).toEqual([]);
    expect(result.message).toContain('not available');
  });

  it('rejects empty query', async () => {
    const result = await executeTool('search_documents', { query: '' }, ctx(db));
    expect(result.error).toContain('non-empty');
  });
});
