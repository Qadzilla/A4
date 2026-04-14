# A4 — Landing Page & Onboarding Polish

> **Created:** 2026-04-06
> **Updated:** 2026-04-14
> **Status:** Landing page complete. Onboarding not built.
> **Related docs:** [Ship to Production](./A4_SHIP_TO_PRODUCTION.md) | [Pricing](./A4_PRICING.md) | [Product Roadmap](./A4_PRODUCT_ROADMAP_NEXT.md)

---

## Current State (as of 2026-04-14)

The landing page (`apps/web/src/routes/_public/landing.tsx`) is a single-page site with 8 sections:

1. **Hero** — "Your AI-powered financial workspace" + animated chat input (Project/Analysis mode cycling) + CTA buttons
2. **Canvas** — "An infinite canvas for your financial life" + 6-card mock workspace with connectors
3. **Documents** — "Drag, drop, parse" + file pipeline animation (CSV/XLSX/PDF → extracted data)
4. **AI Chat** — "Talk to your money" + Paige book-open animation + chat demo
5. **Workflows** — "See what you can build" + 3 use case tiles (tax prep, runway, portfolio)
6. **Vault** — encryption flow visualization (passphrase → PBKDF2 → AES-256-GCM)
7. **Pricing** — 2-tier early access (Free + Pro coming soon)
8. **Bottom CTA** → footer (copyright only)

Supporting components: `HeroChatInput` (typewriter prompt cycling synced with Project/Analysis toggle), `CanvasBackground` (animated background).

Auth pages (`sign-in.tsx`, `sign-up.tsx`) are dark-themed with A4 logo in top-left header linking back to `/`.

### What was fixed (2026-04-14 overhaul)

- **CTAs:** All "Download for Mac" buttons replaced with "Get Started Free" → `/sign-up`
- **Dead links:** Products link, Resources dropdown (8 dead items) removed from desktop + mobile nav
- **Nav:** Simplified to `Logo | Pricing | Log in | [Get Started]`
- **Mobile nav:** Converted from hover-based (broken on touch) to click-based toggle with X animation
- **Footer:** Stripped to copyright only. Dead Privacy/Terms/Cookies links removed.
- **Copy:** Removed all claims about unbuilt features (integrations, collaboration, PDF export, audit logs, credit system, automation)
- **Section order:** Canvas moved to position 2 (strongest feature first), Documents to 3, AI Chat to 4
- **Pricing:** 3 tiers → 2-tier early access (Free + Pro coming soon). All unbuilt feature claims removed.
- **Hero chat:** Prompts reworked to reflect real product capabilities (budget, portfolio, tax, P&L, runway). Synced with Project/Analysis toggle.
- **Canvas badge:** "WORKSPACE" → "WORKSPACE · 27 TOOLS"
- **Meta tags:** Added OG + Twitter card tags to `index.html` with generated OG image (1200x630)

---

## Remaining Landing Page Items

### Social proof (post-launch)
No testimonials, user counts, or trust signals. Add when real users exist:
- User count ticker
- Testimonial cards
- Security badges

### Real product screenshots
Canvas demo uses SVG illustrations. Replace with actual product screenshots/GIFs when ready.

### Privacy & Terms pages
Links removed for now. Build placeholder pages before public launch.

---

## Onboarding Flow (Not Built)

Per `A4_SHIP_TO_PRODUCTION.md` Phase 5, the following is planned but does not exist:

### Post-Signup Welcome Screen

After sign-up, user lands on an empty dashboard. No guidance, no context.

**Design:**
- Full-screen welcome modal or dedicated `/welcome` route
- "What do you want to manage?" — selection cards:
  - **Personal Finance** (budgets, net worth, subscriptions, debt payoff)
  - **Business / Freelance** (invoicing, P&L, cash flow, tax)
  - **Investments** (portfolio, projections, market data)
- Selection determines the first workspace template scaffolded automatically

### Workspace Scaffolding

Based on welcome selection, auto-create first workspace with:
- Pre-positioned canvas items (relevant card types for the use case)
- Sample data to show what's possible
- A welcome note card with "Getting Started" instructions

### Guided Tour

Lightweight tooltip tour (5-7 steps):
1. Canvas — "This is your workspace. Drag to pan, scroll to zoom."
2. Tools panel — "Drag financial tools onto your canvas."
3. AI chat — "Ask Paige anything about your finances."
4. Tab bar — "Click items to open their full editor."
5. File upload — "Upload CSVs, PDFs, or Excel files for AI analysis."

### Empty States

Every page and panel needs a meaningful empty state:

| Location | Empty State Message |
|----------|-------------------|
| Homepage (no workspaces) | "Create your first workspace" CTA with illustration |
| Canvas (no items) | "Drag tools from the panel or ask Paige to set up your workspace" |
| Chat panel (no conversations) | "Ask Paige anything about your finances" + example prompts |
| Insights panel (no insights) | "Add data to your workspace and Paige will surface insights" |
| Workspaces page (empty) | Create workspace button + use case suggestions |

---

## Priority Order

| # | Task | Impact | Effort | Status |
|---|------|--------|--------|--------|
| 1 | Fix CTAs | Critical | 30 min | **Done** |
| 2 | Clean up dead nav links | High | 30 min | **Done** |
| 3 | Tighten hero copy | High | 30 min | **Done** |
| 4 | Dark-only marketing site | Medium | 1 hr | **Done** |
| 5 | Section reorder + copy honesty pass | High | 1 hr | **Done** |
| 6 | Pricing rework (early access) | High | 1 hr | **Done** |
| 7 | Mobile nav fix | High | 30 min | **Done** |
| 8 | Meta tags + OG image | Medium | 30 min | **Done** |
| 9 | Post-signup onboarding flow | Very High | 2-3 days | Not started |
| 10 | Empty states | High | 1 day | Not started |
| 11 | Guided tour | Medium | 1 day | Not started |
| 12 | Social proof section | Medium | Post-launch | Not started |
