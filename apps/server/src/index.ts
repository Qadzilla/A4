import { clerkMiddleware } from '@clerk/express';
import * as trpcExpress from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { DEV_AUTH_BYPASS, env } from './env';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/router';

const app = express();

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

// Rate limiting on tRPC endpoint
app.use(
  '/trpc',
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
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

// Health check endpoint (non-tRPC)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
