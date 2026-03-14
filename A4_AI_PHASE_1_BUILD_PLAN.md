# A4 — AI Pipeline: Phase 1 Detailed Build Plan

> **Created:** 2026-03-12
> **Status:** Pre-implementation — ready to begin BU-01
> **Architecture reference:** [A4_AI_PIPELINE.md](./A4_AI_PIPELINE.md) — read this first for the full system design, SSE protocol, tool definitions, and privacy model. This document does not repeat that information; it breaks Phase 1 into executable build units.

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

## Dependency graph

```
BU-01  DB tables
  │
  ├──→ BU-02  Zod schemas + types
  │      │
  │      ├──→ BU-03  Chat router CRUD
  │      │      │
  │      │      ├──→ BU-05  Workspace context builder
  │      │      │      │
  │      │      │      ├──→ BU-06  SSE streaming endpoint
  │      │      │      │      │
  │      │      │      │      └──→ BU-07  AI usage tracking
  │      │      │      │             │
  │      │      │      │             └──→ BU-08  useChat hook (client)
  │      │      │      │                    │
  │      │      │      │                    ├──→ BU-09  Wire ChatPanel
  │      │      │      │                    │      │
  │      │      │      │                    │      ├──→ BU-10  Conversation management UI
  │      │      │      │                    │      │
  │      │      │      │                    │      ├──→ BU-11  Markdown rendering
  │      │      │      │                    │      │
  │      │      │      │                    │      └──→ BU-13  Error states + polish
  │      │      │      │                    │
  │      │      │      │                    └──→ BU-12  E2E tests
  │      │      │      │
  │      │      │      └──→ (used by BU-06)
  │      │      │
  │      │      └──→ (used by BU-06, BU-07)
  │      │
  │      └──→ BU-04  Anthropic SDK wrapper
  │             │
  │             └──→ (used by BU-06)
  │
  └──→ (used by BU-03, BU-07)

Parallel-safe groups:
  - BU-03 + BU-04 can run in parallel (both depend only on BU-01 + BU-02)
  - BU-10 + BU-11 + BU-13 can run in parallel (all depend on BU-09)
```

---

## BU-01 — Database tables (conversations + messages)

**Goal:** Add `conversations` and `messages` tables to the schema so chat data can be persisted.

**Inputs:** None

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add two table definitions
- `apps/server/src/__tests__/chat-tables.test.ts` — new test file

**Description:**

Add two new Drizzle table definitions to `schema.ts`, following the exact patterns established by existing tables (text PK with UUID, integer timestamps with `mode: 'timestamp'`, `$defaultFn(() => new Date())`).

`conversations` table:
- `id`: text PK (UUID)
- `workspaceId`: text NOT NULL — logical FK to `workspaces.id`
- `userId`: text NOT NULL — owner
- `title`: text, nullable — auto-generated later (Phase 2), null on creation
- `model`: text NOT NULL, default `'claude-sonnet-4-6'` — which Claude model to use
- `createdAt`: integer timestamp NOT NULL with default
- `updatedAt`: integer timestamp NOT NULL with default

`messages` table:
- `id`: text PK (UUID)
- `conversationId`: text NOT NULL — logical FK to `conversations.id`
- `userId`: text NOT NULL
- `role`: text NOT NULL — one of `'user'`, `'assistant'`
- `content`: text NOT NULL — message text (plain text for user messages, markdown for assistant)
- `tokenCount`: integer, nullable — total tokens consumed (input + output) for assistant messages
- `model`: text, nullable — model used for this specific response (assistant messages only)
- `createdAt`: integer timestamp NOT NULL with default

Decisions already made:
- No formal SQLite foreign keys — matches every other table in the codebase (none use FK constraints). Referential integrity is enforced in application code.
- No `tool_calls` or `tool_call_id` columns yet — those are Phase 2 (tool use). Keep the schema minimal for Phase 1.
- No `system` or `tool` message roles — Phase 1 only stores `user` and `assistant`. System prompts are built dynamically per request, not persisted. Tool messages are Phase 2.
- Hard delete for conversations (no `deletedAt` column) — matches the receipt/subscription/account pattern where records are fully removed. Workspaces use soft-delete because they contain nested data; conversations are self-contained.
- `model` on the conversation sets the default; `model` on each message records what was actually used for that response (allows mid-conversation model switching later).
- Export the table objects as `conversations` and `messages` (named exports matching Drizzle convention).

Edge cases:
- The `messages` export name will shadow any future import of the same name. Since no existing code uses a `messages` export, this is fine. If a collision arises later, the table can be aliased at import.

**Tests:**

File: `apps/server/src/__tests__/chat-tables.test.ts`

Follow the exact pattern in `workspace.test.ts`: in-memory SQLite via `better-sqlite3`, manual `CREATE TABLE` SQL in `createTestDb()`, Drizzle ORM wrapper.

```
describe('conversations table')
  beforeEach — create fresh in-memory DB with both conversations and messages tables

  it('inserts and retrieves a conversation')
    - Insert one conversation with all fields populated
    - Select by id
    - Assert all fields match: id, workspaceId, userId, title, model, createdAt, updatedAt

  it('scopes conversations by userId and workspaceId')
    - Insert 3 conversations: 2 for user-1/workspace-A, 1 for user-2/workspace-A
    - Select where userId='user-1' AND workspaceId='workspace-A'
    - Assert exactly 2 results

  it('allows null title')
    - Insert conversation with title omitted (null)
    - Select by id
    - Assert title is null

  it('deletes a conversation (hard delete)')
    - Insert conversation
    - Delete by id
    - Select by id → expect empty result set

describe('messages table')
  beforeEach — create fresh in-memory DB with both tables

  it('inserts and retrieves a user message')
    - Insert message with role='user', content='Hello'
    - Select by id
    - Assert all fields match, tokenCount is null, model is null

  it('inserts and retrieves an assistant message with token tracking')
    - Insert message with role='assistant', tokenCount=350, model='claude-sonnet-4-6'
    - Select by id
    - Assert tokenCount=350, model='claude-sonnet-4-6'

  it('retrieves messages for a conversation in creation order')
    - Insert 3 messages for conversation-A with staggered createdAt values
    - Insert 1 message for conversation-B
    - Select where conversationId='conversation-A' ORDER BY createdAt ASC
    - Assert exactly 3 results in correct chronological order
    - Verify conversation-B message is not included

  it('cascade-deletes messages when conversation is removed')
    - Insert conversation + 3 messages
    - Delete all messages where conversationId matches
    - Delete conversation
    - Assert both tables have 0 rows for that conversation
    - Note: this tests application-level cascade since SQLite FKs are not used
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/chat-tables.test.ts` — all tests pass
- `pnpm typecheck` — no type errors in schema.ts
- Manually inspect schema.ts — new tables follow same style as existing tables (indentation, naming, defaults)

---

## BU-02 — Expand chat Zod schemas + types

**Goal:** Extend the shared Zod schemas and TypeScript types to cover the full Phase 1 chat data model (DB-aligned fields, SSE event types, conversation listing).

**Inputs:** BU-01

**Creates / Modifies:**
- `packages/shared-schemas/src/chat.ts` — expand existing schemas
- `packages/shared-types/src/index.ts` — add new type exports
- `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — new test file

**Description:**

The existing schemas are minimal stubs. Expand them to match the DB schema from BU-01 and add schemas needed by the router, SSE endpoint, and client.

Changes to `chat.ts` schemas:

1. **Update `messageRoleSchema`** — keep as `z.enum(['user', 'assistant'])` (no change for Phase 1, but confirm it's correct)

2. **Update `messageSchema`** — align with DB columns:
   - Add `userId` (string)
   - Add `tokenCount` (number, nullable/optional)
   - Add `model` (string, nullable/optional)
   - Change `createdAt` to accept both `Date` and `number` (timestamps come as integers from SQLite, as Date objects from application code). Consider using `z.coerce.date()` or separate input/output schemas if needed.

3. **Update `conversationSchema`** — align with DB columns:
   - Change `title` to `z.string().max(200).nullable()` (nullable, not required — auto-title is Phase 2)
   - `workspaceId` should be `z.string().uuid()` NOT NULL (not nullable — every conversation belongs to a workspace)
   - Add `model` field: `z.string()` with default `'claude-sonnet-4-6'`
   - Ensure `createdAt` and `updatedAt` handle timestamp integers

4. **Update `createConversationSchema`**:
   - `workspaceId`: `z.string().uuid()` (required, not optional — you always create a conversation within a workspace)
   - `title`: `z.string().max(200).optional()` (optional, defaults to null in DB)
   - `model`: `z.string().optional()` (optional, defaults to `'claude-sonnet-4-6'`)

5. **Update `sendMessageSchema`** — keep as-is (conversationId + content is sufficient for Phase 1)

6. **Add `sseEventSchema`** — a discriminated union for SSE event types (Phase 1 subset only):
   - `message_start`: `{ type, messageId: string }`
   - `text_delta`: `{ type, text: string }`
   - `error`: `{ type, message: string }`
   - `done`: `{ type, usage: { inputTokens: number, outputTokens: number } }`
   - No tool_call events in Phase 1 — those are Phase 2

7. **Add `conversationListItemSchema`** — lightweight schema for the conversation list sidebar:
   - `id`, `title`, `model`, `createdAt`, `updatedAt`, `messageCount` (number)
   - This is a computed shape (messageCount comes from a COUNT query), not a direct DB row

Update `packages/shared-types/src/index.ts`:
- Add type exports for `SSEEvent`, `ConversationListItem`
- Update existing `Message`, `Conversation` types if schemas changed shape

Decisions already made:
- SSE events are typed with Zod for runtime validation on the client. The client can validate incoming SSE data before processing.
- `conversationListItemSchema` is separate from `conversationSchema` because it includes `messageCount` which is a derived field.
- No `deleteConversationSchema` needed — just `z.object({ id: z.string().uuid() })` inline in the router.

**Tests:**

File: `packages/shared-schemas/src/__tests__/chat-schemas.test.ts`

```
describe('messageSchema')
  it('validates a complete user message')
    - Parse a valid user message object → expect success
  it('validates a complete assistant message with token tracking')
    - Parse with tokenCount and model set → expect success
  it('rejects missing required fields')
    - Parse without content → expect failure
    - Parse without role → expect failure
  it('rejects invalid role values')
    - Parse with role='system' → expect failure (Phase 1 only supports user/assistant)

describe('conversationSchema')
  it('validates a conversation with all fields')
  it('allows null title')
  it('rejects missing workspaceId')

describe('createConversationSchema')
  it('validates with only workspaceId')
    - Parse with just workspaceId → expect success (title and model are optional)
  it('validates with all optional fields')
  it('rejects missing workspaceId')

describe('sendMessageSchema')
  it('validates a normal message')
  it('rejects empty content')
    - Parse with content='' → expect failure (min length 1)
  it('rejects content over 10000 chars')
    - Parse with 10001-char string → expect failure

describe('sseEventSchema')
  it('validates text_delta event')
  it('validates done event with usage')
  it('validates error event')
  it('validates message_start event')
  it('rejects unknown event types')

describe('conversationListItemSchema')
  it('validates a list item with messageCount')
  it('allows null title')
```

**Verification:**
- `pnpm vitest run packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — all pass
- `pnpm typecheck` — no errors across entire monorepo (schemas are imported in server + client)
- Verify that existing `Message` and `Conversation` type imports in `chat.ts` router still compile

---

## BU-03 — Chat router CRUD (replace stubs)

**Goal:** Replace the five stub procedures in `chat.ts` with real database operations so conversations and messages can be created, listed, retrieved, and deleted.

**Inputs:** BU-01, BU-02

**Creates / Modifies:**
- `apps/server/src/trpc/routers/chat.ts` — replace all stubs with real implementations
- `apps/server/src/__tests__/chat-router.test.ts` — new test file

**Description:**

Replace every TODO stub in the chat router with real Drizzle queries against the `conversations` and `messages` tables. All procedures use `protectedProcedure` (already set up) — `ctx.userId` is available for scoping.

Procedure implementations:

**`listConversations`**
- Input: `z.object({ workspaceId: z.string().uuid() })`
- Query: select from `conversations` where `userId = ctx.userId` AND `workspaceId = input.workspaceId`, ordered by `updatedAt` DESC
- For each conversation, also fetch message count via a subquery or separate count query
- Return: array of `ConversationListItem` shape (id, title, model, createdAt, updatedAt, messageCount)

**`getConversation`**
- Input: `z.object({ id: z.string().uuid() })`
- Query conversation by id where `userId = ctx.userId` (ownership check)
- Query all messages for that conversation, ordered by `createdAt` ASC
- Return: conversation object with `messages` array, or throw `TRPCError('NOT_FOUND')` if no match
- Edge case: if conversation exists but belongs to a different user, throw NOT_FOUND (don't leak existence)

**`createConversation`**
- Input: the updated `createConversationSchema` from BU-02
- Generate UUID for id
- Insert into conversations with `userId = ctx.userId`, title from input or null, model from input or default
- Return: `{ id }` — the created conversation's ID

**`sendMessage`**
- Input: `sendMessageSchema` (conversationId + content)
- Verify conversation exists and belongs to `ctx.userId` — throw NOT_FOUND if not
- Generate UUID for the message
- Insert into messages with role='user', content from input, userId from ctx
- Update conversation's `updatedAt` to now
- Return: `{ id, conversationId }` — the new message's ID and conversation ID
- **Important decision:** `sendMessage` ONLY persists the user message. It does NOT call Claude. The SSE endpoint (BU-06) handles AI invocation separately. This separation exists because tRPC mutations return a single response, but AI responses stream over SSE.

**`deleteConversation`**
- Input: `z.object({ id: z.string().uuid() })`
- Verify conversation belongs to `ctx.userId`
- Delete all messages where `conversationId = input.id`
- Delete the conversation
- Return: `{ success: true }`
- Edge case: deleting a non-existent or other user's conversation — throw NOT_FOUND

Decisions already made:
- `sendMessage` does NOT call Claude — SSE endpoint handles that. This is the critical architectural split.
- No pagination on `listConversations` for Phase 1 — users won't have hundreds of conversations initially. Add cursor pagination in Phase 2+ if needed.
- No pagination on messages in `getConversation` — conversations in Phase 1 won't exceed context window limits. Pagination deferred.
- Ordering: conversations by `updatedAt DESC` (most recent first), messages by `createdAt ASC` (chronological).

**Tests:**

File: `apps/server/src/__tests__/chat-router.test.ts`

Use the same in-memory SQLite pattern as `workspace.test.ts`. Create both `conversations` and `messages` tables in `createTestDb()`. Test at the DB query level (not through tRPC HTTP layer — that's what e2e tests are for in BU-12).

```
describe('chat router — DB operations')
  beforeEach — create fresh in-memory DB with conversations + messages tables

  describe('createConversation')
    it('creates a conversation with default model')
      - Insert with just workspaceId
      - Select by returned id
      - Assert model is 'claude-sonnet-4-6', title is null, userId matches

    it('creates a conversation with custom title and model')
      - Insert with title='Budget Chat' and model='claude-opus-4-6'
      - Assert title and model match

  describe('listConversations')
    it('returns conversations for user+workspace, newest first')
      - Create 3 conversations with different updatedAt values
      - List for that workspace
      - Assert 3 results, ordered by updatedAt DESC

    it('excludes other users conversations')
      - Create conversation for user-1, another for user-2, same workspace
      - List as user-1
      - Assert only 1 result

    it('excludes other workspace conversations')
      - Create conversation in workspace-A, another in workspace-B
      - List for workspace-A
      - Assert only 1 result

    it('includes messageCount per conversation')
      - Create conversation, insert 5 messages
      - List conversations
      - Assert messageCount is 5

  describe('getConversation')
    it('returns conversation with all messages in chronological order')
      - Create conversation, insert 3 messages with staggered timestamps
      - Get conversation
      - Assert messages array has 3 items in ASC order

    it('throws NOT_FOUND for non-existent id')
      - Get with random UUID → expect error

    it('throws NOT_FOUND for other users conversation')
      - Create conversation as user-1
      - Attempt get as user-2 → expect error

  describe('sendMessage')
    it('inserts a user message and updates conversation updatedAt')
      - Create conversation, note original updatedAt
      - Send message
      - Assert message exists with role='user', content matches
      - Assert conversation updatedAt is newer than original

    it('throws NOT_FOUND if conversation does not exist')
      - Send message to random UUID → expect error

    it('throws NOT_FOUND if conversation belongs to other user')
      - Create conversation as user-1
      - Send message as user-2 → expect error

  describe('deleteConversation')
    it('deletes conversation and all its messages')
      - Create conversation, insert 3 messages
      - Delete conversation
      - Assert conversation gone, all 3 messages gone

    it('throws NOT_FOUND for other users conversation')
      - Create as user-1, delete as user-2 → expect error

    it('is idempotent for already-deleted conversations')
      - Delete conversation
      - Delete same id again → expect NOT_FOUND (not a crash)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/chat-router.test.ts` — all pass
- `pnpm typecheck` — no errors
- Manually verify that the router file no longer contains any `// TODO` comments

---

## BU-04 — Anthropic SDK service wrapper

**Goal:** Create a thin wrapper around the Anthropic SDK that handles initialization, streaming, and error mapping so the SSE endpoint doesn't deal with SDK details directly.

**Inputs:** BU-02 (for SSE event types)

**Creates / Modifies:**
- `apps/server/package.json` — add `@anthropic-ai/sdk` dependency
- `apps/server/src/services/anthropic.ts` — new file
- `apps/server/src/__tests__/anthropic-service.test.ts` — new test file

**Description:**

Create `apps/server/src/services/anthropic.ts` — a module that exports functions for interacting with the Anthropic API. This is NOT a class instance stored in tRPC context. It's a module singleton because the SSE endpoint is an Express route (not a tRPC procedure) and doesn't have access to tRPC context.

The module should:

1. **Initialize the Anthropic client** lazily on first use. Read `ANTHROPIC_API_KEY` from `env`. If the key is missing, throw a descriptive error on first call (not on import — the server should start even without the key, just fail when chat is used).

2. **Export a `streamChatCompletion` function** that takes:
   - `messages`: array of `{ role: 'user' | 'assistant', content: string }` — the conversation history
   - `systemPrompt`: string — the workspace context (built by BU-05)
   - `model`: string — defaults to `'claude-sonnet-4-6'`
   - `maxTokens`: number — defaults to 4096
   - Returns: an async iterable/stream of Anthropic SDK events

   This function calls `anthropic.messages.create({ stream: true, ... })` and returns the stream directly. The SSE endpoint (BU-06) will iterate over this stream and forward events to the client.

3. **Export a `countTokens` helper** (optional, nice-to-have) that extracts `inputTokens` and `outputTokens` from the stream's final `message_delta` event. If the SDK provides usage info on the final event, this is just extracting the right fields.

4. **Error mapping:** Wrap Anthropic SDK errors into typed errors that the SSE endpoint can handle:
   - `APIError` with status 401 → `ANTHROPIC_AUTH_ERROR` (bad API key)
   - `APIError` with status 429 → `ANTHROPIC_RATE_LIMIT` (rate limited)
   - `APIError` with status 529 → `ANTHROPIC_OVERLOADED` (API overloaded)
   - Network errors → `ANTHROPIC_NETWORK_ERROR`
   - All others → `ANTHROPIC_UNKNOWN_ERROR`

Decisions already made:
- Module singleton pattern, not a class injected via DI. Simple, matches the existing `PolygonService` pattern but even simpler (no WebSocket state to manage).
- The wrapper does NOT parse or transform SSE events — it passes the raw Anthropic stream through. Event parsing happens in BU-06.
- `maxTokens` default of 4096 is intentionally conservative for Phase 1. Can be increased per-request later.
- No retry logic in the wrapper. If Anthropic returns an error, surface it immediately. Retries would complicate SSE streaming (can't retry mid-stream).

Dependency installation:
- Run `pnpm add @anthropic-ai/sdk` in `apps/server/` to add the dependency
- The SDK handles its own TypeScript types

**Tests:**

File: `apps/server/src/__tests__/anthropic-service.test.ts`

Testing against the real Anthropic API is not feasible in CI. Tests should verify the wrapper's logic (initialization, error mapping) without making real API calls. Mock the Anthropic SDK client.

```
describe('AnthropicService')
  describe('initialization')
    it('throws descriptive error when ANTHROPIC_API_KEY is missing')
      - Temporarily unset the env var (or mock env)
      - Call streamChatCompletion
      - Assert it throws with message containing 'ANTHROPIC_API_KEY'

    it('creates client lazily on first call')
      - Set a mock API key
      - Import the module → no error (client not created yet)
      - Call streamChatCompletion (with mocked SDK) → client is created

  describe('streamChatCompletion')
    it('passes messages and system prompt to SDK correctly')
      - Mock Anthropic client's messages.create
      - Call streamChatCompletion with specific messages, systemPrompt, model
      - Assert messages.create was called with:
        - model matching input
        - system matching systemPrompt
        - messages matching input messages
        - stream: true
        - max_tokens matching input or default

    it('uses default model and maxTokens when not specified')
      - Call without model and maxTokens
      - Assert SDK called with model='claude-sonnet-4-6' and max_tokens=4096

  describe('error mapping')
    it('maps 401 APIError to ANTHROPIC_AUTH_ERROR')
      - Mock SDK to throw APIError with status 401
      - Call streamChatCompletion
      - Assert thrown error has type 'ANTHROPIC_AUTH_ERROR'

    it('maps 429 APIError to ANTHROPIC_RATE_LIMIT')
      - Mock SDK to throw APIError with status 429
      - Assert error type 'ANTHROPIC_RATE_LIMIT'

    it('maps 529 APIError to ANTHROPIC_OVERLOADED')
      - Mock SDK to throw APIError with status 529
      - Assert error type 'ANTHROPIC_OVERLOADED'

    it('maps network errors to ANTHROPIC_NETWORK_ERROR')
      - Mock SDK to throw a generic network error (ECONNREFUSED, etc.)
      - Assert error type 'ANTHROPIC_NETWORK_ERROR'
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/anthropic-service.test.ts` — all pass
- `pnpm typecheck` — no errors
- `pnpm build` in apps/server — verify `@anthropic-ai/sdk` resolves correctly
- Manually verify that importing the module does NOT create an Anthropic client (lazy init)

---

## BU-05 — Workspace context builder

**Goal:** Create the function that builds the dynamic system prompt by querying workspace data and formatting it as structured text for Claude.

**Inputs:** BU-03 (needs access to DB query patterns)

**Creates / Modifies:**
- `apps/server/src/services/ai-context.ts` — new file
- `apps/server/src/__tests__/ai-context.test.ts` — new test file

**Description:**

Create `apps/server/src/services/ai-context.ts` — exports a `buildWorkspaceContext` function that takes a database instance, userId, and workspaceId, then returns a formatted string to use as Claude's system prompt.

The function queries the workspace's current state and formats it into sections:

1. **Workspace metadata**: name, description, type (from `workspaces` table)
2. **Canvas items summary**: count by type, list of item names with types and IDs (from `canvasItems` table). Keep this concise — name and type only, not full data blobs.
3. **Account balances**: list accounts with name, institution, type, balance (from `accounts` table). Include total balance across all accounts.
4. **Budget summary**: total budgeted vs total actual, list categories that are over budget (from `budgetGroups` + `budgetCategories` tables)
5. **Net worth summary**: total assets, total liabilities, net worth. List categories with totals (from `networthCategories` + `networthEntries` tables).
6. **Recent subscriptions**: list active subscriptions with name, amount, frequency (from `subscriptions` table, status='active')
7. **Recent invoices**: count by status (draft/sent/paid/overdue), total outstanding (from `invoices` table)
8. **Debt summary**: list debts with name, balance, rate (from `debts` table). Include total debt.
9. **Holdings summary**: list holdings with symbol, name, value, target allocation (from `holdings` table). Include total portfolio value.

Output format: structured text sections with markdown headers, matching the example in `A4_AI_PIPELINE.md` (the "Context injection strategy" section). Use exact numbers with proper formatting (e.g., `$12,345.67`). Include item IDs so the AI can reference specific items.

The system prompt preamble (the "You are A4..." instructions from `A4_AI_PIPELINE.md` System Prompt Strategy section) should be prepended to the workspace context. This preamble is a static string — hardcode it in the module.

Decisions already made:
- This function runs on EVERY `sendMessage` call. It rebuilds the context fresh each time. No caching in Phase 1 — caching is a Phase 2+ optimization.
- The function does NOT include raw data from `canvasItems.data` JSON blobs. Only structured DB tables are queried. Canvas item data blobs may contain large JSON; including them would blow the context window.
- Queries are scoped to `userId` for safety, even though the workspace already belongs to the user. Defense in depth.
- If a data section has no data (e.g., no accounts), omit that section entirely rather than showing "Accounts: none". This keeps the context window lean.
- Currency formatting: use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` or equivalent. All amounts assumed USD for Phase 1.
- This is the **single point of control** for what the AI sees. The privacy evolution described in `A4_AI_PIPELINE.md` happens here and only here.

Edge cases:
- Workspace with zero data (brand new) — return just the preamble + workspace metadata. The AI should still be able to respond ("I see your workspace is empty — would you like help setting it up?").
- Very large workspaces — if canvas items exceed ~50, summarize by type count instead of listing all names. If accounts exceed ~20, show top 10 by balance. These are soft limits to keep context reasonable.

**Tests:**

File: `apps/server/src/__tests__/ai-context.test.ts`

Use in-memory SQLite with all relevant tables created. Seed with known test data, then assert the output string contains expected sections and values.

```
describe('buildWorkspaceContext')
  beforeEach — create in-memory DB with tables: workspaces, canvasItems, accounts, accountGroups,
    budgetGroups, budgetCategories, networthCategories, networthEntries, subscriptions,
    invoices, invoiceLineItems, debts, holdings

  it('includes workspace metadata')
    - Seed workspace with name='Personal Finance', description='My money'
    - Build context
    - Assert output contains 'Personal Finance' and 'My money'

  it('includes account balances with total')
    - Seed 2 accounts: Chase Checking $8,430, Ally HYSA $25,000
    - Build context
    - Assert output contains 'Chase Checking', '$8,430', 'Ally HYSA', '$25,000'
    - Assert output contains total '$33,430'

  it('includes budget summary with over-budget categories')
    - Seed budget: Dining budgeted=$200 actual=$380, Entertainment budgeted=$150 actual=$45
    - Build context
    - Assert output contains 'Dining' flagged as over budget
    - Assert output contains '$380/$200' or equivalent ratio indicator

  it('includes net worth breakdown')
    - Seed categories (assets/liabilities) with entries totaling $198,000 assets, $55,500 liabilities
    - Build context
    - Assert output contains net worth of '$142,500'

  it('omits empty sections')
    - Seed workspace with no accounts, no budget, no debts
    - Build context
    - Assert output does NOT contain 'Accounts' header or 'Budget' header or 'Debts' header

  it('includes system prompt preamble')
    - Build context for any workspace
    - Assert output starts with the 'You are A4' preamble text

  it('includes canvas item summary by type')
    - Seed 5 canvas items: 2 note, 1 budget-card, 1 account-card, 1 chart-card
    - Build context
    - Assert output lists items with their types and names

  it('handles workspace with no data gracefully')
    - Seed only the workspace (no items, accounts, budgets, etc.)
    - Build context
    - Assert output contains workspace name, preamble, and no data sections
    - Assert output does NOT throw or return empty string

  it('scopes all queries to userId')
    - Seed accounts for user-1 and user-2 in same workspace
    - Build context as user-1
    - Assert only user-1 accounts appear

  it('formats currency values correctly')
    - Seed account with balance=1234567.89
    - Build context
    - Assert output contains '$1,234,567.89' (proper comma formatting)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-context.test.ts` — all pass
- `pnpm typecheck` — no errors
- Manually read a sample output — verify it looks like the example in `A4_AI_PIPELINE.md`

---

## BU-06 — SSE streaming endpoint

**Goal:** Create the Express route that accepts a POST request, calls Claude via the Anthropic SDK, and streams the response to the client as Server-Sent Events.

**Inputs:** BU-03, BU-04, BU-05

**Creates / Modifies:**
- `apps/server/src/routes/chat-stream.ts` — new Express router
- `apps/server/src/index.ts` — register the new route + add separate rate limit
- `apps/server/src/__tests__/chat-stream.test.ts` — new test file

**Description:**

Create an Express route at `POST /api/chat/stream` that:

1. **Authenticates the request** — extract auth token from `Authorization: Bearer <token>` header. In dev bypass mode, use `dev-user-001`. In production, verify via Clerk's `verifyToken`. Return 401 if invalid.

2. **Accepts JSON body**: `{ conversationId: string }`

3. **Loads conversation data**:
   - Fetch conversation from DB, verify ownership (same as router)
   - Fetch all messages for this conversation, ordered by `createdAt ASC`
   - If conversation not found or wrong user → 404

4. **Builds the system prompt** — call `buildWorkspaceContext(db, userId, conversation.workspaceId)` from BU-05

5. **Formats messages for Anthropic** — map DB messages to `{ role, content }` array. The Anthropic SDK expects alternating user/assistant messages with user going first.

6. **Calls `streamChatCompletion`** from BU-04 with the formatted messages, system prompt, and conversation model

7. **Streams SSE events** to the client:
   - Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (for nginx)
   - Send `data: { "type": "message_start", "messageId": "<uuid>" }\n\n` at the start
   - For each `content_block_delta` event from Anthropic with `type: 'text_delta'`, send `data: { "type": "text_delta", "text": "<delta>" }\n\n`
   - On stream end, send `data: { "type": "done", "usage": { "inputTokens": N, "outputTokens": N } }\n\n`
   - On error, send `data: { "type": "error", "message": "<error>" }\n\n` and close

8. **Persists the assistant response** — after streaming completes, accumulate all text deltas into the full response, then insert a new message with role='assistant' into the DB. Include tokenCount and model on the assistant message.

9. **Updates conversation `updatedAt`** — set to now after the assistant message is saved.

Why POST instead of GET:
- `EventSource` API only supports GET, but we need to send a JSON body (conversationId) and auth headers
- Client uses `fetch()` + `ReadableStream` reader instead of `EventSource` — this supports POST, custom headers, and streaming
- This is the standard pattern for authenticated SSE with request bodies

Rate limiting:
- Add a separate rate limiter for `/api/chat/stream`: 20 requests per minute per IP (vs 100/min for tRPC)
- This prevents abuse of the expensive AI endpoint without affecting normal tRPC operations

SSE format:
- Each event is `data: <JSON>\n\n` (standard SSE format)
- No event type field in the SSE envelope — the `type` field inside the JSON payload discriminates events
- Client splits on `\n`, filters lines starting with `data: `, and JSON.parse the rest

Edge cases:
- Client disconnects mid-stream: detect via `req.on('close')`, abort the Anthropic stream, still persist whatever was accumulated so far (partial response is better than lost response). If no content was received yet, don't persist anything.
- Anthropic stream errors mid-stream: send an SSE error event, persist whatever was accumulated, close the connection.
- Empty conversation (no messages yet): this shouldn't happen because `sendMessage` (BU-03) creates the user message first, and the client calls the SSE endpoint after. But defensively, return a 400 error if there are no messages.
- Multiple concurrent streams for the same conversation: allow it — each stream is independent. In Phase 2, consider adding a lock.

**Tests:**

File: `apps/server/src/__tests__/chat-stream.test.ts`

Testing the full SSE flow requires mocking the Anthropic SDK. Use Vitest mocks to intercept `streamChatCompletion` and return a fake async iterable of events.

```
describe('POST /api/chat/stream')
  beforeEach — set up Express app with the chat-stream route, in-memory DB,
    mock Anthropic service, seed a workspace + conversation + user message

  it('returns 401 without auth header')
    - POST with no Authorization header
    - Assert 401 status

  it('returns 404 for non-existent conversation')
    - POST with valid auth, random conversationId
    - Assert 404 status

  it('returns 404 for other users conversation')
    - Seed conversation owned by user-2
    - POST as user-1
    - Assert 404 status

  it('streams text_delta events from Claude response')
    - Mock streamChatCompletion to yield 3 text deltas: 'Hello', ' world', '!'
    - POST with valid conversation
    - Read the SSE response body
    - Assert received events in order: message_start, text_delta('Hello'), text_delta(' world'), text_delta('!'), done

  it('persists assistant message after stream completes')
    - Mock streamChatCompletion to yield text 'Test response'
    - POST with valid conversation
    - Wait for response to complete
    - Query messages table for the conversation
    - Assert there are 2 messages: original user message + new assistant message
    - Assert assistant message content is 'Test response'
    - Assert assistant message has tokenCount set

  it('sends done event with token usage')
    - Mock streamChatCompletion to complete with usage { inputTokens: 100, outputTokens: 50 }
    - Assert final SSE event is done with correct usage numbers

  it('sends error event on Anthropic failure')
    - Mock streamChatCompletion to throw ANTHROPIC_RATE_LIMIT error
    - Assert SSE stream contains an error event with appropriate message

  it('handles client disconnect gracefully')
    - Mock streamChatCompletion with a slow stream (delays between events)
    - Start the POST, then abort the request after first event
    - Assert no unhandled errors or crashes
    - Assert partial response is persisted if any content was received

  it('returns 400 if conversation has no messages')
    - Seed conversation with no messages (edge case)
    - POST
    - Assert 400 status with descriptive error
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/chat-stream.test.ts` — all pass
- `pnpm typecheck` — no errors
- Manual test: start the dev server with a valid `ANTHROPIC_API_KEY`, use curl to POST to `/api/chat/stream` with a valid conversation, observe SSE events streaming in real-time
- Verify rate limiter: send 21 rapid requests → 21st should get 429

---

## BU-07 — AI usage tracking table + logging

**Goal:** Add the `ai_usage` table and log token consumption on every AI response so usage can be tracked and eventually billed.

**Inputs:** BU-01, BU-06

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add `aiUsage` table
- `apps/server/src/routes/chat-stream.ts` — add usage logging after stream completes
- `apps/server/src/trpc/routers/chat.ts` — add `getUsage` procedure
- `apps/server/src/__tests__/ai-usage.test.ts` — new test file

**Description:**

Add the `aiUsage` table to `schema.ts`:
- `id`: text PK (UUID)
- `userId`: text NOT NULL
- `conversationId`: text, nullable (nullable for future non-chat AI uses like embeddings)
- `model`: text NOT NULL
- `inputTokens`: integer NOT NULL
- `outputTokens`: integer NOT NULL
- `costCents`: integer, nullable — computed from token counts using known pricing. Calculate at insert time based on model. Phase 1 pricing (approximate):
  - `claude-sonnet-4-6`: input $3/MTok, output $15/MTok
  - `claude-opus-4-6`: input $15/MTok, output $75/MTok
  - Store as integer cents (e.g., 150 = $1.50) for precision without floats
- `createdAt`: integer timestamp NOT NULL with default

Modify `chat-stream.ts`:
- After persisting the assistant message, also insert a row into `aiUsage` with the usage data from the stream's `done` event
- Calculate `costCents` from the model and token counts

Add `getUsage` procedure to chat router:
- Input: `z.object({ workspaceId: z.string().uuid().optional() })`
- Query: sum `inputTokens`, `outputTokens`, `costCents` for `ctx.userId`, optionally filtered by workspace (via conversation join)
- Return: `{ totalInputTokens, totalOutputTokens, totalCostCents, messageCount }`
- This is a read-only summary — no detailed breakdown in Phase 1

Decisions already made:
- Cost calculation happens at insert time, not query time. This avoids recomputing on every read and handles pricing changes gracefully (historical costs reflect the pricing at the time of use).
- `costCents` uses integer cents, not float dollars. Avoids floating-point precision issues with financial amounts.
- Pricing constants are hardcoded in Phase 1. A config file or DB table for pricing is overkill until there are multiple models or pricing tiers.

**Tests:**

File: `apps/server/src/__tests__/ai-usage.test.ts`

```
describe('ai_usage table')
  beforeEach — in-memory DB with aiUsage + conversations tables

  it('inserts and retrieves a usage record')
    - Insert with all fields
    - Select by id
    - Assert all fields match

  it('calculates cost correctly for claude-sonnet-4-6')
    - Insert with model='claude-sonnet-4-6', inputTokens=1000, outputTokens=500
    - Expected cost: (1000 * 3 / 1_000_000 + 500 * 15 / 1_000_000) * 100 = ~0 cents (verify exact formula)
    - Assert costCents matches expected value

  it('calculates cost correctly for claude-opus-4-6')
    - Insert with model='claude-opus-4-6', inputTokens=2000, outputTokens=1000
    - Assert costCents matches expected value for opus pricing

  it('allows null conversationId')
    - Insert with conversationId=null
    - Assert no error, field is null

describe('getUsage query')
  it('sums usage across all conversations for a user')
    - Insert 3 usage records for user-1
    - Query sum
    - Assert totals match sum of individual records

  it('scopes to workspace when workspaceId provided')
    - Insert usage for 2 different conversations in 2 different workspaces
    - Query with workspaceId filter
    - Assert only matching workspace usage is summed

  it('returns zeros for user with no usage')
    - Query for user with no records
    - Assert all totals are 0
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-usage.test.ts` — all pass
- `pnpm typecheck` — no errors
- Manual test: send a chat message, then query `getUsage` → verify token counts and cost are recorded

---

## BU-08 — Client-side `useChat` hook

**Goal:** Create the React hook that manages chat state, sends messages via tRPC, reads the SSE stream, and exposes reactive state to the UI.

**Inputs:** BU-06, BU-07

**Creates / Modifies:**
- `apps/web/src/hooks/useChat.ts` — new file

**Description:**

Create a custom React hook `useChat` that encapsulates all chat logic. This is the single interface between the chat UI and the backend.

Hook signature: `useChat({ workspaceId: string })`

Returns:
- `conversations`: array of `ConversationListItem` — from tRPC `chat.listConversations` query
- `activeConversation`: the currently selected conversation object with messages, or null
- `activeConversationId`: string | null
- `setActiveConversationId(id: string | null)`: function to switch conversations
- `messages`: array of messages for the active conversation (from `getConversation` query + any streaming message)
- `streamingContent`: string — the accumulated text from the current SSE stream (empty when not streaming)
- `isStreaming`: boolean — true while an SSE stream is open
- `sendMessage(content: string)`: async function — the main action
- `createConversation()`: async function — creates a new empty conversation
- `deleteConversation(id: string)`: async function
- `error`: string | null — last error message

`sendMessage` flow:
1. If no `activeConversationId`, first call `chat.createConversation.mutate({ workspaceId })` to create one. Set it as active.
2. Call `chat.sendMessage.mutate({ conversationId, content })` to persist the user message
3. Optimistically add the user message to the local messages list (so it appears instantly)
4. Open a `fetch()` POST to `/api/chat/stream` with `{ conversationId }` in the body and auth header
5. Read the response body as a `ReadableStream`:
   - Set `isStreaming = true`
   - On `message_start`: note the messageId
   - On `text_delta`: append to `streamingContent`
   - On `done`: set `isStreaming = false`, clear `streamingContent`, invalidate the conversation query (so messages refetch with the persisted assistant message)
   - On `error`: set `error` to the message, set `isStreaming = false`
6. If `fetch` itself fails (network error), set `error`, set `isStreaming = false`

Auto-create conversation on first message:
- When the user sends their first message and there's no active conversation, the hook creates one automatically. The user never needs to manually "create a conversation" — they just start typing.
- After creation, the hook sets the new conversation as active and proceeds with sending.

TanStack Query integration:
- `listConversations` is a `useQuery` with key `['chat', 'listConversations', workspaceId]`
- `getConversation` is a `useQuery` with key `['chat', 'getConversation', activeConversationId]`, enabled only when `activeConversationId` is set
- `createConversation` and `sendMessage` are `useMutation` calls
- After mutations, invalidate relevant queries via `queryClient.invalidateQueries`

Auth token for SSE:
- The SSE endpoint needs an auth token. In dev bypass mode, no token needed (the endpoint accepts requests without auth). In production, get the token from Clerk's `useAuth().getToken()`. Pass it as `Authorization: Bearer <token>` header on the fetch request.
- Import `useAuth` from `@clerk/clerk-react` conditionally or always (the hook returns null in dev bypass mode).

SSE parsing:
- Use `fetch()` response body as `ReadableStream`, not `EventSource` (EventSource only supports GET)
- Read chunks via `reader.read()`, decode with `TextDecoder`
- Split on `\n`, filter for lines starting with `data: `, JSON.parse the rest
- Handle partial lines (a chunk may end mid-line) — buffer incomplete lines

Decisions already made:
- `useChat` is a hook, not a Zustand store. It's scoped to the workspace page component and doesn't need to be global. TanStack Query handles caching and refetching.
- Optimistic UI for the user message (appears instantly), pessimistic for the assistant (appears after stream completes or builds up during streaming).
- No auto-title generation in Phase 1. Conversations show up in the list as "Untitled" or with the first message preview. Auto-titling (via a separate Claude call) is Phase 2.
- Abort controller: store an `AbortController` ref. If the user navigates away or sends a new message while streaming, abort the previous stream. Prevents stale streams from accumulating.

Edge cases:
- Rapid-fire messages: if user sends another message while streaming, abort the current stream, wait for the abort to settle, then proceed with the new message. Don't queue messages.
- Network failure during streaming: set error, keep whatever was streamed so far visible (don't clear it), show a "retry" option.
- Component unmount during streaming: abort the stream in the cleanup function of a useEffect.

**Tests:**

No unit tests for this hook in Phase 1 — React hooks with fetch streaming, TanStack Query, and Clerk auth are extremely difficult to unit test meaningfully. The hook's behavior is thoroughly tested via:
- BU-12's E2E tests (full browser flow)
- BU-09's manual verification steps
- The server-side tests in BU-03 and BU-06 cover the API contracts the hook relies on

If hook testing is desired later, use `@testing-library/react-hooks` with MSW to mock the SSE stream.

**Verification:**
- `pnpm typecheck` — no errors in the new hook file
- `pnpm build` in apps/web — hook compiles correctly
- Manual test: import the hook in the workspace page (BU-09 does this formally), send a message, verify:
  - User message appears instantly
  - Streaming content builds up character by character
  - Final assistant message replaces streaming content
  - Conversation appears in the list
  - `isStreaming` toggles correctly
  - Aborting works (navigate away mid-stream, come back, no stale state)

---

## BU-09 — Wire ChatPanel to real data

**Goal:** Connect the existing ChatPanel component to the `useChat` hook so the chat UI works with real backend data instead of local state placeholders.

**Inputs:** BU-08

**Creates / Modifies:**
- `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` — replace local chat state with `useChat` hook
- `apps/web/src/components/canvas/chat-panel.tsx` — update props interface if needed

**Description:**

Currently, the workspace page manages chat state with local `useState` hooks:
- `message` (string) — current input
- `messages` (array) — chat history

These need to be replaced with the `useChat` hook from BU-08.

Changes to `page.tsx`:
1. Import `useChat` from `@/hooks/useChat`
2. Remove the local `message` and `messages` useState declarations
3. Call `const chat = useChat({ workspaceId: id })` (where `id` comes from route params)
4. Keep a local `message` state for the input field (the controlled input value) — this is separate from the hook's state because the input clears on send, but the hook doesn't manage input state
5. Wire `ChatPanel` props:
   - `messages` → combine `chat.messages` with the streaming message (if `chat.isStreaming`, append a temporary assistant message with `chat.streamingContent` as content)
   - `onSend` → call `chat.sendMessage(message)`, then clear the local input
   - `isStreaming` → `chat.isStreaming`
   - `error` → `chat.error`
   - `workspaceName` → existing workspace name
6. Handle loading states: if `chat.activeConversation` is loading, show a subtle loading indicator in the chat panel (not a full page spinner)

Changes to `chat-panel.tsx` (if needed):
- Add `isStreaming` prop — when true, show a typing indicator or pulsing dot after the last message
- Add `error` prop — when set, show an error banner above the input with a dismiss button
- Ensure the messages list auto-scrolls to the bottom when new content arrives (streaming or not). Use a `ref` on the scroll container + `scrollIntoView` on the last message element.
- The streaming message should render with a blinking cursor effect (CSS animation on a `|` character after the text)

Decisions already made:
- The input field is a controlled component with local state in `page.tsx` (or in ChatPanel itself). It is NOT part of the `useChat` hook. The hook only knows about sent messages.
- When `isStreaming` is true, the send button should be disabled (prevent sending while a response is in progress).
- Clearing the input happens immediately on send (optimistic), not after the response completes.

**Tests:**

No new test files — this is a wiring change. Covered by:
- BU-12 E2E tests
- Manual verification below

**Verification:**
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual test (full flow):
  1. Open a workspace
  2. Switch to chat panel
  3. Type a message and send
  4. Verify: message appears instantly in the chat, typing indicator shows, streaming text builds up, final response replaces streaming, input is cleared and re-enabled
  5. Refresh the page → conversation persists, messages reload
  6. Send another message in the same conversation → verify it continues the thread
  7. Check the network tab: one tRPC mutation for sendMessage, one fetch to `/api/chat/stream`, SSE events visible in the response

---

## BU-10 — Conversation management UI

**Goal:** Add UI for listing, switching, creating, and deleting conversations in the chat panel.

**Inputs:** BU-09

**Creates / Modifies:**
- `apps/web/src/components/canvas/chat-panel.tsx` — add conversation list and management controls
- `apps/web/src/components/canvas/conversation-list.tsx` — new component (optional — can inline in chat-panel if small enough)

**Description:**

Add conversation management to the chat panel header area. The user needs to be able to:

1. **See a list of past conversations** — shown as a dropdown/popover triggered by clicking the current conversation title in the header. Each item shows: title (or "Untitled"/"New conversation"), relative timestamp ("2 hours ago"), and message count.

2. **Switch between conversations** — clicking a conversation in the list calls `chat.setActiveConversationId(id)`. The messages area updates to show that conversation's history.

3. **Create a new conversation** — a "New chat" button at the top of the conversation list (or in the header). Calls `chat.createConversation()` or simply clears the active conversation (so the next message creates one automatically).

4. **Delete a conversation** — each conversation in the list has a delete button (trash icon) that appears on hover. Clicking it calls `chat.deleteConversation(id)`. If the deleted conversation was active, clear the active conversation.

UI design:
- Follow the VS Code aesthetic: compact, system fonts, minimal border radius
- Conversation list as a dropdown/popover anchored to the header
- Use `text-muted-foreground` for timestamps and secondary text
- Delete button uses `text-destructive` on hover
- Active conversation highlighted with `bg-muted`
- Empty state: "No conversations yet. Start by sending a message."

Whether to create `conversation-list.tsx` as a separate file:
- If the conversation list is more than ~50 lines of JSX, extract it to `conversation-list.tsx`
- If it's simple (just a mapped list with a few handlers), keep it inline in `chat-panel.tsx`
- Use your judgment during implementation

Decisions already made:
- No conversation renaming in Phase 1 — titles are null (auto-title is Phase 2)
- Display "New conversation" for null titles, or show a preview of the first message if available
- The conversation list is fetched via `chat.conversations` from the `useChat` hook (already wired in BU-09)
- No drag-to-reorder, no folders, no search — keep it minimal for Phase 1

**Tests:**

No new test files — UI interactions tested via BU-12 E2E tests.

**Verification:**
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual test:
  1. Send a message → conversation appears in the list
  2. Send messages in 2 different conversations → both appear in the list
  3. Click a conversation in the list → messages switch to that conversation
  4. Click "New chat" → clears the panel, next message creates a new conversation
  5. Hover over a conversation → delete button appears
  6. Delete a conversation → it disappears from the list, messages clear if it was active
  7. Delete all conversations → empty state message appears

---

## BU-11 — Markdown rendering for AI responses

**Goal:** Render assistant messages as formatted markdown (headings, lists, bold, code blocks, tables) instead of plain text.

**Inputs:** BU-09

**Creates / Modifies:**
- `apps/web/package.json` — add markdown rendering dependency
- `apps/web/src/components/canvas/chat-message.tsx` — new component
- `apps/web/src/components/canvas/chat-panel.tsx` — use ChatMessage component for rendering

**Description:**

Claude's responses use markdown formatting (headers, bullet lists, bold, code blocks, tables). Currently, messages render as plain text. This BU adds proper markdown rendering.

Create `chat-message.tsx` — a component that takes a message object and renders it appropriately:
- User messages: render as plain text (users don't write markdown)
- Assistant messages: render through a markdown parser

Markdown library choice:
- Use `react-markdown` — it's the standard, lightweight, and supports custom component overrides
- Add `remark-gfm` for GitHub-flavored markdown (tables, strikethrough, task lists)
- No syntax highlighting for code blocks in Phase 1 — just a styled `<pre><code>` block with `bg-muted` background. Syntax highlighting (via `rehype-highlight` or `shiki`) can be added later.

Styling:
- Headings: `text-sm font-semibold` for h1, progressively smaller. Don't use large headings — the chat panel is narrow.
- Lists: standard bullet/number lists with `pl-4` indent
- Code blocks: `bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto`
- Inline code: `bg-muted rounded px-1 py-0.5 text-xs font-mono`
- Tables: `border-border` borders, `text-xs`, compact padding
- Bold: `font-semibold`
- Links: `text-primary underline` (if Claude generates links, they should be clickable but open in a new tab)
- All text inherits `text-foreground` / `text-muted-foreground` — no hardcoded colors

Streaming rendering:
- During streaming (`isStreaming` + `streamingContent`), the markdown parser re-renders on every text delta. This is potentially expensive.
- Mitigation: only parse markdown after the streaming is complete. While streaming, render as plain text with a monospace font (or render markdown but throttle updates to every 100ms instead of every delta).
- Alternative: render markdown during streaming — `react-markdown` handles partial markdown gracefully (incomplete bold, unterminated lists). Test which approach feels better.

Component integration:
- Replace the current message rendering in `chat-panel.tsx` with the `ChatMessage` component
- Pass `isStreaming` to differentiate streaming vs. complete messages

**Tests:**

No unit tests — markdown rendering is a visual concern. Tested via:
- BU-12 E2E tests (verify rendered HTML contains expected elements)
- Manual verification below

**Verification:**
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual test — send prompts that elicit different markdown features:
  1. "List 5 tips for saving money" → verify bullet list renders
  2. "Show me a comparison table of savings accounts" → verify table renders
  3. "What is compound interest? Use a formula" → verify code block renders
  4. "Explain the **key** differences" → verify bold renders
  5. Verify that during streaming, the text is readable (not flickering or broken)
  6. Verify dark mode — all markdown elements use semantic colors

---

## BU-12 — E2E integration tests

**Goal:** Write Playwright end-to-end tests that verify the full chat flow from the browser through the server.

**Inputs:** BU-08, BU-09

**Creates / Modifies:**
- `apps/web/e2e/chat.spec.ts` — new test file

**Description:**

Write Playwright E2E tests for the chat feature. These tests run against the real dev server (frontend + backend) with dev auth bypass enabled. They use a real (or mocked) Anthropic API.

Important consideration: E2E tests that call the real Anthropic API are slow and costly. Two strategies:

**Strategy A (recommended for CI): Mock the SSE endpoint.** Use Playwright's `page.route()` to intercept `POST /api/chat/stream` and respond with a fake SSE stream. This tests the full client-side flow without hitting Anthropic. The tRPC mutations (sendMessage, createConversation) still hit the real server.

**Strategy B (for manual/nightly runs): Real Anthropic calls.** Slower, costs money, but tests the true end-to-end path. Only run when `ANTHROPIC_API_KEY` is set in CI env.

Tests should use Strategy A by default, with Strategy B gated behind an env flag.

```
describe('Chat — E2E')
  beforeEach
    - Navigate to a workspace page (create one via API or UI if needed)
    - Switch to chat panel
    - Intercept /api/chat/stream with mock SSE response (Strategy A)

  it('sends a message and receives a streaming response')
    - Type message in the input
    - Click send (or press Enter)
    - Assert: user message appears in the chat
    - Assert: typing indicator appears
    - Assert: streaming text appears progressively
    - Assert: final response is complete and typing indicator is gone

  it('persists messages across page reload')
    - Send a message, wait for response
    - Reload the page
    - Assert: the conversation loads with both user and assistant messages

  it('creates a new conversation on first message')
    - Assert: no active conversation initially
    - Send a message
    - Assert: conversation appears in the conversation list

  it('switches between conversations')
    - Send a message (creates conversation 1)
    - Click "New chat"
    - Send a different message (creates conversation 2)
    - Click conversation 1 in the list
    - Assert: conversation 1 messages are shown
    - Click conversation 2 in the list
    - Assert: conversation 2 messages are shown

  it('deletes a conversation')
    - Send a message (creates a conversation)
    - Open conversation list
    - Click delete on the conversation
    - Assert: conversation is removed from the list
    - Assert: chat panel shows empty state

  it('disables send button while streaming')
    - Send a message
    - While streaming: assert send button is disabled
    - After streaming: assert send button is enabled

  it('handles stream errors gracefully')
    - Intercept /api/chat/stream to return an error SSE event
    - Send a message
    - Assert: error message is displayed in the chat panel
    - Assert: user can still send new messages

  it('auto-scrolls to latest message')
    - Send multiple messages to fill the chat panel
    - Assert: scroll position is at the bottom after each new message

  it('renders markdown in assistant responses')
    - Intercept SSE to return a response with markdown (bold, list, code block)
    - Send a message
    - Assert: rendered HTML contains <strong>, <ul>/<li>, <pre><code> elements
```

**Verification:**
- `pnpm exec playwright test apps/web/e2e/chat.spec.ts` — all pass
- Tests run in CI (lint + typecheck + test + e2e + build pipeline)

---

## BU-13 — Error states + polish

**Goal:** Handle all error states gracefully and polish the chat experience for Phase 1 launch.

**Inputs:** BU-09

**Creates / Modifies:**
- `apps/web/src/components/canvas/chat-panel.tsx` — error states, empty states, loading states
- `apps/web/src/hooks/useChat.ts` — error handling improvements
- `apps/web/src/components/canvas/chat-message.tsx` — error message styling

**Description:**

This is a sweep-through unit that addresses UX gaps across the chat feature. No new architecture — just hardening.

Error states to handle:

1. **Network failure** — fetch to `/api/chat/stream` fails (server down, offline)
   - Show: "Unable to connect. Check your connection and try again." with a retry button
   - The retry button re-sends the last user message

2. **Rate limited** — server returns 429
   - Show: "You're sending messages too quickly. Please wait a moment."
   - Auto-dismiss after 30 seconds

3. **Anthropic API error** — SSE error event with type ANTHROPIC_*
   - `ANTHROPIC_AUTH_ERROR`: "AI service is not configured. Contact support." (this means the server's API key is bad — not the user's fault)
   - `ANTHROPIC_RATE_LIMIT`: "AI service is busy. Your message will be retried shortly." (consider auto-retry with backoff)
   - `ANTHROPIC_OVERLOADED`: "AI service is temporarily overloaded. Please try again in a few minutes."
   - `ANTHROPIC_NETWORK_ERROR`: "Unable to reach AI service. Please try again."

4. **Conversation load failure** — tRPC query for getConversation fails
   - Show: "Unable to load conversation." with retry button
   - Don't crash the whole panel — show the error inline

5. **Empty workspace** — workspace has no data
   - The AI should still work (it'll respond with generic help). No special error state needed, but the system prompt (from BU-05) handles this gracefully.

Loading states:

1. **Initial load** — conversation list loading: show skeleton lines (2-3 shimmer bars)
2. **Sending message** — brief moment between clicking send and seeing the user message: show the message immediately (optimistic)
3. **Waiting for first token** — between sending and receiving the first `text_delta`: show a typing indicator (three pulsing dots)
4. **Switching conversations** — loading a different conversation's messages: show a brief skeleton or spinner in the messages area

Polish items:

1. **Keyboard shortcuts**: Enter to send, Shift+Enter for newline (verify this works with the existing textarea)
2. **Input auto-focus**: when the chat panel opens, focus the textarea
3. **Message timestamps**: show relative time ("2m ago", "1h ago") on each message, visible on hover
4. **Copy message**: long-press or right-click on an assistant message shows "Copy" option (or a small copy button on hover)
5. **Scroll behavior**: auto-scroll to bottom on new messages, but stop auto-scrolling if the user has scrolled up (they're reading history). Resume auto-scrolling when they scroll back to the bottom.
6. **Empty conversation state**: when no messages exist, show a welcome message: "Ask me anything about your {workspaceName} workspace." with 2-3 example prompt chips the user can click to send.

**Tests:**

No new test files. Error states are tested via:
- BU-12 E2E tests (the error scenario test)
- Manual verification below

**Verification:**
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual test — systematically trigger each error state:
  1. Stop the server → send a message → verify network error appears
  2. Set invalid `ANTHROPIC_API_KEY` → send a message → verify auth error appears
  3. Spam send 25+ messages rapidly → verify rate limit message appears
  4. Verify typing indicator appears between send and first token
  5. Verify Enter sends, Shift+Enter adds a newline
  6. Verify auto-scroll behavior (scroll up to read history → new messages don't yank scroll → scroll to bottom → auto-scroll resumes)
  7. Verify empty state shows welcome message with example prompts
  8. Click an example prompt → verify it sends that message
  9. Verify all error messages use semantic colors (not hardcoded), look correct in dark mode

---

## File index

Summary of all files created or modified across Phase 1:

| File | Action | Build Units |
|------|--------|-------------|
| `apps/server/src/db/schema.ts` | Modify | BU-01, BU-07 |
| `apps/server/src/trpc/routers/chat.ts` | Modify | BU-03, BU-07 |
| `apps/server/src/services/anthropic.ts` | Create | BU-04 |
| `apps/server/src/services/ai-context.ts` | Create | BU-05 |
| `apps/server/src/routes/chat-stream.ts` | Create | BU-06, BU-07 |
| `apps/server/src/index.ts` | Modify | BU-06 |
| `apps/server/src/env.ts` | No change (ANTHROPIC_API_KEY already present) | — |
| `apps/server/package.json` | Modify | BU-04 |
| `apps/server/src/__tests__/chat-tables.test.ts` | Create | BU-01 |
| `apps/server/src/__tests__/chat-router.test.ts` | Create | BU-03 |
| `apps/server/src/__tests__/anthropic-service.test.ts` | Create | BU-04 |
| `apps/server/src/__tests__/ai-context.test.ts` | Create | BU-05 |
| `apps/server/src/__tests__/chat-stream.test.ts` | Create | BU-06 |
| `apps/server/src/__tests__/ai-usage.test.ts` | Create | BU-07 |
| `packages/shared-schemas/src/chat.ts` | Modify | BU-02 |
| `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` | Create | BU-02 |
| `packages/shared-types/src/index.ts` | Modify | BU-02 |
| `apps/web/src/hooks/useChat.ts` | Create | BU-08 |
| `apps/web/src/components/canvas/chat-panel.tsx` | Modify | BU-09, BU-10, BU-13 |
| `apps/web/src/components/canvas/conversation-list.tsx` | Create (maybe) | BU-10 |
| `apps/web/src/components/canvas/chat-message.tsx` | Create | BU-11, BU-13 |
| `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` | Modify | BU-09 |
| `apps/web/package.json` | Modify | BU-11 |
| `apps/web/e2e/chat.spec.ts` | Create | BU-12 |

**Total: 14 files created, 10 files modified**

---

## Phase 1 completion checklist

All of these must be true when BU-01 through BU-13 are complete:

- [x] **BU-01** — `conversations` and `messages` tables exist in schema.ts; chat-tables tests pass
- [x] **BU-02** — Zod schemas cover all Phase 1 shapes (message, conversation, SSE events, list item); schema tests pass
- [x] **BU-03** — Chat router has 5 real procedures (no TODOs); router tests pass
- [x] **BU-04** — `@anthropic-ai/sdk` installed; anthropic service wrapper exists with error mapping; service tests pass
- [x] **BU-05** — `buildWorkspaceContext` queries all financial tables and produces a formatted system prompt; context tests pass
- [x] **BU-06** — `POST /api/chat/stream` endpoint works end-to-end with SSE; stream tests pass
- [x] **BU-07** — `aiUsage` table exists; every AI response logs tokens and cost; usage tests pass
- [x] **BU-08** — `useChat` hook manages conversations, messages, streaming, and errors; compiles cleanly
- [x] **BU-09** — ChatPanel uses real data from useChat instead of local state placeholders
- [x] **BU-10** — Users can list, switch, create, and delete conversations in the UI
- [x] **BU-11** — Assistant messages render with proper markdown formatting
- [x] **BU-12** — E2E tests pass: send message, persist, switch, delete, error handling
- [x] **BU-13** — All error states have user-facing messages; loading/empty states are polished

**Phase 1 success criteria (from A4_AI_PIPELINE.md):**
- [x] User sends a message → gets a streaming response within 2 seconds
- [x] Response references actual workspace data (account balances, budget numbers)
- [x] Conversations persist across page reloads
- [x] Token usage is tracked and visible
- [x] `pnpm typecheck` passes across entire monorepo
- [x] `pnpm test` — all unit tests pass (67 server + 3 web = 70 tests)
- [x] `pnpm exec playwright test` — all E2E tests pass (12 passed)
- [x] `pnpm build` — both apps build successfully
