import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  thumbnail: text('thumbnail'),
  type: text('type').notNull().default('workspace'),
  parentId: text('parent_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
});

// Cached daily/historical bars from Polygon.io
export const marketBars = sqliteTable(
  'market_bars',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    timespan: text('timespan').notNull(),
    multiplier: integer('multiplier').notNull(),
    timestamp: integer('timestamp').notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: real('volume').notNull(),
    vwap: real('vwap'),
    transactions: integer('transactions'),
    cachedAt: integer('cached_at').notNull(),
  },
  (table) => [
    uniqueIndex('market_bars_unique').on(
      table.symbol,
      table.timespan,
      table.multiplier,
      table.timestamp,
    ),
  ],
);

// Cached ticker metadata from Polygon.io
export const tickerDetails = sqliteTable('ticker_details', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  market: text('market').notNull(),
  type: text('type'),
  currencyName: text('currency_name'),
  active: integer('active', { mode: 'boolean' }).default(true),
  logoUrl: text('logo_url'),
  cachedAt: integer('cached_at').notNull(),
});
