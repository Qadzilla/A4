import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { entities, entityEdges, entityMentions } from '../db/schema';
import { entityRouter } from '../trpc/routers/entity';

const WS = '11111111-1111-4111-8111-111111111111';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      type TEXT NOT NULL, canonical_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]', mention_count INTEGER NOT NULL DEFAULT 0,
      rejected_merges TEXT NOT NULL DEFAULT '[]', merged_into TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

function caller(db: TestDb, userId = 'user-1') {
  return entityRouter.createCaller({
    db: db as never,
    auth: { userId, sessionId: 'session-1' },
    userId,
  } as never);
}

const base = { workspaceId: WS, userId: 'user-1', createdAt: new Date(), updatedAt: new Date() };

async function insertEntity(
  db: TestDb,
  id: string,
  canonicalName: string,
  opts: { type?: string; mentionCount?: number; mergedInto?: string; userId?: string } = {},
) {
  await db.insert(entities).values({
    ...base,
    userId: opts.userId ?? 'user-1',
    id,
    type: opts.type ?? 'merchant',
    canonicalName,
    normalizedName: canonicalName.toLowerCase(),
    mentionCount: opts.mentionCount ?? 1,
    mergedInto: opts.mergedInto ?? null,
  });
}

describe('entity router', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('list', () => {
    it('lists live entities ordered by mention count, excluding tombstones', async () => {
      await insertEntity(db, 'e1', 'Amazon', { mentionCount: 3 });
      await insertEntity(db, 'e2', 'Chase', { type: 'institution', mentionCount: 9 });
      await insertEntity(db, 'e-dead', 'AMZN', { mergedInto: 'e1' });

      const result = await caller(db).list({ workspaceId: WS });
      expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
    });

    it('filters by type and query', async () => {
      await insertEntity(db, 'e1', 'Amazon', { mentionCount: 3 });
      await insertEntity(db, 'e2', 'Chase', { type: 'institution', mentionCount: 9 });

      const byType = await caller(db).list({ workspaceId: WS, type: 'institution' });
      expect(byType).toHaveLength(1);
      expect(byType[0]!.canonicalName).toBe('Chase');

      const byQuery = await caller(db).list({ workspaceId: WS, query: 'ama' });
      expect(byQuery).toHaveLength(1);
      expect(byQuery[0]!.canonicalName).toBe('Amazon');
    });

    it('does not return other users entities', async () => {
      await insertEntity(db, 'e-other', 'Amazon', { userId: 'user-2' });
      expect(await caller(db).list({ workspaceId: WS })).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('returns the entity with parsed aliases', async () => {
      await insertEntity(db, 'e1', 'Amazon');
      const result = await caller(db).get({ id: 'e1' });
      expect(result?.canonicalName).toBe('Amazon');
      expect(result?.redirectedFrom).toBeNull();
    });

    it('follows the mergedInto chain to the surviving entity', async () => {
      await insertEntity(db, 'e-winner', 'Amazon', { mentionCount: 5 });
      await insertEntity(db, 'e-dead', 'AMZN', { mergedInto: 'e-winner' });

      const result = await caller(db).get({ id: 'e-dead' });
      expect(result?.id).toBe('e-winner');
      expect(result?.redirectedFrom).toBe('e-dead');
    });

    it('returns null for missing or other-user entities', async () => {
      await insertEntity(db, 'e-other', 'Amazon', { userId: 'user-2' });
      expect(await caller(db).get({ id: 'missing' })).toBeNull();
      expect(await caller(db).get({ id: 'e-other' })).toBeNull();
    });
  });

  describe('getMentions', () => {
    it('returns mentions with a source-type breakdown, following tombstones', async () => {
      await insertEntity(db, 'e-winner', 'Amazon');
      await insertEntity(db, 'e-dead', 'AMZN', { mergedInto: 'e-winner' });
      await db.insert(entityMentions).values([
        {
          ...base,
          id: 'm1',
          entityId: 'e-winner',
          sourceType: 'chunk',
          sourceId: 'c1',
          snippet: 'AMZN $52',
          confidence: 0.9,
        },
        {
          ...base,
          id: 'm2',
          entityId: 'e-winner',
          sourceType: 'transaction',
          sourceId: 't1',
          snippet: null,
          confidence: 1,
        },
      ]);

      const result = await caller(db).getMentions({ id: 'e-dead' });
      expect(result.mentions).toHaveLength(2);
      expect(result.bySourceType).toEqual({ chunk: 1, transaction: 1 });
    });
  });

  describe('getConnections', () => {
    it('walks the graph at the requested depth', async () => {
      await insertEntity(db, 'e-amz', 'Amazon');
      await insertEntity(db, 'e-acct', 'checking ...8842', { type: 'account_ref' });
      await insertEntity(db, 'e-chase', 'Chase', { type: 'institution' });
      await db.insert(entityEdges).values([
        {
          ...base,
          id: 'g1',
          fromEntityId: 'e-amz',
          toEntityId: 'e-acct',
          relationship: 'charged to',
        },
        {
          ...base,
          id: 'g2',
          fromEntityId: 'e-acct',
          toEntityId: 'e-chase',
          relationship: 'account at',
        },
      ]);

      const depth1 = await caller(db).getConnections({ id: 'e-amz' });
      expect(depth1.nodes.map((n) => n.id).sort()).toEqual(['e-acct', 'e-amz']);

      const depth2 = await caller(db).getConnections({ id: 'e-amz', depth: 2 });
      expect(depth2.nodes.map((n) => n.id).sort()).toEqual(['e-acct', 'e-amz', 'e-chase']);
      expect(depth2.edges).toHaveLength(2);
    });
  });
});
