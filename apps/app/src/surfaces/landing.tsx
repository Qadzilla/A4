import { BRAND } from '@/brand';
import { BasisWordmark } from '@/brand-mark';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The public face at /welcome — deliberately spare: the wordmark, the
 * headline, one line, one CTA, on a graph-paper ground. Sections get added
 * back as they earn their place.
 */

/** Graph-paper texture: fine 24px grid + stronger 120px majors, fading out below. */
const paperGrid: CSSProperties = {
  backgroundImage: [
    'linear-gradient(to right, rgba(23,27,35,0.05) 1px, transparent 1px)',
    'linear-gradient(to bottom, rgba(23,27,35,0.05) 1px, transparent 1px)',
    'linear-gradient(to right, rgba(23,27,35,0.07) 1px, transparent 1px)',
    'linear-gradient(to bottom, rgba(23,27,35,0.07) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '24px 24px, 24px 24px, 120px 120px, 120px 120px',
  maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 95%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 95%)',
};

function Cta({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  const className = primary
    ? 'inline-flex items-center gap-2 rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90'
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
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0" style={paperGrid} aria-hidden="true" />

      <header className="relative mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <BasisWordmark />
        <Cta>Sign in</Cta>
      </header>

      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-7xl">
          Know your basis<span className="text-accent">.</span>
        </h1>
        <p className="mb-10 max-w-md text-base leading-relaxed text-muted">
          The investing and tax numbers your brokerage won't show you — measured, not vibed.
        </p>
        <div>
          <Cta primary>
            Get started <ArrowRight size={16} />
          </Cta>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-4xl px-6 py-8">
        <p className="max-w-lg text-xs leading-relaxed text-faint">
          {BRAND.name} provides educational estimates computed from your data — not investment
          advice, tax advice, or a tax filing. Brokerage connections are read-only.
        </p>
      </footer>
    </div>
  );
}
