# Deploying a4ai.io (early-access mode)

> **Current mode:** frontend-only. The site serves the landing page, real Clerk
> sign-up/sign-in, and an early-access "coming soon" wall. The product
> (dashboard, workspaces, AI) is unplugged from the router and excluded from the
> bundle — no backend, no database, no AI keys, no hosting cost beyond free tiers.

## What's deployed

| Piece | Status |
|---|---|
| Landing page (`/`) | Live |
| Sign-up / sign-in (Clerk, real accounts) | Live |
| Early-access wall (`/dashboard`) | Live — all post-auth redirects land here |
| Product routes (`/workspaces`, `/settings`, …) | 404 — removed from `apps/web/src/app/router.tsx` |
| Backend (`apps/server`) | **Not deployed** |

Key files:
- `apps/web/src/routes/_public/early-access.tsx` — the wall
- `apps/web/src/app/router.tsx` — product routes unplugged (restore from git history to re-enable)
- `apps/web/vercel.json` — SPA rewrite

## Vercel setup

1. [vercel.com/new](https://vercel.com/new) → import `Qadzilla/A4`.
2. **Root Directory:** `apps/web` (Framework: Vite, auto-detected; pnpm workspace install is automatic).
3. **Environment variable — this one only:**
   - `VITE_CLERK_PUBLISHABLE_KEY` = the `pk_live_…` key from `.env.production`
   - ⚠️ Never add the rest of `.env.production` (Clerk secret, Anthropic/OpenAI, R2) to this frontend project. They're server secrets for a backend that isn't deployed.
4. Deploy, then **Project → Settings → Domains** → add `a4ai.io`.

## DNS (at the domain registrar)

1. **Vercel records** — shown when adding the domain; typically:
   - apex `a4ai.io` → `A 76.76.21.21`
   - `www` → `CNAME cname.vercel-dns.com`
2. **Clerk records — required for auth to work.** The production Clerk instance
   is bound to `clerk.a4ai.io`. In the Clerk dashboard (**Configure → Domains**)
   copy the listed CNAMEs (e.g. `clerk.a4ai.io` → `frontend-api.clerk.services`)
   into the registrar and wait for "Verified". Until then the landing page loads
   but sign-up/sign-in fail.

## Local dev

```bash
pnpm --dir apps/web dev
```

With no `VITE_CLERK_PUBLISHABLE_KEY` set, dev auth-bypass is active (see
`A4_NOW.md` → "Auth & Dev Bypass"): sign-up navigates straight to the wall as a
mock "Dev" user.

## Production build check

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_… pnpm --dir apps/web build
```

The `dist/` output should contain only landing / sign-in / sign-up /
early-access / 404 chunks — no workspace or dashboard chunks.

## Re-enabling the full product later

1. Restore the dashboard routes in `apps/web/src/app/router.tsx` from git
   history (commit that added the early-access wall).
2. Deploy `apps/server` (Railway/Fly), set its env from `.env.production`, and
   point `VITE_API_URL` at it.
3. Remaining launch items live in `A4_NOW.md`.
