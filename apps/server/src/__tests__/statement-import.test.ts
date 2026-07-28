import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { accounts, aiUsage, files, holdings } from '../db/schema';

vi.mock('../services/anthropic', () => ({
  structuredCompletion: vi.fn(),
}));
vi.mock('../services/storage', () => ({
  storage: { get: vi.fn().mockResolvedValue(Buffer.from('statement-bytes')) },
}));
vi.mock('../services/text-extraction', () => ({
  extractText: vi.fn().mockResolvedValue('SYMBOL,QTY,VALUE\nVOO,10,4500'),
}));

import { structuredCompletion } from '../services/anthropic';
import { importStatement } from '../services/statement-import';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL, file_size INTEGER NOT NULL, mime_type TEXT NOT NULL,
      extension TEXT NOT NULL, storage_path TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE holdings (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      symbol TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, target_pct REAL NOT NULL,
      quantity REAL, cost_basis REAL, acquired_at TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      name TEXT NOT NULL, institution TEXT NOT NULL, type TEXT NOT NULL, balance REAL NOT NULL,
      group_id TEXT, last_updated TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE ai_usage (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT, model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cost_cents INTEGER,
      byok INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function seedFile(db: TestDb, id = 'f1') {
  await db.insert(files).values({
    id,
    userId: 'user-1',
    workspaceId: 'ws-1',
    fileName: 'statement.csv',
    fileSize: 1000,
    mimeType: 'text/csv',
    extension: 'csv',
    storagePath: `uploads/${id}.csv`,
    createdAt: new Date(),
  });
}

function mockImport(result: object, tokens = { input: 2000, output: 400 }) {
  vi.mocked(structuredCompletion).mockResolvedValue({
    data: result,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  });
}

const FIDELITY_RESULT = {
  institution: 'Fidelity',
  positions: [
    {
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      value: 4500,
      quantity: 10,
      costBasis: 4000,
      acquiredAt: '2025-03-10',
    },
    {
      symbol: 'aapl',
      name: 'Apple Inc',
      value: 1500,
      quantity: 8,
      costBasis: null,
      acquiredAt: null,
    },
  ],
  cashBalance: 250.5,
};

describe('importStatement', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(structuredCompletion).mockReset();
  });

  it('creates holdings and a cash-only brokerage account', async () => {
    mockImport(FIDELITY_RESULT);
    await seedFile(db);

    await importStatement({ fileId: 'f1' }, db as never);

    const rows = await db.select().from(holdings);
    expect(rows).toHaveLength(2);
    const voo = rows.find((h) => h.symbol === 'VOO');
    expect(voo).toMatchObject({
      value: 4500,
      quantity: 10,
      costBasis: 4000,
      targetPct: 0,
      acquiredAt: '2025-03-10',
    });
    // Symbols normalize to uppercase
    expect(rows.find((h) => h.symbol === 'AAPL')).toBeDefined();

    const accts = await db.select().from(accounts);
    expect(accts).toHaveLength(1);
    expect(accts[0]).toMatchObject({
      institution: 'Fidelity',
      type: 'brokerage-cash',
      balance: 250.5, // cash only — never the positions total
    });
  });

  it('updates existing holdings by symbol instead of duplicating', async () => {
    mockImport(FIDELITY_RESULT);
    await seedFile(db);
    await db.insert(holdings).values({
      id: 'h-existing',
      workspaceId: 'ws-1',
      userId: 'user-1',
      symbol: 'VOO',
      name: 'Old Name',
      value: 4000,
      targetPct: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await importStatement({ fileId: 'f1' }, db as never);

    const rows = await db.select().from(holdings);
    expect(rows).toHaveLength(2); // VOO updated, AAPL created
    const voo = rows.find((h) => h.symbol === 'VOO');
    expect(voo?.id).toBe('h-existing');
    expect(voo?.value).toBe(4500);
    expect(voo?.targetPct).toBe(60); // user's target survives the refresh
  });

  it('re-running updates the same cash account instead of duplicating', async () => {
    mockImport(FIDELITY_RESULT);
    await seedFile(db);

    await importStatement({ fileId: 'f1' }, db as never);
    mockImport({ ...FIDELITY_RESULT, cashBalance: 300 });
    await importStatement({ fileId: 'f1' }, db as never);

    const accts = await db.select().from(accounts);
    expect(accts).toHaveLength(1);
    expect(accts[0]?.balance).toBe(300);
  });

  it('handles statements with no institution or cash gracefully', async () => {
    mockImport({ institution: null, positions: FIDELITY_RESULT.positions, cashBalance: null });
    await seedFile(db);

    await importStatement({ fileId: 'f1' }, db as never);

    expect(await db.select().from(holdings)).toHaveLength(2);
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it('throws on invalid extraction output so the job retries', async () => {
    mockImport({ nonsense: true });
    await seedFile(db);

    await expect(importStatement({ fileId: 'f1' }, db as never)).rejects.toThrow(
      'failed validation',
    );
  });

  it('meters the extraction spend', async () => {
    mockImport(FIDELITY_RESULT, { input: 5000, output: 800 });
    await seedFile(db);

    await importStatement({ fileId: 'f1' }, db as never);

    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.inputTokens).toBe(5000);
  });

  it('is a no-op for a deleted file and rejects bad payloads', async () => {
    await expect(importStatement({ fileId: 'missing' }, db as never)).resolves.toBeUndefined();
    await expect(importStatement({}, db as never)).rejects.toThrow('fileId');
    expect(structuredCompletion).not.toHaveBeenCalled();
  });
});
