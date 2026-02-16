import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { type DB, db } from '../db';
import { DEV_AUTH_BYPASS } from '../env';
import type { PolygonService } from '../services/polygon';

export interface AuthObject {
  userId: string | null;
  sessionId: string | null;
}

export interface Context {
  auth: AuthObject;
  db: DB;
  polygon: PolygonService;
}

let _polygon: PolygonService | null = null;

export function setPolygonService(polygon: PolygonService): void {
  _polygon = polygon;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  if (!_polygon) {
    throw new Error('PolygonService not initialized');
  }

  if (DEV_AUTH_BYPASS) {
    return {
      auth: { userId: 'dev-user-001', sessionId: 'dev-session-001' },
      db,
      polygon: _polygon,
    };
  }

  return {
    auth: (req as unknown as { auth: AuthObject }).auth ?? { userId: null, sessionId: null },
    db,
    polygon: _polygon,
  };
}
