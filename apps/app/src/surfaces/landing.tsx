import { BRAND } from '@/brand';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { PaperCollage } from '@/surfaces/paper-collage';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The public face at /welcome: a pile of financial paper about cost basis,
 * and one clean object standing on it. The hero is a solid plaque rather
 * than floating type — it has to hold its composure over a moving ground.
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

export function LandingSurface() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16">
      <PaperCollage />

      <main className="rise relative w-full max-w-xl">
        <div className="px-2 py-4">
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

          <p className="mx-auto mt-12 max-w-md text-center text-[11px] leading-relaxed text-ink/55">
            {BRAND.name} provides educational estimates computed from your data — not investment
            advice, tax advice, or a tax filing. Brokerage connections are read-only.
          </p>
        </div>
      </main>
    </div>
  );
}
