# A4 — AI Pipeline: Phase 4 Detailed Build Plan (Proactive Intelligence)

> **Created:** 2026-03-16
> **Status:** Complete — all BU-01 through BU-09 done
> **Prerequisite:** Phase 3 complete — document embedding, vector search, citations, OCR tuning all working.
> **Architecture reference:** [A4_AI_PIPELINE.md](./A4_AI_PIPELINE.md) — read this first for the full system design, SSE protocol, tool definitions, and privacy model. This document does not repeat that information; it breaks Phase 4 into executable build units.

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

## Phase 4 goal

The AI stops waiting for questions and starts noticing things. Paige detects notable patterns in the user's financial data — budget overspends, low cash, upcoming debt deadlines, portfolio drift — and surfaces them as dismissible insight cards. Users can tap an insight to start a conversation with full context already loaded.

---

## Dependency graph

```
BU-01  workspace_insights table + shared schemas
  │
  ├──→ BU-02  Insight detection engine (7 analyzers)
  │      │
  │      └──→ BU-03  Insights tRPC router
  │             │
  │             ├──→ BU-04  Generation trigger (workspace open)
  │             │      │
  │             │      └──→ BU-05  Frontend hooks + InsightsPanel
  │             │             │
  │             │             ├──→ BU-06  Chat integration (click-to-converse)
  │             │             │
  │             │             └──→ BU-08  Relevance scoring + engagement tracking
  │             │
  │             └──→ BU-07  AI context enhancement
  │
  └──→ (used by BU-03)

Parallel-safe groups:
  - BU-06 + BU-07 + BU-08 can run in parallel (all depend on BU-05 or BU-03, no overlap)
```

---

## BU-01 — `workspace_insights` table + shared schemas

**Goal:** Add the `workspace_insights` table and Zod schemas so insights can be persisted, validated, and shared between server and client.

**Inputs:** None (Phase 3 complete)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add `workspaceInsights` table
- `packages/shared-schemas/src/insights.ts` — new file: Zod schemas for insights
- `packages/shared-schemas/src/index.ts` — re-export insights schemas
- `apps/server/src/__tests__/insights-table.test.ts` — new test file
- `packages/shared-schemas/src/__tests__/insights-schemas.test.ts` — new test file

**Description:**

Add `workspaceInsights` table to `schema.ts`, following the exact patterns established by existing tables (text PK with UUID, integer timestamps with `mode: 'timestamp'`, `$defaultFn(() => new Date())`):

- `id`: text PK (UUID)
- `workspaceId`: text NOT NULL — logical FK to `workspaces.id`
- `userId`: text NOT NULL — owner
- `type`: text NOT NULL — one of the 7 insight types (see below)
- `severity`: text NOT NULL — `'info'` | `'warning'` | `'critical'`
- `title`: text NOT NULL — short human-readable headline (e.g., "Dining budget 40% over")
- `summary`: text NOT NULL — 1-2 sentence explanation with specific numbers
- `data`: text, nullable — JSON string of type-specific structured data (threshold values, amounts, percentages, related entity IDs). Nullable because some insights are purely textual.
- `status`: text NOT NULL, default `'active'` — `'active'` | `'dismissed'` | `'engaged'`
- `conversationId`: text, nullable — FK to `conversations.id`, set when user engages (clicks to chat about this insight)
- `createdAt`: integer timestamp NOT NULL with default
- `expiresAt`: integer timestamp, nullable — auto-expire stale insights (e.g., budget insights expire at month end)

The 7 insight types (stored as text, validated by Zod enum):
1. `budget_overspend` — a budget category's actual spending exceeds its budgeted amount
2. `low_cash` — total liquid account balances fall below a threshold
3. `debt_deadline` — a debt payment due date is approaching (within 7 days)
4. `portfolio_drift` — a holding's actual allocation deviates from target by >5%
5. `networth_change` — significant change in net worth over rolling 30-day window
6. `subscription_spike` — monthly subscription total increased significantly since last check
7. `high_spending_category` — one category accounts for >40% of total spending

Create `packages/shared-schemas/src/insights.ts`:

`insightTypeSchema` — `z.enum(...)` with all 7 types

`insightSeveritySchema` — `z.enum(['info', 'warning', 'critical'])`

`insightStatusSchema` — `z.enum(['active', 'dismissed', 'engaged'])`

`insightSchema` — full insight object matching the DB columns, with `z.coerce.date()` for timestamps, `z.string().uuid()` for IDs

`createInsightSchema` — input schema for creating an insight (server-side only, no `id`/`createdAt`)

`insightDataSchemas` — a record of type-specific data shapes:
- `budget_overspend`: `{ categoryName: string, budgeted: number, actual: number, percentOver: number }`
- `low_cash`: `{ totalLiquid: number, threshold: number, lowestAccount: string, lowestBalance: number }`
- `debt_deadline`: `{ debtName: string, amountDue: number, dueDate: string, daysUntilDue: number }`
- `portfolio_drift`: `{ holdingName: string, targetPercent: number, actualPercent: number, driftPercent: number }`
- `networth_change`: `{ previousNetworth: number, currentNetworth: number, changePercent: number, periodDays: number }`
- `subscription_spike`: `{ previousMonthly: number, currentMonthly: number, changePercent: number, newSubscriptions: string[] }`
- `high_spending_category`: `{ categoryName: string, categoryTotal: number, totalSpending: number, percentOfTotal: number }`

`listInsightsInputSchema` — input for list query: `{ workspaceId, status?, type?, severity? }` — all filters optional

`dismissInsightInputSchema` — `{ id: string }`

`engageInsightInputSchema` — `{ id: string }` — marks as engaged, returns the insight with its data for chat injection

Decisions already made:
- No formal SQLite foreign keys — matches every other table in the codebase.
- `data` column is JSON text (not blob) — small payloads, human-readable, easy to query in tests.
- `conversationId` is nullable — only set after engagement. This links the insight to the conversation it spawned.
- `expiresAt` is nullable — not all insight types expire. Budget insights expire at month end; portfolio drift insights persist until resolved.
- Status is a simple state machine: `active` → `dismissed` (user swiped away) or `active` → `engaged` (user clicked to chat).

Edge cases:
- Duplicate insights: the engine checks for existing active insights of the same type + same data signature before creating a new one (handled in BU-02).
- Expired insights are filtered out on read, not deleted — historical record preserved.

**Tests:**

File: `apps/server/src/__tests__/insights-table.test.ts` (new)

Follow the exact pattern in `chat-tables.test.ts`: in-memory SQLite via `better-sqlite3`, manual `CREATE TABLE` SQL in `beforeEach`, Drizzle ORM wrapper.

```
describe('workspaceInsights table')
  beforeEach — create fresh in-memory DB with workspaceInsights table

  it('inserts and retrieves an insight with all fields')
    - Insert insight with all fields populated including data JSON string
    - Select by id
    - Assert all fields match: id, workspaceId, userId, type, severity, title, summary, data, status, createdAt, expiresAt
    - Parse data JSON, assert matches original object

  it('filters insights by workspace')
    - Insert 2 insights for workspace-A, 1 for workspace-B
    - Select where workspaceId='workspace-A'
    - Assert exactly 2 results

  it('filters insights by status')
    - Insert 3 insights: 1 active, 1 dismissed, 1 engaged
    - Select where status='active'
    - Assert exactly 1 result

  it('filters insights by type')
    - Insert insights of different types
    - Select where type='budget_overspend'
    - Assert only matching insights returned

  it('updates insight status to dismissed')
    - Insert active insight
    - Update status to 'dismissed' where id matches
    - Select by id → assert status is 'dismissed'

  it('updates insight status to engaged with conversationId')
    - Insert active insight
    - Update status to 'engaged', set conversationId to a UUID
    - Select by id → assert status is 'engaged', conversationId matches

  it('handles null data column')
    - Insert insight with data=null
    - Select by id → assert data is null

  it('handles null expiresAt')
    - Insert insight with expiresAt=null
    - Select by id → assert expiresAt is null

  it('orders insights by createdAt descending')
    - Insert 3 insights with staggered createdAt values
    - Select all ordered by createdAt DESC
    - Assert first result has the latest createdAt
```

File: `packages/shared-schemas/src/__tests__/insights-schemas.test.ts` (new)

```
describe('insightTypeSchema')
  it('validates all 7 insight types')
    - Parse each of: 'budget_overspend', 'low_cash', 'debt_deadline', 'portfolio_drift', 'networth_change', 'subscription_spike', 'high_spending_category'
    - Assert all succeed

  it('rejects invalid insight type')
    - Parse 'invalid_type'
    - Assert failure

describe('insightSeveritySchema')
  it('validates info, warning, critical')
  it('rejects unknown severity')

describe('insightStatusSchema')
  it('validates active, dismissed, engaged')
  it('rejects unknown status')

describe('insightSchema')
  it('validates a complete insight object')
    - Parse a full insight object with all fields
    - Assert success, all fields preserved

  it('coerces date strings to Date objects')
    - Parse with createdAt as ISO string
    - Assert createdAt is a Date instance

  it('allows null data and expiresAt')
    - Parse with data=null, expiresAt=null
    - Assert success

describe('insightDataSchemas')
  it('validates budget_overspend data')
    - Parse { categoryName: 'Dining', budgeted: 500, actual: 700, percentOver: 40 }
    - Assert success

  it('validates low_cash data')
    - Parse { totalLiquid: 250, threshold: 500, lowestAccount: 'Checking', lowestBalance: 120 }
    - Assert success

  it('validates all 7 data schemas with valid data')
    - One parse per type, all succeed

describe('listInsightsInputSchema')
  it('validates with only workspaceId')
    - Parse { workspaceId: 'ws-123' }
    - Assert success

  it('validates with all optional filters')
    - Parse { workspaceId: 'ws-123', status: 'active', type: 'low_cash', severity: 'warning' }
    - Assert success

describe('dismissInsightInputSchema')
  it('validates with id')
  it('rejects missing id')

describe('engageInsightInputSchema')
  it('validates with id')
  it('rejects missing id')
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/insights-table.test.ts` — all tests pass
- `pnpm vitest run packages/shared-schemas/src/__tests__/insights-schemas.test.ts` — all tests pass
- `pnpm typecheck` — no type errors across the monorepo

---

## BU-02 — Insight detection engine (7 analyzers)

**Goal:** Create the server-side engine that scans workspace data and produces insight candidates by applying threshold logic to existing financial tables.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/insight-engine.ts` — new file: detection engine with 7 analyzers
- `apps/server/src/__tests__/insight-engine.test.ts` — new test file

**Description:**

Create `insight-engine.ts` with a single top-level export:

`generateInsights(db: DB, userId: string, workspaceId: string): Promise<InsightCandidate[]>`

This function runs all 7 analyzers in parallel using `Promise.all`, collects their results, deduplicates against existing active insights in the DB, and returns only net-new candidates (not yet persisted — BU-03's router handles persistence).

Each analyzer is a private function with the signature:

`analyze_*(db: DB, userId: string, workspaceId: string): Promise<InsightCandidate[]>`

Where `InsightCandidate` is:
```
{
  type: InsightType,
  severity: InsightSeverity,
  title: string,
  summary: string,
  data: Record<string, unknown> | null,
  expiresAt: Date | null,
  dedupeKey: string,  // unique key to prevent duplicate insights
}
```

The `dedupeKey` is a stable string derived from the insight's type + key data point (e.g., `budget_overspend:Dining` or `debt_deadline:car-loan-id`). Before returning, `generateInsights` queries existing active insights for this workspace and filters out any candidate whose `dedupeKey` matches an active insight's type + data signature.

**Analyzer 1: `analyzeBudgetOverspend`**

Query: select all budget categories for the workspace (from `budgetCategories` + `budgetEntries` tables). For each category, sum actual entries vs. budgeted amount.

Threshold logic:
- If actual > budgeted: generate insight
- Severity: `percentOver >= 50` → `'critical'`, `percentOver >= 20` → `'warning'`, else `'info'`
- Title: `"{categoryName} budget {percentOver}% over"`
- Summary: `"You've spent ${actual} against a ${budgeted} budget for {categoryName}. That's ${actual - budgeted} over."`
- Data: `{ categoryName, budgeted, actual, percentOver }`
- ExpiresAt: end of current month (budget periods are monthly)
- DedupeKey: `budget_overspend:{categoryId}`

**Analyzer 2: `analyzeLowCash`**

Query: select all accounts where `type` is `'checking'` or `'savings'` for this workspace (from `accounts` table). Sum all balances.

Threshold logic:
- If total liquid < 500: generate insight (single insight, not per-account)
- Severity: `totalLiquid < 100` → `'critical'`, `totalLiquid < 500` → `'warning'`
- Title: `"Cash reserves at ${totalLiquid}"`
- Summary: `"Your combined checking + savings balance is ${totalLiquid}. Your lowest account is {lowestAccount} at ${lowestBalance}."`
- Data: `{ totalLiquid, threshold: 500, lowestAccount, lowestBalance }`
- ExpiresAt: null (persists until resolved)
- DedupeKey: `low_cash:workspace`

Edge case: skip if no checking/savings accounts exist (user hasn't set up accounts).

**Analyzer 3: `analyzeDebtDeadline`**

Query: select all debts for this workspace (from `debts` table). Check each debt's `dueDate` field.

Threshold logic:
- If `dueDate` is within the next 7 days: generate insight
- Severity: `daysUntilDue <= 2` → `'critical'`, `daysUntilDue <= 7` → `'warning'`
- Title: `"{debtName} payment due in {daysUntilDue} days"`
- Summary: `"${amountDue} is due for {debtName} on {dueDate formatted}. Consider preparing funds."`
- Data: `{ debtName, amountDue, dueDate, daysUntilDue }`
- ExpiresAt: the due date itself
- DedupeKey: `debt_deadline:{debtId}`

Edge case: debts without a `dueDate` field or with a null `dueDate` are skipped. Past-due debts (daysUntilDue < 0) are not flagged here — that's a different concern.

**Analyzer 4: `analyzePortfolioDrift`**

Query: select all holdings for this workspace (from `holdings` table). For each holding that has a `targetAllocation`, compute actual allocation as `holdingValue / totalPortfolioValue * 100`.

Threshold logic:
- If `|actualPercent - targetPercent| > 5`: generate insight
- Severity: `|drift| > 15` → `'critical'`, `|drift| > 5` → `'warning'`
- Title: `"{holdingName} drifted {driftPercent}% from target"`
- Summary: `"{holdingName} is at {actualPercent}% vs. target {targetPercent}%. Consider rebalancing."`
- Data: `{ holdingName, targetPercent, actualPercent, driftPercent }`
- ExpiresAt: null (persists until rebalanced)
- DedupeKey: `portfolio_drift:{holdingId}`

Edge case: holdings without `targetAllocation` are skipped. If total portfolio value is 0 or there are no holdings, skip entirely.

**Analyzer 5: `analyzeNetworthChange`**

Query: select the two most recent `networthEntries` for this workspace, ordered by `date` descending. Compare the latest to the previous entry.

Threshold logic:
- If `|changePercent| > 10`: generate insight
- Severity: `changePercent < -20` → `'critical'` (big drop), `|changePercent| > 10` → `'info'` (notable change either direction)
- Title: `"Net worth {direction} {|changePercent|}% this month"` where direction is "up" or "down"
- Summary: `"Your net worth changed from ${previous} to ${current}, a {changePercent}% {direction} over {periodDays} days."`
- Data: `{ previousNetworth, currentNetworth, changePercent, periodDays }`
- ExpiresAt: null
- DedupeKey: `networth_change:latest`

Edge case: fewer than 2 entries → skip (nothing to compare). Entries must be at least 7 days apart to avoid noise from rapid data entry.

**Analyzer 6: `analyzeSubscriptionSpike`**

Query: select all active subscriptions for this workspace (from `subscriptions` table where `status = 'active'`). Sum monthly costs. Compare to a stored baseline.

The baseline is the most recent `subscription_spike` insight's data (if any) — extract `currentMonthly` from the previous insight's data as the baseline. If no previous insight exists, treat the current total as the baseline (no insight generated on first run).

Threshold logic:
- If `changePercent > 15` (15% increase): generate insight
- Severity: `changePercent > 50` → `'warning'`, `changePercent > 15` → `'info'`
- Title: `"Subscription costs up {changePercent}%"`
- Summary: `"Monthly subscriptions went from ${previous}/mo to ${current}/mo. New additions: {newSubscriptions joined by comma}."`
- Data: `{ previousMonthly, currentMonthly, changePercent, newSubscriptions }`
- ExpiresAt: end of current month
- DedupeKey: `subscription_spike:monthly`

Edge case: normalizing billing cycles — subscriptions with `billingCycle = 'yearly'` should be divided by 12 for monthly comparison. Subscriptions with `billingCycle = 'weekly'` should be multiplied by 4.33.

**Analyzer 7: `analyzeHighSpendingCategory`**

Query: select all budget entries for this workspace grouped by category. Sum spending per category and compute total spending across all categories.

Threshold logic:
- If any single category accounts for > 40% of total spending: generate insight
- Severity: `percentOfTotal > 60` → `'warning'`, `percentOfTotal > 40` → `'info'`
- Title: `"{categoryName} is {percentOfTotal}% of all spending"`
- Summary: `"You've spent ${categoryTotal} on {categoryName} out of ${totalSpending} total. This category dominates your spending."`
- Data: `{ categoryName, categoryTotal, totalSpending, percentOfTotal }`
- ExpiresAt: end of current month
- DedupeKey: `high_spending_category:{categoryId}`

Edge case: if total spending is 0 or there's only one category, skip.

**Deduplication logic in `generateInsights`:**

After all 7 analyzers run:
1. Query `workspaceInsights` where `workspaceId` matches and `status = 'active'`
2. Build a Set of existing dedupeKeys: for each active insight, reconstruct the dedupeKey from `type` + key identifier in `data` JSON
3. Filter candidates: only keep candidates whose `dedupeKey` is NOT in the existing set
4. Return the filtered list

This means the same insight won't be created twice while it's still active. Once dismissed, a new occurrence can be generated.

Decisions already made:
- All analyzers run in parallel — no dependencies between them.
- Analyzers return candidates, not persisted records — the router (BU-03) handles insert.
- Thresholds are hardcoded constants, not user-configurable (MVP). Future phases can add preference settings.
- Deduplication is key-based, not content-based — prevents the same logical insight from appearing repeatedly.

**Tests:**

File: `apps/server/src/__tests__/insight-engine.test.ts` (new)

Use in-memory SQLite with all required tables (accounts, budgetCategories, budgetEntries, debts, holdings, networthCategories, networthEntries, subscriptions, workspaceInsights). Seed data before each test.

```
describe('analyzeBudgetOverspend')
  it('generates critical insight when spending is 50%+ over budget')
    - Seed: category "Dining" with budgeted=500, entries totaling 800 (60% over)
    - Run analyzer → expect 1 insight with type='budget_overspend', severity='critical'
    - Assert title contains 'Dining' and '60%'
    - Assert data.percentOver === 60

  it('generates warning insight when spending is 20-49% over')
    - Seed: category with entries 30% over
    - Assert severity='warning'

  it('generates info insight when spending is 1-19% over')
    - Seed: category with entries 10% over
    - Assert severity='info'

  it('skips categories that are under budget')
    - Seed: category with entries under budget
    - Assert 0 insights

  it('handles multiple over-budget categories')
    - Seed: 3 categories, 2 over budget
    - Assert 2 insights returned

describe('analyzeLowCash')
  it('generates critical insight when total liquid < 100')
    - Seed: checking=$50, savings=$30
    - Assert severity='critical', data.totalLiquid===80

  it('generates warning insight when total liquid 100-499')
    - Seed: checking=$200, savings=$150
    - Assert severity='warning'

  it('skips when total liquid >= 500')
    - Seed: checking=$1000
    - Assert 0 insights

  it('skips when no checking/savings accounts exist')
    - Seed: no accounts (or only investment accounts)
    - Assert 0 insights

describe('analyzeDebtDeadline')
  it('generates critical insight when due in 2 days')
    - Seed: debt with dueDate = today + 2 days
    - Assert severity='critical', data.daysUntilDue===2

  it('generates warning insight when due in 3-7 days')
    - Seed: debt with dueDate = today + 5 days
    - Assert severity='warning'

  it('skips debts due in 8+ days')
    - Seed: debt with dueDate = today + 10 days
    - Assert 0 insights

  it('skips debts with null dueDate')
    - Seed: debt without dueDate
    - Assert 0 insights

  it('skips past-due debts')
    - Seed: debt with dueDate = yesterday
    - Assert 0 insights

describe('analyzePortfolioDrift')
  it('generates warning for >5% drift')
    - Seed: holding with targetAllocation=30, actual value makes it 22% (8% drift)
    - Assert severity='warning', data.driftPercent close to 8

  it('generates critical for >15% drift')
    - Seed: holding drifted 20%
    - Assert severity='critical'

  it('skips holdings without targetAllocation')
    - Seed: holding with no target
    - Assert 0 insights

  it('skips when portfolio value is 0')
    - Seed: holdings with 0 value
    - Assert 0 insights

describe('analyzeNetworthChange')
  it('generates info insight for >10% increase')
    - Seed: 2 networth entries, latest 15% higher
    - Assert severity='info', title contains 'up'

  it('generates critical insight for >20% decrease')
    - Seed: 2 entries, latest 25% lower
    - Assert severity='critical', title contains 'down'

  it('skips when change is <10%')
    - Seed: 2 entries, 5% change
    - Assert 0 insights

  it('skips when fewer than 2 entries')
    - Seed: 1 entry
    - Assert 0 insights

  it('skips when entries are less than 7 days apart')
    - Seed: 2 entries 3 days apart
    - Assert 0 insights

describe('analyzeSubscriptionSpike')
  it('generates info insight for 15-50% increase')
    - Seed: active subscriptions totaling $100/mo, previous insight baseline=$80/mo
    - Assert severity='info', data.changePercent===25

  it('generates warning for >50% increase')
    - Seed: subs=$200/mo, baseline=$100/mo
    - Assert severity='warning'

  it('normalizes yearly subscriptions to monthly')
    - Seed: 1 yearly sub at $120/yr, baseline=$5/mo
    - Assert currentMonthly===10

  it('skips on first run (no baseline)')
    - Seed: active subs, no previous insight
    - Assert 0 insights

describe('analyzeHighSpendingCategory')
  it('generates info insight when category is 40-60% of total')
    - Seed: cat-A=$500, cat-B=$300, cat-C=$200 (A is 50%)
    - Assert severity='info', data.percentOfTotal===50

  it('generates warning when category is >60% of total')
    - Seed: cat-A=$800, cat-B=$100, cat-C=$100 (A is 80%)
    - Assert severity='warning'

  it('skips when no category exceeds 40%')
    - Seed: evenly distributed spending
    - Assert 0 insights

  it('skips when total spending is 0')
    - Assert 0 insights

describe('generateInsights — deduplication')
  it('filters out insights that already exist as active')
    - Seed: existing active insight with type='low_cash'
    - Run generateInsights → expect low_cash to be filtered out
    - Other types that fired should still be returned

  it('allows regeneration after dismissal')
    - Seed: existing dismissed insight with type='low_cash'
    - Run generateInsights → expect low_cash candidate IS returned (dismissed != active)

  it('runs all 7 analyzers in parallel')
    - Seed: data that triggers at least one insight per analyzer type
    - Assert result contains insights of multiple types
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/insight-engine.test.ts` — all tests pass
- `pnpm typecheck` — no type errors across the monorepo

---

## BU-03 — Insights tRPC router

**Goal:** Expose insight CRUD operations through a tRPC router with workspace-scoped, authenticated procedures.

**Inputs:** BU-01, BU-02

**Creates / Modifies:**
- `apps/server/src/trpc/routers/insights.ts` — new file: tRPC router
- `apps/server/src/trpc/router.ts` — register insights router
- `apps/server/src/__tests__/insights-router.test.ts` — new test file

**Description:**

Create `insights.ts` router following the exact pattern in `chat.ts` (protectedProcedure, workspace-scoped, TRPCError for not-found).

**Procedure 1: `list`**

Input: `listInsightsInputSchema` (workspaceId required, status/type/severity optional filters)

Query: select from `workspaceInsights` where userId matches `ctx.userId` and workspaceId matches input. Apply optional filters with `and(...)`. Filter out expired insights: `expiresAt IS NULL OR expiresAt > now`. Order by severity priority (`critical` first, then `warning`, then `info`) then by `createdAt` descending.

Severity ordering: use a SQL `CASE` expression or sort in JS after query. Since insight counts are small (< 50 per workspace), JS sorting is fine:
```
const severityOrder = { critical: 0, warning: 1, info: 2 };
results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.createdAt - a.createdAt);
```

Return: array of insight objects with parsed `data` (JSON.parse if non-null).

**Procedure 2: `dismiss`**

Input: `dismissInsightInputSchema` (id)

Query: update `workspaceInsights` set `status = 'dismissed'` where `id` matches AND `userId` matches `ctx.userId`.

If no rows updated: throw `TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' })`.

Return: `{ success: true }`

**Procedure 3: `engage`**

Input: `engageInsightInputSchema` (id)

Steps:
1. Select the insight by id + userId
2. If not found: throw NOT_FOUND
3. If already engaged: return existing { insightId, conversationId }
4. Create a new conversation via `db.insert(conversations)` with title set to the insight's title
5. Update the insight: set `status = 'engaged'`, `conversationId = newConversationId`
6. Return `{ insightId, conversationId, insight }` — the client uses conversationId to open the chat panel

**Procedure 4: `generate`**

Input: `z.object({ workspaceId: z.string().uuid() })`

Steps:
1. Call `generateInsights(db, ctx.userId, input.workspaceId)` from the insight engine
2. For each returned candidate, insert into `workspaceInsights` with `status = 'active'`
3. Return `{ generated: candidates.length }` — how many new insights were created

This procedure is called from the client on workspace open (BU-04) and can also be triggered manually.

**Procedure 5: `getUnreadCount`**

Input: `z.object({ workspaceId: z.string().uuid() })`

Query: count from `workspaceInsights` where `workspaceId` matches, `userId` matches, `status = 'active'`, and not expired.

Return: `{ count: number }`

Decisions already made:
- `engage` creates a conversation automatically — one-click flow from insight to chat.
- `generate` is idempotent thanks to the deduplication in the engine. Calling it multiple times won't create duplicate insights.
- `list` returns parsed `data` objects — the client doesn't need to JSON.parse.
- No pagination on `list` — insight counts are naturally bounded (7 types × a handful of categories = < 50 max). If this becomes a problem, add cursor pagination later.

**Tests:**

File: `apps/server/src/__tests__/insights-router.test.ts` (new)

Follow the exact pattern in `chat-router.test.ts`: create a test caller via `createCallerFactory`, use in-memory DB.

```
describe('insights.list')
  it('returns active insights for workspace, ordered by severity then date')
    - Seed: 3 insights (1 critical, 1 warning, 1 info)
    - Call list({ workspaceId })
    - Assert order: critical first, then warning, then info

  it('filters by status')
    - Seed: 2 active, 1 dismissed
    - Call list({ workspaceId, status: 'active' })
    - Assert 2 results

  it('filters by type')
    - Seed: insights of different types
    - Call list({ workspaceId, type: 'low_cash' })
    - Assert only low_cash insights returned

  it('excludes expired insights')
    - Seed: 1 active with expiresAt in the past, 1 active with expiresAt in the future
    - Call list({ workspaceId })
    - Assert only the non-expired insight returned

  it('returns parsed data objects')
    - Seed: insight with data='{"categoryName":"Dining","budgeted":500}'
    - Call list → assert data is an object, not a string

  it('returns empty array when no insights')
    - Call list for workspace with no insights
    - Assert empty array

  it('scopes to authenticated user')
    - Seed: insight for user-A, insight for user-B
    - Call list as user-A → assert only user-A's insight returned

describe('insights.dismiss')
  it('updates status to dismissed')
    - Seed: active insight
    - Call dismiss({ id })
    - Query DB → assert status='dismissed'

  it('throws NOT_FOUND for non-existent insight')
    - Call dismiss({ id: 'fake-id' })
    - Assert TRPCError with code NOT_FOUND

  it('throws NOT_FOUND for another user\'s insight')
    - Seed: insight for user-B
    - Call dismiss as user-A
    - Assert NOT_FOUND

describe('insights.engage')
  it('creates conversation and updates insight status')
    - Seed: active insight
    - Call engage({ id })
    - Assert response has conversationId
    - Query DB: insight status='engaged', conversationId matches
    - Query DB: conversation exists with title matching insight title

  it('returns existing conversation if already engaged')
    - Seed: already engaged insight with conversationId
    - Call engage({ id })
    - Assert same conversationId returned (not a new one)

  it('throws NOT_FOUND for non-existent insight')
    - Call engage({ id: 'fake-id' })
    - Assert NOT_FOUND

describe('insights.generate')
  it('creates new insights from engine results')
    - Seed: workspace data that triggers at least 1 insight (e.g., low cash)
    - Call generate({ workspaceId })
    - Assert { generated: N } where N > 0
    - Query DB: N new active insights exist

  it('is idempotent — second call generates 0 if no data changed')
    - Call generate twice
    - Assert second call returns { generated: 0 }

describe('insights.getUnreadCount')
  it('returns count of active non-expired insights')
    - Seed: 3 active (1 expired), 1 dismissed
    - Call getUnreadCount({ workspaceId })
    - Assert { count: 2 }

  it('returns 0 when no active insights')
    - Call getUnreadCount for empty workspace
    - Assert { count: 0 }
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/insights-router.test.ts` — all tests pass
- `pnpm typecheck` — no type errors across the monorepo

---

## BU-04 — Generation trigger (workspace open)

**Goal:** Trigger insight generation when a user opens a workspace, with staleness-based debouncing to avoid unnecessary computation.

**Inputs:** BU-03

**Creates / Modifies:**
- `apps/web/src/hooks/useInsights.ts` — new file (initial version — generation trigger + unread count)
- `apps/server/src/trpc/routers/insights.ts` — add `getLastGeneratedAt` procedure
- `apps/server/src/db/schema.ts` — add `insightMetadata` table (or use workspace-level metadata)

**Description:**

The trigger flow:

1. User navigates to a workspace → workspace detail page mounts
2. `useInsights({ workspaceId })` hook initializes
3. Hook calls `insights.getLastGeneratedAt({ workspaceId })` — returns the timestamp of the most recent `workspaceInsights` row for this workspace (or null if no insights have ever been generated)
4. If `lastGeneratedAt` is null or older than 1 hour: call `insights.generate({ workspaceId })` mutation
5. After generation completes: invalidate `insights.list` and `insights.getUnreadCount` queries

**Staleness check — no new table needed.** Instead of a separate metadata table, derive `lastGeneratedAt` from the `workspaceInsights` table itself:

Add `getLastGeneratedAt` procedure to the insights router:
- Input: `{ workspaceId: string }`
- Query: `SELECT MAX(createdAt) FROM workspaceInsights WHERE workspaceId = ? AND userId = ?`
- Return: `{ lastGeneratedAt: Date | null }`

This avoids a new table. If insights were generated 30 minutes ago, the most recent insight's `createdAt` will be ~30 minutes old → no regeneration. If the user dismissed all insights and comes back in 2 hours, `lastGeneratedAt` will be the last-dismissed insight's `createdAt` (still > 1 hour ago) → regeneration happens.

**Client-side debouncing:**

In `useInsights`, use a `useEffect` that runs once when the hook mounts (or when `workspaceId` changes):

1. Fetch `lastGeneratedAt`
2. Compute `isFresh = lastGeneratedAt && (Date.now() - lastGeneratedAt.getTime() < 60 * 60 * 1000)`
3. If not fresh: call `generateMutation.mutateAsync({ workspaceId })`
4. On success: invalidate relevant queries
5. Wrap in a try/catch — generation failure is silent (doesn't block workspace usage)

The hook also returns `unreadCount` from `insights.getUnreadCount` — used by the UI to show a badge.

Edge cases:
- Rapid workspace switching: if the user opens workspace A then immediately switches to workspace B, the generation for A may still be in flight. Use `AbortController` or simply ignore the result — the mutation is idempotent, so a stale response won't cause harm.
- First-ever workspace: `lastGeneratedAt` is null → generation runs. If the workspace has no financial data, all analyzers return 0 insights → `{ generated: 0 }`. That's fine.
- Generation while typing: generation runs in the background and doesn't block the UI. The `generate` mutation is debounced by the staleness check, so it won't run on every render.

Decisions already made:
- 1-hour staleness window is hardcoded (MVP). Future: user-configurable refresh interval.
- No WebSocket/push for real-time updates — polling on workspace open is sufficient for MVP.
- Generation errors are swallowed — insights are supplementary, never blocking.

**Tests:**

No new test file for the client hook — it's tested via E2E in BU-09. The server-side `getLastGeneratedAt` procedure is tested in the insights router test file.

Extend `apps/server/src/__tests__/insights-router.test.ts`:

```
describe('insights.getLastGeneratedAt')
  it('returns null when no insights exist')
    - Call getLastGeneratedAt({ workspaceId })
    - Assert { lastGeneratedAt: null }

  it('returns the most recent insight createdAt')
    - Seed: 3 insights with staggered createdAt
    - Call getLastGeneratedAt({ workspaceId })
    - Assert lastGeneratedAt matches the newest insight's createdAt
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/insights-router.test.ts` — all tests pass (including new getLastGeneratedAt tests)
- `pnpm typecheck` — no type errors
- Manual test: open a workspace with financial data → check server logs for `generate` call → verify it doesn't fire again within 1 hour on page reload

---

## BU-05 — Frontend hooks + InsightsPanel

**Goal:** Build the `useInsights` hook (complete version) and a slide-out InsightsPanel that shows active insights grouped by severity, plus a badge count on the panel toggle button.

**Inputs:** BU-04

**Creates / Modifies:**
- `apps/web/src/hooks/useInsights.ts` — extend with list query, dismiss/engage mutations, panel state
- `apps/web/src/components/canvas/insights-panel.tsx` — new file: slide-out panel UI
- `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` — add InsightsPanel, badge count on toggle
- `apps/web/src/components/canvas/chat-panel.tsx` — minor: add insight badge to the AI panel toggle area

**Description:**

**Extend `useInsights` hook:**

The hook now exposes:
- `insights` — the full list of active insights from `insights.list`, auto-refreshed
- `unreadCount` — count of active non-expired insights (from `insights.getUnreadCount`)
- `isGenerating` — whether `generate` mutation is in flight
- `dismissInsight(id)` — calls `insights.dismiss`, optimistically removes from local list, invalidates queries
- `engageInsight(id)` — calls `insights.engage`, returns `{ conversationId }`, invalidates queries
- `isPanelOpen` / `setIsPanelOpen` — local state for the slide-out panel visibility

Query setup:
- `insights.list({ workspaceId, status: 'active' })` — refetch on window focus, staleTime 5 minutes
- `insights.getUnreadCount({ workspaceId })` — refetch on window focus, staleTime 1 minute
- Both queries are invalidated after `generate`, `dismiss`, and `engage` mutations

Optimistic updates on `dismiss`:
- Before the mutation resolves, remove the insight from the local query cache
- On error, roll back (revert the optimistic removal via `queryClient.setQueryData`)

**InsightsPanel component:**

A slide-out panel (similar to chat panel) anchored to the right side of the workspace. It overlays the canvas without pushing content.

Layout:
- Fixed position, full height, 380px wide (matches chat panel width)
- Header: "Insights" title + close button + insight count badge
- Body: scrollable list of insight cards grouped by severity
- Footer: none (insights are read-only in this panel)

Severity grouping:
- Three collapsible sections: "Critical", "Warning", "Info"
- Each section has a severity icon and count
- Critical: red accent (`text-destructive`), alert-triangle icon
- Warning: amber accent (`text-amber-500`), alert-circle icon
- Info: blue accent (`text-primary`), info icon
- Sections with 0 insights are hidden
- Default: all sections expanded

Individual insight card:
- Card wrapper: `bg-card border-border/60 rounded-lg p-4 shadow-sm`
- Title: `text-sm font-semibold text-foreground`
- Summary: `text-xs text-muted-foreground mt-1`
- Two action buttons at bottom:
  - "Dismiss" — muted, small, left-aligned. Calls `dismissInsight(id)`. Card fades out with 200ms transition.
  - "Ask Paige" — primary small button, right-aligned. Calls `engageInsight(id)` which opens chat (handled in BU-06).
- Timestamp: `text-[10px] text-muted-foreground` relative time (e.g., "2h ago") in top-right corner
- Type indicator: small colored dot or tag showing the insight type in human-readable form

Animations:
- Panel slides in from right with 200ms ease-out
- Panel slides out to right with 150ms ease-in
- Insight dismissal: card height collapses with 200ms transition
- Use CSS transitions, not animation libraries

**Badge on panel toggle:**

In the workspace page, the AI panel area has toggle buttons (Chat, Tools). Add an "Insights" toggle or badge:

Option A (preferred): Add a small notification badge (red dot with count) on the existing AI chat toggle button area. Clicking the badge opens the InsightsPanel. This keeps the UI minimal.

Option B: Add a third toggle button "Insights" next to "Chat" and "Tools". This is more discoverable but takes more space.

Go with Option A for MVP: a small badge count on the chat toggle area. The InsightsPanel opens as a separate overlay, independent of the chat/tools panel.

Implementation in `page.tsx`:
- Import `useInsights` hook, `InsightsPanel` component
- Add a clickable badge near the AI panel toggle: if `unreadCount > 0`, show a small red circle with the count
- Clicking the badge calls `setIsPanelOpen(true)`
- The `InsightsPanel` renders conditionally when `isPanelOpen`

Edge cases:
- Panel open + chat panel open: InsightsPanel overlays on top of (or beside) the chat panel. For MVP, opening InsightsPanel closes the chat panel and vice versa.
- Zero insights: show an empty state in the panel: "No insights right now. Paige will notify you when something needs attention." with a soft illustration or icon.
- Insights loading: show skeleton cards (3 placeholder cards with shimmer animation).

Decisions already made:
- InsightsPanel is a separate component from ChatPanel — they share similar slide-out behavior but different content.
- Severity colors use semantic tokens from the design system — no hardcoded hex values.
- Dismiss is optimistic — faster UX, rollback on error.
- Panel width matches chat panel (380px) for visual consistency.

**Tests:**

No new test files — tested via E2E in BU-09. Component tests would be shallow and fragile for this UI-heavy component.

**Verification:**
- `pnpm typecheck` — no type errors
- `pnpm build` — builds successfully
- Manual test:
  1. Open a workspace with financial data that triggers insights (e.g., a budget category over budget)
  2. Verify badge count appears on the toggle area
  3. Click badge → InsightsPanel slides in from right
  4. Verify insights are grouped by severity (critical first)
  5. Click "Dismiss" on an insight → card fades out, badge count decreases
  6. Close panel → panel slides out
  7. Reopen → dismissed insight is gone
  8. Toggle dark mode → verify all colors render correctly
  9. Open InsightsPanel, then open ChatPanel → verify one closes when the other opens

---

## BU-06 — Chat integration (click-to-converse)

**Goal:** When a user clicks "Ask Paige" on an insight, open the chat panel with a pre-filled context message that gives Paige full awareness of the insight.

**Inputs:** BU-05

**Creates / Modifies:**
- `apps/web/src/hooks/useInsights.ts` — extend engage flow to open chat panel
- `apps/web/src/hooks/useChat.ts` — add `startFromInsight` method
- `apps/web/src/components/canvas/chat-panel.tsx` — display insight context banner
- `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` — wire engage → chat panel open

**Description:**

**Flow when user clicks "Ask Paige" on an insight:**

1. `useInsights.engageInsight(id)` is called
2. Router returns `{ insightId, conversationId, insight }` (from BU-03's `engage` procedure)
3. The hook calls a callback (passed from page.tsx) that:
   a. Closes the InsightsPanel
   b. Opens the ChatPanel
   c. Sets the active conversation to `conversationId`
   d. Injects the insight context into the chat

**Insight context injection:**

The `engage` procedure already created a conversation titled with the insight's title. Now we need to send an initial message that gives Paige context about the insight.

Add a `startFromInsight` method to `useChat`:

```
startFromInsight(conversationId: string, insight: Insight): void
```

This method:
1. Sets `activeConversationId = conversationId`
2. Sends an automatic first user message with a special format:

```
[Insight context: {insight.type}]

{insight.summary}

Insight data:
- {key}: {value} for each field in insight.data

Help me understand this and what I should do about it.
```

3. The message is sent via the normal `sendMessage` flow — it goes through the SSE stream, Paige responds with full workspace context + this insight context.

The user sees:
- Chat panel opens
- Their "question" appears (the auto-generated context message)
- Paige starts streaming a response that addresses the insight

**Insight context banner:**

At the top of the chat panel (below the header, above messages), show a small contextual banner when the current conversation was spawned from an insight:

- Banner: `bg-primary/5 border-l-2 border-primary rounded p-3`
- Icon: lightbulb icon (from lucide-react)
- Text: `text-xs text-muted-foreground` — "This conversation started from an insight: {insight.title}"
- Dismissible: small X button to hide the banner (local state only, doesn't affect the insight)

To determine if the current conversation is insight-spawned: check if any insight in the insights list has `conversationId === activeConversationId`. If so, show the banner.

**Page.tsx wiring:**

In the workspace detail page:
- Pass an `onEngageInsight` callback to InsightsPanel
- The callback: closes InsightsPanel, opens chat panel, calls `useChat.startFromInsight(conversationId, insight)`
- Panel state management: `activeSidePanel: 'chat' | 'tools' | 'insights' | null` — only one side panel open at a time

Edge cases:
- Already engaged insight: if the user clicks "Ask Paige" on an already-engaged insight, the router returns the existing conversation. `startFromInsight` detects that the conversation already has messages and doesn't send the context message again — it just opens the existing conversation.
- Insight from previous session: if the user had engaged an insight in a previous session and comes back, the conversation persists. The banner still shows if the insight→conversation link exists.
- Network error during engage: show error toast, don't close InsightsPanel.

Decisions already made:
- The initial message is a real user message (not a system message) — keeps the conversation natural and auditable.
- The banner is informational only — it doesn't affect Paige's behavior (Paige gets context from the workspace context builder in BU-07).
- Only one side panel at a time — simpler UX.

**Tests:**

No new test files — tested via E2E in BU-09.

**Verification:**
- `pnpm typecheck` — no type errors
- `pnpm build` — builds successfully
- Manual test:
  1. Open workspace with active insights
  2. Open InsightsPanel → click "Ask Paige" on an insight
  3. Verify: InsightsPanel closes, ChatPanel opens, conversation is created
  4. Verify: auto-generated context message appears as user message
  5. Verify: Paige streams a response addressing the insight
  6. Verify: insight context banner appears at top of chat
  7. Verify: the insight in InsightsPanel now shows as "engaged" (if reopened)
  8. Verify: clicking "Ask Paige" on the same insight again opens the existing conversation (no duplicate)

---

## BU-07 — AI context enhancement

**Goal:** Add active insights to the workspace context that Paige receives, so the AI can proactively reference insights in any conversation — not just insight-spawned ones.

**Inputs:** BU-03

**Creates / Modifies:**
- `apps/server/src/services/ai-context.ts` — add `buildInsightsSection`
- `apps/server/src/__tests__/ai-context.test.ts` — extend with insights context tests

**Description:**

Add a new section builder to `buildWorkspaceContext`:

`buildInsightsSection(db: DB, userId: string, workspaceId: string): Promise<string>`

This function:
1. Queries `workspaceInsights` where `status = 'active'` and not expired
2. If 0 active insights: return empty string (section omitted from context)
3. Format as a markdown section:

```
## Active financial insights

The following insights have been automatically detected in this workspace. You may reference these proactively in your responses when relevant:

### Critical
- **{title}**: {summary}
- **{title}**: {summary}

### Warning
- **{title}**: {summary}

### Info
- **{title}**: {summary}
```

4. Only include severity headings that have insights (skip empty groups)

Add the builder to the `Promise.all` array in `buildWorkspaceContext`, alongside the existing section builders (accounts, budget, networth, etc.).

**Prompt engineering:**

Add a line to the system preamble about insights awareness:

> "You have access to automatically detected financial insights. When an insight is relevant to the user's question, reference it naturally. For insight-spawned conversations, lead with analysis of the specific insight. Do not repeat the insight verbatim — add value by explaining implications, suggesting actions, or running calculations."

This goes in the `SYSTEM_PREAMBLE` constant, after the existing capabilities list.

**Context budget:**

Active insights are typically small (< 500 tokens total for all active insights in a workspace). No budget clamping needed — they fit comfortably within the context alongside other sections.

Decisions already made:
- Only `active` insights are injected — dismissed and engaged insights are excluded. This keeps the context relevant and fresh.
- Expired insights are excluded (same filter as `insights.list`).
- No insight `data` objects in the context — just title + summary. The data is for the frontend; Paige gets the narrative summary.
- Insights section is ordered after Canvas Items section in the context — it's supplementary, not primary data.

**Tests:**

Extend `apps/server/src/__tests__/ai-context.test.ts`:

```
describe('buildInsightsSection')
  it('returns formatted insights grouped by severity')
    - Seed: 1 critical + 2 warning + 1 info active insights
    - Call buildInsightsSection
    - Assert output contains '## Active financial insights'
    - Assert output contains '### Critical' with 1 bullet
    - Assert output contains '### Warning' with 2 bullets
    - Assert output contains '### Info' with 1 bullet

  it('returns empty string when no active insights')
    - No insights seeded
    - Assert returns ''

  it('excludes dismissed insights')
    - Seed: 1 active, 1 dismissed
    - Assert output contains only the active insight

  it('excludes expired insights')
    - Seed: 1 active (non-expired), 1 active (expired)
    - Assert output contains only the non-expired insight

  it('omits severity headings with zero insights')
    - Seed: 2 warning insights only
    - Assert output does NOT contain '### Critical' or '### Info'
    - Assert output contains '### Warning'

describe('buildWorkspaceContext — with insights')
  it('includes insights section in full context')
    - Seed: workspace + 1 active insight
    - Call buildWorkspaceContext
    - Assert returned string contains '## Active financial insights'

  it('omits insights section when none active')
    - Seed: workspace with no insights
    - Call buildWorkspaceContext
    - Assert returned string does NOT contain '## Active financial insights'
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-context.test.ts` — all tests pass (including new insight context tests)
- `pnpm typecheck` — no type errors
- Manual test:
  1. Open workspace with active insights
  2. Start a new (non-insight-spawned) conversation
  3. Ask "what should I be paying attention to?"
  4. Verify: Paige references the active insights in her response
  5. Dismiss all insights → ask the same question → Paige should not reference insights

---

## BU-08 — Relevance scoring + engagement tracking

**Goal:** Score insights by relevance so the most important ones appear first, and track engagement patterns to improve future generation quality.

**Inputs:** BU-05

**Creates / Modifies:**
- `apps/server/src/services/insight-engine.ts` — add `scoreInsight` function, add engagement-aware thresholds
- `apps/server/src/trpc/routers/insights.ts` — modify `list` to sort by score, add `getEngagementStats` procedure
- `apps/server/src/__tests__/insight-engine.test.ts` — extend with scoring tests
- `apps/server/src/__tests__/insights-router.test.ts` — extend with engagement stats tests

**Description:**

**Relevance scoring:**

Add a `scoreInsight` function to the insight engine:

`scoreInsight(insight: WorkspaceInsight): number`

The score is a weighted combination of three factors:

1. **Severity weight** (0-1): `critical = 1.0`, `warning = 0.6`, `info = 0.3`
2. **Recency weight** (0-1): `1.0 - (ageInHours / 168)` clamped to [0, 1]. Insights lose relevance linearly over 7 days (168 hours). Brand new = 1.0, 7+ days old = 0.0.
3. **Data confidence weight** (0-1): based on how much underlying data exists:
   - `budget_overspend`: 1.0 if budget has >5 entries, 0.5 otherwise (more entries = more confident)
   - `low_cash`: 1.0 (always confident — account balances are definitive)
   - `debt_deadline`: 1.0 (due dates are definitive)
   - `portfolio_drift`: 0.8 if holdings have market data, 0.5 if manual-only
   - `networth_change`: 0.7 (derived from user-entered data, less reliable)
   - `subscription_spike`: 0.6 (depends on user keeping subscriptions up to date)
   - `high_spending_category`: 0.8 if >10 entries, 0.4 otherwise

Final score: `severity * 0.5 + recency * 0.3 + confidence * 0.2`

This gives severity the most weight (critical always floats up), with recency as secondary (stale insights sink), and data confidence as a tiebreaker.

**Sort by score in `list` procedure:**

Replace the current severity+date sort with score-based sort:
1. Compute `scoreInsight(insight)` for each result
2. Sort descending by score
3. Attach `relevanceScore` to each returned insight (for potential UI use)

**Engagement tracking:**

Add `getEngagementStats` procedure to the insights router:

Input: `z.object({ workspaceId: z.string().uuid() })`

Query: aggregate from `workspaceInsights` for this workspace + user:
- Total insights generated (all statuses)
- Total dismissed
- Total engaged
- Engagement rate by type: for each insight type, compute `engaged / (engaged + dismissed)` ratio
- Most engaged type (highest ratio)
- Most dismissed type (highest dismiss ratio)

Return:
```
{
  total: number,
  dismissed: number,
  engaged: number,
  engagementRate: number,  // overall engaged / (engaged + dismissed)
  byType: Record<InsightType, { generated: number, dismissed: number, engaged: number, rate: number }>
}
```

**Engagement-aware threshold tuning:**

In the insight engine, after deduplication, apply a simple heuristic to filter out insight types that the user consistently dismisses:

1. Query engagement stats for this workspace
2. For each candidate type: if the user has dismissed > 5 insights of this type AND the engagement rate for this type is < 0.1 (less than 10%), skip generating insights of this type
3. This is a simple suppression mechanism — not ML, just a threshold

Implementation: add an optional `engagementStats` parameter to `generateInsights` (fetched once before running analyzers, passed to each analyzer or used as a post-filter).

Decisions already made:
- Scoring is deterministic and lightweight — no external API calls, no ML.
- Data confidence weights are hardcoded per type (MVP). Future: derive from actual data counts at query time.
- Engagement suppression requires > 5 dismissals to activate — avoids premature suppression from a few early dismissals.
- Stats are workspace-scoped — different workspaces can have different engagement patterns.
- `relevanceScore` is returned to the client but not currently displayed — it's used for sorting only. Future: could show as a visual indicator.

**Tests:**

Extend `apps/server/src/__tests__/insight-engine.test.ts`:

```
describe('scoreInsight')
  it('scores critical + recent + high-confidence highest')
    - Create: critical severity, createdAt=now, type='low_cash' (confidence=1.0)
    - Assert score > 0.9

  it('scores info + old + low-confidence lowest')
    - Create: info severity, createdAt=8 days ago, type='subscription_spike' (confidence=0.6)
    - Assert score < 0.3

  it('recency weight decays linearly over 7 days')
    - Create 2 insights: same severity/type, one from 1 hour ago, one from 100 hours ago
    - Assert newer has higher score

  it('severity dominates score')
    - Create 2 insights: critical+old vs info+new
    - Assert critical still scores higher (severity weight is 0.5 of total)

  it('clamps recency weight at 0 for insights older than 7 days')
    - Create insight from 10 days ago
    - Assert recency component is 0 (score only from severity + confidence)

describe('engagement-aware suppression')
  it('suppresses insight type with >5 dismissals and <10% engagement')
    - Seed: 8 dismissed low_cash insights, 0 engaged
    - Run generateInsights with data that would trigger low_cash
    - Assert low_cash is NOT in results

  it('does not suppress type with <5 total dismissals')
    - Seed: 3 dismissed low_cash, 0 engaged
    - Assert low_cash IS in results (not enough data to suppress)

  it('does not suppress type with >10% engagement rate')
    - Seed: 6 dismissed, 2 engaged (25% rate)
    - Assert type IS in results
```

Extend `apps/server/src/__tests__/insights-router.test.ts`:

```
describe('insights.getEngagementStats')
  it('returns aggregate stats for workspace')
    - Seed: 5 insights (2 engaged, 2 dismissed, 1 active)
    - Call getEngagementStats
    - Assert total=5, engaged=2, dismissed=2, engagementRate=0.5

  it('returns per-type breakdown')
    - Seed: 3 budget_overspend (2 dismissed, 1 engaged), 2 low_cash (1 engaged, 1 active)
    - Assert byType.budget_overspend.rate ≈ 0.33
    - Assert byType.low_cash.rate ≈ 1.0

  it('returns zeros for workspace with no insights')
    - Assert total=0, engagementRate=0

describe('insights.list — score-based ordering')
  it('returns insights sorted by relevance score descending')
    - Seed: 3 insights with different severities and ages
    - Call list → assert first result has highest score
    - Assert each result has a relevanceScore field
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/insight-engine.test.ts` — all tests pass (including scoring + suppression tests)
- `pnpm vitest run apps/server/src/__tests__/insights-router.test.ts` — all tests pass (including engagement stats)
- `pnpm typecheck` — no type errors
- Manual test:
  1. Generate insights for a workspace
  2. Dismiss several insights of the same type
  3. Regenerate → verify dismissed types are still generated (under suppression threshold)
  4. Dismiss more → exceed threshold → regenerate → verify that type is suppressed

---

## BU-09 — E2E tests + polish

**Goal:** Full end-to-end test coverage for the insights flow and final UI polish across both themes.

**Inputs:** BU-05, BU-06, BU-07, BU-08

**Creates / Modifies:**
- `apps/web/e2e/insights.spec.ts` — new file: E2E tests
- `apps/web/src/components/canvas/insights-panel.tsx` — polish
- `apps/web/src/components/canvas/chat-panel.tsx` — polish insight context banner

**Description:**

**E2E test coverage:**

Create `apps/web/e2e/insights.spec.ts` following the exact pattern in `chat.spec.ts` and `chat-rag.spec.ts`: setup/teardown helpers, workspace creation via API, Playwright page navigation.

Test scenarios:

1. **Insight generation on workspace open**
   - Create workspace with financial data that triggers insights (seed budget data with overspend)
   - Navigate to workspace
   - Wait for insights badge to appear on the panel toggle
   - Assert badge count > 0

2. **View insights in panel**
   - Open InsightsPanel by clicking the badge
   - Assert panel slides in
   - Assert insights are visible, grouped by severity
   - Assert each insight has a title, summary, "Dismiss" button, and "Ask Paige" button

3. **Dismiss an insight**
   - Open InsightsPanel
   - Count initial insights
   - Click "Dismiss" on one insight
   - Assert insight card fades out
   - Assert badge count decreases by 1
   - Close and reopen panel → assert dismissed insight is gone

4. **Engage an insight (click-to-converse)**
   - Open InsightsPanel
   - Click "Ask Paige" on an insight
   - Assert InsightsPanel closes
   - Assert ChatPanel opens
   - Assert context message appears as user message
   - Assert Paige starts streaming a response (mock SSE for deterministic test)
   - Assert insight context banner appears at top of chat

5. **Re-engage same insight opens existing conversation**
   - After engaging an insight, close chat panel
   - Open InsightsPanel → click "Ask Paige" on the same insight
   - Assert same conversation opens (check conversation title matches)
   - Assert no duplicate context message

6. **Empty state**
   - Create workspace with no financial data
   - Navigate to workspace
   - Open InsightsPanel (via direct action, since badge may not show)
   - Assert empty state message: "No insights right now"

7. **Insights in AI context**
   - Create workspace with data triggering insights
   - Navigate to workspace, wait for insights to generate
   - Open ChatPanel (not via insight), ask "what should I focus on?"
   - Mock SSE response that references insights
   - Assert response mentions insight-related topics

8. **Dark mode rendering**
   - Toggle to dark mode
   - Open InsightsPanel
   - Assert severity colors render correctly (visual regression test via screenshot comparison, or simply assert elements are visible)
   - Assert card borders and backgrounds use correct theme tokens

**Mock strategy for E2E:**

For insight generation, seed the workspace with specific financial data via tRPC API calls in test setup:
- Create a workspace
- Add a budget category with entries that exceed the budget (triggers `budget_overspend`)
- Add accounts with low balances (triggers `low_cash`)
- Navigate to workspace → insights auto-generate

For chat streaming (test 4), mock the SSE endpoint the same way as `chat.spec.ts`:
```
await page.route('**/api/chat/stream', async (route) => {
  // Return mocked SSE with insight-aware response
});
```

**UI polish checklist:**

Review and refine across both themes:

1. **InsightsPanel transitions**: slide-in/out should feel smooth, not janky. Test on 60fps monitor.
2. **Severity colors**: critical (red), warning (amber), info (blue) should have sufficient contrast in both themes. Use semantic tokens (`text-destructive`, custom amber and blue tokens from the design system).
3. **Insight cards**: padding, border-radius, spacing should match the card-view design system (`rounded-lg`, `p-4`, `shadow-sm`).
4. **Dismiss animation**: card should collapse smoothly (height transition), not disappear abruptly.
5. **Badge**: red circle with white text, positioned as a floating badge (absolute positioning over the toggle button). Should match common notification badge patterns.
6. **Empty state**: centered text with a muted icon, consistent with other empty states in the app.
7. **Responsive**: panel should work at minimum canvas width. If the canvas is too narrow, panel should overlay fully.
8. **Insight context banner in chat**: should be subtle, not distracting. Light background, thin left border, small text. Matches the semantic color of the insight's severity.
9. **Keyboard accessibility**: panel can be closed with Escape key. Insights can be dismissed/engaged with keyboard (tab + Enter).

Decisions already made:
- E2E tests mock SSE at the network level — same as Phase 1-3.
- Dark mode testing uses visual assertion (elements visible) not pixel-perfect screenshots (too brittle).
- Polish is iterative — get the tests passing first, then refine visuals.

**Tests:**

File: `apps/web/e2e/insights.spec.ts` (new)

```
describe('Insights — end to end')
  beforeAll — create workspace with financial data that triggers insights

  afterAll — delete workspace

  test('insight generation on workspace open')
    - Navigate to workspace
    - Wait for badge to appear (poll with retry)
    - Assert badge count > 0

  test('view insights in panel')
    - Click badge → panel opens
    - Assert at least 1 insight card visible
    - Assert card has title, summary, Dismiss button, Ask Paige button

  test('dismiss an insight')
    - Open panel
    - Get initial count
    - Click Dismiss on first insight
    - Wait for card to disappear
    - Assert count decreased

  test('engage an insight — opens chat with context')
    - Open panel
    - Click 'Ask Paige' on first insight
    - Assert InsightsPanel not visible
    - Assert ChatPanel visible
    - Assert context message in chat (contains insight summary text)
    - Mock SSE → assert streamed response appears

  test('re-engage same insight — opens existing conversation')
    - Close chat panel
    - Open insights panel
    - Click 'Ask Paige' on the same (now engaged) insight
    - Assert same conversation title
    - Assert no new context message (only original)

  test('empty state when no insights')
    - Create new workspace with no financial data
    - Navigate to it
    - Open insights panel
    - Assert 'No insights right now' text visible
    - Cleanup: delete workspace

  test('dark mode rendering')
    - Toggle dark mode
    - Open insights panel
    - Assert insight cards are visible
    - Assert severity sections are visible
    - Toggle back to light mode
```

**Verification:**
- `pnpm exec playwright test apps/web/e2e/insights.spec.ts` — all tests pass
- `pnpm typecheck` — no type errors
- `pnpm build` — builds successfully
- Manual dark mode check: toggle dark mode, verify InsightsPanel + badge + insight cards render correctly
- Manual responsiveness check: resize window to minimum width, verify panel overlays correctly
- Manual keyboard check: Tab through insights, dismiss/engage with keyboard

---

## File index

Summary of all files created or modified across Phase 4:

| File | Action | Build Units |
|------|--------|-------------|
| `apps/server/src/db/schema.ts` | Modify | BU-01 |
| `apps/server/src/services/insight-engine.ts` | Create | BU-02, BU-08 |
| `apps/server/src/services/ai-context.ts` | Modify | BU-07 |
| `apps/server/src/trpc/routers/insights.ts` | Create | BU-03, BU-04, BU-08 |
| `apps/server/src/trpc/router.ts` | Modify | BU-03 |
| `packages/shared-schemas/src/insights.ts` | Create | BU-01 |
| `packages/shared-schemas/src/index.ts` | Modify | BU-01 |
| `apps/web/src/hooks/useInsights.ts` | Create | BU-04, BU-05, BU-06 |
| `apps/web/src/hooks/useChat.ts` | Modify | BU-06 |
| `apps/web/src/components/canvas/insights-panel.tsx` | Create | BU-05, BU-09 |
| `apps/web/src/components/canvas/chat-panel.tsx` | Modify | BU-05, BU-06, BU-09 |
| `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` | Modify | BU-05, BU-06 |
| `apps/server/src/__tests__/insights-table.test.ts` | Create | BU-01 |
| `apps/server/src/__tests__/insight-engine.test.ts` | Create | BU-02, BU-08 |
| `apps/server/src/__tests__/insights-router.test.ts` | Create | BU-03, BU-04, BU-08 |
| `apps/server/src/__tests__/ai-context.test.ts` | Modify | BU-07 |
| `packages/shared-schemas/src/__tests__/insights-schemas.test.ts` | Create | BU-01 |
| `apps/web/e2e/insights.spec.ts` | Create | BU-09 |

**Total: 10 files created, 8 files modified**

---

## Phase 4 completion checklist

All of these must be true when BU-01 through BU-09 are complete:

- [x] **BU-01** — `workspaceInsights` table exists in schema.ts with all columns; Zod schemas cover insight types, severities, statuses, and type-specific data shapes; table and schema tests pass
- [x] **BU-02** — 7 analyzers detect budget overspend, low cash, debt deadline, portfolio drift, networth change, subscription spike, and high spending category; deduplication prevents duplicate active insights; engine tests pass
- [x] **BU-03** — Insights router has 5 procedures (list, dismiss, engage, generate, getUnreadCount); engage creates a conversation automatically; generate is idempotent; router tests pass
- [x] **BU-04** — Insight generation triggers on workspace open with 1-hour staleness check; no unnecessary regeneration on rapid reloads; getLastGeneratedAt tests pass
- [x] **BU-05** — InsightsPanel slides in/out with severity-grouped insight cards; badge count shows on panel toggle; dismiss is optimistic with rollback; empty state handled; builds successfully
- [x] **BU-06** — Clicking "Ask Paige" closes InsightsPanel, opens ChatPanel, creates conversation, sends context message, Paige responds with insight awareness; re-engage opens existing conversation; builds successfully
- [x] **BU-07** — Active insights injected into workspace context; Paige references insights proactively in conversations; dismissed/expired insights excluded; context tests pass
- [x] **BU-08** — Relevance scoring sorts insights by severity × recency × confidence; engagement stats track dismiss/engage ratios; insight types with >5 dismissals and <10% engagement are suppressed; scoring and stats tests pass
- [x] **BU-09** — E2E tests cover generate → view → dismiss → engage → chat → re-engage → empty state → dark mode; InsightsPanel polished for both themes; keyboard accessible

**Phase 4 success criteria:**
- [x] Open a workspace with over-budget spending → insight badge appears within 5 seconds
- [x] InsightsPanel shows insights grouped by severity (critical first)
- [x] Dismiss an insight → it disappears and doesn't return until data changes
- [x] Click "Ask Paige" on an insight → chat opens with context, Paige addresses the specific issue
- [x] Ask Paige "what should I focus on?" in a normal chat → response references active insights
- [x] Dismiss many insights of one type → that type stops generating (engagement suppression)
- [x] Insights regenerate on workspace open after 1+ hour gap
- [x] `pnpm typecheck` passes across entire monorepo
- [x] `pnpm test` — all unit tests pass (except pre-existing auto-position.test.ts failure)
- [x] `pnpm exec playwright test` — all E2E tests pass (16 total: 9 chat + 7 insights)
- [x] `pnpm build` — both apps build successfully
