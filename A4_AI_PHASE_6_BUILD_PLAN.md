# A4 — AI Pipeline: Phase 6 Detailed Build Plan (Document Intelligence: Hybrid Search, Entity Graph, Visual Retrieval, BYOK/MCP)

> **Created:** 2026-07-27
> **Status:** ✅ PHASE 6 COMPLETE (2026-07-27) — all 14 build units across sub-phases A–E shipped. Visual retrieval (D) is presence-gated on `VOYAGE_API_KEY` (Voyage `voyage-multimodal-3`). Still deferred: page thumbnails on document-node (page-level data now exists via `pageEmbeddings`; wire-up is a small follow-up) and the E2E extension (suite blocked on product routes being unplugged for early-access).
> **Prerequisite:** Phases 1–5 complete — chat, 35 tools, RAG with citations, insight engine, cross-workspace reasoning all working.
> **Origin:** Competitive analysis of Webb (thewebb.io). Webb's stack is ingestion → hybrid BM25+vector retrieval → entity resolution graph → investigation canvas → cited AI answers. A4 already has ingestion, semantic retrieval, citations, and a superior canvas. This phase closes the retrieval and entity gaps — adapted for finance, where our version is *stronger* than Webb's because entities can link across both documents AND structured financial tables (reconciliation).
> **Architecture reference:** [A4_AI_PIPELINE.md](./A4_AI_PIPELINE.md) — read first for SSE protocol, tool registry, and context assembly. This doc breaks Phase 6 into executable build units.

---

## How to use this document

Each **build unit (BU)** is one coding session's worth of work. They are ordered by dependency — you cannot start a unit until its listed inputs are complete. Within a session:

1. Read the BU description top to bottom
2. Create/modify the listed files
3. Run the listed tests — all must pass before moving on
4. Run the verification checks
5. Mark the BU done in the completion checklist at the bottom

**No code in this document.** All code decisions happen in coding sessions. This doc tells you *what* to build and *how to know it's correct*, not *how to write it*.

---

## Phase 6 goal

Paige finds anything — by exact string, by meaning, or by picture — and understands *who and what* appears across every document and every financial table. Search fuses keyword + semantic signals. An entity graph links "AMZN Mktp US" on a statement PDF to the Amazon rows in `transactions` to the Amazon `subscriptions` card. Unmatched statement lines surface as reconciliation candidates. Users can bring their own API keys, and external agents can drive A4 via MCP.

**Sub-phases** (shippable independently, in this order):

| Sub-phase | BUs | Outcome |
|---|---|---|
| **A. Hybrid retrieval** | BU-01, BU-02 | Exact-match + semantic search fused per query |
| **B. Entity graph** | BU-03 → BU-08 | Extraction, resolution, cross-linking, reconciliation, AI tools |
| **C. Canvas integration** | BU-09, BU-10 | Entity cards, document nodes, draggable citations |
| **D. Visual retrieval** | BU-11, BU-12 | Page-image embeddings; find scanned tables/charts by description |
| **E. BYOK + MCP** | BU-13, BU-14 | User-supplied API keys; A4 tools exposed as an MCP server |

---

## Dependency graph

```
BU-01  FTS5 keyword index
  │
  └──→ BU-02  RRF fusion + search_documents upgrade
             (Sub-phase A ships here)

BU-03  Background job queue                ← prerequisite for everything below
  │
  ├──→ BU-04  Entity tables + shared schemas
  │      │
  │      ├──→ BU-05  Extraction pass in ingestion pipeline
  │      │      │
  │      │      └──→ BU-06  Entity resolution engine
  │      │             │
  │      │             ├──→ BU-07  Structured-data cross-linking + reconciliation
  │      │             │      │
  │      │             │      └──→ BU-08  Entity AI tools
  │      │             │             (Sub-phase B ships here)
  │      │             │
  │      │             └──→ BU-09  entity-card canvas item
  │      │                    │
  │      │                    └──→ BU-10  document-node + draggable citations
  │      │                           (Sub-phase C ships here)
  │      │
  │      └──→ BU-11  Page rendering + image embeddings
  │             │
  │             └──→ BU-12  Visual signal in hybrid search
  │                    (Sub-phase D ships here)
  │
  └──→ BU-13  BYOK key storage + provider routing
         │
         └──→ BU-14  MCP server
                (Sub-phase E ships here)

Parallel-safe groups:
  - Sub-phase A is independent of everything — start immediately
  - BU-09/BU-10 (canvas) parallel with BU-11/BU-12 (visual)
  - BU-13/BU-14 (BYOK/MCP) parallel with all of B/C/D after BU-03
```

---

## Sub-phase A — Hybrid retrieval

### BU-01 — FTS5 keyword index over document chunks

**Goal:** Every document chunk is searchable by exact keyword/phrase via SQLite FTS5, kept in sync with `documentChunks` automatically.

**Inputs:** None (Phase 3 complete)

**Creates / Modifies:**
- `apps/server/src/db/index.ts` — create `document_chunks_fts` FTS5 virtual table + sync triggers on startup (idempotent `CREATE VIRTUAL TABLE IF NOT EXISTS`)
- `apps/server/src/services/keyword-search.ts` — new: `keywordSearchChunks(workspaceId, userId, query, limit)` returning `{ chunkId, score }[]` (BM25 rank from FTS5)
- `apps/server/src/__tests__/keyword-search.test.ts` — new

**Description:**

Add an FTS5 virtual table indexing `documentChunks.content`, with `chunkId` as unindexed column for joins. Keep it in sync via SQLite triggers (`AFTER INSERT/UPDATE/DELETE` on `document_chunks`) rather than application code — the embedding pipeline and file-deletion paths then need zero changes.

Decisions already made:
- **Triggers, not application-level dual writes** — one sync mechanism, no drift, no pipeline edits.
- **FTS5 with `unicode61` tokenizer, `remove_diacritics 2`** — good default for financial docs; no stemming (exact numbers and codes matter more than morphology).
- Query sanitization: escape FTS5 special characters (`"`, `*`, `-`, `^`) from user/AI queries; wrap terms in double quotes to force literal matching. A malformed query must degrade to zero results, never throw.
- Scoring: FTS5's built-in `bm25()` (lower = better); normalize to 0–1 by rank position before returning, so BU-02's fusion doesn't care about raw BM25 magnitudes.
- Workspace/user scoping happens by joining back to `document_chunks` — FTS table itself stores only content + chunkId.
- **Postgres note:** when the Neon migration happens ([A4_SHIP_TO_PRODUCTION.md](./A4_SHIP_TO_PRODUCTION.md) Phase 2), this becomes a `tsvector` column + GIN index. `keyword-search.ts` is the only file that changes.

Edge cases:
- Existing DBs with pre-existing chunks: on startup, if FTS table was just created, backfill from `document_chunks` in one `INSERT ... SELECT`.
- `:memory:` test DBs get the same setup path — triggers created in the shared test bootstrap.

**Tests:**

File: `apps/server/src/__tests__/keyword-search.test.ts` (new). In-memory SQLite pattern per existing table tests.

```
describe('keyword search')
  it('finds a chunk by exact phrase') — insert 3 chunks, search a phrase unique to one, assert single hit
  it('finds exact numeric strings') — chunk containing "$4,251.03", search "4,251.03", assert hit (this is the whole point of Sub-phase A)
  it('scopes results by workspaceId and userId') — same term in two workspaces, assert only scoped hit returned
  it('stays in sync on chunk delete') — delete chunk row, search again, assert zero hits (trigger fired)
  it('stays in sync on chunk insert after table creation') — insert post-setup, assert findable
  it('degrades gracefully on FTS special characters') — search "co-op \"quoted\" term*", assert no throw
  it('backfills existing chunks on first creation') — insert chunks before FTS setup, run setup, assert findable
```

**Verification:** Upload a PDF with a distinctive invoice number in dev; query the new service directly (temporary script or test); confirm hit. Run full server test suite — zero regressions in embedding-pipeline tests.

---

### BU-02 — Reciprocal Rank Fusion + `search_documents` upgrade

**Goal:** `search_documents` fires keyword + semantic signals in parallel and fuses them; exact-string queries and conceptual queries both return the right chunks with no tool-signature change.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/vector-search.ts` — add `hybridSearchChunks(...)`: run existing cosine search + `keywordSearchChunks` concurrently, fuse via RRF
- `apps/server/src/services/ai-tools.ts` — `search_documents` executor calls `hybridSearchChunks`; tool description updated to mention exact-match capability
- `apps/server/src/__tests__/hybrid-search.test.ts` — new

**Description:**

Standard RRF: `score(chunk) = Σ 1/(k + rank_i)` with `k = 60`, over the two ranked lists. Take top N (keep the current `search_documents` limit). Citations flow through unchanged — hybrid results reuse the existing citation shape (fileId, fileName, chunkContent, score), with RRF score in place of cosine score.

Decisions already made:
- **RRF over weighted score blending** — rank-based fusion needs no score normalization across incompatible scales (cosine vs BM25) and is the industry default.
- Fetch top 20 from each signal before fusing, return top N after.
- If `OPENAI_API_KEY` missing (semantic side unavailable), hybrid degrades to keyword-only — strictly better than today's behavior of no search at all.
- Chunks found by only one signal still rank (single-list RRF contribution); appearing in both is a strong boost.

**Tests:**

File: `apps/server/src/__tests__/hybrid-search.test.ts` (new). Mock the embedding call (existing pattern in vector-search tests).

```
describe('hybrid search')
  it('ranks a chunk found by both signals above single-signal chunks')
  it('returns keyword-only hits that semantic search missed') — exact account number with orthogonal embedding
  it('returns semantic-only hits that keyword search missed') — paraphrase query
  it('degrades to keyword-only when embeddings unavailable')
  it('respects the result limit and workspace scoping')
  it('produces citation-shaped results compatible with the done event schema')
```

**Verification:** In dev chat: (1) ask Paige for an exact dollar amount that appears in an uploaded statement — must cite the right page; (2) ask a conceptual question ("what were the biggest recurring charges?") — semantic results still work. Run chat-rag E2E specs.

---

## Sub-phase B — Entity graph

### BU-03 — Background job queue

**Goal:** Heavy ingestion work (entity extraction, page embeddings) runs asynchronously in a SQLite-backed job queue with retry, without blocking upload requests.

**Inputs:** None

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add `jobs` table: `id`, `type`, `payload` (JSON text), `status` (`pending`/`running`/`done`/`failed`), `attempts`, `maxAttempts` (default 3), `lastError`, `runAfter`, `createdAt`, `updatedAt`
- `apps/server/src/services/job-queue.ts` — new: `enqueueJob(type, payload)`, `registerJobHandler(type, fn)`, worker loop (poll every 2s, claim oldest pending via status-transition UPDATE, run handler, retry with exponential backoff, mark failed after maxAttempts)
- `apps/server/src/index.ts` — start worker loop on boot (disabled when `NODE_ENV=test`)
- `apps/server/src/__tests__/job-queue.test.ts` — new

**Description:**

Deliberately minimal: single-process in-server worker, one job at a time, claim-by-UPDATE (safe under WAL for a single server — which is the deployment reality per [DEPLOY.md](./DEPLOY.md)). No cron, no external deps. Phase 3's embedding pipeline is NOT migrated to the queue in this BU (works fine inline today) — only new Phase 6 work uses it. Migrating embedding into the queue is an optional follow-up.

Decisions already made:
- Poll loop over SQLite notification hacks — simplicity wins at this scale.
- `runAfter` timestamp enables backoff without a scheduler.
- Handlers registered at boot by service modules; unknown job types mark failed immediately with a clear `lastError`.
- Tests drive the worker manually via an exported `processNextJob()` — no timers in tests.

**Tests:**

```
describe('job queue')
  it('enqueues and processes a job through its handler')
  it('retries a failing job with backoff and increments attempts')
  it('marks a job failed after maxAttempts and records lastError')
  it('processes jobs oldest-first')
  it('does not run jobs whose runAfter is in the future')
  it('marks unknown job types failed immediately')
```

**Verification:** Boot dev server, enqueue a test job via a script, watch it complete. Confirm worker loop absent in test env.

---

### BU-04 — Entity tables + shared schemas

**Goal:** The three entity tables exist with Zod schemas as source of truth.

**Inputs:** BU-03 (ordering only; no hard dependency)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add `entities`, `entityMentions`, `entityEdges`
- `packages/shared-schemas/src/entity.ts` — new: `entityTypeSchema`, `entitySchema`, `entityMentionSchema`, `entityEdgeSchema` (+ barrel export)
- `apps/server/src/__tests__/entity-tables.test.ts`, `packages/shared-schemas/src/__tests__/entity-schemas.test.ts` — new

**Description:**

- `entities`: `id`, `workspaceId`, `userId`, `type` (`merchant` | `institution` | `person` | `organization` | `account_ref`), `canonicalName`, `normalizedName` (lowercased/stripped, for dedup lookups), `aliases` (JSON array of strings), `mentionCount` (denormalized), `createdAt`, `updatedAt`
- `entityMentions`: `id`, `entityId`, `workspaceId`, `userId`, `sourceType` (`chunk` | `transaction` | `invoice` | `receipt` | `subscription` | `account`), `sourceId`, `snippet` (text, nullable — surrounding context for chunk mentions), `confidence` (real 0–1), `createdAt`
- `entityEdges`: `id`, `workspaceId`, `userId`, `fromEntityId`, `toEntityId`, `relationship` (free text, e.g. "pays", "subsidiary of", "account at"), `evidence` (JSON array of mention ids), `createdAt`

Decisions already made:
- Follows every existing table convention: text UUID PKs, no formal FKs, denormalized `workspaceId`/`userId` on every table, integer timestamps.
- `normalizedName` has a plain index; uniqueness NOT enforced at DB level (resolution logic owns merging — see BU-06).
- Entities are **workspace-scoped**, matching the workspace-scoped AI context model. Cross-workspace entity queries go through the Phase 5 `query_workspace` machinery, not shared rows.
- `sourceType`/`sourceId` is a polymorphic reference — same pattern as tool results referencing card ids.

**Tests:** Standard table tests (insert/retrieve, workspace scoping, ordering) mirroring `document-chunks-table.test.ts`; schema tests assert parse/reject on each Zod schema including type enum boundaries.

**Verification:** `drizzle-kit push` on a scratch DB; typecheck passes across packages.

---

### BU-05 — Entity extraction pass in the ingestion pipeline

**Goal:** Every newly embedded document gets an entity-extraction job that populates `entities`, `entityMentions`, and `entityEdges` (pre-resolution: one entity per distinct surface form).

**Inputs:** BU-03, BU-04

**Creates / Modifies:**
- `apps/server/src/services/entity-extraction.ts` — new: `extractEntitiesFromFile(fileId)` job handler; per-chunk-batch Claude calls with a strict JSON tool schema; writes raw (unresolved) entities/mentions/edges
- `apps/server/src/services/embedding-pipeline.ts` — after successful embedding, `enqueueJob('extract-entities', { fileId })`
- `apps/server/src/services/anthropic.ts` — ensure a non-streaming structured call path with model override is exposed (may already suffice)
- `apps/server/src/__tests__/entity-extraction.test.ts` — new

**Description:**

Batch 5–8 chunks per Claude call (cost control). Prompt instructs extraction of the five entity types plus explicit relationships, each with confidence; the response is forced through a tool schema (same technique as existing structured calls). Use **Haiku** (`claude-haiku-4-5`) for the bulk pass — this is high-volume, low-difficulty extraction. Each extracted surface form becomes its own entity row at this stage (`canonicalName` = surface form); BU-06 merges them. File deletion must also delete its mentions and any entities left mention-less (extend the existing file-deletion path).

Decisions already made:
- Extraction is per-file and idempotent: re-running deletes that file's prior mentions first.
- Confidence threshold 0.5 — below that, drop the mention.
- Cost is metered through the existing `aiUsage` table with a distinct purpose tag so `billing.getUsage` sees it.
- Failures retry via the queue; a file whose extraction ultimately fails still has working RAG (extraction is additive, never blocking).

**Tests:** Mock the Anthropic call (existing pattern). Cover: entities/mentions/edges written from a mocked response; idempotent re-run; confidence filtering; deletion cascade; malformed model output → job failure (not crash); usage row written.

**Verification:** Upload a statement PDF in dev; watch queue process; inspect `entities` rows for expected merchants.

---

### BU-06 — Entity resolution engine

**Goal:** Duplicate surface forms merge into canonical entities in three tiers: deterministic normalization → embedding similarity → LLM adjudication.

**Inputs:** BU-05

**Creates / Modifies:**
- `apps/server/src/services/entity-resolution.ts` — new: `normalizeMerchantString(raw)` (strip payment-processor noise: `SQ *`, `TST*`, `AMZN Mktp`, trailing store numbers/cities, card suffixes), `resolveEntities(workspaceId)` job handler implementing the three tiers, `mergeEntities(winnerId, loserIds)` (repoint mentions/edges, union aliases, recount)
- `apps/server/src/services/entity-extraction.ts` — enqueue `resolve-entities` for the workspace after each extraction completes
- `apps/server/src/__tests__/entity-resolution.test.ts` — new

**Description:**

- **Tier 1 (deterministic, free):** identical `normalizedName` within workspace+type → merge immediately. The normalizer is a curated rule list — seed it from the patterns in the existing `categorizationRules` feature.
- **Tier 2 (embedding similarity, cheap):** embed canonical names (existing embedding service), pair candidates within type at cosine ≥ 0.90.
- **Tier 3 (LLM adjudication, per-pair):** Tier-2 candidates below auto-merge certainty go to Haiku with sample mention snippets as context: "same real-world entity? yes/no + confidence." Merge on yes ≥ 0.8; otherwise leave separate and record the considered pair in a `rejectedPairs` JSON note on the job payload so the same pair isn't re-adjudicated every run.
- Winner selection: most mentions, ties → longest canonical name (usually most descriptive).

Decisions already made:
- Resolution runs per-workspace, debounced (skip if a resolve job for the workspace is already pending).
- Merges are permanent — no unmerge in this phase. Threshold conservatism (0.90 / 0.8) biases toward under-merging, which is recoverable; over-merging is not.
- Person-type entities require Tier 3 always (never auto-merge people on string similarity alone — "J. Smith" ≠ "John Smith" without evidence).

**Tests:** Cover: normalizer against a fixture list of ~20 real-world messy merchant strings; Tier-1 merge; Tier-2 candidate generation with mocked embeddings; Tier-3 merge and reject paths with mocked LLM; mention/edge repointing and alias union on merge; person-type never auto-merged; debounce.

**Verification:** Dev workspace with a statement upload → confirm "AMZN Mktp US*1234" and "Amazon.com" end up one entity with both aliases.

---

### BU-07 — Structured-data cross-linking + reconciliation

**Goal:** Entities link to rows in `transactions`, `invoices`, `receipts`, `subscriptions`, and `accounts` — enabling "which statement lines have no matching ledger entry?" (reconciliation), which no competitor offers.

**Inputs:** BU-06

**Creates / Modifies:**
- `apps/server/src/services/entity-linking.ts` — new: `linkStructuredData(workspaceId)` job handler — runs the normalizer over structured-row name fields (`transactions.description`, `invoices` counterparty, `receipts` merchant, `subscriptions` name, `accounts` institution), matches against resolved entities, writes `entityMentions` with the appropriate `sourceType`; creates new entities for unmatched structured names (they're first-class too)
- `apps/server/src/services/reconciliation.ts` — new: `findUnmatchedTransactions(workspaceId, fileId?)` — document-mention amounts/dates (regex-extracted from mention snippets at extraction time; extend BU-05 to store `amount`/`date` nullable columns on `entityMentions`) vs `transactions` rows, matched on entity + amount (±$0.01) + date (±3 days); returns both directions of mismatch
- `apps/server/src/db/schema.ts` — add nullable `amount` (real) and `date` (integer) to `entityMentions`
- Relevant routers (`financial`, etc.) — enqueue `link-structured` on bulk transaction import and card CRUD (create/update paths only)
- `apps/server/src/__tests__/entity-linking.test.ts`, `apps/server/src/__tests__/reconciliation.test.ts` — new

**Description:** Linking is deterministic (normalizer + exact normalized match against canonical names and aliases) — no LLM cost. Reconciliation is a pure query over already-written data, cheap enough to run on demand from a tool call (BU-08) rather than as a stored result.

Decisions already made:
- Structured rows are linked via mentions, not FK columns on the financial tables — zero migration risk to the 9 card types.
- Amount/date extraction happens once at extraction time (BU-05 prompt already sees the snippet context); reconciliation never re-reads documents.
- ±3-day window and ±$0.01 tolerance are constants in `reconciliation.ts`, documented for future user-configurability.

**Tests:** Linking: match by canonical name, match by alias, new-entity creation for unmatched, sourceType correctness, idempotency. Reconciliation: exact match suppressed, amount-mismatch surfaces, date-window boundary (3 days inclusive), both mismatch directions, workspace scoping.

**Verification:** Dev: import transactions + upload the corresponding statement; run reconciliation; deliberately delete one transaction; confirm it surfaces as unmatched.

---

### BU-08 — Entity AI tools

**Goal:** Paige can search entities, walk the graph, and run reconciliation — with results citable and linkable.

**Inputs:** BU-07

**Creates / Modifies:**
- `apps/server/src/services/ai-tools.ts` — three new tools (registry grows 35 → 38): `search_entities(query, type?)` — normalized + fuzzy name match, returns entities with mention counts and top sources; `get_entity_connections(entityId, depth)` — edge traversal, depth ≤ 2, capped at 50 nodes; `find_unmatched_transactions(fileId?)` — wraps BU-07 reconciliation
- `apps/server/src/services/ai-context.ts` — workspace context gains a compact "Known entities" line (top ~15 by mention count) so Paige knows the graph exists
- `apps/server/src/__tests__/ai-tools-entities.test.ts` — new; extend the existing tool-registry count assertions

**Description:** Follow the exact existing tool pattern (`safeExecuteTool`, Zod input schemas, workspace/user scoping from context). Tool descriptions must tell the model *when* to reach for entities vs `search_documents` (entity = "who/what across everything"; document search = "find the passage").

**Tests:** Per-tool: happy path, scoping, empty results, depth/size caps, malformed input rejection. Context: entities section present when entities exist, absent otherwise, truncated at limit.

**Verification:** Dev chat: "who do I pay the most?", "show everything connected to Amazon", "reconcile my July statement" — all three tools fire and answer with real data.

---

## Sub-phase C — Canvas integration

### BU-09 — `entity-card` canvas item

**Goal:** Entities are placeable canvas items showing canonical name, type badge, alias list, mention count, and linked-card shortcuts.

**Inputs:** BU-06 (BU-08 recommended)

**Creates / Modifies:** The full 8-step new-item checklist (see memory / prior cards): `canvas-store.ts` defaults, `useCanvasDrop.ts` `ITEM_DEFAULTS`, `entity-card-content.tsx` (preview), `canvas-item-renderer.tsx` branch, tool panel entry, `page.tsx` branches, `entity-card-view.tsx` (tab view: mention list with snippets, edge list, per-sourceType breakdown), `tab-bar.tsx` icon. New tRPC procedures on a new `entity` router (`list`, `get`, `getMentions`, `getConnections`) — register in `router.ts` (21 → 22 routers).

**Description:** Preview answers the 1-second glance question with: entity name + type + mention count + top-3 sources. Card view design system rules apply ([memory/card-view-design-system.md]). Item data stores only `entityId` — content is always fetched live (entities mutate via resolution merges; if the stored entity was merged away, follow to the winner via a `mergedInto` lookup — add nullable `mergedInto` column to `entities` in this BU and set it in `mergeEntities`).

**Tests:** Router tests (scoping, merged-entity redirect); content component renders from mock data (if a web test harness exists for cards — otherwise E2E covers it in BU-10).

**Verification:** Drag entity from tool panel picker onto canvas; open tab view; confirm live data and merge-following.

---

### BU-10 — `document-node` item + draggable citations

**Goal:** A specific document page is placeable on canvas as a node (page thumbnail + highlight snippet), and Paige's citations can be dragged from the chat panel onto the canvas.

**Inputs:** BU-09

**Creates / Modifies:** New-item checklist for `document-node` (data: `fileId`, `page`, `snippet`, `citationIndex?`); preview uses the established offscreen-canvas → blob URL → `<img>` PDF crispness pattern (see memory) — render only the cited page; chat panel citation chips become drag sources (reuse the existing tool-panel drag machinery in `useCanvasDrop.ts`); connections to/from document nodes use existing bezier system unchanged. E2E: extend `chat-rag.spec.ts` — ask a question, drag a citation to canvas, assert node exists with correct file link.

**Description:** Dropping a citation creates a document-node pre-populated from the citation payload (fileId, fileName, chunk snippet). Clicking the node opens the existing file tab view at that page. This is Webb's "pin findings" — implemented in a fraction of their effort because canvas, connections, drag-drop, and the PDF viewer all exist.

**Tests:** Drop-payload → item-data mapping unit test; E2E as above.

**Verification:** Full flow in dev: ask → cite → drag → node on canvas → click-through to source page.

---

## Sub-phase D — Visual retrieval

### BU-11 — Page rendering + image embeddings

**Goal:** Every PDF page gets an image embedding so pages are findable by visual/layout description.

**Inputs:** BU-03, BU-04 (schema conventions)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — `pageEmbeddings`: `id`, `fileId`, `workspaceId`, `userId`, `page`, `embedding` (blob), `createdAt`
- `apps/server/src/services/page-embedding.ts` — new job handler: render each PDF page via mupdf (already a dependency) at modest resolution, embed via a multimodal embedding API, store as Float32Array blob (Phase 3 storage pattern)
- `apps/server/src/env.ts` — key for the chosen provider (Voyage `voyage-multimodal-3` or Cohere `embed-v4`; decide in-session by current pricing — optional env, graceful skip when absent)
- Pipeline: enqueue after embedding completes, PDFs only; delete rows on file deletion
- `apps/server/src/__tests__/page-embedding.test.ts` — new

**Description:** Cost note: this is the most expensive per-document feature in Phase 6 — that's why it's queue-based, optional-by-env, and (per [A4_PRICING.md](./A4_PRICING.md)) a candidate paid-tier gate later. Cap at 200 pages/file initially.

**Tests:** Mocked render + mocked embedding: rows written per page, page cap, deletion cascade, skip-when-no-key, non-PDF skip.

**Verification:** Upload a scanned statement in dev with key set; confirm one row per page.

---

### BU-12 — Visual signal in hybrid search

**Goal:** `search_documents` gains a third signal — text query → multimodal query embedding → cosine over `pageEmbeddings` — fused via the same RRF, with page-level citations.

**Inputs:** BU-02, BU-11

**Creates / Modifies:** `vector-search.ts` (visual search + 3-way RRF; visual hits cite `fileName p.N` with a synthetic snippet like "[matched page 4 visually]"), `ai-tools.ts` (tool description notes visual capability), tests extending `hybrid-search.test.ts`.

**Description:** Visual hits map to page-granularity citations (no chunk text). Skip signal silently when no `pageEmbeddings` exist or key absent — 3-way degrades to 2-way. RRF `k` unchanged; no per-signal weighting until real usage says otherwise.

**Tests:** 3-way fusion ordering; visual-only hit surfaces; degradation to 2-way; citation shape for page hits validates against the citation schema.

**Verification:** Dev: query "the page with the pie chart" against a scanned doc; correct page cited; drag that citation to canvas (BU-10 integration).

---

## Sub-phase E — BYOK + MCP

### BU-13 — BYOK key storage + provider routing

**Goal:** Users can store their own Anthropic/OpenAI keys; Paige and embeddings use them when present, falling back to house keys metered via `aiUsage`.

**Inputs:** None (parallel-safe after BU-03)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — `userApiKeys`: `userId`, `provider` (`anthropic` | `openai`), `encryptedKey`, `keyHint` (last 4), `createdAt`, `updatedAt`
- `apps/server/src/services/key-vault.ts` — new: AES-256-GCM encrypt/decrypt with a server-side `KEY_ENCRYPTION_SECRET` env var (NOT the client-side vault — server must read these to call providers; encryption protects at-rest DB copies)
- `apps/server/src/trpc/routers/user.ts` — `setApiKey` (validates by making a cheap provider call before saving), `deleteApiKey`, `getApiKeyStatus` (hint only — **the key itself is never returned to any client, ever**)
- `apps/server/src/services/anthropic.ts` + `embedding.ts` — per-request client resolution: user key if present, else house key; per-user LRU client cache; on 401 with a user key, surface a typed "your API key was rejected" error (never silently burn house quota as fallback)
- `apps/web/src/routes/_dashboard/settings/page.tsx` — key management section (input, hint display, delete)
- `apps/server/src/env.ts` — `KEY_ENCRYPTION_SECRET` (required in prod)
- Tests: `key-vault.test.ts`, `user-api-keys.test.ts`

**Description:** Usage rows still written for BYOK requests (tagged `byok: true`) so usage UI stays truthful, but cost-cents recorded as 0 for house billing. This is the cost-exposure cap flagged in the launch audit: early-access users on house keys are rate-limited by existing plan limits; BYOK users are effectively unlimited at zero marginal cost to us.

**Tests:** Round-trip encryption; tamper detection (GCM auth failure); router: set-validates-before-save (mocked provider), status returns hint only, delete works, keys never appear in any response payload (assert on serialized output); client resolution picks user key, falls back correctly, 401 path surfaces typed error.

**Verification:** Dev: set a real key in settings, send a chat, confirm via logs the user key was used; delete key, confirm fallback.

---

### BU-14 — MCP server

**Goal:** External MCP clients (Claude Desktop, other agents) can drive a user's A4 workspaces through the existing tool registry.

**Inputs:** BU-13 (auth pattern), BU-08 (so entity tools are included)

**Creates / Modifies:**
- `apps/server/src/mcp/server.ts` — new: MCP server over Streamable HTTP at `/mcp` using `@modelcontextprotocol/sdk`, exposing the AI tool registry (38 tools) — reuse each tool's existing Zod input schema and executor directly; workspace id becomes an explicit tool parameter (MCP has no ambient workspace context): wrap executors to require/inject it
- Auth: bearer **personal access tokens** — new `personalAccessTokens` table (`id`, `userId`, `tokenHash`, `name`, `lastUsedAt`, `createdAt`), generated/revoked in settings; raw token shown once at creation. (Clerk session JWTs are wrong-shaped for long-lived headless clients.)
- `apps/server/src/index.ts` — mount `/mcp` with the same rate limiter family as chat
- Settings page — token management section
- Tests: `mcp-server.test.ts` (list tools, call tool with valid token, reject invalid/revoked token, workspace scoping enforced), `pat.test.ts` (hashing, revocation)

**Description:** Read AND write tools are both exposed (canvas mutations are A4's differentiator — an external agent that can *build* a workspace is the demo). Destructive tools (`delete_canvas_item`) excluded from the MCP surface in v1. Tool list/description text is shared with the in-app registry — one source of truth.

**Decisions already made:** Streamable HTTP transport (headless server; stdio is for local processes). Tokens hashed at rest (same posture as passwords). Per-token rate limit identical to the authenticated chat limit.

**Tests:** As listed; plus an integration test driving list-tools → `get_workspace_summary` → `create_canvas_item` end-to-end against in-memory DB.

**Verification:** Connect Claude Desktop (or `npx @modelcontextprotocol/inspector`) to dev `/mcp` with a generated token; list tools; create a note card on a real workspace; see it appear on the canvas.

---

## Completion checklist

| BU | Description | Status |
|---|---|---|
| BU-01 | FTS5 keyword index | ✅ 2026-07-27 |
| BU-02 | RRF fusion + search_documents upgrade | ✅ 2026-07-27 |
| BU-03 | Background job queue | ✅ 2026-07-27 |
| BU-04 | Entity tables + shared schemas | ✅ 2026-07-27 |
| BU-05 | Entity extraction pass | ✅ 2026-07-27 |
| BU-06 | Entity resolution engine | ✅ 2026-07-27 |
| BU-07 | Cross-linking + reconciliation | ✅ 2026-07-27 |
| BU-08 | Entity AI tools | ✅ 2026-07-27 |
| BU-09 | entity-card canvas item | ✅ 2026-07-27 |
| BU-10 | document-node + draggable citations | ✅ 2026-07-27 |
| BU-11 | Page rendering + image embeddings | ✅ 2026-07-27 |
| BU-12 | Visual signal in hybrid search | ✅ 2026-07-27 |
| BU-13 | BYOK key storage + provider routing | ✅ 2026-07-27 |
| BU-14 | MCP server | ✅ 2026-07-27 |

**Ship points:** after BU-02 (better search, zero risk), after BU-08 (entity graph + reconciliation — the headline feature), after BU-10 (canvas story complete), after BU-12 (visual search), after BU-14 (platform/BYOK).

**Estimated effort:** Sub-phase A ~2–3 days · B ~2 weeks · C ~1 week · D ~1 week · E ~1 week. Total ~5–6 weeks of focused sessions.

**Interactions with existing plans:**
- [A4_SHIP_TO_PRODUCTION.md](./A4_SHIP_TO_PRODUCTION.md) Phase 2 (Postgres): BU-01 becomes tsvector, BU-02 unchanged, embeddings move to pgvector — `keyword-search.ts`/`vector-search.ts` are the only touch points. Nothing in Phase 6 blocks on the migration.
- [A4_PRICING.md](./A4_PRICING.md): visual retrieval (D) and BYOK/MCP (E) are natural paid-tier gates.
- The debt-deadline analyzer TODO (`insight-engine.ts:160`) is unrelated but pairs well with BU-07's schema session if a `dueDate` column is being added to `debts` anyway.
