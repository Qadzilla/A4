import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

/**
 * Dev bypass matches the server's: no Clerk key in dev → mock user, no
 * redirect. Production sends signed-out visitors to the landing page at
 * /welcome, where the sign-in flow lives.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  if (DEV_AUTH_BYPASS) return <>{children}</>;

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/welcome" replace />
      </SignedOut>
    </>
  );
}
