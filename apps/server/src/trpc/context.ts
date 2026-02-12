import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { type DB, db } from '../db';
import { DEV_AUTH_BYPASS } from '../env';

export interface AuthObject {
  userId: string | null;
  sessionId: string | null;
}

export interface Context {
  auth: AuthObject;
  db: DB;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  if (DEV_AUTH_BYPASS) {
    return {
      auth: { userId: 'dev-user-001', sessionId: 'dev-session-001' },
      db,
    };
  }

  return {
    auth: (req as unknown as { auth: AuthObject }).auth ?? { userId: null, sessionId: null },
    db,
  };
}
