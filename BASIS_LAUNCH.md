# Basis — Launch Checklist

> The pivot's P6 gate. Code side is DONE when every ☐ in "Code" is ☑; the
> launch happens when the "Yours" column is cleared too. Old A4 launch doc:
> `A4_NOW.md` (completed 2026-07-27, pre-pivot).

## Where things stand

All six pivot phases are code-complete:
P1 Cut ✅ · P2 Shell ✅ · P3 Investing ✅ · P4 Taxes ✅ · P5 Bip ✅ · P6 Face (this doc)

## Code (Claude's side)

- [x] Public landing page at `/welcome` (signed-out visitors land here; Clerk modal sign-in)
- [x] Import-first onboarding (empty portfolio → upload / connect / tax meter)
- [x] Idempotent launch schema at server boot (`db/ensure-schema.ts`) — Railway redeploy
      onto the existing volume creates snaptrade_users / tax_profiles / trades / tax_1099s
      and adds the holdings columns automatically
- [ ] Redeploy backend: `railway up --detach` (any time — nothing consumes it until DNS flips)
- [ ] Point production frontend at the Basis app (decide: replace apps/web deploy with
      apps/app on Vercel, set `VITE_API_URL` + `VITE_CLERK_PUBLISHABLE_KEY`, update CORS
      `FRONTEND_URL` on Railway)
- [ ] Post-launch smoke run (auth → import → meter → chat) against production

## Yours (only you can do these)

- [ ] **Name clearance for "Basis"** — trademark search + domain. Rename surface if needed:
      `apps/app/src/brand.ts`, `index.html`, `manifest.webmanifest`, landing copy.
- [ ] **Legal review** — the "educational estimates, not advice" framing (landing footer,
      Taxes disclaimer, Bip's preamble). Find a fintech-literate lawyer.
- [ ] **SnapTrade production credentials** — current keys are the BASIS-TEST pair; swap in
      real ones via Railway env (`SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY`).
- [ ] **Polygon plan decision** — current key is aggregates-only (EOD prices work, live
      snapshots 403). Fine to launch with the honest EOD pill; upgrade for live ticks.
- [ ] **Clerk production instance** — confirm the prod publishable/secret keys are the ones
      you want for the Basis app (currently the a4ai.io early-access instance).
- [ ] **Domain decision** — keep a4ai.io, or launch on a Basis domain (usebasis.app etc.)?
      DNS + Vercel + Railway CORS follow from this.
- [ ] Optional: real brokerage link test through the SnapTrade portal (test creds allow 5)

## Deliberately NOT in v1

Stripe billing (free early access continues) · Postgres migration · team features ·
observability beyond logs · dark mode (light-first is the brand until a deliberate pass)
