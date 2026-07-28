# Brokerage-Data Provider Research — SnapTrade vs Plaid Investments

> **Researched:** 2026-07-27 · Supporting doc for [A4_PIVOT_OPTION3.md](./A4_PIVOT_OPTION3.md) §8 (P3 provider decision)
> **Use case:** read-only holdings + cost basis + transactions for US retail investors 18–25 (Robinhood/Webull/Fidelity/Schwab/Coinbase). No trading.
> **Recommendation: SnapTrade**, with statement-upload as the universal fallback. Rationale and full findings below.

---

## 1. SnapTrade

### Brokerage coverage
Investment-only aggregator: ~35+ institutions, claiming reach into "400M+ retail investor accounts" ([docs](https://docs.snaptrade.com/docs/integrations), [integrations](https://snaptrade.com/brokerage-integrations)).

| Broker | Status |
|---|---|
| Robinhood | Supported — read-only OAuth, no credential sharing, no trading ([page](https://snaptrade.com/brokerage-integrations/robinhood-api)) |
| Webull | Supported — official partnership as of Dec 16, 2025 (previously beta) |
| Fidelity | Supported (read) |
| Charles Schwab | Supported — read + trade ([page](https://snaptrade.com/brokerage-integrations/schwab-api)) |
| E*TRADE | Listed on integrations page |
| Vanguard | Supported, read-only ([page](https://snaptrade.com/brokerage-integrations/vanguard-api)) |
| Coinbase | Supported — OAuth, read and trade ([page](https://snaptrade.com/brokerage-integrations/coinbase-api)) |
| Other crypto | Binance listed; **Kraken notably absent** |
| Also | Public, moomoo, IBKR, eToro, Alpaca, Trading 212, Questrade/Wealthsimple (CA) |

Near-perfect overlay of where 18–25 US retail investors actually are.

### Data depth
[Holdings API](https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getUserHoldings): positions return `units`, `price`, **`average_purchase_price` (cost basis)**, `open_pnl`, and a **`tax_lots` array** (per-lot purchase dates + cost basis); balances, orders, options included. **Caveat:** field availability varies by broker — verify Robinhood/Coinbase actually return tax lots in the free tier before committing UI to lot-level display.

Sync ([syncing](https://docs.snaptrade.com/docs/syncing), [webhooks](https://docs.snaptrade.com/docs/webhooks)): initial backfill on connect (1–60s); transactions synced once daily (one-day delay) with `ACCOUNT_TRANSACTIONS_UPDATED` webhooks; holdings daily on the $1 plan or real-time/on-demand on the $2 plan. Manual refresh endpoint exists.

### Pricing ([pricing](https://snaptrade.com/pricing))
- **Free:** up to **5 brokerage connections**, unlimited users, real-time data, Discord support.
- **Pay-as-you-go read-only (daily data):** **$1 / connected user / month** + $0.05 per manual sync. No contract, no minimums.
- **Real-time tier:** $2 / connected user / month (includes trading).

### Developer access
Fully self-serve: sandbox + production-grade free tier same day. No sales call or compliance questionnaire at base tiers.

### Reliability / longevity risk
Small company (YC-backed, ~$7.5M raised, last round 2022, HQ Canada). Mitigants: official Webull partnership (Dec 2025), de-facto connector for retail portfolio apps (Blossom, Wealthfolio, Stock Unlock, Diversiview), SOC 2 Type 2. Robinhood rail is sanctioned-but-not-fully-partnered (hence read-only) — irrelevant for a read-only app, but a rail to watch.

---

## 2. Plaid Investments

### Brokerage coverage
12,000+ institutions overall ([product](https://plaid.com/products/investments/), [API](https://plaid.com/docs/api/products/investments/)); investment-data specifics:

| Broker | Status |
|---|---|
| Robinhood | Supported, read-only ([tracker](https://www.openbankingtracker.com/plaid/robinhood)) |
| Fidelity | Supported (OAuth via Fidelity Access) |
| Charles Schwab | Supported — but **extra institution-level approval, up to 6 weeks** ([launch checklist](https://plaid.com/docs/launch-checklist/)) |
| E*TRADE / Vanguard | Covered; data quality varies by institution |
| Webull | **Weak spot** — historically patchy, not a highlighted integration |
| Coinbase | **Limited** — "some Coinbase account types may not be available" ([tracker](https://www.openbankingtracker.com/plaid/coinbase)) |
| Other crypto | Binance.US, Gemini, Kraken, SoFi (added 2022) |

### Data depth
Holdings with quantity, price, cost basis, and per-lot acquisition data — **but lot/cost-basis fields are null wherever the institution doesn't supply them** (known pain point). Transactions: up to 24 months, typed. Webhooks for holdings + transactions. CUSIP/ISIN gated behind licensing.

### Pricing
Free tier = **200 API calls per product** (a demo allowance). Investments bills as an unpublished per-connected-account monthly subscription; third-party analysis pegs meaningful usage at **~$500+/month**, Growth plan requires 12-month commitment ([analysis](https://www.getmonetizely.com/articles/plaid-vs-yodlee-how-much-will-financial-data-apis-cost-your-fintech)).

### Developer access
Sandbox self-serve; production requires application + **security questionnaire** for OAuth institutions (exactly the ones we need), ~1 week approval, then per-institution OAuth waits (Schwab up to 6 weeks).

### Reliability
Corporately the safest aggregator alive. Risks are per-institution: cost-basis nulls, Coinbase account-type gaps, OAuth migrations breaking links.

---

## 3. Other options (all rejected)

- **Yodlee** — enterprise-only (~$1–2k/mo base); sold to PE firm STG (closed Sep 2025). No.
- **Akoya** — the FDX rail aggregators use to reach Fidelity/Schwab/Vanguard; enterprise-to-enterprise, no Robinhood, no Coinbase, no self-serve. No.
- **MX / Finicity** — banking/cashflow-first, thin brokerage depth. No.
- **Direct broker APIs** — Robinhood/Webull have no public consumer-data APIs. **Coinbase's first-party OAuth API (free) is a credible direct complement** for the #1 crypto platform.

---

## 4. Recommendation

**SnapTrade**, on every axis that matters here:

1. **Coverage where the users are** — Robinhood + Coinbase + Webull + Public + moomoo are SnapTrade's home turf; Plaid is weakest exactly there.
2. **Cost** — free to 5 connections, then $1/connected user/month, no contract. Plaid is unpublished, subscription-shaped, realistically hundreds/month past the demo tier.
3. **Time-to-production** — same-day self-serve vs. questionnaire + per-institution approvals (Schwab up to 6 weeks).
4. **Data shape** — native `average_purchase_price` + `tax_lots` vs. Plaid's institution-dependent nulls. Either way: **verify Robinhood + Coinbase field coverage in the free tier before building lot-level UI.**

**Accepted trade-off:** SnapTrade is a small company. Mitigation: keep ingestion provider-agnostic — normalize into our own holdings/transactions schema (which already exists) so a later swap to Plaid is a connector rewrite, not a product rewrite.

**Statements-only fallback:** viable (all target brokers export CSV/PDF; our parser pipeline already works) but shouldn't be the *only* path — the audience expects instant linking, and SnapTrade's free tier removes the cost excuse. **Ship both from day one: SnapTrade for live linking, statement upload as the universal fallback.**

**Action for P3:** create the SnapTrade developer account (user action — account creation), validate Robinhood/Coinbase field coverage against sandbox + free tier, then build the connector behind our own schema.
