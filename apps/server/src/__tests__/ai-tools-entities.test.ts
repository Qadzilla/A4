import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { documentChunks, entities, entityEdges, entityMentions, transactions } from '../db/schema';
import { buildEntitiesSection } from '../services/ai-context';
import { type ToolContext, executeTool } from '../services/ai-tools';

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
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL, content TEXT NOT NULL, token_count INTEGER NOT NULL,
      embedding BLOB NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

function ctx(db: TestDb, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    db: db as unknown as ToolContext['db'],
    userId: 'user-1',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

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
  opts: { type?: string; mentionCount?: number; aliases?: string[]; workspaceId?: string } = {},
) {
  await db.insert(entities).values({
    ...base,
    workspaceId: opts.workspaceId ?? 'ws-1',
    id,
    type: opts.type ?? 'merchant',
    canonicalName,
    normalizedName: canonicalName.toLowerCase(),
    aliases: JSON.stringify(opts.aliases ?? []),
    mentionCount: opts.mentionCount ?? 1,
  });
}

async function insertEdge(db: TestDb, id: string, from: string, to: string, relationship: string) {
  await db.insert(entityEdges).values({
    ...base,
    id,
    fromEntityId: from,
    toEntityId: to,
    relationship,
  });
}

describe('search_entities', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('finds entities by partial name, ordered by mention count', async () => {
    await insertEntity(db, 'e1', 'Amazon', { mentionCount: 5 });
    await insertEntity(db, 'e2', 'Amazon Web Services', { mentionCount: 9 });
    await insertEntity(db, 'e3', 'Netflix', { mentionCount: 3 });

    const result = await executeTool('search_entities', { query: 'amazon' }, ctx(db));
    const found = result.entities as Array<{ entityId: string; name: string }>;
    expect(found).toHaveLength(2);
    expect(found[0]!.name).toBe('Amazon Web Services'); // more mentions first
  });

  it('matches through aliases', async () => {
    await insertEntity(db, 'e1', 'Amazon', { aliases: ['AMZN Mktp US'] });

    const result = await executeTool('search_entities', { query: 'amzn' }, ctx(db));
    expect(result.entities as unknown[]).toHaveLength(1);
  });

  it('filters by type and lists top entities on empty query', async () => {
    await insertEntity(db, 'e1', 'Amazon', { type: 'merchant', mentionCount: 5 });
    await insertEntity(db, 'e2', 'Chase', { type: 'institution', mentionCount: 8 });

    const result = await executeTool(
      'search_entities',
      { query: '', type: 'institution' },
      ctx(db),
    );
    const found = result.entities as Array<{ name: string }>;
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('Chase');
  });

  it('includes sample sources with each entity', async () => {
    await insertEntity(db, 'e1', 'Amazon');
    await db.insert(entityMentions).values({
      ...base,
      id: 'm1',
      entityId: 'e1',
      sourceType: 'chunk',
      sourceId: 'c1',
      snippet: 'AMZN charge $52.00',
      confidence: 0.9,
    });

    const result = await executeTool('search_entities', { query: 'amazon' }, ctx(db));
    const found = result.entities as Array<{ sampleSources: Array<{ snippet: string | null }> }>;
    expect(found[0]!.sampleSources).toHaveLength(1);
    expect(found[0]!.sampleSources[0]!.snippet).toBe('AMZN charge $52.00');
  });

  it('scopes to the workspace and returns a helpful empty message', async () => {
    await insertEntity(db, 'e-other', 'Amazon', { workspaceId: 'ws-other' });

    const result = await executeTool('search_entities', { query: 'amazon' }, ctx(db));
    expect(result.entities as unknown[]).toHaveLength(0);
    expect(result.message).toContain('No matching entities');
  });
});

describe('get_entity_connections', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns direct connections at depth 1', async () => {
    await insertEntity(db, 'e-amz', 'Amazon');
    await insertEntity(db, 'e-acct', 'checking ...8842', { type: 'account_ref' });
    await insertEntity(db, 'e-chase', 'Chase', { type: 'institution' });
    await insertEdge(db, 'g1', 'e-amz', 'e-acct', 'charged to');
    await insertEdge(db, 'g2', 'e-acct', 'e-chase', 'account at');

    const result = await executeTool('get_entity_connections', { entityId: 'e-amz' }, ctx(db));
    const nodes = result.nodes as Array<{ id: string }>;
    const edges = result.edges as Array<{ relationship: string }>;
    expect(nodes.map((n) => n.id).sort()).toEqual(['e-acct', 'e-amz']);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.relationship).toBe('charged to');
  });

  it('follows second-degree connections at depth 2', async () => {
    await insertEntity(db, 'e-amz', 'Amazon');
    await insertEntity(db, 'e-acct', 'checking ...8842', { type: 'account_ref' });
    await insertEntity(db, 'e-chase', 'Chase', { type: 'institution' });
    await insertEdge(db, 'g1', 'e-amz', 'e-acct', 'charged to');
    await insertEdge(db, 'g2', 'e-acct', 'e-chase', 'account at');

    const result = await executeTool(
      'get_entity_connections',
      { entityId: 'e-amz', depth: 2 },
      ctx(db),
    );
    const nodes = result.nodes as Array<{ id: string }>;
    expect(nodes.map((n) => n.id).sort()).toEqual(['e-acct', 'e-amz', 'e-chase']);
    expect(result.edges as unknown[]).toHaveLength(2);
  });

  it('errors on unknown or out-of-workspace entity ids', async () => {
    await insertEntity(db, 'e-other', 'Amazon', { workspaceId: 'ws-other' });

    const result = await executeTool('get_entity_connections', { entityId: 'e-other' }, ctx(db));
    expect(result.error).toContain('Entity not found');
  });

  it('handles an entity with no connections', async () => {
    await insertEntity(db, 'e-lonely', 'Solo Shop');

    const result = await executeTool('get_entity_connections', { entityId: 'e-lonely' }, ctx(db));
    expect(result.nodes as unknown[]).toHaveLength(1);
    expect(result.edges as unknown[]).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });
});

describe('find_unmatched_transactions tool', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('reports both directions of mismatch with formatted dates', async () => {
    await insertEntity(db, 'e1', 'Amazon');
    // Ledger transaction linked to the entity
    await db.insert(transactions).values({
      ...base,
      id: 't1',
      date: '2026-07-03',
      description: 'AMZN Mktp',
      amount: 52.0,
      type: 'expense',
    });
    await db.insert(entityMentions).values({
      ...base,
      id: 'tm1',
      entityId: 'e1',
      sourceType: 'transaction',
      sourceId: 't1',
      snippet: null,
      confidence: 1,
      amount: 52.0,
    });
    // Document mention with a different amount → both sides unmatched
    await db.insert(documentChunks).values({
      ...base,
      id: 'c1',
      fileId: 'f1',
      chunkIndex: 0,
      content: 'statement',
      tokenCount: 5,
      embedding: Buffer.from(new Float32Array([0]).buffer),
    });
    await db.insert(entityMentions).values({
      ...base,
      id: 'm1',
      entityId: 'e1',
      sourceType: 'chunk',
      sourceId: 'c1',
      snippet: 'charge $99.00',
      confidence: 0.9,
      amount: 99.0,
      date: new Date('2026-07-03T00:00:00Z'),
    });

    const result = await executeTool('find_unmatched_transactions', {}, ctx(db));
    expect(result.matchedCount).toBe(0);

    const docSide = result.inDocumentsNotInLedger as Array<{ entityName: string; date: string }>;
    expect(docSide).toHaveLength(1);
    expect(docSide[0]!.entityName).toBe('Amazon');
    expect(docSide[0]!.date).toBe('2026-07-03');

    const ledgerSide = result.inLedgerNotInDocuments as Array<{ transactionId: string }>;
    expect(ledgerSide).toHaveLength(1);
    expect(ledgerSide[0]!.transactionId).toBe('t1');
  });

  it('counts matches and respects the fileId scope', async () => {
    await insertEntity(db, 'e1', 'Amazon');
    await db.insert(transactions).values({
      ...base,
      id: 't1',
      date: '2026-07-03',
      description: 'AMZN Mktp',
      amount: 52.0,
      type: 'expense',
    });
    await db.insert(entityMentions).values({
      ...base,
      id: 'tm1',
      entityId: 'e1',
      sourceType: 'transaction',
      sourceId: 't1',
      snippet: null,
      confidence: 1,
      amount: 52.0,
    });
    await db.insert(documentChunks).values({
      ...base,
      id: 'c1',
      fileId: 'f1',
      chunkIndex: 0,
      content: 'statement',
      tokenCount: 5,
      embedding: Buffer.from(new Float32Array([0]).buffer),
    });
    await db.insert(entityMentions).values({
      ...base,
      id: 'm1',
      entityId: 'e1',
      sourceType: 'chunk',
      sourceId: 'c1',
      snippet: 'charge $52.00',
      confidence: 0.9,
      amount: 52.0,
      date: new Date('2026-07-04T00:00:00Z'),
    });

    const result = await executeTool('find_unmatched_transactions', { fileId: 'f1' }, ctx(db));
    expect(result.matchedCount).toBe(1);
    expect(result.inDocumentsNotInLedger as unknown[]).toHaveLength(0);
    expect(result.inLedgerNotInDocuments as unknown[]).toHaveLength(0);
  });
});

describe('buildEntitiesSection', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('lists top entities by mention count with tool guidance', async () => {
    await insertEntity(db, 'e1', 'Amazon', { mentionCount: 5 });
    await insertEntity(db, 'e2', 'Chase', { type: 'institution', mentionCount: 8 });

    const section = await buildEntitiesSection(db as never, 'user-1', 'ws-1');
    expect(section).toContain('### Known entities');
    expect(section.indexOf('Chase')).toBeLessThan(section.indexOf('Amazon'));
    expect(section).toContain('search_entities');
  });

  it('returns empty when the workspace has no entities', async () => {
    expect(await buildEntitiesSection(db as never, 'user-1', 'ws-1')).toBe('');
  });

  it('caps the list at 15 entities', async () => {
    for (let i = 0; i < 20; i++) {
      await insertEntity(db, `e${i}`, `Merchant ${i}`, { mentionCount: i });
    }
    const section = await buildEntitiesSection(db as never, 'user-1', 'ws-1');
    const count = (section.match(/Merchant \d+/g) ?? []).length;
    expect(count).toBe(15);
  });
});
