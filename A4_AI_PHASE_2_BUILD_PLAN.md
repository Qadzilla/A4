# A4 — AI Pipeline: Phase 2 Detailed Build Plan

> **Created:** 2026-03-13
> **Status:** Pre-implementation — ready to begin BU-01
> **Prerequisite:** Phase 1 complete — conversations, messages, SSE streaming, workspace context, markdown rendering, conversation management all working.
> **Architecture reference:** [A4_AI_PIPELINE.md](./A4_AI_PIPELINE.md) — read this first for the full system design, SSE protocol, tool definitions, and privacy model. This document does not repeat that information; it breaks Phase 2 into executable build units.

---

## How to use this document

Each **build unit (BU)** is one coding session's worth of work. They are ordered by dependency — you cannot start a unit until its listed inputs are complete. Within a session, follow this workflow:

1. Read the BU description top to bottom
2. Create/modify the listed files
3. Run the listed tests — all must pass before moving on
4. Run the verification checks
5. Mark the BU as done in the completion checklist at the bottom

**Format of each BU:**

- **Goal** — one sentence describing the outcome
- **Inputs** — which prior BUs must be done first (or "None")
- **Creates / Modifies** — exact file paths affected
- **Description** — what to build, decisions already made, edge cases, constraints
- **Tests** — full specs: file path, `describe`/`it` blocks, assertions, setup/teardown
- **Verification** — manual and automated checks to confirm the unit works

**No code in this document.** All code decisions happen in coding sessions. This doc tells you *what* to build and *how to know it's correct*, not *how to write it*.

---

## Phase 2 goal

Claude can call A4 tools to create canvas items, query data, and run calculations. The user says "create a budget" and it appears on the canvas.

---

## Dependency graph

```
BU-01  Schema + protocol extensions
  │
  ├──→ BU-02  Extend Anthropic SDK wrapper
  │      │
  │      └──→ ┐
  │            │
BU-03  Read-only tool definitions ──────────┐
  │                                          │
BU-04  Canvas defaults + auto-positioning ──┤
  │                                          │
  ├──→ BU-05  Creation + mutation tools ────┤
  │                                          │
BU-06  Calculation tool definitions ────────┤
  │                                          │
BU-08  System prompt enhancement ───────────┤
                                             │
                    BU-07  Tool execution engine + SSE streaming
                      │
                      ├──→ BU-09  Client-side tool event handling
                      │
                      ├──→ BU-10  Safety guardrails + error handling
                      │
                      └──→ BU-11  E2E tests + polish

Parallel-safe groups:
  - BU-01 + BU-08 can run in parallel (no dependencies on each other)
  - BU-02 + BU-03 + BU-04 can run in parallel (all depend only on BU-01)
  - BU-05 + BU-06 can run in parallel (BU-05 depends on BU-04; BU-06 is independent)
  - BU-09 + BU-10 can run in parallel (both depend on BU-07)
```

---

## BU-01 — Schema + protocol extensions

**Goal:** Add tool-related columns to the `messages` table and extend shared schemas to support tool call SSE events.

**Inputs:** None (Phase 1 complete)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add columns to `messages` table
- `packages/shared-schemas/src/chat.ts` — extend `messageRoleSchema` and `sseEventSchema`
- `packages/shared-types/src/index.ts` — no new types needed (existing `z.infer` re-exports cover new schema shapes)
- `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — extend with tool-related tests
- `apps/server/src/__tests__/chat-tables.test.ts` — extend with tool column tests

**Description:**

Add two nullable columns to the existing `messages` table in `schema.ts`:

- `toolCalls`: `text('tool_calls')` — nullable. Stores a JSON string of tool_use blocks from assistant messages. When an assistant message contains tool calls, the raw array of `{ id, name, input }` objects is serialized to JSON and stored here. `null` for user messages, pure-text assistant messages, and tool result messages.
- `toolCallId`: `text('tool_call_id')` — nullable. For `role='tool'` messages, this stores the `tool_use_id` that this result corresponds to. `null` for user and assistant messages.

These columns are nullable text (not JSON type) because SQLite has no native JSON column type and Drizzle's `text()` is the established pattern in this codebase.

Extend `messageRoleSchema` in `chat.ts`:
- Change from `z.enum(['user', 'assistant'])` to `z.enum(['user', 'assistant', 'tool'])`
- The `'tool'` role is used for tool result messages. These messages are persisted for auditability and conversation replay.

Extend `sseEventSchema` in `chat.ts` with four new event types:
- `tool_call_start`: `{ type, toolCallId: string, toolName: string, toolInput: z.record(z.unknown()) }` — sent when Claude emits a tool_use block and the server begins executing it
- `tool_call_end`: `{ type, toolCallId: string, toolName: string, durationMs: number }` — sent after a tool executor completes (success or error)
- `tool_result`: `{ type, toolCallId: string, toolName: string, result: z.unknown(), isError: z.boolean().optional() }` — the actual result payload sent to the client for display
- `canvas_update`: `{ type, action: z.enum(['create', 'update']), item: z.object({ id: string, type: string, name: string, x: number, y: number, width: number, height: number, zIndex: number, data: z.unknown().optional() }) }` — sent when a tool creates or updates a canvas item, so the client can add/update it in the Zustand store

Decisions already made:
- The four new SSE event types are added to the same `sseEventSchema` discriminated union. The `type` field discriminates all variants.
- `canvas_update` carries the full item shape so the client can insert it directly into the store without a separate fetch.
- `tool_result` is separate from `tool_call_end` because the client may want to show/hide them independently (e.g., show timing in dev mode, always show results).
- `toolCalls` is stored as a JSON string, not a separate table. Tool calls are always read with their parent message and never queried independently — a column is simpler than a join.

Edge cases:
- Existing messages with `role='user'` or `role='assistant'` continue to work unchanged — the new columns default to `null`.
- The `messageSchema` Zod schema must accept the new fields as optional/nullable so existing messages still validate.

**Tests:**

File: `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` (extend existing)

```
describe('messageRoleSchema — tool support')
  it('accepts "tool" as a valid role')
    - Parse 'tool' → expect success

  it('still accepts "user" and "assistant"')
    - Parse both → expect success

describe('sseEventSchema — tool events')
  it('validates tool_call_start event')
    - Parse { type: 'tool_call_start', toolCallId: 'tc_123', toolName: 'get_accounts', toolInput: { limit: 10 } }
    - Assert success, all fields preserved

  it('validates tool_call_end event')
    - Parse { type: 'tool_call_end', toolCallId: 'tc_123', toolName: 'get_accounts', durationMs: 45 }
    - Assert success

  it('validates tool_result event')
    - Parse { type: 'tool_result', toolCallId: 'tc_123', toolName: 'get_accounts', result: { accounts: [] }, isError: false }
    - Assert success

  it('validates tool_result with isError=true')
    - Parse { type: 'tool_result', toolCallId: 'tc_123', toolName: 'get_accounts', result: { error: 'not found' }, isError: true }
    - Assert success

  it('validates canvas_update event with create action')
    - Parse { type: 'canvas_update', action: 'create', item: { id: 'uuid', type: 'budget-card', name: 'Q1 Budget', x: 100, y: 200, width: 320, height: 360, zIndex: 1 } }
    - Assert success

  it('validates canvas_update event with data field')
    - Parse with item including data: { categories: [] }
    - Assert success, data preserved

  it('still validates all Phase 1 event types')
    - Parse message_start, text_delta, error, done → all succeed
```

File: `apps/server/src/__tests__/chat-tables.test.ts` (extend existing)

```
describe('messages table — tool columns')
  beforeEach — in-memory DB with conversations and messages tables (include new columns in CREATE TABLE)

  it('inserts a tool result message with toolCallId')
    - Insert message with role='tool', content='{"accounts":[]}', toolCallId='tc_123'
    - Select by id
    - Assert role='tool', toolCallId='tc_123', toolCalls is null

  it('inserts an assistant message with toolCalls JSON')
    - Insert message with role='assistant', content='Let me look that up.', toolCalls='[{"id":"tc_123","name":"get_accounts","input":{}}]'
    - Select by id
    - Assert toolCalls contains the JSON string, toolCallId is null

  it('existing messages have null tool columns')
    - Insert message with role='user', content='Hello' (no toolCalls or toolCallId)
    - Select by id
    - Assert toolCalls is null, toolCallId is null

  it('retrieves interleaved user/assistant/tool messages in order')
    - Insert: user msg (t=0), assistant msg with toolCalls (t=1), tool result msg (t=2), assistant final msg (t=3)
    - Select all for conversation ORDER BY createdAt ASC
    - Assert 4 rows in correct order with correct roles
```

**Verification:**
- `pnpm vitest run packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — all tests pass
- `pnpm vitest run apps/server/src/__tests__/chat-tables.test.ts` — all tests pass
- `pnpm typecheck` — no type errors across the monorepo

---

## BU-02 — Extend Anthropic SDK wrapper

**Goal:** Add `tools` parameter support to the Anthropic SDK wrapper so Claude can be invoked with tool definitions.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/anthropic.ts` — extend `StreamChatOptions` and `streamChatCompletion`
- `apps/server/src/__tests__/anthropic-service.test.ts` — extend with tool-related tests

**Description:**

Extend `StreamChatOptions` interface:
- Add optional `tools` field: `Array<{ name: string; description: string; input_schema: Record<string, unknown> }>` — matches the Anthropic API `Tool` type. When provided, these are passed directly to `anthropic.messages.create({ tools })`.
- Add optional `toolChoice` field: `{ type: 'auto' | 'any' | 'tool'; name?: string }` — defaults to `{ type: 'auto' }` when tools are provided, omitted when no tools are provided.

Extend message format support:
- The `messages` array type must support multi-content-block messages for the tool execution loop. Change from `Array<{ role: 'user' | 'assistant'; content: string }>` to `Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }>`.
- This allows passing `tool_result` content blocks (which are arrays of `{ type: 'tool_result', tool_use_id, content }`) and assistant messages with mixed `text` + `tool_use` blocks.
- The Anthropic SDK accepts this shape natively — no transformation needed.

Modify `streamChatCompletion`:
- If `options.tools` is provided and non-empty, include `tools` and `tool_choice` in the `anthropic.messages.create()` call.
- If `options.tools` is not provided or empty, omit both `tools` and `tool_choice` from the API call (same as Phase 1 behavior).
- No other changes to streaming logic — the stream event types (`content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`) remain the same. The tool execution loop in BU-07 handles interpreting tool_use blocks.

Decisions already made:
- `tool_choice` defaults to `'auto'` — Claude decides when to use tools. The `'any'` and `'tool'` options are available for future use but Phase 2 always uses `'auto'`.
- The wrapper passes tools through to the Anthropic SDK without transformation. The SDK validates the tool schema format.
- `maxTokens` default stays at 4096. Tool-using responses may be longer, but the tool loop handles this by making multiple calls — each individual call stays within the limit.

Edge cases:
- Empty tools array `[]` should be treated the same as `undefined` — don't pass tools to the API (sending an empty array causes an API error).
- The existing `mapAnthropicError` function handles all error types from tool-using requests identically to text-only requests.

**Tests:**

File: `apps/server/src/__tests__/anthropic-service.test.ts` (extend existing)

```
describe('StreamChatOptions — tools support')
  it('accepts options with tools array')
    - Create options with tools: [{ name: 'get_accounts', description: '...', input_schema: { type: 'object', properties: {} } }]
    - Assert the options object is valid TypeScript (compile-time check)
    - Note: This is primarily a type-level test. The actual API call is tested in integration.

  it('accepts options with multi-content-block messages')
    - Create options with messages containing content as array: [{ type: 'tool_result', tool_use_id: 'tc_1', content: '{}' }]
    - Assert compiles without error

  it('accepts options without tools (backward compatibility)')
    - Create options with no tools field
    - Assert compiles and matches Phase 1 behavior
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/anthropic-service.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: temporarily call `streamChatCompletion` with a simple tool definition and verify the stream includes `content_block_start` events with `type: 'tool_use'` when Claude decides to call the tool

---

## BU-03 — Read-only tool definitions

**Goal:** Create the tool registry with 12 read-only tools that let Claude query workspace data without modifying anything.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/ai-tools.ts` — new file: tool definitions + executor functions
- `apps/server/src/__tests__/ai-tools.test.ts` — new test file

**Description:**

Create `ai-tools.ts` with a tool registry pattern. Each tool is an object with:
- `definition`: the Anthropic JSON Schema tool definition (`{ name, description, input_schema }`)
- `executor`: an async function `(input, context) => Promise<unknown>` that runs the tool and returns data

The `context` parameter provides:
- `db`: the Drizzle database instance
- `userId`: the authenticated user's ID
- `workspaceId`: the workspace this conversation belongs to

Create a `TOOL_REGISTRY` map: `Map<string, { definition: ToolDefinition; executor: ToolExecutor }>`. Expose:
- `getToolDefinitions()`: returns array of all tool definitions (for passing to Anthropic API)
- `executeTool(name, input, context)`: looks up the tool and runs its executor

12 read-only tools:

1. **`get_workspace_summary`** — Returns the workspace name, type, and high-level counts (number of accounts, budget categories, subscriptions, etc.). No input parameters. Reuses the query patterns from `buildWorkspaceContext` in `ai-context.ts` but returns structured data instead of markdown.

2. **`get_canvas_items`** — Lists all canvas items in the workspace. Optional `type` filter parameter. Returns array of `{ id, type, name }`. Reuses the query from `buildCanvasItemsSection`.

3. **`get_item_data`** — Returns the full data blob for a specific canvas item by ID. Input: `{ itemId: string }`. Queries `canvasItems` table, parses the JSON `data` column, returns the structured data. Must verify the item belongs to the user's workspace.

4. **`get_accounts`** — Returns all accounts in the workspace with balances. Optional `type` filter (checking, savings, credit, investment, etc.). Reuses query pattern from `buildAccountsSection` in `ai-context.ts`.

5. **`get_budget`** — Returns all budget categories with budgeted vs. actual amounts. No input parameters. Reuses query from `buildBudgetSection`.

6. **`get_invoices`** — Returns invoices with line items and computed totals. Optional `status` filter (draft, sent, paid, overdue). Reuses query from `buildInvoicesSection` but returns full structured data (not just summary).

7. **`get_receipts`** — Returns all receipts in the workspace. Queries the `receipts` table. Returns `{ id, vendor, amount, date, category }` for each.

8. **`get_subscriptions`** — Returns active subscriptions with amounts and frequencies. Optional `status` filter. Reuses query from `buildSubscriptionsSection`.

9. **`get_holdings`** — Returns portfolio holdings with values and target percentages. Reuses query from `buildHoldingsSection`.

10. **`get_debts`** — Returns all debts with balances, interest rates, and minimum payments. Reuses query from `buildDebtsSection`.

11. **`get_networth`** — Returns net worth breakdown: categories, entries, total assets, total liabilities, net worth. Reuses query from `buildNetworthSection` but returns structured data.

12. **`get_market_data`** — Returns cached market data for a symbol. Input: `{ symbol: string, timespan?: string }`. Queries `marketBars` table. Returns array of bars `{ timestamp, open, high, low, close, volume }`.

Each tool's `input_schema` uses standard JSON Schema (not Zod — Anthropic requires JSON Schema format). Keep schemas minimal: only the parameters the tool actually uses.

Executor functions reuse existing DB query patterns from `ai-context.ts` and tRPC routers. Import the table definitions from `schema.ts` and use Drizzle's query builder directly. Do NOT import tRPC routers or call tRPC procedures — executors access the DB directly for simplicity and to avoid auth middleware overhead (the tool execution context has already been authenticated).

Decisions already made:
- Tool definitions and executors are co-located in the same file. No separate `definitions/` and `executors/` directories — the file is large but navigable, and co-location makes it easy to keep definitions and executors in sync.
- Executors return plain objects, not formatted strings. Claude receives structured data and decides how to present it to the user.
- All read-only tools query the same workspace the conversation belongs to. There is no cross-workspace data access.
- Results are capped at reasonable limits (e.g., max 100 accounts, max 50 canvas items) to avoid token explosion. If more items exist, return a count with a note that results are truncated.

Edge cases:
- Tool called with an `itemId` that doesn't belong to the user's workspace → return `{ error: 'Item not found' }` (not a thrown error — tool results are always returned to Claude).
- Empty results (no accounts, no budget, etc.) → return `{ accounts: [], message: 'No accounts found in this workspace.' }` so Claude can inform the user.
- `get_market_data` for a symbol with no cached data → return `{ bars: [], message: 'No market data cached for this symbol.' }`.

**Tests:**

File: `apps/server/src/__tests__/ai-tools.test.ts` (new)

Setup: in-memory SQLite DB with all required tables (canvasItems, accounts, budgetCategories, subscriptions, invoices, invoiceLineItems, debts, holdings, networthCategories, networthEntries, marketBars, receipts, workspaces). Insert test data in `beforeEach`.

```
describe('tool registry')
  it('getToolDefinitions returns all registered tools')
    - Call getToolDefinitions()
    - Assert array length >= 12
    - Assert each has name, description, input_schema fields
    - Assert all names are unique

  it('executeTool throws for unknown tool name')
    - Call executeTool('nonexistent_tool', {}, context)
    - Expect error: 'Unknown tool: nonexistent_tool'

describe('get_workspace_summary')
  it('returns workspace info and data counts')
    - Insert workspace + 3 accounts + 2 budget categories
    - Execute tool with empty input
    - Assert result contains workspace name, type, and counts

describe('get_canvas_items')
  it('returns all canvas items for workspace')
    - Insert 3 canvas items of different types
    - Execute tool with empty input
    - Assert 3 items returned with id, type, name

  it('filters by type when provided')
    - Insert 2 budget-cards and 1 note
    - Execute with { type: 'budget-card' }
    - Assert exactly 2 results

describe('get_item_data')
  it('returns parsed data for a canvas item')
    - Insert canvas item with data='{"categories":[{"name":"Food","budgeted":500}]}'
    - Execute with { itemId: '<id>' }
    - Assert result.data.categories[0].name === 'Food'

  it('returns error for item not in workspace')
    - Insert item in workspace-B
    - Execute with { itemId: '<id>' } in workspace-A context
    - Assert result contains error message

describe('get_accounts')
  it('returns all accounts with balances')
    - Insert 3 accounts: checking $1000, savings $5000, credit -$500
    - Execute with empty input
    - Assert 3 accounts returned, each with id, name, type, balance

  it('filters by type')
    - Execute with { type: 'checking' }
    - Assert only checking accounts returned

describe('get_budget')
  it('returns budget categories with amounts')
    - Insert 2 categories: Food (budgeted 500, actual 450), Rent (budgeted 1500, actual 1500)
    - Execute
    - Assert 2 categories returned with correct amounts

describe('get_invoices')
  it('returns invoices with computed totals')
    - Insert invoice with 2 line items and taxRate=10
    - Execute
    - Assert invoice returned with computed subtotal and total (including tax)

  it('filters by status')
    - Insert 1 paid, 1 sent invoice
    - Execute with { status: 'sent' }
    - Assert only sent invoice returned

describe('get_receipts')
  it('returns receipts in workspace')
    - Insert 2 receipts
    - Execute
    - Assert 2 receipts returned with vendor, amount, date

describe('get_subscriptions')
  it('returns active subscriptions')
    - Insert 2 active + 1 cancelled subscription
    - Execute
    - Assert 2 results (only active)

describe('get_holdings')
  it('returns portfolio holdings')
    - Insert 3 holdings: AAPL, GOOGL, VTI
    - Execute
    - Assert 3 holdings with symbol, value, targetPct

describe('get_debts')
  it('returns debts with interest rates')
    - Insert 2 debts
    - Execute
    - Assert 2 debts with balance, annualInterestRate, minimumPayment

describe('get_networth')
  it('returns net worth breakdown')
    - Insert 2 asset categories with entries totaling $100k, 1 liability category with entries totaling $30k
    - Execute
    - Assert result: assets=$100k, liabilities=$30k, netWorth=$70k

describe('get_market_data')
  it('returns cached bars for symbol')
    - Insert 5 market bars for AAPL
    - Execute with { symbol: 'AAPL' }
    - Assert 5 bars returned with OHLCV data

  it('returns empty array for unknown symbol')
    - Execute with { symbol: 'ZZZZZ' }
    - Assert bars is empty array
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-tools.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manually inspect tool definitions: each has a clear `description` that Claude can understand, and `input_schema` matches what the executor expects

---

## BU-04 — Canvas defaults + auto-positioning (server-side)

**Goal:** Create server-side utilities for canvas item default dimensions, default names, default data, and automatic positioning of new items.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/canvas-defaults.ts` — new file: ITEM_DEFAULTS, defaultNames, createDefaultData
- `apps/server/src/services/auto-position.ts` — new file: findNextPosition algorithm
- `apps/server/src/__tests__/auto-position.test.ts` — new test file

**Description:**

**`canvas-defaults.ts`:**

Copy the `ITEM_DEFAULTS` map from `apps/web/src/hooks/useCanvasDrop.ts` to this server-side file. This is a plain `Record<string, { width: number; height: number }>` with entries for all 27 canvas item types:

```
a4-page: 565×800, secret-card: 320×240, note: 260×180, table-card: 400×300,
kpi-card: 240×140, chart-card: 480×320, file-card: 280×200, timer-card: 240×140,
invoice-card: 320×400, budget-card: 320×360, ledger-card: 320×360,
receipt-card: 320×360, subscription-card: 320×360, account-card: 320×360,
pnl-card: 360×280, balance-sheet-card: 340×280, cash-flow-card: 360×280,
tax-estimator-card: 320×300, loan-calculator-card: 340×300,
projection-card: 340×280, breakeven-card: 320×260, depreciation-card: 340×280,
embed-card: 480×320, networth-card: 340×280, debt-planner-card: 340×300,
rent-vs-buy-card: 340×300, portfolio-card: 340×280, header-card: 300×50
```

Copy the `defaultNames` map from `apps/web/src/stores/canvas-store.ts`. Same `Record<string, string>` with entries like `'budget-card': 'Untitled Budget'`, etc.

Create `createDefaultData(type: string): Record<string, unknown> | undefined` — a function that returns the default data blob for a given item type. This replicates the logic from `canvas-store.ts`'s `addItem` method which calls `createDefaultBudgetData()`, `createDefaultInvoiceData()`, etc.

For Phase 2, only implement default data for the item types that the AI will create: `budget-card`, `invoice-card`, `account-card`, `receipt-card`, `subscription-card`, `table-card`, `kpi-card`, `chart-card`, `note`, `pnl-card`, `balance-sheet-card`, `cash-flow-card`, `tax-estimator-card`, `loan-calculator-card`, `projection-card`, `breakeven-card`, `depreciation-card`, `networth-card`, `debt-planner-card`, `rent-vs-buy-card`, `portfolio-card`. Types like `a4-page`, `secret-card`, `file-card`, `timer-card`, `embed-card`, `header-card` return `undefined` (no default data needed — the AI won't create these types, or they have no data blob).

The default data functions must be server-safe — no browser APIs, no React imports. The existing `createDefault*Data()` functions in `apps/web/src/lib/*-utils.ts` are pure functions that only depend on `currency-utils.ts` (which is also pure). Import and call them directly, or if any have browser dependencies, copy the minimal default data inline.

Decisions already made:
- `ITEM_DEFAULTS` and `defaultNames` are intentionally duplicated between client and server. The client copy is used for drag-and-drop; the server copy is used for AI-created items. Keeping them in sync is a manual step — acceptable for now because these maps change infrequently (only when a new item type is added).
- `createDefaultData` returns the same initial data shape as the client-side `addItem`. This ensures AI-created items look identical to manually created ones.
- Items created by the AI without explicit data get the same defaults as items dragged from the tool panel.

**`auto-position.ts`:**

Create `findNextPosition(existingItems: Array<{ x: number; y: number; width: number; height: number }>, newWidth: number, newHeight: number): { x: number; y: number }`.

Algorithm:
1. If no existing items, return `{ x: 100, y: 100 }` (top-left of canvas with padding).
2. Find the maximum Y extent across all existing items: `maxY = max(item.y + item.height)`.
3. Return `{ x: 100, y: maxY + 40 }` — place below the lowest item with a 40px gap.
4. For batch placement (multiple items created in one tool call), each subsequent item is placed to the right of the previous one with a 40px horizontal gap. If the row exceeds 1200px width, wrap to the next row.

Create `findBatchPositions(existingItems, newItems: Array<{ width: number; height: number }>): Array<{ x: number; y: number }>`.

Algorithm:
1. Start at `findNextPosition(existingItems, ...)`.
2. Place each item left-to-right with 40px gaps.
3. If cumulative width exceeds 1200px, start a new row (y += max height of current row + 40px, x resets to 100).
4. Return array of positions matching the input array order.

Edge cases:
- All existing items at negative coordinates → still works (maxY handles negatives correctly).
- Single-item creation → `findNextPosition` is sufficient, no batch logic needed.
- Very large items (>1200px wide) → place on their own row, no wrapping.

**Tests:**

File: `apps/server/src/__tests__/auto-position.test.ts` (new)

```
describe('findNextPosition')
  it('returns (100, 100) when no existing items')
    - Call with empty array, newWidth=320, newHeight=360
    - Assert { x: 100, y: 100 }

  it('places below the lowest existing item')
    - Existing items: [{ x: 100, y: 100, width: 320, height: 360 }]
    - Call with newWidth=320, newHeight=360
    - Assert { x: 100, y: 500 } (100 + 360 + 40 = 500)

  it('handles multiple existing items at different Y levels')
    - Existing items: [{ x: 100, y: 100, ... height: 200 }, { x: 500, y: 400, ... height: 300 }]
    - maxY = 400 + 300 = 700
    - Assert { x: 100, y: 740 } (700 + 40)

  it('handles items at negative coordinates')
    - Existing items: [{ x: -200, y: -100, width: 100, height: 50 }]
    - maxY = -100 + 50 = -50
    - Assert { x: 100, y: -10 } (-50 + 40)

describe('findBatchPositions')
  it('places items in a row with 40px gaps')
    - 3 items: widths 320, 320, 320; empty existing items
    - Assert positions: [{ x: 100, y: 100 }, { x: 460, y: 100 }, { x: 820, y: 100 }]
    - (100, 100+320+40=460, 460+320+40=820)

  it('wraps to next row when exceeding 1200px')
    - 4 items: widths 400, 400, 400, 400; empty existing items
    - First row: x=100 (w=400), x=540 (w=400), x=980 (w=400) → 980+400=1380 > 1200
    - Third item would push past 1200, so it wraps
    - Assert wrapping occurs at appropriate point

  it('starts below existing items')
    - Existing items: [{ x: 100, y: 100, width: 320, height: 360 }]
    - 2 new items
    - Assert first position y = 500

describe('canvas-defaults')
  it('ITEM_DEFAULTS has entries for all 27+ item types')
    - Assert keys include budget-card, invoice-card, note, etc.
    - Assert each has width > 0 and height > 0

  it('defaultNames has entries for all item types')
    - Assert keys match ITEM_DEFAULTS keys

  it('createDefaultData returns data for budget-card')
    - Call createDefaultData('budget-card')
    - Assert result has expected shape (categories array, etc.)

  it('createDefaultData returns undefined for types without data')
    - Call createDefaultData('header-card')
    - Assert result is undefined
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/auto-position.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manually verify ITEM_DEFAULTS matches the client-side copy in `useCanvasDrop.ts`

---

## BU-05 — Creation + mutation tool definitions

**Goal:** Add 5 tools that let Claude create and update canvas items, create connections, and organize layout.

**Inputs:** BU-04

**Creates / Modifies:**
- `apps/server/src/services/ai-tools.ts` — extend with creation/mutation tools
- `apps/server/src/__tests__/ai-tools.test.ts` — extend with creation/mutation tests

**Description:**

Add 5 new tools to the `TOOL_REGISTRY`:

1. **`create_canvas_item`** — Creates a new canvas item and inserts it into the database.
   - Input schema: `{ type: string (required), name?: string, data?: object }`
   - `type` must be one of the valid canvas item types (validated against `ITEM_DEFAULTS` keys)
   - `name` defaults to `defaultNames[type]` if not provided
   - `data` defaults to `createDefaultData(type)` if not provided. If provided, it's merged with defaults (provided fields override defaults).
   - Executor flow:
     1. Validate `type` is in `ITEM_DEFAULTS`
     2. Generate UUID for the item ID
     3. Look up default dimensions from `ITEM_DEFAULTS`
     4. Query existing canvas items for this workspace to get positions
     5. Call `findNextPosition(existingItems, width, height)` to auto-position
     6. Determine `zIndex`: max existing zIndex + 1 (or 1 if no items)
     7. Insert into `canvasItems` table
     8. Return `{ id, type, name, x, y, width, height, zIndex }` — the full item shape for the client
   - The executor also marks the result with `_canvasUpdate: true` so the streaming layer knows to send a `canvas_update` SSE event.

2. **`update_canvas_item`** — Updates an existing canvas item's data.
   - Input schema: `{ itemId: string (required), name?: string, data?: object }`
   - Executor verifies the item exists and belongs to the workspace.
   - If `data` is provided, it replaces the item's `data` column (full replacement, not merge — Claude should send the complete data object).
   - If `name` is provided, updates the name.
   - Returns the updated item shape.

3. **`create_connection`** — Creates a bezier connection between two canvas items.
   - Input schema: `{ fromItemId: string, fromAnchor: string, toItemId: string, toAnchor: string }`
   - Anchors: `'top' | 'right' | 'bottom' | 'left'`
   - Executor validates both items exist in the workspace, generates UUID, inserts into `canvasConnections` table.
   - Returns `{ id, fromItemId, fromAnchor, toItemId, toAnchor }`.

4. **`position_items`** — Repositions one or more existing canvas items (for layout organization).
   - Input schema: `{ positions: Array<{ itemId: string, x: number, y: number }> }`
   - Executor updates `x` and `y` for each item. Validates all items belong to the workspace.
   - Returns `{ updated: number }`.

5. **`delete_canvas_item`** — Registered but always returns an error.
   - Input schema: `{ itemId: string }`
   - Executor returns `{ error: 'Deleting canvas items requires manual confirmation. Please ask the user to delete it themselves.' }`
   - This prevents the AI from accidentally destroying user data. The tool exists so Claude knows deletion is not available and can guide the user.

Decisions already made:
- `create_canvas_item` uses direct DB INSERT, not the canvas auto-save mechanism. The client receives the new item via a `canvas_update` SSE event and adds it to the Zustand store. The next auto-save cycle will include it (since it's now in the store), but won't conflict because the DB row already exists (upsert pattern in the save endpoint).
- `update_canvas_item` does full data replacement, not merge. This is simpler and less error-prone. Claude should read the current data (via `get_item_data`), modify it, and write the full object back.
- `delete_canvas_item` exists as a "safety valve" — it's better for Claude to know the tool exists but is restricted than to not know about it and try to find workarounds.
- `position_items` is separate from `update_canvas_item` because positioning multiple items at once is a common batch operation (e.g., "arrange these cards in a grid").

Edge cases:
- `create_canvas_item` with invalid type → return `{ error: 'Unknown item type: xyz. Valid types: ...' }` with the list of valid types.
- `update_canvas_item` or `position_items` with an item ID not in the workspace → return `{ error: 'Item not found' }` for that item, process remaining items.
- `create_connection` with same item for from/to → return `{ error: 'Cannot connect an item to itself' }`.
- `position_items` with empty positions array → return `{ updated: 0 }` (no-op).

**Tests:**

File: `apps/server/src/__tests__/ai-tools.test.ts` (extend)

```
describe('create_canvas_item')
  beforeEach — insert workspace, set up context

  it('creates a budget-card with defaults')
    - Execute with { type: 'budget-card' }
    - Assert result has id (UUID), type='budget-card', name='Untitled Budget'
    - Assert width=320, height=360 (from ITEM_DEFAULTS)
    - Query DB: verify row exists with matching values

  it('creates item with custom name and data')
    - Execute with { type: 'budget-card', name: 'Q1 Budget', data: { categories: [{ name: 'Marketing', budgeted: 5000, actual: 0 }] } }
    - Assert result.name === 'Q1 Budget'
    - Query DB: verify data column contains the custom data

  it('auto-positions below existing items')
    - Insert 2 existing canvas items at y=100 (height 360) and y=500 (height 280)
    - Execute create
    - Assert result.y >= 500 + 280 + 40 = 820

  it('rejects invalid item type')
    - Execute with { type: 'invalid-thing' }
    - Assert result contains error message

  it('assigns incrementing zIndex')
    - Insert existing item with zIndex=5
    - Execute create
    - Assert result.zIndex === 6

describe('update_canvas_item')
  it('updates item name')
    - Insert canvas item
    - Execute with { itemId: '<id>', name: 'Updated Name' }
    - Query DB: verify name changed

  it('updates item data (full replacement)')
    - Insert canvas item with data='{"a":1,"b":2}'
    - Execute with { itemId: '<id>', data: { a: 99, c: 3 } }
    - Query DB: verify data is '{"a":99,"c":3}' (b removed)

  it('returns error for item not in workspace')
    - Insert item in different workspace
    - Execute with that itemId
    - Assert result contains error

describe('create_connection')
  it('creates a connection between two items')
    - Insert 2 canvas items
    - Execute with { fromItemId: '<id1>', fromAnchor: 'right', toItemId: '<id2>', toAnchor: 'left' }
    - Query DB: verify connection row exists

  it('rejects self-connection')
    - Insert 1 canvas item
    - Execute with fromItemId = toItemId
    - Assert result contains error

describe('position_items')
  it('repositions multiple items')
    - Insert 3 canvas items
    - Execute with positions for all 3
    - Query DB: verify x, y updated for each

  it('returns error for items not in workspace')
    - Execute with an itemId from different workspace
    - Assert result contains error

describe('delete_canvas_item')
  it('always returns an error message')
    - Insert a canvas item
    - Execute with { itemId: '<id>' }
    - Assert result.error contains 'manual confirmation'
    - Query DB: verify item still exists (NOT deleted)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-tools.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Verify total tool count: `getToolDefinitions().length === 17` (12 read + 5 mutation)

---

## BU-06 — Calculation tool definitions

**Goal:** Add 7 calculation tools that let Claude run financial computations and return results (or create canvas items with computed data).

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/lib/calc/` — new directory with copied calculation files
- `apps/server/src/services/ai-tools.ts` — extend with calculation tools
- `apps/server/src/__tests__/ai-tools.test.ts` — extend with calculation tests

**Description:**

**Step 1: Copy calculation utilities to the server.**

Copy the following files from `apps/web/src/lib/` to `apps/server/src/lib/calc/`:

1. `currency-utils.ts` — shared dependency (currency formatting, `SupportedCurrency` type)
2. `tax-data.ts` — tax bracket data used by tax-estimator
3. `tax-estimator-utils.ts` → `calc/tax-estimator.ts`
4. `loan-calculator-utils.ts` → `calc/loan-calculator.ts`
5. `projection-utils.ts` → `calc/projection.ts`
6. `breakeven-utils.ts` → `calc/breakeven.ts`
7. `depreciation-utils.ts` → `calc/depreciation.ts`
8. `rent-vs-buy-utils.ts` → `calc/rent-vs-buy.ts`
9. `debt-planner-utils.ts` → `calc/debt-planner.ts`

Update import paths within the copied files to reference the server-side `currency-utils.ts` and `tax-data.ts`. These are pure functions with zero browser dependencies — the copy should work without any code changes beyond import paths.

Add a barrel export: `apps/server/src/lib/calc/index.ts` exporting all computation functions.

**Step 2: Add 7 calculation tools to the registry.**

1. **`calculate_tax`** — Estimates federal and state income tax.
   - Input schema mirrors `TaxEstimatorData`: `{ grossIncome, filingStatus, state, deductions?, credits?, ... }`
   - Executor calls `computeTaxEstimate(input)` and returns the full result (effective rate, marginal rate, breakdown, refund/owed).

2. **`calculate_loan`** — Generates loan amortization schedule.
   - Input schema mirrors `LoanCalculatorData`: `{ loanAmount, annualRate, termYears, ... }`
   - Executor calls `computeLoan(input)`. Returns summary (monthly payment, total interest, total cost) and first/last few rows of the amortization schedule (not all rows — truncate to avoid token explosion).

3. **`calculate_projection`** — Projects investment growth.
   - Input schema mirrors `ProjectionCardData`: `{ initialAmount, monthlyContribution, annualReturn, years, inflationRate? }`
   - Executor calls `computeProjection(input)`. Returns summary (final value, total contributions, total growth) and yearly milestones.

4. **`calculate_breakeven`** — Calculates breakeven point.
   - Input schema mirrors `BreakevenCardData`: `{ fixedCosts, variableCostPerUnit, pricePerUnit }`
   - Executor calls `computeBreakeven(input)`. Returns breakeven units, revenue, and a few rows of the profit schedule.

5. **`calculate_depreciation`** — Computes asset depreciation.
   - Input schema mirrors `DepreciationCardData`: `{ assetCost, salvageValue, usefulLife, method }`
   - Executor calls `computeDepreciation(input)`. Returns full depreciation schedule (usually ≤30 rows).

6. **`calculate_rent_vs_buy`** — Compares renting vs buying.
   - Input schema mirrors `RentVsBuyCardData`: `{ homePrice, downPaymentPct, mortgageRate, ... }`
   - Executor calls `computeRentVsBuy(input)`. Returns summary (breakeven month, final rent advantage, final buy advantage) and yearly snapshots.

7. **`calculate_debt_payoff`** — Simulates debt paydown strategies.
   - Input schema mirrors the config + debts input: `{ strategy, extraMonthlyBudget, debts: [{ name, balance, annualInterestRate, minimumPayment }] }`
   - Executor calls `simulateDebtPaydown(config, debts)`. Returns summary (total months, total interest, savings vs baseline) and per-debt payoff dates.

All calculation tools follow the same pattern:
- Validate input against expected shape
- Call the pure computation function
- Truncate large result arrays (amortization schedules, monthly simulations) to a reasonable size with a note: `"schedule": [...first 12...], "scheduleTruncated": true, "totalRows": 360`
- Return the structured result

Decisions already made:
- Calculation files are copied, not shared via a package. The web and server copies may diverge — that's acceptable because they serve different consumers (UI rendering vs. AI tool output). Keeping them in sync is a manual step.
- Large result arrays are truncated for AI consumption. Claude doesn't need 360 amortization rows — a summary plus first/last few rows suffices. The user can create a canvas item if they want the full schedule.
- Calculation tools do NOT create canvas items. They return results. Claude can then decide to create a canvas item with the results using `create_canvas_item` in a subsequent tool call.

**Tests:**

File: `apps/server/src/__tests__/ai-tools.test.ts` (extend)

```
describe('calculate_tax')
  it('computes federal tax for single filer')
    - Execute with { grossIncome: 75000, filingStatus: 'single', state: 'CA' }
    - Assert result has effectiveRate, totalTax, breakdown
    - Assert totalTax > 0

  it('handles zero income')
    - Execute with { grossIncome: 0, filingStatus: 'single', state: 'TX' }
    - Assert totalTax === 0

describe('calculate_loan')
  it('computes monthly payment for 30-year mortgage')
    - Execute with { loanAmount: 300000, annualRate: 6.5, termYears: 30 }
    - Assert result.monthlyPayment is approximately $1896
    - Assert result.totalInterest > 0
    - Assert result.schedule is truncated (not 360 rows)

describe('calculate_projection')
  it('projects investment growth')
    - Execute with { initialAmount: 10000, monthlyContribution: 500, annualReturn: 8, years: 10 }
    - Assert result.finalValue > 10000 + (500 * 12 * 10) (growth exceeds contributions)

describe('calculate_breakeven')
  it('computes breakeven point')
    - Execute with { fixedCosts: 10000, variableCostPerUnit: 5, pricePerUnit: 25 }
    - Assert result.breakevenUnits === 500 (10000 / (25-5))

describe('calculate_depreciation')
  it('computes straight-line depreciation')
    - Execute with { assetCost: 50000, salvageValue: 5000, usefulLife: 5, method: 'straight-line' }
    - Assert annual depreciation = $9000 per year
    - Assert 5 schedule rows

describe('calculate_rent_vs_buy')
  it('computes comparison over time')
    - Execute with reasonable inputs
    - Assert result has breakevenMonth, rentTotal, buyTotal

describe('calculate_debt_payoff')
  it('computes snowball strategy')
    - Execute with { strategy: 'snowball', extraMonthlyBudget: 200, debts: [{ name: 'CC', balance: 5000, annualInterestRate: 18, minimumPayment: 100 }] }
    - Assert result has totalMonths, totalInterest
    - Assert totalMonths > 0
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-tools.test.ts` — all calculation tests pass
- `pnpm typecheck` — no errors (especially in the new `calc/` directory)
- Verify total tool count: `getToolDefinitions().length === 24` (12 read + 5 mutation + 7 calc)
- Manually verify that copied calc files have no browser imports (`document`, `window`, `navigator`, etc.)

---

## BU-07 — Tool execution engine + SSE streaming

**Goal:** Refactor the chat stream endpoint to support multi-round tool execution: Claude calls tools, server executes them, sends results back to Claude, and streams the entire process to the client.

**Inputs:** BU-02, BU-03, BU-05, BU-06

**Creates / Modifies:**
- `apps/server/src/routes/chat-stream.ts` — major refactor for tool loop
- `apps/server/src/__tests__/chat-stream.test.ts` — extend with tool execution tests

**Description:**

This is the core integration unit. The existing `chat-stream.ts` handles a single Claude call. It must be extended to support a multi-round tool execution loop within the same SSE connection.

**New flow (replacing steps 9–11 in the existing endpoint):**

1. Call `streamChatCompletion` with `tools: getToolDefinitions()` (from `ai-tools.ts`).
2. Iterate the stream as before, but now handle `content_block_start` events with `type: 'tool_use'` in addition to `text_delta`.
3. When the stream completes, check the `stop_reason`:
   - If `stop_reason === 'end_turn'` → done, send `done` SSE event (same as Phase 1).
   - If `stop_reason === 'tool_use'` → tool execution needed, enter the loop.

**Tool execution loop:**

```
roundCount = 0
while (stop_reason === 'tool_use' && roundCount < MAX_TOOL_ROUNDS && !aborted):
  roundCount++

  // 1. Extract tool_use blocks from the completed response
  toolUseBlocks = extract from content_blocks where type === 'tool_use'

  if (toolUseBlocks.length > MAX_TOOL_CALLS_PER_ROUND):
    truncate to MAX_TOOL_CALLS_PER_ROUND, log warning

  // 2. Persist the assistant message (with toolCalls JSON)
  persist assistant message: content = accumulated text, toolCalls = JSON.stringify(toolUseBlocks)

  // 3. Execute each tool
  toolResults = []
  for each toolUseBlock:
    sendSSE({ type: 'tool_call_start', toolCallId, toolName, toolInput })
    startTime = Date.now()

    result = await executeTool(toolName, toolInput, context)

    durationMs = Date.now() - startTime
    sendSSE({ type: 'tool_call_end', toolCallId, toolName, durationMs })
    sendSSE({ type: 'tool_result', toolCallId, toolName, result, isError: false })

    // If the tool created/updated a canvas item, send canvas_update
    if (result._canvasUpdate):
      sendSSE({ type: 'canvas_update', action: 'create'/'update', item: result })

    toolResults.push({ tool_use_id: toolCallId, content: JSON.stringify(result) })

    // Persist tool result message
    persist message: role='tool', content=JSON.stringify(result), toolCallId=toolCallId

  // 4. Call Claude again with tool results
  Append to anthropicMessages:
    - assistant message with content blocks (text + tool_use)
    - user message with tool_result content blocks

  newStream = await streamChatCompletion({ messages: anthropicMessages, tools, systemPrompt })

  // 5. Iterate new stream (same text_delta handling as before)
  // Accumulate text, track tokens

  // 6. Sum tokens: add this round's input/output tokens to running totals

  // 7. Check new stop_reason → loop or exit
```

**Safety bounds:**
- `MAX_TOOL_ROUNDS = 10` — prevents infinite loops where Claude keeps calling tools
- `MAX_TOOL_CALLS_PER_ROUND = 20` — prevents a single round from executing too many tools
- If limits are hit, send a `text_delta` with a message like "I've reached the maximum number of tool calls for this response. Here's what I found so far:" and then send `done`.

**Token tracking across rounds:**
- Sum `inputTokens` and `outputTokens` across all Claude calls in the loop.
- The `done` SSE event reports the total tokens for the entire multi-round interaction.
- The `aiUsage` table row records the total tokens and cost for the entire request.

**Message persistence:**
- Each assistant message in the loop is persisted with its `toolCalls` JSON.
- Each tool result is persisted as a `role='tool'` message with `toolCallId` set.
- The final assistant message (after tool results are processed) is also persisted.
- This means a single user message can produce multiple DB rows: assistant-with-tools, tool-result, tool-result, ..., assistant-final.

**Conversation history for multi-round:**
- When building `anthropicMessages` for a subsequent Claude call, include the full conversation history (all prior messages including tool calls and results from this request).
- The message format for Anthropic: assistant messages with tool_use blocks use multi-content-block format (`content: [{ type: 'text', text: '...' }, { type: 'tool_use', id: '...', name: '...', input: {...} }]`). Tool result messages use `role: 'user'` with `content: [{ type: 'tool_result', tool_use_id: '...', content: '...' }]`.

**Building anthropicMessages from DB rows:**
- The existing code filters for `role === 'user' || role === 'assistant'` and maps to `{ role, content: string }`. This must be extended:
  - `role === 'user'` → `{ role: 'user', content: message.content }` (same as before)
  - `role === 'assistant'` with `toolCalls !== null` → `{ role: 'assistant', content: [{ type: 'text', text: message.content }, ...JSON.parse(message.toolCalls).map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input }))] }`
  - `role === 'assistant'` without `toolCalls` → `{ role: 'assistant', content: message.content }` (same as before)
  - `role === 'tool'` → these are grouped and sent as `{ role: 'user', content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }] }`. Multiple consecutive tool messages are merged into a single `role: 'user'` message with multiple `tool_result` blocks.

Decisions already made:
- The tool loop runs inside the existing SSE connection. The client maintains one open connection for the entire multi-round interaction.
- Tool execution is sequential within a round (not parallel). This simplifies error handling and makes tool activity indicators predictable for the user. Parallel execution is a future optimization.
- Token costs are summed across all rounds and recorded as a single `aiUsage` entry.
- The `_canvasUpdate` marker on tool results is stripped before sending to Claude (it's metadata for the SSE layer, not part of the tool result).

Edge cases:
- Claude returns `stop_reason === 'tool_use'` but no tool_use blocks → treat as `end_turn` (shouldn't happen, but defensive).
- Tool executor throws an unhandled error → catch it, return `{ is_error: true, error: 'Internal error executing tool' }` as the tool_result to Claude. Claude will typically apologize and try a different approach.
- Client disconnects mid-tool-loop (`aborted === true`) → stop executing tools, persist whatever has been completed so far.
- Claude calls a tool that doesn't exist in the registry → return `{ is_error: true, error: 'Unknown tool' }` as tool_result.

**Tests:**

File: `apps/server/src/__tests__/chat-stream.test.ts` (extend existing)

These tests mock the Anthropic SDK to simulate tool-using responses. Use the existing mock pattern from Phase 1 tests.

```
describe('tool execution loop')
  beforeEach — set up in-memory DB with workspace, conversation, user message. Mock streamChatCompletion.

  it('executes a single read-only tool call')
    - Mock first Claude call: returns text + tool_use block for get_accounts, stop_reason='tool_use'
    - Mock second Claude call: returns text summarizing accounts, stop_reason='end_turn'
    - Insert test accounts in DB
    - POST to /api/chat/stream
    - Assert SSE events received: message_start, text_delta(s), tool_call_start, tool_call_end, tool_result, text_delta(s), done
    - Assert done event has summed tokens from both calls

  it('executes create_canvas_item and sends canvas_update')
    - Mock first Claude call: returns tool_use for create_canvas_item, stop_reason='tool_use'
    - Mock second Claude call: returns text confirming creation, stop_reason='end_turn'
    - POST to /api/chat/stream
    - Assert SSE events include canvas_update with action='create' and full item shape
    - Query DB: verify canvas item row was inserted

  it('handles multi-tool-call in single round')
    - Mock Claude call with 3 tool_use blocks (get_accounts, get_budget, get_subscriptions)
    - Assert 3 tool_call_start + 3 tool_call_end + 3 tool_result events
    - Assert all 3 results returned before second Claude call

  it('handles multi-round tool execution')
    - Round 1: Claude calls get_accounts → tool result
    - Round 2: Claude calls create_canvas_item → tool result
    - Round 3: Claude returns final text
    - Assert 2 tool rounds executed, final done event sent

  it('respects MAX_TOOL_ROUNDS limit')
    - Mock Claude to always return stop_reason='tool_use'
    - Assert loop stops after MAX_TOOL_ROUNDS (10)
    - Assert done event is still sent

  it('persists tool messages in DB')
    - Execute a tool-using conversation
    - Query messages table for the conversation
    - Assert messages include: user, assistant (with toolCalls JSON), tool (with toolCallId), assistant (final)

  it('sums tokens across rounds')
    - Round 1: inputTokens=100, outputTokens=50
    - Round 2: inputTokens=200, outputTokens=100
    - Assert done event: inputTokens=300, outputTokens=150
    - Assert aiUsage record: inputTokens=300, outputTokens=150

  it('handles tool executor error gracefully')
    - Mock a tool executor that throws
    - Assert tool_result SSE event has isError=true
    - Assert Claude receives { is_error: true } and continues conversation

  it('handles client disconnect during tool loop')
    - Simulate req.close event after first tool_call_start
    - Assert no more tool executions after disconnect
    - Assert persisted messages include only completed operations
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/chat-stream.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: open the chat, ask "what accounts do I have?" → verify tool_call_start, tool_call_end, tool_result events in the network tab, and Claude responds with actual account data
- Manual test: ask "create a budget for Q1" → verify canvas_update SSE event, budget-card appears on the canvas

---

## BU-08 — System prompt enhancement

**Goal:** Extend the system prompt to guide Claude on when and how to use tools, including best practices and restrictions.

**Inputs:** None (can run in parallel with BU-01)

**Creates / Modifies:**
- `apps/server/src/services/ai-context.ts` — extend `SYSTEM_PREAMBLE`
- `apps/server/src/__tests__/ai-context.test.ts` — extend with system prompt tests

**Description:**

Extend `SYSTEM_PREAMBLE` in `ai-context.ts` with a new `## Tool usage guidelines` section. This section instructs Claude on:

**When to use tools vs. workspace summary:**
- The workspace context (accounts, budget, etc.) is already in the system prompt. For simple questions like "what's my net worth?", answer directly from the context — don't call a tool.
- Use read-only tools when the user asks for detailed data that isn't in the summary (e.g., "show me all my invoices" — the summary only has counts, but `get_invoices` returns full details).
- Use `get_item_data` to read the data of a specific canvas item when the user references it by name.
- Use `get_market_data` for real-time pricing data that isn't in the workspace context.

**Canvas creation best practices:**
- When the user says "create a budget" / "make a chart" / etc., use `create_canvas_item` with a descriptive name (not "Untitled Budget" — use context to name it, e.g., "Q1 2026 Marketing Budget").
- When creating items with data, populate realistic defaults based on the conversation context. If the user says "create a budget with categories for marketing, engineering, and sales", populate the categories array accordingly.
- After creating an item, briefly confirm what was created and where to find it.

**Calculation guidelines:**
- When the user asks "how much tax will I owe?" or similar, use the appropriate calculation tool.
- Show key results inline in the response. Don't just say "I ran the calculation" — include the important numbers.
- State assumptions clearly: "Assuming single filing status and CA state taxes, ..."
- If the user wants to keep the calculation, offer to create a canvas item with the results.

**Restrictions:**
- You cannot delete canvas items. If the user asks you to delete something, explain that they need to do it manually.
- You cannot modify vault-encrypted data (secrets). If a tool returns encrypted data, do not include it in your response.
- You cannot access data from other workspaces.

**Response formatting:**
- When returning financial data from tools, format numbers as currency ($12,345.67) and percentages (12.5%).
- Use tables (markdown) for tabular data like account lists, budget breakdowns, amortization schedules.
- Keep tool-augmented responses concise — the user can see the canvas item for full details.

Decisions already made:
- Tool guidelines are part of the system prompt, not a separate document. This keeps everything in one place and ensures Claude always has access to the guidelines.
- The guidelines are opinionated (e.g., "name items descriptively") because vague guidance produces inconsistent behavior.
- The guidelines section is appended to the existing `SYSTEM_PREAMBLE` — the current rules and capabilities list remains unchanged.

**Tests:**

File: `apps/server/src/__tests__/ai-context.test.ts` (extend existing)

```
describe('SYSTEM_PREAMBLE — tool guidelines')
  it('includes tool usage guidelines section')
    - Import SYSTEM_PREAMBLE
    - Assert it contains '## Tool usage guidelines'

  it('mentions when to use tools vs workspace summary')
    - Assert SYSTEM_PREAMBLE contains text about using context for simple questions

  it('includes canvas creation best practices')
    - Assert SYSTEM_PREAMBLE contains text about descriptive naming

  it('includes calculation guidelines')
    - Assert SYSTEM_PREAMBLE contains text about showing key results

  it('includes restriction about not deleting items')
    - Assert SYSTEM_PREAMBLE contains text about manual deletion

  it('includes restriction about vault-encrypted data')
    - Assert SYSTEM_PREAMBLE contains text about encrypted data

describe('buildWorkspaceContext — tool context')
  it('system prompt remains under 4000 tokens for a typical workspace')
    - Insert workspace with moderate data (5 accounts, 3 budget categories, 2 subscriptions)
    - Build context
    - Assert total character count is reasonable (< 16000 chars ≈ 4000 tokens)
    - This ensures the system prompt + workspace context doesn't consume too much of the context window
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-context.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manually read the full system prompt and verify the guidelines are clear, actionable, and don't contradict the existing rules

---

## BU-09 — Client-side tool event handling

**Goal:** Extend the client to parse tool SSE events, display tool activity indicators, and update the canvas store when the AI creates items.

**Inputs:** BU-07

**Creates / Modifies:**
- `apps/web/src/hooks/useChat.ts` — parse tool events, track tool activity state
- `apps/web/src/stores/canvas-store.ts` — add `addItemDirect` action
- `apps/web/src/components/canvas/chat-panel.tsx` — display tool activity indicators
- `apps/web/src/components/canvas/chat-message.tsx` — show tool activity inline in messages

**Description:**

**`useChat.ts` changes:**

Add new state:
- `toolActivity`: `Array<{ toolCallId: string; toolName: string; status: 'running' | 'complete' | 'error'; durationMs?: number; result?: unknown }>` — tracks active and recently completed tool calls for the current streaming response. Cleared when the next user message is sent.

Extend the SSE event parsing switch statement to handle new event types:
- `tool_call_start` → add entry to `toolActivity` with status `'running'`
- `tool_call_end` → update matching entry's status to `'complete'`, set `durationMs`
- `tool_result` → update matching entry's `result`. If `isError`, set status to `'error'`.
- `canvas_update` → call `addItemDirect(event.item)` on the canvas store. This inserts the AI-created item directly into the Zustand store so it appears on the canvas immediately.
- `done` → same as before (clear streaming state, invalidate queries). Don't clear `toolActivity` — keep it visible so the user can see what tools were used after the response completes.

Add `toolActivity` to the hook's return object.

**`canvas-store.ts` changes:**

Add a new action `addItemDirect(item: CanvasItem)`:
- Inserts a fully-formed item into the `items` array without generating a UUID or looking up defaults (those were already done server-side).
- The item shape matches `CanvasItem` exactly: `{ id, type, name, x, y, width, height, zIndex, data }`.
- If an item with the same `id` already exists (e.g., from a race condition with auto-save), update it instead of duplicating.
- This action is distinct from `addItem` (which generates UUIDs and defaults) because AI-created items come with all fields pre-populated.

**`chat-panel.tsx` changes:**

Add a tool activity indicator below the streaming message content:
- While tools are running, show a compact inline indicator: "🔧 Running get_accounts..." with a subtle pulse animation.
- When a tool completes, show: "✓ get_accounts (45ms)" in muted text.
- Multiple tools show as a vertical list of indicators.
- Use the existing design system tokens: `text-muted-foreground` for completed tools, `text-foreground` for running tools.
- The indicator is part of the streaming message — it appears below the text content and above the blinking cursor.

**`chat-message.tsx` changes:**

For persisted messages (not streaming), if a message has `toolCalls` data, show a collapsed tool activity summary:
- "Used 3 tools: get_accounts, get_budget, create_canvas_item" in `text-[11px] text-muted-foreground`.
- Clicking expands to show the full tool call details (inputs and results). This is a disclosure/accordion pattern.
- This gives users transparency into what the AI did without cluttering the conversation.

Decisions already made:
- `addItemDirect` upserts (insert-or-update) to handle the case where auto-save might write the same item. This prevents duplicate items on the canvas.
- Tool activity indicators use minimal styling — they're informational, not attention-grabbing.
- Persisted tool call details are shown collapsed by default to keep the conversation readable.
- `canvas_update` events trigger `addItemDirect`, which adds the item to the Zustand store. The existing auto-save subscription will then include this item in the next save cycle. The DB row already exists (created by the tool executor), so the save is effectively a no-op for that item.

Edge cases:
- `canvas_update` event received while on a different workspace → ignore (the event includes no workspaceId, but the canvas store is workspace-scoped — items are loaded/cleared on workspace navigation).
- Multiple `canvas_update` events in rapid succession → each calls `addItemDirect`, which upserts. No debouncing needed.
- Tool activity for a tool that Claude called but the user navigated away during → activity list is cleared when the component unmounts (streaming state is cleaned up by the abort controller).

**Tests:**

No unit tests for client-side changes — React hooks with SSE streaming, Zustand stores, and complex state transitions are tested via:
- BU-11 E2E tests (full browser flow with tool calls)
- Manual verification below

**Verification:**
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual test (full flow):
  1. Open a workspace with some accounts
  2. Ask "what accounts do I have?" → verify tool activity indicator shows during execution, response includes real data
  3. Ask "create a budget for Q1 with categories for rent, food, and transport" → verify:
     - Tool activity shows "Running create_canvas_item..."
     - Budget card appears on the canvas (check canvas area)
     - Response confirms what was created
  4. Scroll through the conversation → verify completed tool calls show collapsed summary
  5. Click the tool summary → verify it expands to show details
  6. Refresh the page → verify the AI-created budget card persists on the canvas

---

## BU-10 — Safety guardrails + error handling

**Goal:** Wrap tool executors with safety checks, error handling, input validation, and logging.

**Inputs:** BU-07

**Creates / Modifies:**
- `apps/server/src/services/ai-tools.ts` — add safety wrappers
- `apps/server/src/routes/chat-stream.ts` — add error handling around tool loop
- `apps/server/src/__tests__/ai-tools.test.ts` — extend with safety tests

**Description:**

**Tool executor safety wrapper:**

Create a `safeExecuteTool(name, input, context)` function that wraps `executeTool`:

1. **Input validation:**
   - Validate `name` is a non-empty string
   - Validate `input` is an object (not null, not array)
   - For tools that accept `itemId`, validate it looks like a UUID (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
   - For `create_canvas_item`, validate `type` is in `ITEM_DEFAULTS` before executing
   - Return `{ is_error: true, error: 'Invalid input: ...' }` on validation failure

2. **Error handling:**
   - Wrap the executor call in try/catch
   - On error: return `{ is_error: true, error: 'Internal error executing tool. Please try again or use a different approach.' }`
   - Do NOT include stack traces or internal error details in the tool result (security)

3. **Vault data filtering:**
   - After a tool executor returns, scan the result for any field that looks like encrypted data (contains `ciphertext` or `iv` keys, or is a very long base64 string)
   - If found, replace with `'[encrypted — not accessible via AI]'`
   - This prevents vault-encrypted secrets from being sent to Claude (which would include them in its response)

4. **Logging:**
   - Before execution: `console.log('[AI Tool] Executing: ${name}', { input: truncateForLog(input) })`
   - After execution: `console.log('[AI Tool] ${name} completed in ${durationMs}ms', { success: true })`
   - On error: `console.error('[AI Tool] ${name} failed in ${durationMs}ms', { error: err.message })`
   - `truncateForLog` limits string values to 200 chars and arrays to 5 items to keep logs readable

**Chat stream error handling:**

Add error handling around the tool loop in `chat-stream.ts`:
- If the tool loop throws an unexpected error (not a tool executor error, but something like a DB connection failure), catch it, send an `error` SSE event, and end the stream.
- If a single tool fails, the loop continues with other tools in the round — the error is returned to Claude as a tool_result, not thrown.

**Rate limiting:**
- Count total tool executions per request. If it exceeds `MAX_TOOL_ROUNDS * MAX_TOOL_CALLS_PER_ROUND` (200), stop executing and return an error message.
- This is a safety net for the `MAX_TOOL_ROUNDS` check — belt and suspenders.

Decisions already made:
- Safety wrapping happens at the `safeExecuteTool` level, not inside each executor. This centralizes validation and error handling.
- Vault data filtering is a best-effort scan, not a cryptographic guarantee. The primary protection is that tool executors don't query the `vaultConfig` or secret-card data in the first place. The filter is a defense-in-depth measure.
- Logging uses `console.log/error` — no external logging service in Phase 2. Structured logging is a future improvement.

**Tests:**

File: `apps/server/src/__tests__/ai-tools.test.ts` (extend)

```
describe('safeExecuteTool — input validation')
  it('rejects empty tool name')
    - Call safeExecuteTool('', {}, context)
    - Assert result.is_error === true

  it('rejects non-object input')
    - Call safeExecuteTool('get_accounts', 'not an object', context)
    - Assert result.is_error === true

  it('rejects invalid UUID for itemId')
    - Call safeExecuteTool('get_item_data', { itemId: 'not-a-uuid' }, context)
    - Assert result.is_error === true, error mentions invalid ID

  it('rejects invalid type for create_canvas_item')
    - Call safeExecuteTool('create_canvas_item', { type: 'not-real' }, context)
    - Assert result.is_error === true

describe('safeExecuteTool — error handling')
  it('catches executor errors and returns is_error')
    - Mock executeTool to throw Error('DB connection lost')
    - Call safeExecuteTool('get_accounts', {}, context)
    - Assert result.is_error === true
    - Assert result.error does NOT contain 'DB connection lost' (no internal details)

  it('does not expose stack traces')
    - Mock executor to throw with stack
    - Assert result.error does not contain file paths or line numbers

describe('safeExecuteTool — vault data filtering')
  it('redacts encrypted data from tool results')
    - Mock executor to return { name: 'My Secret', ciphertext: 'abc123...', iv: 'xyz789' }
    - Call safeExecuteTool
    - Assert result.ciphertext === '[encrypted — not accessible via AI]'
    - Assert result.iv === '[encrypted — not accessible via AI]'

  it('does not redact normal data')
    - Mock executor to return { name: 'Checking', balance: 5000 }
    - Call safeExecuteTool
    - Assert result unchanged

describe('safeExecuteTool — logging')
  it('logs tool execution start and completion')
    - Spy on console.log
    - Call safeExecuteTool('get_accounts', {}, context)
    - Assert console.log called with '[AI Tool] Executing: get_accounts'
    - Assert console.log called with match for 'completed in'

  it('logs tool execution errors')
    - Spy on console.error
    - Mock executor to throw
    - Call safeExecuteTool
    - Assert console.error called with match for 'failed in'
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-tools.test.ts` — all safety tests pass
- `pnpm typecheck` — no type errors
- Manual test:
  1. Ask Claude to access an item that doesn't exist → verify graceful error (Claude says "I couldn't find that item")
  2. Ask Claude to delete an item → verify it explains manual deletion is required
  3. Check server console → verify tool execution logs appear with names and durations

---

## BU-11 — E2E tests + polish

**Goal:** Add Playwright E2E tests for tool-using conversations and polish the tool activity UI.

**Inputs:** BU-09, BU-10

**Creates / Modifies:**
- `apps/web/e2e/chat-tools.spec.ts` — new E2E test file
- `apps/web/src/components/canvas/chat-panel.tsx` — polish tool activity indicators

**Description:**

**E2E tests:**

Create `chat-tools.spec.ts` following the same pattern as the Phase 1 `chat.spec.ts`. The tests mock the SSE endpoint to return controlled tool event sequences (same mock pattern as Phase 1 — intercept the `/api/chat/stream` request and respond with crafted SSE events).

Test scenarios:

1. **Data query flow:** User asks about their accounts → mock SSE with tool_call_start (get_accounts), tool_call_end, tool_result (with account data), text_delta (Claude's summary), done → verify tool activity indicator appears and disappears, response contains data.

2. **Canvas item creation:** User asks to create a budget → mock SSE with tool_call_start (create_canvas_item), tool_call_end, tool_result, canvas_update (with item), text_delta, done → verify budget card appears on the canvas.

3. **Calculation flow:** User asks to calculate tax → mock SSE with tool_call_start (calculate_tax), tool_call_end, tool_result (with tax breakdown), text_delta, done → verify response contains calculated numbers.

4. **Multi-tool round:** Mock SSE with 3 tool calls in sequence → verify all 3 tool activity indicators appear, results are processed.

5. **Tool error handling:** Mock SSE with tool_result that has isError=true → verify Claude's response acknowledges the error gracefully.

6. **Tool activity in persisted messages:** After a tool-using conversation, verify the persisted message shows a collapsed tool summary.

Mock strategy:
- Intercept `POST /api/chat/stream` with `page.route()`.
- Return SSE events as a readable stream with appropriate delays.
- For canvas_update tests, also intercept the tRPC canvas save endpoint to verify the new item is included.

**Polish:**

Tool activity indicator improvements:
- Animate the transition from "running" to "complete" (fade in the checkmark and duration).
- Use `transition-all duration-200` for smooth state changes.
- Add a subtle border-left accent (2px, `border-primary/30`) to the tool activity area to visually separate it from the message text.
- Ensure the tool activity area doesn't cause layout shift — reserve space with `min-height` when tools are running.

Error state polish:
- If a tool fails, show a yellow warning indicator (not red — it's not a fatal error, Claude will try again).
- Use `text-yellow-600 dark:text-yellow-400` for warning state.

Dark mode verification:
- All tool activity indicators must look correct in both light and dark modes.
- Use semantic color tokens only (`text-muted-foreground`, `border-border`, etc.).

**Tests:**

File: `apps/web/e2e/chat-tools.spec.ts` (new)

```
describe('Chat with AI tools')
  test('data query shows tool activity and response')
    - Navigate to workspace
    - Open chat panel
    - Send "What accounts do I have?"
    - Mock SSE: tool_call_start → tool_call_end → tool_result → text_delta → done
    - Assert tool activity indicator visible during execution
    - Assert response text contains account data

  test('creating a canvas item adds it to canvas')
    - Navigate to workspace
    - Open chat panel
    - Send "Create a budget"
    - Mock SSE: tool_call_start → tool_call_end → tool_result → canvas_update → text_delta → done
    - Assert budget card element appears on canvas
    - Assert response confirms creation

  test('calculation results appear in response')
    - Send "Calculate my tax for $75k income"
    - Mock SSE: tool_call_start → tool_call_end → tool_result → text_delta (with numbers) → done
    - Assert response contains dollar amounts

  test('multiple tool calls show multiple indicators')
    - Mock SSE with 3 tool_call_start/end sequences
    - Assert 3 tool indicators visible

  test('tool error shows graceful message')
    - Mock SSE: tool_call_start → tool_call_end → tool_result (isError=true) → text_delta → done
    - Assert response acknowledges the issue
    - Assert no crash or broken UI

  test('persisted message shows tool summary')
    - Complete a tool-using conversation
    - Refresh page
    - Assert persisted message has collapsed tool summary
    - Click to expand → shows tool names
```

**Verification:**
- `pnpm exec playwright test apps/web/e2e/chat-tools.spec.ts` — all tests pass
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual dark mode check: toggle dark mode, verify all tool activity indicators render correctly
- Manual responsiveness check: resize the chat panel to minimum width, verify tool indicators don't overflow

---

## File index

Summary of all files created or modified across Phase 2:

| File | Action | Build Units |
|------|--------|-------------|
| `apps/server/src/db/schema.ts` | Modify | BU-01 |
| `apps/server/src/services/anthropic.ts` | Modify | BU-02 |
| `apps/server/src/services/ai-context.ts` | Modify | BU-08 |
| `apps/server/src/services/ai-tools.ts` | Create | BU-03, BU-05, BU-06, BU-10 |
| `apps/server/src/services/canvas-defaults.ts` | Create | BU-04 |
| `apps/server/src/services/auto-position.ts` | Create | BU-04 |
| `apps/server/src/routes/chat-stream.ts` | Modify | BU-07, BU-10 |
| `apps/server/src/lib/calc/index.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/currency-utils.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/tax-data.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/tax-estimator.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/loan-calculator.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/projection.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/breakeven.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/depreciation.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/rent-vs-buy.ts` | Create | BU-06 |
| `apps/server/src/lib/calc/debt-planner.ts` | Create | BU-06 |
| `apps/server/src/__tests__/chat-tables.test.ts` | Modify | BU-01 |
| `apps/server/src/__tests__/anthropic-service.test.ts` | Modify | BU-02 |
| `apps/server/src/__tests__/ai-context.test.ts` | Modify | BU-08 |
| `apps/server/src/__tests__/ai-tools.test.ts` | Create | BU-03, BU-05, BU-06, BU-10 |
| `apps/server/src/__tests__/auto-position.test.ts` | Create | BU-04 |
| `apps/server/src/__tests__/chat-stream.test.ts` | Modify | BU-07 |
| `packages/shared-schemas/src/chat.ts` | Modify | BU-01 |
| `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` | Modify | BU-01 |
| `packages/shared-types/src/index.ts` | No change | — |
| `apps/web/src/hooks/useChat.ts` | Modify | BU-09 |
| `apps/web/src/stores/canvas-store.ts` | Modify | BU-09 |
| `apps/web/src/components/canvas/chat-panel.tsx` | Modify | BU-09, BU-11 |
| `apps/web/src/components/canvas/chat-message.tsx` | Modify | BU-09 |
| `apps/web/e2e/chat-tools.spec.ts` | Create | BU-11 |

**Total: 15 files created, 14 files modified**

---

## Phase 2 completion checklist

All of these must be true when BU-01 through BU-11 are complete:

- [x] **BU-01** — `messages` table has `toolCalls` and `toolCallId` columns; `messageRoleSchema` includes `'tool'`; `sseEventSchema` has 4 new tool event types; schema tests pass
- [x] **BU-02** — `StreamChatOptions` accepts `tools` array; multi-content-block messages supported; service tests pass
- [x] **BU-03** — 12 read-only tools registered with definitions and executors; all return structured data; tool tests pass
- [x] **BU-04** — Server-side `ITEM_DEFAULTS`, `defaultNames`, `createDefaultData` exist; `findNextPosition` and `findBatchPositions` work correctly; positioning tests pass
- [x] **BU-05** — 5 mutation tools registered (create, update, connect, position, delete-blocked); creation inserts into DB and returns full item shape; mutation tests pass
- [x] **BU-06** — 7 calculation files copied to server; 7 calc tools registered; each returns truncated structured results; calc tests pass
- [x] **BU-07** — Chat stream supports multi-round tool execution; tool events streamed to client; messages persisted with tool data; tokens summed across rounds; stream tests pass
- [x] **BU-08** — System prompt includes tool usage guidelines, creation best practices, calculation guidance, and restrictions; context tests pass
- [x] **BU-09** — Client parses tool SSE events; `toolActivity` state tracked; `addItemDirect` upserts items into canvas store; tool indicators visible in chat; canvas_update events add items to canvas
- [x] **BU-10** — `safeExecuteTool` validates inputs, catches errors, filters vault data, and logs execution; safety tests pass
- [x] **BU-11** — E2E tests cover data query, canvas creation, calculation, multi-tool, error handling, and persisted tool summary; tool activity UI polished for both themes

**Phase 2 success criteria:**
- [x] User asks "what accounts do I have?" → Claude calls `get_accounts` tool, responds with real data
- [x] User says "create a budget for Q1" → budget card appears on the canvas with populated data
- [x] User asks "calculate my tax for $100k in California" → Claude calls `calculate_tax`, returns detailed breakdown
- [x] Multi-tool interaction works: "create a budget based on my current spending" → Claude reads subscriptions, reads accounts, creates budget
- [x] Tool activity indicators show during execution, collapse after completion
- [x] AI-created items persist across page reloads
- [x] `pnpm typecheck` passes across entire monorepo
- [x] `pnpm test` — all unit tests pass
- [x] `pnpm exec playwright test` — all E2E tests pass
- [x] `pnpm build` — both apps build successfully
