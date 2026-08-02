import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { wsClientMessageSchema } from '@a4/shared-schemas';
import { clerkMiddleware, verifyToken } from '@clerk/express';
import * as trpcExpress from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { type WebSocket, WebSocketServer } from 'ws';
import { DEV_AUTH_BYPASS, env } from './env';
import { chatStreamRouter } from './routes/chat-stream';
import { exportsRouter } from './routes/exports';
import { filesRouter } from './routes/files';
import { startJobWorker } from './services/job-queue';
import { PolygonService } from './services/polygon';
import { createContext, setPolygonService } from './trpc/context';
import { appRouter } from './trpc/router';

const app = express();

// Behind Railway/Fly's proxy in production — required for express-rate-limit
// to key on the real client IP instead of the proxy's
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  }),
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// Rate limiting on tRPC endpoint (relaxed in dev for E2E tests)
app.use(
  '/trpc',
  rateLimit({
    windowMs: 60 * 1000,
    max: DEV_AUTH_BYPASS ? 1000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Clerk auth middleware (skipped in dev bypass)
if (!DEV_AUTH_BYPASS) {
  app.use(clerkMiddleware());
}

// tRPC handler
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// Rate limit for AI streaming endpoint
app.use(
  '/api/chat/stream',
  express.json(),
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use('/api/chat/stream', chatStreamRouter);

// File upload/download/delete routes (Express, not tRPC — multipart)
app.use('/api/files', filesRouter);
app.use('/api/exports', exportsRouter);

// MCP endpoint for external agents (PAT auth, not Clerk) — same limiter
// family as the chat endpoint since tool calls hit the same AI surface
app.use(
  '/mcp',
  express.json({ limit: '1mb' }),
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.all('/mcp', (req, res, next) => {
  import('./mcp/server').then((m) => m.handleMcpRequest(req, res)).catch(next);
});

// Health check endpoint (non-tRPC)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Initialize Polygon service ---
const polygon = new PolygonService(env.POLYGON_API_KEY, env.POLYGON_WS_URL);
setPolygonService(polygon);

if (!env.POLYGON_API_KEY) {
  console.warn('[A4] No POLYGON_API_KEY found — market data features will fail');
}

// --- HTTP + WebSocket server ---
const server = createServer(app);

// Client subscription tracking
interface ClientState {
  authenticated: boolean;
  userId: string | null;
  subscriptions: Set<string>; // "T.AAPL", "Q.BTC-USD", etc.
}
const clients = new Map<WebSocket, ClientState>();

const wss = new WebSocketServer({ server, path: '/ws' });

async function authenticateWs(req: IncomingMessage): Promise<{ userId: string } | null> {
  if (DEV_AUTH_BYPASS) {
    return { userId: 'dev-user-001' };
  }

  // Extract token from query string: /ws?token=xxx
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) return null;

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const authResult = await authenticateWs(req);

  const state: ClientState = {
    authenticated: !!authResult,
    userId: authResult?.userId ?? null,
    subscriptions: new Set(),
  };
  clients.set(ws, state);

  if (!state.authenticated) {
    ws.send(JSON.stringify({ type: 'status', message: 'Authentication failed' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.send(JSON.stringify({ type: 'status', message: 'Connected' }));

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      const msg = wsClientMessageSchema.safeParse(parsed);
      if (!msg.success) return;

      if (msg.data.type === 'subscribe') {
        const channelParams: string[] = [];
        for (const ch of msg.data.channels) {
          for (const sym of msg.data.symbols) {
            const key = `${ch}.${sym}`;
            state.subscriptions.add(key);
            channelParams.push(key);
          }
        }
        // Subscribe on the Polygon side
        polygon.subscribe(msg.data.symbols, msg.data.channels);
      } else if (msg.data.type === 'unsubscribe') {
        for (const sym of msg.data.symbols) {
          // Remove all channels for this symbol
          for (const sub of state.subscriptions) {
            if (sub.endsWith(`.${sym}`)) {
              state.subscriptions.delete(sub);
            }
          }
        }
        // Check if any client still cares about these symbols
        const stillNeeded = new Set<string>();
        for (const [, clientState] of clients) {
          for (const sub of clientState.subscriptions) {
            stillNeeded.add(sub);
          }
        }
        // Unsubscribe from Polygon for symbols nobody needs
        const toUnsub = msg.data.symbols.filter((sym) => {
          return !Array.from(stillNeeded).some((s) => s.endsWith(`.${sym}`));
        });
        if (toUnsub.length > 0) {
          polygon.unsubscribe(toUnsub);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// --- Fan-out: Polygon → browser clients ---

polygon.onTrade((symbol, data) => {
  const msg = JSON.stringify({
    type: 'trade',
    symbol,
    price: data.p as number,
    size: data.s as number,
    timestamp: data.t as number,
  });

  for (const [ws, state] of clients) {
    if (state.subscriptions.has(`T.${symbol}`) && ws.readyState === 1) {
      ws.send(msg);
    }
  }
});

polygon.onQuote((symbol, data) => {
  const msg = JSON.stringify({
    type: 'quote',
    symbol,
    bid: data.bp as number,
    ask: data.ap as number,
    bidSize: data.bs as number,
    askSize: data.as as number,
    timestamp: data.t as number,
  });

  for (const [ws, state] of clients) {
    if (state.subscriptions.has(`Q.${symbol}`) && ws.readyState === 1) {
      ws.send(msg);
    }
  }
});

polygon.onAggregate((symbol, data) => {
  const msg = JSON.stringify({
    type: 'aggregate',
    symbol,
    open: data.o as number,
    high: data.h as number,
    low: data.l as number,
    close: data.c as number,
    volume: data.v as number,
    timestamp: data.s as number,
  });

  for (const [ws, state] of clients) {
    if (
      (state.subscriptions.has(`A.${symbol}`) || state.subscriptions.has(`AM.${symbol}`)) &&
      ws.readyState === 1
    ) {
      ws.send(msg);
    }
  }
});

if (env.NODE_ENV !== 'test') {
  import('./services/entity-extraction').then((m) => m.registerEntityExtractionHandler());
  import('./services/entity-resolution').then((m) => m.registerEntityResolutionHandler());
  import('./services/entity-linking').then((m) => m.registerEntityLinkingHandler());
  import('./services/page-embedding').then((m) => m.registerPageEmbeddingHandler());
  import('./services/statement-import').then((m) => m.registerStatementImportHandler());
  import('./services/reconcile-1099').then((m) => m.registerReconcile1099Handler());
  import('./services/extract-w2').then((m) => m.registerExtractW2Handler());
  startJobWorker();
}

const port = Number(env.PORT);
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}/ws`);
});
