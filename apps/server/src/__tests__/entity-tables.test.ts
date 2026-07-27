import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { entities, entityEdges, entityMentions } from '../db/schema';

const ENTITY_TABLES_SQL = `
  CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    mention_count INTEGER NOT NULL DEFAULT 0,
    rejected_merges TEXT NOT NULL DEFAULT '[]',
    merged_into TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE entity_mentions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    snippet TEXT,
    confidence REAL NOT NULL,
    amount REAL,
    date INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE entity_edges (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    from_entity_id TEXT NOT NULL,
    to_entity_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
`;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(ENTITY_TABLES_SQL);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

describe('entities table', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves an entity with all fields', async () => {
    await db.insert(entities).values({
      id: 'e1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'merchant',
      canonicalName: 'Amazon',
      normalizedName: 'amazon',
      aliases: JSON.stringify(['AMZN Mktp US', 'Amazon.com']),
      mentionCount: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = await db.select().from(entities).where(eq(entities.id, 'e1'));
    expect(rows).toHaveLength(1);
    const e = rows[0]!;
    expect(e.canonicalName).toBe('Amazon');
    expect(e.normalizedName).toBe('amazon');
    expect(JSON.parse(e.aliases)).toEqual(['AMZN Mktp US', 'Amazon.com']);
    expect(e.mentionCount).toBe(5);
  });

  it('defaults aliases to empty JSON array and mentionCount to 0', async () => {
    await db.insert(entities).values({
      id: 'e1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'person',
      canonicalName: 'Jane Doe',
      normalizedName: 'jane doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = await db.select().from(entities).where(eq(entities.id, 'e1'));
    expect(JSON.parse(rows[0]!.aliases)).toEqual([]);
    expect(rows[0]!.mentionCount).toBe(0);
  });

  it('scopes queries by workspaceId', async () => {
    const base = {
      userId: 'user-1',
      type: 'merchant',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(entities).values([
      { ...base, id: 'e1', workspaceId: 'ws-1', canonicalName: 'A', normalizedName: 'a' },
      { ...base, id: 'e2', workspaceId: 'ws-2', canonicalName: 'B', normalizedName: 'b' },
    ]);

    const rows = await db.select().from(entities).where(eq(entities.workspaceId, 'ws-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('e1');
  });
});

describe('entity_mentions table', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts mentions for both document and structured sources', async () => {
    await db.insert(entityMentions).values([
      {
        id: 'm1',
        entityId: 'e1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        sourceType: 'chunk',
        sourceId: 'chunk-1',
        snippet: 'paid Amazon $52.00 on July 3',
        confidence: 0.95,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        entityId: 'e1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        sourceType: 'transaction',
        sourceId: 'txn-9',
        snippet: null,
        confidence: 1,
        createdAt: new Date(),
      },
    ]);

    const rows = await db.select().from(entityMentions).where(eq(entityMentions.entityId, 'e1'));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sourceType).sort()).toEqual(['chunk', 'transaction']);
    expect(rows.find((r) => r.id === 'm2')!.snippet).toBeNull();
  });

  it('retrieves mentions by entityId only for that entity', async () => {
    const base = {
      workspaceId: 'ws-1',
      userId: 'user-1',
      sourceType: 'chunk',
      confidence: 0.9,
      createdAt: new Date(),
    };
    await db.insert(entityMentions).values([
      { ...base, id: 'm1', entityId: 'e1', sourceId: 'c1' },
      { ...base, id: 'm2', entityId: 'e2', sourceId: 'c2' },
    ]);

    const rows = await db.select().from(entityMentions).where(eq(entityMentions.entityId, 'e2'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceId).toBe('c2');
  });
});

describe('entity_edges table', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves an edge with evidence mention ids', async () => {
    await db.insert(entityEdges).values({
      id: 'edge1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      fromEntityId: 'e1',
      toEntityId: 'e2',
      relationship: 'pays',
      evidence: JSON.stringify(['m1', 'm2']),
      createdAt: new Date(),
    });

    const rows = await db.select().from(entityEdges).where(eq(entityEdges.id, 'edge1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.relationship).toBe('pays');
    expect(JSON.parse(rows[0]!.evidence)).toEqual(['m1', 'm2']);
  });

  it('finds edges from a given entity', async () => {
    const base = { workspaceId: 'ws-1', userId: 'user-1', createdAt: new Date() };
    await db.insert(entityEdges).values([
      { ...base, id: 'g1', fromEntityId: 'e1', toEntityId: 'e2', relationship: 'pays' },
      { ...base, id: 'g2', fromEntityId: 'e2', toEntityId: 'e3', relationship: 'account at' },
    ]);

    const rows = await db.select().from(entityEdges).where(eq(entityEdges.fromEntityId, 'e1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.toEntityId).toBe('e2');
  });
});
