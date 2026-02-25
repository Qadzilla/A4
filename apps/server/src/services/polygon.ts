import type { AggregateBar, TickerDetail, TickerSnapshot } from '@a4/shared-types';
import { restClient } from '@polygon.io/client-js';
import { and, eq, gte, lte } from 'drizzle-orm';
import WebSocket from 'ws';
import type { DB } from '../db';
import { marketBars, tickerDetails } from '../db/schema';

// Map Polygon's abbreviated bar fields to our schema
function mapBar(bar: {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  t: number;
  n?: number;
}): AggregateBar {
  return {
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    vwap: bar.vw,
    timestamp: bar.t,
    transactions: bar.n,
  };
}

// Polygon WebSocket event types
type PolygonWsHandler = (symbol: string, data: Record<string, unknown>) => void;

export class PolygonService {
  private rest: ReturnType<typeof restClient>;
  private wsConnections = new Map<string, WebSocket>();
  private apiKey: string;
  private wsUrl: string;
  private onTradeHandlers: PolygonWsHandler[] = [];
  private onQuoteHandlers: PolygonWsHandler[] = [];
  private onAggregateHandlers: PolygonWsHandler[] = [];
  private subscribedChannels = new Set<string>();

  constructor(apiKey: string, wsUrl = 'wss://socket.polygon.io') {
    this.apiKey = apiKey;
    this.wsUrl = wsUrl;
    this.rest = restClient(apiKey);
  }

  // --- REST methods ---

  async searchTickers(query: string, market?: string, limit = 10): Promise<TickerDetail[]> {
    const response = await this.rest.listTickers(
      undefined, // ticker
      undefined, // type
      market as never, // market
      undefined, // exchange
      undefined, // cusip
      undefined, // cik
      undefined, // date
      query, // search
      true, // active
      undefined, // tickerGte
      undefined, // tickerGt
      undefined, // tickerLte
      undefined, // tickerLt
      undefined, // order
      limit, // limit
    );

    return (response.results ?? []).map((t) => ({
      symbol: t.ticker ?? '',
      name: t.name,
      market: t.market,
      locale: t.locale,
      type: t.type,
      currencyName: t.currency_name,
      active: t.active,
    }));
  }

  async getTickerDetail(symbol: string): Promise<TickerDetail> {
    const response = await this.rest.getTicker(symbol);
    const r = response.results;
    return {
      symbol: r?.ticker ?? symbol,
      name: r?.name ?? symbol,
      market: r?.market ?? 'stocks',
      locale: r?.locale,
      type: r?.type,
      currencyName: r?.currency_name,
      active: r?.active,
    };
  }

  async getAggregates(
    symbol: string,
    multiplier: number,
    timespan: string,
    from: string,
    to: string,
    sort: 'asc' | 'desc' = 'asc',
    limit = 5000,
  ): Promise<AggregateBar[]> {
    const response = await this.rest.getStocksAggregates(
      symbol,
      multiplier,
      timespan as never,
      from,
      to,
      true, // adjusted
      sort as never,
      limit,
    );

    return (response.results ?? []).map(mapBar);
  }

  async getSnapshot(symbol: string): Promise<TickerSnapshot> {
    const response = await this.rest.getStocksSnapshotTicker(symbol);
    const t = response.ticker;
    return {
      ticker: t?.ticker ?? symbol,
      todaysChange: t?.todaysChange ?? 0,
      todaysChangePerc: t?.todaysChangePerc ?? 0,
      day: t?.day
        ? {
            open: t.day.o ?? 0,
            high: t.day.h ?? 0,
            low: t.day.l ?? 0,
            close: t.day.c ?? 0,
            volume: t.day.v ?? 0,
            vwap: t.day.vw,
            timestamp: 0,
          }
        : undefined,
      prevDay: t?.prevDay
        ? {
            open: t.prevDay.o ?? 0,
            high: t.prevDay.h ?? 0,
            low: t.prevDay.l ?? 0,
            close: t.prevDay.c ?? 0,
            volume: t.prevDay.v ?? 0,
            vwap: t.prevDay.vw,
            timestamp: 0,
          }
        : undefined,
      lastTrade: t?.lastTrade
        ? {
            price: t.lastTrade.p ?? 0,
            size: t.lastTrade.s ?? 0,
            timestamp: t.lastTrade.t ?? 0,
          }
        : undefined,
      lastQuote: t?.lastQuote
        ? {
            bid: t.lastQuote.p ?? 0,
            ask: t.lastQuote.P ?? 0,
            bidSize: t.lastQuote.s ?? 0,
            askSize: t.lastQuote.S ?? 0,
            timestamp: t.lastQuote.t ?? 0,
          }
        : undefined,
      min: t?.min
        ? {
            open: t.min.o ?? 0,
            high: t.min.h ?? 0,
            low: t.min.l ?? 0,
            close: t.min.c ?? 0,
            volume: t.min.v ?? 0,
            vwap: t.min.vw,
            timestamp: t.min.t ?? 0,
          }
        : undefined,
    };
  }

  // --- Cache helpers ---

  async getCachedBars(
    db: DB,
    symbol: string,
    timespan: string,
    multiplier: number,
    from: number,
    to: number,
  ): Promise<AggregateBar[] | null> {
    const rows = await db
      .select()
      .from(marketBars)
      .where(
        and(
          eq(marketBars.symbol, symbol),
          eq(marketBars.timespan, timespan),
          eq(marketBars.multiplier, multiplier),
          gte(marketBars.timestamp, from),
          lte(marketBars.timestamp, to),
        ),
      )
      .all();

    if (rows.length === 0) return null;

    return rows.map((r) => ({
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      vwap: r.vwap ?? undefined,
      timestamp: r.timestamp,
      transactions: r.transactions ?? undefined,
    }));
  }

  async cacheBars(
    db: DB,
    symbol: string,
    timespan: string,
    multiplier: number,
    bars: AggregateBar[],
  ): Promise<void> {
    const now = Date.now();
    for (const bar of bars) {
      await db
        .insert(marketBars)
        .values({
          symbol,
          timespan,
          multiplier,
          timestamp: bar.timestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          vwap: bar.vwap ?? null,
          transactions: bar.transactions ?? null,
          cachedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            marketBars.symbol,
            marketBars.timespan,
            marketBars.multiplier,
            marketBars.timestamp,
          ],
          set: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            vwap: bar.vwap ?? null,
            transactions: bar.transactions ?? null,
            cachedAt: now,
          },
        });
    }
  }

  async getCachedTickerDetail(
    db: DB,
    symbol: string,
    maxAge = 24 * 60 * 60 * 1000, // 24 hours
  ): Promise<TickerDetail | null> {
    const rows = await db
      .select()
      .from(tickerDetails)
      .where(eq(tickerDetails.symbol, symbol))
      .all();

    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (Date.now() - row.cachedAt > maxAge) return null;

    return {
      symbol: row.symbol,
      name: row.name,
      market: row.market,
      type: row.type ?? undefined,
      currencyName: row.currencyName ?? undefined,
      active: row.active ?? undefined,
      logoUrl: row.logoUrl ?? undefined,
    };
  }

  async cacheTickerDetail(db: DB, detail: TickerDetail): Promise<void> {
    await db
      .insert(tickerDetails)
      .values({
        symbol: detail.symbol,
        name: detail.name,
        market: detail.market,
        type: detail.type ?? null,
        currencyName: detail.currencyName ?? null,
        active: detail.active ?? true,
        logoUrl: detail.logoUrl ?? null,
        cachedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: tickerDetails.symbol,
        set: {
          name: detail.name,
          market: detail.market,
          type: detail.type ?? null,
          currencyName: detail.currencyName ?? null,
          active: detail.active ?? true,
          logoUrl: detail.logoUrl ?? null,
          cachedAt: Date.now(),
        },
      });
  }

  // --- WebSocket methods (Polygon → server) ---

  onTrade(handler: PolygonWsHandler): void {
    this.onTradeHandlers.push(handler);
  }

  onQuote(handler: PolygonWsHandler): void {
    this.onQuoteHandlers.push(handler);
  }

  onAggregate(handler: PolygonWsHandler): void {
    this.onAggregateHandlers.push(handler);
  }

  /**
   * Connect to Polygon WebSocket for a specific market.
   * Manages a single connection per market (stocks, crypto, forex, options, indices).
   */
  connectToMarket(market: string): void {
    if (this.wsConnections.has(market)) return;

    const url = `${this.wsUrl}/${market}`;
    const ws = new WebSocket(url);

    ws.on('open', () => {
      // Authenticate
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    });

    ws.on('message', (raw: WebSocket.Data) => {
      try {
        const messages = JSON.parse(raw.toString()) as Array<Record<string, unknown>>;
        for (const msg of messages) {
          const ev = msg.ev as string;
          const sym = (msg.sym ?? msg.T) as string | undefined;
          if (!sym) continue;

          if (ev === 'T') {
            for (const h of this.onTradeHandlers) h(sym, msg);
          } else if (ev === 'Q') {
            for (const h of this.onQuoteHandlers) h(sym, msg);
          } else if (ev === 'A' || ev === 'AM') {
            for (const h of this.onAggregateHandlers) h(sym, msg);
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      this.wsConnections.delete(market);
      // Auto-reconnect after 5s
      setTimeout(() => {
        if (this.subscribedChannels.size > 0) {
          this.connectToMarket(market);
          // Re-subscribe
          for (const ch of this.subscribedChannels) {
            if (this.getMarketForChannel(ch) === market) {
              this.sendSubscribe(market, [ch]);
            }
          }
        }
      }, 5000);
    });

    ws.on('error', (err) => {
      console.error(`[Polygon WS] ${market} error:`, err.message);
    });

    this.wsConnections.set(market, ws);
  }

  subscribe(symbols: string[], channels: string[] = ['T', 'Q']): void {
    const params: string[] = [];
    for (const ch of channels) {
      for (const sym of symbols) {
        const key = `${ch}.${sym}`;
        this.subscribedChannels.add(key);
        params.push(key);
      }
    }

    // Group by market and subscribe
    const byMarket = new Map<string, string[]>();
    for (const p of params) {
      const sym = p.split('.').slice(1).join('.');
      const market = this.guessMarket(sym);
      if (!byMarket.has(market)) byMarket.set(market, []);
      byMarket.get(market)?.push(p);
    }

    for (const [market, marketParams] of byMarket) {
      this.connectToMarket(market);
      this.sendSubscribe(market, marketParams);
    }
  }

  unsubscribe(symbols: string[], channels: string[] = ['T', 'Q']): void {
    const params: string[] = [];
    for (const ch of channels) {
      for (const sym of symbols) {
        const key = `${ch}.${sym}`;
        this.subscribedChannels.delete(key);
        params.push(key);
      }
    }

    const byMarket = new Map<string, string[]>();
    for (const p of params) {
      const sym = p.split('.').slice(1).join('.');
      const market = this.guessMarket(sym);
      if (!byMarket.has(market)) byMarket.set(market, []);
      byMarket.get(market)?.push(p);
    }

    for (const [market, marketParams] of byMarket) {
      const ws = this.wsConnections.get(market);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', params: marketParams.join(',') }));
      }
    }
  }

  destroy(): void {
    for (const ws of this.wsConnections.values()) {
      ws.close();
    }
    this.wsConnections.clear();
    this.subscribedChannels.clear();
  }

  private sendSubscribe(market: string, params: string[]): void {
    const ws = this.wsConnections.get(market);
    if (!ws) return;

    const send = () => {
      ws.send(JSON.stringify({ action: 'subscribe', params: params.join(',') }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.once('open', () => {
        // Wait for auth response before subscribing
        setTimeout(send, 500);
      });
    }
  }

  private guessMarket(symbol: string): string {
    if (symbol.startsWith('X:')) return 'crypto';
    if (symbol.startsWith('C:')) return 'forex';
    if (symbol.startsWith('O:')) return 'options';
    if (symbol.startsWith('I:')) return 'indices';
    return 'stocks';
  }

  private getMarketForChannel(channel: string): string {
    const sym = channel.split('.').slice(1).join('.');
    return this.guessMarket(sym);
  }
}
