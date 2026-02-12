# A4 — Architecture & Workspace Reference

> **Last updated:** 2026-02-11
> **Status:** Scaffold complete. Database wired (SQLite + Drizzle). Workspace CRUD fully implemented. Canvas with zoom/pan/highlight tools. No AI pipeline yet.

---

## 1. What Is A4

A4 is an **AI-powered financial workspace** built as a SaaS product. Users organize their financial life into **workspaces** — each workspace represents a portfolio, business, client, or initiative. Inside workspaces, users:

- **Upload documents** (CSV, Excel, PDF) and organize them into folders
- **Connect integrations** (Plaid, Stripe, QuickBooks, Xero) for live data feeds
- **Chat with AI** (Claude) scoped to their workspace's data — ask questions, spot trends, get summaries
- **Generate outputs** — forecasts, memos, spreadsheets, reports, charts
- **View dashboards** — KPIs, revenue vs expenses, category breakdowns, time-series analytics

The AI is not a generic chatbot. It is **always grounded in the user's actual financial data** within a specific workspace context. Claude reads uploaded documents and connected feeds, then reasons over them.

### Target Users

| Segment | Use Case |
|---|---|
| **Personal finance users** | Manage portfolios, track investments, organize tax documents |
| **SMB owners / founders** | Bookkeeping, cash flow analysis, expense categorization, financial planning |
| **Enterprise finance teams** | Multi-workspace management, team collaboration, client-scoped analysis |

All segments use the same platform with tiered access (free -> pro -> enterprise).

### Core Concepts

| Concept | Description |
|---|---|
| **Workspace** | Top-level container. Represents a portfolio, business, or initiative. Has its own folders, documents, conversations, and financial data. |
| **Folder** | Nested tree structure within a workspace for organizing uploaded files. Supports arbitrary depth. |
| **Conversation** | An AI chat session. Can be global (cross-workspace) or scoped to a specific workspace. Messages are persisted. |
| **Transaction** | A financial record (income, expense, transfer) with amount, currency, category, date. Belongs to a workspace. |
| **Financial Summary** | Aggregated view: total income, expenses, net profit, transaction count over a date range. |

---

## 2. Technology Stack

### Monorepo & Tooling

| Tool | Version | Purpose | Why chosen |
|---|---|---|---|
| **pnpm** | 9.15.4 | Package manager | Strict dependency resolution, disk-efficient via content-addressable storage, native workspace support |
| **Turborepo** | 2.3.3+ | Monorepo orchestrator | Task caching (local + remote), parallelized builds, dependency-aware task graph |
| **Biome** | 1.9.4 | Linter + formatter | Single tool replaces ESLint + Prettier, fast (Rust-based), consistent config |
| **TypeScript** | 5.7.3 | Type system | Strict mode, `noUncheckedIndexedAccess`, `bundler` module resolution for frontend, shared base configs |

### Frontend

| Tool | Version | Purpose | Why chosen |
|---|---|---|---|
| **React** | 19.0.0 | UI framework | Industry standard, vast ecosystem, concurrent features |
| **Vite** | 6.1.0 | Build tool / dev server | Fast HMR, native ESM, plugin ecosystem |
| **React Router** | 7.1.3 | Client-side routing | Declarative SPA mode, lazy loading, nested layouts |
| **TanStack Query** | 5.64.1 | Server state management | Caching, background refetching, optimistic updates, integrated with tRPC |
| **Zustand** | 5.0.3 | Client state management | Minimal API, persist middleware, no boilerplate, works outside React tree |
| **React Hook Form** | 7.54.2 | Form management | Uncontrolled by default (performant), native Zod integration via `@hookform/resolvers` |
| **Recharts** | 2.15.0 | Charts | React-native composable API, responsive containers, built on D3 |
| **Clerk React** | 5.18.0 | Auth UI components | Drop-in `<SignIn>`, `<SignUp>`, `<UserButton>`, SSO callback handling |

### Backend

| Tool | Version | Purpose | Why chosen |
|---|---|---|---|
| **Express** | 4.21.2 | HTTP server | Mature, wide middleware ecosystem, tRPC has first-class Express adapter |
| **tRPC** | 11.0.0-rc.682 | Type-safe API layer | End-to-end type safety with zero codegen, Zod validation built-in, TanStack Query integration |
| **Clerk Express** | 1.3.10 | Auth middleware | Extracts session from cookies/Bearer tokens, populates `req.auth` |
| **Helmet** | 8.0.0 | Security headers | CSP, HSTS, X-Content-Type-Options, X-Frame-Options out of the box |
| **express-rate-limit** | 7.5.0 | Rate limiting | Protects `/trpc` endpoint, 100 req/min default |
| **superjson** | 2.2.2 | tRPC transformer | Serializes Dates, Maps, Sets, BigInts over JSON — needed for Zod date schemas |
| **tsx** | 4.19.2 | Dev runner | Runs TypeScript directly via esbuild, watch mode for development |

### Shared / Cross-cutting

| Tool | Version | Purpose | Why chosen |
|---|---|---|---|
| **Zod** | 3.24.1 | Schema validation | Single source of truth for types AND runtime validation, shared between frontend + backend |
| **Tailwind CSS** | 4.0.6 | Utility-first CSS | v4 `@theme` directive for design tokens, CSS-native (no JS config file), fast |
| **Radix UI** | Various 1.x/2.x | Accessible primitives | Unstyled, WAI-ARIA compliant, composable — we own the visual layer |
| **class-variance-authority** | 0.7.1 | Component variants | Type-safe variant management for CVA-based component APIs |
| **clsx + tailwind-merge** | 2.1.1 / 2.6.0 | Class composition | `cn()` utility merges Tailwind classes without conflicts |

### Testing

| Tool | Version | Purpose | Why chosen |
|---|---|---|---|
| **Vitest** | 3.0.5 | Unit / integration tests | Vite-native, same config, fast, Jest-compatible API |
| **Playwright** | 1.50.1 | E2E tests | Cross-browser, auto-waits, Chromium-only in CI for speed |
| **@testing-library/react** | 16.2.0 | Component testing | User-centric testing philosophy, DOM queries by accessibility role |

### Recently Added

| Tool | Version | Purpose |
|---|---|---|
| **Drizzle ORM** | 0.45.1 | Type-safe SQL queries, schema definitions, migrations |
| **better-sqlite3** | 12.6.2 | Embedded SQLite database (dev/MVP — migrate to PostgreSQL for production) |
| **drizzle-kit** | 0.31.9 (dev) | DB push, generate, migrate, studio CLI |

### Not Yet Installed (Planned)

| Tool | Purpose | When needed |
|---|---|---|
| **PostgreSQL** (via Neon/Supabase) | Production database (replace SQLite) | Phase: Production DB |
| **Anthropic SDK** (`@anthropic-ai/sdk`) | Claude API integration for AI chat | Phase: AI Pipeline |
| **Plaid SDK** | Bank account linking, transaction feeds | Phase: Integrations |
| **Stripe** | Billing, subscriptions, usage metering | Phase: Billing |
| **AWS S3 / Cloudflare R2** | File storage for uploaded documents | Phase: File Upload |
| **pdf-parse / xlsx** | Document parsing (PDF text extraction, Excel parsing) | Phase: File Upload |
| **OpenAI embeddings or similar** | Document embedding for RAG | Phase: AI Pipeline |
| **Docker** | Containerized deployment | Phase: Deployment |

---

## 3. Monorepo Structure

```
A4/                                # Root directory
├── apps/
│   ├── web/                       # React + Vite frontend
│   │   ├── src/
│   │   │   ├── app/               # App.tsx, router.tsx, providers.tsx
│   │   │   ├── routes/            # Thin page components
│   │   │   │   ├── _auth/         # sign-in, sign-up, sso-callback
│   │   │   │   └── _dashboard/    # Layout + all authenticated pages
│   │   │   │       ├── workspaces/  # list, [id] detail (canvas), [id]/folder
│   │   │   │       ├── usage/     # usage page
│   │   │   │       ├── trash/     # trash page
│   │   │   │       └── frameworks/ # frameworks page
│   │   │   ├── features/          # Business logic modules
│   │   │   │   └── auth/          # AuthGuard
│   │   │   ├── components/        # App-wide: Sidebar, ThemeToggle
│   │   │   ├── hooks/             # useDebounce, useMediaQuery, useTheme, useDevUser, useWorkspaceThumbnail
│   │   │   ├── stores/            # ui-store (sidebar collapsed, theme)
│   │   │   ├── lib/               # trpc.ts, clerk.ts, query-client.ts
│   │   │   ├── styles/            # global.css (Tailwind + dark mode)
│   │   │   ├── constants/         # ROUTES object
│   │   │   ├── types/             # Re-exports from @a4/shared-types + app-specific
│   │   │   └── test/              # setup.ts, constants.test.ts
│   │   ├── e2e/                   # Playwright specs (auth.spec.ts)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── vitest.config.ts
│   │   ├── playwright.config.ts
│   │   └── tsconfig.json
│   │
│   └── server/                    # Express + tRPC backend
│       ├── src/
│       │   ├── index.ts           # Express app: Helmet, CORS, rate limit, Clerk, tRPC handler
│       │   ├── env.ts             # Zod-validated environment variables
│       │   ├── db/
│       │   │   ├── index.ts       # Drizzle + better-sqlite3 connection (WAL mode, FK on)
│       │   │   └── schema.ts      # Table definitions (workspaces)
│       │   ├── trpc/
│       │   │   ├── trpc.ts        # initTRPC, publicProcedure, protectedProcedure (ctx includes db)
│       │   │   ├── context.ts     # Auth context from Clerk middleware + DB instance
│       │   │   ├── router.ts      # Root router (combines all sub-routers), exports AppRouter type
│       │   │   └── routers/       # 7 routers (workspace = real, others = stubs)
│       │   │       ├── health.ts
│       │   │       ├── workspace.ts  # Fully implemented — 10 procedures with real DB queries
│       │   │       ├── folder.ts
│       │   │       ├── chat.ts
│       │   │       ├── financial.ts
│       │   │       ├── user.ts
│       │   │       └── billing.ts
│       │   └── __tests__/         # health.test.ts, workspace.test.ts
│       ├── a4.db                  # SQLite database file (gitignored)
│       └── tsconfig.json
│
├── packages/
│   ├── ui/                        # Custom component library
│   │   └── src/
│   │       ├── lib/cn.ts          # clsx + tailwind-merge utility
│   │       ├── components/        # 14 components: Button, Input, Textarea, Label, Card, Dialog, Modal, Badge, Tabs, Select, Checkbox, Tooltip, DropdownMenu, Skeleton
│   │       ├── styles.css         # Imports tailwind-config/base.css
│   │       └── index.ts           # Barrel export
│   │
│   ├── shared-schemas/            # Zod schemas (source of truth)
│   │   └── src/
│   │       ├── workspace.ts         # workspaceSchema, createWorkspaceSchema, updateWorkspaceSchema
│   │       ├── folder.ts          # folderSchema, createFolderSchema, updateFolderSchema
│   │       ├── chat.ts            # messageSchema, conversationSchema, sendMessageSchema, etc.
│   │       ├── financial.ts       # transactionSchema, financialSummarySchema, financialFilterSchema, currencySchema
│   │       ├── user.ts            # userProfileSchema, updateProfileSchema
│   │       ├── index.ts           # Barrel export
│   │       └── __tests__/         # 3 test files, 22 tests
│   │
│   ├── shared-types/              # TypeScript types via z.infer
│   │   └── src/
│   │       ├── index.ts           # Workspace, Folder, Message, Transaction, etc.
│   │       └── trpc.ts            # AppRouter placeholder type (to be replaced by real server export)
│   │
│   ├── tailwind-config/           # Design system tokens
│   │   └── base.css               # @theme directive: colors, radius, fonts, shadows, dark mode overrides, keyframes
│   │
│   └── typescript-config/         # Shared tsconfig bases
│       ├── base.json              # Strict, bundler resolution, ES2022
│       ├── react.json             # Extends base + JSX, DOM libs
│       └── node.json              # Extends base + NodeNext resolution
│
├── tooling/
│   └── biome/                     # Shared Biome config
│       └── biome.json             # Rules, formatting (2-space, single quotes, trailing commas), ignores
│
├── .github/workflows/ci.yml      # Full CI pipeline
├── turbo.json                     # Task definitions: dev, build, typecheck, lint, test, test:e2e, clean
├── pnpm-workspace.yaml            # Workspace: apps/*, packages/*, tooling/*
├── biome.json                     # Root extends tooling/biome/biome.json
├── .env.example                   # All env vars documented
├── .gitignore
└── package.json                   # Root scripts, pnpm 9.15.4, node >=20
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
  │           ├── @a4/web  (+ react, react-router, tanstack-query, trpc-client, clerk-react, zustand, rhf, recharts, superjson)
  │           └── @a4/server  (+ express, trpc-server, clerk-express, helmet, cors, rate-limit, superjson)
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
| **Server data** | TanStack Query (via tRPC) | Workspaces, folders, conversations, transactions |
| **UI state** | Zustand (persisted) | Sidebar collapsed, theme, dashboard filters, active modal |
| **Form state** | React Hook Form + Zod | Create workspace, update profile, chat input |
| **URL state** | React Router | Current page, workspaceId, folderId, conversationId |

### Component Architecture
- **Routes** (`routes/`) are thin — they compose feature components and pass URL params
- **Features** (`features/`) own domain logic: components, hooks, stores, mutations
- **Components** (`components/`) are app-wide shared: layout, feedback, navigation
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

## 6. Security Model

| Layer | Mechanism | Status |
|---|---|---|
| **Authentication** | Clerk (SOC 2 compliant, MFA, session cookies) | Implemented |
| **Authorization** | `protectedProcedure` rejects unauthenticated requests | Implemented |
| **Input validation** | Zod on every tRPC procedure input | Implemented (schemas exist) |
| **Row-level security** | Every DB query filters by `ctx.userId` | Implemented (workspace router) |
| **Security headers** | Helmet.js (CSP, HSTS, X-Content-Type, X-Frame) | Implemented |
| **CORS** | Strict — only `FRONTEND_URL` origin allowed | Implemented |
| **Rate limiting** | 100 req/min on `/trpc` | Implemented |
| **Secret management** | Server-only env vars (never `VITE_` prefixed): `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY` | Pattern established |
| **Dependency auditing** | `pnpm audit` in CI, high/critical = blocker | CI configured |
| **File upload security** | Virus scanning, file type validation, size limits | Not yet |

---

## 7. CI/CD Pipeline

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

Turborepo remote caching enabled. Concurrency group cancels stale PR runs.

---

## 8. Design System

### Tokens (defined in `packages/tailwind-config/base.css`)

**Colors:** `background`, `foreground`, `muted`, `border`, `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `card`, `popover`, `sidebar` — each with foreground variants.

**Radius:** `sm` (0.375rem), `md` (0.5rem), `lg` (0.75rem), `xl` (1rem)

**Fonts:** `sans` (VS Code system font stack: -apple-system, BlinkMacSystemFont, Segoe UI, etc.), `mono` (Droid Sans Mono, monospace)

**Shadows:** `sm`, `md`, `lg` — adjusted for dark mode

**Dark mode:** `.dark` class on `<html>` toggles all CSS custom properties. Managed by Zustand `ui-store` with system/light/dark options.

### Component Library (`packages/ui/`)

| Component | Radix primitive | Variants (CVA) |
|---|---|---|
| Button | Slot | default, destructive, outline, secondary, ghost, link × default, sm, lg, icon |
| Input | — | — |
| Textarea | — | — |
| Label | @radix-ui/react-label | — |
| Card | — | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Dialog | @radix-ui/react-dialog | Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription |
| Badge | — | default, secondary, destructive, outline, success, warning |
| Tabs | @radix-ui/react-tabs | Tabs, TabsList, TabsTrigger, TabsContent |
| Select | @radix-ui/react-select | Select, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator |
| Checkbox | @radix-ui/react-checkbox | — |
| Tooltip | @radix-ui/react-tooltip | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |
| DropdownMenu | @radix-ui/react-dropdown-menu | DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, etc. |
| Skeleton | — | — |
| Modal | @radix-ui/react-dialog | Modal, ModalContent, ModalHeader, ModalFooter, ModalTitle (simplified Dialog variant) |

---

## 9. Route Map

| Path | Page | Auth required | Description |
|---|---|---|---|
| `/sign-in` | SignInPage | No | Clerk `<SignIn>` component |
| `/sign-up` | SignUpPage | No | Clerk `<SignUp>` component |
| `/sso-callback` | SSOCallbackPage | No | Clerk SSO redirect handler |
| `/` | HomePage | Yes | Greeting, chat box (project/quick mode), recent workspace cards |
| `/workspaces` | WorkspacesPage | Yes | Workspace grid with create dialog, folder tree |
| `/workspaces/:id` | WorkspaceDetailPage | Yes | Infinite canvas (zoom/pan/dot grid) with tool selector, highlight tool, right-panel chat + tools sidebar |
| `/workspaces/:id/folder` | WorkspaceFolderPage | Yes | Folder contents within a workspace |
| `/usage` | UsagePage | Yes | Usage metrics (empty) |
| `/trash` | TrashPage | Yes | Soft-deleted workspaces with restore/permanent delete |
| `/frameworks` | FrameworksPage | Yes | Frameworks (empty) |

---

## 10. tRPC Router Map

| Router | Procedures | Auth | Status |
|---|---|---|---|
| `health` | `check` (query) | Public | Returns `{ status, timestamp }` |
| `workspace` | `list`, `getById`, `create`, `update`, `delete`, `listByFolder`, `updateThumbnail`, `listTrashed`, `restore`, `permanentDelete` | Protected | **Fully implemented** — real DB queries, soft-delete, cascade to children, ownership checks |
| `folder` | `list`, `create`, `update`, `delete` | Protected | Stubs |
| `chat` | `listConversations`, `getConversation`, `createConversation`, `sendMessage`, `deleteConversation` | Protected | Stubs — `sendMessage` needs Claude integration |
| `financial` | `getSummary`, `getTransactions` | Protected | Stubs — return zeroed summary / `[]` |
| `user` | `getProfile`, `updateProfile` | Protected | Stubs |
| `billing` | `getCurrentPlan`, `getInvoices` | Protected | Stubs — return `{ plan: 'free' }` / `[]` |

---

## 11. Environment Variables

| Variable | Where used | Secret? | Description |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend | No | Clerk publishable key (safe for client) |
| `VITE_API_URL` | Frontend | No | Backend URL (used if not proxying) |
| `CLERK_SECRET_KEY` | Server | **Yes** | Clerk secret for server-side auth verification |
| `CLERK_PUBLISHABLE_KEY` | Server | No | Clerk publishable (for middleware config) |
| `ANTHROPIC_API_KEY` | Server | **Yes** | Claude API key |
| `PORT` | Server | No | Server port (default 4000) |
| `NODE_ENV` | Server | No | development / production / test |
| `FRONTEND_URL` | Server | No | CORS origin (default http://localhost:3000) |
| `DATABASE_URL` | Server | **Yes** | PostgreSQL connection string (not yet added) |

---

## 12. What's Built vs What's Next

### Built (scaffold + workspace MVP)
- [x] Monorepo with 8 packages, all linking correctly
- [x] Zod schemas with 22 unit tests
- [x] 14 UI components (incl. Modal) with design tokens and dark mode
- [x] Auth flow (Clerk provider, AuthGuard, sign-in/sign-up/SSO) — **dev bypass active when no Clerk key** (TODO: remove before production)
- [x] Dashboard layout (collapsible sidebar with 5 nav items, theme toggle, workspace tree)
- [x] tRPC client configured with Clerk token injection
- [x] tRPC server with 7 routers (workspace fully implemented, 6 stubs)
- [x] Express hardened with Helmet, CORS, rate limiting
- [x] Zustand UI store (sidebar collapsed, theme — persisted to localStorage)
- [x] Form validation (React Hook Form + Zod)
- [x] CI pipeline (lint, typecheck, test, e2e, build, audit)
- [x] 33 passing tests across 3 packages
- [x] **Database** — SQLite + Drizzle ORM, `workspaces` table with full schema
- [x] **Workspace CRUD** — create, read, update, soft-delete, restore, permanent delete, folder hierarchy, thumbnails
- [x] **Frontend wired** — Workspaces page (grid + create dialog), workspace detail (canvas), folder view, trash page (restore/delete)
- [x] **Infinite canvas** — Dot grid, mouse drag pan, scroll/pinch zoom, double-click reset
- [x] **Canvas tool selector** — Grab tool (pan) and Highlight tool (draw green rectangles), floating toolbar
- [x] **Workspace thumbnails** — Auto-captured via html2canvas, shown in homepage recent cards and workspace grid
- [x] **Homepage** — Greeting, project/quick chat box, recent workspace cards with thumbnails

### Not Built (forward roadmap)
- [ ] **More DB tables** — conversations, messages, transactions, user profiles, billing (currently only `workspaces` table)
- [ ] **Wire remaining routers** — Replace stubs in folder, chat, financial, user, billing routers with real DB queries
- [ ] **File upload** — S3/R2 storage, upload endpoint, document parsing (PDF, CSV, Excel)
- [ ] **AI pipeline** — Anthropic SDK, streaming responses, workspace-scoped context injection
- [ ] **RAG** — Document embedding, vector search, context window management
- [ ] **Integrations** — Plaid (bank feeds), Stripe (billing), QuickBooks/Xero (accounting)
- [ ] **Real-time** — SSE or WebSocket for chat streaming
- [ ] **Billing** — Stripe subscriptions, usage metering, plan enforcement
- [ ] **Team features** — Invitations, roles (viewer/editor/admin), shared workspaces
- [ ] **Production DB** — Migrate from SQLite to PostgreSQL (Neon/Supabase)
- [ ] **Deployment** — Docker, hosting (Vercel/Railway/Fly), production env config
- [ ] **Observability** — Logging, error tracking (Sentry), analytics
- [ ] **E2E tests** — Real Playwright tests with seeded data and Clerk test accounts

---

## 13. Key Conventions

| Convention | Rule |
|---|---|
| **Package scope** | `@a4/*` |
| **Imports** | Biome auto-sorts. External first, then `@/` aliases, then relative. |
| **Component files** | PascalCase (`WorkspaceCard.tsx`). One component per file. |
| **Feature exports** | Every feature has an `index.ts` barrel export. Routes import from `@/features/x`. |
| **Route files** | Default exports only (required for `lazy()`). Thin — compose features. |
| **Schemas** | Defined in `shared-schemas`. Types derived via `z.infer` in `shared-types`. Never define types manually. |
| **Styles** | Tailwind utility classes. No CSS modules. Design tokens via `@theme`. `cn()` for class composition. |
| **State** | Server state in TanStack Query. UI state in Zustand. Form state in RHF. URL state in React Router. |
| **Auth** | All dashboard routes wrapped in `AuthGuard`. All tRPC mutations/queries use `protectedProcedure`. **Dev bypass:** when `VITE_CLERK_PUBLISHABLE_KEY` is missing in dev mode, auth is skipped and a mock user is injected. Remove `DEV_AUTH_BYPASS`, `useDevUser`, and `DevProviders` before production. |
| **Testing** | Unit tests co-located in `__tests__/`. E2E tests in `e2e/`. Vitest for unit, Playwright for E2E. |
| **Env vars** | Client-safe vars prefixed with `VITE_`. Secrets never prefixed with `VITE_`. Validated with Zod on server. |
