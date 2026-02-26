# A4 — Architecture Overview

> **Last updated:** 2026-02-26
> **Status:** Canvas MVP complete. No AI chat pipeline yet.

**Detailed docs:** [Systems Reference](./A4_SYSTEMS.md) | [Roadmap](./A4_ROADMAP.md) | [Infrastructure](./A4_INFRASTRUCTURE.md) | [Financial Autonomy Checklist](./A4_FINANCIAL_AUTONOMY.md)

---

## 1. What Is A4

A4 is an **AI-powered financial workspace** built as a SaaS product. Users organize their financial life into **workspaces** — each workspace represents a portfolio, business, client, or initiative. Inside workspaces, users:

- **Create documents** on an infinite canvas (A4 pages with rich-text BlockNote editor)
- **Store secrets** (credentials, API keys) in client-side encrypted vault cards
- **Take notes** with inline-editable sticky notes on the canvas
- **Connect items** with anchor-based bezier curves to map relationships
- **Upload documents** (CSV, Excel, PDF) and organize them into folders
- **Connect integrations** (Plaid, Stripe, QuickBooks, Xero) for live data feeds
- **Track markets** with real-time Polygon.io data (stocks, crypto, forex)
- **Chat with AI** (Claude) scoped to their workspace's data — ask questions, spot trends, get summaries
- **View dashboards** — KPIs, revenue vs expenses, category breakdowns, time-series analytics

The AI is not a generic chatbot. It is **always grounded in the user's actual financial data** within a specific workspace context.

### Target Users

| Segment | Use Case |
|---|---|
| **Personal finance users** | Manage portfolios, track investments, organize tax documents |
| **SMB owners / founders** | Bookkeeping, cash flow analysis, expense categorization, financial planning |
| **Enterprise finance teams** | Multi-workspace management, team collaboration, client-scoped analysis |

### Core Concepts

| Concept | Description |
|---|---|
| **Workspace** | Top-level container. Has its own canvas, documents, conversations, and financial data. Supports nesting via folders. |
| **Canvas** | Infinite zoomable surface per workspace. Items positioned freely, connected with bezier curves, persisted to DB. |
| **Canvas Item** | A typed card on the canvas — 27 types: documents (`a4-page`), notes, secrets, data tools (tables, KPIs, charts, files, timers, embeds), finance tools (invoices, budgets, ledgers, receipts, subscriptions, accounts, portfolios, net worth, debt planners), financial statements (P&L, balance sheet, cash flow), calculators (tax estimator, loan/mortgage, projection, breakeven, depreciation, rent-vs-buy). |
| **Connection** | Anchor-to-anchor link between two canvas items. Rendered as cubic bezier SVG paths. |
| **Vault** | Per-user client-side encryption. Passphrase → PBKDF2 → AES-256-GCM. Server stores salt + verification only. |
| **Conversation** | AI chat session scoped to a workspace. Messages persisted. |
| **Transaction** | Financial record (income, expense, transfer) with amount, currency, category, date. |

---

## 2. Technology Stack

### Monorepo & Tooling

| Tool | Version | Purpose |
|---|---|---|
| **pnpm** | 9.15.4 | Package manager — strict deps, disk-efficient, native workspaces |
| **Turborepo** | 2.3.3+ | Monorepo orchestrator — task caching, parallelized builds |
| **Biome** | 1.9.4 | Linter + formatter (Rust-based, replaces ESLint + Prettier) |
| **TypeScript** | 5.7.3 | Strict mode, `noUncheckedIndexedAccess`, `bundler` module resolution |

### Frontend

| Tool | Version | Purpose |
|---|---|---|
| **React** | 19.0.0 | UI framework |
| **Vite** | 6.1.0 | Build tool / dev server |
| **React Router** | 7.1.3 | Client-side SPA routing, nested layouts, lazy loading |
| **TanStack Query** | 5.64.1 | Server state — caching, background refetch, optimistic updates |
| **Zustand** | 5.0.3 | Client state — minimal API, persist middleware, works outside React tree |
| **React Hook Form** | 7.54.2 | Forms — uncontrolled by default, Zod integration |
| **BlockNote** | 0.46.x | Rich-text block editor (`@blocknote/react` + `@blocknote/mantine`) |
| **Recharts** | 2.15.0 | Charts — composable, responsive, D3-based |
| **Clerk React** | 5.18.0 | Auth UI — `<SignIn>`, `<SignUp>`, `<UserButton>` |

### Backend

| Tool | Version | Purpose |
|---|---|---|
| **Express** | 4.21.2 | HTTP server |
| **tRPC** | 11.0.0-rc.682 | Type-safe API — end-to-end types, Zod validation, TanStack Query integration |
| **Clerk Express** | 1.3.10 | Auth middleware — session extraction, `req.auth` |
| **Helmet** | 8.0.0 | Security headers (CSP, HSTS, X-Content-Type, X-Frame) |
| **express-rate-limit** | 7.5.0 | Rate limiting — 100 req/min on `/trpc` |
| **superjson** | 2.2.2 | tRPC transformer — serializes Dates, Maps, Sets, BigInts |

### Database

| Tool | Version | Purpose |
|---|---|---|
| **better-sqlite3** | 12.6.2 | Embedded SQLite (dev/MVP — migrate to PostgreSQL for production) |
| **Drizzle ORM** | 0.45.1 | Type-safe SQL, schema definitions, migrations |

### Shared

| Tool | Version | Purpose |
|---|---|---|
| **Zod** | 3.24.1 | Schema validation — single source of truth for types + runtime validation |
| **Tailwind CSS** | 4.0.6 | Utility-first CSS — v4 `@theme` for design tokens |
| **Radix UI** | Various 1.x/2.x | Accessible unstyled primitives (WAI-ARIA compliant) |
| **class-variance-authority** | 0.7.1 | Type-safe component variants |
| **clsx + tailwind-merge** | 2.1.1 / 2.6.0 | `cn()` utility for conflict-free class composition |

### Testing

| Tool | Version | Purpose |
|---|---|---|
| **Vitest** | 3.0.5 | Unit / integration tests — Vite-native, Jest-compatible |
| **Playwright** | 1.50.1 | E2E tests — cross-browser, Chromium-only in CI |
| **@testing-library/react** | 16.2.0 | Component testing — user-centric DOM queries |

---

## 3. Monorepo Structure

```
A4/
├── apps/
│   ├── web/                          # React + Vite frontend
│   │   ├── src/
│   │   │   ├── app/                  # App.tsx, router.tsx, providers.tsx
│   │   │   ├── routes/
│   │   │   │   ├── _auth/            # sign-in, sign-up, sso-callback
│   │   │   │   └── _dashboard/       # Layout + all authenticated pages
│   │   │   │       ├── workspaces/   # list, [id] detail (canvas), [id]/folder
│   │   │   │       ├── usage/
│   │   │   │       ├── trash/
│   │   │   │       ├── frameworks/
│   │   │   │       └── settings/
│   │   │   ├── features/             # Business logic modules
│   │   │   │   └── auth/             # AuthGuard
│   │   │   ├── components/
│   │   │   │   ├── Sidebar.tsx       # Collapsible nav sidebar
│   │   │   │   ├── ThemeToggle.tsx   # Light/dark/system toggle
│   │   │   │   ├── canvas/           # 61 canvas components (renderer, minimap, 27 content, 27 views, 6 tool panels, tab bar)
│   │   │   │   └── vault/            # VaultSetupModal, VaultUnlockModal
│   │   │   ├── hooks/                # useDebounce, useMediaQuery, useTheme, useDevUser,
│   │   │   │                         # useWorkspaceThumbnail, useCanvasDrop, useMarketWebSocket
│   │   │   ├── stores/
│   │   │   │   ├── ui-store.ts       # Sidebar collapsed, theme (persisted)
│   │   │   │   ├── canvas-store.ts   # Items, connections, selection, highlights (27 item types)
│   │   │   │   └── market-store.ts   # Real-time quotes/trades
│   │   │   ├── lib/                  # 30 utility files
│   │   │   │   ├── trpc.ts           # tRPC client with Clerk token injection
│   │   │   │   ├── canvas-utils.ts   # Alignment, spacing, anchors, bezier paths
│   │   │   │   ├── vault-crypto.ts   # PBKDF2 + AES-256-GCM encryption
│   │   │   │   ├── *-utils.ts        # Per-item-type utils (table, kpi, chart, invoice, budget, ledger, receipt, subscription, account, portfolio, networth, debt-planner, rent-vs-buy, pnl, balance-sheet, cash-flow, tax-estimator, loan-calculator, projection, breakeven, depreciation, timer, file, embed, currency)
│   │   │   │   └── tax-data.ts       # US federal + 50 state tax brackets/rates
│   │   │   ├── styles/               # global.css
│   │   │   ├── constants/            # ROUTES object
│   │   │   └── types/                # Re-exports from @a4/shared-types
│   │   └── e2e/                      # Playwright specs
│   │
│   └── server/                       # Express + tRPC backend
│       ├── src/
│       │   ├── index.ts              # Express: Helmet, CORS, rate limit, Clerk, tRPC
│       │   ├── env.ts                # Zod-validated environment variables
│       │   ├── db/
│       │   │   ├── index.ts          # Drizzle + better-sqlite3 (WAL mode, FK on)
│       │   │   └── schema.ts         # 21 tables
│       │   └── trpc/
│       │       ├── trpc.ts           # initTRPC, publicProcedure, protectedProcedure
│       │       ├── context.ts        # Auth context + DB instance
│       │       ├── router.ts         # Root router (20 sub-routers)
│       │       └── routers/          # 20 routers
│       └── a4.db                     # SQLite database file (gitignored)
│
├── packages/
│   ├── ui/                           # 14 Radix+CVA components
│   ├── shared-schemas/               # 16 Zod schema files
│   ├── shared-types/                 # z.infer types + AppRouter type
│   ├── tailwind-config/              # base.css — design tokens, dark mode
│   └── typescript-config/            # Shared tsconfig bases (base, react, node)
│
├── tooling/
│   └── biome/                        # Shared Biome config
│
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Package Dependency Graph

```
@a4/typescript-config
  ↑
  ├── @a4/shared-schemas  (+ zod)
  │     ↑
  │     └── @a4/shared-types  (+ zod, @trpc/server)
  │           ↑
  │           ├── @a4/web  (+ react, react-router, tanstack-query, trpc-client, clerk-react, zustand, rhf, recharts, blocknote, superjson)
  │           └── @a4/server  (+ express, trpc-server, clerk-express, helmet, cors, rate-limit, superjson, drizzle, better-sqlite3)
  │
  ├── @a4/ui  (+ radix-ui/*, cva, clsx, tailwind-merge)
  │     ↑
  │     └── @a4/web
  │
  └── @a4/tailwind-config
        ↑
        ├── @a4/ui
        └── @a4/web
```

---

## 5. Architectural Patterns

### Type Safety Chain
```
Zod Schema (shared-schemas)
  → z.infer (shared-types)
    → tRPC router input/output (server)
      → tRPC client hooks (web)
        → React Hook Form resolver (web)
```
One schema change propagates type errors across the entire stack at compile time.

### Auth Flow
```
Browser → Clerk JS → Session cookie
  → Express request → clerkMiddleware() → req.auth.userId
    → tRPC context → protectedProcedure → handler has ctx.userId
      → Database query filters by userId (row-level security)
```

### State Management Split

| State type | Tool | Examples |
|---|---|---|
| **Server data** | TanStack Query (via tRPC) | Workspaces, canvas items, vault config, market data |
| **UI state** | Zustand (persisted) | Sidebar collapsed, theme, dashboard filters |
| **Canvas state** | Zustand (non-persisted) | Items, connections, selection, highlights — synced to DB via debounced auto-save |
| **Market state** | Zustand (non-persisted) | Real-time quotes/trades from WebSocket |
| **Form state** | React Hook Form + Zod | Create workspace, update profile, chat input |
| **URL state** | React Router | Current page, workspaceId, folderId |

### Component Architecture
- **Routes** (`routes/`) are thin — compose feature components and pass URL params
- **Features** (`features/`) own domain logic: components, hooks, stores, mutations
- **Components** (`components/`) are app-wide shared: layout, canvas, vault
- **UI** (`packages/ui/`) are design-system primitives: no business logic, no data fetching

### Provider Tree
```
ClerkProvider
  └── QueryClientProvider
        └── TRPCProvider
              └── RouterProvider
                    └── DashboardLayout (AuthGuard)
                          └── Page Component
```

---

## 6. Route Map

| Path | Page | Auth | Description |
|---|---|---|---|
| `/sign-in` | SignInPage | No | Clerk `<SignIn>` |
| `/sign-up` | SignUpPage | No | Clerk `<SignUp>` |
| `/sso-callback` | SSOCallbackPage | No | Clerk SSO redirect handler |
| `/` | HomePage | Yes | Greeting, chat box, recent workspace cards with thumbnails |
| `/workspaces` | WorkspacesPage | Yes | Workspace grid with create dialog, folder tree |
| `/workspaces/:id` | WorkspaceDetailPage | Yes | Infinite canvas with items, connections, tools panel, tab bar, chat sidebar |
| `/workspaces/:id/folder` | FolderDetailPage | Yes | Folder contents within a workspace |
| `/usage` | UsagePage | Yes | Usage metrics (placeholder) |
| `/trash` | TrashPage | Yes | Soft-deleted workspaces — restore or permanent delete |
| `/frameworks` | FrameworksPage | Yes | Frameworks (placeholder) |
| `/settings` | SettingsPage | Yes | User settings |

---

## 7. tRPC Router Map

| Router | Procedures | Auth | Status |
|---|---|---|---|
| `health` | `check` | Public | Implemented |
| `workspace` | `list`, `getById`, `create`, `update`, `delete`, `listByFolder`, `updateThumbnail`, `listTrashed`, `restore`, `permanentDelete` | Protected | **Fully implemented** |
| `canvas` | `load`, `save` | Protected | **Fully implemented** |
| `vault` | `getConfig`, `setup` | Protected | **Fully implemented** |
| `marketData` | `searchTickers`, `getTickerDetail`, `getAggregates`, `getSnapshot` | Protected | **Fully implemented** |
| `account` | `list`, `create`, `update`, `delete`, `getSummary` | Protected | **Fully implemented** |
| `budget` | `listGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `getSummary` | Protected | **Fully implemented** |
| `category` | `list`, `create`, `update`, `delete` | Protected | **Fully implemented** |
| `invoice` | `list`, `create`, `update`, `delete`, `listLineItems`, `createLineItem`, `updateLineItem`, `deleteLineItem`, `getSummary` | Protected | **Fully implemented** |
| `receipt` | `list`, `create`, `update`, `delete`, `getSummary` | Protected | **Fully implemented** |
| `subscription` | `list`, `create`, `update`, `delete`, `getSummary` | Protected | **Fully implemented** |
| `holding` | `list`, `create`, `update`, `delete`, `getSummary` | Protected | **Fully implemented** |
| `debt` | `list`, `create`, `update`, `delete`, `getSummary` | Protected | **Fully implemented** |
| `networth` | `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `seedDefaults`, `listEntries`, `createEntry`, `updateEntry`, `deleteEntry`, `getSummary` | Protected | **Fully implemented** |
| `folder` | `list`, `create`, `update`, `delete` | Protected | Stubs |
| `chat` | `listConversations`, `getConversation`, `createConversation`, `sendMessage`, `deleteConversation` | Protected | Stubs |
| `financial` | `getSummary`, `getTransactions` | Protected | Stubs |
| `user` | `getProfile`, `updateProfile` | Protected | Stubs |
| `billing` | `getCurrentPlan`, `getInvoices` | Protected | Stubs |

---

## 8. Key Conventions

| Convention | Rule |
|---|---|
| **Package scope** | `@a4/*` |
| **Imports** | Biome auto-sorts. External first, then `@/` aliases, then relative. |
| **Component files** | PascalCase (`WorkspaceCard.tsx`). One component per file. |
| **Feature exports** | Every feature has an `index.ts` barrel export. Routes import from `@/features/x`. |
| **Route files** | Default exports only (required for `lazy()`). Thin — compose features. |
| **Schemas** | Defined in `shared-schemas`. Types derived via `z.infer` in `shared-types`. Never define types manually. |
| **Styles** | Tailwind utility classes only. No CSS modules. Design tokens via `@theme`. `cn()` for class composition. |
| **State** | Server state in TanStack Query. Canvas/UI state in Zustand. Form state in RHF. URL state in React Router. |
| **Auth** | All dashboard routes wrapped in `AuthGuard`. All tRPC mutations/queries use `protectedProcedure`. **Dev bypass:** when `VITE_CLERK_PUBLISHABLE_KEY` is missing, auth is skipped and a mock user is injected. Remove before production. |
| **Canvas store** | Global Zustand (not workspace-scoped). Must `loadItems()` on entry, auto-saves via `subscribe`, flushes on cleanup. |
| **BlockNote CSS** | Must be imported via JS (`import '@blocknote/mantine/style.css'` in main.tsx), not CSS `@import`. |
| **Testing** | Unit tests co-located in `__tests__/`. E2E tests in `e2e/`. Vitest for unit, Playwright for E2E. |
| **Env vars** | Client-safe vars prefixed with `VITE_`. Secrets never prefixed with `VITE_`. Validated with Zod on server. |
