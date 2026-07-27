import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { personalAccessTokens } from '../db/schema';

const TOKEN_PREFIX = 'a4_pat_';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates a token for headless clients (MCP). The raw token is returned once
 * and never stored — only its SHA-256 hash, same posture as passwords.
 */
export async function createAccessToken(
  userId: string,
  name: string,
  db: DB,
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  await db.insert(personalAccessTokens).values({
    id,
    userId,
    tokenHash: hashToken(token),
    name,
    createdAt: new Date(),
  });
  return { id, token };
}

/**
 * Resolves a bearer token to its owner, stamping lastUsedAt. Returns null for
 * unknown, malformed, or revoked tokens.
 */
export async function verifyAccessToken(rawToken: string, db: DB): Promise<string | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: personalAccessTokens.id, userId: personalAccessTokens.userId })
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.tokenHash, hashToken(rawToken)));
  if (!row) return null;

  await db
    .update(personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(personalAccessTokens.id, row.id));
  return row.userId;
}

/** Revocation is immediate — the next verify returns null. */
export async function revokeAccessToken(id: string, userId: string, db: DB): Promise<boolean> {
  const result = await db
    .delete(personalAccessTokens)
    .where(and(eq(personalAccessTokens.id, id), eq(personalAccessTokens.userId, userId)));
  return result.changes > 0;
}

export async function listAccessTokens(userId: string, db: DB) {
  return db
    .select({
      id: personalAccessTokens.id,
      name: personalAccessTokens.name,
      lastUsedAt: personalAccessTokens.lastUsedAt,
      createdAt: personalAccessTokens.createdAt,
    })
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, userId));
}
