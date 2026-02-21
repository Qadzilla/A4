# A4 — Roadmap

> **Last updated:** 2026-02-19

---

## Built

- [x] Monorepo with 8 packages, all linking correctly
- [x] Zod schemas (7 files) with unit tests
- [x] 14 UI components with design tokens and dark mode
- [x] Auth flow (Clerk, AuthGuard, sign-in/sign-up/SSO, dev bypass)
- [x] Dashboard layout (collapsible sidebar, 6 nav items, theme toggle)
- [x] tRPC client + server with 10 routers (4 fully implemented, 6 stubs)
- [x] Express hardened (Helmet, CORS, rate limiting)
- [x] SQLite + Drizzle ORM with 6 tables
- [x] Workspace CRUD (create, read, update, soft-delete, restore, permanent delete, folder hierarchy, thumbnails)
- [x] Infinite canvas (dot grid, zoom/pan, double-click reset, fit-to-content)
- [x] Canvas items (A4 pages, secret cards, notes, table cards) with drag-drop from tool panel
- [x] BlockNote rich-text editor with canvas preview rendering
- [x] Canvas connections (anchor-based, cubic bezier curves, click-to-delete)
- [x] Canvas persistence (auto-save to DB via subscribe, load on entry, localStorage migration)
- [x] Marquee selection (draw rectangle → AABB intersection → static green ring highlight)
- [x] Smart guides (alignment snapping + equal spacing detection)
- [x] Item management (rename, duplicate, bring-to-front/send-to-back, resize with aspect lock)
- [x] Tab bar (open/close items, adjacent tab selection on close)
- [x] Vault encryption (PBKDF2 + AES-256-GCM, setup/unlock modals, passphrase generation)
- [x] Market data pipeline (Polygon.io search, aggregates, snapshots with DB caching)
- [x] Market WebSocket (real-time trade/quote streaming)
- [x] Workspace thumbnails (auto-captured, shown in homepage + grid)
- [x] Homepage (greeting, chat box, recent workspace cards)
- [x] Trash page (restore / permanent delete)
- [x] Settings page
- [x] CI pipeline (lint, typecheck, test, e2e, build, audit)

---

## Not Built

- [ ] **AI chat pipeline** — Anthropic SDK, streaming responses, workspace-scoped context injection
- [ ] **RAG** — Document embedding, vector search, context window management
- [x] **File upload (local)** — disk storage, Express upload endpoint, document parsing (PDF, CSV, Excel, Word, images, text), file-card canvas item
- [ ] **File upload (cloud)** — migrate local disk storage to S3/R2 for production deployment
- [ ] **Wire remaining routers** — folder, chat, financial, user, billing (currently stubs)
- [ ] **More DB tables** — conversations, messages, transactions, user profiles, billing
- [ ] **Integrations** — Plaid (bank feeds), Stripe (billing), QuickBooks/Xero (accounting)
- [ ] **Real-time chat** — SSE or WebSocket for streaming AI responses
- [ ] **Billing** — Stripe subscriptions, usage metering, plan enforcement
- [ ] **Team features** — Invitations, roles (viewer/editor/admin), shared workspaces
- [ ] **Production DB** — Migrate from SQLite to PostgreSQL (Neon/Supabase)
- [ ] **Deployment** — Docker, hosting (Vercel/Railway/Fly), production env config
- [ ] **Observability** — Logging, error tracking (Sentry), analytics
- [ ] **E2E tests** — Playwright tests with seeded data and Clerk test accounts
