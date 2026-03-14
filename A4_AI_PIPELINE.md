# A4 — AI Pipeline: Architecture, Implementation Plan & End Goals

> **Created:** 2026-03-12
> **Status:** Pre-implementation. Chat panel UI skeleton complete. No backend AI integration yet.
> **Related docs:** [Architecture](./A4_ARCHITECTURE.md) | [Systems](./A4_SYSTEMS.md) | [Roadmap](./A4_ROADMAP.md) | [Financial Autonomy](./A4_FINANCIAL_AUTONOMY.md)

---

## The Thesis

A4's canvas toolkit is semi-complete — 27 item types, 21 DB tables, 15 fully implemented tRPC routers, vault encryption, market data, file upload. The core financial tools exist as draggable, configurable cards on an infinite canvas, though many still need polish, deeper data integration, and full feature parity.

But today, the user does all the work. They manually create cards, enter data, connect items, and interpret results. The AI pipeline is what transforms A4 from "a really good financial spreadsheet canvas" into **an autonomous financial operating system** — one where the user describes what they want in natural language and the system builds, analyzes, and maintains their financial picture.

The AI is not a chatbot bolted onto a dashboard. It is **the primary interface** for power users. The canvas is the visual substrate; the AI is the engine that populates it, reasons over it, and keeps it current.

---

## End Goals (the north stars)

These are the big outcomes the AI pipeline must eventually deliver. Every implementation phase should be evaluated against whether it moves toward these goals.

### 1. Conversational financial analyst

The user opens a workspace and talks to it like they would talk to a personal CFO:

- *"How did my spending change this month vs last month?"*
- *"Am I on track to hit my savings goal by December?"*
- *"What's my effective tax rate going to be if I take this 1099 gig?"*
- *"Show me where my money is going — I feel like subscriptions are out of control"*

The AI answers with **real numbers from the user's actual data** — not generic advice. It references specific accounts, budget categories, transactions, and documents in the workspace. It cites sources ("Based on your Chase checking ledger and the budget you set up in Q1...").

**Success metric:** The user never needs to manually cross-reference two cards to answer a financial question. They just ask.

### 2. Autonomous workspace builder

The user describes what they want, and the AI builds it:

- *"Set up a personal finance workspace — I need a budget, net worth tracker, and monthly cash flow view"*
- *"Create a tax year folder for 2026 with all the documents I'll need"*
- *"Add a debt payoff planner for my student loans — $45k at 6.8%, $28k at 4.5%"*
- *"I just started freelancing — set up my bookkeeping: invoicing, expense tracking, quarterly tax estimates"*

The AI uses tool calls to create canvas items, position them logically, populate them with the user's data, and connect related items with bezier curves. A single conversation turn can produce a fully functional workspace section.

**Success metric:** A new user can go from zero to a complete financial workspace in a 5-minute conversation.

### 3. Document-grounded intelligence (RAG)

Users upload bank statements, tax forms, pay stubs, investment reports, contracts, receipts. The AI reads and understands all of them:

- *"What was my total income last year based on my W-2s and 1099s?"*
- *"Find every subscription charge in my last 3 bank statements"*
- *"Summarize the key terms of this lease agreement"*
- *"Are there any discrepancies between my brokerage statement and my portfolio card?"*

The AI retrieves relevant document chunks via vector search, synthesizes answers, and cites specific pages/sections. It can also **extract structured data** from documents and populate canvas cards automatically (e.g., parse a CSV bank statement → create ledger entries).

**Success metric:** Every document the user uploads becomes queryable knowledge, not just a stored file.

### 4. Proactive financial intelligence

The AI doesn't just answer questions — it notices things and surfaces insights:

- *"Your Amazon subscription went up $3/month since last renewal"*
- *"You have $12,400 sitting in checking earning 0% — your HYSA rate is 4.5%"*
- *"Your portfolio has drifted 7% from target allocation — the rebalancing threshold you set was 5%"*
- *"Estimated tax payment Q2 is due in 14 days — based on your projection, you owe ~$3,200"*
- *"Your burn rate increased 18% this month — mostly from the 'Dining' category"*

This requires the AI to periodically scan workspace data, compare against user-defined rules/thresholds, and generate alerts. Eventually this becomes a notification/digest system.

**Success metric:** The user discovers problems and opportunities they wouldn't have found on their own.

### 5. Multi-workspace reasoning

Users with multiple workspaces (personal + business, or multiple businesses) can ask questions that span them:

- *"What's my total tax liability across personal income and my LLC?"*
- *"How much cash do I have across all accounts in all workspaces?"*
- *"Compare my business expenses this quarter vs last quarter across both companies"*

The AI can be scoped to a single workspace or granted cross-workspace access for holistic analysis.

**Success metric:** A4 is the single source of truth for the user's entire financial picture.

### 6. Integration-powered live data

When Plaid, Stripe, QuickBooks, and other integrations are connected, the AI works with **live data** — not just what the user manually entered:

- *"Pull my last 30 days of transactions from Chase and categorize them"*
- *"How much revenue did I collect through Stripe this month?"*
- *"Reconcile my QuickBooks P&L against my ledger card"*

The AI orchestrates integration APIs, transforms data, and keeps canvas cards current.

**Success metric:** The user's financial workspace stays up to date without manual data entry.

### 7. Financial planning agent

The ultimate end state: the AI is a **planning agent** that helps users make decisions, not just track data:

- *"I'm thinking about buying a house for $450k — can I afford it?"* → AI runs rent-vs-buy model, checks debt-to-income ratio, simulates mortgage payments against current cash flow, considers tax implications, and presents a recommendation with supporting analysis.
- *"Should I convert my Traditional IRA to Roth this year?"* → AI pulls current income, runs tax projection with and without conversion, models future tax savings, and recommends based on the user's time horizon.
- *"I want to retire at 55 — what do I need to save per month?"* → AI builds a projection model factoring current net worth, expected returns, inflation, Social Security estimates, and healthcare costs.

**Success metric:** The user trusts A4 enough to make real financial decisions based on its analysis.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│                                                                 │
│  ChatPanel ──SSE──→ StreamRenderer ──→ MessageList              │
│       │                                     │                   │
│       │ send message                        │ tool results      │
│       ▼                                     ▼                   │
│  tRPC mutation ◄───────────────── Canvas actions (Zustand)      │
└────────┬────────────────────────────────────────────────────────┘
         │ HTTP
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Server (Express + tRPC)                      │
│                                                                 │
│  chat.sendMessage                                               │
│       │                                                         │
│       ├─→ Load conversation history (messages table)            │
│       ├─→ Build system prompt (workspace context)               │
│       │     ├─ Workspace metadata                               │
│       │     ├─ Canvas item summaries (all cards, positions)     │
│       │     ├─ Financial data summaries (accounts, budgets...)  │
│       │     ├─ RAG chunks (vector search on user query)         │
│       │     └─ User preferences / prior conversation context    │
│       │                                                         │
│       ├─→ Anthropic SDK — messages.create (streaming)           │
│       │     ├─ Model: claude-sonnet-4-6 (fast) / claude-opus-4-6 (deep)     │
│       │     ├─ Tools: A4 tool definitions                       │
│       │     └─ System prompt: workspace-grounded instructions   │
│       │                                                         │
│       ├─→ Tool execution loop                                   │
│       │     ├─ Claude returns tool_use block                    │
│       │     ├─ Server executes tool (DB query, canvas action)   │
│       │     ├─ Server returns tool_result to Claude             │
│       │     └─ Loop until Claude returns final text response    │
│       │                                                         │
│       ├─→ SSE stream to client (token by token)                 │
│       │     ├─ Text deltas                                      │
│       │     ├─ Tool call notifications (so UI can show actions) │
│       │     └─ Done signal                                      │
│       │                                                         │
│       └─→ Persist message + assistant response to DB            │
│                                                                 │
│  Embedding pipeline (async)                                     │
│       ├─ On file upload → chunk → embed → store vectors         │
│       └─ On query → embed query → cosine similarity → top-k    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Additions

### `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `workspace_id` | text NOT NULL | FK to workspaces |
| `user_id` | text NOT NULL | Owner |
| `title` | text | Auto-generated from first message or AI-summarized |
| `model` | text NOT NULL | `'claude-sonnet-4-6'` or `'claude-opus-4-6'` |
| `created_at` | integer (timestamp) | |
| `updated_at` | integer (timestamp) | |

### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `conversation_id` | text NOT NULL | FK to conversations |
| `user_id` | text NOT NULL | |
| `role` | text NOT NULL | `'user'`, `'assistant'`, `'system'`, `'tool'` |
| `content` | text NOT NULL | Message text or JSON for tool calls/results |
| `tool_calls` | text | JSON array of tool_use blocks (assistant messages) |
| `tool_call_id` | text | For tool result messages — links back to the tool_use |
| `token_count` | integer | Input + output tokens consumed |
| `model` | text | Model used for this response |
| `created_at` | integer (timestamp) | |

### `document_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `file_id` | text NOT NULL | FK to files table |
| `workspace_id` | text NOT NULL | |
| `user_id` | text NOT NULL | |
| `chunk_index` | integer NOT NULL | Position in document |
| `content` | text NOT NULL | Raw text chunk |
| `embedding` | blob NOT NULL | Float32 vector (1536-dim or model-dependent) |
| `metadata` | text | JSON — page number, section heading, etc. |
| `created_at` | integer (timestamp) | |

### `ai_usage`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `user_id` | text NOT NULL | |
| `conversation_id` | text | |
| `model` | text NOT NULL | |
| `input_tokens` | integer NOT NULL | |
| `output_tokens` | integer NOT NULL | |
| `cost_cents` | integer | Computed from token counts |
| `created_at` | integer (timestamp) | |

---

## Tool Definitions (what Claude can do)

The AI has access to A4's entire toolkit via structured tool definitions. Each tool maps to an existing tRPC router or canvas store action.

### Data retrieval tools

| Tool | Description | Maps to |
|---|---|---|
| `get_workspace_summary` | Get workspace metadata, item count by type, last updated | `workspace.getById` + `canvas.load` |
| `get_canvas_items` | List all canvas items with types, names, positions | `canvas.load` |
| `get_item_data` | Get full data for a specific canvas item by ID | `canvas.load` → filter |
| `get_accounts` | List accounts with balances, types, groups | `account.list` + `account.getSummary` |
| `get_budget` | Get budget groups, categories, planned vs actual | `budget.listGroups` + `budget.listCategories` + `budget.getSummary` |
| `get_invoices` | List invoices with line items, totals, statuses | `invoice.list` + `invoice.getSummary` |
| `get_receipts` | List receipts with amounts, categories, dates | `receipt.list` + `receipt.getSummary` |
| `get_subscriptions` | List subscriptions with costs, renewal dates | `subscription.list` + `subscription.getSummary` |
| `get_holdings` | Get portfolio holdings, allocations, drift | `holding.list` + `holding.getSummary` |
| `get_debts` | List debts with balances, rates, minimums | `debt.list` + `debt.getSummary` |
| `get_networth` | Get net worth breakdown by category | `networth.listCategories` + `networth.listEntries` + `networth.getSummary` |
| `get_market_data` | Get stock/crypto price, aggregates, snapshot | `marketData.getSnapshot` + `marketData.getAggregates` |
| `search_documents` | RAG: search uploaded documents for relevant content | Vector similarity search on `document_chunks` |

### Canvas creation tools

| Tool | Description | Effect |
|---|---|---|
| `create_canvas_item` | Create any canvas item type with data | Adds item to canvas via store + DB save |
| `update_canvas_item` | Update an existing item's data | Modifies item data + DB save |
| `delete_canvas_item` | Remove a canvas item | Removes from store + DB |
| `create_connection` | Connect two canvas items | Adds bezier connection |
| `position_items` | Arrange items in a layout (grid, column, row) | Batch update positions |

### Calculation tools

| Tool | Description | Maps to |
|---|---|---|
| `calculate_tax` | Run US federal + state tax estimate | Tax estimator logic (`tax-utils.ts`) |
| `calculate_loan` | Run amortization schedule | Loan calculator logic (`loan-calculator-utils.ts`) |
| `calculate_projection` | Run compound growth projection | Projection logic (`projection-utils.ts`) |
| `calculate_breakeven` | Run break-even analysis | Breakeven logic (`breakeven-utils.ts`) |
| `calculate_depreciation` | Run depreciation schedule | Depreciation logic (`depreciation-utils.ts`) |
| `calculate_rent_vs_buy` | Run rent-vs-buy comparison | Rent-vs-buy logic (`rent-vs-buy-utils.ts`) |
| `calculate_debt_payoff` | Run debt snowball/avalanche simulation | Debt planner logic (`debt-planner-utils.ts`) |

### Action tools

| Tool | Description | Effect |
|---|---|---|
| `create_workspace` | Create a new workspace | `workspace.create` |
| `import_transactions` | Parse CSV/Excel and create ledger entries | File parsing + batch insert |
| `generate_report` | Produce a formatted financial report | Creates A4 page with structured content |

---

## Implementation Phases

### Phase 1: Chat that works (foundation)

**Goal:** User can send a message and get a streaming response from Claude that is aware of their workspace data.

**Server-side:**
1. Add `conversations` and `messages` tables to `schema.ts`
2. Generate and run Drizzle migration
3. Install `@anthropic-ai/sdk` in `apps/server`
4. Implement `chat` router (replace stubs):
   - `createConversation` — creates a new conversation for a workspace
   - `listConversations` — list conversations for a workspace
   - `getConversation` — get conversation with all messages
   - `deleteConversation` — soft-delete a conversation
   - `sendMessage` — the core procedure:
     1. Insert user message into DB
     2. Load conversation history
     3. Build system prompt with workspace context:
        - Workspace name, description, type
        - List of canvas items (type, name, summary)
        - Account balances summary
        - Budget summary (planned vs actual)
        - Net worth summary
        - Recent invoices/receipts/subscriptions
     4. Call Anthropic SDK `messages.create` with streaming
     5. Accumulate assistant response
     6. Insert assistant message into DB
     7. Track token usage in `ai_usage` table
     8. Return conversation ID + message ID

5. Add SSE streaming endpoint:
   - Express route `GET /api/chat/stream/:conversationId` (or use tRPC subscription)
   - Server sends `text/event-stream` with `data: { type: 'text_delta', text: '...' }` events
   - Client reads via `EventSource` or `fetch` + `ReadableStream`

**Client-side:**
6. Update `ChatPanel` to use real tRPC mutations instead of local state
7. Implement `useChat` hook:
   - `sendMessage(content)` → calls `chat.sendMessage`, opens SSE stream
   - `messages` — derived from conversation query
   - `isStreaming` — true while SSE is open
   - `streamingContent` — accumulated text from current stream
8. Streaming message renderer:
   - Shows assistant message building up token by token
   - Typing indicator while waiting for first token
   - Auto-scroll to bottom on new content
9. Conversation management:
   - Create new conversation on first message (or workspace open)
   - Show conversation list in chat panel header (dropdown)
   - Switch between conversations

**Context injection strategy:**
- On each `sendMessage`, the server builds a system prompt dynamically from the workspace's current state
- This is NOT RAG yet — it's direct DB queries summarized into structured text
- Keep the context window efficient: summaries, not raw data dumps
- Example system prompt section:
  ```
  ## Workspace: "Personal Finance 2026"

  ### Accounts (3 total, $47,230 combined)
  - Chase Checking: $8,430 (checking)
  - Ally HYSA: $25,000 (savings)
  - Fidelity Brokerage: $13,800 (brokerage)

  ### Budget (Monthly, March 2026)
  - Planned: $4,200 | Actual: $3,180 | Remaining: $1,020
  - Over budget: Dining ($380/$200)
  - Under budget: Entertainment ($45/$150)

  ### Net Worth: $142,500 (up $3,200 from last month)
  - Assets: $198,000 | Liabilities: $55,500

  ### Canvas Items (12 items)
  - budget-card: "Monthly Budget" (id: abc123)
  - account-card: "Bank Accounts" (id: def456)
  - networth-card: "Net Worth Tracker" (id: ghi789)
  - ...
  ```

### Phase 2: Tool use — AI takes actions (the leap)

**Goal:** Claude can call A4 tools to create canvas items, query data, and run calculations. The user says "create a budget" and it appears on the canvas.

1. Define tool schemas as Anthropic tool definitions (JSON Schema):
   - Start with read-only tools first: `get_accounts`, `get_budget`, `get_networth`, `get_holdings`, `get_debts`, `get_subscriptions`
   - Then add creation tools: `create_canvas_item`, `update_canvas_item`, `create_connection`
   - Then add calculation tools: `calculate_tax`, `calculate_loan`, etc.

2. Implement tool execution engine on the server:
   ```
   while (response has tool_use blocks) {
     for each tool_use block:
       validate tool input against schema
       execute tool (DB query, canvas mutation, calculation)
       collect tool_result
     send tool_results back to Claude
     get next response
   }
   ```

3. Stream tool call notifications to the client:
   - `{ type: 'tool_call', name: 'create_canvas_item', input: {...} }`
   - `{ type: 'tool_result', name: 'create_canvas_item', result: {...} }`
   - Client shows inline indicators: "Creating budget card..." → "Budget card created"

4. Canvas reactivity:
   - When the AI creates/updates a canvas item, the server saves to DB
   - Client receives a signal to refetch canvas state (invalidate TanStack Query)
   - Item appears on canvas in real-time
   - Alternatively: the SSE stream includes the new item data, and the client adds it to the Zustand store directly

5. Smart positioning:
   - AI tools include optional `x`, `y` coordinates
   - If omitted, server auto-positions using a layout algorithm:
     - Find empty space on canvas (no overlap with existing items)
     - Group related items spatially (e.g., budget + accounts near each other)
     - Use grid alignment to keep things tidy

6. Safety guardrails:
   - Tool calls are logged and auditable
   - Destructive actions (delete) require user confirmation via a special SSE event
   - Rate limiting on tool calls per conversation turn (prevent infinite loops)
   - Cost tracking per tool call

### Phase 3: RAG — AI knows your documents

**Goal:** Every uploaded file becomes searchable knowledge. The AI can answer questions grounded in the user's documents.

1. **Embedding pipeline** (async, triggered on file upload):
   - Extract text from uploaded files:
     - PDF: use existing `pdfjs-dist` text extraction
     - CSV/Excel: serialize rows as text
     - Word/DOCX: use existing mammoth extraction
     - Images: OCR via Tesseract.js or skip (future)
     - Plain text: direct
   - Chunk text into ~500 token segments with overlap (~50 tokens)
   - Embed each chunk using Anthropic's embedding model (or OpenAI `text-embedding-3-small` if Anthropic doesn't offer one — use whatever is cheapest and good enough)
   - Store chunk + embedding in `document_chunks` table

2. **Vector search** (at query time):
   - Embed the user's query
   - Cosine similarity search against `document_chunks` for the workspace
   - Return top-k chunks (k=5 to start)
   - Inject into system prompt as `## Relevant Documents` section with source attribution

3. **Source citations:**
   - AI response includes references like `[1]`, `[2]`
   - Client renders citations as clickable links that open/highlight the source file card
   - Citation metadata: file name, page number, chunk excerpt

4. **Incremental updates:**
   - When a file is re-uploaded or updated, re-chunk and re-embed
   - When a file is deleted, remove its chunks
   - Background job to re-embed if embedding model changes

5. **SQLite vector search:**
   - For MVP: brute-force cosine similarity in SQL (works fine for <100k chunks)
   - For scale: `sqlite-vss` extension or migrate to PostgreSQL with `pgvector`

### Phase 4: Proactive intelligence

**Goal:** The AI notices things without being asked and surfaces actionable insights.

1. **Workspace digest engine:**
   - Periodic analysis (daily or on workspace open):
     - Compare current data to thresholds the user has set
     - Detect anomalies (unusual spending, missed payments, drift)
     - Generate a list of observations
   - Store observations in a `workspace_insights` table
   - Surface in the chat panel as an "Insights" section above the input

2. **Threshold rules:**
   - Budget category overspend (>10% over planned)
   - Portfolio drift exceeding user-defined threshold
   - Subscription price changes (comparison across months)
   - Cash balance below minimum (emergency fund check)
   - Tax withholding underpayment risk
   - Debt payment deadlines approaching
   - Net worth month-over-month change exceeding a threshold

3. **Insight delivery:**
   - Badge on the "AI Chat" button in tools panel when new insights exist
   - Insights shown as dismissible cards in the chat panel
   - User can click an insight to start a conversation about it
   - Eventually: email/push notification digest (weekly summary)

4. **Learning from user behavior:**
   - Track which insights the user engages with vs dismisses
   - Adjust relevance scoring over time
   - Allow user to configure which insight types they care about

### Phase 5: Multi-workspace & advanced reasoning

**Goal:** AI can reason across workspaces and perform complex multi-step financial analysis.

1. **Cross-workspace queries:**
   - New tool: `query_workspace(workspace_id, question)` — AI can pull data from another workspace
   - Permission model: user must own both workspaces
   - Use case: "What's my total tax liability across personal + business?"

2. **Multi-step reasoning chains:**
   - AI can compose multiple tool calls in sequence to answer complex questions
   - Example: "Can I afford to buy a $500k house?"
     1. `get_accounts` → check cash for down payment
     2. `get_networth` → check overall financial health
     3. `calculate_loan` → run mortgage amortization
     4. `calculate_rent_vs_buy` → compare scenarios
     5. `get_budget` → check monthly cash flow capacity
     6. Synthesize into a recommendation

3. **Scenario modeling:**
   - AI creates multiple projection variants and compares them
   - "What if I max out my 401k vs just getting the match?"
   - "What if I pay off my car loan early vs investing the difference?"
   - Results displayed as side-by-side canvas items

4. **Conversation memory across sessions:**
   - AI remembers past conversations and can reference them
   - "Last month you asked about refinancing — rates have dropped 0.25% since then"
   - Implemented via conversation summaries stored in DB

---

## System Prompt Strategy

The system prompt is the most critical piece. It defines how the AI behaves, what it knows, and how it uses tools.

### Structure

```
You are A4, an AI financial analyst embedded in the user's financial workspace.
You have access to the user's actual financial data — never make up numbers.
Always ground your answers in the data available through your tools.

## Your capabilities
- Answer questions about the user's finances using real data from their workspace
- Create, update, and organize canvas items (budgets, accounts, charts, etc.)
- Run financial calculations (tax estimates, loan amortization, projections, etc.)
- Search and summarize uploaded documents
- Spot anomalies and surface insights

## Rules
- NEVER fabricate financial data. If you don't have the data, say so and suggest how the user can add it.
- ALWAYS cite which canvas items, accounts, or documents your answer is based on.
- When creating canvas items, position them logically near related items.
- For destructive actions (deleting items, large data changes), confirm with the user first.
- Keep responses concise and actionable. Users are managing their money, not reading essays.
- Use exact numbers with proper formatting ($12,345.67, not "about twelve thousand").
- When running calculations, show your assumptions clearly.

## Current workspace context
{dynamically injected workspace summary — see Phase 1}

## Available documents
{dynamically injected RAG results — see Phase 3}
```

### Context window management

- **Budget:** Reserve ~20% of context for system prompt + workspace context, ~30% for conversation history, ~50% for AI response + tool calls
- **Summarization:** When conversation history exceeds token budget, summarize older messages into a condensed recap
- **Selective context:** Don't dump everything — only include summaries of data types the user is likely asking about (inferred from the query)
- **Progressive detail:** Start with summaries; if the AI needs more detail, it calls a tool to get the full data

---

## Streaming Protocol (SSE)

### Event types

```typescript
type SSEEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string }
  | { type: 'tool_call_input'; delta: string }  // streaming tool input JSON
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'tool_result'; toolCallId: string; result: unknown }
  | { type: 'confirm_action'; toolCallId: string; description: string }  // requires user approval
  | { type: 'canvas_update'; action: 'create' | 'update' | 'delete'; item: CanvasItem }
  | { type: 'error'; message: string }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
```

### Client handling

```typescript
// Simplified — actual implementation in useChat hook
const stream = await fetch(`/api/chat/stream/${conversationId}`, {
  headers: { Authorization: `Bearer ${token}` },
});

const reader = stream.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));

    switch (event.type) {
      case 'text_delta':
        appendToStreamingMessage(event.text);
        break;
      case 'tool_call_start':
        showToolCallIndicator(event.toolName);
        break;
      case 'canvas_update':
        // Directly update Zustand store — item appears on canvas in real-time
        canvasStore.getState().upsertItem(event.item);
        break;
      case 'confirm_action':
        // Show confirmation dialog — user approves or rejects
        await showConfirmDialog(event.description);
        break;
      case 'done':
        finalizeMessage(event.usage);
        break;
    }
  }
}
```

---

## Cost Management

AI calls are expensive. A4 must be smart about cost without sacrificing quality.

### Model selection

| Scenario | Model | Why |
|---|---|---|
| Quick data lookups, simple questions | `claude-sonnet-4-6` | Fast, cheap, good enough |
| Complex analysis, multi-step reasoning | `claude-opus-4-6` | Better reasoning, worth the cost |
| Document summarization | `claude-haiku-4-5` | Bulk processing, cost-sensitive |
| Embeddings | `text-embedding-3-small` (OpenAI) or equivalent | Cheapest good-enough option |

### Cost controls

- Track tokens per user per month in `ai_usage` table
- Enforce tier limits: free tier gets N messages/month, paid tier gets more
- Cache workspace context summaries (don't rebuild on every message if nothing changed)
- Cache common calculations (tax brackets don't change mid-year)
- Summarize long conversations instead of sending full history every time
- Set `max_tokens` on responses to prevent runaway costs

---

## Security Considerations

- **Vault data:** The AI NEVER has access to vault-encrypted data (secret cards). The decryption key only exists client-side. The system prompt explicitly states this.
- **User isolation:** All queries are scoped to `ctx.userId`. The AI cannot access another user's data, even if asked.
- **Prompt injection:** User messages and document content are placed in `user` role messages, never in the system prompt. Tool results are sanitized.
- **Tool safety:** Destructive tools (delete, bulk update) require explicit user confirmation via SSE `confirm_action` events.
- **API key storage:** Anthropic API key is a server-side env var, never exposed to the client.
- **Rate limiting:** Chat endpoints have their own rate limits (separate from general tRPC limits).
- **Audit trail:** Every AI interaction (messages, tool calls, results) is logged with timestamps and token counts.

---

## Privacy & Data Architecture

### Current approach: L3 full access + Anthropic API defaults

For launch, A4 uses Claude via the Anthropic API with **full workspace data** injected into the system prompt. The AI sees real dollar amounts, account names, transaction details — everything it needs to give precise, grounded answers.

**Why this is the right starting point:**

1. **Anthropic's API privacy guarantees are strong:**
   - API data is **not used for model training** (stated in usage policy, effective by default)
   - Messages are retained for **30 days** for trust & safety monitoring, then permanently deleted
   - Anthropic is **SOC 2 Type II certified**
   - For enterprise: custom zero-data-retention (ZDR) agreements, dedicated endpoints, and audit rights are available
   - Data is encrypted in transit (TLS 1.2+) and at rest on Anthropic's infrastructure

2. **Full access produces the best user experience.** The AI can reference exact numbers, compare specific amounts, and give precise actionable advice. This is the core product differentiator.

3. **Building privacy layers before understanding AI usage patterns wastes effort.** We need to learn which data the AI actually references for which tasks before we can design an efficient redaction or symbolic layer.

4. **Vault-encrypted data is already excluded.** Secret cards (API keys, credentials, PINs) are AES-256-GCM encrypted client-side. The server — and therefore the AI — never has access to decrypted vault data. This is enforced cryptographically, not by policy.

### What the AI sees vs. doesn't see (Phase 1)

| Data | AI sees? | Reason |
|---|---|---|
| Account balances, types, names | Yes | Needed for financial analysis |
| Budget categories, planned/actual amounts | Yes | Needed for spending analysis |
| Invoice line items, totals, client names | Yes | Needed for business analysis |
| Transaction amounts, dates, categories | Yes | Needed for cash flow analysis |
| Net worth breakdown, asset/liability values | Yes | Needed for wealth analysis |
| Portfolio holdings, allocations, values | Yes | Needed for investment analysis |
| Debt balances, rates, terms | Yes | Needed for debt analysis |
| Subscription names, costs, renewal dates | Yes | Needed for expense analysis |
| Uploaded document text (PDFs, CSVs) | Yes (Phase 3 RAG) | Needed for document queries |
| Vault-encrypted secrets | **Never** | Cryptographically enforced — key exists only client-side |
| Raw auth tokens, session data | **Never** | Never injected into AI context |
| Other users' data | **Never** | All queries scoped to `ctx.userId` |

### Future privacy evolution (post-launch roadmap)

As A4 gains users and enterprise customers, the privacy architecture will evolve through three stages. Each stage builds on the previous one and nothing from Phase 1 is thrown away — the chat UI, streaming protocol, tool definitions, and conversation persistence all remain unchanged. Only the **context injection layer** (what goes into the system prompt) changes.

#### Stage 1: User-controlled data sharing (near-term)

Add a per-conversation privacy toggle in the chat panel:

- **Full access (default):** AI sees all workspace data — best quality answers
- **Reduced access:** AI sees category names, signals, and percentages but not dollar amounts or account names. Responses use template variables resolved server-side before display.

This gives privacy-conscious users control without reducing quality for users who don't care.

#### Stage 2: Symbolic execution layer (with users)

Build the L1 symbolic architecture:

- **Redacted manifest:** AI receives workspace *shape* — item types, counts, category names, computed signals (`OVER_BUDGET`, `HEALTHY`, `AT_RISK`) — but no raw values
- **Expression language:** AI composes symbolic formulas (`SUM(accounts.*.balance)`) instead of seeing numbers
- **Execution engine:** Server-side engine resolves expressions against real data
- **Template responses:** AI produces responses with `{{variable}}` placeholders, engine fills them before sending to client

The redacted manifest signals are computed server-side from real data:

```
Signal examples:
  budget.dining.status     = "OVER"      (actual/planned > 1.0)
  budget.dining.pct        = 190         (percentage, not dollars)
  cash_runway.status       = "ADEQUATE"  (months of expenses covered: 2-4)
  networth.trend           = "UP"        (month-over-month direction)
  portfolio.drift.status   = "ALERT"     (drift > user threshold)
  debt.highest_apr.status  = "HIGH"      (> 10%)
```

The AI can reason about these signals ("dining is significantly over budget, portfolio needs rebalancing") and compose execution plans — but never sees that checking has $8,430 or that net worth is $142,500.

#### Stage 3: Hybrid model architecture (enterprise)

Split workloads across self-hosted and cloud models:

- **Self-hosted model** (Llama 70B or equivalent on dedicated GPU infrastructure): handles tasks that touch raw data — document text extraction, transaction categorization, data summarization. Data never leaves A4's infrastructure.
- **Cloud API** (Claude): handles complex reasoning, tool call composition, multi-step planning — but only receives the redacted manifest from Stage 2. Best model quality for reasoning, zero raw data exposure.
- **Enterprise ZDR agreements:** contractual zero-data-retention with Anthropic for customers who require it.
- **Confidential computing (future):** self-hosted models running in TEEs (AMD SEV-SNP / AWS Nitro Enclaves) for cryptographic data isolation guarantees.

### Design principle

The context injection layer (`ai-context.ts`) is the **single point of control** for what the AI sees. Today it injects full data. Tomorrow it injects a redacted manifest. The rest of the pipeline (chat router, SSE streaming, tool execution, conversation persistence) is identical in both modes. This is an intentional architectural seam — the privacy boundary is one file, not a system-wide refactor.

---

## Migration Path (SQLite → PostgreSQL)

The AI pipeline is designed to work on SQLite for development but will need PostgreSQL for production:

- **Vector search:** SQLite brute-force → `pgvector` with HNSW index
- **Concurrent writes:** SQLite WAL mode handles single-server fine, but PG needed for multi-server
- **Full-text search:** SQLite FTS5 → PostgreSQL `tsvector` + GIN index
- **JSON queries:** SQLite `json_extract` → PostgreSQL `jsonb` operators

The Drizzle ORM abstraction makes this migration straightforward — schema definitions are the same, only the driver changes.

---

## File-by-File Impact

| File | Change | Phase |
|---|---|---|
| `apps/server/src/db/schema.ts` | Add `conversations`, `messages`, `document_chunks`, `ai_usage` tables | 1 |
| `apps/server/src/trpc/routers/chat.ts` | Replace stubs with full implementation | 1 |
| `apps/server/src/lib/ai-context.ts` | **Create** — builds workspace context for system prompt | 1 |
| `apps/server/src/lib/ai-tools.ts` | **Create** — tool definitions + execution engine | 2 |
| `apps/server/src/lib/ai-stream.ts` | **Create** — SSE streaming handler | 1 |
| `apps/server/src/lib/embedding.ts` | **Create** — chunking + embedding pipeline | 3 |
| `apps/server/src/lib/vector-search.ts` | **Create** — cosine similarity search | 3 |
| `apps/server/src/lib/insights.ts` | **Create** — proactive insight generation | 4 |
| `apps/server/src/env.ts` | Add `ANTHROPIC_API_KEY` validation | 1 |
| `apps/server/package.json` | Add `@anthropic-ai/sdk` dependency | 1 |
| `apps/web/src/components/canvas/chat-panel.tsx` | Upgrade from skeleton to real chat UI | 1 |
| `apps/web/src/hooks/useChat.ts` | **Create** — chat state management + SSE client | 1 |
| `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` | Wire ChatPanel to useChat hook, handle canvas updates from AI | 1 |
| `packages/shared-schemas/src/chat.ts` | **Create** — Zod schemas for messages, conversations | 1 |
| `packages/shared-types/src/chat.ts` | **Create** — TypeScript types for chat | 1 |

---

## Success Metrics (per phase)

### Phase 1 — Chat works
- [ ] User sends a message → gets a streaming response within 2 seconds
- [ ] Response references actual workspace data (account balances, budget numbers)
- [ ] Conversations persist across page reloads
- [ ] Token usage is tracked and visible

### Phase 2 — Tool use
- [ ] "Create a budget card" → budget card appears on canvas
- [ ] "What's my net worth?" → AI calls `get_networth` and answers with real numbers
- [ ] Multi-tool chains work (AI calls 3+ tools in sequence to answer a complex question)
- [ ] Tool calls are visible in the chat UI (user sees what the AI is doing)

### Phase 3 — RAG
- [ ] Upload a bank statement PDF → ask "what did I spend on dining?" → correct answer with citation
- [ ] Search works across multiple documents in the workspace
- [ ] Citations link back to the source file card

### Phase 4 — Proactive
- [ ] On workspace open, user sees 1-3 relevant insights without asking
- [ ] Insights are actionable (not just "your spending went up" but "your dining spend is 90% over budget — here's the breakdown")
- [ ] User can dismiss or act on insights

### Phase 5 — Multi-workspace
- [ ] "Total cash across all accounts" works across 2+ workspaces
- [ ] Complex scenario modeling produces comparative analysis
- [ ] Conversation context carries useful information from prior sessions

---

## What This Enables (the product vision)

When all 5 phases are complete, A4 is:

1. **A personal CFO** that knows everything about your money and speaks plainly
2. **A financial workspace that builds itself** — describe what you need, it appears
3. **A document intelligence layer** — every PDF, CSV, and statement becomes queryable knowledge
4. **A proactive watchdog** — catches problems before they become expensive
5. **A planning partner** — models scenarios, compares options, recommends actions

No other product does all of these in a single integrated environment. Mint tracks spending. Excel does calculations. ChatGPT gives generic advice. A4 does all three, grounded in the user's actual data, on a visual canvas they control.

That's the product.
