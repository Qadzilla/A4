import { BRAND } from '@/brand';
import { BasisWordmark } from '@/brand-mark';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { PaperCollage } from '@/surfaces/paper-collage';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The public face at /welcome. The pile of paper is the hero's ground only —
 * everything below it stands on the same stock as a flat colour, so the page
 * settles as you scroll instead of shouting the whole way down.
 */

function Cta({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  const className = primary
    ? 'inline-flex items-center gap-2 rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90'
    : 'text-sm font-semibold text-accent underline-offset-4 hover:underline';

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

const CAPABILITIES = [
  {
    title: 'Your positions, with what you paid',
    body: 'Connect a brokerage or upload a statement. Basis reads your holdings, cost basis and acquisition dates, and says so plainly when a lot arrives without them.',
  },
  {
    title: 'Measured against the index',
    body: 'What the same dollars would be worth in the S&P 500, bought on the same dates. Ahead or behind, and by how much.',
  },
  {
    title: 'Taxes, all year',
    body: 'What you would owe if the year ended today. Realized gains matched lot by lot, wash sales flagged, quarterly dates, and a check against your 1099 at filing time.',
  },
  {
    title: 'Questions, answered from your own numbers',
    body: 'Ask what a sale would cost before you make it: which lots it would sell, how long until they turn long-term, and the tax that follows.',
  },
];

export function LandingSurface() {
  return (
    <div>
      {/* Hero — the pile */}
      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16">
        <PaperCollage />

        <div className="rise relative w-full max-w-xl px-2 py-4">
          <h1 className="mb-5 text-center text-4xl font-bold tracking-tight md:text-6xl">
            Know your basis<span className="text-accent">.</span>
          </h1>

          <p className="mx-auto mb-9 max-w-sm text-center text-[15px] leading-relaxed text-muted">
            What you paid, what it's worth, and what you'll owe.
          </p>

          <div className="flex flex-col items-center gap-4">
            <Cta primary>
              Get started <ArrowRight size={16} />
            </Cta>
            <p className="text-xs text-muted">
              Already have an account? <Cta>Sign in</Cta>
            </p>
          </div>
        </div>
      </section>

      <main>
        {/* What it does */}
        <section className="mx-auto max-w-3xl px-5 py-20 md:py-28">
          <p className="eyebrow mb-10">What it does</p>
          <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.title}>
                <h2 className="mb-2.5 text-lg font-semibold tracking-tight">{c.title}</h2>
                <p className="text-sm leading-relaxed text-muted">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Where to start */}
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-3xl px-5 py-20 md:py-24">
            <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Start with what you already have
            </h2>
            <p className="mb-8 max-w-md text-sm leading-relaxed text-muted">
              A brokerage statement, a CSV export, or a read-only connection to your broker. The
              first number appears as soon as one of them lands.
            </p>
            <Cta primary>
              Get started <ArrowRight size={16} />
            </Cta>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-12">
          <BasisWordmark markSize={15} textClassName="font-mono text-[13px] font-bold" />
          <p className="max-w-lg text-[11px] leading-relaxed text-muted">
            {BRAND.name} provides educational estimates computed from your data — not investment
            advice, tax advice, or a tax filing. Brokerage connections are read-only.
          </p>
        </div>
      </footer>
    </div>
  );
}
