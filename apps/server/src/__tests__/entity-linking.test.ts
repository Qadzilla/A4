import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import {
  accounts,
  entities,
  entityMentions,
  invoices,
  jobs,
  receipts,
  subscriptions,
  transactions,
} from '../db/schema';
import { enqueueLinkStructuredData, linkStructuredData } from '../services/entity-linking';
import { JOB_TYPES } from '../services/job-queue';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      type TEXT NOT NULL, canonical_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]', mention_count INTEGER NOT NULL DEFAULT 0,
      rejected_merges TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE entity_mentions (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, snippet TEXT, confidence REAL NOT NULL,
      amount REAL, date INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE entity_edges (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL, to_entity_id TEXT NOT NULL, relationship TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      date TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL,
      category_id TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE receipts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      date TEXT NOT NULL, merchant TEXT NOT NULL, amount REAL NOT NULL, tax REAL NOT NULL,
      payment_method TEXT NOT NULL, category_id TEXT, status TEXT NOT NULL,
      linked_file_id TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      name TEXT NOT NULL, amount REAL NOT NULL, frequency TEXT NOT NULL,
      start_date TEXT NOT NULL, next_billing_date TEXT NOT NULL, category_id TEXT,
      status TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      name TEXT NOT NULL, institution TEXT NOT NULL, type TEXT NOT NULL, balance REAL NOT NULL,
      group_id TEXT, last_updated TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL, date TEXT NOT NULL, due_date TEXT NOT NULL,
      from_name TEXT, from_address TEXT, from_email TEXT, to_name TEXT, to_address TEXT, to_email TEXT,
      tax_rate REAL NOT NULL, notes TEXT, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3, last_error TEXT, run_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

const base = {
  workspaceId: 'ws-1',
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function insertEntity(
  db: TestDb,
  id: string,
  canonicalName: string,
  opts: { type?: string; aliases?: string[] } = {},
) {
  await db.insert(entities).values({
    ...base,
    id,
    type: opts.type ?? 'merchant',
    canonicalName,
    normalizedName: canonicalName.toLowerCase(),
    aliases: JSON.stringify(opts.aliases ?? []),
  });
}

async function insertTxn(db: TestDb, id: string, description: string, amount = 10) {
  await db.insert(transactions).values({
    ...base,
    id,
    date: '2026-07-03',
    description,
    amount,
    type: 'expense',
  });
}

describe('linkStructuredData', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('links transactions to existing entities through the merchant normalizer', async () => {
    await insertEntity(db, 'e-bb', 'Blue Bottle Coffee');
    await insertTxn(db, 't1', 'SQ *BLUE BOTTLE COFFEE', 6.5);

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.entityId).toBe('e-bb');
    expect(mentions[0]!.sourceType).toBe('transaction');
    expect(mentions[0]!.sourceId).toBe('t1');
    expect(mentions[0]!.amount).toBe(6.5);
    expect(mentions[0]!.date?.toISOString().slice(0, 10)).toBe('2026-07-03');
  });

  it('links through entity aliases', async () => {
    await insertEntity(db, 'e-amz', 'Amazon', { aliases: ['AMZN Mktp US'] });
    await insertTxn(db, 't1', 'AMZN Mktp US');

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.entityId).toBe('e-amz');
  });

  it('creates new entities for unmatched names with the right type per source', async () => {
    await insertTxn(db, 't1', 'Corner Bakery');
    await db.insert(accounts).values({
      ...base,
      id: 'a1',
      name: 'Everyday Checking',
      institution: 'Chase',
      type: 'checking',
      balance: 1000,
    });
    await db.insert(invoices).values({
      ...base,
      id: 'i1',
      invoiceNumber: 'INV-1',
      date: '2026-07-01',
      dueDate: '2026-07-31',
      toName: 'Acme LLC',
      taxRate: 0,
      status: 'sent',
    });

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const all = await db.select().from(entities);
    expect(all).toHaveLength(3);
    const byName = new Map(all.map((e) => [e.canonicalName, e.type]));
    expect(byName.get('Corner Bakery')).toBe('merchant');
    expect(byName.get('Chase')).toBe('institution');
    expect(byName.get('Acme LLC')).toBe('organization');

    const mentions = await db.select().from(entityMentions);
    expect(mentions.map((m) => m.sourceType).sort()).toEqual(['account', 'invoice', 'transaction']);
  });

  it('links receipts and subscriptions as merchant mentions', async () => {
    await db.insert(receipts).values({
      ...base,
      id: 'r1',
      date: '2026-07-02',
      merchant: 'Home Depot',
      amount: 84.2,
      tax: 6.2,
      paymentMethod: 'card',
      status: 'pending',
    });
    await db.insert(subscriptions).values({
      ...base,
      id: 's1',
      name: 'Netflix',
      amount: 15.49,
      frequency: 'monthly',
      startDate: '2026-01-01',
      nextBillingDate: '2026-08-01',
      status: 'active',
    });

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    expect(mentions.map((m) => m.sourceType).sort()).toEqual(['receipt', 'subscription']);
    const receiptMention = mentions.find((m) => m.sourceType === 'receipt')!;
    expect(receiptMention.amount).toBe(84.2);
  });

  it('is a full rebuild — rerunning does not duplicate, and deleted rows unlink', async () => {
    await insertTxn(db, 't1', 'Corner Bakery');
    await insertTxn(db, 't2', 'Corner Bakery');

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);
    expect(await db.select().from(entityMentions)).toHaveLength(2);
    const [entity] = await db.select().from(entities);
    expect(entity!.mentionCount).toBe(2);

    await db.delete(transactions).where(eq(transactions.id, 't2'));
    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.sourceId).toBe('t1');
    const refreshed = await db.select().from(entities);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]!.mentionCount).toBe(1);
  });

  it('prunes entities whose only source rows were deleted', async () => {
    await insertTxn(db, 't1', 'One Time Shop');
    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);
    expect(await db.select().from(entities)).toHaveLength(1);

    await db.delete(transactions).where(eq(transactions.id, 't1'));
    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    expect(await db.select().from(entities)).toHaveLength(0);
    expect(await db.select().from(entityMentions)).toHaveLength(0);
  });

  it('never touches chunk mentions', async () => {
    await insertEntity(db, 'e1', 'Amazon');
    await db.insert(entityMentions).values({
      id: 'm-chunk',
      entityId: 'e1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      sourceType: 'chunk',
      sourceId: 'c1',
      snippet: 'doc mention',
      confidence: 0.9,
      createdAt: new Date(),
    });

    await linkStructuredData({ workspaceId: 'ws-1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.id).toBe('m-chunk');
  });

  it('rejects payloads without a workspaceId', async () => {
    await expect(linkStructuredData({}, db as never)).rejects.toThrow('workspaceId');
  });
});

describe('enqueueLinkStructuredData', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('enqueues once and debounces duplicates per workspace', async () => {
    await enqueueLinkStructuredData('ws-1', db as never);
    await enqueueLinkStructuredData('ws-1', db as never);
    await enqueueLinkStructuredData('ws-2', db as never);

    const rows = await db.select().from(jobs);
    expect(rows).toHaveLength(2);
    expect(rows.every((j) => j.type === JOB_TYPES.linkStructured)).toBe(true);
  });
});
