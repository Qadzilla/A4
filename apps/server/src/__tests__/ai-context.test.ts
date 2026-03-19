import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { buildWorkspaceContext, buildDocumentContext, buildInsightsSection, buildConversationMemorySection, buildWorkspaceListSection, SYSTEM_PREAMBLE } from '../services/ai-context';

vi.mock('../services/vector-search', () => ({
  searchDocuments: vi.fn().mockResolvedValue([]),
}));

import { searchDocuments } from '../services/vector-search';
const mockSearchDocuments = searchDocuments as ReturnType<typeof vi.fn>;

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
  `);
  return drizzle(sqlite, { schema });
}

const NOW = Date.now();

function insertWorkspace(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; name: string; userId: string; type: string; description: string }> = {}) {
  const { id = 'ws-1', name = 'Personal Finance 2026', userId = 'user-1', type = 'workspace', description } = overrides;
  return db.insert(schema.workspaces).values({ id, name, userId, type, description, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
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

function insertInsight(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; workspaceId: string; userId: string; type: string; severity: string; title: string; summary: string; data: string | null; status: string; conversationId: string | null; createdAt: Date; expiresAt: Date | null }> = {}) {
  const { id = crypto.randomUUID(), workspaceId = 'ws-1', userId = 'user-1', type = 'budget_overspend', severity = 'warning', title = 'Test Insight', summary = 'Test summary', data = null, status = 'active', conversationId = null, createdAt = new Date(NOW), expiresAt = null } = overrides;
  return db.insert(schema.workspaceInsights).values({ id, workspaceId, userId, type, severity, title, summary, data, status, conversationId, createdAt, expiresAt });
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

describe('SYSTEM_PREAMBLE — reasoning patterns', () => {
  it('includes Complex analysis patterns section', () => {
    expect(SYSTEM_PREAMBLE).toContain('## Complex analysis patterns');
  });

  it('includes all 4 reasoning patterns', () => {
    expect(SYSTEM_PREAMBLE).toContain('### "Can I afford X?" pattern');
    expect(SYSTEM_PREAMBLE).toContain('### "Compare options" pattern');
    expect(SYSTEM_PREAMBLE).toContain('### "Cross-workspace totals" pattern');
    expect(SYSTEM_PREAMBLE).toContain('### "Financial health check" pattern');
  });

  it('references cross-workspace tools in patterns', () => {
    expect(SYSTEM_PREAMBLE).toContain('list_workspaces');
    expect(SYSTEM_PREAMBLE).toContain('query_workspace');
  });

  it('references scenario comparison tool', () => {
    expect(SYSTEM_PREAMBLE).toContain('create_scenario_comparison');
  });
});

describe('buildDocumentContext', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns formatted document section with numbered citations', async () => {
    mockSearchDocuments.mockResolvedValueOnce([
      { chunkId: 'c1', fileId: 'f1', fileName: 'bank.pdf', content: 'Transaction on 2024-01-15 for $500', chunkIndex: 0, score: 0.92 },
    ]);

    const result = await buildDocumentContext('what transactions did I have?', 'ws-1', db);

    expect(result.section).toContain('## Relevant Documents');
    expect(result.section).toContain('[1] bank.pdf (relevance: 92%)');
    expect(result.section).toContain('Transaction on 2024-01-15');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.index).toBe(1);
    expect(result.citations[0]!.fileId).toBe('f1');
    expect(result.citations[0]!.fileName).toBe('bank.pdf');
  });

  it('returns empty section when no results', async () => {
    mockSearchDocuments.mockResolvedValueOnce([]);

    const result = await buildDocumentContext('anything', 'ws-1', db);

    expect(result.section).toBe('');
    expect(result.citations).toEqual([]);
  });

  it('numbers citations sequentially across multiple results', async () => {
    mockSearchDocuments.mockResolvedValueOnce([
      { chunkId: 'c1', fileId: 'f1', fileName: 'bank.pdf', content: 'Chunk 1', chunkIndex: 0, score: 0.95 },
      { chunkId: 'c2', fileId: 'f1', fileName: 'bank.pdf', content: 'Chunk 2', chunkIndex: 1, score: 0.88 },
      { chunkId: 'c3', fileId: 'f2', fileName: 'expenses.csv', content: 'Chunk 3', chunkIndex: 0, score: 0.82 },
    ]);

    const result = await buildDocumentContext('expenses', 'ws-1', db);

    expect(result.citations).toHaveLength(3);
    expect(result.citations[0]!.index).toBe(1);
    expect(result.citations[1]!.index).toBe(2);
    expect(result.citations[2]!.index).toBe(3);
    expect(result.section).toContain('[1]');
    expect(result.section).toContain('[2]');
    expect(result.section).toContain('[3]');
  });

  it('truncates to token budget', async () => {
    const longContent = 'x'.repeat(2000);
    mockSearchDocuments.mockResolvedValueOnce([
      { chunkId: 'c1', fileId: 'f1', fileName: 'a.pdf', content: longContent, chunkIndex: 0, score: 0.95 },
      { chunkId: 'c2', fileId: 'f2', fileName: 'b.pdf', content: longContent, chunkIndex: 0, score: 0.90 },
      { chunkId: 'c3', fileId: 'f3', fileName: 'c.pdf', content: longContent, chunkIndex: 0, score: 0.85 },
      { chunkId: 'c4', fileId: 'f4', fileName: 'd.pdf', content: longContent, chunkIndex: 0, score: 0.80 },
      { chunkId: 'c5', fileId: 'f5', fileName: 'e.pdf', content: longContent, chunkIndex: 0, score: 0.75 },
    ]);

    const result = await buildDocumentContext('query', 'ws-1', db);

    // Should truncate — not all 5 chunks should fit in 8000 chars
    expect(result.section.length).toBeLessThanOrEqual(8500);
    expect(result.citations.length).toBeLessThan(5);
  });

  it('returns empty on searchDocuments error', async () => {
    mockSearchDocuments.mockRejectedValueOnce(new Error('Embedding API down'));

    const result = await buildDocumentContext('query', 'ws-1', db);

    expect(result.section).toBe('');
    expect(result.citations).toEqual([]);
  });
});

describe('buildInsightsSection', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns formatted insights grouped by severity', async () => {
    await insertInsight(db, { severity: 'critical', title: 'Cash low', summary: 'Balance below $500' });
    await insertInsight(db, { severity: 'warning', title: 'Budget exceeded', summary: 'Dining over by $180' });
    await insertInsight(db, { severity: 'warning', title: 'Subscription spike', summary: 'Monthly subs up 20%' });
    await insertInsight(db, { severity: 'info', title: 'Savings milestone', summary: 'Emergency fund at 3 months' });

    const result = await buildInsightsSection(db, 'user-1', 'ws-1');

    expect(result).toContain('## Active financial insights');
    expect(result).toContain('### Critical');
    expect(result).toContain('- **Cash low**: Balance below $500');
    expect(result).toContain('### Warning');
    expect(result).toContain('- **Budget exceeded**: Dining over by $180');
    expect(result).toContain('- **Subscription spike**: Monthly subs up 20%');
    expect(result).toContain('### Info');
    expect(result).toContain('- **Savings milestone**: Emergency fund at 3 months');
  });

  it('returns empty string when no active insights', async () => {
    const result = await buildInsightsSection(db, 'user-1', 'ws-1');
    expect(result).toBe('');
  });

  it('excludes dismissed insights', async () => {
    await insertInsight(db, { severity: 'warning', title: 'Active one', summary: 'Still relevant', status: 'active' });
    await insertInsight(db, { severity: 'warning', title: 'Dismissed one', summary: 'No longer relevant', status: 'dismissed' });

    const result = await buildInsightsSection(db, 'user-1', 'ws-1');

    expect(result).toContain('Active one');
    expect(result).not.toContain('Dismissed one');
  });

  it('excludes expired insights', async () => {
    const past = new Date(Date.now() - 86400000); // 1 day ago
    const future = new Date(Date.now() + 86400000); // 1 day from now

    await insertInsight(db, { severity: 'warning', title: 'Still valid', summary: 'Not expired', expiresAt: future });
    await insertInsight(db, { severity: 'warning', title: 'Old news', summary: 'Already expired', expiresAt: past });

    const result = await buildInsightsSection(db, 'user-1', 'ws-1');

    expect(result).toContain('Still valid');
    expect(result).not.toContain('Old news');
  });

  it('omits severity headings with zero insights', async () => {
    await insertInsight(db, { severity: 'warning', title: 'Warn 1', summary: 'Warning one' });
    await insertInsight(db, { severity: 'warning', title: 'Warn 2', summary: 'Warning two' });

    const result = await buildInsightsSection(db, 'user-1', 'ws-1');

    expect(result).toContain('### Warning');
    expect(result).not.toContain('### Critical');
    expect(result).not.toContain('### Info');
  });
});

function insertConversation(db: ReturnType<typeof createTestDb>, overrides: Partial<{ id: string; title: string; summary: string | null; workspaceId: string; userId: string; updatedAt: Date }> = {}) {
  const { id = crypto.randomUUID(), title = 'Test conversation', summary = null, workspaceId = 'ws-1', userId = 'user-1', updatedAt = new Date(NOW) } = overrides;
  return db.insert(schema.conversations).values({ id, title, summary, workspaceId, userId, model: 'claude-sonnet-4-6', createdAt: new Date(NOW), updatedAt });
}

describe('buildWorkspaceContext — with insights', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('includes insights section in full context', async () => {
    await insertWorkspace(db);
    await insertInsight(db, { severity: 'critical', title: 'Cash critically low', summary: 'Only $200 remaining' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');

    expect(result).toContain('## Active financial insights');
    expect(result).toContain('**Cash critically low**');
  });

  it('omits insights section when none active', async () => {
    await insertWorkspace(db);

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');

    expect(result).not.toContain('## Active financial insights');
  });
});

describe('buildConversationMemorySection', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns formatted section with summarized conversations', async () => {
    await insertConversation(db, { id: 'c1', title: 'Budget review', summary: 'Discussed Q1 budget allocations.' });
    await insertConversation(db, { id: 'c2', title: 'Tax planning', summary: 'Reviewed estimated tax payments for 2026.' });
    await insertConversation(db, { id: 'c3', title: 'Investment check', summary: 'Analyzed portfolio performance and rebalancing.' });
    await insertConversation(db, { id: 'c4', title: 'No summary yet', summary: null });

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'current-convo');

    expect(result).toContain('## Prior conversation context');
    expect(result).toContain('Budget review');
    expect(result).toContain('Tax planning');
    expect(result).toContain('Investment check');
    expect(result).not.toContain('No summary yet');
  });

  it('excludes current conversation', async () => {
    await insertConversation(db, { id: 'c1', title: 'First', summary: 'Summary one.' });
    await insertConversation(db, { id: 'c2', title: 'Second', summary: 'Summary two.' });
    await insertConversation(db, { id: 'c3', title: 'Current', summary: 'Summary three.' });

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'c3');

    expect(result).toContain('First');
    expect(result).toContain('Second');
    expect(result).not.toContain('Current');
  });

  it('returns empty string when no summarized conversations exist', async () => {
    await insertConversation(db, { id: 'c1', summary: null });
    await insertConversation(db, { id: 'c2', summary: null });

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'other');

    expect(result).toBe('');
  });

  it('limits to 5 most recent conversations', async () => {
    for (let i = 0; i < 8; i++) {
      await insertConversation(db, {
        id: `c${i}`,
        title: `Convo ${i}`,
        summary: `Summary for conversation ${i}.`,
        updatedAt: new Date(NOW - i * 3600000),
      });
    }

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'current');

    const bulletCount = (result.match(/^- \*\*/gm) ?? []).length;
    expect(bulletCount).toBe(5);
  });

  it('respects 2000 character budget', async () => {
    for (let i = 0; i < 5; i++) {
      await insertConversation(db, {
        id: `c${i}`,
        title: `Long conversation ${i}`,
        summary: `${'This is a detailed summary with lots of financial information. '.repeat(12)}End.`,
        updatedAt: new Date(NOW - i * 3600000),
      });
    }

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'current');

    const bulletCount = (result.match(/^- \*\*/gm) ?? []).length;
    expect(bulletCount).toBeGreaterThanOrEqual(2);
    expect(bulletCount).toBeLessThan(5);
  });

  it('orders by updatedAt descending — most recent first', async () => {
    await insertConversation(db, { id: 'c-old', title: 'Oldest', summary: 'Old convo.', updatedAt: new Date(NOW - 86400000 * 3) });
    await insertConversation(db, { id: 'c-mid', title: 'Middle', summary: 'Mid convo.', updatedAt: new Date(NOW - 86400000) });
    await insertConversation(db, { id: 'c-new', title: 'Newest', summary: 'New convo.', updatedAt: new Date(NOW) });

    const result = await buildConversationMemorySection(db, 'user-1', 'ws-1', 'current');

    const newestIdx = result.indexOf('Newest');
    const middleIdx = result.indexOf('Middle');
    const oldestIdx = result.indexOf('Oldest');
    expect(newestIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(oldestIdx);
  });
});

describe('buildWorkspaceContext — with conversation memory', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('includes conversation memory section when currentConversationId provided', async () => {
    await insertWorkspace(db);
    await insertConversation(db, { id: 'c1', title: 'Past chat', summary: 'Discussed savings goals.' });
    await insertConversation(db, { id: 'c2', title: 'Another chat', summary: 'Reviewed monthly expenses.' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1', 'current-id');

    expect(result).toContain('## Prior conversation context');
    expect(result).toContain('Past chat');
    expect(result).toContain('Another chat');
  });

  it('omits conversation memory section when currentConversationId not provided', async () => {
    await insertWorkspace(db);
    await insertConversation(db, { id: 'c1', title: 'Past chat', summary: 'Discussed savings goals.' });
    await insertConversation(db, { id: 'c2', title: 'Another chat', summary: 'Reviewed monthly expenses.' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');

    // The section header "## Prior conversation context" should not appear (the phrase exists in SYSTEM_PREAMBLE but not as a section)
    expect(result).not.toContain('## Prior conversation context');
    expect(result).not.toContain('Discussed savings goals');
  });
});

describe('buildWorkspaceListSection', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    // user-1 has 3 workspaces, user-2 has 1
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal Finance', userId: 'user-1', type: 'workspace', description: 'My personal finances' });
    await insertWorkspace(db, { id: 'ws-2', name: 'Side Business', userId: 'user-1', type: 'workspace', description: 'Freelance income tracking' });
    await insertWorkspace(db, { id: 'ws-3', name: 'Investment Portfolio', userId: 'user-1', type: 'portfolio' });
    await insertWorkspace(db, { id: 'ws-other', name: 'Other User WS', userId: 'user-2', type: 'workspace', description: 'Not mine' });
  });

  it('returns formatted table of other workspaces', async () => {
    const result = await buildWorkspaceListSection(db, 'user-1', 'ws-1');

    expect(result).toContain("## User's other workspaces");
    expect(result).toContain('| Workspace | Type | Description |');
    expect(result).toContain('Side Business (id: ws-2)');
    expect(result).toContain('Investment Portfolio (id: ws-3)');
  });

  it('returns empty string when user has only one workspace', async () => {
    const result = await buildWorkspaceListSection(db, 'user-2', 'ws-other');
    expect(result).toBe('');
  });

  it('excludes current workspace from list', async () => {
    const result = await buildWorkspaceListSection(db, 'user-1', 'ws-1');

    expect(result).not.toContain('Personal Finance (id: ws-1)');
    expect(result).toContain('Side Business (id: ws-2)');
    expect(result).toContain('Investment Portfolio (id: ws-3)');
  });

  it('shows workspace IDs for tool use', async () => {
    const result = await buildWorkspaceListSection(db, 'user-1', 'ws-1');

    expect(result).toContain('id: ws-2');
    expect(result).toContain('id: ws-3');
  });

  it('handles workspaces with no description', async () => {
    const result = await buildWorkspaceListSection(db, 'user-1', 'ws-1');

    expect(result).toContain('Freelance income tracking');
    expect(result).toContain('No description');
  });
});

describe('buildWorkspaceContext — with workspace list', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
  });

  it('includes workspace list section when user has multiple workspaces', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Personal', userId: 'user-1' });
    await insertWorkspace(db, { id: 'ws-2', name: 'Business', userId: 'user-1', description: 'My biz' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');

    expect(result).toContain("## User's other workspaces");
    expect(result).toContain('Business (id: ws-2)');
  });

  it('omits workspace list section when user has one workspace', async () => {
    await insertWorkspace(db, { id: 'ws-1', name: 'Solo', userId: 'user-1' });

    const result = await buildWorkspaceContext(db, 'user-1', 'ws-1');

    expect(result).not.toContain("## User's other workspaces");
  });
});
