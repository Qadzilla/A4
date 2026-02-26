# A4 — Roadmap

> **Last updated:** 2026-02-26

---

## Built

- [x] Monorepo with 8 packages, all linking correctly
- [x] Zod schemas (7 files) with unit tests
- [x] 14 UI components with design tokens and dark mode
- [x] Auth flow (Clerk, AuthGuard, sign-in/sign-up/SSO, dev bypass)
- [x] Dashboard layout (collapsible sidebar, 6 nav items, theme toggle)
- [x] tRPC client + server with 20 routers (15 fully implemented, 5 stubs)
- [x] Express hardened (Helmet, CORS, rate limiting)
- [x] SQLite + Drizzle ORM with 21 tables
- [x] Workspace CRUD (create, read, update, soft-delete, restore, permanent delete, folder hierarchy, thumbnails)
- [x] Infinite canvas (dot grid, zoom/pan, double-click reset, fit-to-content)
- [x] Canvas items (A4 pages, secret cards, notes, table cards, KPI cards, chart cards, file cards, timer cards) with drag-drop from tool panel
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
- [x] KPI cards with table binding (sum/avg/min/max/count/latest aggregation)
- [x] Chart cards (pie, bar, line, area via Recharts, table-card binding)
- [x] File upload (local disk, Express endpoint, PDF/CSV/Excel/Word/image preview generation)
- [x] Timer cards (countdown to deadline, live ticking, color presets)
- [x] CI pipeline (lint, typecheck, test, e2e, build, audit)
- [x] Invoice cards (line items, tax, from/to, status pills, PDF export)
- [x] Budget cards (period-based, category groups with colors, table-card binding for actuals, progress bars)
- [x] Ledger cards (income/expense entries, categories with colors, running balance, type/category filters, multi-currency)
- [x] Receipt cards (receipt capture, categorization, evidence linking)
- [x] Subscription cards (recurring bills tracker with renewal alerts)
- [x] Account cards (bank/brokerage/card balance overview)
- [x] P&L statement cards (12-month multi-step income statement, waterfall chart, margin analysis)
- [x] Balance sheet cards (assets, liabilities, equity; ratios; balance indicator)
- [x] Cash flow statement cards (12-month indirect method, 3 GAAP sections, rolling cash balance, burn rate/runway)
- [x] Tax estimator cards (US federal + state, 2025/2026, all filing statuses, all 50 states + DC, FICA/SE, credits, withholding)
- [x] Loan/mortgage calculator cards (amortization schedule, PITI+PMI+HOA breakdown, extra payment savings, PMI auto-drop at 80% LTV)
- [x] Projection calculator cards (compound growth with monthly contributions, inflation adjustment, year-by-year schedule)
- [x] Break-even calculator cards (contribution margin, break-even units/revenue, profit/loss schedule, negative margin handling)
- [x] Depreciation calculator cards (4 methods: SL/DB/DDB/SYD, year-by-year schedule, book value tracking)
- [x] Portfolio cards (holdings, target allocation, drift analysis, rebalance trades)
- [x] Net worth cards (assets/liabilities by category, default categories, balance breakdown)
- [x] Debt planner cards (snowball/avalanche strategy, paydown simulation, interest savings)
- [x] Rent-vs-buy calculator cards (monthly comparison, breakeven year, 30-year total cost)
- [x] Embed cards (external URL embedding)
- [x] DB migration — all 9 financial card types (invoice, budget, receipt, subscription, account, holding, debt, networth + categories) backed by dedicated DB tables with tRPC CRUD routers
- [x] Canvas minimap (bottom-right overview, green item rectangles, viewport indicator, theme-aware, dynamic positioning with tools panel)

---

## Not Built

### Financial canvas tools (before AI)

- [x] ~~Invoice card~~ — Built
- [x] ~~Budget card~~ — Built
- [x] ~~Receipt card~~ — Built
- [x] ~~Ledger card~~ — Built
- [x] ~~Account card~~ — Built
- [x] ~~Subscription card~~ — Built
- [x] ~~Embed card~~ — Built (embed-card)
- [x] ~~Portfolio card~~ — Built (portfolio-card)
- [x] ~~Net worth card~~ — Built (networth-card)
- [x] ~~Debt planner card~~ — Built (debt-planner-card)
- [x] ~~Rent-vs-buy card~~ — Built (rent-vs-buy-card)

### Financial calculators & generators

- [x] ~~P&L / income statement generator~~ — Built (pnl-card)
- [x] ~~Balance sheet generator~~ — Built (balance-sheet-card)
- [x] ~~Cash flow statement generator~~ — Built (cash-flow-card)
- [x] ~~Tax estimator / projection model~~ — Built (tax-estimator-card)
- [ ] **Tax form templates** — W-2, 1099, Schedule C pre-built structures
- [x] ~~Loan / mortgage calculator~~ — Built (loan-calculator-card)
- [x] ~~Financial projections / forecasting~~ — Built (projection-card)
- [x] ~~Break-even analysis~~ — Built (breakeven-card)
- [x] ~~Depreciation schedule~~ — Built (depreciation-card)

### Infrastructure & platform

- [ ] **AI chat pipeline** — Anthropic SDK, streaming responses, workspace-scoped context injection
- [ ] **RAG** — Document embedding, vector search, context window management
- [ ] **File upload (cloud)** — migrate local disk storage to S3/R2 for production deployment
- [ ] **Wire remaining routers** — folder, chat, financial, user, billing (5 stubs remain)
- [ ] **More DB tables** — conversations, messages, user profiles, billing
- [ ] **Integrations** — Plaid (bank feeds), Stripe (billing), QuickBooks/Xero (accounting)
- [ ] **Real-time chat** — SSE or WebSocket for streaming AI responses
- [ ] **Billing** — Stripe subscriptions, usage metering, plan enforcement
- [ ] **Team features** — Invitations, roles (viewer/editor/admin), shared workspaces
- [ ] **Production DB** — Migrate from SQLite to PostgreSQL (Neon/Supabase)
- [ ] **Deployment** — Docker, hosting (Vercel/Railway/Fly), production env config
- [ ] **Observability** — Logging, error tracking (Sentry), analytics
- [ ] **E2E tests** — Playwright tests with seeded data and Clerk test accounts
