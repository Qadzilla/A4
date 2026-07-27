import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({ KEY_ENCRYPTION_SECRET: 'test-secret' as string | undefined }));
vi.mock('../env', () => ({
  env: mockEnv,
  BYOK_ENABLED: true,
  DEV_AUTH_BYPASS: false,
  USE_R2: false,
}));

import * as schema from '../db/schema';
import { userApiKeys } from '../db/schema';
import {
  decryptApiKey,
  encryptApiKey,
  getUserApiKey,
  invalidateKeyCache,
  keyVaultEnabled,
} from '../services/key-vault';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      key_hint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX user_api_keys_user_provider ON user_api_keys (user_id, provider);
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function insertKey(db: TestDb, userId: string, provider: string, plaintext: string) {
  await db.insert(userApiKeys).values({
    id: crypto.randomUUID(),
    userId,
    provider,
    encryptedKey: encryptApiKey(plaintext),
    keyHint: plaintext.slice(-4),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('key vault crypto', () => {
  beforeEach(() => {
    mockEnv.KEY_ENCRYPTION_SECRET = 'test-secret';
    invalidateKeyCache();
  });

  it('round-trips a key through encrypt/decrypt', () => {
    const encrypted = encryptApiKey('sk-ant-abc123');
    expect(encrypted).not.toContain('sk-ant');
    expect(decryptApiKey(encrypted)).toBe('sk-ant-abc123');
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    expect(encryptApiKey('same-key')).not.toBe(encryptApiKey('same-key'));
  });

  it('throws on tampered ciphertext (GCM auth failure)', () => {
    const encrypted = encryptApiKey('sk-ant-abc123');
    const [iv, tag, data] = encrypted.split(':');
    const tampered = `${iv}:${tag}:${Buffer.from(`x${Buffer.from(data!, 'base64').toString('latin1').slice(1)}`, 'latin1').toString('base64')}`;
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it('throws on malformed payloads', () => {
    expect(() => decryptApiKey('not-a-valid-payload')).toThrow('Malformed');
  });

  it('fails to decrypt after the server secret rotates', () => {
    const encrypted = encryptApiKey('sk-ant-abc123');
    mockEnv.KEY_ENCRYPTION_SECRET = 'rotated-secret';
    expect(() => decryptApiKey(encrypted)).toThrow();
  });

  it('is disabled without a secret', () => {
    mockEnv.KEY_ENCRYPTION_SECRET = undefined;
    expect(keyVaultEnabled()).toBe(false);
    expect(() => encryptApiKey('sk-x')).toThrow('not configured');
  });
});

describe('getUserApiKey', () => {
  let db: TestDb;

  beforeEach(() => {
    mockEnv.KEY_ENCRYPTION_SECRET = 'test-secret';
    invalidateKeyCache();
    db = createTestDb();
  });

  it('returns the decrypted key for the user and provider', async () => {
    await insertKey(db, 'user-1', 'anthropic', 'sk-ant-mykey');
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBe('sk-ant-mykey');
  });

  it('returns null when the user has no key for the provider', async () => {
    await insertKey(db, 'user-1', 'openai', 'sk-openai-key');
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBeNull();
  });

  it('returns null when BYOK is disabled', async () => {
    await insertKey(db, 'user-1', 'anthropic', 'sk-ant-mykey');
    mockEnv.KEY_ENCRYPTION_SECRET = undefined;
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBeNull();
  });

  it('treats an undecryptable key (rotated secret) as no key', async () => {
    await insertKey(db, 'user-1', 'anthropic', 'sk-ant-mykey');
    mockEnv.KEY_ENCRYPTION_SECRET = 'rotated-secret';
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBeNull();
  });

  it('caches lookups until invalidated', async () => {
    await insertKey(db, 'user-1', 'anthropic', 'sk-ant-mykey');
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBe('sk-ant-mykey');

    // Row deleted, but the cache still serves the old value…
    await db.delete(userApiKeys);
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBe('sk-ant-mykey');

    // …until invalidation
    invalidateKeyCache('user-1', 'anthropic');
    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBeNull();
  });

  it('invalidates all providers for a user when provider is omitted', async () => {
    await insertKey(db, 'user-1', 'anthropic', 'sk-a');
    await insertKey(db, 'user-1', 'openai', 'sk-o');
    await getUserApiKey('user-1', 'anthropic', db as never);
    await getUserApiKey('user-1', 'openai', db as never);

    await db.delete(userApiKeys);
    invalidateKeyCache('user-1');

    expect(await getUserApiKey('user-1', 'anthropic', db as never)).toBeNull();
    expect(await getUserApiKey('user-1', 'openai', db as never)).toBeNull();
  });
});
