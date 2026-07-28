import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { executeTool, getToolDefinitions, safeExecuteTool } from '../services/ai-tools';
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
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      date TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL,
      category_id TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL, file_size INTEGER NOT NULL, mime_type TEXT NOT NULL,
      extension TEXT NOT NULL, storage_path TEXT NOT NULL, created_at INTEGER NOT NULL
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

function insertWorkspace(
  db: TestDb,
  overrides: Partial<{ id: string; name: string; userId: string; type: string }> = {},
) {
  const { id = 'ws-1', name = 'Test Workspace', userId = 'user-1', type = 'workspace' } = overrides;
  return db
    .insert(schema.workspaces)
    .values({ id, name, userId, type, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
}

function insertAccount(
  db: TestDb,
  overrides: Partial<{
    id: string;
    name: string;
    institution: string;
    type: string;
    balance: number;
    workspaceId: string;
    userId: string;
  }> = {},
) {
  const {
    id = crypto.randomUUID(),
    name = 'Checking',
    institution = 'Chase',
    type = 'checking',
    balance = 1000,
    workspaceId = 'ws-1',
    userId = 'user-1',
  } = overrides;
  return db
    .insert(schema.accounts)
    .values({
      id,
      name,
      institution,
      type,
      balance,
      workspaceId,
      userId,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });
}

function insertHolding(
  db: TestDb,
  overrides: Partial<{
    id: string;
    symbol: string;
    name: string;
    value: number;
    targetPct: number;
    workspaceId: string;
    userId: string;
  }> = {},
) {
  const {
    id = crypto.randomUUID(),
    symbol = 'AAPL',
    name = 'Apple Inc',
    value = 5200,
    targetPct = 15,
    workspaceId = 'ws-1',
    userId = 'user-1',
  } = overrides;
  return db
    .insert(schema.holdings)
    .values({
      id,
      symbol,
      name,
      value,
      targetPct,
      workspaceId,
      userId,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });
}

function insertMarketBar(
  db: TestDb,
  overrides: Partial<{
    symbol: string;
    timespan: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = {},
) {
  const {
    symbol = 'AAPL',
    timespan = 'day',
    timestamp = 1709251200,
    open = 180,
    high = 185,
    low = 179,
    close = 183,
    volume = 50000000,
  } = overrides;
  return db
    .insert(schema.marketBars)
    .values({
      symbol,
      timespan,
      multiplier: 1,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      cachedAt: NOW,
    });
}

function ctx(db: TestDb, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    db: db as unknown as ToolContext['db'],
    userId: 'user-1',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('tool registry', () => {
  it('getToolDefinitions returns 17 tools with unique names', () => {
    const defs = getToolDefinitions();
    expect(defs).toHaveLength(10);
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(10);
  });

  it('executeTool throws for unknown tool name', async () => {
    const db = createTestDb();
    await expect(executeTool('nonexistent_tool', {}, ctx(db))).rejects.toThrow(
      'Unknown tool: nonexistent_tool',
    );
  });
});

describe('get_workspace_summary', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('returns workspace info and data counts', async () => {
    await insertWorkspace(db, { name: 'My Finance' });
    await insertAccount(db, { name: 'Checking', balance: 1000 });
    await insertAccount(db, { name: 'Savings', balance: 5000 });
    await insertHolding(db, { symbol: 'VOO', value: 12000 });

    const result = await executeTool('get_workspace_summary', {}, ctx(db));
    expect(result.name).toBe('My Finance');
    expect(result.type).toBe('workspace');
    expect(result.counts).toEqual({
      accounts: 2,
      holdings: 1,
      transactions: 0,
      documents: 0,
    });
  });
});

describe('get_accounts', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

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

describe('get_holdings', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

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

describe('get_market_data', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

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

// ─── Calculation Tool Tests ──────────────────────────────────────────

describe('calculate_tax', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('computes federal tax for single filer', async () => {
    const result = await executeTool(
      'calculate_tax',
      {
        w2Wages: 75000,
        filingStatus: 'single',
        stateCode: 'CA',
      },
      ctx(db),
    );

    expect(result.grossIncome).toBe(75000);
    expect(result.federalTax).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
    expect(result.stateTax).toBeGreaterThan(0);
  });
});

describe('calculate_projection', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('projects investment growth', async () => {
    const result = await executeTool(
      'calculate_projection',
      {
        startingAmount: 10000,
        monthlyContribution: 500,
        annualGrowthRate: 7,
        projectionYears: 10,
      },
      ctx(db),
    );

    expect(result.finalBalance).toBeGreaterThan(result.totalContributions as number);
    expect((result.schedule as unknown[]).length).toBe(10);
  });
});

// ─── safeExecuteTool — Safety Guardrails ─────────────────────────────

describe('safeExecuteTool — input validation', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('rejects empty tool name', async () => {
    const result = await safeExecuteTool('', {}, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toBe('Invalid tool name');
  });

  it('rejects non-object input', async () => {
    const result = await safeExecuteTool(
      'get_workspace_summary',
      'not an object' as unknown as Record<string, unknown>,
      ctx(db),
    );
    expect(result.isError).toBe(true);
    expect(result.result.error).toContain('Invalid tool input');
  });

  it('rejects invalid UUID for itemId', async () => {
    await insertWorkspace(db);
    const result = await safeExecuteTool('get_item_data', { itemId: 'not-a-uuid' }, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toContain('Invalid itemId');
  });
});

describe('safeExecuteTool — error handling', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('catches executor errors and returns isError', async () => {
    const result = await safeExecuteTool('nonexistent_tool', {}, ctx(db));
    expect(result.isError).toBe(true);
    expect(result.result.error).toBe(
      'Internal error executing tool. Please try again or use a different approach.',
    );
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

describe('safeExecuteTool — logging', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });

  it('logs tool execution start and completion', async () => {
    await insertWorkspace(db);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await safeExecuteTool('get_workspace_summary', {}, ctx(db));

    expect(logSpy).toHaveBeenCalledWith(
      '[AI Tool] Executing:',
      'get_workspace_summary',
      expect.any(Object),
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[AI Tool]',
      'get_workspace_summary',
      'completed in',
      expect.stringMatching(/\d+ms/),
    );

    logSpy.mockRestore();
  });

  it('logs tool execution errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await safeExecuteTool('nonexistent_tool', {}, ctx(db));

    expect(errorSpy).toHaveBeenCalledWith(
      '[AI Tool]',
      'nonexistent_tool',
      'failed in',
      expect.stringMatching(/\d+ms/),
      expect.any(Object),
    );

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
      {
        chunkId: 'c1',
        fileId: 'f1',
        fileName: 'report.pdf',
        content: 'Revenue was $1.2M',
        chunkIndex: 0,
        score: 0.9537,
      },
      {
        chunkId: 'c2',
        fileId: 'f1',
        fileName: 'report.pdf',
        content: 'Expenses totaled $800K',
        chunkIndex: 1,
        score: 0.8214,
      },
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
