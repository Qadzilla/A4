import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLERK_SECRET_KEY: isDev
    ? z.string().default('')
    : z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: isDev
    ? z.string().default('')
    : z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  // SQLite file location — point at a mounted volume in production (e.g. /data/a4.db)
  DATABASE_PATH: z.string().default('a4.db'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // Encrypts user-supplied provider keys (BYOK) at rest; feature is disabled when unset
  KEY_ENCRYPTION_SECRET: z.string().optional(),
  // Voyage AI multimodal embeddings for visual page retrieval; disabled when unset
  VOYAGE_API_KEY: z.string().optional(),
  POLYGON_API_KEY: z.string().default(''),
  POLYGON_WS_URL: z.string().default('wss://socket.polygon.io'),
  // SnapTrade brokerage connections; feature is disabled when either is unset
  SNAPTRADE_CLIENT_ID: z.string().optional(),
  SNAPTRADE_CONSUMER_KEY: z.string().optional(),
  // Cloudflare R2 (S3-compatible) — optional, falls back to local disk
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const USE_R2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET_NAME
);

export const DEV_AUTH_BYPASS = isDev && !env.CLERK_SECRET_KEY;

// BYOK (bring-your-own-key) is presence-gated like USE_R2 — no secret, no feature
export const BYOK_ENABLED = !!env.KEY_ENCRYPTION_SECRET;

// Visual page retrieval is presence-gated on the Voyage key
export const VISUAL_RETRIEVAL_ENABLED = !!env.VOYAGE_API_KEY;

if (DEV_AUTH_BYPASS) {
  console.warn('[A4] No CLERK_SECRET_KEY found — running with auth bypassed (dev only)');
}
