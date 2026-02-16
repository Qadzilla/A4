import { z } from 'zod';

// Asset classes supported by Polygon.io
export const assetClassSchema = z.enum([
  'stocks',
  'options',
  'crypto',
  'forex',
  'indices',
]);

// Timespan for aggregate bars
export const timespanSchema = z.enum([
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);

// Ticker detail (from Polygon /v3/reference/tickers)
export const tickerDetailSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  market: z.string(),
  locale: z.string().optional(),
  type: z.string().optional(),
  currencyName: z.string().optional(),
  active: z.boolean().optional(),
  logoUrl: z.string().optional(),
});

// Aggregate bar (from Polygon /v2/aggs)
export const aggregateBarSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  vwap: z.number().optional(),
  timestamp: z.number(),
  transactions: z.number().optional(),
});

// Real-time quote (from Polygon WebSocket Q channel)
export const realtimeQuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  bidSize: z.number(),
  askSize: z.number(),
  timestamp: z.number(),
});

// Real-time trade (from Polygon WebSocket T channel)
export const realtimeTradeSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  size: z.number(),
  exchange: z.number().optional(),
  timestamp: z.number(),
  conditions: z.array(z.number()).optional(),
});

// Ticker snapshot (from Polygon /v2/snapshot)
export const tickerSnapshotSchema = z.object({
  ticker: z.string(),
  todaysChange: z.number(),
  todaysChangePerc: z.number(),
  day: aggregateBarSchema.optional(),
  prevDay: aggregateBarSchema.optional(),
  lastTrade: z
    .object({
      price: z.number(),
      size: z.number(),
      timestamp: z.number(),
    })
    .optional(),
  lastQuote: z
    .object({
      bid: z.number(),
      ask: z.number(),
      bidSize: z.number(),
      askSize: z.number(),
      timestamp: z.number(),
    })
    .optional(),
  min: aggregateBarSchema.optional(),
});

// --- Input schemas ---

export const tickerSearchInputSchema = z.object({
  query: z.string().min(1),
  market: assetClassSchema.optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const aggregateInputSchema = z.object({
  symbol: z.string().min(1),
  timespan: timespanSchema.default('day'),
  multiplier: z.number().int().min(1).default(1),
  from: z.string(), // YYYY-MM-DD
  to: z.string(), // YYYY-MM-DD
  sort: z.enum(['asc', 'desc']).default('asc'),
  limit: z.number().int().min(1).max(50000).default(5000),
});

export const subscribeInputSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1),
  channels: z
    .array(z.enum(['T', 'Q', 'A', 'AM']))
    .default(['T', 'Q']),
});

// WebSocket message types (server → client)
export const wsTradeMessageSchema = z.object({
  type: z.literal('trade'),
  symbol: z.string(),
  price: z.number(),
  size: z.number(),
  timestamp: z.number(),
});

export const wsQuoteMessageSchema = z.object({
  type: z.literal('quote'),
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  bidSize: z.number(),
  askSize: z.number(),
  timestamp: z.number(),
});

export const wsAggregateMessageSchema = z.object({
  type: z.literal('aggregate'),
  symbol: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  timestamp: z.number(),
});

export const wsStatusMessageSchema = z.object({
  type: z.literal('status'),
  message: z.string(),
});

export const wsServerMessageSchema = z.discriminatedUnion('type', [
  wsTradeMessageSchema,
  wsQuoteMessageSchema,
  wsAggregateMessageSchema,
  wsStatusMessageSchema,
]);

// Client → server WebSocket messages
export const wsSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  symbols: z.array(z.string()),
  channels: z.array(z.string()).default(['T', 'Q']),
});

export const wsUnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  symbols: z.array(z.string()),
});

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  wsSubscribeMessageSchema,
  wsUnsubscribeMessageSchema,
]);
