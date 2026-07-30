import { BRAND } from '@/brand';
import { BasisWordmark } from '@/brand-mark';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { PaperCollage } from '@/surfaces/paper-collage';
import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * The public face at /welcome. The hero is a portico — the One Basis Point
 * mark built at building scale: two posts become columns, the cobalt point
 * becomes the pediment, the name is carved into the frieze, and the CTA sits
 * in the doorway. Banks built temples so people would trust them with money;
 * this is that grammar, flattened to hairlines and one accent.
 */

function Cta({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  const className = primary
    ? 'inline-flex items-center gap-2 rounded-card bg-accent px-7 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90'
    : 'font-semibold text-accent underline-offset-4 hover:underline';

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

/** A column: capital, shaft, base — the mark's post, stretched. */
function Column() {
  return (
    <div className="hidden shrink-0 flex-col items-center self-stretch sm:flex">
      <div className="h-2 w-5 bg-ink" />
      <div className="w-2.5 flex-1 bg-ink" />
      <div className="h-2 w-5 bg-ink" />
    </div>
  );
}

export function LandingSurface() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-14">
      <PaperCollage />

      <main className="rise relative w-full max-w-xl">
        {/* The stone face — one object, so the architecture reads as a building
            rather than rules floating on the paper behind it. */}
        <div className="bg-surface px-5 pt-6 pb-5 shadow-[0_22px_60px_-16px_rgba(60,46,28,0.55)] sm:px-7">
          {/* Pediment — the one basis point, the only colour on the building */}
          <div className="flex justify-center pb-5">
            <span className="block h-3 w-3 rounded-full bg-accent" />
          </div>

          {/* Cornice */}
          <div className="flex flex-col items-center gap-[3px]">
            <div className="h-[3px] w-full bg-ink" />
            <div className="h-px w-[97%] bg-ink/60" />
            <div className="h-px w-[93%] bg-ink/30" />
          </div>

          {/* Frieze — the name, carved */}
          <h1
            className="py-6 text-center font-mono text-[22px] font-bold leading-none tracking-[0.24em] md:py-7 md:text-[34px]"
            style={{ textIndent: '0.24em' }}
          >
            KNOW YOUR BASIS
          </h1>

          {/* Architrave */}
          <div className="flex flex-col items-center gap-[3px]">
            <div className="h-px w-[93%] bg-ink/30" />
            <div className="h-[3px] w-full bg-ink" />
          </div>

          {/* Colonnade — the doorway is recessed, not brighter */}
          <div className="flex items-stretch justify-between pt-4">
            <Column />
            <div className="flex-1 bg-paper px-6 py-11 sm:px-9">
              <p className="mx-auto mb-9 max-w-sm text-center text-[15px] leading-relaxed text-muted">
                The investing and tax numbers your brokerage won't show you — measured, not vibed.
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
            <Column />
          </div>

          {/* Stylobate */}
          <div className="flex flex-col items-center gap-[3px] pt-4">
            <div className="h-[3px] w-full bg-ink" />
            <div className="h-px w-[97%] bg-ink/50" />
          </div>

          <p className="px-2 pt-4 text-center text-[11px] leading-relaxed text-faint">
            {BRAND.name} provides educational estimates computed from your data — not investment
            advice, tax advice, or a tax filing. Brokerage connections are read-only.
          </p>
        </div>

        {/* Steps, widening into the ground */}
        <div className="flex flex-col items-center gap-[3px]">
          <div className="h-[3px] w-[calc(100%+20px)] bg-ink/85" />
          <div className="h-[2px] w-[calc(100%+52px)] bg-ink/55" />
          <div className="h-px w-[calc(100%+88px)] bg-ink/30" />
        </div>

        {/* The building's nameplate */}
        <div className="flex justify-center pt-8">
          <BasisWordmark markSize={15} textClassName="font-mono text-[13px] font-bold" />
        </div>
      </main>
    </div>
  );
}
