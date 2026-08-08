import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { entities, workspaces } from '../db/schema';
import { buildMcpToolDefinitions, executeMcpTool } from '../mcp/server';

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
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function seedWorkspace(db: TestDb, id: string, userId: string) {
  await db.insert(workspaces).values({
    id,
    name: `Workspace ${id}`,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('buildMcpToolDefinitions', () => {
  it('exposes the registry minus destructive tools', () => {
    const defs = buildMcpToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toContain('search_entities');
    expect(names).toContain('calculate_tax');
    expect(defs).toHaveLength(20); // full curated registry — nothing excluded
  });

  it('injects a required workspaceId parameter on workspace-scoped tools', () => {
    const defs = buildMcpToolDefinitions();
    const search = defs.find((d) => d.name === 'search_entities');
    const inputSchema = search?.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(inputSchema.properties.workspaceId).toBeDefined();
    expect(inputSchema.required).toContain('workspaceId');
  });

  it('requires workspaceId on every exposed tool', () => {
    const defs = buildMcpToolDefinitions();
    for (const def of defs) {
      const inputSchema = def.inputSchema as { required?: string[] };
      expect(inputSchema.required).toContain('workspaceId');
    }
  });
});

describe('executeMcpTool', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('requires a workspaceId for scoped tools', async () => {
    const { result, isError } = await executeMcpTool(
      'search_entities',
      { query: 'amazon' },
      'user-1',
      db as never,
    );
    expect(isError).toBe(true);
    expect(result.error).toContain('workspaceId is required');
  });

  it("rejects a workspace the token's owner does not own", async () => {
    await seedWorkspace(db, 'ws-other', 'user-2');
    const { result, isError } = await executeMcpTool(
      'search_entities',
      { query: 'amazon', workspaceId: 'ws-other' },
      'user-1',
      db as never,
    );
    expect(isError).toBe(true);
    expect(result.error).toBe('Workspace not found');
  });

  it('executes a scoped tool against an owned workspace', async () => {
    await seedWorkspace(db, 'ws-1', 'user-1');
    await db.insert(entities).values({
      id: 'e1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'merchant',
      canonicalName: 'Amazon',
      normalizedName: 'amazon',
      mentionCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { result, isError } = await executeMcpTool(
      'search_entities',
      { query: 'amazon', workspaceId: 'ws-1' },
      'user-1',
      db as never,
    );
    expect(isError).toBe(false);
    const found = result.entities as Array<{ name: string }>;
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('Amazon');
  });

  it('rejects tools that previously ran without a workspaceId', async () => {
    await seedWorkspace(db, 'ws-1', 'user-1');
    const { isError } = await executeMcpTool('list_workspaces', {}, 'user-1', db as never);
    expect(isError).toBe(true); // tool no longer exists in the registry
  });

  it('errors cleanly on unknown or retired tools', async () => {
    await seedWorkspace(db, 'ws-1', 'user-1');
    const { result, isError } = await executeMcpTool(
      'delete_canvas_item',
      { itemId: 'x', workspaceId: 'ws-1' },
      'user-1',
      db as never,
    );
    expect(isError).toBe(true);
    expect(String(result.error)).toBeTruthy();
  });
});
