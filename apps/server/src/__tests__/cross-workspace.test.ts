import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { verifyWorkspaceAccess, dispatchWorkspaceQuery } from '../services/cross-workspace';
import { executeTool } from '../services/ai-tools';
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
    CREATE TABLE workspace_insights (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      conversation_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      summary TEXT,
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

function insertWorkspace(db: TestDb, overrides: Partial<{ id: string; name: string; userId: string; type: string; description: string }> = {}) {
  const { id = 'ws-1', name = 'Personal Finance', userId = 'user-1', type = 'workspace', description } = overrides;
  return db.insert(schema.workspaces).values({ id, name, userId, type, description, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
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

describe('verifyWorkspaceAccess', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns true when user owns the workspace', async () => {
    await insertWorkspace(db, { id: 'ws-1', userId: 'user-1' });
    const result = await verifyWorkspaceAccess(db, 'user-1', 'ws-1');
    expect(result).toBe(true);
  });

  it('returns false when user does not own the workspace', async () => {
    await insertWorkspace(db, { id: 'ws-1', userId: 'user-2' });
    const result = await verifyWorkspaceAccess(db, 'user-1', 'ws-1');
    expect(result).toBe(false);
  });

  it('returns false for non-existent workspace', async () => {
    const result = await verifyWorkspaceAccess(db, 'user-1', 'ws-nonexistent');
    expect(result).toBe(false);
  });
});

describe('dispatchWorkspaceQuery', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('dispatches account query for balance-related questions', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertAccount(db, { name: 'Chase Checking', balance: 5000, workspaceId: 'ws-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'What is my account balance?');
    expect(result).toContain("Data from workspace 'Personal'");
    expect(result).toContain('Chase Checking');
    expect(result).toContain('5000');
  });

  it('dispatches budget query for spending-related questions', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertBudgetCategory(db, { name: 'Groceries', budgeted: 500, actual: 400, workspaceId: 'ws-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'How much am I spending?');
    expect(result).toContain("Data from workspace 'Personal'");
    expect(result).toContain('Groceries');
  });

  it('dispatches multiple tools for multi-topic questions', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertAccount(db, { name: 'Savings', balance: 10000, workspaceId: 'ws-1' });
    await insertDebt(db, { name: 'Car Loan', balance: 15000, workspaceId: 'ws-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'Show me my account balance and debt');
    expect(result).toContain('Savings');
    expect(result).toContain('Car Loan');
  });

  it('falls back to workspace summary when no keywords match', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertAccount(db, { name: 'Checking', balance: 3000, workspaceId: 'ws-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'Give me an overview');
    expect(result).toContain("Data from workspace 'Personal'");
    // Should contain workspace summary data
    expect(result).toContain('Checking');
  });

  it('handles workspace with no data gracefully', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Empty', userId: 'user-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'What is my balance?');
    expect(result).toContain("Data from workspace 'Empty'");
  });

  it('keyword matching is case-insensitive', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertAccount(db, { name: 'Main Account', balance: 7500, workspaceId: 'ws-1' });

    const result = await dispatchWorkspaceQuery(db, 'user-1', 'ws-1', 'Show me my ACCOUNT BALANCE');
    expect(result).toContain('Main Account');
  });
});

describe('list_workspaces tool execution', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns all workspaces for the user', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal Finance', userId: 'user-1', description: 'My personal finances' });
    await insertWorkspace(db, { id: 'ws-2', name: 'Business', userId: 'user-1', description: 'LLC finances' });
    await insertWorkspace(db, { id: 'ws-3', name: 'Other User WS', userId: 'user-2' });

    const ctx: ToolContext = { db, userId: 'user-1', workspaceId: 'ws-1' };
    const result = await executeTool('list_workspaces', {}, ctx);

    const ws = result.workspaces as Array<{ id: string; name: string; type: string; description: string | null }>;
    expect(ws).toHaveLength(2);
    expect(ws.map((w) => w.name)).toContain('Personal Finance');
    expect(ws.map((w) => w.name)).toContain('Business');
    expect(ws.map((w) => w.name)).not.toContain('Other User WS');
  });
});

describe('query_workspace tool execution', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns data from target workspace', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Current', userId: 'user-1' });
    await insertWorkspace(db, { id: 'ws-2', name: 'Other', userId: 'user-1' });
    await insertAccount(db, { name: 'Other Checking', balance: 9000, workspaceId: 'ws-2' });

    const ctx: ToolContext = { db, userId: 'user-1', workspaceId: 'ws-1' };
    const result = await executeTool('query_workspace', { workspace_id: 'ws-2', question: 'What is my account balance?' }, ctx);

    expect(result.result).toContain("Data from workspace 'Other'");
    expect(result.result).toContain('Other Checking');
  });

  it('returns error for workspace user does not own', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Mine', userId: 'user-1' });
    await insertWorkspace(db, { id: 'ws-2', name: 'Not Mine', userId: 'user-2' });

    const ctx: ToolContext = { db, userId: 'user-1', workspaceId: 'ws-1' };
    const result = await executeTool('query_workspace', { workspace_id: 'ws-2', question: 'Show me data' }, ctx);

    expect(result.error).toBe("You don't have access to that workspace.");
  });
});
