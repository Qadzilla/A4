import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import CanvasBackground from '@/components/landing/CanvasBackground';
import { useClerk, useUser } from '@clerk/clerk-react';
import { Check } from 'lucide-react';
import { Link } from 'react-router';

function EarlyAccessContent({
  firstName,
  email,
  onSignOut,
}: {
  firstName?: string | null;
  email?: string | null;
  onSignOut?: () => void;
}) {
  return (
    <div
      className="relative min-h-screen text-white overflow-hidden flex flex-col"
      style={{
        backgroundColor: '#0A0A0A',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='2' height='2' fill='rgba(255, 255, 255, 0.10)'/%3E%3C/svg%3E")`,
      }}
    >
      {/* Animated canvas background (same as landing hero) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <CanvasBackground />
      </div>

      {/* Header — sign out only, no logo */}
      <header className="relative z-10 flex items-center justify-end px-6 py-5 md:px-10">
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="text-sm text-white/50 hover:text-white transition-colors"
          >
            Sign out
          </button>
        )}
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24">
        {/* CSS animation (not framer-motion) so the page is never stuck
            invisible when rAF is throttled (background tabs, prerenders) */}
        <div
          className="w-full max-w-xl bg-[#161616]/90 backdrop-blur-md p-8 md:p-12 text-center animate-fade-in"
          style={{
            borderTop: '1.5px solid rgba(16, 185, 129, 0.2)',
            borderLeft: '1.5px solid rgba(16, 185, 129, 0.2)',
            borderRight: '2.5px solid #10B981',
            borderBottom: '2.5px solid #10B981',
          }}
        >
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Check className="h-7 w-7 text-primary" strokeWidth={2.5} />
          </div>

          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Early access
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            You&apos;re on the list{firstName ? `, ${firstName}` : ''}.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-white/60">
            A4 is being built right now — an AI workspace that turns your financial
            documents into living budgets, forecasts, and answers. We&apos;re polishing
            the final pieces before opening the doors.
          </p>

          <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-[#161616] p-5 text-left">
            <p className="text-sm font-medium text-white/80">What happens next</p>
            <ul className="mt-3 space-y-2.5 text-sm text-white/55">
              <li className="flex gap-2.5">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Your spot is reserved{email ? <> under <span className="text-white/80">{email}</span></> : ''}.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                We&apos;ll email you the moment your workspace is ready.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Early-access members get the founding-user plan, free.
              </li>
            </ul>
          </div>

          {/* ?from=wall tells RootGate to show the landing instead of
              bouncing signed-in users straight back here */}
          <Link
            to="/?from=wall"
            className="mt-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            ← Back to a4ai.io
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} A4 — AI financial workspace
      </footer>
    </div>
  );
}

function ClerkEarlyAccess() {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <EarlyAccessContent
      firstName={user?.firstName}
      email={user?.primaryEmailAddress?.emailAddress}
      onSignOut={() => signOut({ redirectUrl: '/' })}
    />
  );
}

export default function EarlyAccessPage() {
  if (DEV_AUTH_BYPASS) {
    return <EarlyAccessContent firstName="Dev" email="dev@a4.local" />;
  }

  return <ClerkEarlyAccess />;
}
