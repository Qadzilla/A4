import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import {
  aiUsage,
  documentChunks,
  entities,
  entityEdges,
  entityMentions,
  files,
} from '../db/schema';

vi.mock('../services/anthropic', () => ({
  structuredCompletion: vi.fn(),
  isByokAnthropicUser: vi.fn(async () => false),
}));

import { structuredCompletion } from '../services/anthropic';
import {
  cleanupMentionsForChunks,
  extractEntitiesFromFile,
  normalizeEntityName,
} from '../services/entity-extraction';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
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
    CREATE TABLE ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_cents INTEGER,
      byok INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function seedFileWithChunks(db: TestDb, contents: string[], fileId = 'f1') {
  await db.insert(files).values({
    id: fileId,
    userId: 'user-1',
    workspaceId: 'ws-1',
    fileName: 'statement.pdf',
    fileSize: 1000,
    mimeType: 'application/pdf',
    extension: 'pdf',
    storagePath: `uploads/${fileId}.pdf`,
    createdAt: new Date(),
  });
  await db.insert(documentChunks).values(
    contents.map((content, i) => ({
      id: `${fileId}-c${i}`,
      fileId,
      workspaceId: 'ws-1',
      userId: 'user-1',
      chunkIndex: i,
      content,
      tokenCount: 10,
      embedding: Buffer.from(new Float32Array([0]).buffer),
      createdAt: new Date(),
    })),
  );
}

function mockExtraction(result: object, tokens = { input: 1000, output: 500 }) {
  vi.mocked(structuredCompletion).mockResolvedValue({
    data: result,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  });
}

const AMAZON_CHASE_RESULT = {
  entities: [
    {
      name: 'AMZN Mktp US',
      type: 'merchant',
      confidence: 0.95,
      snippet: 'AMZN Mktp US $52.00',
    },
    { name: 'Chase Bank', type: 'institution', confidence: 0.98 },
    { name: 'checking ...8842', type: 'account_ref', confidence: 0.9 },
  ],
  relationships: [
    {
      fromName: 'AMZN Mktp US',
      toName: 'checking ...8842',
      relationship: 'charged to',
      confidence: 0.85,
    },
  ],
};

describe('normalizeEntityName', () => {
  it('lowercases, collapses whitespace, and trims', () => {
    expect(normalizeEntityName('  Chase   Bank  ')).toBe('chase bank');
  });
});

describe('extractEntitiesFromFile', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(structuredCompletion).mockReset();
  });

  it('writes entities, mentions, and edges from the model result', async () => {
    mockExtraction(AMAZON_CHASE_RESULT);
    await seedFileWithChunks(db, ['AMZN Mktp US $52.00 via Chase Bank checking ...8842']);

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(3);
    expect(allEntities.map((e) => e.type).sort()).toEqual([
      'account_ref',
      'institution',
      'merchant',
    ]);

    const mentions = await db.select().from(entityMentions);
    expect(mentions).toHaveLength(3);
    expect(mentions.every((m) => m.sourceType === 'chunk')).toBe(true);
    expect(mentions.every((m) => m.sourceId === 'f1-c0')).toBe(true);

    const edges = await db.select().from(entityEdges);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.relationship).toBe('charged to');
    expect(JSON.parse(edges[0]!.evidence)).toHaveLength(2);

    // Denormalized mention counts refreshed
    expect(allEntities.every((e) => e.mentionCount === 1)).toBe(true);
  });

  it('stores stated amounts and dates on mentions, nulling invalid dates', async () => {
    mockExtraction({
      entities: [
        {
          name: 'Amazon',
          type: 'merchant',
          confidence: 0.95,
          amount: 52.0,
          date: '2026-07-03',
        },
        { name: 'Netflix', type: 'merchant', confidence: 0.9, amount: 15.49, date: 'last week' },
        { name: 'Chase Bank', type: 'institution', confidence: 0.9 },
      ],
      relationships: [],
    });
    await seedFileWithChunks(db, ['Amazon $52.00 on 2026-07-03; Netflix $15.49; Chase Bank']);

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    const mentions = await db.select().from(entityMentions);
    const amazon = mentions.find((m) => m.snippet === null && m.amount === 52.0);
    expect(amazon).toBeDefined();
    expect(amazon!.date?.toISOString().slice(0, 10)).toBe('2026-07-03');

    const netflix = mentions.find((m) => m.amount === 15.49);
    expect(netflix!.date).toBeNull(); // "last week" is not a parseable date

    const chase = mentions.find((m) => m.amount === null);
    expect(chase).toBeDefined();
  });

  it('filters entities and relationships below the confidence threshold', async () => {
    mockExtraction({
      entities: [
        { name: 'Netflix', type: 'merchant', confidence: 0.9 },
        { name: 'maybe a person', type: 'person', confidence: 0.3 },
      ],
      relationships: [
        { fromName: 'Netflix', toName: 'maybe a person', relationship: 'pays', confidence: 0.9 },
      ],
    });
    await seedFileWithChunks(db, ['Netflix charge']);

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(1);
    expect(allEntities[0]!.canonicalName).toBe('Netflix');
    // Relationship dropped because one side was filtered out
    expect(await db.select().from(entityEdges)).toHaveLength(0);
  });

  it('is idempotent across re-runs', async () => {
    mockExtraction(AMAZON_CHASE_RESULT);
    await seedFileWithChunks(db, ['AMZN Mktp US $52.00 via Chase Bank checking ...8842']);

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);
    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    expect(await db.select().from(entities)).toHaveLength(3);
    expect(await db.select().from(entityMentions)).toHaveLength(3);
    expect(await db.select().from(entityEdges)).toHaveLength(1);
  });

  it('merges new surface forms into an existing entity as aliases', async () => {
    mockExtraction({
      entities: [{ name: 'Amazon', type: 'merchant', confidence: 0.95 }],
      relationships: [],
    });
    await seedFileWithChunks(db, ['Amazon order']);
    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    // Second file mentions the same entity with different casing
    mockExtraction({
      entities: [{ name: 'AMAZON', type: 'merchant', confidence: 0.95 }],
      relationships: [],
    });
    await seedFileWithChunks(db, ['AMAZON refund'], 'f2');
    await extractEntitiesFromFile({ fileId: 'f2' }, db as never);

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(1);
    expect(allEntities[0]!.canonicalName).toBe('Amazon');
    expect(JSON.parse(allEntities[0]!.aliases)).toEqual(['AMAZON']);
    expect(allEntities[0]!.mentionCount).toBe(2);
  });

  it('batches chunks into multiple model calls', async () => {
    mockExtraction({ entities: [], relationships: [] });
    await seedFileWithChunks(
      db,
      Array.from({ length: 8 }, (_, i) => `chunk content ${i}`),
    );

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);
    // 8 chunks at 6 per batch → 2 calls
    expect(structuredCompletion).toHaveBeenCalledTimes(2);
  });

  it('records aggregated usage with the extraction model', async () => {
    mockExtraction(AMAZON_CHASE_RESULT, { input: 1200, output: 300 });
    await seedFileWithChunks(db, ['AMZN Mktp US']);

    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0]!.model).toBe('claude-haiku-4-5');
    expect(usage[0]!.inputTokens).toBe(1200);
    expect(usage[0]!.outputTokens).toBe(300);
    expect(usage[0]!.conversationId).toBeNull();
    expect(usage[0]!.costCents).toBeGreaterThanOrEqual(0);
  });

  it('throws when the model output fails validation (job will retry)', async () => {
    mockExtraction({ entities: [{ name: 'X', type: 'invalid-type', confidence: 1 }] });
    await seedFileWithChunks(db, ['some content']);

    await expect(extractEntitiesFromFile({ fileId: 'f1' }, db as never)).rejects.toThrow(
      'failed validation',
    );
  });

  it('is a no-op for a deleted file', async () => {
    await expect(
      extractEntitiesFromFile({ fileId: 'missing' }, db as never),
    ).resolves.toBeUndefined();
    expect(structuredCompletion).not.toHaveBeenCalled();
  });

  it('is a no-op for a file with no chunks', async () => {
    await db.insert(files).values({
      id: 'f-empty',
      userId: 'user-1',
      workspaceId: 'ws-1',
      fileName: 'empty.pdf',
      fileSize: 10,
      mimeType: 'application/pdf',
      extension: 'pdf',
      storagePath: 'uploads/f-empty.pdf',
      createdAt: new Date(),
    });

    await extractEntitiesFromFile({ fileId: 'f-empty' }, db as never);
    expect(structuredCompletion).not.toHaveBeenCalled();
  });

  it('rejects payloads without a fileId', async () => {
    await expect(extractEntitiesFromFile({}, db as never)).rejects.toThrow('fileId');
  });
});

describe('cleanupMentionsForChunks', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(structuredCompletion).mockReset();
  });

  it('deletes chunk mentions and prunes zero-mention entities with their edges', async () => {
    mockExtraction(AMAZON_CHASE_RESULT);
    await seedFileWithChunks(db, ['AMZN Mktp US $52.00 via Chase Bank checking ...8842']);
    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    await cleanupMentionsForChunks(['f1-c0'], 'ws-1', db as never);

    expect(await db.select().from(entityMentions)).toHaveLength(0);
    expect(await db.select().from(entities)).toHaveLength(0);
    expect(await db.select().from(entityEdges)).toHaveLength(0);
  });

  it('keeps entities that still have mentions from other sources', async () => {
    mockExtraction({
      entities: [{ name: 'Amazon', type: 'merchant', confidence: 0.95 }],
      relationships: [],
    });
    await seedFileWithChunks(db, ['Amazon order']);
    await extractEntitiesFromFile({ fileId: 'f1' }, db as never);

    const [entity] = await db.select().from(entities);
    // Simulate a structured-data mention (BU-07 will create these for real)
    await db.insert(entityMentions).values({
      id: 'm-txn',
      entityId: entity!.id,
      workspaceId: 'ws-1',
      userId: 'user-1',
      sourceType: 'transaction',
      sourceId: 'txn-1',
      snippet: null,
      confidence: 1,
      createdAt: new Date(),
    });

    await cleanupMentionsForChunks(['f1-c0'], 'ws-1', db as never);

    expect(await db.select().from(entities)).toHaveLength(1);
    const remaining = await db.select().from(entityMentions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.sourceType).toBe('transaction');
  });
});
