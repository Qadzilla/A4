# A4 — Product Roadmap: Post-AI Pipeline

> **Created:** 2026-03-30
> **Status:** Planning — all 5 AI pipeline phases complete. This is the feature roadmap beyond the current build.
> **Related docs:** [Roadmap (built)](./A4_ROADMAP.md) | [Ship to Production](./A4_SHIP_TO_PRODUCTION.md) | [AI Pipeline](./A4_AI_PIPELINE.md) | [Pricing](./A4_PRICING.md)

---

## What's Done

The foundation is complete:

- **Canvas platform:** 27 item types, 61 components, infinite zoom/pan, connections, minimap, smart guides
- **Financial tools:** Budget, P&L, balance sheet, cash flow, tax estimator, loan calculator, projection, breakeven, depreciation, portfolio, net worth, debt planner, rent-vs-buy, invoices, receipts, subscriptions, accounts, ledger
- **AI pipeline (5 phases):** Chat with workspace context, 28-tool execution, RAG with citations, proactive insights (7 analyzers), cross-workspace reasoning, scenario modeling, conversation memory
- **Infrastructure:** Monorepo, tRPC, Clerk auth, Drizzle ORM, Polygon.io market data, vault encryption, CI pipeline (381+ tests)

Everything below is **net-new capability** that builds on this foundation.

---

## Q2 2026: Live Data & Privacy

**Theme:** Connect to the real world. Stop manual data entry.

### Plaid Integration — Bank Feeds (8 days)

Connect bank accounts, credit cards, and investment accounts for automatic transaction import.

| Task | Description | Est |
|------|-------------|-----|
| Plaid Link integration | Embed Plaid Link in the frontend for account connection flow | 1d |
| Token exchange + storage | Exchange public token → access token, store encrypted per user | 0.5d |
| `integrations` DB table | `user_id`, `provider`, `access_token` (encrypted), `institution`, `status`, `last_synced` | 0.5d |
| Transaction sync | Nightly job: pull new transactions via Plaid `/transactions/sync`, upsert into `transactions` table | 2d |
| Account balance sync | Pull real-time balances, update account cards automatically | 0.5d |
| Auto-categorization | Map Plaid categories to A4 budget categories, allow user overrides | 1d |
| Reconciliation UI | Show synced transactions with match status, flag discrepancies | 1.5d |
| AI integration | Paige can query live bank data: "What did I spend at Amazon this month?" | 1d |

**Dependencies:** Production database (Neon), billing tier enforcement (Pro-only feature).

**User value:** "I connected my Chase account and A4 automatically categorized my transactions and updated my budget. I haven't entered a number manually in 3 weeks."

### Stripe Revenue Tracking (5 days)

For users who run businesses through Stripe — connect their Stripe account to track revenue, payouts, and customers.

| Task | Description | Est |
|------|-------------|-----|
| Stripe Connect (OAuth) | Connect user's Stripe account via OAuth flow | 1d |
| Revenue sync | Pull charges, payouts, subscriptions, refunds | 1.5d |
| Revenue dashboard | Auto-populate P&L card revenue section, create KPI cards for MRR/ARR/churn | 1d |
| Invoice reconciliation | Match Stripe invoices to A4 invoice cards | 0.5d |
| AI integration | Paige can answer: "How much revenue did I collect this month?" with real Stripe data | 1d |

**Dependencies:** Plaid integration (shared `integrations` table), Pro tier.

### Privacy Controls — User-Controlled Data Sharing (4 days)

Implement Stage 1 of the privacy architecture from the AI pipeline doc.

| Task | Description | Est |
|------|-------------|-----|
| Per-conversation privacy toggle | Chat panel toggle: "Full access" (default) vs "Reduced access" | 0.5d |
| Reduced context builder | AI sees category names, percentages, signals — but not dollar amounts or account names | 1.5d |
| Template response engine | AI produces responses with `{{variable}}` placeholders, server fills before sending to client | 1.5d |
| Privacy preference storage | Per-user default + per-conversation override | 0.5d |

**Dependencies:** None (builds on existing `ai-context.ts` architecture seam).

**User value:** Privacy-conscious users can use AI analysis without raw financial data leaving A4's server.

---

## Q3 2026: Planning & Collaboration

**Theme:** A4 goes from tracking to planning. And from solo to shared.

### Financial Planning Agent (12 days)

The ultimate AI capability — multi-step reasoning that helps users make real financial decisions.

| Task | Description | Est |
|------|-------------|-----|
| Planning prompt templates | Guided prompts for major decisions: home purchase, retirement, Roth conversion, career change | 2d |
| Multi-step orchestration | AI composes 5-10 tool calls in sequence with intermediate reasoning | 2d |
| Assumption surfacing | AI explicitly states all assumptions, allows user to adjust | 1d |
| Side-by-side comparison | Create multiple scenario cards and position them for visual comparison | 2d |
| Sensitivity analysis | "What if rates go up 1%?" — re-run projections with parameter variations | 2d |
| Recommendation engine | AI synthesizes analysis into a clear recommendation with confidence level | 2d |
| Decision journal | Log major decisions + reasoning for future reference | 1d |

**Example flow:** User asks "Can I afford a $500k house?"
1. `get_accounts` → check cash for down payment ($90k available)
2. `get_debts` → check existing obligations ($50.5k total)
3. `get_budget` → check monthly cash flow capacity ($1,700 surplus)
4. `calculate_loan` → run mortgage: $400k, 6.5%, 30yr → $2,528/mo PITI
5. `calculate_rent_vs_buy` → compare to current $1,600 rent
6. DTI ratio check: ($2,528 + $850 existing) / $10,833 income = 31.2% (under 36% threshold)
7. Synthesize: "Yes, but it's tight. Your DTI would be 31.2%. The breakeven vs renting is year 7. Recommendation: wait until student loans are paid off (4.2 years) to improve DTI to 23.4%."

**User value:** "I asked A4 if I should convert my IRA to Roth. It ran my tax projection both ways, modeled 20 years of growth, and showed me I'd save $47k by converting this year while my income is lower."

### Shared Workspaces — Real-Time Collaboration (10 days)

Multiple users can view and edit the same workspace.

| Task | Description | Est |
|------|-------------|-----|
| Workspace sharing model | `workspace_members` table: `workspace_id`, `user_id`, `role` (admin/editor/viewer), `invited_by`, `accepted_at` | 1d |
| Invitation flow | Invite by email → Clerk user lookup → pending invitation → accept/decline | 1.5d |
| Role-based permissions | Admin: full control. Editor: create/edit items, no delete workspace. Viewer: read-only. | 1.5d |
| Real-time presence | WebSocket: show who's viewing the workspace (avatar cursors on canvas) | 2d |
| Conflict resolution | Optimistic updates with last-write-wins for canvas item edits | 1.5d |
| Shared conversations | Team members can see shared AI conversations (private by default, shareable) | 1d |
| Activity feed | "Sarah created a budget card" / "Alex asked Paige about Q2 revenue" | 1.5d |

**Dependencies:** Production deployment, user router completion.

### Monte Carlo Simulation (5 days)

Probabilistic financial modeling — run thousands of scenarios to show probability distributions.

| Task | Description | Est |
|------|-------------|-----|
| Simulation engine | Server-side Monte Carlo: configurable distributions for returns, inflation, income growth | 2d |
| `monte-carlo-card` canvas item | Visualization: fan chart showing P10/P25/P50/P75/P90 outcomes | 1.5d |
| AI integration | Paige can create and interpret Monte Carlo simulations | 1d |
| Parameter presets | Common scenarios: retirement planning, portfolio growth, business revenue | 0.5d |

**User value:** "Instead of one retirement number, I can see there's a 75% chance I hit my target and a 90% chance I have at least $1.8M."

### Smart Notifications (6 days)

Move insights from "on-demand" to "push" — email and in-app notification system.

| Task | Description | Est |
|------|-------------|-----|
| `notifications` DB table | `user_id`, `type`, `title`, `body`, `workspace_id`, `read`, `created_at` | 0.5d |
| In-app notification center | Bell icon in sidebar with unread count, notification list | 1.5d |
| Email digest | Weekly email: top insights, account changes, upcoming deadlines | 2d |
| Notification preferences | Per-user settings: which notification types, email frequency (instant/daily/weekly/off) | 1d |
| AI-triggered notifications | Insights engine generates notifications when thresholds are crossed | 1d |

**Dependencies:** Insights engine (Phase 4, already built), email service (SendGrid or Resend).

---

## Q4 2026: Mobile & Scale

**Theme:** Meet users where they are. Handle growth.

### Progressive Web App — Mobile Experience (10 days)

| Task | Description | Est |
|------|-------------|-----|
| PWA manifest + service worker | Installable on iOS/Android home screen, offline shell | 1d |
| Responsive canvas | Touch-optimized zoom/pan, mobile-friendly card interactions | 3d |
| Mobile navigation | Bottom tab bar, slide-out panels, optimized for thumb reach | 2d |
| Mobile chat | Full-screen chat mode on mobile, optimized keyboard interaction | 1.5d |
| Offline support | Cache workspace data, queue mutations for sync when online | 2d |
| Push notifications | Web push for insights and alerts | 0.5d |

### Template Marketplace (5 days)

Pre-built workspace templates that users can install in one click.

| Task | Description | Est |
|------|-------------|-----|
| Template format | JSON export of workspace structure: items, positions, connections, sample data | 1d |
| Built-in templates (10) | Personal Finance Starter, Freelancer Bookkeeping, Investment Portfolio, Tax Season, Rental Property, Small Business, Debt Payoff, Retirement Planning, Wedding Budget, Side Hustle | 2d |
| Template gallery UI | Browse, preview, one-click install into a new workspace | 1.5d |
| Community templates (future) | User-submitted templates with moderation | 0.5d (design only) |

**User value:** "I installed the Freelancer Bookkeeping template and had a fully set up workspace in 10 seconds."

### Team Billing (5 days)

| Task | Description | Est |
|------|-------------|-----|
| Organization model | `organizations` table, org-level billing, member management | 1.5d |
| Per-seat pricing | Base plan + per-seat add-on for collaborators beyond tier limit | 1d |
| Admin dashboard | Org admin: manage members, view usage across team, manage billing | 1.5d |
| Unified billing | Single invoice for org, allocated across workspaces | 1d |

### Data Export & Portability (4 days)

| Task | Description | Est |
|------|-------------|-----|
| Full workspace export | JSON export of all workspace data (items, data, connections, files) | 1d |
| CSV export per card | Export any financial card's data as CSV | 0.5d |
| PDF report generation | Professional PDF reports: P&L, balance sheet, net worth summary, budget report | 2d |
| Data deletion | "Delete all my data" button — GDPR-style complete data removal | 0.5d |

---

## Q1 2027: Enterprise

**Theme:** Serve teams and businesses with compliance needs.

### QuickBooks Sync (10 days)

Two-way sync between A4 and QuickBooks Online.

| Task | Description | Est |
|------|-------------|-----|
| QuickBooks OAuth | Connect QBO account via OAuth 2.0 | 1d |
| Chart of accounts sync | Pull QBO chart of accounts → map to A4 categories | 1.5d |
| Transaction sync | Two-way: QBO transactions ↔ A4 ledger entries | 3d |
| Invoice sync | A4 invoices → QBO invoices (and vice versa) | 2d |
| P&L reconciliation | Compare A4 P&L card with QBO P&L report, flag discrepancies | 1.5d |
| AI integration | Paige can query QBO data and reconcile across systems | 1d |

### API Access (6 days)

Public API for developers and power users.

| Task | Description | Est |
|------|-------------|-----|
| API key management | Generate/revoke API keys in settings | 1d |
| REST API layer | Express routes that mirror tRPC procedures (read-only to start) | 2d |
| API documentation | OpenAPI spec, interactive docs (Swagger UI) | 1.5d |
| Webhooks | Outbound webhooks for workspace events (item created, insight generated) | 1.5d |

### Audit Log (4 days)

| Task | Description | Est |
|------|-------------|-----|
| `audit_events` table | `user_id`, `workspace_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip`, `created_at` | 0.5d |
| Event capture | Log all create/update/delete actions across all routers | 1.5d |
| Audit log UI | Filterable, searchable event log in workspace settings | 1.5d |
| Export | CSV/JSON export of audit events for compliance | 0.5d |

### SOC 2 Preparation (8 days)

| Task | Description | Est |
|------|-------------|-----|
| Security policies | Access control, incident response, change management documentation | 2d |
| Infrastructure hardening | VPC configuration, encryption at rest verification, secret rotation | 2d |
| Monitoring & alerting | Security event monitoring, anomaly detection, PagerDuty integration | 2d |
| Vendor assessment | Document all third-party services (Clerk, Neon, Anthropic, Stripe, R2) | 1d |
| Pre-audit gap analysis | Engage SOC 2 auditor for readiness assessment | 1d |

---

## Quarterly Summary

| Quarter | Theme | Key Deliverables | Est Total |
|---------|-------|-----------------|-----------|
| **Q2 2026** | Live Data & Privacy | Plaid bank feeds, Stripe revenue, privacy controls | 17 days |
| **Q3 2026** | Planning & Collaboration | Financial planning agent, shared workspaces, Monte Carlo, notifications | 33 days |
| **Q4 2026** | Mobile & Scale | PWA, template marketplace, team billing, data export | 24 days |
| **Q1 2027** | Enterprise | QuickBooks sync, API access, audit log, SOC 2 prep | 28 days |

---

## Feature Priority Matrix

| Feature | User Value | Revenue Impact | Effort | Priority |
|---------|-----------|---------------|--------|----------|
| Plaid bank feeds | Very High | High (stickiest feature, reduces churn) | 8d | P0 |
| Financial planning agent | Very High | High (Pro differentiator, justifies $100/mo) | 12d | P0 |
| Shared workspaces | High | High (enables team use, expands TAM) | 10d | P1 |
| Smart notifications | High | Medium (engagement + retention) | 6d | P1 |
| Stripe revenue tracking | High | Medium (business users) | 5d | P1 |
| Privacy controls | Medium | Medium (unblocks privacy-conscious users) | 4d | P1 |
| PWA mobile | High | Medium (accessibility) | 10d | P2 |
| Template marketplace | Medium | Medium (onboarding + activation) | 5d | P2 |
| Monte Carlo simulation | Medium | Low (power user feature) | 5d | P2 |
| QuickBooks sync | High | High (enterprise requirement) | 10d | P2 |
| Team billing | Medium | High (enterprise revenue) | 5d | P2 |
| Data export | Medium | Low (trust building) | 4d | P2 |
| API access | Low-Medium | Medium (platform play) | 6d | P3 |
| Audit log | Low | Medium (enterprise checkbox) | 4d | P3 |
| SOC 2 | Low | High (enterprise requirement) | 8d | P3 |

---

## Dependencies & Ordering

```
Production deployment (A4_SHIP_TO_PRODUCTION.md)
  │
  ├──→ Plaid Integration ──→ Stripe Revenue ──→ QuickBooks Sync
  │
  ├──→ Privacy Controls (independent)
  │
  ├──→ Financial Planning Agent ──→ Monte Carlo Simulation
  │
  ├──→ Shared Workspaces ──→ Team Billing ──→ API Access
  │                    │
  │                    └──→ Audit Log ──→ SOC 2
  │
  ├──→ Smart Notifications (after insights engine — already built)
  │
  ├──→ PWA Mobile (independent)
  │
  └──→ Template Marketplace (independent)
      └──→ Data Export (independent)
```

**Critical path:** Production → Plaid → Financial Planning Agent → Shared Workspaces. This sequence maximizes user value and revenue potential at each step.
