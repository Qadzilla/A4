import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { personalAccessTokens } from '../db/schema';
import {
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
  verifyAccessToken,
} from '../services/personal-access-tokens';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE personal_access_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

describe('personal access tokens', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a prefixed token and stores only its hash', async () => {
    const { id, token } = await createAccessToken('user-1', 'Claude Desktop', db as never);
    expect(token).toMatch(/^a4_pat_/);

    const rows = await db.select().from(personalAccessTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.tokenHash).toHaveLength(64); // sha256 hex
  });

  it('verifies a valid token, returning the owner and stamping lastUsedAt', async () => {
    const { token } = await createAccessToken('user-1', 'test', db as never);
    expect(await verifyAccessToken(token, db as never)).toBe('user-1');

    const [row] = await db.select().from(personalAccessTokens);
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it('rejects unknown and malformed tokens', async () => {
    await createAccessToken('user-1', 'test', db as never);
    expect(await verifyAccessToken('a4_pat_wrong-token', db as never)).toBeNull();
    expect(await verifyAccessToken('not-even-prefixed', db as never)).toBeNull();
    expect(await verifyAccessToken('', db as never)).toBeNull();
  });

  it('revocation takes effect immediately', async () => {
    const { id, token } = await createAccessToken('user-1', 'test', db as never);
    expect(await verifyAccessToken(token, db as never)).toBe('user-1');

    expect(await revokeAccessToken(id, 'user-1', db as never)).toBe(true);
    expect(await verifyAccessToken(token, db as never)).toBeNull();
  });

  it("cannot revoke another user's token", async () => {
    const { id, token } = await createAccessToken('user-1', 'test', db as never);
    expect(await revokeAccessToken(id, 'user-2', db as never)).toBe(false);
    expect(await verifyAccessToken(token, db as never)).toBe('user-1');
  });

  it('lists tokens without exposing hashes', async () => {
    await createAccessToken('user-1', 'first', db as never);
    await createAccessToken('user-1', 'second', db as never);
    await createAccessToken('user-2', 'other', db as never);

    const tokens = await listAccessTokens('user-1', db as never);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.name).sort()).toEqual(['first', 'second']);
    for (const t of tokens) {
      expect(t).not.toHaveProperty('tokenHash');
    }
  });
});
