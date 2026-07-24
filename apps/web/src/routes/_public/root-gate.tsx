import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { useClerk } from '@clerk/clerk-react';
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';

const LandingPage = lazy(() => import('@/routes/_public/landing'));

function LoadingSpinner() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0D0D0D]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
    </div>
  );
}

function ClerkGate() {
  const { loaded, user } = useClerk();

  // Don't block the (public) landing page on Clerk — render it immediately
  // and only redirect once Clerk has loaded AND confirmed a signed-in user.
  // If Clerk fails to load (bad domain, network), visitors still see the site.
  if (loaded && user) return <Navigate to="/dashboard" replace />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingPage />
    </Suspense>
  );
}

export default function RootGate() {
  if (DEV_AUTH_BYPASS) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LandingPage />
      </Suspense>
    );
  }

  return <ClerkGate />;
}
