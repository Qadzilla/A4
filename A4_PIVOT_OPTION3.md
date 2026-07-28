# The Pivot — Option 3 Deep Dive: Fresh Shell, Transplanted Organs

> **Created:** 2026-07-27
> **Status:** EXECUTING — P1 complete; P2 (The Shell) first slice SHIPPED 2026-07-27: `apps/app` scaffold live with Basis design tokens (light-first), 4-surface navigation, implicit space, and working AI chat. Remaining P2: PWA polish, error/loading states, design-system depth.
> **Decision context:** Full rebrand and refocus of A4 onto two pillars — **investing** and **taxes** — for people **25 and under**, replacing the horizontal "financial workspace" with a vertical, opinionated product. Option 3 = rebuild everything the user sees; keep everything the user doesn't.
> **Scope stance (locked):** V1 ships **both pillars at full depth**.

---

## 1. The thesis

**The user:** someone 18–25 who started investing on Robinhood/Webull/Coinbase because everyone else was, picks stocks off TikTok and group chats, has a W-2 job and maybe a side gig, and gets ambushed every April by taxes they didn't know their trades created. They don't have a financial advisor and won't get one. They have an AI in their pocket for everything else.

**The product:** an AI-powered dashboard that (1) shows them what they actually own and how it's actually doing — against the boring index they were told to buy — and (2) shows them, all year round, what their money decisions will cost them in April. The AI is the interface: grounded in their real holdings, real transactions, and real tax documents, it answers the questions they'd be embarrassed to ask and challenges the trades they're about to YOLO.

**The wedge:** "stop vibe investing" is a *behavioral* promise, not a feature list. Robinhood cannot build this product — its revenue depends on the vibes. TurboTax won't — it wakes up in February and hibernates in May. The gap is a product that treats investing and taxes as one continuous, year-round conversation.

**Why the current codebase makes this credible:** the two hardest ingredients — a grounded AI analyst and a real tax engine — already exist and are tested. What's wrong is everything wrapped around them.

---

## 2. The autopsy — what went wrong with A4

Blunt, because that's the point of this document:

1. **The canvas is the wrong metaphor for this audience.** An infinite canvas with 29 draggable card types is a desktop power-user's tool — closer to Figma-for-CFOs than to anything an under-25 investor opens on a phone between classes. The audience lives on mobile; the canvas barely functions there.
2. **Horizontal sprawl diluted the product.** Invoices, receipts, subscriptions, budgets, P&L, balance sheets, cash-flow statements, break-even, depreciation, rent-vs-buy — a bookkeeping suite for SMBs grew around the original idea and buried it. Every one of those features made the product harder to explain and none of them serve the thesis.
3. **The empty-canvas cold start.** The product is worthless until the user does work. The new audience gives you one session to prove value; "here's a blank canvas, drag some cards" loses them in the first minute.
4. **The brand is welded to the wrong metaphor.** "A4" is a paper size. The name, the landing page, the `a4-page` card type — the entire identity celebrates the canvas we're leaving.
5. **What did NOT go wrong:** the engine room. The AI pipeline (chat, tools, RAG, hybrid search, entity graph, reconciliation, insights, BYOK, MCP), the 50-state tax engine, live market data, auth, jobs, deployment. These are product-agnostic, tested (548 server tests), and exactly what the new thesis needs. The failure is a *surface* failure.

---

## 3. The transplant inventory

Three buckets. **KEEP** = survives into the new product (possibly renamed). **FIX** = survives but changes shape. **PARK** = deleted from the running product but trivially recoverable from git history if the roadmap wants it back (nothing is ever truly lost). **DELETE** = park with no foreseeable return.

### 3.1 Server — services (`apps/server/src/services/`)

| Bucket | Files | Notes |
|---|---|---|
| **KEEP** | `anthropic.ts`, `embedding.ts`, `embedding-pipeline.ts`, `chunking.ts`, `text-extraction.ts`, `ocr.ts`, `keyword-search.ts`, `vector-search.ts`, `visual-embedding.ts`, `page-embedding.ts`, `job-queue.ts`, `key-vault.ts`, `personal-access-tokens.ts`, `storage.ts`, `polygon.ts`, `conversation-summarizer.ts` | The engine room. Zero product assumptions in any of these. |
| **KEEP** | `entity-extraction.ts`, `entity-resolution.ts` | The graph gets *more* valuable: brokers, tickers, employers, platforms become the entity types that matter. |
| **FIX** | `entity-linking.ts` | Currently links transactions/receipts/subscriptions/accounts/invoices. Re-target: transactions, accounts, holdings (link tickers to entities). |
| **FIX** | `reconciliation.ts` | The sleeper hit of the pivot. Same algorithm, new job: match 1099-B rows and brokerage statements against imported trade history. "Your 1099 shows a sale your history doesn't" is a tax-season killer feature. |
| **FIX** | `ai-tools.ts` | Registry curated 39 → ~14 survivors + new tools (see 3.4). |
| **FIX** | `ai-context.ts` | Persona rewritten for the new brand and audience; context sections rebuilt around portfolio + tax state instead of canvas items. |
| **FIX** | `insight-engine.ts` | Engine and scoring stay; the 7 analyzers are re-curated (see 3.4). |
| **PARK** | `canvas-defaults.ts`, `auto-position.ts` | Canvas-only. |
| **KEEP** | `mcp/server.ts`, `routes/chat-stream.ts`, `routes/files.ts` | MCP + streaming + uploads carry over intact. |

### 3.2 Server — routers (21) and DB tables (30)

| Bucket | Routers | Tables |
|---|---|---|
| **KEEP** | `chat`, `user`, `billing`, `market-data`, `health`, `entity`, `holding`, `account`, `financial` (transactions), `category`, `categorization-rule`, `insights` (analyzers re-curated), `workspace` (simplified — see note) | `workspaces`*, `files`, `documentChunks`, `pageEmbeddings`, `entities`, `entityMentions`, `entityEdges`, `jobs`, `conversations`, `messages`, `aiUsage`, `userProfiles`, `userApiKeys`, `personalAccessTokens`, `holdings`, `accounts`, `accountGroups`, `transactions`, `categories`, `categorizationRules`, `marketBars`, `tickerDetails`, `workspaceInsights` |
| **PARK** | `debt` (student loans are real for this audience — likely returns), `receipt` (returns as tax-deduction substantiation for 1099 workers), `networth` (a net-worth number belongs on the dashboard, but computed from accounts+holdings, not its own card system) | `debts`, `receipts`, `networthCategories`, `networthEntries` |
| **DELETE** | `canvas`, `invoice`, `subscription`, `budget`, `folder`, `vault` | `canvasItems`, `canvasConnections`, `invoices`, `invoiceLineItems`, `subscriptions`, `budgetGroups`, `budgetCategories`, `vaultConfig` |

\* **Workspace note:** multi-workspace (portfolio/business/initiative) collapses to a single implicit space per user for this audience. The `workspaces` table survives as internal plumbing (everything is scoped by it), but the *concept* disappears from the UI. Cross-workspace AI machinery (`cross-workspace.ts`, `query_workspace`) gets parked.

### 3.3 Server — the calculation library (`lib/calc`)

| Bucket | Calculators | Why |
|---|---|---|
| **KEEP** | **Tax estimator** (federal + all 50 states + DC, 2025/2026, all filing statuses, FICA/SE, credits, withholding) | The single most defensible asset in the codebase for this pivot. Months of encoded domain logic that competitors would have to re-derive. |
| **KEEP** | **Projection** (compound growth, contributions, inflation) | Powers "same $500 in VOO for 10 years" — the core anti-vibe framing. |
| **KEEP** | Scenario engine (`scenario-engine.ts`) | Re-targeted at investing/tax scenarios; canvas output replaced with data output. |
| **PARK** | Debt paydown (student loans will bring it back), loan/mortgage | Real for the audience, not v1. |
| **DELETE** | Break-even, depreciation, rent-vs-buy | SMB/homeowner tools. |

### 3.4 The AI surface — tools and analyzers

**Tool registry: 39 → ~14 survivors.**

- **KEEP (renamed where marked):** `get_workspace_summary`→`get_overview`, `get_accounts`, `get_holdings`, `get_market_data`, `search_documents`, `search_entities`, `get_entity_connections`, `find_unmatched_transactions`, `calculate_tax`, `calculate_projection`, `create_scenario_comparison` (data output, no canvas), transaction read tools.
- **DELETE:** all 5 canvas mutation tools, all 8 `populate_*` tools, `get_budget`/`get_invoices`/`get_receipts`/`get_subscriptions`/`get_debts`/`get_networth`, `get_item_data`, breakeven/depreciation/rent-vs-buy/loan calculators, `list_workspaces`/`query_workspace`.
- **NEW (the actual pivot):**
  - `pre_trade_check` — the flagship. Given a contemplated buy/sell: concentration impact, sector overlap, benchmark comparison, *and the tax consequence if realized* (short- vs long-term gains via the tax engine). The AI's answer to "should I buy this?" is never advice — it's the full picture the user didn't have.
  - `estimate_capital_gains` — realized/unrealized gains YTD from transactions + holdings, short/long-term split, wash-sale flags.
  - `get_tax_picture` — year-to-date: W-2 withholding vs. projected liability, side-gig income, estimated quarterly payments, April delta.
  - `benchmark_comparison` — user's actual returns vs. S&P 500 over the same period with the same cash flows. The single most sobering number in the product.

**Insight analyzers: re-curated.** Keep portfolio-drift and adapt low-cash. Delete budget-overspend, subscription-spike, debt-deadline, high-spending-category, networth-change. Add: concentration risk (>X% in one ticker), unrealized-gain tax-window opportunities (approaching long-term treatment), quarterly-estimate deadlines, benchmark-gap alerts, wash-sale warnings.

### 3.5 The web app — rebuilt from zero, with pockets of salvage

`apps/web` is replaced wholesale. Honestly salvageable from inside it:

- **KEEP (logic, restyled):** tRPC client setup, auth glue (`AuthGuard`, providers, `useAuthToken`), the SSE chat client (stream parsing, message rendering, citation handling — genuinely hard to get right, already debugged), file-upload plumbing.
- **DELETE:** all 61 canvas components, the canvas store, drag/drop/zoom/minimap systems, all `*-card-content/view` components, tool panels, tab bar, vault UI, the landing page, the design system (VS Code aesthetic → replaced by the new brand).

New app shape: **4 primary surfaces, mobile-first responsive, installable PWA.**

---

## 4. The end state — what the product looks like

No mockups by request; in words:

### 4.1 Portfolio (home)

The first screen after login, and the anti-Robinhood: not a hype feed, a mirror. Holdings with live prices (Polygon streaming already built), allocation vs. a target, concentration warnings, and the headline number — **your actual return vs. the index, same period, same cash flows**. Pull-to-refresh, glanceable on a phone. The empty state is an import flow, not a blank page: connect a brokerage (SnapTrade or Plaid Investments — decision pending) or upload a statement (the RAG + entity + reconciliation pipeline turns a PDF statement into holdings — this works *today*).

### 4.2 Taxes

Not a April-only wizard — a year-round meter. Top of screen: **"If the year ended today, you'd owe/get back $X."** Below: the components — W-2 withholding vs. projected liability, realized gains split short/long-term, side-gig income and quarterly estimates with deadlines, and a **document inbox** (W-2s, 1099-B/DIV/INT/K) where uploads are parsed, matched against imported trade history by the reconciliation engine, and discrepancies surfaced. All 50 states, already built.

### 4.3 Chat (the AI, renamed per brand)

The connective tissue and the product's voice. Grounded in real holdings, transactions, documents, and the tax picture; cites its sources; streams. Three behaviors define the persona:

1. **The pre-trade check.** "Thinking about $2k of NVDA" → concentration after the buy, overlap with existing exposure, what the same $2k does in an index over 10 years, and the tax treatment if sold early. Information, framed honestly — never "yes buy" / "no don't."
2. **Receipts, always.** Every number traces to a holding, a transaction, or a cited document. The trust posture is structural, not promised.
3. **It remembers April.** Every investing conversation carries tax awareness, because the engine is one product, not two.

### 4.4 Documents

The quiet fourth surface: every uploaded statement, tax form, and confirmation — searchable by keyword, meaning, and visually ("the page with the cost basis table"), entity-linked, reconciled. Already ~fully built; it just needs a screen.

### What v1 does NOT include

Options/crypto analytics beyond basic holdings, tax *filing* (we estimate and prepare the picture; filing partners come later), social features, the canvas, multi-workspace, teams, direct trading (never — we are the antidote, not another venue).

### Compliance posture (non-negotiable framing)

The product provides **educational estimates and information, not personalized investment advice or tax advice**. No "you should buy/sell." Pre-trade checks present facts and framings. Tax numbers are estimates with clear disclaimers. This framing keeps the product outside RIA/tax-preparer regulatory territory and must be enforced in the AI persona prompt, the UI copy, and the terms. A legal review before public launch is a launch gate, not a nice-to-have.

---

## 5. Brand directions

Three directions, deliberately spanning the tonal range. Names are creative starting points — surface-level collision notes included, none trademark-cleared.

### Direction A — "Keel"

*The steady hand.* A keel is what keeps a boat upright in choppy water — precisely the product's job. **Tone:** calm, dry, quietly confident; the level-headed friend who's seen your portfolio and isn't mad, just disappointed. **Visual:** deep navy/ink backgrounds, warm off-white type, a single steady accent (brass/amber); generous whitespace; serif display over sans body — financial gravitas without the suit. **Risk:** may read "old" to the youngest users; several small "Keel" startups exist but the space looks navigable.

### Direction B — "Basis"

*The numbers person.* Cost basis is the tax-investing concept at the heart of the product — the name is the thesis. **Tone:** precise, data-forward, zero hype; every claim has a number. **Visual:** near-monochrome (paper white / carbon black), one electric accent (cobalt or signal green), tabular numerals everywhere, dense-but-clean grids; feels like a terminal that learned design. **Risk:** the most crowded name (defunct Basis stablecoin, Basis Theory, others) — strongest concept, hardest clearance.

### Direction C — "Unvibed" (or the family: "Sober", "Grounded")

*The contrarian friend.* Leans directly into the meme — names the enemy. **Tone:** playful, meme-literate, slightly confrontational; calls you out and makes you laugh while doing it. **Visual:** bold high-contrast type, acid accent colors, editorial layouts; feels like a good newsletter, not a bank. **Risk:** highest ceiling with the audience, shortest shelf life — meme-anchored brands age fast, and the tone must never tip into cringe. Hardest to execute, most memorable if landed.

**My honest lean:** Direction B's *concept* with Direction A's *restraint* — a precise, calm product whose personality lives in the AI's voice rather than in loud branding. The AI persona is where Direction C's energy belongs, at 20% intensity.

> **✅ PICKED (2026-07-27): the Basis × Keel blend, light-mode-first.** The primary theme is light — paper-white ground, carbon ink, one electric accent, tabular numerals — with dark mode as the well-kept secondary theme rather than the default. P2's design tokens are built from this. Name candidates (Keel, Basis, or new) carry forward into P0 clearance.

---

## 6. Execution phases

Same build-unit discipline as Phase 6. Both pillars at full depth, honestly estimated:

| Phase | Contents | Est |
|---|---|---|
| **P0 — Decisions** | Brand pick, name check, brokerage-data provider research (SnapTrade vs Plaid Investments: coverage, pricing, approval time), legal-framing review scheduled | 2–3 days (mostly yours) |
| **P1 — The Cut** | Server pruned by deletion (routers, services, tools, analyzers per §3), schema pruned, tests updated, tool registry curated. The codebase gets *smaller and greener*. | 3–5 days |
| **P2 — The Shell** | New design system from the chosen brand; new `apps/web` scaffold; auth, PWA base, responsive frame, the 4-surface navigation; chat client salvage wired in | 1–1.5 wks |
| **P3 — Investing pillar** | Portfolio surface: holdings/allocation/concentration, live prices, benchmark-vs-index engine, statement-upload import path (existing pipeline), brokerage API integration | 2 wks |
| **P4 — Tax pillar** | Year-round tax meter, capital-gains engine on transactions (short/long/wash-sale), quarterly estimates, document inbox with 1099 reconciliation | 2 wks |
| **P5 — The AI** | Persona rewrite, new tools (`pre_trade_check`, `estimate_capital_gains`, `get_tax_picture`, `benchmark_comparison`), re-curated insights, behavioral framing pass over every AI response path | 1–1.5 wks |
| **P6 — The Face** | New landing page, onboarding (import-first), brand polish, early-access wall re-pointed, launch checklist rerun | 1 wk |

**Total: roughly 8–10 weeks** to a testable, rebranded, both-pillars v1. (Investing-first would have been ~5–6; the delta is the price of the locked scope — descoping later is a one-phase cut, not a rewrite.)

---

## 7. Risks — stated plainly

1. **Scope.** Both-pillars-full-depth is the single biggest risk. Mitigation: P3 and P4 each end in a shippable state; if momentum stalls, either pillar can launch solo.
2. **Brokerage data.** Provider approval queues, per-connection pricing, and coverage gaps (especially crypto platforms) can stall P3's centerpiece. Mitigation: the statement-upload path (already built) is the fallback importer from day one.
3. **Regulatory framing.** Personalized investment/tax advice is licensed territory. The educational-estimates posture must survive every AI response. Mitigation: persona-level guardrails + legal review as a launch gate.
4. **Behavioral thesis is unproven.** "Stop vibe investing" might not retain users who *want* the vibes. Mitigation: the tax pillar is valuable even to committed degenerates — April comes for everyone.
5. **The rewrite trap.** Option 3 done badly becomes Option 1. Mitigation: the engine room is not open for "improvements" during the pivot — P1 deletes, it does not refactor.
6. **Infra debt unchanged by the pivot.** SQLite + single Railway box is fine for early access, not for scale; Postgres migration timing unchanged from A4_SHIP_TO_PRODUCTION.md.
7. **Name/trademark.** All three directions need real clearance before anything public.

---

## 8. Decisions

| Decision | Status (2026-07-27) |
|---|---|
| Old product during pivot | ✅ **RESOLVED: Freeze entirely.** P1 deletes the SMB surface from `main`; the old product survives in git history only. |
| Brand direction | ✅ **RESOLVED: Basis × Keel blend, light-mode-first. Working name: BASIS** (locked; Keel eliminated — active UK fintech at keel.money; final clearance at P6). Data-forward precision with calm restraint; the product's primary theme is light (paper-white ground), with dark as the secondary theme. Working name still open — candidates carry into P0 name clearance. |
| Brokerage provider | 🔎 **Research complete — recommendation: SnapTrade** (free ≤5 connections, then $1/user/mo; best Robinhood/Webull/Coinbase coverage; same-day self-serve) **plus statement upload as universal fallback**. Full findings: [A4_PIVOT_BROKERAGE_RESEARCH.md](./A4_PIVOT_BROKERAGE_RESEARCH.md). Awaiting your confirmation — due by P3 start. |
| AI persona | ✅ **RESOLVED: New persona, designed from the chosen brand's voice at P5.** Paige retires with the old brand. |
| Legal review scheduling | ⏳ Open — needed before P6 ships. |

---

*Related: [A4_ROADMAP.md](./A4_ROADMAP.md) (the old horizontal roadmap this supersedes for product direction), [A4_AI_PHASE_6_BUILD_PLAN.md](./A4_AI_PHASE_6_BUILD_PLAN.md) (the engine room this plan preserves), [DEPLOY.md](./DEPLOY.md) (infrastructure that carries over unchanged).*
