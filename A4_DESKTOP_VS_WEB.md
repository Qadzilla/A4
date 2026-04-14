# A4 — Desktop App vs Web-Only

> **Created:** 2026-04-01
> **Status:** Decision analysis — no commitment made.
> **Related docs:** [Ship to Production](./A4_SHIP_TO_PRODUCTION.md) | [Product Roadmap](./A4_PRODUCT_ROADMAP_NEXT.md) | [Architecture](./A4_ARCHITECTURE.md)

---

## The Three Realistic Paths

| Path | Examples | Bundle Size | Stack |
|------|----------|-------------|-------|
| **Web-only** (current plan) | Figma (web), Linear (web), Notion (web) | 0 (browser) | React SPA + Vite, deploy to Vercel |
| **Electron wrapper** | VS Code, Figma desktop, Notion desktop, Slack | ~150MB | Chromium + Node.js, dedicated process |
| **Tauri** | Cody, Warp (partial), newer indie apps | ~5-15MB | Rust shell + system webview (WebKit/WebView2) |

PWA (already in the Q4 roadmap) sits between web and native — installable, offline-capable, but still browser-based.

---

## Arguments for Going Desktop

### Canvas Performance

A4's infinite canvas with 20+ items, zoom/pan, bezier connections, and real-time updates is GPU-intensive. A desktop app gets a dedicated Chromium process (Electron) or native webview (Tauri) without competing with 47 browser tabs for memory. Figma went desktop for exactly this reason — their canvas needed consistent performance.

### Offline Capability

Financial data is sensitive and personal. Users might want to work on a plane, in a coffee shop with bad wifi, or just not depend on connectivity. A desktop app with local-first storage (SQLite on the client) is a natural fit — and A4 already has a SQLite + Drizzle setup that could run client-side.

### Trust Signal

"Download our app" feels more serious than "open this URL" for a financial product. Users are entering real account balances, net worth, debts. A desktop app feels more like software you own vs. a website that could disappear. This is psychological but real for the target audience.

### System Integration

Desktop apps can do things web apps can't:

- System notifications (not just web push)
- Menu bar presence
- Global keyboard shortcuts
- Native file system access for imports/exports
- Auto-launch on login

### Distribution

Mac App Store and Windows Store are discovery channels. Not huge for B2B/prosumer, but they exist.

---

## Arguments for Staying Web-Only

### Maintenance Overhead

Electron/Tauri adds a build target, platform-specific bugs (macOS vs Windows vs Linux), auto-update infrastructure, code signing, notarization (Apple), and installer packaging. This is real ongoing maintenance overhead. Every bug now has a "does this reproduce in the browser too?" dimension.

### Server-Dependent Architecture

A4's AI pipeline streams from Claude via SSE. RAG queries hit the server. Plaid/Stripe integrations need a backend. Market data comes from Polygon.io through the server. The desktop app would still need internet for ~70% of its value. This isn't a spreadsheet — it's an AI-powered workspace that talks to external APIs.

### Deployment Speed

Web deploys are instant — push to main, Vercel builds, users get the new version on refresh. Desktop apps need download prompts, auto-update mechanisms, and users who don't update for months. When iterating fast pre-product-market-fit, this friction is painful.

### The Canvas Works Fine in a Browser

Figma's desktop app is literally Electron wrapping their web app. If the canvas runs at 60fps in Chrome (which it should with GPU-composited transforms — which A4's scale-transform pattern already uses), the browser isn't the bottleneck.

### Cross-Platform for Free

Web works on Mac, Windows, Linux, ChromeOS, tablets, and phones. One codebase, one deploy, done.

---

## Hybrid Path (Recommended)

**Ship web-first, add an Electron/Tauri wrapper later — but only if users ask for it.**

### Why This Makes Sense

1. **The ship-to-production plan is already ~33 days.** Adding Electron/Tauri packaging, code signing, auto-updates, and platform testing adds another 5-10 days minimum. That's not where effort should go before there are paying users.

2. **Electron wrapping is cheap when needed.** The app is already a React SPA. Wrapping it in Electron is a few days of work — point Electron's BrowserWindow at the Vite build, add auto-update via `electron-updater`, package with `electron-builder`. The hard part (the app itself) is already done.

3. **Tauri is the better long-term choice if going native.** It uses the system webview (WebKit on Mac, WebView2 on Windows) instead of bundling Chromium, so the binary is ~5-15MB instead of ~150MB. It's Rust-based, more secure by default, and has good IPC for system-level features. But it's newer and has more edge cases.

4. **PWA covers the "installable" need in the meantime.** Already planned for Q4 2026 — installable on home screen, offline shell, push notifications.

### Effort Estimates (If/When Desktop Is Needed)

| Task | Electron | Tauri |
|------|----------|-------|
| Initial setup + window management | 1d | 1.5d |
| Auto-updater | 0.5d | 0.5d |
| Code signing (macOS notarization + Windows) | 1d | 1d |
| Platform packaging (dmg, exe, AppImage) | 0.5d | 0.5d |
| CI/CD for desktop builds | 1d | 1d |
| Platform-specific bug fixes | 1-2d | 1-2d |
| **Total** | **5-6d** | **5.5-6.5d** |

---

## The Local-First Alternative

There's one scenario where desktop-first makes strong sense: pivoting to **local-first architecture** — the database lives on the user's machine, AI calls go directly from the client to Anthropic's API, and there's no A4 server at all.

### What Local-First Enables

| Benefit | Description |
|---------|-------------|
| **Zero hosting costs** | No server to run, no database to manage, no file storage to pay for |
| **Maximum privacy** | Financial data never leaves the user's machine — strongest possible trust story |
| **Offline by default** | Everything works without internet (except AI calls) |
| **Simpler billing** | One-time purchase or license key instead of subscription (or pass-through AI API costs) |

### What Local-First Kills

| Cost | Description |
|------|-------------|
| **Collaboration** | No shared workspaces without a sync layer (CRDTs, which are complex) |
| **Background jobs** | No server-side insights engine, no nightly Plaid sync, no webhook handling |
| **Billing complexity** | Can't meter AI usage server-side; need a proxy or trust the client |
| **Integrations** | Plaid/Stripe/QuickBooks OAuth flows need a server redirect URI |
| **Web access** | No "log in from any browser" — data lives on one machine unless you build sync |

### Verdict on Local-First

This is a fundamentally different product with different tradeoffs. It's compelling for the "financial data is sacred" positioning, but it conflicts with the collaboration, integrations, and proactive intelligence features that differentiate A4 from a spreadsheet. Worth revisiting if the market signals strong privacy preference over collaboration.

---

## Decision Matrix

| Factor | Web-Only | Electron | Tauri | Local-First |
|--------|----------|----------|-------|-------------|
| Time to ship | Fastest | +5-6d | +5.5-6.5d | Major rewrite |
| Maintenance burden | Low | Medium | Medium | High |
| Canvas performance | Good | Better | Good | Better |
| Offline capability | Limited (PWA) | Full | Full | Full |
| Trust/perception | Standard | Higher | Higher | Highest |
| Cross-platform | All | Mac/Win/Linux | Mac/Win/Linux | Mac/Win/Linux |
| Deployment speed | Instant | Update lag | Update lag | User-controlled |
| Collaboration | Easy | Easy | Easy | Hard (CRDTs) |
| AI features | Full | Full | Full | Limited |
| Integrations | Full | Full | Full | Limited |
| Binary size | 0 | ~150MB | ~5-15MB | ~5-150MB |

---

## Current Recommendation

**Web-only for launch.** PWA in Q4 2026 for installability. Revisit desktop wrapper (Tauri preferred) if users request it — it's a 5-6 day project that can be done at any time since the app is already a React SPA.
