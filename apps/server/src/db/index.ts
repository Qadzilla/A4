import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../env';
import { setupDocumentChunksFts } from './fts';
import * as schema from './schema';

const isTest = process.env.NODE_ENV === 'test';

const sqlite = new Database(isTest ? ':memory:' : env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
setupDocumentChunksFts(sqlite);

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
