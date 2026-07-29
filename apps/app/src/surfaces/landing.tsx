import { BRAND } from '@/brand';
import { BasisMark, BasisWordmark } from '@/brand-mark';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The public face at /welcome — what a signed-out visitor sees. In dev
 * bypass there is no Clerk, so the CTA links straight into the app.
 */

function Cta({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  const className = primary
    ? 'inline-flex items-center gap-2 rounded-card bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
    : 'inline-flex items-center gap-2 rounded-card border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent';

  if (DEV_AUTH_BYPASS) {
    return (
      <Link to="/portfolio" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className={className}>
            {children}
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link to="/portfolio" className={className}>
          Open the app <ArrowRight size={15} />
        </Link>
      </SignedIn>
    </>
  );
}

export function LandingSurface() {
  return (
    <div className="min-h-dvh">
      {/* Nav */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <BasisWordmark />
        <Cta>Sign in</Cta>
      </header>

      <main className="mx-auto max-w-4xl px-6">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <p className="eyebrow mb-4">{BRAND.tagline}</p>
          <h1 className="mb-5 max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
            Stop vibe investing<span className="text-accent">.</span>
          </h1>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-muted">
            {BRAND.name} tells you what your money is actually doing — versus the market, and versus
            April. Real positions, real cost basis, real tax math. No hype, no rockets, no guessing.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Cta primary>
              Get started <ArrowRight size={15} />
            </Cta>
            <span className="text-xs text-muted">
              Connect a brokerage or upload a statement — know your basis in minutes.
            </span>
          </div>
        </section>

        {/* The three pillars */}
        <section className="grid gap-4 pb-16 md:grid-cols-3 md:pb-24">
          <div className="rounded-card border border-hairline bg-surface p-6">
            <p className="eyebrow mb-2 text-accent">The honest benchmark</p>
            <h2 className="mb-2 text-lg font-semibold tracking-tight">
              Are your picks beating the market?
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Same dollars, same dates, versus the S&amp;P 500 — the counterfactual your brokerage
              won't show you. Ahead or behind, you'll know by exactly how much.
            </p>
          </div>
          <div className="rounded-card border border-hairline bg-surface p-6">
            <p className="eyebrow mb-2 text-accent">The year-round tax meter</p>
            <h2 className="mb-2 text-lg font-semibold tracking-tight">
              April should never be a surprise.
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              If the year ended today: what you'd owe, your 0% long-term gains window, wash-sale
              flags, and quarterly deadlines — computed from your actual trades, all 50 states.
            </p>
          </div>
          <div className="rounded-card border border-hairline bg-surface p-6">
            <p className="eyebrow mb-2 flex items-center gap-1.5 text-accent">
              <BasisMark size={12} /> Bip, the anti-hype AI
            </p>
            <h2 className="mb-2 text-lg font-semibold tracking-tight">
              Taxes before trades. Always.
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Named for the basis point. Ask about selling and Bip checks your holding periods,
              estimates the tax, and catches wash sales — before you tap sell somewhere else.
            </p>
          </div>
        </section>

        {/* The receipt strip */}
        <section className="pb-16 md:pb-24">
          <div className="rounded-card border border-hairline bg-surface p-6 md:p-8">
            <p className="eyebrow mb-4">What knowing your basis looks like</p>
            <div className="tnum grid gap-4 font-mono text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted">vs S&amp;P 500, same dollars</p>
                <p className="text-xl font-bold">
                  +$103.69 <span className="text-good text-xs">ahead</span>
                </p>
              </div>
              <div>
                <p className="text-muted">0% tax window left</p>
                <p className="text-xl font-bold">$22,425</p>
              </div>
              <div>
                <p className="text-muted">If you sold today</p>
                <p className="text-xl font-bold">
                  $0 <span className="text-xs text-muted">federal</span>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-6 py-8">
          <BasisWordmark markSize={14} textClassName="font-mono text-[13px] font-bold" />
          <p className="max-w-lg text-xs leading-relaxed text-faint">
            {BRAND.name} provides educational estimates computed from your data — not investment
            advice, tax advice, or a tax filing. Brokerage connections are read-only.
          </p>
        </div>
      </footer>
    </div>
  );
}
