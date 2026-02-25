import Database from 'better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { workspaces } from '../db/schema';

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
    )
  `);
  return drizzle(sqlite, { schema });
}

describe('workspace CRUD', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('inserts and retrieves a workspace', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: 'Test Workspace',
      description: 'A test',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    const [result] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    expect(result).toBeDefined();
    expect(result?.name).toBe('Test Workspace');
    expect(result?.description).toBe('A test');
    expect(result?.userId).toBe('user-1');
  });

  it('scopes queries by userId', async () => {
    const now = new Date();

    await db.insert(workspaces).values([
      { id: crypto.randomUUID(), name: 'WS A', userId: 'user-1', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), name: 'WS B', userId: 'user-2', createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), name: 'WS C', userId: 'user-1', createdAt: now, updatedAt: now },
    ]);

    const user1Workspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, 'user-1'));

    expect(user1Workspaces).toHaveLength(2);
    expect(user1Workspaces.every((w) => w.userId === 'user-1')).toBe(true);
  });

  it('updates a workspace', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: 'Original',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(workspaces)
      .set({ name: 'Updated', updatedAt: new Date() })
      .where(eq(workspaces.id, id));

    const [result] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    expect(result?.name).toBe('Updated');
  });

  it('creates a folder and child workspaces', async () => {
    const now = new Date();
    const folderId = crypto.randomUUID();
    const childId = crypto.randomUUID();

    await db.insert(workspaces).values({
      id: folderId,
      name: 'My Folder',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
      type: 'folder',
    });

    await db.insert(workspaces).values({
      id: childId,
      name: 'Child WS',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
      type: 'workspace',
      parentId: folderId,
    });

    const [folder] = await db.select().from(workspaces).where(eq(workspaces.id, folderId));
    expect(folder?.type).toBe('folder');
    expect(folder?.parentId).toBeNull();

    const [child] = await db.select().from(workspaces).where(eq(workspaces.id, childId));
    expect(child?.type).toBe('workspace');
    expect(child?.parentId).toBe(folderId);

    const children = await db.select().from(workspaces).where(eq(workspaces.parentId, folderId));
    expect(children).toHaveLength(1);
    expect(children[0]?.name).toBe('Child WS');
  });

  it('deletes a workspace', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: 'To Delete',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    await db.delete(workspaces).where(eq(workspaces.id, id));

    const results = await db.select().from(workspaces).where(eq(workspaces.id, id));
    expect(results).toHaveLength(0);
  });

  it('soft-deletes a workspace', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: 'Soft Delete Me',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    // Soft-delete by setting deletedAt
    await db.update(workspaces).set({ deletedAt: new Date() }).where(eq(workspaces.id, id));

    // Should be excluded from normal queries with isNull filter
    const active = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, 'user-1'), isNull(workspaces.deletedAt)));
    expect(active).toHaveLength(0);

    // But still exists in the database
    const [trashed] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    expect(trashed).toBeDefined();
    expect(trashed?.deletedAt).toBeDefined();
  });

  it('restores a trashed workspace', async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: 'Restore Me',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    });

    // Soft-delete
    await db.update(workspaces).set({ deletedAt: new Date() }).where(eq(workspaces.id, id));

    // Verify it's trashed
    const activeBeforeRestore = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, 'user-1'), isNull(workspaces.deletedAt)));
    expect(activeBeforeRestore).toHaveLength(0);

    // Restore
    await db.update(workspaces).set({ deletedAt: null }).where(eq(workspaces.id, id));

    // Should be back in active list
    const activeAfterRestore = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, 'user-1'), isNull(workspaces.deletedAt)));
    expect(activeAfterRestore).toHaveLength(1);
    expect(activeAfterRestore[0]?.name).toBe('Restore Me');
    expect(activeAfterRestore[0]?.deletedAt).toBeNull();
  });
});
