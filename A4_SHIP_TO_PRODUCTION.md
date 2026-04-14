# A4 — Ship to Production

> **Created:** 2026-03-30
> **Status:** Pre-production planning — all 5 AI pipeline phases complete, CI passing.
> **Related docs:** [Architecture](./A4_ARCHITECTURE.md) | [Infrastructure](./A4_INFRASTRUCTURE.md) | [AI Pipeline](./A4_AI_PIPELINE.md) | [Pricing](./A4_PRICING.md)

---

## Current State

A4 is feature-complete for launch: 27 canvas item types, 28 AI tools, 5-phase AI pipeline (chat, tool use, RAG, proactive insights, cross-workspace reasoning), 381+ tests passing, full CI pipeline. What remains is **production hardening** — removing dev shortcuts, migrating infrastructure, adding billing, and polishing the experience.

This document is the critical path from "works on localhost" to "real users paying real money."

---

## Phase 1: Foundation Hardening (4 days)

Remove dev-only bypasses, complete stub routers, and close security gaps.

### Dev Auth Bypass Removal

The dev auth bypass (`DEV_AUTH_BYPASS`, `useDevUser`, `DevProviders`) must be removed before any user touches the system. It currently skips Clerk authentication entirely when `VITE_CLERK_PUBLISHABLE_KEY` is missing.

| Task | Files | Est |
|------|-------|-----|
| Remove `DEV_AUTH_BYPASS` flag and all conditional branches | ~16 files across web + server | 0.5d |
| Remove `useDevUser` hook and `DevProviders` component | `hooks/useDevUser.ts`, `app/providers.tsx` | 0.25d |
| Verify all `protectedProcedure` routers enforce real Clerk auth | All 20 tRPC routers | 0.25d |
| Update E2E tests to use Clerk test accounts instead of dev bypass | `apps/web/e2e/` | 0.5d |

### Stub Router Completion

5 tRPC routers are stubs that need real implementations:

| Router | Procedures | Priority | Est |
|--------|-----------|----------|-----|
| `folder` | `list`, `create`, `update`, `delete` | Medium — folders exist in DB, router just needs wiring | 0.5d |
| `user` | `getProfile`, `updateProfile` | High — needed for settings, onboarding | 0.5d |
| `billing` | `getCurrentPlan`, `getInvoices`, `updateSubscription`, `getUsage` | High — needed for tier enforcement | Phase 3 |
| `chat` | Already implemented in AI pipeline phases | Done | — |
| `financial` | `getSummary`, `getTransactions` | Low — can defer, AI tools cover this | 0.25d |

### Security Audit (OWASP Top 10)

| Check | Current State | Action |
|-------|--------------|--------|
| **Injection** | Drizzle ORM parameterizes all queries | Verify no raw SQL anywhere |
| **Broken Auth** | Clerk handles auth, `protectedProcedure` enforces | Verify after dev bypass removal |
| **Sensitive Data Exposure** | Vault uses AES-256-GCM client-side | Audit API responses for data leaks |
| **XSS** | React auto-escapes, Helmet sets CSP | Review `dangerouslySetInnerHTML` usage, tighten CSP |
| **Broken Access Control** | All queries filter by `ctx.userId` | Audit every router for missing user scoping |
| **Security Misconfiguration** | Helmet, CORS, rate limiting in place | Review production Helmet config, tighten CORS origins |
| **CSRF** | tRPC uses POST for mutations, Clerk handles session | Verify CSRF token on non-tRPC endpoints (file upload) |
| **Dependency Vulnerabilities** | `pnpm audit` runs in CI | Run full audit, resolve any high/critical |

**Phase 1 exit criteria:** All dev bypasses removed. All routers (except billing) implemented. Zero high/critical security findings.

---

## Phase 2: Database Migration (5 days)

Migrate from SQLite (better-sqlite3) to PostgreSQL (Neon serverless).

### Why Neon

| Consideration | Decision |
|--------------|----------|
| Serverless scaling | Neon scales to zero, pay per compute-second |
| pgvector | Native vector search for RAG (replaces brute-force cosine similarity) |
| Concurrent writes | SQLite WAL is single-server only; PG handles multi-server |
| Drizzle ORM support | First-class `drizzle-orm/neon-http` driver |
| Connection pooling | Neon's built-in pooler handles serverless connection limits |

### Migration Steps

| Step | Description | Est |
|------|-------------|-----|
| 1. Schema conversion | Convert all 21+ tables from `sqliteTable` to `pgTable` in `schema.ts` | 1d |
| 2. Driver swap | Replace `better-sqlite3` with `@neondatabase/serverless` + Drizzle adapter | 0.5d |
| 3. Type adjustments | SQLite `integer` timestamps → PG `timestamp`, `text` JSON → `jsonb`, blob embeddings → `vector(1536)` | 0.5d |
| 4. Migration scripts | Generate Drizzle migrations for the new PG schema | 0.5d |
| 5. Data migration tool | Script to export SQLite → import PostgreSQL (for existing dev data) | 0.5d |
| 6. Vector search upgrade | Replace brute-force cosine similarity with `pgvector` HNSW index | 1d |
| 7. Integration testing | Run full test suite against PG, fix any query differences | 1d |

### Key Schema Changes

```
SQLite                          → PostgreSQL
──────────────────────────────────────────────
sqliteTable                     → pgTable
integer (timestamp)             → timestamp('...', { withTimezone: true })
text (JSON strings)             → jsonb
blob (embeddings)               → vector(1536) via pgvector
text PK (UUID)                  → uuid PK with default gen_random_uuid()
integer (boolean)               → boolean
```

**Phase 2 exit criteria:** All tables migrated to PG. Full test suite passing against Neon. Vector search using pgvector HNSW index. SQLite driver fully removed.

---

## Phase 3: Billing & Tier Enforcement (9 days)

Implement Stripe subscriptions and the credit system defined in [A4_PRICING.md](./A4_PRICING.md).

### Stripe Integration

| Task | Description | Est |
|------|-------------|-----|
| Stripe SDK setup | Install `stripe` package, add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` env vars | 0.5d |
| Product/price creation | Create Starter/Core/Pro products and prices in Stripe dashboard | 0.25d |
| Checkout flow | Stripe Checkout Session for Core ($20/mo) and Pro ($100/mo) upgrades | 1d |
| Customer portal | Stripe Customer Portal for plan changes, payment method updates, invoice history | 0.5d |
| Webhook handler | `POST /api/stripe/webhook` — handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` | 1.5d |

### Subscription Management

| Task | Description | Est |
|------|-------------|-----|
| `subscriptions` DB table | `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_end` | 0.5d |
| `billing` router implementation | `getCurrentPlan`, `getInvoices`, `createCheckoutSession`, `createPortalSession`, `getUsage` | 1d |
| Plan display UI | Settings page section showing current plan, usage, upgrade/manage buttons | 0.5d |

### Credit System

| Task | Description | Est |
|------|-------------|-----|
| `credit_ledger` DB table | `user_id`, `amount`, `type` (grant/debit), `description`, `created_at` | 0.5d |
| Monthly credit grant | On subscription renewal webhook, credit the tier's monthly allowance | 0.25d |
| Credit deduction | Middleware that deducts credits on AI actions (chat, RAG, insights) | 0.5d |
| Usage tracking UI | Credit balance display, usage breakdown by action type | 0.5d |
| Rate limiting by credits | Reject AI requests when credits exhausted (Starter: hard cap, Core/Pro: allow overage) | 0.5d |

### Tier Enforcement Middleware

Feature gates enforced server-side via tRPC middleware:

| Feature | Starter | Core | Pro |
|---------|---------|------|-----|
| Workspace count | 1 | Unlimited | Unlimited |
| Canvas items per workspace | 20 | Unlimited | Unlimited |
| AI model access | Sonnet | Sonnet | Sonnet + Opus |
| Document upload + RAG | Blocked | Allowed | Allowed |
| Insights | Blocked | Allowed | Allowed |
| Multi-workspace reasoning | Blocked | Blocked | Allowed |
| Vault encryption | Blocked | Allowed | Allowed |
| Integrations | Blocked | Blocked | Allowed |

**Phase 3 exit criteria:** Users can subscribe via Stripe. Credits deducted on AI usage. Tier limits enforced. Webhook handles all subscription lifecycle events.

---

## Phase 4: Infrastructure & Deployment (6 days)

### Hosting Architecture

| Component | Service | Why |
|-----------|---------|-----|
| Frontend (React SPA) | **Vercel** | Zero-config Vite deployment, global CDN, preview deploys on PRs |
| Backend (Express + tRPC) | **Railway** | Docker container, auto-deploy from main, built-in logging, easy env vars |
| Database | **Neon** (PostgreSQL) | Serverless, scales to zero, pgvector, branching for preview environments |
| File Storage | **Cloudflare R2** | S3-compatible, zero egress fees, replaces local disk uploads |
| Auth | **Clerk** (already integrated) | Production keys, custom domain, webhook for user sync |
| DNS + CDN | **Cloudflare** | DNS, SSL, DDoS protection |

### Deployment Pipeline

| Task | Description | Est |
|------|-------------|-----|
| Dockerize server | Multi-stage Dockerfile for `apps/server` (build + prod stages) | 0.5d |
| Vercel config | `vercel.json` for frontend, env vars, custom domain | 0.25d |
| Railway config | `railway.toml`, health check endpoint, env vars | 0.25d |
| File storage migration | Replace local disk upload with R2 (S3-compatible SDK) | 1d |
| Environment config | Production env vars for all services, secrets management | 0.5d |
| CI/CD enhancement | Add deploy stages to GitHub Actions (deploy to staging on PR merge, production on release tag) | 1d |

### Observability

| Task | Description | Est |
|------|-------------|-----|
| Sentry (error tracking) | `@sentry/node` on server, `@sentry/react` on frontend, source maps upload in CI | 0.5d |
| Structured logging | Replace `console.log` with `pino` — JSON logs, request IDs, log levels | 0.5d |
| Health checks | `/health` endpoint with DB connectivity, Anthropic API reachability, R2 connectivity | 0.25d |
| Uptime monitoring | External ping (UptimeRobot or similar) on health endpoint | 0.25d |
| Analytics | PostHog for product analytics (page views, feature usage, funnel tracking) | 0.5d |

**Phase 4 exit criteria:** Frontend live on Vercel. Server live on Railway. Files stored in R2. Sentry capturing errors. Structured logs flowing. Health checks passing.

---

## Phase 5: Onboarding & UX Polish (4 days)

### New User Flow

| Task | Description | Est |
|------|-------------|-----|
| Welcome screen | Post-signup screen: "What do you want to manage?" (Personal / Business / Both) | 0.5d |
| Workspace scaffolding | Based on selection, create first workspace with suggested canvas items | 0.5d |
| Guided tour | Lightweight tooltip tour: canvas, tools panel, AI chat, tab bar (5-7 steps) | 1d |

### Empty States

Every page and panel needs a meaningful empty state:

| Location | Empty State |
|----------|-------------|
| Homepage (no workspaces) | "Create your first workspace" CTA with illustration |
| Canvas (no items) | "Drag tools from the panel or ask Paige to set up your workspace" |
| Chat panel (no conversations) | "Ask Paige anything about your finances" with example prompts |
| Insights panel (no insights) | "Run an analysis to discover insights about your data" |
| Workspaces page (no workspaces) | Create workspace button + workspace type suggestions |

### Error Handling

| Task | Description | Est |
|------|-------------|-----|
| Global error boundary | Catch React errors, show friendly message + "Report" button (Sentry) | 0.25d |
| API error toasts | tRPC errors surface as dismissible toast notifications | 0.25d |
| Offline indicator | Detect network loss, show banner, queue mutations for retry | 0.5d |
| Chat error recovery | If AI stream fails mid-response, show partial + retry button | 0.25d |
| File upload errors | Clear feedback for size limits, format errors, storage failures | 0.25d |

**Phase 5 exit criteria:** New users land on a guided experience. No blank/confusing screens. Errors are caught and communicated clearly.

---

## Phase 6: Pre-Launch Testing (5 days)

### Integration Testing

| Task | Description | Est |
|------|-------------|-----|
| Full E2E suite on staging | Run all Playwright tests against staging environment (real Clerk, real Neon, real R2) | 1d |
| Billing flow E2E | Stripe test mode: subscribe → use credits → exhaust → overage → upgrade → cancel | 0.5d |
| Cross-browser testing | Chrome, Firefox, Safari, Edge on desktop; Safari + Chrome on mobile | 0.5d |

### Load Testing

| Task | Description | Est |
|------|-------------|-----|
| API load test | k6 or Artillery: 100 concurrent users, measure p50/p95/p99 latency | 0.5d |
| AI pipeline load test | 20 concurrent chat streams, verify no dropped connections or OOM | 0.5d |
| File upload stress test | 50 concurrent uploads (10MB each), verify R2 handles it | 0.25d |

### Security Testing

| Task | Description | Est |
|------|-------------|-----|
| Dependency audit | `pnpm audit` — zero high/critical | 0.25d |
| Manual pen test | Test auth bypass, IDOR, XSS, CSRF, rate limit bypass | 0.5d |
| API fuzzing | Random/malformed inputs on all tRPC procedures | 0.5d |
| Data isolation verification | Create 2 test users, verify zero data leakage between them | 0.25d |

**Phase 6 exit criteria:** All tests pass on staging. No p99 > 2s under load. Zero security findings above low severity. Data isolation verified.

---

## Launch Timeline

```
Week 1-2  │ Phase 1: Foundation Hardening (4d)
Week 2-3  │ Phase 2: Database Migration (5d)
Week 4-5  │ Phase 3: Billing & Tier Enforcement (9d)
Week 6-7  │ Phase 4: Infrastructure & Deployment (6d)
Week 7-8  │ Phase 5: Onboarding & UX Polish (4d)
Week 8-9  │ Phase 6: Pre-Launch Testing (5d)
          │
Week 9-10 │ ── Alpha Launch ──────────────────────
          │   5-10 users (hand-picked, direct feedback)
          │   Goal: validate billing flow, find critical bugs
          │   All users on Core tier (free, for feedback)
          │
Week 11-13│ ── Beta Launch ───────────────────────
          │   50-100 users (waitlist, ProductHunt preview)
          │   Goal: stress test infrastructure, measure retention
          │   Real billing enabled, Starter + Core tiers
          │
Week 14+  │ ── General Availability ──────────────
          │   Public launch
          │   All 3 tiers live
          │   Marketing push
```

**Total estimated effort: ~33 working days (~7 weeks)**

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite → PG migration breaks queries | High | Run full test suite against PG in CI before cutting over |
| Stripe webhook reliability | Medium | Idempotent handlers, webhook event log table, manual reconciliation tool |
| AI cost overruns | High | Hard credit caps, max_tokens limits, cost monitoring alerts |
| Clerk rate limits in production | Medium | Cache user sessions, batch auth checks where possible |
| File storage migration data loss | High | Keep local storage as fallback during migration period, verify checksums |
| Neon cold start latency | Low | Neon's serverless driver handles reconnection; keep-alive ping if needed |

---

## Definition of "Production Ready"

- [ ] Zero dev auth bypasses in codebase
- [ ] All data in PostgreSQL (Neon), zero SQLite references
- [ ] Stripe billing live with all 3 tiers
- [ ] Files stored in Cloudflare R2, not local disk
- [ ] Frontend on Vercel with custom domain + SSL
- [ ] Server on Railway with Docker, health checks, auto-deploy
- [ ] Sentry capturing errors on both frontend and server
- [ ] Structured logging with request tracing
- [ ] New user onboarding flow complete
- [ ] All E2E tests passing on staging
- [ ] Load test results acceptable (p99 < 2s)
- [ ] Security audit complete, zero high/critical findings
- [ ] Data isolation verified between users
