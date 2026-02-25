# A4 — Systems Reference

> **Last updated:** 2026-02-25
> Deep technical reference for each system. For the high-level overview, see [Architecture](./A4_ARCHITECTURE.md).

---

## 1. Database Schema

SQLite via Drizzle ORM. 6 tables, all filtered by `userId` for row-level security.

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

---

## 2. Canvas System

The canvas is the primary workspace interaction surface — an infinite zoomable/pannable area where users create, arrange, and connect items.

### Canvas Components

54 components in `apps/web/src/components/canvas/`:

| Component | File | Purpose |
|---|---|---|
| **CanvasItemRenderer** | `canvas-item-renderer.tsx` | Renders any canvas item with selection ring, resize handles, anchor dots, context menu, rename |
| **CanvasMinimap** | `canvas-minimap.tsx` | Bottom-right overview showing all items as green rectangles with viewport indicator |
| **DocumentView** | `document-view.tsx` | Full BlockNote rich-text editor for `a4-page` items |
| **TabBar** | `tab-bar.tsx` | Open item tabs (like VS Code tabs) above canvas |
| **GeneralToolPanel** | `general-tool-panel.tsx` | Tool palette — `a4-page`, `note` |
| **SecretToolPanel** | `secret-tool-panel.tsx` | Tool palette — `secret-card` |
| **DataToolPanel** | `data-tool-panel.tsx` | Tool palette — `table-card`, `kpi-card`, `chart-card`, `file-card`, `timer-card` |
| **FinanceToolPanel** | `finance-tool-panel.tsx` | Tool palette — `invoice-card`, `budget-card`, `ledger-card`, `receipt-card`, `subscription-card`, `account-card`, `loan-calculator-card`, `projection-card`, `breakeven-card`, `depreciation-card` |
| **ReportsToolPanel** | `reports-tool-panel.tsx` | Tool palette — `pnl-card`, `balance-sheet-card`, `cash-flow-card` |
| **TaxToolPanel** | `tax-tool-panel.tsx` | Tool palette — `tax-estimator-card` |
| ***-content.tsx** | 22 files | Compact canvas preview per item type (memo, `h-full w-full`, no zoom prop) |
| ***-view.tsx** | 19 files | Full tab editor per item type (local state, dirtyRef, debounced auto-save) |

### Canvas Item Types (22 types)

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
| `invoice-card` | Invoice summary | Line items, tax, from/to, PDF export | `data` — InvoiceData (status, items, parties) |
| `budget-card` | Budget summary + progress | Category groups, table binding, progress bars | `data` — BudgetData (period, groups, categories) |
| `ledger-card` | Recent entries + balance | Income/expense entries, categories, filters | `data` — LedgerData (entries, categories, currency) |
| `receipt-card` | Receipt list + totals | Receipt capture, categorization | `data` — ReceiptData (receipts, categories) |
| `subscription-card` | Active subscriptions | Recurring bills tracker | `data` — SubscriptionData (subscriptions, categories) |
| `account-card` | Account balances overview | Bank/brokerage/card accounts, groups | `data` — AccountData (accounts, groups, currency) |
| `pnl-card` | P&L summary | 12-month income statement, waterfall, margins | `data` — PnlData (sections, line items) |
| `balance-sheet-card` | Balance summary | Assets/liabilities/equity, ratios | `data` — BSData (sections, line items) |
| `cash-flow-card` | Cash flow summary | 12-month indirect method, 3 GAAP sections | `data` — CFData (sections, line items) |
| `tax-estimator-card` | Tax estimate summary | Federal + state, all 50 states, FICA/SE | `data` — TaxEstimatorData (income, deductions, credits) |
| `loan-calculator-card` | Monthly payment headline | Amortization schedule, PITI+PMI+HOA, extra payments | `data` — LoanCalculatorData (mortgage inputs) |
| `projection-card` | Final balance + growth bar | Compound growth inputs, year-by-year schedule | `data` — ProjectionCardData (starting amount, contributions, growth rate, inflation) |
| `breakeven-card` | Break-even units + cost bar | Cost/pricing inputs, profit/loss schedule | `data` — BreakevenCardData (fixed costs, variable cost, price per unit) |
| `depreciation-card` | Year 1 depreciation + progress bar | 4 methods (SL/DB/DDB/SYD), depreciation schedule | `data` — DepreciationCardData (asset cost, salvage, life, method) |

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
