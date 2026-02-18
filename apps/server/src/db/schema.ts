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

// Canvas items persisted per workspace
export const canvasItems = sqliteTable('canvas_items', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  zIndex: integer('z_index').notNull(),
  data: text('data'), // JSON string
});

// Canvas connections between items
export const canvasConnections = sqliteTable('canvas_connections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fromItemId: text('from_item_id').notNull(),
  fromAnchor: text('from_anchor').notNull(),
  toItemId: text('to_item_id').notNull(),
  toAnchor: text('to_anchor').notNull(),
});

// Per-user vault config (salt + encrypted verification token)
export const vaultConfig = sqliteTable('vault_config', {
  userId: text('user_id').primaryKey(),
  salt: text('salt').notNull(),
  verificationCiphertext: text('verification_ciphertext').notNull(),
  verificationIV: text('verification_iv').notNull(),
});

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
