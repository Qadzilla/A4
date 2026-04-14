# A4 — Pricing & Subscription Tiers

> **Created:** 2026-03-17
> **Status:** Draft — core structure decided, some details still open.

---

> **Early Access Note (2026-04-14):** The landing page currently shows a 2-tier early access model (Free + Pro coming soon) with all features unlocked and no credit card required. The 3-tier structure below is the planned post-launch pricing. It will be re-enabled on the landing page when Stripe billing is implemented.

---

## Model

Three tiers: **Starter** (free), **Core** ($20/mo), **Pro** ($100/mo).

AI usage is gated by **dollar-denominated credits**. Different AI actions cost different amounts (a Sonnet message is cheaper than an Opus message, a RAG query costs more than a plain chat, etc.). Monthly credit allowances are included per tier; overage is purchasable. Credits do not roll over.

---

## Tier Overview

### Starter (Free)

*For exploring what's possible.*

The free tier is an extended trial — feature-limited, not time-limited. The goal is to let users experience the product enough to build something they don't want to lose, then convert to Core.

| Feature | Starter |
|---|---|
| AI credits | $0.10/day (~$3/mo), no rollover |
| AI model | Sonnet only |
| Workspaces | 1 |
| Canvas items | 20 |
| Collaborators | 0 |
| Viewers | 0 |
| Document upload + RAG | No |
| Insights | No |
| Integrations | No |
| Multi-workspace reasoning | No |
| Market data | **Open — possibly delayed/limited** |
| Vault encryption | No |
| Export | CSV/JSON (always available) |
| Export watermark | A4 branding on all exported PDFs and shared links |
| Support | Community |

**Design rationale:** $0.10/day gives roughly 5-10 Sonnet messages. Enough to have a real conversation with Paige and feel the value, not enough to rely on daily. Vault is excluded — users won't put real sensitive data in a free tier anyway, and it pushes them toward Core for real use. Data export is always available at every tier to build trust; people won't enter real financial data if they fear lock-in.

---

### A4 Core ($20/mo)

*For managing your personal finances.*

The Core user tracks their financial life on A4 — budgets, accounts, net worth, debts, subscriptions. They ask Paige questions about their data. They upload bank statements and tax forms. They're organized and in control.

| Feature | Core |
|---|---|
| AI credits | $20/mo, no rollover |
| AI model | Sonnet only |
| Overage | Pay-per-use at **premium rate** (~1.5-2x standard) to incentivize Pro upgrade |
| Workspaces | Unlimited |
| Canvas items | Unlimited |
| Collaborators | Up to 5 |
| Viewers | Up to 3 |
| Document upload + RAG | Yes (uses credits) |
| Insights | Button-triggered (uses credits) |
| Integrations | No |
| Multi-workspace reasoning | No |
| Market data | Yes |
| Vault encryption | Yes |
| Export | CSV/JSON + PDF reports, no watermark |
| Support | Standard |

**Design rationale:** Core includes everything needed to run a personal financial life. Document upload + RAG makes A4 feel alive vs. a spreadsheet. Insights are user-triggered (button press) rather than passive — the user chooses to spend credits on analysis, so there's no surprise cost drain. Collaborators (5) and viewers (3) cover the spouse/partner/accountant case without needing a business tier. Overage is priced above standard rate so users who consistently exceed $20 realize Pro is better math.

---

### A4 Pro ($100/mo)

*For financial planning and business use.*

The Pro user is either a power individual who uses A4 as their personal CFO, or a small business/team. They don't just track — they plan. "Should I convert my IRA?" "Can I retire at 55?" "What's my effective tax rate if I take this gig?" They connect integrations, reason across workspaces, and need the deepest AI reasoning available.

| Feature | Pro |
|---|---|
| AI credits | $100/mo, no rollover |
| AI model | Sonnet + **Opus** (most powerful reasoning) |
| Overage | Pay-per-use at **standard rate** |
| Workspaces | Unlimited |
| Canvas items | Unlimited |
| Collaborators | Up to 15 |
| Viewers | Up to 50 |
| Document upload + RAG | Yes (uses credits) |
| Insights | Button-triggered (uses credits) |
| Integrations | Plaid, Stripe, QuickBooks |
| Multi-workspace reasoning | Yes |
| Financial planning agent | Yes |
| Market data | Yes |
| Vault encryption | Yes |
| Audit log | Yes |
| Role-based permissions | Admin / Editor / Viewer |
| Export | CSV/JSON + PDF reports, no watermark |
| Support | Priority |

**Design rationale:** Pro collapses "power individual" and "small business" into one tier. The identity difference from Core is real: Core users manage what they have, Pro users make decisions. Opus access is the technical reflection of this — planning and complex tax/retirement/scenario analysis requires deeper reasoning that Sonnet can't reliably do. Multi-workspace reasoning (cross-workspace queries) is Pro-only because it's computationally expensive (large context windows) and maps to the multi-entity use case (personal + business + rental property). Integrations (Plaid, Stripe, QuickBooks) are Pro because they have per-user costs and are the stickiest retention feature — once bank data flows in automatically, churn drops. Audit log and role-based permissions serve the business/team compliance case. Viewers (50) cover investors, board members, clients reviewing invoices, and team members who only need read access.

---

## Credit System

### How credits work

Credits are dollar-denominated. Each AI action consumes credits based on its real cost. The user's monthly allowance is included in their tier; when exhausted, they can purchase additional credits.

- **Sonnet message:** Low cost (cheap model, fast responses)
- **Opus message:** Higher cost (~5-10x Sonnet — Pro only)
- **RAG query:** Moderate cost (embedding the query + retrieval + longer context window)
- **Insight run:** Moderate cost (7 analyzers scan workspace data + Sonnet summarization)
- **Document embedding:** Small cost per document chunk (one-time on upload)

### Overage pricing

| Tier | Overage rate |
|---|---|
| Starter | No overage — daily cap is hard limit |
| Core | Premium rate (~1.5-2x standard) |
| Pro | Standard rate (1x) |

Core overage is priced higher intentionally. A Core user who regularly exceeds $20/mo should realize that upgrading to Pro ($100/mo at 1x rates + Opus access + integrations) is a better deal than paying 1.5-2x overage on Core.

### What's NOT gated by credits

These features are included in the tier and don't consume credits:

- All canvas operations (create, edit, move, connect items)
- Data entry and management (accounts, budgets, invoices, etc.)
- Market data lookups (Polygon.io)
- Vault encryption/decryption
- Data export (CSV/JSON)
- PDF export (Core+)
- Collaboration (sharing, permissions)

**Rule of thumb:** If the user is interacting with their own data directly, it's free. If they're asking AI to reason, generate, analyze, or search, it costs credits.

---

## Feature Comparison (summary)

| Feature | Starter | Core | Pro |
|---|---|---|---|
| Monthly AI credits | ~$3 ($0.10/day) | $20 | $100 |
| AI model | Sonnet | Sonnet | Sonnet + Opus |
| Credit overage | No (hard cap) | Premium rate | Standard rate |
| Workspaces | 1 | Unlimited | Unlimited |
| Canvas items | 20 | Unlimited | Unlimited |
| Collaborators | 0 | 5 | 15 |
| Viewers | 0 | 3 | 50 |
| Document upload + RAG | No | Yes | Yes |
| Insights (button) | No | Yes | Yes |
| Integrations | No | No | Plaid, Stripe, QuickBooks |
| Multi-workspace reasoning | No | No | Yes |
| Financial planning agent | No | No | Yes |
| Market data | **TBD** | Yes | Yes |
| Vault | No | Yes | Yes |
| Audit log | No | No | Yes |
| Role permissions | No | No | Admin/Editor/Viewer |
| Export watermark | Yes | No | No |
| Data export | Always | Always | Always |
| Support | Community | Standard | Priority |

---

## Open Questions

These decisions are deferred — they need more data or depend on implementation progress:

| Question | Notes |
|---|---|
| **Market data on Starter** | Portfolio cards and market tracking are a good hook. Could allow delayed quotes or limited searches on Starter. Depends on Polygon.io free-tier API limits and cost. |
| **Exact overage multiplier** | Core overage at 1.5x or 2x? Needs modeling against expected usage patterns. |
| **Credit cost per action** | Needs real cost modeling. Anthropic pricing (Sonnet: $3/$15 per MTok, Opus: $15/$75 per MTok) plus OpenAI embeddings ($0.02/MTok) plus margin. Must feel fair to users while sustaining healthy margins. |
| **Insights feature scope** | Insights may be simplified or removed. Current plan: user-triggered button that runs analyzers and costs credits. If removed, the credit model simplifies further. |
| **Integration per-user costs** | Plaid charges per connection. Need to decide whether Pro absorbs this or passes it through. Integrations are extremely sticky (high retention) so absorbing the cost may be worth it. |
| **Exact Starter canvas item cap** | 20 is a placeholder. Needs to be enough to build something meaningful (budget + accounts + a few KPIs + ledger) but not enough to run a full financial life. Costs nothing to increase (DB rows). |
| **Additional seat pricing** | When a Core user needs a 6th collaborator or a Pro user needs a 16th, what's the per-seat add-on cost? |

---

## Positioning (marketing language, draft)

**Starter:** "See what A4 can do. One workspace, a few conversations with Paige, and your first taste of AI-powered financial management."

**Core:** "Your entire financial life in one place. Unlimited workspaces, document intelligence, and an AI analyst that knows your numbers."

**Pro:** "Your personal CFO. The most powerful AI reasoning, live integrations, multi-workspace analysis, and tools built for real financial decisions."
