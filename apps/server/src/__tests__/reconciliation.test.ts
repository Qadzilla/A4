import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { documentChunks, entities, entityMentions, transactions } from '../db/schema';
import { findUnmatchedTransactions } from '../services/reconciliation';

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
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      date TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL,
      category_id TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL, content TEXT NOT NULL, token_count INTEGER NOT NULL,
      embedding BLOB NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

const base = { workspaceId: 'ws-1', userId: 'user-1', createdAt: new Date() };

async function seedEntity(db: TestDb, id: string, name: string) {
  await db.insert(entities).values({
    ...base,
    id,
    type: 'merchant',
    canonicalName: name,
    normalizedName: name.toLowerCase(),
    updatedAt: new Date(),
  });
}

async function seedTxn(
  db: TestDb,
  id: string,
  entityId: string | null,
  amount: number,
  date = '2026-07-03',
) {
  await db.insert(transactions).values({
    ...base,
    id,
    date,
    description: `txn ${id}`,
    amount,
    type: 'expense',
    updatedAt: new Date(),
  });
  if (entityId) {
    await db.insert(entityMentions).values({
      ...base,
      id: `tm-${id}`,
      entityId,
      sourceType: 'transaction',
      sourceId: id,
      snippet: null,
      confidence: 1,
      amount,
      date: new Date(`${date}T00:00:00Z`),
    });
  }
}

async function seedDocMention(
  db: TestDb,
  id: string,
  entityId: string,
  amount: number,
  date: string | null = '2026-07-03',
  chunkId = 'c1',
  fileId = 'f1',
) {
  const existing = await db.select().from(documentChunks);
  if (!existing.some((c) => c.id === chunkId)) {
    await db.insert(documentChunks).values({
      ...base,
      id: chunkId,
      fileId,
      chunkIndex: 0,
      content: 'statement text',
      tokenCount: 5,
      embedding: Buffer.from(new Float32Array([0]).buffer),
    });
  }
  await db.insert(entityMentions).values({
    ...base,
    id,
    entityId,
    sourceType: 'chunk',
    sourceId: chunkId,
    snippet: `charge of $${amount}`,
    confidence: 0.9,
    amount,
    date: date ? new Date(`${date}T00:00:00Z`) : null,
  });
}

describe('findUnmatchedTransactions', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('matches entity + amount + date within the window', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0, '2026-07-03');
    await seedDocMention(db, 'm1', 'e1', 52.0, '2026-07-05'); // 2 days apart

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedDocumentMentions).toHaveLength(0);
    expect(result.unmatchedTransactions).toHaveLength(0);
  });

  it('surfaces statement lines missing from the ledger', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedDocMention(db, 'm1', 'e1', 52.0);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.unmatchedDocumentMentions).toHaveLength(1);
    expect(result.unmatchedDocumentMentions[0]!.entityName).toBe('Amazon');
    expect(result.unmatchedDocumentMentions[0]!.amount).toBe(52.0);
  });

  it('surfaces ledger entries missing from the documents', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.unmatchedTransactions).toHaveLength(1);
    expect(result.unmatchedTransactions[0]!.transactionId).toBe('t1');
  });

  it('does not match when amounts differ beyond the tolerance', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0);
    await seedDocMention(db, 'm1', 'e1', 57.0);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedDocumentMentions).toHaveLength(1);
    expect(result.unmatchedTransactions).toHaveLength(1);
  });

  it('matches within a cent and across sign conventions', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0);
    await seedDocMention(db, 'm1', 'e1', -52.005);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(1);
  });

  it('does not match dates outside the posting window', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0, '2026-07-03');
    await seedDocMention(db, 'm1', 'e1', 52.0, '2026-07-10'); // 7 days apart

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(0);
  });

  it('matches on entity + amount alone when the mention has no date', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0, '2026-01-15');
    await seedDocMention(db, 'm1', 'e1', 52.0, null);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(1);
  });

  it('does not match across different entities', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedEntity(db, 'e2', 'Netflix');
    await seedTxn(db, 't1', 'e2', 52.0);
    await seedDocMention(db, 'm1', 'e1', 52.0);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(0);
  });

  it('matches greedily one-to-one — one transaction cannot satisfy two statement lines', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0);
    await seedDocMention(db, 'm1', 'e1', 52.0);
    await seedDocMention(db, 'm2', 'e1', 52.0, '2026-07-03', 'c2');

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedDocumentMentions).toHaveLength(1);
  });

  it('scopes document mentions to a single file when fileId is given', async () => {
    await seedEntity(db, 'e1', 'Amazon');
    await seedTxn(db, 't1', 'e1', 52.0);
    await seedDocMention(db, 'm-other', 'e1', 99.0, '2026-07-03', 'c-other', 'f-other');

    const result = await findUnmatchedTransactions('ws-1', db as never, 'f1');
    // f1 has no chunks → nothing to compare
    expect(result.unmatchedDocumentMentions).toHaveLength(0);
    expect(result.matchedCount).toBe(0);

    const otherFile = await findUnmatchedTransactions('ws-1', db as never, 'f-other');
    expect(otherFile.unmatchedDocumentMentions).toHaveLength(1);
    expect(otherFile.unmatchedTransactions).toHaveLength(1);
  });

  it('reports transactions with no entity link as unmatched with a null entityId', async () => {
    await seedTxn(db, 't-unlinked', null, 20.0);

    const result = await findUnmatchedTransactions('ws-1', db as never);
    expect(result.unmatchedTransactions).toHaveLength(1);
    expect(result.unmatchedTransactions[0]!.entityId).toBeNull();
  });
});
