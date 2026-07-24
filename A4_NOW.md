# A4 — Launch Checklist

> **Created:** 2026-04-14
> **Goal:** Basic early access launch (free tier, no billing)
> **Status:** In progress

---

## Must Fix Before Launch (~3-4 days)

| # | Task | Effort | Status |
|---|------|--------|--------|
| 1 | **Fix sign-out** — currently redirects without revoking Clerk session | 30 min | **Done** |
| 2 | **Add error boundary + 404 route** — unhandled routes show blank, React crashes kill app | 1-2 hrs | **Done** |
| 3 | **Set real Clerk keys** — dev bypass must be disabled in prod | 30 min | **Done** |
| 4 | **Move .env out of git** — real Anthropic/OpenAI keys are committed | 30 min | **Done** (verified: no .env files were ever committed to git history) |
| 5 | **Deploy frontend** (Vercel) + **backend** (Railway/Fly) | 1 day | Not started |
| 6 | **File storage → cloud** (R2/S3) — currently local filesystem, won't persist on serverless | 1-2 days | **Done** (storage abstraction: `LocalStorageBackend` for dev, `R2StorageBackend` for prod via `@aws-sdk/client-s3`; text extraction + OCR refactored to accept Buffers; backward compat for old absolute-path DB rows) |
| 7 | **CORS + FRONTEND_URL** — hardcoded to localhost:3000, API calls fail in prod | 15 min | **Done** (not hardcoded — `FRONTEND_URL` env var already configurable, documented in `.env.production`) |

## Should Fix Before Inviting Users (~4-5 days)

| # | Task | Effort | Status |
|---|------|--------|--------|
| 8 | **Hardcoded user name** — Sidebar shows "Zaid" and "dev@a4.ai" for all users | 1 hr | **Done** (Sidebar now uses `useDevUser()` hook — shows real Clerk user data in prod, dev fallback in dev mode) |
| 9 | **User/billing stub routers** — settings page is broken without them | 1 day | **Done** (`userProfiles` DB table, user router with auto-create + upsert, billing router with plan info + real usage stats from DB, settings page wired to `useDevUser()` + tRPC queries) |
| 10 | **Code-split workspace page** — 2.4MB single chunk, slow on mobile | 1 day | **Done** (lazy-loaded 26 tab views, chat/insights panels, 6 tool panels, vault modals; BlockNote extracted to vendor chunk; workspace page: 2,392KB → 683KB, 71% reduction) |
| 11 | **Onboarding flow** — empty dashboard after sign-up, users have no guidance | 2-3 days | **Done** (`/onboarding` route with 2-step flow: template picker → name & create; 6 templates seed cards via `workspace.createWithTemplate`; dashboard redirects if `onboardingCompleted === false`; hardcoded "Hi Zaid" fixed to use `useDevUser()`) |

## Can Defer (not needed for early access)

- PostgreSQL migration (SQLite fine for small user count)
- Stripe billing (everything's free during early access)
- Plaid/Stripe/QuickBooks integrations
- Team collaboration / sharing
- Error monitoring (Sentry)
- Load testing
- Privacy/Terms pages

---

## Auth & Dev Bypass — How It Works

The dev bypass is **environment-driven, not code-branched**. No code changes needed to switch to real auth — just supply Clerk keys.

### How it activates
- **Server:** `DEV_AUTH_BYPASS = isDev && !env.CLERK_SECRET_KEY` → when no key, every request gets `userId: 'dev-user-001'`
- **Client:** `DEV_AUTH_BYPASS = !VITE_CLERK_PUBLISHABLE_KEY && import.meta.env.DEV` → renders `DevProviders` instead of `ClerkProvider`

### What the bypass touches

**Server (4 files):**
- `apps/server/src/env.ts` — defines the flag
- `apps/server/src/trpc/context.ts` — tRPC requests get hardcoded `{ userId: 'dev-user-001', sessionId: 'dev-session-001' }`
- `apps/server/src/routes/chat-stream.ts` — SSE endpoint returns `'dev-user-001'`
- `apps/server/src/routes/files.ts` — upload/download returns `'dev-user-001'`

**Client (6 files):**
- `apps/web/src/app/providers.tsx` — `DevProviders` (no ClerkProvider, null token)
- `apps/web/src/features/auth/AuthGuard.tsx` — passthrough, no redirect
- `apps/web/src/hooks/useAuthToken.ts` — returns `async () => null`
- `apps/web/src/hooks/useDevUser.ts` — mock user object (`Dev User`, `dev@a4.local`)
- `apps/web/src/components/Sidebar.tsx` — sign-out just redirects
- `apps/web/src/routes/_public/root-gate.tsx` — skips `useClerk()` call
- `apps/web/src/routes/_auth/sign-in.tsx` / `sign-up.tsx` — forms navigate to `/dashboard` directly

### Launch plan for auth
- **Production:** Set `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY` → bypass auto-disables → real auth works
- **Local dev:** Keep the bypass (only activates without keys, safe for development)
- **E2E tests:** Keep the bypass (all 46 tests rely on it, CI doesn't need Clerk keys)
- **Unit tests:** Already mock `DEV_AUTH_BYPASS` via `vi.mock` — some toggle it off to test 401 paths

### Migrating dev data to real user
All dev data (24 tables, ~70 uploaded files) is owned by `dev-user-001`. A migration script already exists:
- `apps/server/scripts/migrate-dev-user.ts` — reassigns all table rows + renames upload directory to a real Clerk user ID
- Run once after first real sign-in to keep demo/test data

---

## What's Already Done

- [x] 27 canvas item types, 61 components, 9 financial card types with full CRUD
- [x] 5-phase AI pipeline (chat, tools, RAG, insights, cross-workspace reasoning)
- [x] Clerk auth integration (real — needs keys set in prod)
- [x] tRPC routes protected with `protectedProcedure`
- [x] Rate limiting on API + chat endpoints
- [x] CI pipeline: lint, typecheck, unit tests, 46 E2E tests, build, security audit
- [x] Landing page overhaul (honest copy, 2-tier pricing, mobile nav, OG meta tags)
- [x] Auth pages (sign-in, sign-up) with Clerk OAuth + email/password

---

## Key Files

- Sign-out bug: `apps/web/src/components/Sidebar.tsx` (lines 580-587)
- Server env: `apps/server/src/env.ts` (DEV_AUTH_BYPASS flag)
- Server .env: `apps/server/.env` (contains real API keys — must remove from git)
- Stub routers: `apps/server/src/trpc/routers/user.ts`, `billing.ts`
- File upload: `apps/server/src/routes/files.ts` (local disk storage)
- CORS config: `apps/server/src/index.ts` (FRONTEND_URL env var)
