import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { aiUsage, entities, entityEdges, entityMentions, jobs } from '../db/schema';

vi.mock('../services/anthropic', () => ({
  structuredCompletion: vi.fn(),
}));
vi.mock('../services/embedding', () => ({
  embedTexts: vi.fn(),
}));

import { structuredCompletion } from '../services/anthropic';
import { embedTexts } from '../services/embedding';
import {
  enqueueResolveEntities,
  mergeEntities,
  normalizeMerchantString,
  resolveEntities,
} from '../services/entity-resolution';
import { JOB_TYPES } from '../services/job-queue';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
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
    CREATE TABLE ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_cents INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      run_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function insertEntity(
  db: TestDb,
  id: string,
  canonicalName: string,
  opts: {
    type?: string;
    mentionCount?: number;
    aliases?: string[];
    rejectedMerges?: string[];
    normalizedName?: string;
  } = {},
) {
  await db.insert(entities).values({
    id,
    workspaceId: 'ws-1',
    userId: 'user-1',
    type: opts.type ?? 'merchant',
    canonicalName,
    normalizedName: opts.normalizedName ?? canonicalName.toLowerCase(),
    aliases: JSON.stringify(opts.aliases ?? []),
    mentionCount: opts.mentionCount ?? 0,
    rejectedMerges: JSON.stringify(opts.rejectedMerges ?? []),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertMention(db: TestDb, id: string, entityId: string, snippet: string | null) {
  await db.insert(entityMentions).values({
    id,
    entityId,
    workspaceId: 'ws-1',
    userId: 'user-1',
    sourceType: 'chunk',
    sourceId: `c-${id}`,
    snippet,
    confidence: 0.9,
    createdAt: new Date(),
  });
}

/** Maps entity index → embedding so similarity between pairs is controllable. */
function mockEmbeddings(vectors: number[][]) {
  vi.mocked(embedTexts).mockResolvedValue(vectors.map((v) => new Float32Array(v)));
}

function mockVerdict(same: boolean, confidence = 0.95) {
  vi.mocked(structuredCompletion).mockResolvedValue({
    data: { same, confidence },
    inputTokens: 200,
    outputTokens: 20,
  });
}

describe('normalizeMerchantString', () => {
  const cases: Array<[string, string]> = [
    ['SQ *BLUE BOTTLE COFFEE', 'blue bottle coffee'],
    ['TST* JOES PIZZA #421', 'joes pizza'],
    ['PAYPAL *SPOTIFYUSA', 'spotifyusa'],
    ['AMZN Mktp US*R2D4X', 'amzn mktp us'],
    ['Amazon.com', 'amazon'],
    ['NETFLIX.COM', 'netflix'],
    ['STARBUCKS #08421 SEATTLE', 'starbucks seattle'],
    ['Shell Oil 57442199', 'shell oil'],
    ['  Whole   Foods  ', 'whole foods'],
    ['7-Eleven', '7-eleven'],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes "${input}" → "${expected}"`, () => {
      expect(normalizeMerchantString(input)).toBe(expected);
    });
  }

  it('falls back to basic normalization when stripping consumes everything', () => {
    expect(normalizeMerchantString('#12345')).toBe('#12345');
  });
});

describe('mergeEntities', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('repoints mentions, unions aliases, recounts, and deletes the loser', async () => {
    await insertEntity(db, 'winner', 'Amazon', { aliases: ['AMAZON'], mentionCount: 2 });
    await insertEntity(db, 'loser', 'AMZN Mktp US', { aliases: ['AMZN MKTP'], mentionCount: 1 });
    await insertMention(db, 'm1', 'winner', 'a');
    await insertMention(db, 'm2', 'winner', 'b');
    await insertMention(db, 'm3', 'loser', 'c');

    await mergeEntities('winner', ['loser'], db as never);

    const all = await db.select().from(entities);
    expect(all).toHaveLength(1);
    const winner = all[0]!;
    expect(winner.id).toBe('winner');
    expect(winner.mentionCount).toBe(3);
    expect(JSON.parse(winner.aliases).sort()).toEqual(['AMAZON', 'AMZN MKTP', 'AMZN Mktp US']);

    const mentions = await db.select().from(entityMentions);
    expect(mentions.every((m) => m.entityId === 'winner')).toBe(true);
  });

  it('repoints edges, removes self-edges, and dedupes with evidence union', async () => {
    await insertEntity(db, 'winner', 'Amazon');
    await insertEntity(db, 'loser', 'AMZN');
    await insertEntity(db, 'chase', 'Chase Bank', { type: 'institution' });
    const edgeBase = { workspaceId: 'ws-1', userId: 'user-1', createdAt: new Date() };
    await db.insert(entityEdges).values([
      // Duplicate-once-merged edges with different evidence
      {
        ...edgeBase,
        id: 'g1',
        fromEntityId: 'winner',
        toEntityId: 'chase',
        relationship: 'charged to',
        evidence: JSON.stringify(['m1']),
      },
      {
        ...edgeBase,
        id: 'g2',
        fromEntityId: 'loser',
        toEntityId: 'chase',
        relationship: 'charged to',
        evidence: JSON.stringify(['m2']),
      },
      // Will become a self-edge after repointing
      {
        ...edgeBase,
        id: 'g3',
        fromEntityId: 'winner',
        toEntityId: 'loser',
        relationship: 'same as',
        evidence: '[]',
      },
    ]);

    await mergeEntities('winner', ['loser'], db as never);

    const edges = await db.select().from(entityEdges);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.fromEntityId).toBe('winner');
    expect(edges[0]!.toEntityId).toBe('chase');
    expect(JSON.parse(edges[0]!.evidence).sort()).toEqual(['m1', 'm2']);
  });
});

describe('resolveEntities', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(structuredCompletion).mockReset();
    vi.mocked(embedTexts).mockReset();
  });

  it('Tier 1: merges merchants sharing a normalized merchant string, keeping the most-mentioned', async () => {
    await insertEntity(db, 'e-sq', 'SQ *BLUE BOTTLE COFFEE', { mentionCount: 1 });
    await insertEntity(db, 'e-plain', 'Blue Bottle Coffee', { mentionCount: 4 });
    vi.mocked(embedTexts).mockRejectedValue(new Error('no key')); // isolate Tier 1

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);

    const all = await db.select().from(entities);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('e-plain');
    expect(JSON.parse(all[0]!.aliases)).toContain('SQ *BLUE BOTTLE COFFEE');
  });

  it('Tier 2: auto-merges non-person pairs at very high similarity without the LLM', async () => {
    await insertEntity(db, 'e1', 'Amazon', { mentionCount: 3 });
    await insertEntity(db, 'e2', 'Amazon.com Inc', { mentionCount: 1 });
    mockEmbeddings([
      [1, 0, 0],
      [0.999, 0.04, 0], // cosine ≈ 0.999 ≥ 0.97
    ]);

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);

    expect(await db.select().from(entities)).toHaveLength(1);
    expect(structuredCompletion).not.toHaveBeenCalled();
  });

  it('Tier 3: merges mid-similarity pairs when the LLM says same', async () => {
    await insertEntity(db, 'e1', 'AMZN Mktp US', { mentionCount: 1 });
    await insertEntity(db, 'e2', 'Amazon', { mentionCount: 5 });
    await insertMention(db, 'm1', 'e1', 'AMZN Mktp US*R2 charge $52.00');
    await insertMention(db, 'm2', 'e2', 'Amazon order confirmation');
    mockEmbeddings([
      [1, 0.5, 0],
      [1, 0.1, 0], // cosine ≈ 0.934 — candidate but below auto-merge
    ]);
    mockVerdict(true, 0.95);

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);

    const all = await db.select().from(entities);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('e2'); // most mentions wins
    expect(structuredCompletion).toHaveBeenCalledOnce();

    // Adjudication spend metered
    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0]!.model).toBe('claude-haiku-4-5');
  });

  it('Tier 3: records rejections and never re-adjudicates the pair', async () => {
    await insertEntity(db, 'e1', 'Chase Bank', { type: 'institution' });
    await insertEntity(db, 'e2', 'Chase Auto Finance', { type: 'institution' });
    mockEmbeddings([
      [1, 0.5, 0],
      [1, 0.1, 0],
    ]);
    mockVerdict(false);

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);
    expect(await db.select().from(entities)).toHaveLength(2);
    expect(structuredCompletion).toHaveBeenCalledTimes(1);

    const [e1] = await db.select().from(entities).where(eq(entities.id, 'e1'));
    expect(JSON.parse(e1!.rejectedMerges)).toContain('e2');

    // Second run: same candidates, but the rejection short-circuits the LLM
    await resolveEntities({ workspaceId: 'ws-1' }, db as never);
    expect(structuredCompletion).toHaveBeenCalledTimes(1);
    expect(await db.select().from(entities)).toHaveLength(2);
  });

  it('never auto-merges people on similarity alone', async () => {
    await insertEntity(db, 'p1', 'J. Smith', { type: 'person' });
    await insertEntity(db, 'p2', 'John Smith', { type: 'person' });
    mockEmbeddings([
      [1, 0, 0],
      [0.999, 0.04, 0], // ≥ 0.97 — would auto-merge for a merchant
    ]);
    mockVerdict(false);

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);

    // LLM was consulted and said no → both survive
    expect(structuredCompletion).toHaveBeenCalledOnce();
    expect(await db.select().from(entities)).toHaveLength(2);
  });

  it('ignores low-confidence "same" verdicts', async () => {
    await insertEntity(db, 'e1', 'Delta', { mentionCount: 1 });
    await insertEntity(db, 'e2', 'Delta Dental', { mentionCount: 1 });
    mockEmbeddings([
      [1, 0.5, 0],
      [1, 0.1, 0],
    ]);
    mockVerdict(true, 0.5); // below 0.8 threshold

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);
    expect(await db.select().from(entities)).toHaveLength(2);
  });

  it('does not pair entities of different types', async () => {
    await insertEntity(db, 'e1', 'Chase', { type: 'merchant' });
    await insertEntity(db, 'e2', 'Chase', { type: 'institution', normalizedName: 'chase ' });
    mockEmbeddings([
      [1, 0, 0],
      [1, 0, 0],
    ]);

    await resolveEntities({ workspaceId: 'ws-1' }, db as never);
    expect(await db.select().from(entities)).toHaveLength(2);
    expect(structuredCompletion).not.toHaveBeenCalled();
  });

  it('skips Tiers 2-3 when the embedding service is unavailable', async () => {
    await insertEntity(db, 'e1', 'Amazon');
    await insertEntity(db, 'e2', 'Amazon.com Inc');
    vi.mocked(embedTexts).mockRejectedValue(new Error('OPENAI_API_KEY missing'));

    await expect(resolveEntities({ workspaceId: 'ws-1' }, db as never)).resolves.toBeUndefined();
    expect(await db.select().from(entities)).toHaveLength(2);
    expect(structuredCompletion).not.toHaveBeenCalled();
  });

  it('rejects payloads without a workspaceId', async () => {
    await expect(resolveEntities({}, db as never)).rejects.toThrow('workspaceId');
  });
});

describe('enqueueResolveEntities', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('enqueues a resolve job for the workspace', async () => {
    await enqueueResolveEntities('ws-1', db as never);

    const rows = await db.select().from(jobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe(JOB_TYPES.resolveEntities);
    expect(JSON.parse(rows[0]!.payload)).toEqual({ workspaceId: 'ws-1' });
  });

  it('debounces when an identical pending job exists', async () => {
    await enqueueResolveEntities('ws-1', db as never);
    await enqueueResolveEntities('ws-1', db as never);
    expect(await db.select().from(jobs)).toHaveLength(1);
  });

  it('still enqueues for a different workspace', async () => {
    await enqueueResolveEntities('ws-1', db as never);
    await enqueueResolveEntities('ws-2', db as never);
    expect(await db.select().from(jobs)).toHaveLength(2);
  });
});
