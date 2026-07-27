import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? 'a4.db',
  },
  // The FTS5 index over document_chunks (src/db/fts.ts) is runtime-managed DDL,
  // not part of the Drizzle schema — keep push/generate from touching it.
  tablesFilter: ['!document_chunks_fts*'],
});
