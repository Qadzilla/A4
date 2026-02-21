# A4 — Infrastructure

> **Last updated:** 2026-02-19
> CI/CD, environment variables, deployment configuration. For the high-level overview, see [Architecture](./A4_ARCHITECTURE.md).

---

## 1. Environment Variables

| Variable | Where used | Secret? | Description |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend | No | Clerk publishable key (safe for client) |
| `VITE_API_URL` | Frontend | No | Backend URL |
| `CLERK_SECRET_KEY` | Server | **Yes** | Clerk secret for server-side auth verification |
| `CLERK_PUBLISHABLE_KEY` | Server | No | Clerk publishable (for middleware config) |
| `ANTHROPIC_API_KEY` | Server | **Yes** | Claude API key |
| `PORT` | Server | No | Server port (default 4000) |
| `NODE_ENV` | Server | No | development / production / test |
| `FRONTEND_URL` | Server | No | CORS origin (default http://localhost:3000) |

**Rules:**
- Client-safe vars prefixed with `VITE_`. Secrets never prefixed with `VITE_`.
- Server env vars validated with Zod in `apps/server/src/env.ts`.
- All vars documented in `.env.example`.

---

## 2. CI/CD Pipeline

```
Push/PR to main
  │
  ├── Lint & Typecheck (parallel)
  │     ├── biome check .
  │     └── turbo typecheck (5 packages)
  │
  ├── Unit Tests ←── depends on lint passing
  │     └── turbo test (3 packages, 33 tests)
  │
  ├── E2E Tests ←── depends on lint passing
  │     └── playwright test (Chromium only)
  │
  ├── Build ←── depends on tests passing
  │     └── turbo build
  │
  └── Security Audit ←── depends on tests passing
        └── pnpm audit --audit-level high
```

**Config:** `.github/workflows/ci.yml`

Turborepo remote caching enabled. Concurrency group cancels stale PR runs.

---

## 3. Database

**Current:** SQLite via better-sqlite3 + Drizzle ORM. Database file at `apps/server/a4.db` (gitignored). WAL mode enabled, foreign keys on.

**Schema management:** `drizzle-kit push` for dev, `drizzle-kit generate` + `drizzle-kit migrate` for production.

**Future:** Migrate to PostgreSQL (Neon or Supabase) for production. The Drizzle ORM layer abstracts most of the migration — schema definitions will need to switch from `sqliteTable` to `pgTable`.

---

## 4. Dev Auth Bypass

When `VITE_CLERK_PUBLISHABLE_KEY` is missing in dev mode, authentication is skipped entirely:
- Frontend: `DevProviders` replaces `ClerkProvider`, `useDevUser` returns a mock user
- Server: `protectedProcedure` injects a hardcoded dev `userId`

**Before production, remove:** `DEV_AUTH_BYPASS`, `useDevUser` hook, `DevProviders` component.

---

## 5. Planned (Not Yet Configured)

| Item | Notes |
|---|---|
| **PostgreSQL** | Replace SQLite for production. Neon (serverless) or Supabase. |
| **Docker** | Containerized deployment for server + web. |
| **Hosting** | Vercel (frontend) + Railway/Fly (server), or single container on Fly. |
| **Sentry** | Error tracking + performance monitoring. |
| **Analytics** | Usage tracking (PostHog or similar). |
| **Logging** | Structured logging (pino or winston) on the server. |
