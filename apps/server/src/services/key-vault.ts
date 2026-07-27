import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { userApiKeys } from '../db/schema';
import { env } from '../env';

export type KeyProvider = 'anthropic' | 'openai';

/**
 * Server-side encryption for user-supplied provider keys. Distinct from the
 * client-side vault: the server must read these values to call providers on
 * the user's behalf, so encryption protects at-rest copies of the DB, not
 * against a compromised server process.
 *
 * Read env at call time (not module load) so tests can toggle the secret.
 */
function encryptionKey(): Buffer | null {
  const secret = env.KEY_ENCRYPTION_SECRET;
  if (!secret) return null;
  return createHash('sha256').update(secret).digest();
}

export function keyVaultEnabled(): boolean {
  return encryptionKey() !== null;
}

/** Returns `iv:tag:ciphertext` (base64 fields). Throws when BYOK is disabled. */
export function encryptApiKey(plaintext: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('KEY_ENCRYPTION_SECRET is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Throws on tampered or wrong-secret payloads (GCM auth failure). */
export function decryptApiKey(payload: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('KEY_ENCRYPTION_SECRET is not configured');
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted key payload');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Verifies a candidate key against the provider with the cheapest authenticated
 * call (models list). Returns false for rejected keys; network errors also fail
 * validation — better to refuse a key we can't verify than store a broken one.
 */
export async function validateProviderApiKey(
  provider: KeyProvider,
  apiKey: string,
): Promise<boolean> {
  try {
    if (provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      await new Anthropic({ apiKey }).models.list({ limit: 1 });
    } else {
      const { default: OpenAI } = await import('openai');
      await new OpenAI({ apiKey }).models.list();
    }
    return true;
  } catch {
    return false;
  }
}

const CACHE_TTL_MS = 60_000;
const keyCache = new Map<string, { value: string | null; expiresAt: number }>();

/** Test helper + set/delete invalidation. Omit args to clear everything. */
export function invalidateKeyCache(userId?: string, provider?: KeyProvider): void {
  if (!userId) {
    keyCache.clear();
    return;
  }
  if (provider) {
    keyCache.delete(`${userId}|${provider}`);
    return;
  }
  for (const cacheKey of keyCache.keys()) {
    if (cacheKey.startsWith(`${userId}|`)) keyCache.delete(cacheKey);
  }
}

/**
 * The user's decrypted provider key, or null when BYOK is disabled, the user
 * has no key, or decryption fails (e.g. the server secret was rotated —
 * treated as "no key" so requests fall back to the house key rather than
 * erroring).
 */
export async function getUserApiKey(
  userId: string,
  provider: KeyProvider,
  db: DB,
): Promise<string | null> {
  if (!keyVaultEnabled()) return null;

  const cacheKey = `${userId}|${provider}`;
  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: string | null = null;
  try {
    const [row] = await db
      .select({ encryptedKey: userApiKeys.encryptedKey })
      .from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    if (row) value = decryptApiKey(row.encryptedKey);
  } catch (err) {
    console.warn(`[byok] Failed to load ${provider} key for user ${userId}:`, err);
    value = null;
  }

  keyCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
