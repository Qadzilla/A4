# A4 — Demo & Pitch

> **Created:** 2026-03-30
> **Status:** Pre-demo — product is demo-ready, needs curated data and polish.
> **Related docs:** [Architecture](./A4_ARCHITECTURE.md) | [AI Pipeline](./A4_AI_PIPELINE.md) | [Pricing](./A4_PRICING.md)

---

## Elevator Pitch (30 seconds)

> A4 is an AI-powered financial workspace. You create a workspace, drop in your documents and data — budgets, accounts, invoices, bank statements — and talk to it. The AI knows your actual numbers, builds tools on your canvas, and spots problems you'd miss. It's like having a personal CFO that lives inside a visual operating system for your money.

---

## Demo Script (5 minutes)

### Act 1: The Canvas (45 seconds)

**Show:** A workspace called "Sarah's Small Business" with 8-10 cards already on the canvas — budget, accounts, P&L, invoices, a few KPI cards, some connections between them.

**Say:** "This is A4. Every workspace is an infinite canvas where you organize your financial life. These are live, interactive tools — not static charts. Let me show you what's inside."

**Do:**
- Zoom in on the budget card → show categories, planned vs actual, progress bars
- Click on the P&L card → tab opens, show 12-month income statement with waterfall chart
- Pan to show connections between budget and accounts
- Quick zoom out to show the full workspace overview with minimap

### Act 2: Financial Tools (60 seconds)

**Show:** Drag a new tool from the tools panel.

**Say:** "A4 has 27 different canvas tools — everything from budgets and invoices to tax estimators and debt payoff planners. Let me create a quick tax estimate."

**Do:**
- Drag `tax-estimator-card` from tools panel
- Enter: $95,000 W-2 income, $35,000 1099 income, filing status: Single, state: California
- Show the instant calculation: federal + state + SE tax + effective rate
- "Sarah can see exactly what she owes. No tax software needed for the estimate."

### Act 3: AI Chat — Paige (90 seconds)

**Show:** Open the chat panel.

**Say:** "This is Paige — A4's AI analyst. Paige isn't a generic chatbot. She knows everything in this workspace."

**Do:**
- Type: "How is my business doing this month compared to last month?"
- Show streaming response referencing real P&L numbers, account balances, budget status
- Then type: "Create a cash flow projection for the next 6 months based on my current revenue trend"
- Show Paige calling tools: `get_accounts`, `get_budget`, then `create_canvas_item`
- A projection card appears on the canvas in real-time
- "She didn't just answer — she built something. That card is live and editable."

### Act 4: Document Intelligence (60 seconds)

**Show:** A file card with an uploaded bank statement PDF.

**Say:** "Sarah uploaded her Q1 bank statement. Every document becomes searchable knowledge."

**Do:**
- Type: "What did I spend on software subscriptions in Q1 based on my bank statement?"
- Show Paige searching documents (RAG), finding relevant transactions, citing page numbers
- Response includes: specific amounts, dates, merchant names, total, with `[1]` citations
- Click a citation → highlights the source in the file card
- "Every answer is grounded in her actual documents. Citations link back to the source."

### Act 5: Proactive Insights (45 seconds)

**Show:** The insights panel with 2-3 insight cards.

**Say:** "Paige doesn't just answer questions — she notices things on her own."

**Do:**
- Show insight: "Your dining expenses are 90% over budget — $380 vs $200 planned"
- Show insight: "Invoice #1042 is 15 days overdue — $4,500 from Acme Corp"
- Click an insight to start a conversation about it
- "She's watching your data so you don't have to."

### Closing (15 seconds)

**Say:** "27 financial tools, 28 AI capabilities, document intelligence, proactive insights — all in one workspace. A4 is the operating system for your money."

---

## Demo Data Specification

Two curated workspaces with realistic, non-generic data:

### Workspace 1: "Sarah's Small Business"

Sarah runs a freelance design consultancy. She has 4 clients, invoices monthly, and needs to track expenses for quarterly tax estimates.

| Card | Data |
|------|------|
| **Budget card** | Monthly budget: $6,200 total. Categories: Software ($400), Marketing ($300), Office ($200), Dining ($200), Travel ($800), Contractors ($2,500), Insurance ($300), Misc ($500). Dining is 90% over. |
| **Account card** | Chase Business Checking: $18,430. Mercury Savings: $25,000. Amex Business: -$2,340. |
| **P&L card** | Revenue: $12,500/mo avg (Q1). Expenses: $6,800/mo avg. Net: $5,700/mo. Show month-over-month growth. |
| **Invoice cards (3)** | #1040 Acme Corp $4,500 (paid), #1041 Beta Inc $3,200 (paid), #1042 Acme Corp $4,500 (overdue 15 days) |
| **Tax estimator** | $130,000 projected annual (W-2: $0, 1099: $130,000), Single, California. Shows SE tax + quarterly estimates. |
| **KPI cards (3)** | Monthly Revenue: $12,500 (↑8%), Net Profit Margin: 45.6%, Cash Runway: 7.2 months |
| **Subscription card** | Figma $15/mo, Notion $10/mo, Adobe $55/mo, Slack $8/mo, AWS $45/mo, Google Workspace $12/mo |
| **File cards (2)** | Q1 bank statement (PDF), Contractor agreement (PDF) |

### Workspace 2: "Personal Finance"

Sarah's personal financial life — separate from the business.

| Card | Data |
|------|------|
| **Net worth card** | Assets: $198,000. Liabilities: $55,500. Net: $142,500. Categories: Checking ($8,430), HYSA ($25,000), 401k ($89,000), Brokerage ($13,800), Student Loans (-$32,000), Auto Loan (-$18,500), Credit Card (-$5,000). |
| **Budget card** | Monthly: $4,200. Housing $1,600, Groceries $500, Transport $350, Utilities $200, Dining $200, Entertainment $150, Health $200, Subscriptions $100, Savings $900. |
| **Portfolio card** | VTI 60%, VXUS 20%, BND 15%, Cash 5%. Target: 60/20/15/5. Drift: VTI at 63% (+3%). |
| **Debt planner** | Student loans: $32,000 at 6.8%. Auto: $18,500 at 4.5%. Strategy: Avalanche. Payoff: 4.2 years. Interest saved vs minimum: $3,400. |
| **Account card** | Chase Checking: $8,430. Ally HYSA: $25,000. Fidelity 401k: $89,000. Fidelity Brokerage: $13,800. |
| **Rent-vs-buy card** | Rent: $1,600/mo. Buy: $450,000 home, 20% down, 6.5% rate. Breakeven: year 7. |
| **Projection card** | Retirement at 55: $2.5M target. Current savings rate: $1,800/mo. Projected: $2.1M (gap: $400k). Need: $2,200/mo. |

### Seed Script

A script (`scripts/seed-demo.ts`) that:
1. Creates both workspaces with the above data
2. Positions items in a visually appealing layout (grid-aligned, related items connected)
3. Creates 2-3 sample conversations with realistic chat history
4. Uploads sample PDF documents and triggers embedding
5. Pre-generates 3-4 insights for each workspace
6. Runs in < 30 seconds against a fresh database

---

## Polish Checklist (Pre-Demo)

### Visual Polish

- [ ] Chat panel width: ensure comfortable reading width (min 360px, max 480px)
- [ ] Loading states: skeleton screens for all cards during data fetch
- [ ] Tool panel labels: clear, scannable names for all 27 tools (no truncation)
- [ ] Empty states: meaningful illustrations + CTAs for every empty container
- [ ] Card animations: smooth entrance animations on creation (scale + fade)
- [ ] Connection rendering: ensure bezier curves render cleanly at all zoom levels
- [ ] Dark mode: verify all cards look correct in both themes
- [ ] Font consistency: verify monospace for all money values (`font-mono tabular-nums`)

### Interaction Polish

- [ ] Chat auto-scroll: smooth scroll to bottom on new streaming content
- [ ] Tool call indicators: clear "Creating budget card..." → "Done" transitions
- [ ] Citation clicks: smooth scroll/highlight to source document
- [ ] Insight dismiss: smooth fade-out animation
- [ ] Canvas zoom: smooth momentum on trackpad, snappy on scroll wheel
- [ ] Tab switching: instant, no flash of loading state

### Performance

- [ ] First meaningful paint < 1.5s on demo machine
- [ ] Chat first token < 1s (Sonnet)
- [ ] Canvas renders 20+ items at 60fps
- [ ] No visible layout shift during data loading

---

## Video Strategy

### Video 1: Sizzle Reel (2 minutes)

**Purpose:** Social media, landing page hero, investor deck embed.

**Structure:**
- 0:00-0:10 — Hook: "What if your financial data could think?"
- 0:10-0:30 — Canvas overview (fast cuts between different card types)
- 0:30-0:50 — AI chat conversation (show streaming response with real numbers)
- 0:50-1:10 — Tool creation (AI builds a card on the canvas in real-time)
- 1:10-1:30 — Document intelligence (upload → ask → cited answer)
- 1:30-1:45 — Proactive insights (notifications appearing)
- 1:45-2:00 — Closing: "A4 — the operating system for your money"

**Production notes:** Screen recording + voiceover. Dark mode. Smooth zoom transitions. Background music (subtle, no lyrics). 1080p minimum, 4K preferred.

### Video 2: Full Walkthrough (5 minutes)

**Purpose:** Product page, investor deep-dive, onboarding resource.

**Structure:** Follows the 5-act demo script exactly, with slower pacing and explanatory voiceover. Include a 30-second "how it works" architecture diagram segment between Act 2 and Act 3.

---

## Pitch Deck Alignment

The demo supports a 10-slide investor pitch:

| Slide | Content | Demo Moment |
|-------|---------|-------------|
| 1. **Problem** | Financial tools are fragmented. People use 5+ apps. No single source of truth. | — |
| 2. **Solution** | AI-powered workspace that unifies tracking, analysis, and planning | Canvas overview |
| 3. **Product** | 27 tool types, AI chat, document intelligence, proactive insights | Full demo |
| 4. **AI Moat** | 28 tools Claude can call. Workspace-grounded — not generic advice. RAG on user docs. | Act 3 + 4 |
| 5. **Market** | $15B personal finance software + $12B SMB accounting. 180M US adults managing money. | — |
| 6. **Business Model** | 3 tiers: Free / $20/mo / $100/mo. Credit-based AI usage. | [A4_PRICING.md](./A4_PRICING.md) |
| 7. **Traction** | Built: 27 item types, 5-phase AI pipeline, 381+ tests, full CI. Ready for alpha. | — |
| 8. **Competition** | See comparison table below | — |
| 9. **Team** | [Your background] | — |
| 10. **Ask** | Seed round for: production infrastructure, first 1,000 users, Plaid/Stripe integrations | — |

### Competition Comparison

| Capability | A4 | Mint/Credit Karma | YNAB | Excel/Sheets | ChatGPT | QuickBooks |
|-----------|-----|-------------------|------|--------------|---------|------------|
| AI financial analyst | Full (28 tools, workspace-grounded) | None | None | None | Generic (no user data) | Limited (Intuit Assist) |
| Visual workspace | Infinite canvas, 27 item types | Dashboard only | Budget views only | Grid only | Chat only | Dashboard only |
| Document intelligence | RAG with citations | None | None | None | File upload (no persistence) | Receipt scanning |
| Proactive insights | 7 analyzers, real-time | Spending alerts | Budget alerts | None | None | Basic alerts |
| Tax estimation | Full US federal + 50 states + SE | Basic | None | Manual | Generic advice | Basic |
| Financial statements | P&L, Balance Sheet, Cash Flow | None | None | Templates | None | Full |
| Investment tracking | Portfolio, drift, rebalance | Basic | None | Manual | None | None |
| Debt planning | Snowball/avalanche simulation | None | None | Manual | None | None |
| Multi-entity | Cross-workspace reasoning | None | None | Multi-sheet | Per-conversation | Multi-company |
| Encryption | AES-256-GCM vault (client-side) | Server-side | Server-side | Google/MS managed | None | Server-side |
| Price | Free / $20 / $100 | Free (ad-supported) | $15/mo | Free / $7-20/mo | $20/mo | $30+/mo |

---

## Key Metrics (as of 2026-03-30)

| Metric | Value |
|--------|-------|
| Canvas item types | 27 |
| AI tools (Claude can call) | 28 |
| tRPC routers | 20 (15 fully implemented, 5 stubs) |
| DB tables | 21+ |
| Tests (unit + E2E) | 381+ |
| AI pipeline phases | 5/5 complete |
| Insight analyzers | 7 |
| CI pipeline stages | 6 (lint, typecheck, unit, e2e, build, audit) |
| Supported tax jurisdictions | US federal + 50 states + DC |
| Financial calculator types | 7 (tax, loan, projection, breakeven, depreciation, rent-vs-buy, debt payoff) |
