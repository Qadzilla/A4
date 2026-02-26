# A4 — Systems Reference

> **Last updated:** 2026-02-26
> Deep technical reference for each system. For the high-level overview, see [Architecture](./A4_ARCHITECTURE.md).

---

## 1. Database Schema

SQLite via Drizzle ORM. 21 tables, all filtered by `userId` for row-level security.

**Schema file:** `apps/server/src/db/schema.ts`

### `workspaces`
Core container. Supports nesting via `parentId` (workspace or folder type). Soft-delete via `deletedAt`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `name` | text NOT NULL | |
| `description` | text | |
| `user_id` | text NOT NULL | Owner |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |
| `thumbnail` | text | Base64 data URI |
| `type` | text NOT NULL | `'workspace'` or `'folder'` |
| `parent_id` | text | FK to self (folder nesting) |
| `deleted_at` | integer (timestamp) | Soft-delete |

### `canvas_items`
Persisted canvas items per workspace. `data` stores type-specific JSON (e.g., BlockNote content for `a4-page`, encrypted fields for `secret-card`).

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `type` | text NOT NULL | `'a4-page'`, `'secret-card'`, `'note'` |
| `name` | text NOT NULL | |
| `x`, `y` | real NOT NULL | Canvas position |
| `width`, `height` | real NOT NULL | |
| `z_index` | integer NOT NULL | |
| `data` | text | JSON string |

### `canvas_connections`
Anchor-to-anchor connections between canvas items.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `from_item_id` | text NOT NULL | |
| `from_anchor` | text NOT NULL | `'top'`, `'bottom'`, `'left'`, `'right'` |
| `to_item_id` | text NOT NULL | |
| `to_anchor` | text NOT NULL | |

### `vault_config`
Per-user encryption verification material. The server never stores the passphrase or derived key.

| Column | Type | Notes |
|---|---|---|
| `user_id` | text PK | |
| `salt` | text NOT NULL | Base64, for PBKDF2 |
| `verification_ciphertext` | text NOT NULL | Encrypted `'a4-vault-ok'` |
| `verification_iv` | text NOT NULL | Base64, for AES-GCM |

### `market_bars`
Cached OHLCV bars from Polygon.io. Unique index on `(symbol, timespan, multiplier, timestamp)`.

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Auto-increment |
| `symbol` | text NOT NULL | |
| `timespan` | text NOT NULL | `'day'`, `'hour'`, etc. |
| `multiplier` | integer NOT NULL | |
| `timestamp` | integer NOT NULL | Unix ms |
| `open`, `high`, `low`, `close`, `volume` | real NOT NULL | |
| `vwap` | real | |
| `transactions` | integer | |
| `cached_at` | integer NOT NULL | |

### `ticker_details`
Cached ticker metadata from Polygon.io.

| Column | Type | Notes |
|---|---|---|
| `symbol` | text PK | |
| `name` | text NOT NULL | |
| `market` | text NOT NULL | |
| `type` | text | |
| `currency_name` | text | |
| `active` | integer (boolean) | Default `true` |
| `logo_url` | text | |
| `cached_at` | integer NOT NULL | |

### `files`
Uploaded file metadata.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | Original filename |
| `mime_type` | text NOT NULL | |
| `size` | integer NOT NULL | Bytes |
| `path` | text NOT NULL | Server storage path |
| `created_at` | integer (timestamp) | |

### `categories`
Income/expense categories for ledger cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `color` | text NOT NULL | Hex color |
| `type` | text NOT NULL | `'income'` or `'expense'` |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `transactions`
Financial transactions linked to categories.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `category_id` | text | FK to categories |
| `amount` | real NOT NULL | |
| `currency` | text NOT NULL | |
| `description` | text | |
| `date` | integer (timestamp) | |
| `type` | text NOT NULL | `'income'` or `'expense'` |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `account_groups`
Groupings for account cards (e.g., "Banking", "Brokerage").

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `accounts`
Individual financial accounts.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `group_id` | text | FK to account_groups |
| `name` | text NOT NULL | |
| `institution` | text | |
| `balance` | real NOT NULL | |
| `type` | text NOT NULL | `'checking'`, `'savings'`, `'brokerage'`, `'credit'`, `'other'` |
| `notes` | text | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `receipts`
Receipt entries for receipt cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `merchant` | text NOT NULL | |
| `amount` | real NOT NULL | |
| `date` | text NOT NULL | |
| `category` | text | |
| `notes` | text | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `subscriptions`
Recurring subscription entries.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `amount` | real NOT NULL | |
| `frequency` | text NOT NULL | `'monthly'`, `'yearly'`, etc. |
| `category` | text | |
| `next_billing_date` | text | |
| `status` | text NOT NULL | `'active'`, `'paused'`, `'cancelled'` |
| `notes` | text | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `invoices`
Invoice headers for invoice cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `invoice_number` | text | |
| `status` | text NOT NULL | `'draft'`, `'sent'`, `'paid'`, `'overdue'` |
| `from_name` | text | |
| `to_name` | text | |
| `issue_date` | text | |
| `due_date` | text | |
| `tax_rate` | real | |
| `notes` | text | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `invoice_line_items`
Line items for invoices.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `invoice_id` | text NOT NULL | FK to invoices |
| `user_id` | text NOT NULL | |
| `description` | text NOT NULL | |
| `quantity` | real NOT NULL | |
| `unit_price` | real NOT NULL | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `budget_groups`
Budget category groups for budget cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `color` | text NOT NULL | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `budget_categories`
Individual budget categories within groups.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `group_id` | text NOT NULL | FK to budget_groups |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `budgeted` | real NOT NULL | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `holdings`
Portfolio holdings for portfolio cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `symbol` | text NOT NULL | Ticker symbol |
| `name` | text NOT NULL | |
| `value` | real NOT NULL | Current value |
| `target_pct` | real NOT NULL | Target allocation % |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `debts`
Debt entries for debt planner cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `balance` | real NOT NULL | |
| `annual_interest_rate` | real NOT NULL | |
| `minimum_payment` | real NOT NULL | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `networth_categories`
Asset/liability categories for net worth cards.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `kind` | text NOT NULL | `'asset'` or `'liability'` |
| `is_default` | integer (boolean) | Default `false` |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `networth_entries`
Individual asset/liability entries within categories.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `name` | text NOT NULL | |
| `category_id` | text NOT NULL | FK to networth_categories |
| `value` | real NOT NULL | |
| `notes` | text | |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

---

## 2. Canvas System

The canvas is the primary workspace interaction surface — an infinite zoomable/pannable area where users create, arrange, and connect items.

### Canvas Components

61 components in `apps/web/src/components/canvas/`:

| Component | File | Purpose |
|---|---|---|
| **CanvasItemRenderer** | `canvas-item-renderer.tsx` | Renders any canvas item with selection ring, resize handles, anchor dots, context menu, rename |
| **CanvasMinimap** | `canvas-minimap.tsx` | Bottom-right overview showing all items as green rectangles with viewport indicator |
| **DocumentView** | `document-view.tsx` | Full BlockNote rich-text editor for `a4-page` items |
| **TabBar** | `tab-bar.tsx` | Open item tabs (like VS Code tabs) above canvas |
| **GeneralToolPanel** | `general-tool-panel.tsx` | Tool palette — `a4-page`, `note` |
| **SecretToolPanel** | `secret-tool-panel.tsx` | Tool palette — `secret-card` |
| **DataToolPanel** | `data-tool-panel.tsx` | Tool palette — `table-card`, `kpi-card`, `chart-card`, `file-card`, `timer-card` |
| **FinanceToolPanel** | `finance-tool-panel.tsx` | Tool palette — `invoice-card`, `budget-card`, `ledger-card`, `receipt-card`, `subscription-card`, `account-card`, `portfolio-card`, `networth-card`, `debt-planner-card`, `loan-calculator-card`, `projection-card`, `breakeven-card`, `depreciation-card`, `rent-vs-buy-card`, `embed-card` |
| **ReportsToolPanel** | `reports-tool-panel.tsx` | Tool palette — `pnl-card`, `balance-sheet-card`, `cash-flow-card` |
| **TaxToolPanel** | `tax-tool-panel.tsx` | Tool palette — `tax-estimator-card` |
| ***-content.tsx** | 27 files | Compact canvas preview per item type (memo, `h-full w-full`, no zoom prop) |
| ***-view.tsx** | 27 files | Full tab editor per item type (local state, dirtyRef, debounced auto-save) |

### Canvas Item Types (27 types)

| Type | Preview (on canvas) | Full View (in tab) | Content Storage |
|---|---|---|---|
| `a4-page` | Scaled-down BlockNote render | Full BlockNote editor | `data.content` — BlockNote JSON blocks |
| `secret-card` | Locked card with icon | Decrypted key/value fields | `data` — AES-256-GCM encrypted JSON |
| `note` | Inline editable text card | N/A (edited in place) | `data.text` — plain string |
| `table-card` | Column headers + data rows | Full spreadsheet editor | `data.columns`, `data.rows` |
| `kpi-card` | Metric value + label | Config with table-card binding | `data` — aggregation config (sum/avg/min/max/count/latest) |
| `chart-card` | Recharts pie/bar/line/area | Chart config + table binding | `data` — chart type, series config |
| `file-card` | File preview (PDF/CSV/image) | Full file viewer | `data` — fileId, fileName, preview data |
| `timer-card` | Countdown display | Timer config with color presets | `data` — deadline, color |
| `invoice-card` | Invoice summary | Line items, tax, from/to, PDF export | `data` — view config (currency, notes); entity data in `invoices` + `invoice_line_items` DB tables |
| `budget-card` | Budget summary + progress | Category groups, table binding, progress bars | `data` — view config (period, currency, notes); entity data in `budget_groups` + `budget_categories` DB tables |
| `ledger-card` | Recent entries + balance | Income/expense entries, categories, filters | `data` — LedgerData (entries, categories, currency) |
| `receipt-card` | Receipt list + totals | Receipt capture, categorization | `data` — view config (currency, notes); entity data in `receipts` DB table |
| `subscription-card` | Active subscriptions | Recurring bills tracker | `data` — view config (currency, notes); entity data in `subscriptions` DB table |
| `account-card` | Account balances overview | Bank/brokerage/card accounts, groups | `data` — view config (currency, notes); entity data in `accounts` + `account_groups` DB tables |
| `pnl-card` | P&L summary | 12-month income statement, waterfall, margins | `data` — PnlData (sections, line items) |
| `balance-sheet-card` | Balance summary | Assets/liabilities/equity, ratios | `data` — BSData (sections, line items) |
| `cash-flow-card` | Cash flow summary | 12-month indirect method, 3 GAAP sections | `data` — CFData (sections, line items) |
| `tax-estimator-card` | Tax estimate summary | Federal + state, all 50 states, FICA/SE | `data` — TaxEstimatorData (income, deductions, credits) |
| `loan-calculator-card` | Monthly payment headline | Amortization schedule, PITI+PMI+HOA, extra payments | `data` — LoanCalculatorData (mortgage inputs) |
| `projection-card` | Final balance + growth bar | Compound growth inputs, year-by-year schedule | `data` — ProjectionCardData (starting amount, contributions, growth rate, inflation) |
| `breakeven-card` | Break-even units + cost bar | Cost/pricing inputs, profit/loss schedule | `data` — BreakevenCardData (fixed costs, variable cost, price per unit) |
| `depreciation-card` | Year 1 depreciation + progress bar | 4 methods (SL/DB/DDB/SYD), depreciation schedule | `data` — DepreciationCardData (asset cost, salvage, life, method) |
| `embed-card` | Embedded URL preview | External content / iframe embedding | `data` — EmbedCardData (url, title) |
| `portfolio-card` | Total value + holding count | Holdings, drift analysis, rebalance trades | `data` — view config (currency, notes); entity data in `holdings` DB table |
| `networth-card` | Assets/liabilities/net worth | Categories, entries, balance breakdown | `data` — view config (currency, notes); entity data in `networth_categories` + `networth_entries` DB tables |
| `debt-planner-card` | Total balance + debt count | Snowball/avalanche simulation, paydown timeline | `data` — view config (currency, strategy, extraMonthlyBudget, startDate, notes); entity data in `debts` DB table |
| `rent-vs-buy-card` | Monthly cost comparison | Home ownership vs renting analysis, breakeven year | `data` — RentVsBuyCardData (purchase price, down payment, rates, rent, etc.) |

### Canvas Store (`canvas-store.ts`)

Global Zustand store (not workspace-scoped). Must `loadItems()` on workspace entry and `clearItems()` on leave.

**State:** `items`, `connections`, `selectedItemId`, `highlightedItemIds`, `openItemIds`, `activeItemId`, `alignmentGuides`, `spacingGuides`, `pendingRenameId`, `nextZIndex`.

**Actions:** `addItem`, `removeItem`, `moveItemWithGuides`, `resizeItemWithGuides`, `openItem`, `closeItem`, `setHighlightedItemIds`, `clearHighlights`, `addConnection`, `removeConnection`.

### Connection Rendering

Connections use **cubic bezier SVG paths**. Each anchor has a direction vector (top→up, right→right, etc.). Control points extend outward from the anchor direction, producing smooth S-curves.

```
bezierPath(from, fromAnchor, to, toAnchor):
  offset = clamp(distance * 0.4, 40, 200)
  cx1 = from + anchorDir[fromAnchor] * offset
  cx2 = to   + anchorDir[toAnchor]   * offset
  → "M from C cx1 cx2 to"
```

Hit area: invisible 12px-wide `<path>` behind each 2px visible curve for click-to-delete.

### Smart Guides

When dragging/resizing items, `computeAlignment()` and `computeSpacing()` in `canvas-utils.ts` produce snap guides:
- **Alignment guides**: Pink dashed lines when item edges/centers align with other items (8px snap threshold)
- **Spacing guides**: Pink dimension labels when equal spacing is detected between 3+ items

### Canvas Persistence

Items auto-save to the server via `useCanvasStore.subscribe` with 500ms debounce. On workspace entry, items load from the `canvas.load` tRPC query (with one-time localStorage migration for legacy data).

### Selection & Highlighting

- **Click-select**: Single item gets `ring-2 ring-primary ring-offset-1`
- **Marquee-select**: Draw rectangle in cursor mode → AABB intersection test → matching items get `ring-2 ring-primary` (no offset, static — no animations, matching Figma/tldraw convention)
- **Clear**: Clicking empty canvas clears both selection and highlights

---

## 3. Vault Encryption System

Client-side encryption ensures the server never sees secret card plaintext.

**Files:** `apps/web/src/lib/vault-crypto.ts`, `apps/web/src/components/vault/`

### Flow

```
User creates vault → enters passphrase
  → generateSalt() → 16 random bytes (base64)
  → deriveKey(passphrase, salt) → PBKDF2-SHA256 (600K iterations) → AES-256-GCM key
  → encryptVerification(key) → encrypts literal "a4-vault-ok" → ciphertext + IV
  → POST vault.setup({ salt, verificationCiphertext, verificationIV })

User unlocks vault → enters passphrase
  → GET vault.getConfig() → { salt, verificationCiphertext, verificationIV }
  → deriveKey(passphrase, salt) → key
  → verifyKey(key, ciphertext, iv) → decrypts and checks "a4-vault-ok"
  → setCachedKey(key) → in-memory only (lost on refresh)
```

### Secret Card Encryption

Each secret card's `data` field contains AES-256-GCM encrypted JSON. Encryption and decryption happen entirely in the browser via Web Crypto API. The server stores only ciphertext.

### Key Management

- `getCachedKey()` / `setCachedKey()` / `clearCachedKey()` — module-level in-memory cache, lost on page refresh
- `generatePassphrase()` — generates a 3-word passphrase from an embedded wordlist
- `encrypt(plaintext, key)` — AES-256-GCM with random 12-byte IV, returns base64 ciphertext + IV
- `decrypt(ciphertext, iv, key)` — decrypts, throws on wrong key or tamper

---

## 4. Market Data Pipeline

Real-time and historical market data via Polygon.io.

### Server (tRPC — `marketData` router)

| Procedure | Description |
|---|---|
| `searchTickers` | Proxy to Polygon ticker search API |
| `getTickerDetail` | Fetch + cache in `ticker_details` table |
| `getAggregates` | Fetch OHLCV bars + cache in `market_bars` table (unique on symbol/timespan/multiplier/timestamp) |
| `getSnapshot` | Real-time ticker snapshot |

### Client

- **`useMarketWebSocket`** hook — WebSocket to `/ws` endpoint, subscribes to symbols, pushes trade/quote messages to store. Exponential backoff reconnection (1s → 30s max).
- **`market-store`** — Zustand store holding latest real-time quotes/trades per symbol.

---

## 5. Design System

### Tokens (`packages/tailwind-config/base.css`)

**Colors:** `background`, `foreground`, `muted`, `border`, `primary` (`#4ade80` — green), `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `card`, `popover`, `sidebar` — each with foreground variants. Primary is green in both light and dark modes.

**Radius:** `sm` (0.5rem), `md` (0.75rem), `lg` (1rem), `xl` (1.5rem)

**Fonts:** `sans` ("Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif), `mono` ("Droid Sans Mono", monospace)

**Shadows:** `sm`, `md`, `lg` — adjusted for dark mode (higher opacity)

**Dark mode:** `.dark` class on `<html>`. Background: `#1e2021`. Card: `#1a1a1a`. Muted: `#2f3338`. Managed by Zustand `ui-store` with system/light/dark options.

**Custom cursor:** Global custom cursor (`cursor.png`) applied via CSS.

### Component Library (`packages/ui/`)

14 components built on Radix primitives with CVA variants:

| Component | Radix Primitive | Variants |
|---|---|---|
| Button | Slot | default, destructive, outline, secondary, ghost, link × default, sm, lg, icon |
| Input | — | — |
| Textarea | — | — |
| Label | @radix-ui/react-label | — |
| Card | — | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Dialog | @radix-ui/react-dialog | Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription |
| Modal | @radix-ui/react-dialog | Modal, ModalContent, ModalHeader, ModalFooter, ModalTitle |
| Badge | — | default, secondary, destructive, outline, success, warning |
| Tabs | @radix-ui/react-tabs | Tabs, TabsList, TabsTrigger, TabsContent |
| Select | @radix-ui/react-select | Select, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator |
| Checkbox | @radix-ui/react-checkbox | — |
| Tooltip | @radix-ui/react-tooltip | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |
| DropdownMenu | @radix-ui/react-dropdown-menu | DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, etc. |
| Skeleton | — | — |

---

## 6. Shared Schemas (`packages/shared-schemas/`)

| File | Schemas |
|---|---|
| `workspace.ts` | `workspaceSchema`, `createWorkspaceSchema`, `updateWorkspaceSchema` |
| `folder.ts` | `folderSchema`, `createFolderSchema`, `updateFolderSchema` |
| `chat.ts` | `messageSchema`, `conversationSchema`, `sendMessageSchema`, etc. |
| `financial.ts` | `transactionSchema`, `financialSummarySchema`, `financialFilterSchema`, `currencySchema` |
| `user.ts` | `userProfileSchema`, `updateProfileSchema` |
| `canvas.ts` | `anchorPositionSchema`, `canvasItemSchema`, `canvasConnectionSchema`, `saveCanvasSchema` |
| `market-data.ts` | `assetClassSchema`, `timespanSchema`, `tickerDetailSchema`, `aggregateBarSchema`, `realtimeQuoteSchema`, `realtimeTradeSchema`, `tickerSnapshotSchema`, `tickerSearchInputSchema`, `aggregateInputSchema`, WebSocket message schemas |
| `account.ts` | `createAccountSchema`, `updateAccountSchema`, `createAccountGroupSchema`, `updateAccountGroupSchema` |
| `category.ts` | `createCategorySchema`, `updateCategorySchema` |
| `receipt.ts` | `createReceiptSchema`, `updateReceiptSchema` |
| `subscription.ts` | `createSubscriptionSchema`, `updateSubscriptionSchema` |
| `invoice.ts` | `createInvoiceSchema`, `updateInvoiceSchema`, `createInvoiceLineItemSchema`, `updateInvoiceLineItemSchema` |
| `budget.ts` | `createBudgetGroupSchema`, `updateBudgetGroupSchema`, `createBudgetCategorySchema`, `updateBudgetCategorySchema` |
| `holding.ts` | `createHoldingSchema`, `updateHoldingSchema` |
| `debt.ts` | `createDebtSchema`, `updateDebtSchema` |
| `networth.ts` | `networthCategoryKindSchema`, `createNetworthCategorySchema`, `updateNetworthCategorySchema`, `createNetworthEntrySchema`, `updateNetworthEntrySchema`, `DEFAULT_NETWORTH_CATEGORIES` |

---

## 7. Security Model

| Layer | Mechanism | Status |
|---|---|---|
| **Authentication** | Clerk (SOC 2 compliant, MFA, session cookies) | Implemented |
| **Authorization** | `protectedProcedure` rejects unauthenticated requests | Implemented |
| **Input validation** | Zod on every tRPC procedure input | Implemented |
| **Row-level security** | Every DB query filters by `ctx.userId` | Implemented |
| **Security headers** | Helmet.js (CSP, HSTS, X-Content-Type, X-Frame) | Implemented |
| **CORS** | Strict — only `FRONTEND_URL` origin allowed | Implemented |
| **Rate limiting** | 100 req/min on `/trpc` | Implemented |
| **Client-side encryption** | Vault: PBKDF2 (600K iter) → AES-256-GCM. Server never sees plaintext. | Implemented |
| **Secret management** | Server-only env vars (never `VITE_` prefixed) | Implemented |
| **Dependency auditing** | `pnpm audit` in CI, high/critical = blocker | Implemented |
| **File upload security** | Virus scanning, file type validation, size limits | Not yet |
