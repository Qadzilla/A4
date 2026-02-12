import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLERK_SECRET_KEY: isDev ? z.string().default('') : z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: isDev
    ? z.string().default('')
    : z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const DEV_AUTH_BYPASS = isDev && !env.CLERK_SECRET_KEY;

if (DEV_AUTH_BYPASS) {
  console.warn('[A4] No CLERK_SECRET_KEY found — running with auth bypassed (dev only)');
}
